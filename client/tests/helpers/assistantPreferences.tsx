import { act, cleanup } from '@testing-library/react';
import Dexie from 'dexie';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { reopenAnonymous } from '../../src/db/offlineDb';
import { TranslationProvider } from '../../src/i18n/TranslationContext';
import { useAssistantStore } from '../../src/store/assistantStore';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useTripStore } from '../../src/store/tripStore';
import { setAuthed } from '../../src/sync/authGate';
import { waitForLogout } from '../../src/sync/logoutCoordinator';
import { mutationQueue } from '../../src/sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../src/sync/networkMode';
import { tripSyncManager } from '../../src/sync/tripSyncManager';
import { buildAssignment, buildDay, buildPlace, buildTrip, buildUser } from './factories';
import { server } from './msw/server';
import { resetOfflineTestDatabase } from './offlineDb';
import { resetAllStores } from './store';

vi.mock('../../src/sync/syncTriggers', () => ({ registerSyncTriggers: vi.fn(), unregisterSyncTriggers: vi.fn() }));
vi.mock('../../src/push/webPush', () => ({
  forgetPushDeviceOnLogout: vi.fn(async () => {}),
  resyncPushSubscription: vi.fn(async () => {}),
}));
const initialAssistant = useAssistantStore.getState();
const A = buildUser({ id: 1201, email: 'assistant-a@fixture.invalid' });
const B = buildUser({ id: 1202, email: 'assistant-b@fixture.invalid' });
const pending: Promise<unknown>[] = [],
  releases: (() => void)[] = [];
const toastMock = vi.hoisted(() => ({
  notifications: vi.fn((_message: string, _type: string, _duration?: number) => 1),
}));
export const notifications = toastMock.notifications;
vi.mock('../../src/components/shared/Toast', () => ({
  useToast: () => ({
    success: (message: string) => toastMock.notifications(message, 'success', undefined),
    error: (message: string) => toastMock.notifications(message, 'error', undefined),
    warning: (message: string) => toastMock.notifications(message, 'warning', undefined),
    info: (message: string) => toastMock.notifications(message, 'info', undefined),
  }),
}));
export const wrapper = ({ children }: { children: ReactNode }) => <TranslationProvider>{children}</TranslationProvider>;
export function deferred<T>(fallback: T) {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  releases.push(() => resolve(fallback));
  return { promise, resolve: (value: T = fallback) => resolve(value) };
}
export function observe<T>(promise: Promise<T>) {
  pending.push(promise);
  return promise;
}
async function login(user = A) {
  const sync = vi.spyOn(tripSyncManager, 'syncAll').mockResolvedValueOnce({ status: 'skipped', reason: 'offline' });
  await useAuthStore.getState().login(user.email, 'fixture-password');
  sync.mockRestore();
  setForcedOffline(false);
}
export function seed(tripId = 101) {
  const places = [
    buildPlace({ id: 201, trip_id: tripId, name: 'A', place_time: '10:00', end_time: '12:00' }),
    buildPlace({ id: 202, trip_id: tripId, name: 'B', place_time: '11:00', end_time: '12:30' }),
  ];
  const day = buildDay({ id: 70, trip_id: tripId, date: '2099-06-01', title: 'Museum day' });
  useTripStore.setState({
    trip: buildTrip({ id: tripId, start_date: '2099-06-01', end_date: '2099-06-01' }),
    days: [day],
    places,
    assignments: {
      '70': places.map((place, i) => buildAssignment({ id: i + 1, place_id: place.id, day_id: 70, place })),
    },
    reservations: [],
    dayNotes: {},
  });
  useSettingsStore.setState((s) => ({ isLoaded: true, settings: { ...s.settings, language: 'en' } }));
}
export function navigate() {
  useTripStore.getState().resetTrip();
  seed(102);
}
export async function switchAccount(same = false) {
  setForcedOffline(true);
  await useAuthStore.getState().logout();
  await login(same ? A : B);
  seed();
}
export function installPreferencesFixture() {
  beforeEach(async () => {
    await waitForLogout();
    await reopenAnonymous();
    await resetOfflineTestDatabase();
    resetAllStores();
    _resetNetworkMode();
    setAuthed(false);
    localStorage.clear();
    useAssistantStore.setState(initialAssistant, true);
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(mutationQueue, 'sendSoon').mockImplementation(() => {});
    server.use(
      http.post('/api/auth/login', async ({ request }) =>
        HttpResponse.json({ user: ((await request.json()) as { email: string }).email === B.email ? B : A })
      ),
      http.post('/api/auth/logout', () => HttpResponse.json({ success: true })),
      http.get('/api/settings', () => HttpResponse.json({ settings: {} })),
      http.put('/api/settings', () => HttpResponse.json({ success: true }))
    );
    await login();
    seed();
    notifications.mockClear();
  });
  afterEach(async () => {
    cleanup();
    for (const release of releases.splice(0)) release();
    await act(async () => {
      await Promise.allSettled(pending.splice(0));
    });
    await waitForLogout();
    await resetOfflineTestDatabase();
    await reopenAnonymous();
    await resetOfflineTestDatabase();
    await Dexie.delete('trek-offline-u1201');
    await Dexie.delete('trek-offline-u1202');
    setAuthed(false);
    useAssistantStore.setState(initialAssistant, true);
    vi.restoreAllMocks();
    expect(pending).toHaveLength(0);
  });
}
