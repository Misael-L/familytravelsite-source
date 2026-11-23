import Dexie from 'dexie';
import { CREATION_TERMINAL_ARCHIVE_KEY, hasPendingCreationTerminal } from '../../db/creationTerminalArchive';
import type { QueuedMutation, TrekOfflineDb } from '../../db/offlineDb';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { acquireQueueLock } from '../../sync/queueLock';
import { captureReadSession, type ReadSession } from '../../sync/readSession';
import { creationAffects } from './creationIntentQueue';
import { FamilyApiError } from './errors';
import { sameOriginalStayRow } from './originalStayIntentQueue';
import type { FamilyFrontendRepository } from './repository';

/** Capture the original account and Trip before issuing a canonical task or packing read. */
export async function preparePlannerReadScope(
  repo: FamilyFrontendRepository,
  value: number | string,
  {
    disposed,
    source,
    signal,
    kind,
  }: { disposed: () => boolean; source: () => string; signal?: AbortSignal; kind: 'task' | 'packing' }
) {
  const owner = captureReadSession();
  const original = repo.captureContext(undefined, { revision: false });
  const origin = source();
  const check = () => {
    owner.assertCurrent();
    original.assertCurrent();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (disposed() || source() !== origin)
      throw new FamilyApiError(409, `${kind}_view_changed`, `The original ${kind} read session ended.`);
  };
  check();
  if (isEffectivelyOffline())
    throw new FamilyApiError(
      503,
      `${kind}_view_offline`,
      kind === 'task' ? 'A canonical task read needs a connection.' : 'Reconnect to read canonical packing.'
    );
  const session = await repo.session();
  check();
  const trip = await repo.tripUuid(value);
  check();
  const { ids } = await repo.views();
  check();
  const context = repo.captureContext(trip);
  const layer = repo.getLayer(trip);
  const fence = async () => {
    check();
    context.assertCurrent();
    const current = await repo.session();
    check();
    context.assertCurrent();
    if (
      current.userId !== session.userId ||
      current.personId !== session.personId ||
      current.familyId !== session.familyId ||
      repo.knownViews()?.ids !== ids ||
      repo.getLayer(trip) !== layer
    )
      throw new FamilyApiError(409, `${kind}_view_changed`, `The original ${kind} context changed.`);
  };
  return { owner, session, trip, ids, fence };
}

const rowTables = [
  'days',
  'places',
  'packingItems',
  'todoItems',
  'budgetItems',
  'reservations',
  'tripFiles',
  'accommodations',
] as const;
type Trip = { uuid: string; native: number; blockImports?: boolean };
function tables(db: TrekOfflineDb, trip?: Trip) {
  return [
    db.mutationQueue,
    db.syncMeta,
    db.trips,
    db.tripMembers,
    ...rowTables.map((name) => db.table(name)),
    ...(trip?.blockImports ? [db.importFiles] : []),
  ];
}
async function fingerprint(
  db: TrekOfflineDb,
  trip: Trip,
  blocked: () => Error,
  retained?: QueuedMutation
): Promise<string> {
  if (trip.blockImports && (await db.importFiles.count())) throw blocked();
  if (hasPendingCreationTerminal(await db.syncMeta.get(CREATION_TERMINAL_ARCHIVE_KEY), trip.uuid)) throw blocked();
  const rows = await db.mutationQueue.toArray();
  if (
    retained &&
    !sameOriginalStayRow(
      rows.find((row) => row.id === retained.id),
      retained
    )
  )
    throw blocked();
  if (rows.some((row) => row.id !== retained?.id && creationAffects(row, trip.uuid, trip.native))) throw blocked();
  return JSON.stringify(
    await Promise.all([
      db.trips.get(trip.native),
      db.tripMembers.where('tripId').equals(trip.native).toArray(),
      ...rowTables.map((name) => db.table(name).where('trip_id').equals(trip.native).toArray()),
    ])
  );
}
/** One explicitly passed lease avoids nested shared-lock acquisition behind a waiting replay. */
export class PlannerReadGuard {
  constructor(
    private session: ReadSession,
    private trip: Trip,
    private before: string,
    private blocked: () => Error,
    private retained?: QueuedMutation
  ) {}
  assertTrip(trip: Trip) {
    this.session.assertCurrent();
    if (trip.uuid !== this.trip.uuid || trip.native !== this.trip.native) throw this.blocked();
  }
  private async assertUnchanged() {
    this.session.assertCurrent();
    if ((await fingerprint(this.session.db, this.trip, this.blocked, this.retained)) !== this.before)
      throw this.blocked();
    this.session.assertCurrent();
  }
  check() {
    return this.session.db.transaction('r!', tables(this.session.db, this.trip), () => this.assertUnchanged());
  }
  /** Short local cache/publish work only. Never put HTTP/RPC or a user wait here. */
  commit<T>(work: () => Promise<T> | T): Promise<T> {
    return this.session.db.transaction('r!', tables(this.session.db, this.trip), async () => {
      await this.assertUnchanged();
      // Keep native queue/cache writers out until the separate scoped-cache
      // transaction commits. That transaction must use rw!, never join this one.
      const result = await Dexie.waitFor(Dexie.ignoreTransaction(() => Promise.resolve().then(work)));
      this.session.assertCurrent();
      return result;
    });
  }
}
export async function guardedPlannerRead<T>(
  session: ReadSession,
  trip: Trip,
  blocked: () => Error,
  work: (guard: PlannerReadGuard) => Promise<T>,
  inherited?: PlannerReadGuard
): Promise<T> {
  if (inherited) {
    session.assertCurrent();
    inherited.assertTrip(trip);
    await inherited.check();
    return work(inherited);
  }
  const release = await acquireQueueLock(session, 'shared', true);
  try {
    session.assertCurrent();
    if (!release && !isEffectivelyOffline()) throw blocked();
    const before = await session.db.transaction('r!', tables(session.db, trip), () =>
      fingerprint(session.db, trip, blocked)
    );
    const guard = new PlannerReadGuard(session, trip, before, blocked);
    const result = await work(guard);
    await guard.check();
    return result;
  } finally {
    release?.();
  }
}

/** Called only under the original stay session's exclusive queue lock. No nested lock or generic exemption. */
export async function createOriginalStayReadGuard(
  session: ReadSession,
  trip: Trip,
  expected: QueuedMutation | undefined,
  blocked: () => Error
) {
  const retained = expected ? structuredClone(expected) : undefined;
  if (
    retained &&
    (retained.tripId !== trip.native ||
      retained.status === 'syncing' ||
      retained.method !== 'POST' ||
      retained.retentionPolicy !== 'family-original-v1' ||
      !retained.url.startsWith(`/trips/${trip.uuid}/family/native-stays/`))
  )
    throw blocked();
  let active = true;
  const owner = {
    ...session,
    current: () => active && session.current(),
    assertCurrent: () => {
      session.assertCurrent();
      if (!active) throw blocked();
    },
  };
  owner.assertCurrent();
  const before = await owner.db.transaction('r!', tables(owner.db, trip), () =>
    fingerprint(owner.db, trip, blocked, retained)
  );
  owner.assertCurrent();
  const guard = new PlannerReadGuard(owner, trip, before, blocked, retained);
  return {
    guard,
    close: () => {
      active = false;
    },
  };
}
