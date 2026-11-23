import Dexie, { type Table } from 'dexie';
import { z } from 'zod';
import type { StoredCompleteTrip } from './completeTripV4';
import type { CatalogVariantDescriptor } from './legacy/data/supabase/catalogExploreMedia';
import {
  commitCompleteTripGeneration,
  completeTripOwnership,
  evictCompleteTripKeys,
  retireCompleteTripOwner,
  type CompleteTripHead,
  type CompleteTripRow,
} from './plannerCompleteStorage';
import type { PlannerReadGuard } from './plannerReadGuard';
import { checkedPlannerView, type PlannerScope, type PlannerView } from './plannerViewContract';

export const PLANNER_CACHE_TTL = 15 * 60 * 1000;
export type PlannerCacheOwnerIdentity = Pick<PlannerScope, 'user_id' | 'family_id' | 'person_id'>;
export type PlannerCacheOwner = {
  key: string;
  generation: string;
  retired: boolean;
  actorKey?: string;
  actorGeneration?: string;
};
export type PlannerCacheOwnerReference = Pick<PlannerCacheOwner, 'key' | 'generation'>;
type Snapshot = {
  key: string;
  storedAt: number;
  value: unknown;
  cacheVersion?: number;
  ownerGeneration?: string;
  tripGeneration?: string;
};
export const plannerCacheDb = new Dexie('family-planner-cache-v1') as Dexie & {
  snapshots: Table<Snapshot, string>;
  owners: Table<PlannerCacheOwner, string>;
  completeSnapshots: Table<CompleteTripRow, string>;
  completeHeads: Table<CompleteTripHead, string>;
};
plannerCacheDb.version(1).stores({ snapshots: '&key' });
plannerCacheDb.version(2).stores({ snapshots: '&key', owners: '&key' });
plannerCacheDb.version(3).stores({
  snapshots: '&key',
  owners: '&key',
  completeSnapshots: '&id,cacheKey,ownerKey',
  completeHeads: '&key,ownerKey',
});
const cacheTables = () => [
  plannerCacheDb.snapshots,
  plannerCacheDb.owners,
  plannerCacheDb.completeSnapshots,
  plannerCacheDb.completeHeads,
];
const uuid = z.string().uuid();
const ownerIdentity = z.object({ user_id: uuid, family_id: uuid, person_id: uuid }).strict();
const leaseObservers = new Set<(owner: PlannerCacheOwnerReference) => void>();
const revoked = new Set<string>();
let retirementEpoch = 0;
let cleanup: Promise<unknown> = Promise.resolve();
let failedStorageOperations = 0;
export const plannerCacheStorageFailures = () => failedStorageOperations;
const referenceKey = (owner: PlannerCacheOwnerReference) => JSON.stringify([owner.key, owner.generation]);
export function plannerCacheOwnerKey(source: string, identity: PlannerCacheOwnerIdentity): string {
  const ids = ownerIdentity.parse(identity);
  return JSON.stringify([1, source, ids.user_id, ids.family_id, ids.person_id]);
}
function rowOwnerKey(row: Snapshot): string | null {
  try {
    const key = z
      .tuple([z.literal(1), z.string(), uuid, uuid, uuid, uuid, z.enum(['published', 'myDraft'])])
      .parse(JSON.parse(row.key));
    return plannerCacheOwnerKey(key[1], { user_id: key[2], family_id: key[3], person_id: key[4] });
  } catch {
    return null;
  }
}
function owned(owner: PlannerCacheOwner | undefined): owner is PlannerCacheOwner & { retired: false } {
  return (
    !!owner && owner.retired === false && uuid.safeParse(owner.generation).success && !revoked.has(referenceKey(owner))
  );
}
export function onPlannerCacheOwner(listener: (owner: PlannerCacheOwnerReference) => void) {
  leaseObservers.add(listener);
  return () => {
    leaseObservers.delete(listener);
  };
}
function enqueueCleanup<T>(work: () => Promise<T>): Promise<T> {
  const task = cleanup.then(work);
  cleanup = task.catch(() => {
    failedStorageOperations++;
  });
  return task;
}
/** Observe an already stored generation for retirement only; never establish read authority. */
export async function captureStoredPlannerCacheOwner(source: string, identity: PlannerCacheOwnerIdentity) {
  await cleanup;
  const key = plannerCacheOwnerKey(source, identity);
  const owner = await plannerCacheDb.owners.get(key);
  return owned(owner) ? { key, generation: owner.generation } : null;
}
/** Retire captured generations, never whichever generation happens to exist when cleanup is delayed. */
export function retirePlannerCacheOwners(targets: Promise<PlannerCacheOwnerReference[]>): Promise<void> {
  retirementEpoch++;
  return enqueueCleanup(async () => {
    const owners = await targets;
    owners.forEach((owner) => revoked.add(referenceKey(owner)));
    await plannerCacheDb.transaction('rw!', cacheTables(), async () => {
      const rows = await plannerCacheDb.snapshots.toArray();
      const barriers = await plannerCacheDb.owners.toArray();
      for (const owner of owners) {
        const current = await plannerCacheDb.owners.get(owner.key);
        if (current?.generation === owner.generation) await plannerCacheDb.owners.put({ ...current, retired: true });
        for (const barrier of barriers.filter(
          (b) => b.actorKey === owner.key && b.actorGeneration === owner.generation
        ))
          await plannerCacheDb.owners.put({ ...barrier, retired: true });
        const keys = rows
          .filter(
            (row) =>
              row.cacheVersion === 2 && row.ownerGeneration === owner.generation && rowOwnerKey(row) === owner.key
          )
          .map((row) => row.key);
        await plannerCacheDb.snapshots.bulkDelete(keys);
        await retireCompleteTripOwner(plannerCacheDb, owner);
      }
    });
  });
}
/** Classify only known old partial rows for this configured source. New/future/foreign rows survive startup. */
export function retireLegacyPlannerCache(source: string): Promise<void> {
  return enqueueCleanup(() =>
    plannerCacheDb.transaction('rw!', plannerCacheDb.snapshots, async () => {
      const rows = await plannerCacheDb.snapshots.toArray();
      const keys = rows
        .filter((row) => {
          if (row.cacheVersion !== undefined || row.ownerGeneration !== undefined || !rowOwnerKey(row)) return false;
          const key: unknown[] = JSON.parse(row.key);
          if (key[1] !== source || !row.value || typeof row.value !== 'object') return false;
          const value = row.value as { view?: { version?: unknown }; variants?: unknown };
          return Object.keys(value).sort().join(',') === 'variants,view' && value.view?.version === 1;
        })
        .map((row) => row.key);
      await plannerCacheDb.snapshots.bulkDelete(keys);
    })
  );
}
const variantsSchema = z
  .array(
    z
      .object({
        mediaAssetId: z.string().uuid(),
        canonicalUrl: z.string().nullable(),
        thumbUrl: z.string().nullable(),
        heroUrl: z.string().nullable(),
        recipeVersion: z.string().nullable(),
      })
      .strict()
  )
  .max(10000);
