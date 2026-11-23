import { waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTrip, buildUser } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { reopenAnonymous } from '../../db/offlineDb';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { waitForLogout } from '../../sync/logoutCoordinator';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { registerSyncTriggers, unregisterSyncTriggers } from '../../sync/syncTriggers';
import { tripSyncManager } from '../../sync/tripSyncManager';
const wire = vi.hoisted(() => ({
  refetch: null as ((id: string) => void) | null,
  flush: null as (() => Promise<void>) | null,
}));
vi.mock('../../api/websocket', () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  getSocketId: () => null,
  reconnectNow: vi.fn(),
  setRefetchCallback: (f: typeof wire.refetch) => {
    wire.refetch = f;
  },
  setPreReconnectHook: (f: typeof wire.flush) => {
    wire.flush = f;
  },
  getActiveTrips: () => ['92'],
  addListener: vi.fn(),
  removeListener: vi.fn(),
}));
vi.mock('../../push/webPush', () => ({
  forgetPushDeviceOnLogout: vi.fn(async () => {}),
  resyncPushSubscription: vi.fn(async () => {}),
}));
const A = buildUser({ id: 911, email: 'a@fixture.invalid' }),
  B = buildUser({ id: 912, email: 'b@fixture.invalid' });
let release = () => {};
async function login(user = A) {
  const sync = vi.spyOn(tripSyncManager, 'syncAll').mockResolvedValueOnce({ status: 'skipped', reason: 'offline' });
  await useAuthStore.getState().login(user.email, 'fixture-password');
  sync.mockRestore();
}
async function change() {
  setForcedOffline(true);
  await useAuthStore.getState().logout();
  await login(B);
  setForcedOffline(false);
}
beforeEach(async () => {
  unregisterSyncTriggers();
  await waitForLogout();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  resetAllStores();
  _resetNetworkMode();
  setAuthed(false);
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  server.use(
    http.post('/api/auth/login', async ({ request }) =>
      HttpResponse.json({ user: ((await request.json()) as { email: string }).email === B.email ? B : A })
    ),
    http.post('/api/auth/logout', () => HttpResponse.json({ success: true })),
    http.get('/api/settings', () => HttpResponse.json({ settings: {} }))
  );
  await login();
  useSettingsStore.setState({ isLoaded: true });
});
afterEach(async () => {
  release();
  unregisterSyncTriggers();
  await waitForLogout();
  await resetOfflineTestDatabase();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  await Dexie.delete('trek-offline-u911');
  await Dexie.delete('trek-offline-u912');
  setAuthed(false);
  vi.restoreAllMocks();
});
function holdFlush() {
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return vi.spyOn(mutationQueue, 'flush').mockImplementation(() => promise);
}
async function settled() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}
describe('P04x actual online/reconnect registration lifecycle', () => {
  it('an online event waiting on an old flush cannot start sync or hydration for the next account', async () => {
    const flush = holdFlush();
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(flush).toHaveBeenCalled());
    await change();
    const sync = vi.spyOn(tripSyncManager, 'syncAll').mockResolvedValue({ status: 'done', trips: 0 }),
      hydrate = vi.spyOn(useTripStore.getState(), 'hydrateActiveTrip').mockResolvedValue();
    release();
    await settled();
    expect(sync).not.toHaveBeenCalled();
    expect(hydrate).not.toHaveBeenCalled();
  });
  it('unregister cancels an old pending continuation even without an account change', async () => {
    const flush = holdFlush();
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(flush).toHaveBeenCalled());
    unregisterSyncTriggers();
    registerSyncTriggers();
    const sync = vi.spyOn(tripSyncManager, 'syncAll').mockResolvedValue({ status: 'done', trips: 0 });
    release();
    await settled();
    expect(sync).not.toHaveBeenCalled();
  });
  it('cached callbacks from an earlier registration cannot hydrate or flush the next account', async () => {
    const oldRefetch = wire.refetch,
      oldFlush = wire.flush;
    await change();
    const hydrate = vi.spyOn(useTripStore.getState(), 'hydrateActiveTrip').mockResolvedValue(),
      flush = vi.spyOn(mutationQueue, 'flush').mockResolvedValue();
    oldRefetch?.('92');
    await oldFlush?.();
    expect(hydrate).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });
  it('the current registration still hydrates actual native stores through HTTP', async () => {
    useTripStore.setState({ trip: buildTrip({ id: 92 }) });
    server.use(
      http.get('/api/trips/92/days', () => HttpResponse.json({ days: [] })),
      http.get('/api/trips/92/places', () =>
        HttpResponse.json({ places: [{ id: 921, trip_id: 92, name: 'Current venue' }] })
      ),
      http.get('/api/trips/92/packing', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/92/todo', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/92/budget', () => HttpResponse.json({ items: [] })),
      http.get('/api/trips/92/reservations', () => HttpResponse.json({ reservations: [] })),
      http.get('/api/trips/92/files', () => HttpResponse.json({ files: [] }))
    );
    wire.refetch?.('92');
    await waitFor(() => expect(useTripStore.getState().places[0]?.name).toBe('Current venue'));
  });
  it('a direct account replacement invalidates callbacks without requiring a logout first', async () => {
    const previous = wire.refetch;
    await login(B);
    const hydrate = vi.spyOn(useTripStore.getState(), 'hydrateActiveTrip').mockResolvedValue();
    previous?.('92');
    expect(hydrate).not.toHaveBeenCalled();
  });
});
