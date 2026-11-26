import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { installPlannerReadPort, type PlannerReadPort } from '../../repo/plannerReadPort';
import { reservationRepo } from '../../repo/reservationRepo';
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
function port(reservations?: PlannerReadPort['reservations']) {
  return { reservations, places: async () => ({ places: [] }), days: async () => ({ days: [] }) };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}
it('the canonical reservation reader does not persist its projection in generic native caches', async () => {
  const rows = { reservations: [{ id: 12, trip_id: 8, title: 'Canonical booking' } as never] },
    read = vi.fn(async () => rows);
  stop = installPlannerReadPort(port(read));
  expect(await reservationRepo.list(8)).toBe(rows);
  expect(read).toHaveBeenCalledWith(8);
  expect(await offlineDb.reservations.count()).toBe(0);
});
it('an incomplete planner port cannot fall through to the native reservation API or cache', async () => {
  stop = installPlannerReadPort(port());
  await expect(reservationRepo.list(8)).rejects.toThrow('Canonical reservation reads are not connected');
  expect(await offlineDb.reservations.count()).toBe(0);
});
it('offline or unavailable canonical data never becomes a cached empty success', async () => {
  setForcedOffline(true);
  const failure = new Error('Canonical unavailable');
  stop = installPlannerReadPort(
    port(async () => {
      throw failure;
    })
  );
  await expect(reservationRepo.list(8)).rejects.toBe(failure);
  expect(await offlineDb.reservations.count()).toBe(0);
});
it.each(['privateEpoch', 'logout', 'replacement'] as const)(
  'late canonical success is retired on %s before a caller receives its rows',
  async (change) => {
    const held = deferred<{ reservations: never[] }>();
    stop = installPlannerReadPort(port(() => held.promise));
    const pending = reservationRepo.list(8),
      result = expect(pending).rejects.toMatchObject({ name: 'ReadSessionChanged' });
    if (change === 'privateEpoch') invalidateOfflineSession();
    if (change === 'logout') setAuthed(false);
    if (change === 'replacement') {
      stop();
      stop = installPlannerReadPort(port(async () => ({ reservations: [] })));
    }
    held.resolve({ reservations: [] });
    await result;
    expect(await offlineDb.reservations.count()).toBe(0);
  }
);
it('late canonical failure is also attributed to its original private session', async () => {
  const held = deferred<{ reservations: never[] }>();
  stop = installPlannerReadPort(port(() => held.promise));
  const pending = reservationRepo.list(8),
    result = expect(pending).rejects.toMatchObject({ name: 'ReadSessionChanged' });
  invalidateOfflineSession();
  held.reject(new Error('Late network failure'));
  await result;
  expect(await offlineDb.mutationQueue.count()).toBe(0);
});