export type CachedPlanner = { view: PlannerView; variants: CatalogVariantDescriptor[] };
export function plannerCacheKey(source: string, scope: PlannerScope): string {
  return JSON.stringify([1, source, scope.user_id, scope.family_id, scope.person_id, scope.trip_id, scope.layer]);
}
export function checkedCachedPlanner(raw: unknown, scope: PlannerScope): CachedPlanner {
  const pair = z.object({ view: z.unknown(), variants: variantsSchema }).strict().parse(raw);
  if (new TextEncoder().encode(JSON.stringify(raw)).byteLength > 8388608) throw new Error('Oversized planner cache');
  const view = checkedPlannerView(pair.view, scope),
    ids = new Set(view.state.locations.flatMap((l) => (l.cover_media_id ? [l.cover_media_id] : [])));
  if (!view.readiness.ready) throw new Error('Blocked planner cache');
  if (
    new Set(pair.variants.map((v) => v.mediaAssetId)).size !== pair.variants.length ||
    pair.variants.some((v) => !ids.has(v.mediaAssetId))
  )
    throw new Error('Inconsistent cached media');
  return {
    view,
    variants: pair.variants.map((v) => ({
      mediaAssetId: v.mediaAssetId,
      canonicalUrl: v.canonicalUrl ?? null,
      thumbUrl: v.thumbUrl ?? null,
      heroUrl: v.heroUrl ?? null,
      recipeVersion: v.recipeVersion ?? null,
    })),
  };
}
export async function readPlannerCache(
  key: string,
  scope: PlannerScope,
  now: number,
  generation: string,
  tripGeneration: string
): Promise<CachedPlanner | null> {
  const row = await plannerCacheDb.snapshots.get(key);
  if (!row || row.cacheVersion !== 2 || row.ownerGeneration !== generation || row.tripGeneration !== tripGeneration)
    return null;
  try {
    if (!Number.isFinite(row.storedAt) || row.storedAt > now || now - row.storedAt > PLANNER_CACHE_TTL)
      throw new Error('Expired snapshot');
    return checkedCachedPlanner(row.value, scope);
  } catch {
    await plannerCacheDb.snapshots.delete(key);
    return null;
  }
}
/** Scoped snapshots are disposable. The separate native mutation queue is never cleared here. */
export async function evictPlannerTrip(source: string, scope: PlannerScope): Promise<void> {
  const keys = (['published', 'myDraft'] as const).map((layer) => plannerCacheKey(source, { ...scope, layer }));
  await plannerCacheDb.snapshots.bulkDelete(keys);
  await evictCompleteTripKeys(plannerCacheDb, keys);
}

