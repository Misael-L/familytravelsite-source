import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { packingApi } from '../../api/client';
import { offlineDb } from '../../db/offlineDb';
import { packingRepo } from '../../repo/packingRepo';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
const virtual = { kind: 'virtual-category', key: 'virtual-packing-category:a0bc0000-0000-4000-8000-000000000020' };
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  _resetNetworkMode();
  setAuthed(true);
  setForcedOffline(true);
});
afterEach(() => {
  _resetNetworkMode();
  vi.restoreAllMocks();
});
const cases = {
  repoCreate: () => packingRepo.create(1, { ...virtual, name: 'Not a real row' }),
  repoUpdate: () => packingRepo.update(1, virtual.key as never, { name: 'No' }),
  repoDelete: () => packingRepo.delete(1, virtual.key as never),
  storeCreate: () => useTripStore.getState().addPackingItem(1, { ...virtual, name: 'No' }),
  storeUpdate: () => useTripStore.getState().updatePackingItem(1, virtual.key as never, { name: 'No' }),
  storeDelete: () => useTripStore.getState().deletePackingItem(1, virtual.key as never),
  storeToggle: () => useTripStore.getState().togglePackingItem(1, virtual.key as never, true, virtual as never),
  storeCount: () => useTripStore.getState().setPackedCount(1, virtual.key as never, 1, virtual as never),
  storeReorder: () => useTripStore.getState().reorderPackingItems(1, [virtual.key as never], []),
  storeSharing: () => useTripStore.getState().setPackingItemSharing(1, virtual.key as never, 'common', []),
  storeClone: () => useTripStore.getState().clonePackingItem(1, virtual.key as never),
  storeJoin: () => useTripStore.getState().addPackingContributor(1, virtual.key as never),
  storeLeave: () => useTripStore.getState().removePackingContributor(1, virtual.key as never, 1),
};
for (const [name, run] of Object.entries(cases))
  it(name + ' refuses a virtual value before cache, queue, native publication or raw HTTP', async () => {
    const before = useTripStore.getState().packingItems;
    const raw = [
      vi.spyOn(packingApi, 'create'),
      vi.spyOn(packingApi, 'update'),
      vi.spyOn(packingApi, 'delete'),
      vi.spyOn(packingApi, 'reorder'),
      vi.spyOn(packingApi, 'setSharing'),
      vi.spyOn(packingApi, 'clone'),
      vi.spyOn(packingApi, 'addContributor'),
      vi.spyOn(packingApi, 'removeContributor'),
    ];
    await expect(run()).rejects.toThrow(/Virtual/);
    expect(useTripStore.getState().packingItems).toBe(before);
    expect(await offlineDb.packingItems.count()).toBe(0);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    for (const call of raw) expect(call).not.toHaveBeenCalled();
  });
