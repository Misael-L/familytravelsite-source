import { waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDay, buildPlace, buildTrip, buildTripFile, buildUser } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { currentOfflineDatabase, offlineDb, reopenAnonymous, reopenForUser, type SyncMeta } from '../../db/offlineDb';
import { useAddonStore } from '../../store/addonStore';
import { useAuthStore } from '../../store/authStore';
import { isAuthed, setAuthed } from '../../sync/authGate';
import * as vectorPrefetch from '../../sync/glPrefetcher';
import { waitForLogout } from '../../sync/logoutCoordinator';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { _resetOfflinePrefs, setCacheTiles } from '../../sync/offlinePrefs';
import { prefetchPlacesForTrip } from '../../sync/placePrefetcher';
import { prefetchTilesForTrip } from '../../sync/tilePrefetcher';
import { tripSyncManager } from '../../sync/tripSyncManager';
import type { Trip } from '../../types';
vi.mock('../../sync/syncTriggers', () => ({ registerSyncTriggers: vi.fn(), unregisterSyncTriggers: vi.fn() }));
vi.mock('../../push/webPush', () => ({
  forgetPushDeviceOnLogout: vi.fn(async () => {}),
  resyncPushSubscription: vi.fn(async () => {}),
}));
const A = buildUser({ id: 801, email: 'a@fixture.invalid' }),
  B = buildUser({ id: 802, email: 'b@fixture.invalid' });