async function captureCacheRows(
  guard: PlannerReadGuard,
  ownerKey: string,
  tripKey: string,
  keys: string[],
  assertCurrent: () => void
) {
  let observed: PlannerCacheOwner | undefined, trip: PlannerCacheOwner | undefined;
  const rows = await guard.commit(() =>
    plannerCacheDb.transaction('rw!', cacheTables(), async () => {
      assertCurrent();
      const previous = await plannerCacheDb.owners.get(ownerKey);
      if (owned(previous)) observed = previous;
      else {
        observed = { key: ownerKey, generation: crypto.randomUUID(), retired: false };
        // Only an original guarded read can create a new generation. Old retired bytes cannot be borrowed.
        const old = await plannerCacheDb.snapshots.toArray();
        await plannerCacheDb.snapshots.bulkDelete(
          old
            .filter(
              (row) =>
                row.cacheVersion === 2 && rowOwnerKey(row) === ownerKey && row.ownerGeneration === previous?.generation
            )
            .map((row) => row.key)
        );
        if (previous) await retireCompleteTripOwner(plannerCacheDb, { key: ownerKey, generation: previous.generation });
        await plannerCacheDb.owners.put(observed);
      }
      const previousTrip = await plannerCacheDb.owners.get(tripKey);
      trip =
        owned(previousTrip) && previousTrip.actorGeneration === observed.generation
          ? previousTrip
          : {
              key: tripKey,
              generation: crypto.randomUUID(),
              retired: false,
              actorKey: ownerKey,
              actorGeneration: observed.generation,
            };
      if (trip !== previousTrip) await plannerCacheDb.owners.put(trip);
      const result = await plannerCacheDb.snapshots.bulkGet(keys);
      assertCurrent();
      return { rows: result, complete: await plannerCacheDb.completeHeads.bulkGet(keys) };
    })
  );
  assertCurrent();
  if (!owned(observed) || !owned(trip)) throw new Error('The original cache owner is unavailable.');
  return { observed, trip, rows: rows.rows, complete: rows.complete };
}

