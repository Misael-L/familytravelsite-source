import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { http, HttpResponse } from 'msw';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAssignment,
  buildDay,
  buildPlace,
  buildReservation,
  buildTrip,
  buildUser,
} from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import api, { mapsApi } from '../../api/client';
import { useDayDetail, writeStay } from '../../components/Planner/useDayDetail';
import { useTripStays } from '../../components/Planner/useTripStays';
import { offlineDb, reopenAnonymous } from '../../db/offlineDb';
import type { Translate } from '../../pages/tripPlanner/plannerTypes';
import { useBookingEdits } from '../../pages/tripPlanner/useBookingEdits';
import { accommodationRepo } from '../../repo/accommodationRepo';
import { installPlannerReadPort } from '../../repo/plannerReadPort';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { waitForLogout } from '../../sync/logoutCoordinator';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { tripSyncManager } from '../../sync/tripSyncManager';
import type { Accommodation } from '../../types';
import { createFamilyApplicationHandler } from './applicationHandler';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import * as runtime from './runtime';
import { createFamilyAxiosAdapter } from './transport';

vi.mock('../../sync/syncTriggers', () => ({ registerSyncTriggers: vi.fn(), unregisterSyncTriggers: vi.fn() }));
vi.mock('../../push/webPush', () => ({
  forgetPushDeviceOnLogout: vi.fn(async () => {}),
  resyncPushSubscription: vi.fn(async () => {}),
}));
const originalAdapter = api.defaults.adapter;
const A = buildUser({ id: 1201, email: 'stay-original@fixture.invalid' }),
  B = buildUser({ id: 1202, email: 'stay-replacement@fixture.invalid' });
const trip = buildTrip({ id: 101 }),
  otherTrip = buildTrip({ id: 102 });
const place = buildPlace({
  id: 301,
  trip_id: 101,
  name: 'Original hotel',
  image_url: '/storage/v1/object/public/catalog/variants/v1/original/thumb-fixture.webp',
});
const day = buildDay({ id: 70, trip_id: 101, day_number: 1 }),
  departure = buildDay({ id: 71, trip_id: 101, day_number: 2 });
const stay: Accommodation = {
  id: 801,
  trip_id: 101,
  place_id: place.id,
  start_day_id: 70,
  end_day_id: 71,
  confirmation: 'Original private confirmation',
  notes: 'Original private stay',
};
const ownStay: Accommodation = {
  ...stay,
  trip_id: 102,
  confirmation: 'Replacement confirmation',
  notes: 'Replacement stay',
};
const updated = { ...stay, confirmation: 'Saved confirmation' };
const body = {
  place_id: place.id,
  start_day_id: 70,
  end_day_id: 71,
  check_in: '15:00',
  check_in_end: null,
  check_out: '11:00',
  confirmation: 'Saved confirmation',
};
const visit = buildAssignment({ id: 501, day_id: 70, place_id: place.id, place });
const releases: (() => void)[] = [],
  pending: Promise<unknown>[] = [],
  disposers: (() => void)[] = [];
