import { waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildBudgetItem,
  buildDay,
  buildPlace,
  buildReservation,
  buildTrip,
  buildTripFile,
  buildUser,
} from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import { currentOfflineDatabase, offlineDb, reopenAnonymous } from '../../db/offlineDb';
import { tripRepo } from '../../repo/tripRepo';
import { useAddonStore } from '../../store/addonStore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useTourVisitStore } from '../../store/tourVisitStore';
import { useTripStore } from '../../store/tripStore';
import { isAuthed, setAuthed } from '../../sync/authGate';
import { waitForLogout } from '../../sync/logoutCoordinator';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { _resetOfflinePrefs } from '../../sync/offlinePrefs';
import { ReadSessionChanged } from '../../sync/readSession';
import { tripSyncManager } from '../../sync/tripSyncManager';
import { readStartDestination } from '../../utils/startDestination';
import { createFamilyAxiosAdapter } from './transport';
vi.mock('../../sync/syncTriggers', () => ({ registerSyncTriggers: vi.fn(), unregisterSyncTriggers: vi.fn() }));
vi.mock('../../push/webPush', () => ({
  forgetPushDeviceOnLogout: vi.fn(async () => {}),
  resyncPushSubscription: vi.fn(async () => {}),
}));
const originalAdapter = api.defaults.adapter;
const A = buildUser({ id: 901, email: 'a@fixture.invalid' }),
  B = buildUser({ id: 902, email: 'b@fixture.invalid' });