/** Snapshot writes and eviction share the original queue fence and one persisted owner generation. */
export async function guardedPlannerCache(
  guard: PlannerReadGuard,
  source: string,
  scope: PlannerScope,
  options: { now: () => number; blocked: () => Error; fence?: () => void }
) {
  const { now, blocked, fence = () => {} } = options;
  const epoch = retirementEpoch;
  await cleanup;
  fence();
  if (epoch !== retirementEpoch) throw blocked();
  const key = plannerCacheKey(source, scope),
    keys = (['published', 'myDraft'] as const).map((layer) => plannerCacheKey(source, { ...scope, layer })),
    ownerKey = plannerCacheOwnerKey(source, {
      user_id: scope.user_id,
      family_id: scope.family_id,
      person_id: scope.person_id,
    });
  const tripKey = 'trip:' + JSON.stringify(JSON.parse(key).slice(0, 6));
  const captured = await captureCacheRows(guard, ownerKey, tripKey, keys, () => {
    fence();
    if (epoch !== retirementEpoch) throw blocked();
  });
  const { observed, rows } = captured;
  let tripObservation = captured.trip;
  const generation = observed.generation;
  const owner = { key: ownerKey, generation };
  for (const listener of leaseObservers) listener(owner);
  const originalRows = new Map(keys.map((key, index) => [key, rows[index]]));
  let ownWrittenRow: Snapshot | undefined;
  const originalComplete = new Map(keys.map((key, index) => [key, captured.complete[index]]));
  const assertOwner = async () => {
    fence();
    if (epoch !== retirementEpoch || revoked.has(referenceKey(owner))) throw blocked();
    const current = await plannerCacheDb.owners.get(ownerKey);
    const trip = await plannerCacheDb.owners.get(tripKey);
    if (
      JSON.stringify(current) !== JSON.stringify(observed) ||
      JSON.stringify(trip) !== JSON.stringify(tripObservation)
    )
      throw blocked();
  };
  const run = <T>(work: () => Promise<T>) =>
    guard.commit(() =>
      plannerCacheDb.transaction('rw!', cacheTables(), async () => {
        await assertOwner();
        const result = await work();
        fence();
        if (epoch !== retirementEpoch || revoked.has(referenceKey(owner))) throw blocked();
        return result;
      })
    );
  return {
    completeOwnership: () => completeTripOwnership(key, ownerKey, generation, tripObservation.generation),
    commitComplete: (envelope: StoredCompleteTrip) =>
      run(async () => {
        const expected = completeTripOwnership(key, ownerKey, generation, tripObservation.generation);
        if (
          Object.keys(expected).some(
            (k) => envelope.ownership[k as keyof typeof expected] !== expected[k as keyof typeof expected]
          ) ||
          scope.layer !== 'published'
        )
          throw blocked();
        await commitCompleteTripGeneration(plannerCacheDb, envelope, originalComplete.get(key));
      }),
    read: () =>
      run(async () =>
        owned(observed) && observed.generation === generation
          ? readPlannerCache(key, scope, now(), generation, tripObservation.generation)
          : null
      ),
    evict: async () => {
      const next = await run(async () => {
        const current = await plannerCacheDb.snapshots.bulkGet(keys);
        if (
          current.some(
            (row, index) =>
              row &&
              JSON.stringify(row) !== JSON.stringify(originalRows.get(keys[index])) &&
              !(keys[index] === key && ownWrittenRow && JSON.stringify(row) === JSON.stringify(ownWrittenRow))
          )
        )
          throw blocked();
        const heads = await plannerCacheDb.completeHeads.bulkGet(keys);
        if (heads.some((head, index) => JSON.stringify(head) !== JSON.stringify(originalComplete.get(keys[index]))))
          throw blocked();
        await evictPlannerTrip(source, scope);
        // Persist a barrier even for an empty cache; another tab's old read cannot resurrect this Trip.
        const barrier = { ...tripObservation, generation: crypto.randomUUID() };
        await plannerCacheDb.owners.put(barrier);
        return barrier;
      });
      tripObservation = next;
      ownWrittenRow = undefined;
      keys.forEach((key) => {
        originalRows.set(key, undefined);
        originalComplete.set(key, undefined);
      });
    },
    write: async (pair: CachedPlanner, currentFence: () => void) => {
      const written = await run(() =>
        writeScopedPlannerRow({
          key,
          pair,
          original: originalRows.get(key),
          generation,
          tripGeneration: tripObservation.generation,
          storedAt: now(),
          currentFence,
          blocked,
        })
      );
      if (written) ownWrittenRow = written;
    },
  };
}

