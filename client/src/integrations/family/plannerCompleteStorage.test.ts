import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeId,
  completeScope,
  completeSource,
  completeTripCaptureFixture,
  completeTripData,
} from '../../../tests/helpers/familyCompleteTrip';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode } from '../../sync/networkMode';
import { captureReadSession } from '../../sync/readSession';
import { parseCompleteTrip, serializeCompleteTrip } from './completeTripSnapshot';
import { guardedPlannerCache, plannerCacheDb, retirePlannerCacheOwners } from './plannerCache';
import { completeTripCapture, retireRefusedCompleteTrip } from './plannerCompleteCapture';
import { guardedPlannerRead } from './plannerReadGuard';
const blocked = () => new Error('Original complete cache context ended');
type Lease = Awaited<ReturnType<typeof guardedPlannerCache>>;
function lease<T>(work: (c: Lease) => Promise<T>, scope = completeScope) {
  return guardedPlannerRead(captureReadSession(), { uuid: scope.trip_id, native: 41 }, blocked, async (guard) =>
    work(await guardedPlannerCache(guard, completeSource, scope, { now: () => 1000000, blocked }))
  );
}
const envelope = (c: Lease) =>
  serializeCompleteTrip({ ...completeTripCaptureFixture(), ownership: c.completeOwnership() });
async function publish() {
  return lease(async (c) => {
    const e = await envelope(c);
    await c.commitComplete(e);
    return e;
  });
}
async function tables() {
  return {
    rows: await plannerCacheDb.completeSnapshots.toArray(),
    heads: await plannerCacheDb.completeHeads.toArray(),
  };
}
beforeEach(async () => {
  setAuthed(true);
  _resetNetworkMode();
  await resetOfflineTestDatabase();
  await Promise.all(plannerCacheDb.tables.map((t) => t.clear()));
});
afterEach(async () => {
  vi.restoreAllMocks();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
describe('same-database atomic complete Trip generations', () => {
  it('publishes a matching immutable generation and pointer without populating native cache rows', async () => {
    const e = await publish(),
      stored = await tables();
    expect(stored.rows).toHaveLength(1);
    expect(stored.heads[0].generation).toBe(e.generation);
    expect(stored.rows[0].value).toEqual(e);
    expect(
      await parseCompleteTrip(stored.rows[0].value, {
        source: completeSource,
        scope: completeScope,
        ownership: e.ownership,
        now: 1000000,
      })
    ).toEqual(e);
  });
  it('rolls back the new envelope if pointer storage fails, preserving the previous complete generation', async () => {
    await publish();
    const before = await tables();
    await lease(async (c) => {
      const e = await envelope(c);
      vi.spyOn(plannerCacheDb.completeHeads, 'put').mockRejectedValueOnce(
        new DOMException('Quota', 'QuotaExceededError')
      );
      await expect(c.commitComplete(e)).rejects.toThrow('Quota');
    });
    expect(await tables()).toEqual(before);
  });
  it('an incomplete subsequent capture cannot alter the previous generation', async () => {
    await publish();
    const before = await tables();
    await lease(async (c) => {
      await expect(
        serializeCompleteTrip({ ...completeTripCaptureFixture(), ownership: c.completeOwnership(), data: {} })
      ).rejects.toThrow();
    });
    expect(await tables()).toEqual(before);
  });
  it('a denied empty Trip barrier prevents an earlier read resurrecting it', async () => {
    await lease(async (old) => {
      const e = await envelope(old);
      await lease((current) => current.evict());
      await expect(old.commitComplete(e)).rejects.toThrow('Original');
    });
    expect(await tables()).toEqual({ rows: [], heads: [] });
  });
  it('does not let a slow complete writer overwrite a newer accepted generation', async () => {
    await lease(async (old) => {
      const delayed = await envelope(old);
      const newer = await publish();
      await expect(old.commitComplete(delayed)).rejects.toThrow('advanced');
      expect((await tables()).heads[0].generation).toBe(newer.generation);
    });
  });
  it('refuses to overwrite an unknown future active-pointer format', async () => {
    await publish();
    const head = (await tables()).heads[0];
    await plannerCacheDb.table('completeHeads').put({ ...head, version: 2 });
    const before = await tables();
    await lease(async (c) => {
      await expect(c.commitComplete(await envelope(c))).rejects.toThrow('Unsupported');
    });
    expect(await tables()).toEqual(before);
  });
  it('a delayed invalidation cannot delete a newer complete generation', async () => {
    await lease(async (old) => {
      const newer = await publish();
      await expect(old.evict()).rejects.toThrow('Original');
      expect((await tables()).heads[0].generation).toBe(newer.generation);
    });
  });
  it('a refused companion retires the complete generation after this same read wrote its checked partial view', async () => {
    await publish();
    await lease(async (c) => {
      const data = completeTripData();
      await c.write(data.planner, () => {});
      await expect(
        retireRefusedCompleteTrip(
          Promise.resolve({ [completeTripCapture]: { pair: data.planner, lease: c, capturedAt: 1000000 } }),
          { status: 403 }
        )
      ).resolves.toBeUndefined();
    });
    expect(await tables()).toEqual({ rows: [], heads: [] });
    expect(await plannerCacheDb.snapshots.count()).toBe(0);
  });
  it('retirement clears complete and partial stores and blocks the original writer', async () => {
    await lease(async (c) => {
      const e = await envelope(c);
      await c.commitComplete(e);
      await retirePlannerCacheOwners(
        Promise.resolve([{ key: e.ownership.ownerKey, generation: e.ownership.ownerGeneration }])
      );
      await expect(c.commitComplete(e)).rejects.toThrow('Original');
    });
    expect(await tables()).toEqual({ rows: [], heads: [] });
  });
  it('late retirement of the same account old generation preserves the fresh generation', async () => {
    const old = await publish(),
      owner = { key: old.ownership.ownerKey, generation: old.ownership.ownerGeneration };
    await retirePlannerCacheOwners(Promise.resolve([owner]));
    const fresh = await publish();
    await retirePlannerCacheOwners(Promise.resolve([owner]));
    expect((await tables()).heads[0].generation).toBe(fresh.generation);
  });
  it('Trip eviction preserves a different Trip complete generation', async () => {
    await publish();
    const other = { ...completeScope, trip_id: completeId(88) };
    await lease(async (c) => {
      const e = await serializeCompleteTrip({ ...completeTripCaptureFixture(other), ownership: c.completeOwnership() });
      await c.commitComplete(e);
    }, other);
    await lease((c) => c.evict());
    expect((await tables()).heads).toHaveLength(1);
    expect((await tables()).rows[0].value.scope.trip_id).toBe(other.trip_id);
  });
  it('a separate IndexedDB connection can retire the persisted Trip barrier before a late writer', async () => {
    const other = new Dexie(plannerCacheDb.name);
    await other.open();
    try {
      await lease(async (c) => {
        const e = await envelope(c),
          key = 'trip:' + JSON.stringify(JSON.parse(e.ownership.key).slice(0, 6));
        const barrier = await other.table('owners').get(key);
        await other.table('owners').put({ ...barrier, generation: completeId(98) });
        await expect(c.commitComplete(e)).rejects.toThrow('Original');
      });
    } finally {
      other.close();
    }
    expect(await tables()).toEqual({ rows: [], heads: [] });
  });
});
