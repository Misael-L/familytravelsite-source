import { waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildBudgetItem,
  buildPackingItem,
  buildPlace,
  buildReservation,
  buildTodoItem,
  buildTrip,
  buildTripFile,
  buildUser,
} from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import { offlineDb, reopenAnonymous } from '../../db/offlineDb';
import { fileRepo } from '../../repo/fileRepo';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { waitForLogout } from '../../sync/logoutCoordinator';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { tripSyncManager } from '../../sync/tripSyncManager';
import { createFamilyAxiosAdapter } from './transport';
vi.mock('../../sync/syncTriggers', () => ({ registerSyncTriggers: vi.fn(), unregisterSyncTriggers: vi.fn() }));
vi.mock('../../push/webPush', () => ({
  forgetPushDeviceOnLogout: vi.fn(async () => {}),
  resyncPushSubscription: vi.fn(async () => {}),
}));
const notices = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../../store/notify', () => notices);
const originalAdapter = api.defaults.adapter;
const A = buildUser({ id: 1001, email: 'a@fixture.invalid' }),
  B = buildUser({ id: 1002, email: 'b@fixture.invalid' });
const trip = buildTrip({ id: 101, title: 'Original trip' }),
  current = buildTrip({ id: 102, title: 'Current trip' });
const oldPlace = buildPlace({ id: 1011, trip_id: 101, name: 'Original venue' }),
  ownPlace = buildPlace({ id: 1021, trip_id: 102, name: 'Current venue' });
