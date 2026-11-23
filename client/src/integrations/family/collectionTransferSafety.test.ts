// organize-imports-ignore
// sort-imports-ignore
// Preserve existing module evaluation order during formatting.
import type { CollectionPlace } from '@trek/shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { familyRepositoryFixture } from '../../../tests/helpers/familyRepository';
import api from '../../api/client';
import { collectionsApi } from '../../api/collections';
import { useSaveToCollection } from '../../components/Collections/useSaveToCollection';
import { useTripCopyPicker } from '../../components/Collections/useTripCopyPicker';
import { useCollectionStore } from '../../store/collectionStore';
import { useSaveToCollectionStore } from '../../store/saveToCollectionStore';
import { createFamilyApplicationHandler } from './applicationHandler';
import { FamilyIdentityRegistry } from './identity';
import { familyAuthStore } from './repository';
import { createFamilyAxiosAdapter, createFamilyFetch } from './transport';

const backend = vi.hoisted(() => ({
  load: vi.fn(),
  add: vi.fn(),
  copy: vi.fn(),
  status: vi.fn(),
  remove: vi.fn(),
  archive: vi.fn(),
}));
vi.mock('./legacy/data/supabase/familyLists', () => ({
  loadFamilyCollections: backend.load,
  addFamilyListItem: backend.add,
  setFamilyListItemStatus: backend.status,
  removeFamilyListItem: backend.remove,
  archiveFamilyList: backend.archive,
}));
vi.mock('./legacy/data/supabase/copyFamilyListPlacesToTrip', () => ({ copyFamilyListPlacesToTrip: backend.copy }));
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../i18n', () => ({ useTranslation: () => ({ t: (key: string) => key, language: 'en' }) }));
vi.mock('../../sync/useServerPing', () => ({ useServerPing: () => {} }));

