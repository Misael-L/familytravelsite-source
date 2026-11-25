import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildBudgetItem,
  buildPackingItem,
  buildReservation,
  buildTodoItem,
  buildTrip,
  buildTripFile,
} from '../../tests/helpers/factories';
import { resetOfflineTestDatabase } from '../../tests/helpers/offlineDb';
import { resetAllStores } from '../../tests/helpers/store';
import api from '../api/client';
import { offlineDb } from '../db/offlineDb';
import { useTripStore } from '../store/tripStore';
import { setAuthed } from '../sync/authGate';
import { mutationQueue } from '../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../sync/networkMode';
import { budgetRepo } from './budgetRepo';
import { fileRepo } from './fileRepo';
import { packingRepo } from './packingRepo';
import { installPlannerReadPort } from './plannerReadPort';
import { reservationRepo } from './reservationRepo';
import { todoRepo } from './todoRepo';

const id = 101,
  trip = 4,
  payment = { from_user_id: 1, to_user_id: 2, amount: 10 };
const writes: [string, () => Promise<unknown>][] = [
  ['packing.create', () => packingRepo.create(trip, { name: 'New bag item' })],
  ['packing.update', () => packingRepo.update(trip, id, { checked: true })],
  ['packing.delete', () => packingRepo.delete(trip, id)],
  ['todo.create', () => todoRepo.create(trip, { name: 'New task' })],
  ['todo.update', () => todoRepo.update(trip, id, { checked: true })],
  ['todo.delete', () => todoRepo.delete(trip, id)],
  ['todo.reorder', () => todoRepo.reorder(trip, [id])],
  ['budget.create', () => budgetRepo.create(trip, { name: 'New expense' })],
  ['budget.update', () => budgetRepo.update(trip, id, { name: 'Changed expense' })],
  ['budget.delete', () => budgetRepo.delete(trip, id)],
  ['budget.members', () => budgetRepo.setMembers(trip, id, [1, 2])],
  ['budget.paid', () => budgetRepo.togglePaid(trip, id, 1, true)],
  ['budget.order', () => budgetRepo.reorderItems(trip, [id])],
  ['budget.categories', () => budgetRepo.reorderCategories(trip, ['Food'])],
  ['budget.freezeRates', () => budgetRepo.freezeRates(trip, {})],
  ['budget.createSettlement', () => budgetRepo.createSettlement(trip, payment)],
  ['budget.updateSettlement', () => budgetRepo.updateSettlement(trip, id, payment)],
  ['budget.deleteSettlement', () => budgetRepo.deleteSettlement(trip, id)],
  ['file.upload', () => fileRepo.upload(trip, new FormData())],
  ['file.update', () => fileRepo.update(trip, id, { description: 'Changed file' })],
  ['file.star', () => fileRepo.toggleStar(trip, id)],
  ['file.trash', () => fileRepo.delete(trip, id)],
  ['file.restore', () => fileRepo.restore(trip, id, buildTripFile({ id, trip_id: trip }))],
  ['file.permanentDelete', () => fileRepo.permanentDelete(trip, id)],
  ['file.emptyTrash', () => fileRepo.emptyTrash(trip)],
  ['file.addLink', () => fileRepo.addLink(trip, id, { place_id: 10 })],
  ['file.removeLink', () => fileRepo.removeLinkTo(trip, id, () => true)],
  ['booking.create', () => reservationRepo.create(trip, { title: 'New booking' })],
  ['booking.update', () => reservationRepo.update(trip, id, { title: 'Changed booking' })],
  ['booking.delete', () => reservationRepo.delete(trip, id)],
  ['booking.travelers', () => reservationRepo.setTravelers(trip, id, [1, 2])],
  ['booking.positions', () => reservationRepo.updatePositions(trip, [{ id, day_plan_position: 2 }], 8)],
];
const modes = ['online', 'offline', 'parked-online', 'future-online'] as const;
let uninstall = () => {};
const originalAdapter = api.defaults.adapter;
const http = vi.fn(async () => {
  throw new Error('Unexpected raw HTTP');
});
async function snapshot() {
  return Promise.all(offlineDb.tables.map(async (table) => ({ name: table.name, rows: await table.toArray() })));
}
beforeEach(async () => {
  resetAllStores();
  _resetNetworkMode();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  mutationQueue._resetFlushing();
  await resetOfflineTestDatabase();
  await offlineDb.packingItems.put(buildPackingItem({ id, trip_id: trip }));
  await offlineDb.todoItems.put(buildTodoItem({ id, trip_id: trip }));
  await offlineDb.budgetItems.put(buildBudgetItem({ id, trip_id: trip, reservation_id: id }));
  await offlineDb.reservations.put(buildReservation({ id, trip_id: trip }));
  await offlineDb.tripFiles.put(buildTripFile({ id, trip_id: trip }));
  api.defaults.adapter = http;
  http.mockClear();
  uninstall = installPlannerReadPort({ places: async () => ({ places: [] }), days: async () => ({ days: [] }) });
});
afterEach(() => {
  uninstall();
  api.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
});

