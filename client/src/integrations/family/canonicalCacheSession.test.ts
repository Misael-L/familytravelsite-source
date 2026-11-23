import { waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  buildBudgetItem,
  buildDay,
  buildPackingItem,
  buildPlace,
  buildReservation,
  buildTodoItem,
  buildTrip,
  buildTripFile,
} from '../../../tests/helpers/factories';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import {
  accommodationsApi,
  budgetApi,
  categoriesApi,
  daysApi,
  filesApi,
  packingApi,
  placesApi,
  reservationsApi,
  tagsApi,
  todoApi,
  tripsApi,
} from '../../api/client';
import { offlineNoticeKey } from '../../components/Settings/useOfflineSettings';
import { currentOfflineDatabase, invalidateOfflineSession, offlineDb, type QueuedMutation } from '../../db/offlineDb';
import { accommodationRepo } from '../../repo/accommodationRepo';
import { budgetRepo } from '../../repo/budgetRepo';
import { dayRepo } from '../../repo/dayRepo';
import { fileRepo } from '../../repo/fileRepo';
import { packingRepo } from '../../repo/packingRepo';
import { placeRepo } from '../../repo/placeRepo';
import { reservationRepo } from '../../repo/reservationRepo';
import { todoRepo } from '../../repo/todoRepo';
import { tripRepo } from '../../repo/tripRepo';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { refreshCanonical } from '../../sync/canonicalCache';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { _resetOfflinePrefs, setTripOfflineEnabled } from '../../sync/offlinePrefs';
import { captureReadSession } from '../../sync/readSession';
import { tripSyncManager } from '../../sync/tripSyncManager';
import * as runtime from './runtime';
vi.mock('../../sync/tilePrefetcher', () => ({ prefetchTilesForTrip: vi.fn(async () => {}) }));
vi.mock('../../sync/placePrefetcher', () => ({ prefetchPlacesForTrip: vi.fn(async () => {}) }));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function queue(extra: Partial<QueuedMutation> = {}) {
  const row: QueuedMutation = {
    id: 'original-operation',
    tripId: 1,
    method: 'PUT',
    url: '/trips/1/places/10',
    body: { name: 'Local edit' },
    status: 'pending',
    createdAt: 1,
    attempts: 0,
    lastError: null,
    schemaVersion: 2,
    baseUpdatedAt: 'original-token',
    ...extra,
  };
  await offlineDb.mutationQueue.put(row);
  return row;
}
const resources = [
  {
    table: 'days',
    key: 'days',
    api: daysApi,
    repo: dayRepo,
    row: () => buildDay({ id: 10, trip_id: 1, title: 'Local day' }),
  },
  {
    table: 'places',
    key: 'places',
    api: placesApi,
    repo: placeRepo,
    row: () => buildPlace({ id: 10, trip_id: 1, name: 'Local place' }),
  },
  {
    table: 'packingItems',
    key: 'items',
    api: packingApi,
    repo: packingRepo,
    row: () => buildPackingItem({ id: 10, trip_id: 1 }),
  },
  { table: 'todoItems', key: 'items', api: todoApi, repo: todoRepo, row: () => buildTodoItem({ id: 10, trip_id: 1 }) },
  {
    table: 'budgetItems',
    key: 'items',
    api: budgetApi,
    repo: budgetRepo,
    row: () => buildBudgetItem({ id: 10, trip_id: 1 }),
  },
  {
    table: 'reservations',
    key: 'reservations',
    api: reservationsApi,
    repo: reservationRepo,
    row: () => buildReservation({ id: 10, trip_id: 1 }),
  },
  { table: 'tripFiles', key: 'files', api: filesApi, repo: fileRepo, row: () => buildTripFile({ id: 10, trip_id: 1 }) },
  {
    table: 'accommodations',
    key: 'accommodations',
    api: accommodationsApi,
    repo: accommodationRepo,
    row: () => ({ id: 10, trip_id: 1, notes: 'Local stay' }),
  },
] as const;
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  _resetNetworkMode();
  _resetOfflinePrefs();
  setAuthed(true);
  mutationQueue._resetFlushing();
  tripSyncManager._resetSyncing();
  vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(false);
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  vi.spyOn(tagsApi, 'list').mockResolvedValue({ tags: [] });
  vi.spyOn(categoriesApi, 'list').mockResolvedValue({ categories: [] });
});
afterEach(() => {
  setAuthed(false);
  vi.restoreAllMocks();
});