const oldTrip = buildTrip({ id: 91, title: 'Original trip' }),
  nextTrip = buildTrip({ id: 92, title: 'Current trip' });
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
  expect(isAuthed()).toBe(true);
  setForcedOffline(false);
}
async function changeAccount(same = false) {
  setForcedOffline(true);
  await useAuthStore.getState().logout();
  await login(same ? A : B);
}
function serveTrip() {
  server.use(
    http.get('/api/trips/:id', ({ params }) =>
      HttpResponse.json({ trip: Number(params.id) === 91 ? oldTrip : nextTrip })
    ),
    http.get('/api/trips/:id/days', ({ params }) =>
      HttpResponse.json({ days: [buildDay({ id: Number(params.id) * 10, trip_id: Number(params.id) })] })
    ),
    http.get('/api/trips/:id/places', ({ params }) =>
      HttpResponse.json({
        places: [
          buildPlace({
            id: Number(params.id) * 10 + 1,
            trip_id: Number(params.id),
            name: 'Private venue ' + params.id,
          }),
        ],
      })
    ),
    http.get('/api/trips/:id/packing', () => HttpResponse.json({ items: [] })),
    http.get('/api/trips/:id/todo', () => HttpResponse.json({ items: [] })),
    http.get('/api/trips/:id/budget', () => HttpResponse.json({ items: [] })),
    http.get('/api/trips/:id/reservations', () => HttpResponse.json({ reservations: [] })),
    http.get('/api/trips/:id/files', () => HttpResponse.json({ files: [] }))
  );
}
beforeEach(async () => {
  await waitForLogout();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  resetAllStores();
  _resetNetworkMode();
  _resetOfflinePrefs();
  setAuthed(false);
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  server.use(
    http.post('/api/auth/login', async ({ request }) =>
      HttpResponse.json({ user: ((await request.json()) as { email: string }).email === B.email ? B : A })
    ),
    http.post('/api/auth/logout', () => HttpResponse.json({ success: true })),
    http.get('/api/trips', () => HttpResponse.json({ trips: [] })),
    http.get('/api/tags', () => HttpResponse.json({ tags: [] })),
    http.get('/api/categories', () => HttpResponse.json({ categories: [] }))
  );
  serveTrip();
  await login();
});
afterEach(async () => {
  api.defaults.adapter = originalAdapter;
  for (const release of releases.splice(0)) release();
  await waitForLogout();
  await resetOfflineTestDatabase();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  await Dexie.delete('trek-offline-u901');
  await Dexie.delete('trek-offline-u902');
  setAuthed(false);
  vi.restoreAllMocks();
});
describe('P04x real native startup and UI read consumers', () => {
  it.each([false, true])('late trip load cannot republish old rows after account change (same=%s)', async (same) => {
    const response = deferred({ trip: oldTrip });
    let requested = false;
    server.use(
      http.get('/api/trips/91', async () => {
        requested = true;
        return HttpResponse.json(await response.promise);
      })
    );
    const run = useTripStore.getState().loadTrip(91);
    await waitFor(() => expect(requested).toBe(true));
    await changeAccount(same);
    response.resolve({ trip: oldTrip });
    await run;
    expect(useTripStore.getState().trip).toBeNull();
    expect(useTripStore.getState().places).toEqual([]);
    expect(await offlineDb.trips.count()).toBe(0);
    expect(useTripStore.getState().error).toBeNull();
  });
  it('a slower previous trip cannot replace the trip the user opened afterwards', async () => {
    const response = deferred({ trip: oldTrip });
    let requested = false;
    server.use(
      http.get('/api/trips/91', async () => {
        requested = true;
        return HttpResponse.json(await response.promise);
      })
    );
    const old = useTripStore.getState().loadTrip(91);
    await waitFor(() => expect(requested).toBe(true));
    await useTripStore.getState().loadTrip(92);
    response.resolve({ trip: oldTrip });
    await old;
    expect(useTripStore.getState().trip?.id).toBe(92);
    expect(useTripStore.getState().places[0]?.trip_id).toBe(92);
  });
  it('a stale failure cannot overwrite the current trip error state', async () => {
    const response = deferred(HttpResponse.json({ error: 'Original failure' }, { status: 403 }));
    let requested = false;
    server.use(
      http.get('/api/trips/91', async () => {
        requested = true;
        return response.promise;
      })
    );
    const old = useTripStore
      .getState()
      .loadTrip(91)
      .catch((error) => error);
    await waitFor(() => expect(requested).toBe(true));
    await useTripStore.getState().loadTrip(92);
    response.resolve(HttpResponse.json({ error: 'Original failure' }, { status: 403 }));
    await old;
    expect(useTripStore.getState().trip?.id).toBe(92);
    expect(useTripStore.getState().error).toBeNull();
  });
  it.each(['places', 'days', 'budget', 'reservations', 'files'] as const)(
    'a late reconnect %s read cannot change the new account screen or cache',
    async (resource) => {
      await useTripStore.getState().loadTrip(91);
      const payloads = {
        places: { places: [buildPlace({ id: 999, trip_id: 91 })] },
        days: { days: [buildDay({ id: 999, trip_id: 91 })] },
        budget: { items: [buildBudgetItem({ id: 999, trip_id: 91 })] },
        reservations: { reservations: [buildReservation({ id: 999, trip_id: 91 })] },
        files: { files: [buildTripFile({ id: 999, trip_id: 91 })] },
      };
      const payload = payloads[resource];
      const response = deferred(payload);
      let requested = false;
      let sentBody: Promise<string> | undefined;
      server.use(
        http.get('/api/trips/91/' + resource, async () => {
          requested = true;
          const reply = HttpResponse.json(await response.promise);
          sentBody = reply.clone().text();
          return reply;
        })
      );
      const old = useTripStore.getState().hydrateActiveTrip(91);
      await waitFor(() => expect(requested).toBe(true));
      await changeAccount();
      await useTripStore.getState().loadTrip(92);
      const table =
        resource === 'budget'
          ? offlineDb.budgetItems
          : resource === 'files'
            ? offlineDb.tripFiles
            : offlineDb[resource];
      const currentRows = await table.toArray();

      response.resolve(payload);
      await old;

      expect(await sentBody).toBe(JSON.stringify(payload));
      expect(useTripStore.getState().trip?.id).toBe(92);
      expect(useTripStore.getState().places.map((p) => p.trip_id)).toEqual([92]);
      expect(useTripStore.getState().days.map((p) => p.trip_id)).toEqual([92]);
      expect(useTripStore.getState().budgetItems).toEqual([]);
      expect(useTripStore.getState().reservations).toEqual([]);
      expect(useTripStore.getState().files).toEqual([]);
      expect(await table.toArray()).toEqual(currentRows);
      expect(await table.get(999)).toBeUndefined();
    }
  );
  it('late settings cannot restore the signed-out account startup preference and language', async () => {
    const payload = {
        settings: {
          default_currency: 'MXN',
          start_page: 'active_trip',
          language: 'es',
          carto_api_key: 'old-fixture-key',
        },
      },
      response = deferred(payload);
    let requested = false;
    server.use(
      http.get('/api/settings', async () => {
        requested = true;
        return HttpResponse.json(await response.promise);
      })
    );
    const old = useSettingsStore.getState().loadSettings();
    await waitFor(() => expect(requested).toBe(true));
    await changeAccount();
    response.resolve(payload);
    await old;
    expect(useSettingsStore.getState().settings.default_currency).not.toBe('MXN');
    expect(useSettingsStore.getState().settings.carto_api_key).not.toBe('old-fixture-key');
    expect(readStartDestination()).toBeNull();
    expect(localStorage.getItem('app_language_server')).toBeNull();
  });
  it('already-loaded settings and feature metadata reset between accounts', async () => {
    server.use(
      http.get('/api/settings', () =>
        HttpResponse.json({ settings: { default_currency: 'MXN', carto_api_key: 'phase47fixturecartokey' } })
      ),
      http.get('/api/addons', () =>
        HttpResponse.json({ addons: [{ id: 'tours', enabled: true, type: 'trip', name: 'Private fixture', icon: '' }] })
      )
    );
    await useSettingsStore.getState().loadSettings();
    await useAddonStore.getState().loadAddons();
    await changeAccount();
    expect(useSettingsStore.getState().isLoaded).toBe(false);
    expect(useSettingsStore.getState().settings.carto_api_key).toBe('');
    expect(useAddonStore.getState().loaded).toBe(false);
    expect(useAddonStore.getState().isEnabled('tours')).toBe(false);
  });
  it('new account settings are not blocked by an old in-flight request or overwritten when it ends', async () => {
    const payload = { settings: { default_currency: 'MXN' } },
      response = deferred(payload);
    let requested = false;
    server.use(
      http.get('/api/settings', async () => {
        requested = true;
        return HttpResponse.json(await response.promise);
      })
    );
    const old = useSettingsStore.getState().loadSettings();
    await waitFor(() => expect(requested).toBe(true));
    await changeAccount();
    server.use(http.get('/api/settings', () => HttpResponse.json({ settings: { default_currency: 'EUR' } })));
    await useSettingsStore.getState().loadSettings();
    response.resolve(payload);
    await old;
    expect(useSettingsStore.getState().settings.default_currency).toBe('EUR');
  });
  it('dashboard inventory reads cannot cache the old account after re-login', async () => {
    const response = deferred({ trips: [oldTrip] });
    let requested = 0;
    server.use(
      http.get('/api/trips', async () => {
        requested++;
        return HttpResponse.json(await response.promise);
      })
    );
    const old = tripRepo.list().catch((error) => error);
    await waitFor(() => expect(requested).toBe(2));
    await changeAccount();
    response.resolve({ trips: [oldTrip] });
    await old;
    expect(await offlineDb.trips.count()).toBe(0);
  });
  it('healthy native trip loading still publishes the complete response and cache', async () => {
    await useTripStore.getState().loadTrip(91);
    expect(useTripStore.getState().trip?.id).toBe(91);
    expect(useTripStore.getState().places).toHaveLength(1);
    expect(useTripStore.getState().days).toHaveLength(1);
    expect((await offlineDb.trips.get(91))?.id).toBe(91);
  });
  it('a cancelled network read cannot fall back to the new account cache', async () => {
    const response = deferred(HttpResponse.error());
    let requested = false;
    server.use(
      http.get('/api/trips/91', async () => {
        requested = true;
        return response.promise;
      })
    );
    const old = tripRepo.get(91).catch((error) => error);
    await waitFor(() => expect(requested).toBe(true));
    await changeAccount();
    await offlineDb.trips.put({ ...oldTrip, title: 'New account cache only' });
    response.resolve(HttpResponse.error());
    expect(await old).toBeInstanceOf(ReadSessionChanged);
    expect((await offlineDb.trips.get(91))?.title).toBe('New account cache only');
  });
  it('an optional cache quota error does not discard a valid server trip', async () => {
    vi.spyOn(currentOfflineDatabase().trips, 'put').mockRejectedValueOnce(new Error('Fixture storage full'));
    await useTripStore.getState().loadTrip(91);
    expect(useTripStore.getState().trip?.id).toBe(91);
    expect(useTripStore.getState().error).toBeNull();
  });
  it('late addon metadata cannot re-enable the previous account features', async () => {
    const payload = { addons: [{ id: 'tours', enabled: true, type: 'trip', name: 'Old metadata', icon: '' }] },
      response = deferred(payload);
    let requested = false;
    server.use(
      http.get('/api/addons', async () => {
        requested = true;
        return HttpResponse.json(await response.promise);
      })
    );
    const old = useAddonStore.getState().loadAddons();
    await waitFor(() => expect(requested).toBe(true));
    await changeAccount();
    response.resolve(payload);
    await old;
    expect(useAddonStore.getState().loaded).toBe(false);
    expect(useAddonStore.getState().isEnabled('tours')).toBe(false);
  });
  it('an old optional visit read cannot refill the next account store or cache', async () => {
    const payload = { visits: [{ assignment_id: 991, station_key: 'original', status: 'visited' }] },
      response = deferred(payload);
    let requested = false;
    server.use(
      http.get('/api/trips/91/tour-visits', async () => {
        requested = true;
        return HttpResponse.json(await response.promise);
      })
    );
    const old = useTourVisitStore
      .getState()
      .load(91)
      .catch((error) => error);
    await waitFor(() => expect(requested).toBe(true));
    await changeAccount();
    response.resolve(payload);
    await old;
    expect(useTourVisitStore.getState().tripId).toBeNull();
    expect(useTourVisitStore.getState().byAssignment).toEqual({});
    expect(await offlineDb.tourStationVisits.count()).toBe(0);
  });
  it('native read consumers also reject stale results through the actual Family Axios adapter', async () => {
    const response = deferred({ trip: oldTrip });
    let requested = false;
    api.defaults.adapter = createFamilyAxiosAdapter(async (request) => {
      if (request.pathname === '/trips/91') {
        requested = true;
        return response.promise;
      }
      if (request.pathname.endsWith('/days')) return { days: [] };
      if (request.pathname.endsWith('/places')) return { places: [] };
      if (request.pathname.endsWith('/reservations')) return { reservations: [] };
      if (request.pathname.endsWith('/files')) return { files: [] };
      if (request.pathname === '/tags') return { tags: [] };
      if (request.pathname === '/categories') return { categories: [] };
      return { items: [] };
    });
    const old = useTripStore.getState().loadTrip(91);
    await waitFor(() => expect(requested).toBe(true));
    api.defaults.adapter = originalAdapter;
    await changeAccount();
    response.resolve({ trip: oldTrip });
    await old;
    expect(useTripStore.getState().trip).toBeNull();
    expect(await offlineDb.trips.count()).toBe(0);
  });
  it('logout and new-account login still complete if the device language storage read is denied', async () => {
    const get = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      if (key === 'app_language') throw new Error('Fixture storage unavailable');
      return get.call(this, key);
    });
    await changeAccount();
    expect(useAuthStore.getState().user?.id).toBe(B.id);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useSettingsStore.getState().isLoaded).toBe(false);
  });
  it('an old settings completion cannot release the newer account in-flight load', async () => {
    const first = deferred({ settings: { default_currency: 'MXN' } });
    let oldRequested = false;
    server.use(
      http.get('/api/settings', async () => {
        oldRequested = true;
        return HttpResponse.json(await first.promise);
      })
    );
    const old = useSettingsStore.getState().loadSettings();
    await waitFor(() => expect(oldRequested).toBe(true));
    await changeAccount();
    const second = deferred({ settings: { default_currency: 'EUR' } });
    let currentRequests = 0;
    server.use(
      http.get('/api/settings', async () => {
        currentRequests++;
        return HttpResponse.json(await second.promise);
      })
    );
    const next = useSettingsStore.getState().loadSettings();
    await waitFor(() => expect(currentRequests).toBe(1));
    first.resolve({ settings: { default_currency: 'MXN' } });
    await old;
    const repeat = useSettingsStore.getState().loadSettings();
    expect(currentRequests).toBe(1);
    second.resolve({ settings: { default_currency: 'EUR' } });
    await Promise.all([next, repeat]);
    expect(currentRequests).toBe(1);
    expect(useSettingsStore.getState().settings.default_currency).toBe('EUR');
  });
});