const releases: (() => void)[] = [];
function deferred<T>(fallback: T) {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  releases.push(() => resolve(fallback));
  return { promise, resolve };
}
async function login(user = A) {
  const automatic = vi
    .spyOn(tripSyncManager, 'syncAll')
    .mockResolvedValueOnce({ status: 'skipped', reason: 'offline' });
  await useAuthStore.getState().login(user.email, 'fixture-password');
  automatic.mockRestore();
  setForcedOffline(false);
}
async function changeAccount(same = false) {
  setForcedOffline(true);
  await useAuthStore.getState().logout();
  await login(same ? A : B);
  useTripStore.setState({ trip: current, places: [ownPlace] });
  await offlineDb.places.put(ownPlace);
}
beforeEach(async () => {
  await waitForLogout();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  resetAllStores();
  _resetNetworkMode();
  setAuthed(false);
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  server.use(
    http.post('/api/auth/login', async ({ request }) =>
      HttpResponse.json({ user: ((await request.json()) as { email: string }).email === B.email ? B : A })
    ),
    http.post('/api/auth/logout', () => HttpResponse.json({ success: true })),
    http.get('/api/trips/101/days', () => HttpResponse.json({ days: [] })),
    http.get('/api/trips/101/reservations', () => HttpResponse.json({ reservations: [] }))
  );
  notices.notify.mockClear();
  await login();
  useTripStore.setState({ trip });
});
afterEach(async () => {
  api.defaults.adapter = originalAdapter;
  for (const release of releases.splice(0)) release();
  await waitForLogout();
  await resetOfflineTestDatabase();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  await Dexie.delete('trek-offline-u1001');
  await Dexie.delete('trek-offline-u1002');
  setAuthed(false);
  vi.restoreAllMocks();
});
describe('P04y direct native write and upload orchestration', () => {
  it.each([false, true])('a late place creation cannot reach the next session screen/cache (same=%s)', async (same) => {
    const response = deferred({ place: oldPlace });
    let requested = false;
    server.use(
      http.post('/api/trips/101/places', async () => {
        requested = true;
        return HttpResponse.json(await response.promise);
      })
    );
    const old = useTripStore
      .getState()
      .addPlace(101, { name: oldPlace.name })
      .catch((error) => error);
    await waitFor(() => expect(requested).toBe(true));
    await changeAccount(same);
    response.resolve({ place: oldPlace });
    await old;
    expect(useTripStore.getState().places).toEqual([ownPlace]);
    expect(await offlineDb.places.get(oldPlace.id)).toBeUndefined();
  });
  it('a completed update cannot replace a trip opened while the request was in flight', async () => {
    const response = deferred({ trip: { ...trip, title: 'Server saved name' } });
    let requested = false,
      followingReads = 0;
    server.use(
      http.put('/api/trips/101', async () => {
        requested = true;
        return HttpResponse.json(await response.promise);
      }),
      http.get('/api/trips/101/days', () => {
        followingReads++;
        return HttpResponse.json({ days: [] });
      })
    );
    const old = useTripStore
      .getState()
      .updateTrip(101, { title: 'Server saved name' })
      .catch((error) => error);
    await waitFor(() => expect(requested).toBe(true));
    useTripStore.getState().resetTrip();
    useTripStore.setState({ trip: current });
    response.resolve({ trip: { ...trip, title: 'Server saved name' } });
    await old;
    expect(useTripStore.getState().trip?.id).toBe(102);
    expect(followingReads).toBe(0);
  });
  it('a late multipart file upload cannot populate another account', async () => {
    const file = buildTripFile({ id: 1012, trip_id: 101 }),
      response = deferred({ file });
    let requested = false;
    server.use(
      http.post('/api/trips/101/files', async () => {
        requested = true;
        return HttpResponse.json(await response.promise);
      })
    );
    const body = new FormData();
    body.append('file', new File(['Private original bytes'], 'fixture.txt', { type: 'text/plain' }));
    const old = useTripStore
      .getState()
      .addFile(101, body)
      .catch((error) => error);
    await waitFor(() => expect(requested).toBe(true));
    await changeAccount();
    response.resolve({ file });
    await old;
    expect(useTripStore.getState().files).toEqual([]);
    expect(await offlineDb.tripFiles.count()).toBe(0);
  });
  it('an older delete response cannot remove a same-numbered row from the new account', async () => {
    const response = deferred({ success: true });
    let requested = false;
    server.use(
      http.delete('/api/trips/101/places/1011', async () => {
        requested = true;
        return HttpResponse.json(await response.promise);
      })
    );
    const old = useTripStore
      .getState()
      .deletePlace(101, 1011)
      .catch((error) => error);
    await waitFor(() => expect(requested).toBe(true));
    await changeAccount();
    const own = { ...ownPlace, id: 1011 };
    await offlineDb.places.put(own);
    useTripStore.setState({ places: [own] });
    response.resolve({ success: true });
    await old;
    expect(await offlineDb.places.get(1011)).toEqual(own);
    expect(useTripStore.getState().places).toEqual([own]);
  });
  it('a queue-decision wait cannot dispatch its old edit under the new account', async () => {
    const decision = deferred(false);
    vi.spyOn(mutationQueue, 'mustQueue').mockImplementationOnce(() => decision.promise);
    let sent = 0;
    server.use(
      http.put('/api/trips/101', () => {
        sent++;
        return HttpResponse.json({ trip });
      })
    );
    const old = useTripStore
      .getState()
      .updateTrip(101, { title: 'Original intent' })
      .catch((error) => error);
    await changeAccount();
    decision.resolve(false);
    await old;
    expect(sent).toBe(0);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('a late link lookup cannot launch deletion from the replacement account', async () => {
    const response = deferred({ links: [{ id: 55, reservation_id: 66 }] });
    let requested = false,
      deleted = 0;
    server.use(
      http.get('/api/trips/101/files/1012/links', async () => {
        requested = true;
        return HttpResponse.json(await response.promise);
      }),
      http.delete('/api/trips/101/files/1012/link/55', () => {
        deleted++;
        return HttpResponse.json({ success: true });
      })
    );
    const old = fileRepo.removeLinkTo(101, 1012, () => true).catch((error) => error);
    await waitFor(() => expect(requested).toBe(true));
    await changeAccount();
    response.resolve({ links: [{ id: 55, reservation_id: 66 }] });
    await old;
    expect(deleted).toBe(0);
  });
  it('healthy direct place creation still sends its original body and updates the native view/cache', async () => {
    let received: unknown;
    server.use(
      http.post('/api/trips/101/places', async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ place: oldPlace });
      })
    );
    const body = { name: oldPlace.name, notes: 'Exact original intent' };
    await useTripStore.getState().addPlace(101, body);
    expect(received).toEqual(body);
    expect(useTripStore.getState().places[0]).toEqual(oldPlace);
    await waitFor(async () => expect(await offlineDb.places.get(oldPlace.id)).toEqual(oldPlace));
  });
  it.each([
    {
      path: 'packing',
      table: 'packingItems',
      state: 'packingItems',
      payload: { item: buildPackingItem({ id: 1019, trip_id: 101 }) },
      run: () => useTripStore.getState().addPackingItem(101, { name: 'Original packing' }),
    },
    {
      path: 'todo',
      table: 'todoItems',
      state: 'todoItems',
      payload: { item: buildTodoItem({ id: 1019, trip_id: 101 }) },
      run: () => useTripStore.getState().addTodoItem(101, { name: 'Original task' }),
    },
    {
      path: 'budget',
      table: 'budgetItems',
      state: 'budgetItems',
      payload: { item: buildBudgetItem({ id: 1019, trip_id: 101 }) },
      run: () => useTripStore.getState().addBudgetItem(101, { name: 'Original expense' }),
    },
    {
      path: 'reservations',
      table: 'reservations',
      state: 'reservations',
      payload: { reservation: buildReservation({ id: 1019, trip_id: 101 }) },
      run: () => useTripStore.getState().addReservation(101, { title: 'Original booking' }),
    },
  ] as const)('a late $path write stays out of the new account', async (entry) => {
    const response = deferred(entry.payload);
    const replied = vi.fn();
    let requested = false;
    server.use(
      http.post('/api/trips/101/' + entry.path, async () => {
        requested = true;
        const body = await response.promise;
        replied(body);
        return HttpResponse.json(body);
      })
    );
    const old = entry.run().catch((error) => error);
    await waitFor(() => expect(requested).toBe(true));
    await changeAccount();
    expect(useAuthStore.getState().user?.id).toBe(B.id);
    expect(offlineDb.name).toBe(`trek-offline-u${B.id}`);
    const visibleBeforeReply = useTripStore.getState()[entry.state];
    const savedBeforeReply = await offlineDb[entry.table].toArray();
    expect(replied).not.toHaveBeenCalled();

    response.resolve(entry.payload);
    expect(await old).toMatchObject({ message: expect.stringContaining('The session changed') });
    expect(replied).toHaveBeenCalledExactlyOnceWith(entry.payload);
    expect(useTripStore.getState()[entry.state]).toBe(visibleBeforeReply);
    expect(await offlineDb[entry.table].toArray()).toEqual(savedBeforeReply);
  });
  it('a late optimistic failure cannot roll back or notify in the new account', async () => {
    const item = buildPackingItem({ id: 1019, trip_id: 101, checked: 0 });
    useTripStore.setState({ packingItems: [item] });
    const response = deferred(HttpResponse.json({ error: 'Fixture rejected' }, { status: 403 }));
    let requested = false;
    server.use(
      http.put('/api/trips/101/packing/1019', async () => {
        requested = true;
        return response.promise;
      })
    );
    const old = useTripStore.getState().togglePackingItem(101, 1019, true);
    await waitFor(() => expect(requested).toBe(true));
    await changeAccount();
    const own = { ...item, trip_id: 102, checked: 1 };
    useTripStore.setState({ packingItems: [own] });
    response.resolve(HttpResponse.json({ error: 'Fixture rejected' }, { status: 403 }));
    await old;
    expect(useTripStore.getState().packingItems).toEqual([own]);
    expect(notices.notify).not.toHaveBeenCalled();
  });
  it('a direct image upload cannot replace another account same-numbered place', async () => {
    const response = deferred({ place: { ...oldPlace, image_url: '/ordinary/original.jpg' } });
    let requested = false;
    server.use(
      http.post('/api/trips/101/places/1011/image', async () => {
        requested = true;
        return HttpResponse.json(await response.promise);
      })
    );
    const old = useTripStore
      .getState()
      .uploadPlaceImage(101, 1011, new File(['Original bytes'], 'fixture.jpg'))
      .catch((error) => error);
    await waitFor(() => expect(requested).toBe(true));
    await changeAccount();
    const own = { ...ownPlace, id: 1011 };
    useTripStore.setState({ places: [own] });
    response.resolve({ place: { ...oldPlace, image_url: '/ordinary/original.jpg' } });
    await old;
    expect(useTripStore.getState().places).toEqual([own]);
  });
  it('navigation only leaves a completed original-account write cached but does not publish it into the next trip', async () => {
    const response = deferred({ place: oldPlace });
    let requested = false;
    server.use(
      http.post('/api/trips/101/places', async () => {
        requested = true;
        return HttpResponse.json(await response.promise);
      })
    );
    const old = useTripStore
      .getState()
      .addPlace(101, { name: oldPlace.name })
      .catch((error) => error);
    await waitFor(() => expect(requested).toBe(true));
    useTripStore.getState().resetTrip();
    useTripStore.setState({ trip: current, places: [ownPlace] });
    response.resolve({ place: oldPlace });
    await old;
    expect(useTripStore.getState().places).toEqual([ownPlace]);
    expect((await offlineDb.places.get(oldPlace.id))?.trip_id).toBe(101);
  });
  it('an obsolete direct reply neither replays nor rewrites previously retained Family intent', async () => {
    const original = {
      id: crypto.randomUUID(),
      tripId: 101,
      method: 'POST' as const,
      url: '/trips/00000000-0000-4000-8000-000000000001/family/governance/commands',
      body: { unknown: ['Exact original intent'], operation_id: 'immutable-original' },
      baseUpdatedAt: 'Original token',
      status: 'conflict' as const,
      attempts: 3,
      createdAt: 1,
      lastError: 'Original unresolved result',
      schemaVersion: 2,
    };
    await offlineDb.mutationQueue.put(original);
    let calls = 0;
    const response = deferred({ place: oldPlace });
    server.use(
      http.post('/api/trips/101/places', async () => {
        calls++;
        return HttpResponse.json(await response.promise);
      })
    );
    const old = useTripStore
      .getState()
      .addPlace(101, { name: oldPlace.name })
      .catch((error) => error);
    await waitFor(() => expect(calls).toBe(1));
    await changeAccount();
    response.resolve({ place: oldPlace });
    await old;
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    await login(A);
    const saved = await offlineDb.mutationQueue.get(original.id);
    expect(saved).toMatchObject({
      id: original.id,
      body: original.body,
      baseUpdatedAt: original.baseUpdatedAt,
      attempts: 3,
      lastError: original.lastError,
      recoveryHold: { released: false },
    });
    expect(calls).toBe(1);
  });
  it('a current-account denied write still reports its real error and rolls back normally', async () => {
    const item = buildPackingItem({ id: 1019, trip_id: 101, checked: 0 });
    useTripStore.setState({ packingItems: [item] });
    server.use(
      http.put('/api/trips/101/packing/1019', () =>
        HttpResponse.json({ error: 'Fixture permission denied' }, { status: 403 })
      )
    );
    await useTripStore.getState().togglePackingItem(101, 1019, true);
    expect(useTripStore.getState().packingItems[0].checked).toBe(0);
    expect(notices.notify).toHaveBeenCalledOnce();
  });
  it('preserves the exact original write through the real Family Axios transport while rejecting its stale completion', async () => {
    const response = deferred({ place: oldPlace }),
      received: { method: string; path: string; body: unknown }[] = [];
    api.defaults.adapter = createFamilyAxiosAdapter(async (request) => {
      received.push({ method: request.method, path: request.pathname, body: request.body });
      return response.promise;
    });
    const body = { name: 'Exact original name', notes: 'Original notes', future_field: ['Preserve me'] };
    const old = useTripStore
      .getState()
      .addPlace(101, body)
      .catch((error) => error);
    await waitFor(() => expect(received).toHaveLength(1));
    api.defaults.adapter = originalAdapter;
    await changeAccount();
    response.resolve({ place: oldPlace });
    await old;
    expect(received).toEqual([{ method: 'POST', path: '/trips/101/places', body }]);
    expect(useTripStore.getState().places).toEqual([ownPlace]);
    expect(await offlineDb.places.get(oldPlace.id)).toBeUndefined();
  });
});