it.each(resources)(
  '$table returns retained rows, including creates and deletions, without rewriting the queue',
  async (resource) => {
    const row = await queue({ status: 'conflict' }),
      local = resource.row(),
      temp = { ...local, id: -11 };
    await offlineDb.table(resource.table).bulkPut([local, temp]);
    const remote = vi
      .spyOn(resource.api, 'list')
      .mockResolvedValue({ [resource.key]: [{ ...local, id: 99 }] } as never);
    const result = await resource.repo.list(1);
    expect(result).toEqual({ [resource.key]: [temp, local] });
    expect(remote).not.toHaveBeenCalled();
    expect(await offlineDb.table(resource.table).get(99)).toBeUndefined();
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
  }
);

it.each(['pending', 'syncing', 'failed', 'conflict', 'future'] as const)(
  'retains positive-ID local edits for %s work and permits fresh reads after resolution',
  async (status) => {
    const row = await queue(status === 'future' ? { schemaVersion: 100 } : { status });
    const local = buildPlace({ id: 10, trip_id: 1, name: 'Local edit' });
    await offlineDb.places.put(local);
    const remote = { ...local, name: 'Fresh canonical place' },
      request = vi.spyOn(placesApi, 'list').mockResolvedValue({ places: [remote] });
    expect(await placeRepo.list(1)).toEqual({ places: [local] });
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
    await offlineDb.mutationQueue.delete(row.id);
    expect(await placeRepo.list(1)).toEqual({ places: [remote] });
    expect(request).toHaveBeenCalledOnce();
    expect(await offlineDb.places.get(10)).toEqual(remote);
  }
);

it('allows an unrelated trip to refresh while the queued trip stays intact', async () => {
  const row = await queue();
  const remote = buildPlace({ id: 20, trip_id: 2 });
  vi.spyOn(placesApi, 'list').mockResolvedValue({ places: [remote] });
  expect(await placeRepo.list(2)).toEqual({ places: [remote] });
  expect(await offlineDb.places.get(20)).toEqual(remote);
  expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
});

it.each(['queued', 'cache-before-enqueue', 'delete'] as const)(
  'rejects an in-flight canonical read when another connection changes %s',
  async (mode) => {
    const local = buildPlace({ id: 10, trip_id: 1, name: 'Before' }),
      remote = { ...local, name: 'Stale server' };
    await offlineDb.places.put(local);
    const entered = deferred(),
      release = deferred();
    vi.spyOn(placesApi, 'list').mockImplementation(async () => {
      entered.resolve();
      await release.promise;
      return { places: [remote] };
    });
    const run = placeRepo.list(1);
    await entered.promise;
    const db = currentOfflineDatabase();
    if (mode === 'delete') await db.places.delete(10);
    else await db.places.put({ ...local, name: 'New local edit' });
    if (mode === 'queued') await queue();
    release.resolve();
    const expected = mode === 'delete' ? [] : [{ ...local, name: 'New local edit' }];
    expect(await run).toEqual({ places: expected });
    expect(await db.places.toArray()).toEqual(expected);
  }
);

