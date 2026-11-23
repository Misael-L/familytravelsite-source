import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildPackingItem } from '../../../tests/helpers/factories';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { packingRepo } from '../../repo/packingRepo';
import { installPlannerReadPort, type PlannerReadPort } from '../../repo/plannerReadPort';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';

let stop = () => {};
beforeEach(async () => {
  await resetOfflineTestDatabase();
  _resetNetworkMode();
  setAuthed(true);
});
afterEach(async () => {
  stop();
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
function port(packing?: PlannerReadPort['packing']): PlannerReadPort {
  return { packing, places: async () => ({ places: [] }), days: async () => ({ days: [] }) };
}
function held<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
it('reads canonical packing without storing its projection over generic native data', async () => {
  const original = buildPackingItem({ id: 1, trip_id: 8, name: 'Retained original' });
  await offlineDb.packingItems.put(original);
  const answer = { items: [buildPackingItem({ id: 22, trip_id: 8, name: 'Canonical answer' })] };
  const read = vi.fn(async () => answer);
  stop = installPlannerReadPort(port(read));
  expect(await packingRepo.list(8)).toBe(answer);
  expect(read).toHaveBeenCalledWith(8);
  expect(await offlineDb.packingItems.toArray()).toEqual([original]);
});
it('an incomplete installed cohort refuses before native HTTP or cache fallback', async () => {
  stop = installPlannerReadPort(port());
  await expect(packingRepo.list(8)).rejects.toThrow('Canonical packing reads are not connected');
  expect(await offlineDb.packingItems.count()).toBe(0);
});
it('an unavailable offline cohort does not pretend cached packing is a successful canonical answer', async () => {
  setForcedOffline(true);
  await offlineDb.packingItems.put(buildPackingItem({ id: 1, trip_id: 8 }));
  const failure = new Error('Canonical packing unavailable');
  stop = installPlannerReadPort(
    port(async () => {
      throw failure;
    })
  );
  await expect(packingRepo.list(8)).rejects.toBe(failure);
  expect(await offlineDb.packingItems.count()).toBe(1);
});
it.each(['privateEpoch', 'logout', 'replacement'] as const)('late success cannot cross %s', async (change) => {
  const pending = held<{ items: never[] }>();
  stop = installPlannerReadPort(port(() => pending.promise));
  const result = expect(packingRepo.list(8)).rejects.toMatchObject({ name: 'ReadSessionChanged' });
  if (change === 'privateEpoch') invalidateOfflineSession();
  if (change === 'logout') setAuthed(false);
  if (change === 'replacement') {
    stop();
    stop = installPlannerReadPort(port(async () => ({ items: [] })));
  }
  pending.resolve({ items: [] });
  await result;
  expect(await offlineDb.packingItems.count()).toBe(0);
});
it('a late canonical failure also stays with the original private session', async () => {
  const pending = held<{ items: never[] }>();
  stop = installPlannerReadPort(port(() => pending.promise));
  const result = expect(packingRepo.list(8)).rejects.toMatchObject({ name: 'ReadSessionChanged' });
  invalidateOfflineSession();
  pending.reject(new Error('Late transport failure'));
  await result;
  expect(await offlineDb.mutationQueue.count()).toBe(0);
});
it.each(['create', 'update', 'delete'] as const)(
  'raw %s stays refused before native cache or queue effects',
  async (method) => {
    stop = installPlannerReadPort(port(async () => ({ items: [] })));
    const work =
      method === 'create'
        ? packingRepo.create(8, { name: 'Must not save' })
        : method === 'update'
          ? packingRepo.update(8, 22, { checked: true })
          : packingRepo.delete(8, 22);
    await expect(work).rejects.toThrow('not cut over');
    expect(await offlineDb.packingItems.count()).toBe(0);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  }
);
