import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { offlineDb, type QueuedMutation } from '../../db/offlineDb';
import { notifyPrivateSessionEnd } from '../../db/privateSessionEvents';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { captureReadSession } from '../../sync/readSession';
import { notifyFamilyActorChange } from './actorEvents';
import {
  guardedPlannerCache,
  plannerCacheDb,
  plannerCacheKey,
  retirePlannerCacheOwners,
  type CachedPlanner,
} from './plannerCache';
import { installPlannerCacheRetirement } from './plannerCacheRetirement';
import { guardedPlannerRead } from './plannerReadGuard';
import type { PlannerScope } from './plannerViewContract';
const id = (n: number) => `a1400000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const source = 'https://cache.fixture.invalid';
const scope: PlannerScope = { user_id: id(1), family_id: id(2), person_id: id(3), trip_id: id(4), layer: 'published' };
const at = 1000000;
const scopes: ReturnType<typeof installPlannerCacheRetirement>[] = [];
const blocked = () => new Error('Original cache owner retired');
function pair(s = scope): CachedPlanner {
  return {
    variants: [],
    view: {
      version: 1,
      scope: s,
      state: {
        version: 1,
        trip_id: s.trip_id,
        family_id: s.family_id,
        trip_revision: 1,
        locations: [],
        visits: [],
        days: [],
        notes: [],
        destinations: [],
      },
      operations: [],
      bindings: [],
      draft_token: s.layer === 'published' ? null : 'a'.repeat(64),
      readiness: { ready: true, blockers: [] },
    },
  };
}
function withCache<T>(
  work: (cache: Awaited<ReturnType<typeof guardedPlannerCache>>) => Promise<T>,
  s = scope,
  origin = source
) {
  return guardedPlannerRead(captureReadSession(), { uuid: s.trip_id, native: 41 }, blocked, async (guard) =>
    work(await guardedPlannerCache(guard, origin, s, { now: () => at, blocked }))
  );
}
const write = (s = scope, origin = source) => withCache((c) => c.write(pair(s), () => {}), s, origin);
function install() {
  const owner = installPlannerCacheRetirement(() => source);
  scopes.push(owner);
  return owner;
}
async function rows() {
  return plannerCacheDb.snapshots.toArray();
}
function defer() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function connection() {
  const other = new Dexie(plannerCacheDb.name);
  other.version(3).stores({
    snapshots: '&key',
    owners: '&key',
    completeSnapshots: '&id,cacheKey,ownerKey',
    completeHeads: '&key,ownerKey',
  });
  await other.open();
  return other;
}
beforeEach(async () => {
  await resetOfflineTestDatabase();
  setAuthed(true);
  _resetNetworkMode();
  await plannerCacheDb.snapshots.clear();
  await plannerCacheDb.owners.clear();
});
afterEach(async () => {
  for (const s of scopes.splice(0)) {
    await s.settled();
    s.dispose();
  }
  vi.restoreAllMocks();
  setAuthed(false);
  _resetNetworkMode();
  await resetOfflineTestDatabase();
  await plannerCacheDb.snapshots.clear();
  await plannerCacheDb.owners.clear();
});
describe('generation-qualified planner cache retirement', () => {
  it.each(['private-session', 'actor'] as const)('retires both layers on the actual %s event', async (event) => {
    const owner = install();
    await owner.settled();
    await write();
    await write({ ...scope, layer: 'myDraft' });
    expect(await rows()).toHaveLength(2);
    if (event === 'actor') notifyFamilyActorChange();
    else notifyPrivateSessionEnd();
    await owner.settled();
    expect(await rows()).toEqual([]);
    expect((await plannerCacheDb.owners.toArray()).every((o) => o.retired)).toBe(true);
  });
  it.each(['user_id', 'family_id', 'person_id', 'source'] as const)(
    'retiring the old %s context preserves an unrelated context',
    async (field) => {
      const owner = install();
      await owner.settled();
      await write();
      owner.dispose();
      const foreign = field === 'source' ? scope : { ...scope, [field]: id(70) };
      await write(foreign, field === 'source' ? 'https://other.fixture.invalid' : source);
      const kept = (await rows()).find((r) => r.key !== plannerCacheKey(source, scope));
      // Observe only the original generation as the actual former owner.
      const old = (await plannerCacheDb.owners.toArray()).find((o) => o.generation !== kept?.ownerGeneration);
      if (!old || !kept) throw new Error('Missing separate ownership fixture');
      await retirePlannerCacheOwners(Promise.resolve([old]));
      expect(await rows()).toEqual([kept]);
    }
  );
  it('a new installer/tab does not erase an existing current generation on startup', async () => {
    await write();
    const before = await rows();
    const owner = install();
    await owner.settled();
    expect(await rows()).toEqual(before);
  });
  it('clears known source legacy rows without deleting future or foreign cache formats', async () => {
    const known = { key: plannerCacheKey(source, scope), storedAt: at, value: pair() };
    const future = {
      ...known,
      key: plannerCacheKey(source, { ...scope, trip_id: id(80) }),
      cacheVersion: 3,
      ownerGeneration: id(81),
    };
    const foreign = { ...known, key: plannerCacheKey('https://foreign.fixture.invalid', scope) };
    const unknown = {
      ...known,
      key: plannerCacheKey(source, { ...scope, trip_id: id(82) }),
      value: { format: 'future', private: 'Preserved unknown format' },
    };
    await plannerCacheDb.snapshots.bulkPut([known, future, foreign, unknown]);
    const owner = install();
    await owner.settled();
    expect(await rows()).toEqual(expect.arrayContaining([future, foreign, unknown]));
    expect(await rows()).toHaveLength(3);
  });
  it('same-account ABA creates a distinct generation even with identical content and clock', async () => {
    const owner = install();
    await owner.settled();
    await write();
    const old = (await rows())[0];
    notifyPrivateSessionEnd();
    await owner.settled();
    await write();
    const fresh = (await rows())[0];
    expect(fresh.value).toEqual(old.value);
    expect(fresh.storedAt).toBe(old.storedAt);
    expect(fresh.ownerGeneration).not.toBe(old.ownerGeneration);
  });
  it('a late old read cannot recreate snapshots after retirement', async () => {
    const owner = install();
    await owner.settled();
    await write();
    const entered = defer(),
      release = defer();
    const run = withCache(async (c) => {
      entered.resolve();
      await release.promise;
      await c.write(pair(), () => {});
    }).catch((e) => e);
    await entered.promise;
    notifyPrivateSessionEnd();
    await owner.settled();
    release.resolve();
    expect(await run).toBeInstanceOf(Error);
    expect(await rows()).toEqual([]);
  });
  it('a late old cleanup preserves the fresh generation written through another connection', async () => {
    await write();
    const old = (await plannerCacheDb.owners.toArray())[0],
      original = (await rows())[0],
      hold = defer();
    const retiring = retirePlannerCacheOwners(hold.promise.then(() => [old]));
    const other = await connection();
    try {
      const generation = id(200),
        fresh = { ...original, ownerGeneration: generation };
      await other.transaction('rw', other.table('owners'), other.table('snapshots'), async () => {
        await other.table('owners').put({ ...old, generation, retired: false });
        await other.table('snapshots').put(fresh);
      });
      hold.resolve();
      await retiring;
      expect(await rows()).toEqual([fresh]);
      expect((await plannerCacheDb.owners.get(old.key))?.retired).toBe(false);
    } finally {
      hold.resolve();
      await retiring;
      other.close();
    }
  });
  it('another connection changing ownership refuses an old reader without a local event', async () => {
    await write();
    const old = (await plannerCacheDb.owners.toArray())[0],
      entered = defer(),
      release = defer();
    const run = withCache(async (c) => {
      entered.resolve();
      await release.promise;
      return c.read();
    }).catch((e) => e);
    await entered.promise;
    const other = await connection();
    try {
      await other.table('owners').put({ ...old, retired: true });
      release.resolve();
      expect(await run).toBeInstanceOf(Error);
    } finally {
      release.resolve();
      other.close();
    }
  });
  it('a slow read cannot replace another connection snapshot with the same owner generation', async () => {
    await write();
    const old = (await rows())[0],
      entered = defer(),
      release = defer();
    const run = withCache(async (c) => {
      entered.resolve();
      await release.promise;
      return c.write(pair(), () => {});
    }).catch((e) => e);
    await entered.promise;
    const other = await connection();
    try {
      const newer = {
        ...old,
        storedAt: at + 1,
        value: { ...pair(), variants: [], view: { ...pair().view, state: { ...pair().view.state, trip_revision: 2 } } },
      };
      await other.table('snapshots').put(newer);
      release.resolve();
      expect(await run).toBeInstanceOf(Error);
      expect(await rows()).toEqual([newer]);
    } finally {
      release.resolve();
      other.close();
    }
  });
  it('known generation retirement preserves exact current/future commands and imported bytes', async () => {
    const owner = install();
    await owner.settled();
    await write();
    const commands: QueuedMutation[] = [1, 99].map((schemaVersion) => ({
      id: id(300 + schemaVersion),
      tripId: 41,
      method: 'POST',
      url: '/trips/41/tasks',
      body: { operation_id: id(300 + schemaVersion), revision: 17, untouched: { future: ['a', 'b'] } },
      createdAt: at,
      status: 'conflict',
      attempts: 0,
      lastError: null,
      schemaVersion,
      retentionPolicy: 'family-original-v1',
    }));
    await offlineDb.mutationQueue.bulkPut(commands);
    await offlineDb.importFiles.put({
      jobId: 'original-job',
      fileName: 'original.txt',
      blob: new Blob(['Original bytes']),
      createdAt: at,
    });
    const before = await offlineDb.importFiles.toArray();
    notifyPrivateSessionEnd();
    await owner.settled();
    expect(await rows()).toEqual([]);
    expect(await offlineDb.mutationQueue.toArray()).toEqual(commands);
    expect(await offlineDb.importFiles.toArray()).toEqual(before);
  });
  it('failed cleanup is observable, does not block retirement, and cannot admit old cached bytes', async () => {
    const owner = install();
    await owner.settled();
    await write();
    const before = await rows();
    vi.spyOn(plannerCacheDb.snapshots, 'bulkDelete').mockRejectedValueOnce(new Error('Storage denied'));
    notifyPrivateSessionEnd();
    await owner.settled();
    expect(owner.failures()).toBe(1);
    expect(await rows()).toEqual(before);
    setForcedOffline(true);
    expect(await withCache((c) => c.read())).toBeNull();
    expect(await rows()).toEqual([]);
  });
  it('storage denial does not leave an unhandled rejection or prevent other lifecycle listeners', async () => {
    const owner = install();
    await owner.settled();
    await write();
    const denied = vi.spyOn(plannerCacheDb, 'transaction').mockRejectedValueOnce(new Error('IndexedDB denied'));
    notifyPrivateSessionEnd();
    await owner.settled();
    expect(owner.failures()).toBe(1);
    denied.mockRestore();
    expect(await withCache((c) => c.read())).toBeNull();
  });
  it('duplicate notifications are safe and an old disposed installer cannot retire a fresh owner', async () => {
    const old = install();
    await old.settled();
    await write();
    notifyPrivateSessionEnd();
    notifyFamilyActorChange();
    await old.settled();
    old.dispose();
    await write();
    const before = await rows();
    notifyPrivateSessionEnd();
    expect(await rows()).toEqual(before);
  });
  it('tracks a validated stored owner even when this installation has not opened its Trip', async () => {
    await write();
    const owner = installPlannerCacheRetirement(
      () => source,
      () => ({ source, user_id: scope.user_id, family_id: scope.family_id, person_id: scope.person_id })
    );
    scopes.push(owner);
    await owner.settled();
    notifyFamilyActorChange();
    await owner.settled();
    expect(await rows()).toEqual([]);
  });
  it('future snapshot versions cannot become cached success or be deleted as legacy data', async () => {
    await write();
    const original = (await rows())[0];
    const future = { ...original, cacheVersion: 3 };
    await plannerCacheDb.snapshots.put(future);
    expect(await withCache((c) => c.read())).toBeNull();
    expect(await rows()).toEqual([future]);
  });
  it('malformed local identity cannot throw through logout/owner observers', async () => {
    const owner = installPlannerCacheRetirement(
      () => source,
      () => ({ source, user_id: 'malformed', family_id: scope.family_id, person_id: scope.person_id })
    );
    scopes.push(owner);
    await owner.settled();
    expect(owner.failures()).toBe(1);
    expect(() => notifyPrivateSessionEnd()).not.toThrow();
    await owner.settled();
  });
  it('an owner record without an explicit active status cannot admit old bytes', async () => {
    await write();
    const old = (await plannerCacheDb.owners.toArray())[0];
    const other = await connection();
    try {
      const corrupt = { ...old };
      Reflect.deleteProperty(corrupt, 'retired');
      await other.table('owners').put(corrupt);
      setForcedOffline(true);
      expect(await withCache((c) => c.read())).toBeNull();
    } finally {
      other.close();
    }
  });
  it('retirement waits for an already captured stored-owner observation without adopting a later session', async () => {
    await write();
    const old = (await plannerCacheDb.owners.toArray())[0],
      entered = defer(),
      release = defer();
    vi.spyOn(plannerCacheDb.owners, 'get').mockImplementationOnce(() =>
      Dexie.Promise.resolve().then(async () => {
        entered.resolve();
        await release.promise;
        return old;
      })
    );
    const owner = installPlannerCacheRetirement(
      () => source,
      () => ({ source, user_id: scope.user_id, family_id: scope.family_id, person_id: scope.person_id })
    );
    scopes.push(owner);
    await entered.promise;
    notifyPrivateSessionEnd();
    release.resolve();
    await owner.settled();
    expect(await rows()).toEqual([]);
    await write();
    expect((await rows())[0].ownerGeneration).not.toBe(old.generation);
  });
  it('a denied empty Trip cannot be resurrected by an older read, without evicting another Trip', async () => {
    const foreign = { ...scope, trip_id: id(904) };
    await write(foreign);
    const unrelated = await rows();
    const entered = defer(),
      release = defer();
    const run = withCache(async (c) => {
      entered.resolve();
      await release.promise;
      return c.write(pair(), () => {});
    }).catch((error) => error);
    await entered.promise;
    await withCache((c) => c.evict());
    release.resolve();
    expect(await run).toBeInstanceOf(Error);
    expect(await rows()).toEqual(unrelated);
  });
  it('captures a persisted device owner before current authentication is available, without creating or renewing it', async () => {
    await write();
    const before = await rows(),
      owners = await plannerCacheDb.owners.toArray();
    let stale = false;
    const owner = installPlannerCacheRetirement(
      () => source,
      () => null,
      () => () => {},
      {
        identity: { source, user_id: scope.user_id, family_id: scope.family_id, person_id: scope.person_id },
        isStale: () => stale,
      }
    );
    scopes.push(owner);
    await owner.settled();
    expect(await rows()).toEqual(before);
    expect(await plannerCacheDb.owners.toArray()).toEqual(owners);
    notifyPrivateSessionEnd();
    await owner.settled();
    expect(await rows()).toEqual(before);
    stale = true;
    notifyFamilyActorChange();
    await owner.settled();
    expect(await rows()).toEqual([]);
  });
  it('retiring a remembered device owner leaves a different Person generation untouched', async () => {
    await write();
    const other = { ...scope, person_id: id(901) };
    await write(other);
    const preserved = (await rows()).filter((row) => row.key === plannerCacheKey(source, other));
    const owner = installPlannerCacheRetirement(
      () => source,
      () => null,
      () => () => {},
      {
        identity: { source, user_id: scope.user_id, family_id: scope.family_id, person_id: scope.person_id },
        isStale: () => true,
      }
    );
    scopes.push(owner);
    await owner.settled();
    notifyFamilyActorChange();
    await owner.settled();
    expect(await rows()).toEqual(preserved);
    expect(preserved).toHaveLength(1);
  });
});