describe.each(modes)('P04as unsupported raw writers: %s', (mode) => {
  beforeEach(async () => {
    setForcedOffline(mode === 'offline');
    if (mode === 'parked-online' || mode === 'future-online') {
      await offlineDb.mutationQueue.add({
        id: 'retained-original',
        tripId: trip,
        method: 'PUT',
        url: `/trips/${trip}/files/${id}`,
        resource: 'tripFiles',
        entityId: id,
        body: { description: 'Keep my exact original intent', opaque: { retain: true } },
        createdAt: 7,
        attempts: 3,
        lastError: 'Retain me',
        status: 'conflict',
        schemaVersion: mode === 'future-online' ? 999 : 2,
      });
    }
  });
  it.each(writes)('%s refuses before HTTP, optimistic disk changes or queue handling', async (_name, write) => {
    const before = await snapshot();
    const mustQueue = vi.spyOn(mutationQueue, 'mustQueue');
    const enqueue = vi.spyOn(mutationQueue, 'enqueue');
    const flush = vi.spyOn(mutationQueue, 'flush');
    await expect(write()).rejects.toThrow('Native planner writes are not cut over; queued intent remains unchanged.');
    expect(http).not.toHaveBeenCalled();
    expect(mustQueue).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  });
});

it('P04as releasing the explicit rehearsal preserves the ordinary native offline create contract', async () => {
  uninstall();
  setForcedOffline(true);
  const { item } = await packingRepo.create(trip, { name: 'Ordinary native item' });
  expect(item.id).toBeLessThan(0);
  expect(await offlineDb.packingItems.get(item.id)).toEqual(item);
  expect(await offlineDb.mutationQueue.toArray()).toMatchObject([
    { url: '/trips/4/packing', body: { name: item.name }, tempId: item.id },
  ]);
  expect(http).not.toHaveBeenCalled();
});

it('P04as refusal rolls back native optimistic list and linked-cost deletion state', async () => {
  const rows = {
    packingItems: await offlineDb.packingItems.toArray(),
    todoItems: await offlineDb.todoItems.toArray(),
    budgetItems: await offlineDb.budgetItems.toArray(),
    reservations: await offlineDb.reservations.toArray(),
    files: await offlineDb.tripFiles.toArray(),
  };
  useTripStore.setState({ trip: buildTrip({ id: trip }), ...rows });
  setForcedOffline(true);
  const native = useTripStore.getState();
  await expect(native.deletePackingItem(trip, id)).rejects.toThrow('not cut over');
  await expect(native.deleteTodoItem(trip, id)).rejects.toThrow('not cut over');
  await expect(native.deleteBudgetItem(trip, id)).rejects.toThrow('not cut over');
  await expect(native.deleteReservation(trip, id)).rejects.toThrow('not cut over');
  await expect(native.deleteFile(trip, id)).rejects.toThrow('not cut over');
  for (const key of Object.keys(rows) as (keyof typeof rows)[]) expect(useTripStore.getState()[key]).toEqual(rows[key]);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
  expect(http).not.toHaveBeenCalled();
});
