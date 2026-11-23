import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  packingFixtureAt as at,
  canonicalPackingList,
  canonicalPackingScope,
  packingFixtureId as id,
} from '../../../tests/helpers/familyPacking';
import { canonicalPackingCategories } from '../../../tests/helpers/familyPackingCategories';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { packingRepo } from '../../repo/packingRepo';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { captureReadSession } from '../../sync/readSession';
import { createPackingTransport } from './packingTransport';
import { createFamilyPlannerCohort } from './plannerCohort';
import { createPlannerPackingHandler, createPlannerPackingReader } from './plannerPacking';
import { PlannerReadGuard } from './plannerReadGuard';
import { FamilyFrontendRepository, familyReaders, type FamilySession } from './repository';
import { activateFamilyFrontend } from './runtime';
import { createFamilyAxiosAdapter } from './transport';
const scope = canonicalPackingScope(),
  session: FamilySession = {
    userId: scope.user_id,
    personId: scope.person_id,
    familyId: scope.family_id,
    user: { username: 'Reader', email: 'reader@fixture.invalid', avatar_url: null, created_at: at },
  };
const sdk = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
let repo: FamilyFrontendRepository, source: string, disposed: boolean;
const req = (suffix = '', method = 'GET', signal?: AbortSignal) => ({
  pathname: `/trips/${scope.trip_id}/packing${suffix}`,
  method,
  signal,
  body: undefined,
  query: new URLSearchParams(),
});
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  _resetNetworkMode();
  setAuthed(true);
  source = 'local-source';
  disposed = false;
  const readers = {
    ...familyReaders,
    listTripTravelers: vi.fn(async () => [
      { personId: scope.person_id, displayName: 'Reader', color: null },
      { personId: id(7), displayName: 'Companion', color: null },
    ]),
  };
  repo = new FamilyFrontendRepository(async () => session, readers);
  await repo.session();
  vi.spyOn(repo.readers.trips, 'fetchTripById').mockResolvedValue({
    id: scope.trip_id,
    family_id: scope.family_id,
  } as never);
  sdk.rpc.mockReset();
  sdk.rpc.mockResolvedValue({ data: canonicalPackingList(), error: null });
});
afterEach(async () => {
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
const reader = (rpc = vi.fn(async (): Promise<unknown> => canonicalPackingList())) => ({
  rpc,
  ...createPlannerPackingReader(
    repo,
    () => disposed,
    () => source,
    createPackingTransport(rpc)
  ),
});
describe('canonical native packing ownership', () => {
  it('retains a null historical bag color while projecting the existing native default', async () => {
    const p = canonicalPackingList();
    p.bags[0].color = null;
    const out = await reader(vi.fn(async () => p)).read(scope.trip_id);
    expect(out.packet.bags[0].color).toBeNull();
    expect(out.bags[0].color).toBe('#6366f1');
  });
  it('maps stable native IDs while retaining canonical scope, partial counts, original times and authoritative weights', async () => {
    const ids = (await repo.views()).ids,
      r = reader(),
      one = await r.read(scope.trip_id),
      two = await r.read(ids.register('trip', scope.trip_id));
    expect(two.items).toEqual(one.items);
    expect(ids.uuid('packing', one.items[0].id)).toBe(id(5));
    expect(ids.uuid('packingBag', one.bags[0].id)).toBe(id(6));
    expect(one.items[0]).toMatchObject({
      name: 'Raincoat',
      checked: 0,
      quantity: 3,
      packed_quantity: 1,
      created_at: at,
      updated_at: at,
      owner_username: 'Reader',
      recipients: [{ username: 'Companion' }],
      family_packing: { id: id(5), revision: 3, scope, collection_revision: 7 },
    });
    expect(one.bags[0]).toMatchObject({
      name: 'Cabin bag',
      total_weight_grams: 2200,
      members: [{ username: 'Companion' }],
    });
    expect(one.assignees).toMatchObject({ Clothes: [{ username: 'Reader' }] });
    expect(await offlineDb.packingItems.count()).toBe(0);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('retains empty-list observations without requiring a row or creating defaults', async () => {
    const p = canonicalPackingList(scope, true),
      r = reader(vi.fn(async () => p));
    const out = await r.read(scope.trip_id);
    expect(out.packet.scope).toEqual(scope);
    expect(out.packet.collection_revision).toBe(7);
    expect(out.items).toEqual([]);
    expect(repo.readers.listTripTravelers).not.toHaveBeenCalled();
    expect(r.rpc).toHaveBeenCalledTimes(1);
  });
  it('reads published packing in My Draft without changing the selected itinerary layer', async () => {
    repo.setLayer(scope.trip_id, 'myDraft');
    expect((await reader().read(scope.trip_id)).packet.scope.layer).toBe('published');
    expect(repo.getLayer(scope.trip_id)).toBe('myDraft');
  });
  it('keeps metadata independent from mutable native presentation objects', async () => {
    const out = await reader().read(scope.trip_id);
    out.items[0].family_packing.scope.person_id = id(90);
    out.items[0].family_packing.recipient_person_ids.length = 0;
    expect(out.packet.scope.person_id).toBe(scope.person_id);
    expect(out.packet.items[0].recipient_person_ids).toEqual([id(7)]);
  });
  it('does not fabricate usernames or detach historical owners missing from the current roster', async () => {
    const p = canonicalPackingList();
    p.items[0].owner_person_id = id(80);
    const r = await reader(vi.fn(async () => p)).read(scope.trip_id);
    expect((await repo.views()).ids.uuid('person', r.items[0].owner_id ?? 0)).toBe(id(80));
    expect(r.items[0].owner_username).toBe('');
    expect(r.items[0].family_packing.owner_person_id).toBe(id(80));
  });
  it('does not call the legacy packing adapter or overwrite the generic cache', async () => {
    const legacy = vi.spyOn(repo.readers.packing, 'listPackingItems');
    const old = { id: 91, trip_id: 98, name: 'Retained work', checked: 0, sort_order: 0 };
    await offlineDb.packingItems.put(old);
    expect((await reader().read(scope.trip_id)).items[0].name).toBe('Raincoat');
    expect(legacy).not.toHaveBeenCalled();
    expect(await offlineDb.packingItems.toArray()).toEqual([old]);
  });
  it('rejects unknown numeric selectors without dispatch', async () => {
    const r = reader();
    await expect(r.read(99999)).rejects.toMatchObject({ code: 'unknown_view_key' });
    expect(r.rpc).not.toHaveBeenCalled();
  });
  it('refuses offline reads without cache or empty fallback', async () => {
    setForcedOffline(true);
    const r = reader();
    await expect(r.read(scope.trip_id)).rejects.toMatchObject({ code: 'packing_view_offline' });
    expect(r.rpc).not.toHaveBeenCalled();
  });
  it('refuses pending intent before the RPC and leaves it untouched', async () => {
    const native = (await repo.views()).ids.register('trip', scope.trip_id);
    await offlineDb.mutationQueue.add({
      id: 'retained',
      tripId: native,
      method: 'PUT',
      url: `/trips/${native}/packing/42`,
      body: { name: 'Pending' },
      entityId: 42,
      resource: 'packingItems',
      status: 'pending',
      retryCount: 0,
      timestamp: Date.now(),
      schemaVersion: 1,
    } as never);
    const r = reader();
    await expect(r.read(scope.trip_id)).rejects.toMatchObject({ code: 'packing_local_work' });
    expect(r.rpc).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });
  for (const change of [
    'source',
    'disposed',
    'actor',
    'person',
    'family',
    'clear',
    'layer',
    'layerABA',
    'logout',
    'privateEpoch',
    'invalidate',
    'abort',
  ] as const)
    it(`rejects a late private response after ${change} before identity/cache publication`, async () => {
      const held = deferred<unknown>(),
        started = deferred<void>(),
        r = reader(
          vi.fn(async () => {
            started.resolve();
            return held.promise;
          })
        ),
        ids = (await repo.views()).ids,
        register = vi.spyOn(ids, 'register'),
        abort = new AbortController();
      const pending = r.read(scope.trip_id, abort.signal),
        rejected = expect(pending).rejects.toBeDefined();
      await started.promise;
      if (change === 'source') source = 'other-source';
      if (change === 'disposed') disposed = true;
      if (change === 'actor') repo.acceptSession({ ...session, userId: id(81) });
      if (change === 'person') repo.acceptSession({ ...session, personId: id(82) });
      if (change === 'family') repo.acceptSession({ ...session, familyId: id(83) });
      if (change === 'clear') repo.clear();
      if (change === 'layer' || change === 'layerABA') {
        repo.setLayer(scope.trip_id, 'myDraft');
        if (change === 'layerABA') repo.setLayer(scope.trip_id, 'published');
      }
      if (change === 'logout') setAuthed(false);
      if (change === 'privateEpoch') invalidateOfflineSession();
      if (change === 'invalidate') repo.invalidate(scope.trip_id);
      if (change === 'abort') abort.abort();
      held.resolve(canonicalPackingList());
      await rejected;
      expect(register.mock.calls.filter(([kind]) => kind === 'packing' || kind === 'packingBag')).toHaveLength(0);
      expect(await offlineDb.packingItems.count()).toBe(0);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    });
  it('does not surface a retired private backend error after logout', async () => {
    const held = deferred<unknown>(),
      started = deferred<void>(),
      r = reader(
        vi.fn(async () => {
          started.resolve();
          return held.promise;
        })
      );
    const pending = r.read(scope.trip_id),
      rejected = expect(pending).rejects.toMatchObject({ name: 'ReadSessionChanged' });
    await started.promise;
    setAuthed(false);
    held.reject(new Error('Private failure'));
    await rejected;
  });
  it.each([
    ['packing list', 2, 0],
    ['traveler roster', 3, 1],
  ] as const)('stops before the %s if the queue check is canceled', async (_read, abortAt, packingReads) => {
    const ids = (await repo.views()).ids;
    const trip = { uuid: scope.trip_id, native: ids.register('trip', scope.trip_id) };
    const guard = new PlannerReadGuard(captureReadSession(), trip, '', () => new Error('Queue changed'));
    const controller = new AbortController();
    let checks = 0;
    vi.spyOn(guard, 'check').mockImplementation(() => {
      if (++checks === abortAt) controller.abort();
      return Dexie.Promise.resolve();
    });
    const r = reader();

    await expect(r.read(trip.uuid, controller.signal, guard)).rejects.toMatchObject({ name: 'AbortError' });
    expect(r.rpc).toHaveBeenCalledTimes(packingReads);
    expect(repo.readers.listTripTravelers).not.toHaveBeenCalled();
  });
  it('does not request bags if cancellation arrives during the categories read', async () => {
    const controller = new AbortController();
    const categories = {
      list: vi.fn(async () => {
        controller.abort();
        return canonicalPackingCategories();
      }),
    };
    const r = createPlannerPackingReader(
      repo,
      () => false,
      () => source,
      undefined,
      categories,
      true
    );

    await expect(r.read(scope.trip_id, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(categories.list).toHaveBeenCalledOnce();
    expect(sdk.rpc).not.toHaveBeenCalled();
  });
  it('refuses a cache edit that arrives while the RPC is pending', async () => {
    const held = deferred<unknown>(),
      started = deferred<void>(),
      r = reader(
        vi.fn(async () => {
          started.resolve();
          return held.promise;
        })
      );
    const native = (await repo.views()).ids.register('trip', scope.trip_id),
      pending = r.read(scope.trip_id),
      rejected = expect(pending).rejects.toMatchObject({ code: 'packing_local_work' });
    await started.promise;
    await offlineDb.packingItems.put({
      id: 88,
      trip_id: native,
      name: 'Unconfirmed local edit',
      checked: 0,
      sort_order: 0,
    });
    held.resolve(canonicalPackingList());
    await rejected;
    expect((await offlineDb.packingItems.get(88))?.name).toBe('Unconfirmed local edit');
  });
});
describe('packing handler and native port', () => {
  it.each(['', '/bags', '/category-assignees'])(
    'serves complete %s observations from the canonical handler',
    async (suffix) => {
      const r = reader(),
        out = await createPlannerPackingHandler(r)(req(suffix));
      expect(out).toMatchObject({ family_packing_scope: scope, collection_revision: 7, trash_count: 1 });
      if (suffix === '/bags')
        expect(out).toMatchObject({ bags: [{ total_weight_grams: 2200 }], unassigned_weight_grams: 0 });
      if (suffix === '/category-assignees')
        expect(out).toMatchObject({ assignees: { Clothes: [{ username: 'Reader' }] } });
    }
  );
  it.each(['/templates', '/42', '/', '/bags/42'])(
    'rejects unsupported %s rather than falling through to legacy data',
    async (suffix) => {
      const r = reader();
      await expect(createPlannerPackingHandler(r)(req(suffix))).rejects.toMatchObject({
        code: 'packing_read_unavailable',
      });
      expect(r.rpc).not.toHaveBeenCalled();
    }
  );
  it('rejects filtering that conceals the observed complete list', async () => {
    const r = reader(),
      request = req();
    request.query.set('category', 'Clothes');
    await expect(createPlannerPackingHandler(r)(request)).rejects.toMatchObject({ code: 'packing_read_unavailable' });
    expect(r.rpc).not.toHaveBeenCalled();
  });
  it.each(['POST', 'PUT', 'DELETE'])('keeps %s writes gated with no RPC/queue effects', async (method) => {
    const r = reader();
    await expect(createPlannerPackingHandler(r)(req('', method))).rejects.toMatchObject({
      code: 'packing_writer_not_cut_over',
    });
    expect(r.rpc).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('runs the actual installed native repository through the cohort handler without old tables or cache publication', async () => {
    activateFamilyFrontend();
    const cohort = createFamilyPlannerCohort(repo, { source: () => source, reportError: () => {} }),
      stop = cohort.install(),
      before = api.defaults.adapter;
    api.defaults.adapter = createFamilyAxiosAdapter(cohort.handle);
    try {
      expect((await packingRepo.list(scope.trip_id)).items[0]).toMatchObject({
        name: 'Raincoat',
        family_packing: { scope },
      });
      expect(sdk.rpc).toHaveBeenCalledExactlyOnceWith('get_family_trip_packing_v1', { p_trip_id: scope.trip_id });
      expect(await offlineDb.packingItems.count()).toBe(0);
      expect(useTripStore.getState().packingItems).toEqual([]);
      for (const work of [
        () => packingRepo.create(scope.trip_id, { name: 'Blocked' }),
        () => packingRepo.update(scope.trip_id, 1, { checked: true }),
        () => packingRepo.delete(scope.trip_id, 1),
      ])
        await expect(work()).rejects.toThrow('not cut over');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    } finally {
      stop();
      api.defaults.adapter = before;
    }
  });
});
describe('owned packing Trash and receipt readers', () => {
  it('requires the original page observation for continuation before any RPC', async () => {
    const r = reader();
    await expect(r.trash(scope.trip_id, 50, { deleted_at: at, id: id(5) })).rejects.toMatchObject({
      code: 'packing_trash_observation',
    });
    expect(r.rpc).not.toHaveBeenCalled();
  });
  it('rejects a changed collection between Trash pages without touching cache', async () => {
    const rpc = vi.fn(async () => ({ version: 1, scope, collection_revision: 8, items: [], next_cursor: null })),
      r = reader(rpc);
    await expect(
      r.trash(scope.trip_id, 50, { deleted_at: at, id: id(5) }, { scope, collection_revision: 7 })
    ).rejects.toMatchObject({ code: 'packing_trash_changed' });
    expect(await offlineDb.packingItems.count()).toBe(0);
  });
  it('keeps a valid empty last page and its original observation', async () => {
    const packet = { version: 1, scope, collection_revision: 7, items: [], next_cursor: null },
      r = reader(vi.fn(async () => packet));
    expect(
      (await r.trash(scope.trip_id, 50, { deleted_at: at, id: id(5) }, { scope, collection_revision: 7 })).packet
    ).toEqual(packet);
  });
  it('returns redacted committed proof through the owned reader with no save or local acknowledgement removal', async () => {
    const packet = {
        version: 1,
        scope,
        trip_id: scope.trip_id,
        operation_id: id(90),
        status: 'committed',
        result_redacted: true,
        result: null,
      },
      r = reader(vi.fn(async () => packet));
    expect((await r.receipt(scope.trip_id, id(90))).packet).toEqual(packet);
    expect(r.rpc).toHaveBeenCalledTimes(1);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it.each(['trash', 'receipt'] as const)('fences late %s after a Person change', async (operation) => {
    const held = deferred<unknown>(),
      started = deferred<void>(),
      r = reader(
        vi.fn(async () => {
          started.resolve();
          return held.promise;
        })
      );
    const pending = operation === 'trash' ? r.trash(scope.trip_id) : r.receipt(scope.trip_id, id(90)),
      rejected = expect(pending).rejects.toBeDefined();
    await started.promise;
    repo.acceptSession({ ...session, personId: id(80) });
    held.resolve(
      operation === 'trash'
        ? { version: 1, scope, collection_revision: 7, items: [], next_cursor: null }
        : {
            version: 1,
            scope,
            trip_id: scope.trip_id,
            operation_id: id(90),
            status: 'unknown',
            result_redacted: false,
            result: null,
          }
    );
    await rejected;
  });
});