const trip = buildTrip({ id: 81, title: 'Original private trip', end_date: '2099-01-01' });
const places = [buildPlace({ id: 811, trip_id: trip.id, name: 'Original private place', lat: 19, lng: -98 })];
const replacementMapMeta: SyncMeta = {
  tripId: trip.id,
  lastSyncedAt: 2,
  status: 'idle',
  tilesBbox: null,
  filesCachedCount: 4,
};
const idle: IdleRequestCallback[] = [];
const releases: (() => void)[] = [];
function deferred<T>(fallback: T) {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  releases.push(() => resolve(fallback));
  return { promise, resolve };
}
function bundle(t: Trip = trip) {
  return {
    trip: t,
    days: [buildDay({ trip_id: t.id })],
    places,
    members: [],
    packingItems: [],
    todoItems: [],
    budgetItems: [],
    reservations: [],
    files: [],
    accommodations: [],
  };
}
function serveTrip() {
  server.use(
    http.get('/api/trips', ({ request }) =>
      HttpResponse.json({ trips: new URL(request.url).searchParams.has('archived') ? [] : [trip] })
    ),
    http.get('/api/trips/81/bundle', () => HttpResponse.json(bundle()))
  );
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
async function logout() {
  setForcedOffline(true);
  await useAuthStore.getState().logout();
  expect(isAuthed()).toBe(false);
}
async function changeAccount(target: 'other' | 'same' | 'anonymous' = 'other') {
  await logout();
  if (target !== 'anonymous') await login(target === 'same' ? A : B);
}
beforeEach(async () => {
  await waitForLogout();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  resetAllStores();
  tripSyncManager._resetSyncing();
  _resetNetworkMode();
  _resetOfflinePrefs();
  setCacheTiles(false);
  setAuthed(false);
  idle.length = 0;
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  vi.stubGlobal(
    'requestIdleCallback',
    vi.fn((fn: IdleRequestCallback) => {
      idle.push(fn);
      return idle.length;
    })
  );
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
  await login();
});
afterEach(async () => {
  for (const release of releases.splice(0)) release();
  await waitForLogout();
  await resetOfflineTestDatabase();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  await Dexie.delete('trek-offline-u801');
  await Dexie.delete('trek-offline-u802');
  setAuthed(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('P04w actual background sync across native logout/login', () => {
  for (const method of ['syncAll', 'prepareForOffline'] as const) {
    it.each(['other', 'same', 'anonymous'] as const)(
      `${method}: a late bundle stays out of the %s session`,
      async (target) => {
        serveTrip();
        const response = deferred(bundle());
        let requested = false;
        server.use(
          http.get('/api/trips/81/bundle', async () => {
            requested = true;
            return HttpResponse.json(await response.promise);
          })
        );
        const progress = vi.fn();
        const run = method === 'syncAll' ? tripSyncManager.syncAll() : tripSyncManager.prepareForOffline(progress);
        await waitFor(() => expect(requested).toBe(true));
        await changeAccount(target);
        response.resolve(bundle());
        expect(await run).toEqual({ status: 'skipped', reason: 'signed-out' });
        expect(await offlineDb.trips.count()).toBe(0);
        expect(await offlineDb.places.count()).toBe(0);
        expect(await offlineDb.days.count()).toBe(0);
        expect(progress.mock.calls.some(([p]) => p.phase === 'done')).toBe(false);
        if (target === 'other') {
          await reopenForUser(A.id);
          expect(await offlineDb.trips.count()).toBe(0);
        }
      }
    );
    it(`${method}: late old trip inventory cannot evict the new account's trip`, async () => {
      const response = deferred({ trips: [trip] });
      let requested = 0;
      server.use(
        http.get('/api/trips', async () => {
          requested++;
          return HttpResponse.json(await response.promise);
        })
      );
      const run = tripSyncManager[method]();
      await waitFor(() => expect(requested).toBe(2));
      await changeAccount();
      const own = buildTrip({ id: 82, title: 'New account private trip' });
      await offlineDb.trips.put(own);
      response.resolve({ trips: [trip] });
      expect(await run).toEqual({ status: 'skipped', reason: 'signed-out' });
      expect(await offlineDb.trips.get(82)).toEqual(own);
    });
  }
  it('late tags and categories cannot land in another authenticated account', async () => {
    const tags = deferred({ tags: [{ id: 88, name: 'Old private tag' }] }),
      categories = deferred({ categories: [{ id: 89, name: 'Old private category' }] });
    let requests = 0;
    server.use(
      http.get('/api/tags', async () => {
        requests++;
        return HttpResponse.json(await tags.promise);
      }),
      http.get('/api/categories', async () => {
        requests++;
        return HttpResponse.json(await categories.promise);
      })
    );
    await tripSyncManager.syncAll();
    await waitFor(() => expect(requests).toBe(2));
    await changeAccount();
    tags.resolve({ tags: [{ id: 88, name: 'Old private tag' }] });
    categories.resolve({ categories: [{ id: 89, name: 'Old private category' }] });
    // A following request is a deterministic barrier behind these Axios completions.
    await waitFor(() => expect(requests).toBe(2));
    await new Promise((r) => setTimeout(r, 25));
    expect(await offlineDb.tags.count()).toBe(0);
    expect(await offlineDb.categories.count()).toBe(0);
  });
  it('an old idle callback makes no area requests after a new sign-in', async () => {
    serveTrip();
    let areas = 0;
    server.use(
      http.get('/api/maps/area', () => {
        areas++;
        return HttpResponse.json({ results: [], truncated: false });
      })
    );
    await tripSyncManager.syncAll();
    expect(idle.length).toBe(1);
    await changeAccount();
    await offlineDb.places.bulkPut(places);
    await idle[0]({ didTimeout: false, timeRemaining: () => 20 });
    await new Promise((r) => setTimeout(r, 25));
    expect(areas).toBe(0);
    expect(await offlineDb.syncMeta.count()).toBe(0);
  });
  it('a late document body cannot repopulate read blobs after logout and re-login', async () => {
    serveTrip();
    const body = deferred(new Blob(['Old private document']));
    let fetching = false;
    const file = buildTripFile({
      id: 88,
      trip_id: 81,
      mime_type: 'application/pdf',
      url: '/api/trips/81/files/88/download',
    });
    server.use(http.get('/api/trips/81/bundle', () => HttpResponse.json({ ...bundle(), files: [file] })));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetching = true;
        return { ok: true, blob: () => body.promise };
      })
    );
    const run = tripSyncManager.prepareForOffline();
    await waitFor(() => expect(fetching).toBe(true));
    await changeAccount();
    body.resolve(new Blob(['Old private document']));
    expect(await run).toEqual({ status: 'skipped', reason: 'signed-out' });
    expect(await offlineDb.blobCache.count()).toBe(0);
    expect(await offlineDb.syncMeta.count()).toBe(0);
  });
  it.each(['other', 'same'] as const)('a directly requested area cannot enter the %s session', async (target) => {
    const area = deferred({
      results: [{ osm_id: 'old', name: 'Original place', lat: 19, lng: -98 }],
      truncated: false,
    });
    let requested = false;
    server.use(
      http.get('/api/maps/area', async () => {
        requested = true;
        return HttpResponse.json(await area.promise);
      })
    );
    const run = prefetchPlacesForTrip(81, places);
    await waitFor(() => expect(requested).toBe(true));
    await changeAccount(target);
    area.resolve({ results: [{ osm_id: 'old', name: 'Original place', lat: 19, lng: -98 }], truncated: false });
    await run;
    expect(await offlineDb.areaPlaces.count()).toBe(0);
    expect(await offlineDb.syncMeta.count()).toBe(0);
  });
  it('starts the new account sync while the prior account request is still pending', async () => {
    serveTrip();
    const response = deferred(bundle());
    let requested = false;
    server.use(
      http.get('/api/trips/81/bundle', async () => {
        requested = true;
        return HttpResponse.json(await response.promise);
      })
    );
    const old = tripSyncManager.syncAll();
    await waitFor(() => expect(requested).toBe(true));
    await changeAccount();
    server.use(http.get('/api/trips', () => HttpResponse.json({ trips: [] })));
    expect(await tripSyncManager.syncAll()).toEqual({ status: 'done', trips: 0 });
    response.resolve(bundle());
    await old;
  });
  it('same-session sync still caches its actual bundle and finishes', async () => {
    serveTrip();
    expect(await tripSyncManager.prepareForOffline()).toEqual({ status: 'done', trips: 1 });
    expect((await offlineDb.trips.get(81))?.title).toBe(trip.title);
    expect(await offlineDb.places.count()).toBe(1);
    expect(currentOfflineDatabase().name).toBe('trek-offline-u801');
    expect(useAddonStore.getState().isEnabled('tours')).toBe(false);
  });
  it('prepare waits for user metadata but refuses to publish old results after sign-in changes', async () => {
    const response = deferred({ tags: [{ id: 88, name: 'Original metadata' }] });
    let requested = false;
    server.use(
      http.get('/api/tags', async () => {
        requested = true;
        return HttpResponse.json(await response.promise);
      })
    );
    const progress = vi.fn(),
      run = tripSyncManager.prepareForOffline(progress);
    await waitFor(() => expect(requested).toBe(true));
    await changeAccount();
    response.resolve({ tags: [{ id: 88, name: 'Original metadata' }] });
    expect(await run).toEqual({ status: 'skipped', reason: 'signed-out' });
    expect(await offlineDb.tags.count()).toBe(0);
    expect(progress.mock.calls.some(([p]) => p.phase === 'done')).toBe(false);
  });
  it.each(['list', 'visits', 'detail'] as const)(
    'late optional tour %s does not cross account boundaries',
    async (stage) => {
      serveTrip();
      useAddonStore.setState({ addons: [{ id: 'tours', name: 'Fixture', type: 'trip', enabled: true, icon: '' }] });
      const tour = { place_id: 811, name: 'Private walk', tour_type: 'walk', has_waypoints: true };
      const payloads = {
        list: { tours: [tour] },
        visits: { visits: [{ assignment_id: 810, station_key: 'original', status: 'visited' }] },
        detail: { tour, waypoints: [{ lat: 19, lng: -98 }] },
      };
      const response = deferred(payloads[stage]);
      let requested = false;
      const delay = async (name: keyof typeof payloads) => {
        if (stage !== name) return HttpResponse.json(payloads[name]);
        requested = true;
        return HttpResponse.json(await response.promise);
      };
      server.use(
        http.get('/api/trips/81/tours', () => delay('list')),
        http.get('/api/trips/81/tour-visits', () => delay('visits')),
        http.get('/api/trips/81/tours/811', () => delay('detail'))
      );
      const run = tripSyncManager.prepareForOffline();
      await waitFor(() => expect(requested).toBe(true));
      await changeAccount();
      expect(currentOfflineDatabase().name).toBe(`trek-offline-u${B.id}`);
      response.resolve(payloads[stage]);
      expect(await run).toEqual({ status: 'skipped', reason: 'signed-out' });
      expect(await offlineDb.tours.count()).toBe(0);
      expect(await offlineDb.tourStationVisits.count()).toBe(0);
    }
  );
  it('late optional planner preferences cannot populate the returning same account', async () => {
    serveTrip();
    useAddonStore.setState({ addons: [{ id: 'roadtrip', name: 'Fixture', type: 'trip', enabled: true, icon: '' }] });
    const payload = { tripId: 81, preferences: { roadtrip_day_start: '08:00' } },
      response = deferred(payload);
    let requested = false;
    server.use(
      http.get('/api/trips/81/roadtrip/preferences', async () => {
        requested = true;
        return HttpResponse.json(await response.promise);
      })
    );
    const run = tripSyncManager.prepareForOffline();
    await waitFor(() => expect(requested).toBe(true));
    await changeAccount('same');
    response.resolve(payload);
    expect(await run).toEqual({ status: 'skipped', reason: 'signed-out' });
    expect(await offlineDb.roadtripPreferences.count()).toBe(0);
  });
  it('the old run finishing cannot release the newer account busy guard', async () => {
    serveTrip();
    const oldBody = deferred(bundle());
    let oldRequested = false;
    server.use(
      http.get('/api/trips/81/bundle', async () => {
        oldRequested = true;
        return HttpResponse.json(await oldBody.promise);
      })
    );
    const old = tripSyncManager.syncAll();
    await waitFor(() => expect(oldRequested).toBe(true));
    await changeAccount();
    const ownTrip = buildTrip({ id: 82, title: 'New account', end_date: '2099-01-01' }),
      ownBody = deferred(bundle(ownTrip));
    let ownRequested = false;
    server.use(
      http.get('/api/trips', ({ request }) =>
        HttpResponse.json({ trips: new URL(request.url).searchParams.has('archived') ? [] : [ownTrip] })
      ),
      http.get('/api/trips/82/bundle', async () => {
        ownRequested = true;
        return HttpResponse.json(await ownBody.promise);
      })
    );
    const own = tripSyncManager.prepareForOffline();
    await waitFor(() => expect(ownRequested).toBe(true));
    oldBody.resolve(bundle());
    await old;
    expect(await tripSyncManager.syncAll()).toEqual({ status: 'skipped', reason: 'busy' });
    ownBody.resolve(bundle(ownTrip));
    expect(await own).toEqual({ status: 'done', trips: 1 });
  });
  it('raster tile workers stop dispatching after the originating account ends', async () => {
    // 5.1.2 also warms the fallback vector styles before raster tiles. Keep that
    // prerequisite local; this case controls the raster response under test.
    vi.spyOn(vectorPrefetch, 'prefetchVectorForPlaces').mockResolvedValue({ tiles: 0, template: null });
    vi.spyOn(vectorPrefetch, 'prefetchStyleAssets').mockResolvedValue(null);
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { controller: {} },
      writable: true,
      configurable: true,
    });
    const tile = new Response(null, { status: 200 });
    const response = deferred(tile),
      fetcher = vi.fn(() => response.promise),
      localFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith('https://tiles.fixture.invalid/') ? fetcher() : localFetch(input, init)
    );
    await offlineDb.syncMeta.put({ tripId: 81, lastSyncedAt: 1, status: 'idle', tilesBbox: null, filesCachedCount: 0 });
    const run = prefetchTilesForTrip(81, places, 'https://tiles.fixture.invalid/{z}/{x}/{y}.png');
    await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThan(0));
    const count = fetcher.mock.calls.length;
    await changeAccount();
    expect(currentOfflineDatabase().name).toBe(`trek-offline-u${B.id}`);
    await offlineDb.syncMeta.put(replacementMapMeta);
    response.resolve(tile);
    await run;
    expect(fetcher).toHaveBeenCalledTimes(count);
    expect(await offlineDb.syncMeta.toArray()).toEqual([replacementMapMeta]);
  });
  it('a late vector prefetch cannot mark the new account as downloaded', async () => {
    const response = deferred({ tiles: 2, template: null }),
      vector = vi.spyOn(vectorPrefetch, 'prefetchVectorForPlaces').mockImplementation(() => response.promise);
    const style = vi.spyOn(vectorPrefetch, 'prefetchStyleAssets').mockResolvedValue(null);
    await offlineDb.syncMeta.put({ tripId: 81, lastSyncedAt: 1, status: 'idle', tilesBbox: null, filesCachedCount: 0 });
    const run = prefetchTilesForTrip(81, places, 'https://tiles.openfreemap.org/styles/positron');
    await waitFor(() => expect(vector).toHaveBeenCalledOnce());
    const cancelled = vector.mock.calls[0][2];
    await changeAccount();
    expect(currentOfflineDatabase().name).toBe(`trek-offline-u${B.id}`);
    await offlineDb.syncMeta.put(replacementMapMeta);
    expect(cancelled?.()).toBe(true);
    response.resolve({ tiles: 2, template: null });
    await run;
    expect(style).not.toHaveBeenCalled();
    expect(await offlineDb.syncMeta.toArray()).toEqual([replacementMapMeta]);
  });
});