it('serializes a cooperating flush behind a canonical read so queue acknowledgement cannot hide a concurrent edit', async () => {
  const entered = deferred(),
    release = deferred();
  const request = vi.spyOn(placesApi, 'list').mockImplementation(async () => {
    entered.resolve();
    await release.promise;
    return { places: [] };
  });
  const run = placeRepo.list(1);
  await entered.promise;
  const local = buildPlace({ id: 10, trip_id: 1, name: 'Concurrent edit' });
  await offlineDb.places.put(local);
  await queue({ schemaVersion: 100 });
  const lock = vi.spyOn(navigator.locks, 'request');
  const flush = mutationQueue.flush();
  await waitFor(() => expect(lock).toHaveBeenCalled());
  expect(await offlineDb.mutationQueue.count()).toBe(1);
  release.resolve();
  expect(await run).toEqual({ places: [local] });
  await flush;
  expect(request).toHaveBeenCalledOnce();
  expect(await offlineDb.places.get(10)).toEqual(local);
});

it('keeps a valid response after optional cache failure only when a fresh check proves the baseline unchanged', async () => {
  const session = captureReadSession(),
    cached = vi.fn(async () => 'local'),
    cache = vi.fn(async () => {
      throw new Error('Disk full');
    });
  expect(await refreshCanonical(session, 1, { fetch: async () => 'remote', cached, cache })).toEqual({
    value: 'remote',
    disposition: 'uncached',
  });
  expect(cached).not.toHaveBeenCalled();
});
it('fails closed if queued state cannot be inspected', async () => {
  const session = captureReadSession(),
    fetch = vi.fn(async () => 'remote');
  vi.spyOn(currentOfflineDatabase().mutationQueue, 'toArray').mockImplementation(() => {
    throw new Error('Unreadable queue');
  });
  await expect(
    refreshCanonical(session, 1, { fetch, cached: async () => 'local', cache: async () => {} })
  ).rejects.toThrow('Unreadable');
  expect(fetch).not.toHaveBeenCalled();
});
it('releases the read lock on session cancellation without writing the stale response', async () => {
  const entered = deferred(),
    release = deferred();
  vi.spyOn(placesApi, 'list').mockImplementation(async () => {
    entered.resolve();
    await release.promise;
    return { places: [] };
  });
  const run = placeRepo.list(1),
    rejected = expect(run).rejects.toThrow('session');
  await entered.promise;
  invalidateOfflineSession();
  release.resolve();
  await rejected;
  let enteredAgain = false;
  await navigator.locks.request(`trek-mutation-flush:${offlineDb.name}`, () => {
    enteredAgain = true;
  });
  expect(enteredAgain).toBe(true);
});
it('retains cache if forced offline changes during the server read', async () => {
  const local = buildPlace({ id: 10, trip_id: 1 });
  await offlineDb.places.put(local);
  vi.spyOn(placesApi, 'list').mockImplementation(async () => {
    setForcedOffline(true);
    return { places: [] };
  });
  expect(await placeRepo.list(1)).toEqual({ places: [local] });
  expect(await offlineDb.places.get(10)).toEqual(local);
});
it('keeps filtered-list upsert semantics when no local work is held', async () => {
  const local = buildPlace({ id: 10, trip_id: 1 }),
    remote = buildPlace({ id: 11, trip_id: 1 });
  await offlineDb.places.put(local);
  vi.spyOn(placesApi, 'list').mockResolvedValue({ places: [remote] });
  expect(await placeRepo.list(1, { q: 'filter' })).toEqual({ places: [remote] });
  expect(await offlineDb.places.get(10)).toEqual(local);
});
it('preserves the queued trip header on both detail and dashboard list reads', async () => {
  const local = buildTrip({ id: 1, title: 'Local title' });
  await offlineDb.trips.put(local);
  await queue({ resource: 'trips', url: '/trips/1' });
  const get = vi.spyOn(tripsApi, 'get').mockResolvedValue({ trip: { ...local, title: 'Stale title' } }),
    list = vi.spyOn(tripsApi, 'list').mockResolvedValue({ trips: [] });
  expect(await tripRepo.get(1)).toEqual({ trip: local });
  expect(await tripRepo.list()).toEqual({ trips: [local], archivedTrips: [] });
  expect(get).not.toHaveBeenCalled();
  expect(list).not.toHaveBeenCalled();
});