async function writeScopedPlannerRow(input: {
  key: string;
  pair: CachedPlanner;
  original: Snapshot | undefined;
  generation: string;
  tripGeneration: string;
  storedAt: number;
  currentFence: () => void;
  blocked: () => Error;
}) {
  input.currentFence();
  const current = await plannerCacheDb.snapshots.get(input.key);
  if (JSON.stringify(current) !== JSON.stringify(input.original)) {
    if (
      current?.cacheVersion === 2 &&
      current.ownerGeneration === input.generation &&
      current.tripGeneration === input.tripGeneration &&
      JSON.stringify(current.value) === JSON.stringify(input.pair)
    )
      return;
    throw input.blocked();
  }
  const row: Snapshot = {
    key: input.key,
    storedAt: input.storedAt,
    value: input.pair,
    cacheVersion: 2,
    ownerGeneration: input.generation,
    tripGeneration: input.tripGeneration,
  };
  await plannerCacheDb.snapshots.put(row);
  input.currentFence();
  return row;
}

/** Observe an existing complete generation only: this path never creates or renews ownership. */
/** A deliberate complete-generation authority refusal, distinct from storage I/O failure. */
export class CompleteTripReadRefusal extends Error {}

export async function inspectCompleteTrip(
  source: string,
  scope: PlannerScope,
  check: () => void,
  accept?: (observation: {
    owner: PlannerCacheOwner;
    trip: PlannerCacheOwner;
    head: CompleteTripHead;
    row: CompleteTripRow;
  }) => void
) {
  const epoch = retirementEpoch;
  await cleanup;
  check();
  const key = plannerCacheKey(source, scope),
    ownerKey = plannerCacheOwnerKey(source, {
      user_id: scope.user_id,
      family_id: scope.family_id,
      person_id: scope.person_id,
    });
  const tripKey = 'trip:' + JSON.stringify(JSON.parse(key).slice(0, 6));
  return plannerCacheDb.transaction('r!', cacheTables(), async () => {
    check();
    const owner = await plannerCacheDb.owners.get(ownerKey),
      trip = await plannerCacheDb.owners.get(tripKey),
      head = await plannerCacheDb.completeHeads.get(key);
    if (
      epoch !== retirementEpoch ||
      !owned(owner) ||
      !owned(trip) ||
      trip.actorKey !== ownerKey ||
      trip.actorGeneration !== owner.generation
    )
      throw new CompleteTripReadRefusal('The saved Trip ownership is unavailable.');
    if (!matchingCompleteHead(head, owner, trip))
      throw new CompleteTripReadRefusal('The saved Trip ownership is unavailable.');
    const row = await plannerCacheDb.completeSnapshots.get(head.generation);
    if (
      row?.version !== 1 ||
      row.id !== head.generation ||
      row.cacheKey !== key ||
      row.ownerKey !== ownerKey ||
      row.ownerGeneration !== owner.generation ||
      row.tripGeneration !== trip.generation
    )
      throw new CompleteTripReadRefusal('The saved Trip generation is incomplete.');
    check();
    if (epoch !== retirementEpoch) throw new CompleteTripReadRefusal('The saved Trip owner retired.');
    for (const listener of leaseObservers) listener({ key: ownerKey, generation: owner.generation });
    const observation = { owner, trip, head, row };
    accept?.(observation);
    check();
    return observation;
  });
}

function matchingCompleteHead(
  head: CompleteTripHead | undefined,
  owner: PlannerCacheOwner,
  trip: PlannerCacheOwner
): head is CompleteTripHead {
  return (
    head?.version === 1 &&
    head.ownerKey === owner.key &&
    head.ownerGeneration === owner.generation &&
    head.tripGeneration === trip.generation
  );
}