function deferred<T>(fallback: T) {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  releases.push(() => resolve(fallback));
  return { promise, resolve };
}
function observe(promise: Promise<unknown>) {
  const result = promise.catch((error) => error);
  pending.push(result);
  return result;
}
async function login(user = A) {
  const automatic = vi
    .spyOn(tripSyncManager, 'syncAll')
    .mockResolvedValueOnce({ status: 'skipped', reason: 'offline' });
  await useAuthStore.getState().login(user.email, 'fixture-password');
  automatic.mockRestore();
  setForcedOffline(false);
}
async function seed(replacement = false) {
  await offlineDb.accommodations.put(replacement ? ownStay : stay);
  await offlineDb.places.put(place);
  await offlineDb.days.bulkPut([day, departure]);
  useTripStore.setState({
    trip: replacement ? otherTrip : trip,
    days: [day, departure],
    assignments: {},
    places: [place],
    reservations: [],
  });
}
async function switchAccount(same = false) {
  api.defaults.adapter = originalAdapter;
  setForcedOffline(true);
  await useAuthStore.getState().logout();
  await login(same ? A : B);
  await seed(true);
}
function navigate() {
  useTripStore.getState().resetTrip();
  useTripStore.setState({ trip: otherTrip, days: [buildDay({ id: 99, trip_id: 102 })], assignments: {} });
}
async function assertOwnCache() {
  expect(await offlineDb.accommodations.toArray()).toEqual([ownStay]);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
}
function dayHook(tripId = 101, dayId = 70, changed = vi.fn()) {
  return {
    changed,
    ...renderHook(
      ({ tripId, dayId }) =>
        useDayDetail(dayId === 70 ? day : departure, [day, departure], tripId, null, null, 'en', changed),
      { initialProps: { tripId, dayId } }
    ),
  };
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
  vi.spyOn(mutationQueue, 'sendSoon').mockImplementation(() => {});
  server.use(
    http.post('/api/auth/login', async ({ request }) =>
      HttpResponse.json({ user: ((await request.json()) as { email: string }).email === B.email ? B : A })
    ),
    http.post('/api/auth/logout', () => HttpResponse.json({ success: true })),
    http.get('/api/trips/101/accommodations', () => HttpResponse.json({ accommodations: [stay] })),
    http.get('/api/trips/102/accommodations', () => HttpResponse.json({ accommodations: [ownStay] })),
    http.get('/api/trips/:trip/reservations', () => HttpResponse.json({ reservations: [] }))
  );
  await login();
  await seed();
});
afterEach(async () => {
  cleanup();
  for (const dispose of disposers.splice(0)) dispose();
  api.defaults.adapter = originalAdapter;
  for (const release of releases.splice(0)) release();
  await Promise.allSettled(pending.splice(0));
  await waitForLogout();
  await resetOfflineTestDatabase();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  await Dexie.delete('trek-offline-u1201');
  await Dexie.delete('trek-offline-u1202');
  setAuthed(false);
  vi.restoreAllMocks();
});