function serveBundles() {
  const one = buildTrip({ id: 1, title: 'Server one', end_date: null }),
    two = buildTrip({ id: 2, end_date: null });
  vi.spyOn(tripsApi, 'list').mockImplementation(async (params) => ({ trips: params?.archived ? [] : [one, two] }));
  const bundle = vi.spyOn(tripsApi, 'bundle').mockImplementation(async (id) => ({
    trip: Number(id) === 1 ? one : two,
    days: [],
    places: [],
    packingItems: [],
    todoItems: [],
    budgetItems: [],
    reservations: [],
    files: [],
    accommodations: [],
    members: [],
  }));
  return { one, two, bundle };
}
it.each(['syncAll', 'prepareForOffline'] as const)(
  '%s preserves all queued-trip tables, refreshes another trip and reports the held work',
  async (method) => {
    const { bundle, two } = serveBundles(),
      row = await queue(),
      local = buildTrip({ id: 1, title: 'Local trip' });
    await offlineDb.trips.put(local);
    const originals = resources.map((resource) => resource.row());
    for (const [index, resource] of resources.entries()) await offlineDb.table(resource.table).put(originals[index]);
    const progress = vi.fn();
    expect(await tripSyncManager[method](progress)).toEqual({ status: 'skipped', reason: 'local-changes' });
    expect(bundle).toHaveBeenCalledExactlyOnceWith(2);
    expect(await offlineDb.trips.get(2)).toEqual(two);
    expect(await offlineDb.trips.get(1)).toEqual(local);
    for (const [index, resource] of resources.entries())
      expect(await offlineDb.table(resource.table).get(10)).toEqual(originals[index]);
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
    expect(progress.mock.calls.some(([p]) => p.phase === 'done')).toBe(false);
    expect(offlineNoticeKey({ kind: 'skipped', reason: 'local-changes' })).toBe('settings.offline.notice.localChanges');
  }
);
it.each(['stale', 'disabled', 'gone'] as const)('automatic %s eviction preserves queued-trip rows', async (reason) => {
  const local = buildTrip({ id: 1, end_date: reason === 'stale' ? '2000-01-01' : null });
  await offlineDb.trips.put(local);
  await offlineDb.places.put(buildPlace({ id: 10, trip_id: 1 }));
  const row = await queue();
  if (reason === 'disabled') setTripOfflineEnabled(1, false);
  vi.spyOn(tripsApi, 'list').mockResolvedValue({ trips: reason === 'gone' ? [] : [local] });
  await tripSyncManager.syncAll();
  expect(await offlineDb.trips.get(1)).toEqual(local);
  expect(await offlineDb.places.get(10)).toBeDefined();
  expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
});
it('does not claim a successful offline preparation after a bundle failure', async () => {
  const { bundle } = serveBundles();
  bundle.mockRejectedValue(new Error('Server failed'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(await tripSyncManager.prepareForOffline()).toEqual({ status: 'skipped', reason: 'cache-error' });
});

const visible = [
  { key: 'places', repo: placeRepo, response: { places: [] }, run: () => useTripStore.getState().hydrateActiveTrip(1) },
  {
    key: 'packingItems',
    repo: packingRepo,
    response: { items: [] },
    run: () => useTripStore.getState().hydrateActiveTrip(1),
  },
  {
    key: 'todoItems',
    repo: todoRepo,
    response: { items: [] },
    run: () => useTripStore.getState().hydrateActiveTrip(1),
  },
  {
    key: 'budgetItems',
    repo: budgetRepo,
    response: { items: [] },
    run: () => useTripStore.getState().loadBudgetItems(1),
  },
  {
    key: 'reservations',
    repo: reservationRepo,
    response: { reservations: [] },
    run: () => useTripStore.getState().loadReservations(1),
  },
  { key: 'files', repo: fileRepo, response: { files: [] }, run: () => useTripStore.getState().loadFiles(1) },
] as const;
it.each(visible)('a delayed $key store read cannot replace a slice changed while awaiting it', async (resource) => {
  useTripStore.setState({ trip: buildTrip({ id: 1 }) });
  const entered = deferred(),
    release = deferred();
  vi.spyOn(dayRepo, 'list').mockResolvedValue({ days: [] });
  vi.spyOn(placeRepo, 'list').mockResolvedValue({ places: [] });
  vi.spyOn(packingRepo, 'list').mockResolvedValue({ items: [] });
  vi.spyOn(todoRepo, 'list').mockResolvedValue({ items: [] });
  vi.spyOn(budgetRepo, 'list').mockResolvedValue({ items: [] });
  vi.spyOn(reservationRepo, 'list').mockResolvedValue({ reservations: [] });
  vi.spyOn(fileRepo, 'list').mockResolvedValue({ files: [] });
  vi.spyOn(resource.repo, 'list').mockImplementation(async () => {
    entered.resolve();
    await release.promise;
    return resource.response as never;
  });
  const run = resource.run();
  await entered.promise;
  // New array identity is the store's observable revision, even for a local deletion to empty.
  const edited: [] = [];
  useTripStore.setState({ [resource.key]: edited });
  release.resolve();
  await run;
  expect(useTripStore.getState()[resource.key]).toBe(edited);
});
it.each(['days', 'assignments', 'dayNotes'] as const)(
  'a delayed day refresh preserves a changed %s slice',
  async (key) => {
    useTripStore.setState({ trip: buildTrip({ id: 1 }) });
    const entered = deferred(),
      release = deferred();
    vi.spyOn(dayRepo, 'list').mockImplementation(async () => {
      entered.resolve();
      await release.promise;
      return { days: [buildDay({ id: 1, trip_id: 1 })] };
    });
    const run = useTripStore.getState().refreshDays(1);
    await entered.promise;
    const edited = key === 'days' ? [] : {};
    useTripStore.setState({ [key]: edited });
    release.resolve();
    await run;
    expect(useTripStore.getState()[key]).toBe(edited);
  }
);

it('keeps concurrent day/place reads concurrent and commits each resource independently', async () => {
  const release = deferred(),
    dayEntered = deferred(),
    placeEntered = deferred();
  const day = buildDay({ id: 10, trip_id: 1 }),
    place = buildPlace({ id: 11, trip_id: 1 });
  vi.spyOn(daysApi, 'list').mockImplementation(async () => {
    dayEntered.resolve();
    await release.promise;
    return { days: [day] };
  });
  vi.spyOn(placesApi, 'list').mockImplementation(async () => {
    placeEntered.resolve();
    await release.promise;
    return { places: [place] };
  });
  const days = dayRepo.list(1),
    places = placeRepo.list(1);
  await Promise.all([dayEntered.promise, placeEntered.promise]);
  release.resolve();
  expect(await days).toEqual({ days: [day] });
  expect(await places).toEqual({ places: [place] });
  expect(await offlineDb.days.get(10)).toEqual(day);
  expect(await offlineDb.places.get(11)).toEqual(place);
});
it('refuses a Family canonical fetch without a usable cross-tab lock', async () => {
  vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true);
  Reflect.deleteProperty(navigator, 'locks');
  const request = vi.spyOn(placesApi, 'list');
  await expect(placeRepo.list(1)).rejects.toThrow('cross-tab queue lock');
  expect(request).not.toHaveBeenCalled();
});

it.each([undefined, '1'])(
  'retains the cache if a future command has unrecognized trip metadata (%s)',
  async (tripId) => {
    const local = buildPlace({ id: 10, trip_id: 1 });
    await offlineDb.places.put(local);
    const original = await queue({ tripId: tripId as never, schemaVersion: 100 });
    const request = vi.spyOn(placesApi, 'list').mockResolvedValue({ places: [] });
    expect(await placeRepo.list(1)).toEqual({ places: [local] });
    expect(request).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.get(original.id)).toEqual(original);
  }
);