const uuid = (n: number) => `f5b00000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const family = uuid(1),
  trip = uuid(2),
  location = uuid(3),
  collection = uuid(4),
  item = uuid(5);
const adapterBefore = api.defaults.adapter,
  authBefore = familyAuthStore.getState();
const collectionStateBefore = useCollectionStore.getState();
const toast = vi.fn();
const removalMessage =
  'Removing saved Collection items is unavailable until Trash and Restore are connected. Nothing was removed.';
const removalRefusal = {
  response: { status: 422, data: { code: 'collection_recovery_unavailable', error: removalMessage } },
};
const message = 'Saving or copying locations between Trips and Collections is not available yet. Nothing was copied.';

async function fixture() {
  const ids = new FamilyIdentityRegistry(uuid(90));
  // A deliberately colliding legacy geography ID must never qualify a normalized transfer.
  const core = vi.fn(async () => ({ places: [{ id: location }] }));
  const repo = familyRepositoryFixture(family, () => ids, { core });
  await repo.session();
  const native = {
    trip: ids.register('trip', trip),
    place: ids.register('place', location),
    collection: ids.register('collection', collection),
    item: ids.register('collectionItem', item),
  };
  const handler = createFamilyApplicationHandler(repo),
    forward = vi.fn();
  api.defaults.adapter = createFamilyAxiosAdapter(handler);
  vi.stubGlobal('fetch', createFamilyFetch(handler, forward, window.location.origin));
  vi.spyOn(repo, 'listTrips').mockResolvedValue({ trips: [{ id: native.trip, title: 'Fixture trip' }] } as Awaited<
    ReturnType<typeof repo.listTrips>
  >);
  return { repo, core, native, handler, forward };
}
const refusal = { response: { status: 422, data: { code: 'collection_transfer_unavailable', error: message } } };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useCollectionStore.setState(collectionStateBefore, true);
  familyAuthStore.setState({ membershipRole: 'member', isSuperAdmin: false });
  useSaveToCollectionStore.setState({ target: null, version: 0 });
  vi.stubGlobal('__addToast', toast);
  backend.load.mockResolvedValue({
    collections: [{ id: collection, owner_id: uuid(91), name: 'Saved', place_count: 1 }],
    places: [{ id: item, collection_id: collection, name: 'Same name', notes: 'Existing list note', status: 'idea' }],
  });
  backend.add.mockResolvedValue(item);
  backend.copy.mockResolvedValue({ copied: 1, skipped: [] });
});
afterEach(() => {
  api.defaults.adapter = adapterBefore;
  familyAuthStore.setState(authBefore, true);
  useSaveToCollectionStore.setState({ target: null, version: 0 });
  useCollectionStore.setState(collectionStateBefore, true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('normalized Collection transfer safety through the actual native API and Family handler', () => {
  it.each(['place', 'food', 'hotel', 'experience', 'manual'])(
    'refuses the native save for %s without losing overrides or consulting geography',
    async (kind) => {
      const f = await fixture();
      await expect(
        collectionsApi.savePlace({
          collection_id: f.native.collection,
          source_trip_id: f.native.trip,
          source_place_id: f.native.place,
          name: 'Overridden name',
          notes: 'Private trip note',
          description: 'Distinct description',
          osm_id: kind === 'manual' ? null : `catalog:${kind}:${uuid(6)}`,
          force: true,
        })
      ).rejects.toMatchObject(refusal);
      expect(backend.add).not.toHaveBeenCalled();
      expect(backend.copy).not.toHaveBeenCalled();
      expect(backend.load).not.toHaveBeenCalled();
      expect(f.core).not.toHaveBeenCalled();
      expect(f.forward).not.toHaveBeenCalled();
    }
  );
  it('refuses the older from-trip route even if its UUID happens to match a geography row', async () => {
    const f = await fixture();
    await expect(
      collectionsApi.saveFromTrip({
        collection_id: f.native.collection,
        source_trip_id: f.native.trip,
        source_place_id: f.native.place,
      })
    ).rejects.toMatchObject(refusal);
    expect(f.core).not.toHaveBeenCalled();
    expect(backend.add).not.toHaveBeenCalled();
  });
  it('refuses the bulk native save atomically before looking at any item', async () => {
    const f = await fixture();
    await expect(
      collectionsApi.saveFromTripMany(f.native.collection, f.native.trip, [f.native.place, 999], true)
    ).rejects.toMatchObject(refusal);
    expect(backend.load).not.toHaveBeenCalled();
    expect(backend.add).not.toHaveBeenCalled();
  });
  it('refuses copy-to-trip before its old writer or permission gate can publish geography rows', async () => {
    const f = await fixture(),
      write = vi.spyOn(f.repo, 'write');
    await expect(
      collectionsApi.copyToTrip({ trip_id: f.native.trip, place_ids: [f.native.item] })
    ).rejects.toMatchObject(refusal);
    expect(write).not.toHaveBeenCalled();
    expect(f.core).not.toHaveBeenCalled();
    expect(backend.copy).not.toHaveBeenCalled();
    expect(backend.load).not.toHaveBeenCalled();
  });
  it('an identical idempotency-key retry never becomes a fake copied/skipped acknowledgement', async () => {
    const f = await fixture(),
      body = { trip_id: f.native.trip, place_ids: [f.native.item] };
    for (let i = 0; i < 2; i++)
      await expect(
        api.post('/addons/collections/copy-to-trip', body, { headers: { 'X-Idempotency-Key': uuid(20) } })
      ).rejects.toMatchObject(refusal);
    expect(backend.copy).not.toHaveBeenCalled();
  });
  it('a deliberate second visit remains unavailable rather than being silently deduplicated or invented', async () => {
    const f = await fixture(),
      body = { trip_id: f.native.trip, place_ids: [f.native.item] };
    for (const key of [uuid(21), uuid(22)])
      await expect(
        api.post('/addons/collections/copy-to-trip', body, { headers: { 'X-Idempotency-Key': key } })
      ).rejects.toMatchObject(refusal);
    expect(backend.copy).not.toHaveBeenCalled();
  });
  it.each(['member', 'reviewer', 'admin'] as const)(
    'the missing transfer capability cannot be bypassed by role %s',
    async (role) => {
      const f = await fixture();
      familyAuthStore.setState({ membershipRole: role, isSuperAdmin: role === 'admin' });
      await expect(
        collectionsApi.copyToTrip({ trip_id: f.native.trip, place_ids: [f.native.item] })
      ).rejects.toMatchObject(refusal);
      expect(backend.copy).not.toHaveBeenCalled();
    }
  );
  it('the fetch transport refuses the same route without a network fallback', async () => {
    const f = await fixture();
    const response = await fetch('/api/addons/collections/places/from-trip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection_id: f.native.collection,
        source_trip_id: f.native.trip,
        source_place_id: f.native.place,
      }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ code: 'collection_transfer_unavailable', error: message });
    expect(f.forward).not.toHaveBeenCalled();
    expect(backend.add).not.toHaveBeenCalled();
  });
  it('a retired request cannot publish even its availability response into the next actor', async () => {
    const f = await fixture();
    let resume!: () => void;
    const pause = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const original = f.repo.session.bind(f.repo);
    vi.spyOn(f.repo, 'session').mockImplementationOnce(async () => {
      await pause;
      return original();
    });
    const pending = collectionsApi.copyToTrip({ trip_id: f.native.trip, place_ids: [f.native.item] });
    const result = expect(pending).rejects.toMatchObject({
      response: { status: 409, data: { code: 'stale_session' } },
    });
    await waitFor(() => expect(f.repo.session).toHaveBeenCalled());
    f.repo.clear();
    resume();
    await result;
    expect(backend.copy).not.toHaveBeenCalled();
  });
  it('the shared desktop/phone save hook keeps the draft and shows an error instead of reporting success', async () => {
    const f = await fixture();
    const target = {
      name: 'Edited restaurant',
      source_trip_id: f.native.trip,
      source_place_id: f.native.place,
      notes: 'Keep my note',
      osm_id: `catalog:food:${uuid(6)}`,
    };
    vi.spyOn(collectionsApi, 'list').mockResolvedValue({
      collections: [{ id: f.native.collection, owner_id: 91, name: 'Saved' } as never],
      incomingInvites: [],
    });
    vi.spyOn(collectionsApi, 'membership').mockResolvedValue({ saved: false, lists: [] });
    const h = renderHook(() => useSaveToCollection());
    act(() => useSaveToCollectionStore.setState({ target }));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    expect(h.result.current.lists).toHaveLength(1);
    await act(() => h.result.current.handleToggle(h.result.current.lists[0]));
    expect(toast).toHaveBeenCalledWith(message, 'error', undefined);
    expect(toast.mock.calls.some((call) => call[1] === 'success')).toBe(false);
    expect(useSaveToCollectionStore.getState()).toMatchObject({ target, version: 0 });
    expect(h.result.current.busyId).toBeNull();
    expect(backend.add).not.toHaveBeenCalled();
    h.unmount();
  });
  it('the shared desktop/phone copy hook leaves its picker open on refusal', async () => {
    const f = await fixture(),
      close = vi.fn();
    const h = renderHook(() =>
      useTripCopyPicker({
        open: true,
        onClose: close,
        t: (key) => key,
        onCopy: (tripId) => collectionsApi.copyToTrip({ trip_id: tripId, place_ids: [f.native.item] }),
      })
    );
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    expect(h.result.current.filtered).toHaveLength(1);
    await act(() => h.result.current.handleCopy(f.native.trip));
    expect(toast).toHaveBeenCalledWith(message, 'error', undefined);
    expect(close).not.toHaveBeenCalled();
    expect(h.result.current.busyTripId).toBeNull();
    expect(backend.copy).not.toHaveBeenCalled();
    h.unmount();
  });
  it('legacy status cannot bypass the observed coordinator and raw removal remains held', async () => {
    const f = await fixture();
    await expect(collectionsApi.setStatus(f.native.item, 'visited')).rejects.toMatchObject({
      response: { status: 422, data: { code: 'collection_feature_unavailable' } },
    });
    await expect(collectionsApi.deletePlace(f.native.item)).rejects.toMatchObject(removalRefusal);
    expect(backend.status).not.toHaveBeenCalled();
    expect(backend.remove).not.toHaveBeenCalled();
  });
});

describe('Collection recovery availability at the native boundary', () => {
  it.each(['known', 'unknown'])('refuses single %s item removal before loading or deleting', async (identity) => {
    const f = await fixture();
    await expect(collectionsApi.deletePlace(identity === 'known' ? f.native.item : 99999)).rejects.toMatchObject(
      removalRefusal
    );
    expect(backend.load).not.toHaveBeenCalled();
    expect(backend.remove).not.toHaveBeenCalled();
  });
  it('refuses bulk removal atomically before interpreting any selected identity', async () => {
    const f = await fixture();
    await expect(collectionsApi.deleteMany([f.native.item, 99999])).rejects.toMatchObject(removalRefusal);
    expect(backend.load).not.toHaveBeenCalled();
    expect(backend.remove).not.toHaveBeenCalled();
  });
  it('the fetch removal path has the same explicit refusal and no provider fallback', async () => {
    const f = await fixture();
    const response = await fetch('/api/addons/collections/places/' + f.native.item, { method: 'DELETE' });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ code: 'collection_recovery_unavailable', error: removalMessage });
    expect(f.forward).not.toHaveBeenCalled();
    expect(backend.remove).not.toHaveBeenCalled();
  });
  it('retries never turn the missing recovery capability into a destructive acknowledgement', async () => {
    const f = await fixture();
    for (let i = 0; i < 2; i++)
      await expect(
        api.delete('/addons/collections/places/' + f.native.item, { headers: { 'X-Idempotency-Key': uuid(99) } })
      ).rejects.toMatchObject(removalRefusal);
    expect(backend.remove).not.toHaveBeenCalled();
  });
  it('elevated roles cannot enable a missing recovery capability', async () => {
    const f = await fixture();
    familyAuthStore.setState({ isSuperAdmin: true });
    await expect(collectionsApi.deletePlace(f.native.item)).rejects.toMatchObject(removalRefusal);
    expect(backend.remove).not.toHaveBeenCalled();
  });
  it.each(['single', 'bulk'])(
    'the native optimistic %s store restores the saved row and selection on refusal',
    async (mode) => {
      const f = await fixture(),
        detail = {
          places: [
            {
              id: f.native.item,
              collection_id: f.native.collection,
              name: 'Same name',
              notes: 'Existing list note',
              status: 'idea',
              sort_order: 0,
              created_at: '2026-11-15T00:00:00Z',
            },
          ],
        };
      const row = detail.places[0] as CollectionPlace,
        loadAll = vi.fn();
      useCollectionStore.setState({ places: [row], selectedIds: [row.id], selectMode: true, loadAll });
      const pending =
        mode === 'single'
          ? useCollectionStore.getState().deletePlace(row.id)
          : useCollectionStore.getState().deleteMany([row.id]);
      expect(useCollectionStore.getState().places).toEqual([]);
      await expect(pending).rejects.toMatchObject(removalRefusal);
      expect(useCollectionStore.getState()).toMatchObject({ places: [row], selectedIds: [row.id], selectMode: true });
      expect((row as { notes: string }).notes).toBe('Existing list note');
      expect(loadAll).not.toHaveBeenCalled();
      expect(backend.remove).not.toHaveBeenCalled();
    }
  );
  it('raw root removal cannot fall back to the legacy Archive writer', async () => {
    const f = await fixture();
    await expect(collectionsApi.remove(f.native.collection)).rejects.toMatchObject({
      response: { status: 422, data: { code: 'collection_feature_unavailable' } },
    });
    expect(backend.archive).not.toHaveBeenCalled();
    expect(backend.remove).not.toHaveBeenCalled();
  });
});