describe('P04af actual accommodation read/write/cache orchestration', () => {
  it.each([false, true])('a late list cannot replace another session cache (same user=%s)', async (same) => {
    const reply = deferred({ accommodations: [updated] });
    let requested = false;
    server.use(
      http.get('/api/trips/101/accommodations', async () => {
        requested = true;
        return HttpResponse.json(await reply.promise);
      })
    );
    const old = observe(accommodationRepo.list(101));
    await waitFor(() => expect(requested).toBe(true));
    await switchAccount(same);
    reply.resolve({ accommodations: [updated] });
    expect(await old).toBeInstanceOf(Error);
    await assertOwnCache();
  });
  it('a late network failure cannot fall back to the replacement account cache', async () => {
    const reply = deferred(HttpResponse.error());
    let requested = false;
    server.use(
      http.get('/api/trips/101/accommodations', async () => {
        requested = true;
        return reply.promise;
      })
    );
    const old = observe(accommodationRepo.list(101));
    await waitFor(() => expect(requested).toBe(true));
    await switchAccount();
    reply.resolve(HttpResponse.error());
    expect(await old).toBeInstanceOf(Error);
    await assertOwnCache();
  });
  it('a malformed list reply preserves known cached stays instead of treating absence as an authoritative empty list', async () => {
    server.use(http.get('/api/trips/101/accommodations', () => HttpResponse.json({})));
    expect(await accommodationRepo.list(101)).toEqual({});
    expect(await offlineDb.accommodations.get(stay.id)).toEqual(stay);
  });
  it.each([403, 500])('a genuine HTTP %s remains an error without replacing it with cached data', async (status) => {
    server.use(
      http.get('/api/trips/101/accommodations', () => HttpResponse.json({ error: 'Fixture denied' }, { status }))
    );
    await expect(accommodationRepo.list(101)).rejects.toThrow();
    expect(await offlineDb.accommodations.get(stay.id)).toEqual(stay);
  });
  const operations = [
    {
      name: 'create',
      method: 'POST',
      path: '/api/trips/101/accommodations',
      run: () => accommodationRepo.create(101, body),
    },
    {
      name: 'update',
      method: 'PUT',
      path: '/api/trips/101/accommodations/801',
      run: () => accommodationRepo.update(101, 801, { confirmation: 'Saved confirmation' }),
    },
    {
      name: 'delete',
      method: 'DELETE',
      path: '/api/trips/101/accommodations/801?keepStop=true',
      run: () => accommodationRepo.delete(101, 801, { keepStop: true }),
    },
  ];
  it.each(operations)('a late $name reply cannot write through to the replacement account', async (entry) => {
    const reply = deferred({ accommodation: updated, removedAssignments: [{ id: 501, dayId: 70 }] });
    let requested = false;
    server.use(
      http.all('/api/trips/101/accommodations*', async () => {
        requested = true;
        return HttpResponse.json(await reply.promise);
      })
    );
    const old = observe(entry.run());
    await waitFor(() => expect(requested).toBe(true));
    await switchAccount();
    reply.resolve({ accommodation: updated, removedAssignments: [{ id: 501, dayId: 70 }] });
    expect(await old).toBeInstanceOf(Error);
    await assertOwnCache();
  });
  it.each(operations.slice(1))(
    'a queue decision cannot send $name after the initiating account leaves',
    async (entry) => {
      const decision = deferred(false);
      vi.spyOn(mutationQueue, 'mustQueue').mockReturnValueOnce(decision.promise);
      let sent = 0;
      server.use(
        http.all('/api/trips/101/accommodations*', () => {
          sent++;
          return HttpResponse.json({ accommodation: updated });
        })
      );
      const old = observe(entry.run());
      await switchAccount();
      decision.resolve(false);
      expect(await old).toBeInstanceOf(Error);
      expect(sent).toBe(0);
      await assertOwnCache();
    }
  );
  it.each(['create', 'update'] as const)(
    'a pending cached-place lookup cannot continue the old %s in a new account',
    async (operation) => {
      setForcedOffline(true);
      const reply = deferred({ ...place, id: 302 });
      vi.spyOn(offlineDb.places, 'get').mockReturnValueOnce(Dexie.Promise.resolve(reply.promise));
      const old = observe(
        operation === 'create'
          ? accommodationRepo.create(101, { ...body, place_id: 302 })
          : accommodationRepo.update(101, stay.id, { place_id: 302 })
      );
      await waitFor(() => expect(offlineDb.places.get).toHaveBeenCalled());
      await switchAccount();
      reply.resolve({ ...place, id: 302 });
      expect(await old).toBeInstanceOf(Error);
      await assertOwnCache();
    }
  );
  it('a pending cached-stay read cannot queue a replacement-account update', async () => {
    setForcedOffline(true);
    const reply = deferred(stay);
    const table = offlineDb.accommodations;
    vi.spyOn(table, 'get').mockReturnValueOnce(Dexie.Promise.resolve(reply.promise));
    const old = observe(accommodationRepo.update(101, stay.id, { notes: 'Original intent' }));
    await waitFor(() => expect(table.get).toHaveBeenCalled());
    await switchAccount();
    reply.resolve(stay);
    expect(await old).toBeInstanceOf(Error);
    await assertOwnCache();
  });
  it.each(operations)(
    'an offline $name interrupted during enqueue rolls back both the mutation and cache',
    async (entry) => {
      setForcedOffline(true);
      const enqueue = mutationQueue.enqueue.bind(mutationQueue),
        before = await offlineDb.accommodations.toArray();
      vi.spyOn(mutationQueue, 'enqueue').mockImplementationOnce(async (row) => {
        const result = await enqueue(row);
        setAuthed(false);
        return result;
      });
      const result = await observe(entry.run());
      setAuthed(true);
      expect(result).toBeInstanceOf(Error);
      expect(await offlineDb.accommodations.toArray()).toEqual(before);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
  it.each(operations)(
    'an acknowledged online $name does not become a retryable failure only because the cache is unavailable',
    async (entry) => {
      server.use(http.all('/api/trips/101/accommodations*', () => HttpResponse.json({ accommodation: updated })));
      if (entry.name === 'delete')
        vi.spyOn(offlineDb.accommodations, 'delete').mockRejectedValueOnce(new Error('Fixture cache unavailable'));
      else vi.spyOn(offlineDb.accommodations, 'put').mockRejectedValueOnce(new Error('Fixture cache unavailable'));
      await expect(entry.run()).resolves.toBeDefined();
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
  it.each(['Family runtime', 'explicit planner cohort'])(
    '%s rejects unsupported native accommodation reads and writes before making empty-success cache changes',
    async (kind) => {
      if (kind === 'Family runtime') vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true);
      else
        disposers.push(
          installPlannerReadPort({ places: async () => ({ places: [] }), days: async () => ({ days: [] }) })
        );
      let sent = 0;
      server.use(
        http.all('/api/trips/101/accommodations*', () => {
          sent++;
          return HttpResponse.json({ accommodations: [], accommodation: updated });
        })
      );
      for (const run of [() => accommodationRepo.list(101), ...operations.map((op) => op.run)])
        await expect(run()).rejects.toThrow();
      setForcedOffline(true);
      for (const entry of operations) await expect(entry.run()).rejects.toThrow();
      expect(sent).toBe(0);
      expect(await offlineDb.accommodations.toArray()).toEqual([stay]);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
  it('refuses the legacy lodging endpoint without fabricating an empty list or touching retained stays', async () => {
    const uuid = (n: number) => `af000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const familySession: FamilySession = {
      userId: uuid(1),
      personId: uuid(2),
      familyId: uuid(3),
      user: { username: 'Fixture member', email: 'member@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
    };
    const handler = createFamilyApplicationHandler(new FamilyFrontendRepository(async () => familySession));
    await expect(
      handler({
        method: 'GET',
        pathname: `/trips/${uuid(4)}/accommodations`,
        query: new URLSearchParams(),
        body: undefined,
      })
    ).rejects.toMatchObject({ status: 503, code: 'family_stays_unavailable' });
    expect(await offlineDb.accommodations.toArray()).toEqual([stay]);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('healthy ordinary native transport keeps the exact stay payload, returned stops and original cache identity', async () => {
    const requests: unknown[] = [];
    api.defaults.adapter = createFamilyAxiosAdapter(async (request) => {
      requests.push({ method: request.method, path: request.pathname, body: request.body });
      return { accommodation: updated, assignment: visit };
    });
    await expect(writeStay(101, null, body)).resolves.toEqual({ accommodation: updated, assignment: visit });
    expect(requests).toEqual([{ method: 'POST', path: '/trips/101/accommodations', body }]);
    expect(await offlineDb.accommodations.get(801)).toEqual(updated);
    expect(useTripStore.getState().assignments['70'][0].id).toBe(501);
  });
  it('healthy offline create/edit/delete retain original payloads, temporary references, keepStop and existing retained commands', async () => {
    setForcedOffline(true);
    const retained = {
      id: crypto.randomUUID(),
      tripId: 101,
      method: 'POST' as const,
      url: '/trips/original/family/governance/commands',
      body: { original: 'untouched' },
      baseUpdatedAt: 'base',
      status: 'conflict' as const,
      attempts: 3,
      createdAt: 1,
      schemaVersion: 2,
      lastError: 'original',
    };
    await offlineDb.mutationQueue.put(retained);
    const result = await accommodationRepo.create(101, body);
    await accommodationRepo.update(101, result.accommodation.id, { notes: 'Late arrival' });
    await accommodationRepo.delete(101, result.accommodation.id, { keepStop: true });
    const rows = (await offlineDb.mutationQueue.toArray()).sort((a, b) => a.createdAt - b.createdAt);
    expect(rows[0]).toEqual(retained);
    expect(rows.slice(1)).toEqual([
      expect.objectContaining({ method: 'POST', body, tempId: result.accommodation.id }),
      expect.objectContaining({
        method: 'PUT',
        url: '/trips/101/accommodations/{id}',
        body: { notes: 'Late arrival' },
        tempEntityId: result.accommodation.id,
      }),
      expect.objectContaining({
        method: 'DELETE',
        url: '/trips/101/accommodations/{id}?keepStop=true',
        tempEntityId: result.accommodation.id,
      }),
    ]);
    expect(result.accommodation.place_image).toBe(place.image_url);
    expect(await offlineDb.accommodations.get(result.accommodation.id)).toBeUndefined();
  });
});

describe('P04af actual stay views and reservation-linked continuations', () => {
  it('a completed original-trip write cannot apply stay stops into the next visible trip', async () => {
    const reply = deferred({ accommodation: updated, assignment: visit });
    let requested = false;
    server.use(
      http.post('/api/trips/101/accommodations', async () => {
        requested = true;
        return HttpResponse.json(await reply.promise);
      })
    );
    const old = observe(writeStay(101, null, body));
    await waitFor(() => expect(requested).toBe(true));
    navigate();
    reply.resolve({ accommodation: updated, assignment: visit });
    expect(await old).toBeInstanceOf(Error);
    expect(useTripStore.getState().assignments).toEqual({});
  });
  it('a pending whole-trip stay read cannot publish after a route change even before the next read starts', async () => {
    const reply = deferred({ accommodations: [stay] });
    let requested = false;
    server.use(
      http.get('/api/trips/101/accommodations', async () => {
        requested = true;
        return HttpResponse.json(await reply.promise);
      })
    );
    const { result, rerender } = renderHook(({ id }) => useTripStays(id), { initialProps: { id: 101 } });
    act(() => result.current.loadAccommodations());
    await waitFor(() => expect(requested).toBe(true));
    act(navigate);
    rerender({ id: 102 });
    await act(async () => {
      reply.resolve({ accommodations: [stay] });
    });
    expect(result.current.tripAccommodations).toEqual([]);
  });
  it('already loaded private stays are hidden on an account change before a replacement response is available', async () => {
    const { result, rerender } = renderHook(() => useTripStays(101));
    act(() => result.current.loadAccommodations());
    await waitFor(() => expect(result.current.tripAccommodations).toEqual([stay]));
    await act(async () => {
      await switchAccount();
    });
    rerender();
    expect(result.current.tripAccommodations).toEqual([]);
  });
  it('an old loader callback cannot start a fresh request after its view unmounts', async () => {
    const { result, unmount } = renderHook(() => useTripStays(101));
    const old = result.current.loadAccommodations;
    unmount();
    let reads = 0;
    server.use(
      http.get('/api/trips/101/accommodations', () => {
        reads++;
        return HttpResponse.json({ accommodations: [stay] });
      })
    );
    await act(async () => old());
    expect(reads).toBe(0);
  });
  it('the day panel hides previously loaded private stay data and form fields after an account transition', async () => {
    const hook = dayHook();
    await waitFor(() => expect(hook.result.current.accommodation?.id).toBe(stay.id));
    act(() =>
      hook.result.current.setHotelForm({
        place_id: place.id,
        confirmation: 'Private typed confirmation',
        check_in: '15:00',
        check_in_end: '',
        check_out: '11:00',
      })
    );
    const blocked = deferred({ accommodations: [] as Accommodation[] });
    server.use(http.get('/api/trips/101/accommodations', () => blocked.promise.then(HttpResponse.json)));
    await act(async () => {
      await switchAccount();
    });
    hook.rerender({ tripId: 101, dayId: 70 });
    expect(hook.result.current.accommodation).toBeNull();
    expect(hook.result.current.accommodations).toEqual([]);
    expect(hook.result.current.hotelForm.confirmation).toBe('');
  });
  it.each(['create', 'update', 'field', 'remove'] as const)(
    'a pending day-panel %s cannot replace a new day editor or invoke its callback',
    async (kind) => {
      const hook = dayHook();
      await waitFor(() => expect(hook.result.current.accommodation?.id).toBe(stay.id));
      act(() =>
        hook.result.current.setHotelForm({
          place_id: place.id,
          confirmation: 'Saved confirmation',
          check_in: '15:00',
          check_in_end: '',
          check_out: '11:00',
        })
      );
      const reply = deferred({ accommodation: updated, assignment: visit });
      let writes = 0;
      server.use(
        http.all('/api/trips/101/accommodations*', async ({ request }) =>
          request.method === 'GET'
            ? HttpResponse.json({ accommodations: [stay] })
            : (writes++, HttpResponse.json(await reply.promise))
        )
      );
      let old!: Promise<unknown>;
      act(() => {
        old = observe(
          kind === 'create'
            ? hook.result.current.handleSaveAccommodation()
            : kind === 'update'
              ? hook.result.current.handleUpdateAccommodation()
              : kind === 'field'
                ? hook.result.current.updateAccommodationField('confirmation', 'Saved confirmation')
                : hook.result.current.handleRemoveAccommodation()
        );
      });
      await waitFor(() => expect(writes).toBe(1));
      hook.rerender({ tripId: 101, dayId: 71 });
      act(() => {
        hook.result.current.setHotelForm({
          place_id: place.id,
          confirmation: 'New day draft',
          check_in: '',
          check_in_end: '',
          check_out: '',
        });
        hook.result.current.setShowHotelPicker(true);
      });
      await act(async () => {
        reply.resolve({ accommodation: updated, assignment: visit });
        await old;
      });
      expect(hook.result.current.hotelForm.confirmation).toBe('New day draft');
      expect(hook.result.current.showHotelPicker).toBe(true);
      expect(hook.changed).not.toHaveBeenCalled();
    }
  );
  it('a late save cannot close or reset another stay picked on the same day', async () => {
    const hook = dayHook();
    await waitFor(() => expect(hook.result.current.accommodation?.id).toBe(stay.id));
    const reply = deferred({ accommodation: updated });
    let sent = false;
    server.use(
      http.put('/api/trips/101/accommodations/801', async () => {
        sent = true;
        return HttpResponse.json(await reply.promise);
      })
    );
    const old = observe(hook.result.current.handleUpdateAccommodation());
    await waitFor(() => expect(sent).toBe(true));
    act(() => {
      hook.result.current.setAccommodation({ ...stay, id: 802 });
      hook.result.current.setShowHotelPicker('edit');
      hook.result.current.setHotelForm({
        place_id: 302,
        confirmation: 'Different stay draft',
        check_in: '',
        check_in_end: '',
        check_out: '',
      });
    });
    await act(async () => {
      reply.resolve({ accommodation: updated });
      await old;
    });
    expect(hook.result.current.accommodation?.id).toBe(802);
    expect(hook.result.current.hotelForm.confirmation).toBe('Different stay draft');
    expect(hook.result.current.showHotelPicker).toBe('edit');
    expect(hook.changed).not.toHaveBeenCalled();
  });
  it('a completed save after unmount cannot invoke the old parent callback', async () => {
    const hook = dayHook();
    await waitFor(() => expect(hook.result.current.accommodation?.id).toBe(stay.id));
    const reply = deferred({ accommodation: updated });
    let sent = false;
    server.use(
      http.delete('/api/trips/101/accommodations/801', async () => {
        sent = true;
        return HttpResponse.json(await reply.promise);
      })
    );
    const old = observe(hook.result.current.handleRemoveAccommodation());
    await waitFor(() => expect(sent).toBe(true));
    hook.unmount();
    reply.resolve({ accommodation: updated });
    await old;
    expect(hook.changed).not.toHaveBeenCalled();
  });
  it('a retained old day callback cannot initiate a new save in the replacement day', async () => {
    const hook = dayHook();
    await waitFor(() => expect(hook.result.current.accommodation?.id).toBe(stay.id));
    act(() =>
      hook.result.current.setHotelForm({
        place_id: place.id,
        confirmation: 'Original day draft',
        check_in: '',
        check_in_end: '',
        check_out: '',
      })
    );
    const old = hook.result.current.handleSaveAccommodation;
    hook.rerender({ tripId: 101, dayId: 71 });
    let writes = 0;
    server.use(
      http.post('/api/trips/101/accommodations', () => {
        writes++;
        return HttpResponse.json({ accommodation: updated });
      })
    );
    await act(async () => {
      await observe(old());
    });
    expect(writes).toBe(0);
  });
  function bookingOptions() {
    return {
      tripId: 101,
      trip,
      tripActions: useTripStore.getState(),
      toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
      t: ((key: string) => key) as Translate,
      places: [place],
      selectedDayId: 70,
      canUploadFiles: true,
      setTripAccommodations: vi.fn(),
      editingReservation: null,
      setEditingReservation: vi.fn(),
      setShowReservationModal: vi.fn(),
      editingTransport: null,
      setEditingTransport: vi.fn(),
      setShowTransportModal: vi.fn(),
      setTransportModalDayId: vi.fn(),
    };
  }
  it('a late real booking write cannot launch a stay refresh or notify the replacement view', async () => {
    const options = bookingOptions(),
      reply = deferred({ reservation: buildReservation({ id: 901, trip_id: 101, type: 'hotel' }) });
    let sent = false,
      reads = 0;
    server.use(
      http.post('/api/trips/101/reservations', async () => {
        sent = true;
        return HttpResponse.json(await reply.promise);
      }),
      http.get('/api/trips/101/accommodations', () => {
        reads++;
        return HttpResponse.json({ accommodations: [stay] });
      })
    );
    const hook = renderHook((props) => useBookingEdits(props), { initialProps: options });
    const old = observe(hook.result.current.handleSaveReservation({ title: 'Original hotel', type: 'hotel' }));
    await waitFor(() => expect(sent).toBe(true));
    await act(async () => {
      await switchAccount();
    });
    hook.rerender({ ...options, tripId: 102, trip: otherTrip });
    reply.resolve({ reservation: buildReservation({ id: 901, trip_id: 101, type: 'hotel' }) });
    await old;
    expect(reads).toBe(0);
    expect(options.toast.success).not.toHaveBeenCalled();
    expect(options.toast.error).not.toHaveBeenCalled();
    expect(options.setShowReservationModal).not.toHaveBeenCalled();
    expect(options.setTripAccommodations).not.toHaveBeenCalled();
  });
  it('a post-booking stay response cannot call an old setter after same-account navigation', async () => {
    const options = bookingOptions(),
      reply = deferred({ accommodations: [stay] });
    let reads = 0;
    server.use(
      http.post('/api/trips/101/reservations', () =>
        HttpResponse.json({ reservation: buildReservation({ id: 901, trip_id: 101, type: 'hotel' }) })
      ),
      http.get('/api/trips/101/accommodations', async () => {
        reads++;
        return HttpResponse.json(await reply.promise);
      })
    );
    const hook = renderHook((props) => useBookingEdits(props), { initialProps: options });
    await act(async () => {
      await hook.result.current.handleSaveReservation({ title: 'Original hotel', type: 'hotel' });
    });
    await waitFor(() => expect(reads).toBe(1));
    act(navigate);
    hook.rerender({ ...options, tripId: 102, trip: otherTrip });
    await act(async () => {
      reply.resolve({ accommodations: [stay] });
    });
    expect(options.setTripAccommodations).not.toHaveBeenCalled();
  });
  it('StrictMode effect rehearsal keeps the current mounted stay reader usable', async () => {
    const hook = renderHook(() => useTripStays(101), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    });
    await act(async () => {
      await hook.result.current.loadAccommodations();
    });
    await waitFor(() => expect(hook.result.current.tripAccommodations).toEqual([stay]));
  });
  it('a retained booking callback cannot initiate a write after its view unmounts', async () => {
    const options = bookingOptions();
    const hook = renderHook(() => useBookingEdits(options));
    const old = hook.result.current.handleSaveReservation;
    hook.unmount();
    let writes = 0;
    server.use(
      http.post('/api/trips/101/reservations', () => {
        writes++;
        return HttpResponse.json({ reservation: buildReservation() });
      })
    );
    await old({ title: 'Obsolete booking', type: 'hotel' });
    expect(writes).toBe(0);
    expect(options.toast.error).not.toHaveBeenCalled();
  });
  it('an address save finishing after navigation cannot continue into a booking save', async () => {
    const options = bookingOptions(),
      reply = deferred(undefined);
    let started = false;
    options.tripActions = {
      ...options.tripActions,
      updatePlace: vi.fn(async () => {
        started = true;
        await reply.promise;
        return place;
      }),
    };
    let writes = 0;
    server.use(
      http.post('/api/trips/101/reservations', () => {
        writes++;
        return HttpResponse.json({ reservation: buildReservation() });
      })
    );
    const hook = renderHook((props) => useBookingEdits(props), { initialProps: options });
    const old = observe(
      hook.result.current.handleSaveReservation({
        title: 'Original hotel',
        type: 'hotel',
        create_accommodation: { place_id: place.id, address: 'New address' },
      } as never)
    );
    await waitFor(() => expect(started).toBe(true));
    act(navigate);
    hook.rerender({ ...options, tripId: 102, trip: otherTrip });
    reply.resolve(undefined);
    await old;
    expect(writes).toBe(0);
    expect(options.toast.success).not.toHaveBeenCalled();
    expect(options.toast.error).not.toHaveBeenCalled();
  });
  it('an imported stay search cannot issue fallback queries or create a place after navigation', async () => {
    const options = bookingOptions(),
      reply = deferred({ places: [] });
    let searches = 0;
    vi.spyOn(mapsApi, 'search').mockImplementation(async () => {
      searches++;
      return (await reply.promise) as never;
    });
    options.tripActions = { ...options.tripActions, addPlace: vi.fn(async () => place) };
    const hook = renderHook((props) => useBookingEdits(props), { initialProps: options });
    const old = observe(
      hook.result.current.handleSaveReservation({
        title: 'Unmatched hotel',
        type: 'hotel',
        create_accommodation: { venue: { name: 'Unmatched hotel', address: 'Unmatched street' } },
      } as never)
    );
    await waitFor(() => expect(searches).toBe(1));
    act(navigate);
    hook.rerender({ ...options, tripId: 102, trip: otherTrip });
    reply.resolve({ places: [] });
    await old;
    expect(searches).toBe(1);
    expect(options.tripActions.addPlace).not.toHaveBeenCalled();
    expect(options.toast.error).not.toHaveBeenCalled();
  });
  it('a stay stop batch stops if the first real store event navigates away', async () => {
    server.use(
      http.post('/api/trips/101/accommodations', () =>
        HttpResponse.json({ accommodation: updated, assignment: visit, updatedAssignments: [{ ...visit, id: 502 }] })
      )
    );
    const unsubscribe = useTripStore.subscribe((state) => {
      if (state.trip?.id === 101 && state.assignments['70']?.length) navigate();
    });
    try {
      expect(await observe(writeStay(101, null, body))).toBeInstanceOf(Error);
      expect(useTripStore.getState().trip?.id).toBe(102);
      expect(useTripStore.getState().assignments).toEqual({});
    } finally {
      unsubscribe();
    }
  });
});
