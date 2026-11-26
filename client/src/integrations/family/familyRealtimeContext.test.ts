import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { apiClient } from '../../api/client';
import type { FrontendRealtimeDriver } from '../../api/websocket';
import { useAuthStore as nativeAuth } from '../../store/authStore';
import { useInAppNotificationStore as inbox } from '../../store/inAppNotificationStore';
import { useTripStore } from '../../store/tripStore';
import { installFamilyFrontend } from './bootstrap';
import { familyAuthStore, familyFrontend } from './repository';
const wire = vi.hoisted(() => ({
  driver: null as FrontendRealtimeDriver | null,
  start: vi.fn(),
  bind: vi.fn(),
  stop: vi.fn(),
  event: null as ((event: string, session: unknown) => void) | null,
  unsubscribe: vi.fn(),
}));
vi.mock('../../api/websocket', async (original) => ({
  ...(await original<typeof import('../../api/websocket')>()),
  installRealtimeDriver: (driver: FrontendRealtimeDriver) => {
    wire.driver = driver;
  },
}));
vi.mock('./legacy/data/supabase/familyRealtime', () => ({
  familyRealtime: { startSession: wire.start, bindItinerary: wire.bind, stopAll: wire.stop },
}));
vi.mock('./legacy/data/supabase/auth', async (original) => ({
  ...(await original<typeof import('./legacy/data/supabase/auth')>()),
  onSupabaseAuthStateChange: (callback: typeof wire.event) => {
    wire.event = callback;
    return { data: { subscription: { unsubscribe: wire.unsubscribe } } };
  },
}));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const initial = familyAuthStore.getState(),
  fetcher = window.fetch,
  adapter = apiClient.defaults.adapter;
let dispose: (() => void) | void;
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function driver() {
  if (!wire.driver) throw new Error('Missing installed realtime driver');
  return wire.driver;
}
beforeEach(() => {
  vi.stubEnv('VITE_DATA_PLANE', 'supabase');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fixture.invalid');
  familyFrontend.clear();
  familyAuthStore.setState({
    isAuthenticated: true,
    authGate: 'ok',
    authUserId: id(1),
    personId: id(2),
    familyId: id(3),
    user: buildUser(),
    loadUser: async () => {},
  });
  wire.start.mockClear();
  wire.bind.mockClear();
  wire.stop.mockClear();
  wire.driver = null;
  vi.spyOn(nativeAuth.getState(), 'loadUser').mockResolvedValue();
  vi.spyOn(inbox.getState(), 'fetchUnreadCount').mockResolvedValue();
  vi.spyOn(inbox.getState(), 'fetchNotifications').mockResolvedValue();
  dispose = installFamilyFrontend();
});
afterEach(() => {
  if (dispose) dispose();
  familyFrontend.clear();
  familyAuthStore.setState(initial, true);
  window.fetch = fetcher;
  apiClient.defaults.adapter = adapter;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Default Family bootstrap and realtime bridge with fake channels', () => {
  it.each(['leave', 'disconnect', 'person'])('does not attach an old pending join after %s', async (kind) => {
    const wait = deferred<string>();
    vi.spyOn(familyFrontend, 'tripUuid').mockReturnValueOnce(wait.promise);
    const pending = driver().joinTrip('first');
    if (kind === 'leave') driver().leaveTrip('first');
    else if (kind === 'disconnect') driver().disconnect();
    else familyAuthStore.setState({ personId: id(80) });
    wire.bind.mockClear();
    wait.resolve(id(10));
    await pending;
    expect(wire.bind).not.toHaveBeenCalled();
  });
  it('keeps a newer join when the older resolver finishes last', async () => {
    const wait = deferred<string>();
    vi.spyOn(familyFrontend, 'tripUuid').mockReturnValueOnce(wait.promise).mockResolvedValueOnce(id(11));
    const pending = driver().joinTrip('first');
    await driver().joinTrip('second');
    wait.resolve(id(10));
    await pending;
    expect(wire.bind.mock.calls.filter(([value]) => value)).toHaveLength(1);
    expect(wire.bind.mock.calls.slice(-1)[0]?.[0].tripId).toBe(id(11));
  });
  it('ignores old itinerary callbacks after another trip joins', async () => {
    vi.spyOn(familyFrontend, 'tripUuid').mockResolvedValueOnce(id(10)).mockResolvedValueOnce(id(11));
    driver().refetch = vi.fn();
    await driver().joinTrip('first');
    const old = wire.bind.mock.calls.slice(-1)[0]?.[0].onChange;
    await driver().joinTrip('second');
    const invalidate = vi.spyOn(familyFrontend, 'invalidate');
    old();
    expect(invalidate).not.toHaveBeenCalled();
    expect(driver().refetch).not.toHaveBeenCalled();
  });
  it('stops old notification callbacks on a same-user person switch', () => {
    driver().connect();
    const old = wire.start.mock.calls.slice(-1)[0]?.[0].onNotificationChange;
    familyAuthStore.setState({ personId: id(80) });
    const get = vi.spyOn(nativeAuth.getState(), 'loadUser');
    expect(() => old()).not.toThrow();
    expect(wire.stop).toHaveBeenCalled();
    expect(inbox.getState().fetchUnreadCount).not.toHaveBeenCalled();
    expect(inbox.getState().fetchNotifications).not.toHaveBeenCalled();
    get.mockRestore();
  });
  it('keeps current join callbacks functional and preserves the original selector', async () => {
    vi.spyOn(familyFrontend, 'tripUuid').mockResolvedValueOnce(id(10));
    const refetch = vi.fn();
    driver().refetch = refetch;
    await driver().joinTrip('current');
    const invalidate = vi.spyOn(familyFrontend, 'invalidate');
    wire.bind.mock.calls.slice(-1)[0]?.[0].onChange();
    expect(invalidate).toHaveBeenCalledWith(id(10));
    expect(refetch).toHaveBeenCalledWith('current');
  });
  it('does not clear a newer trip binding when an older trip leaves', async () => {
    vi.spyOn(familyFrontend, 'tripUuid').mockResolvedValueOnce(id(10)).mockResolvedValueOnce(id(11));
    await driver().joinTrip('first');
    await driver().joinTrip('second');
    wire.bind.mockClear();
    driver().leaveTrip('first');
    expect(wire.bind).not.toHaveBeenCalled();
  });
  it('resets the native trip mirror when a same-user Family changes', () => {
    useTripStore.setState({ trip: { id: 99 } as NonNullable<ReturnType<typeof useTripStore.getState>['trip']> });
    familyAuthStore.setState({ familyId: id(80) });
    expect(useTripStore.getState().trip).toBeNull();
  });
});

it('dispatches healthy current notification refreshes exactly once', () => {
  driver().connect();
  wire.start.mock.calls.slice(-1)[0]?.[0].onNotificationChange();
  expect(inbox.getState().fetchUnreadCount).toHaveBeenCalledOnce();
  expect(inbox.getState().fetchNotifications).toHaveBeenCalledExactlyOnceWith(true);
});

it('settles a current join failure as a diagnostic event without an unhandled rejection', async () => {
  vi.spyOn(familyFrontend, 'tripUuid').mockRejectedValueOnce(new Error('Fixture unavailable'));
  const emit = vi.fn();
  driver().emit = emit;
  await driver().joinTrip('current');
  expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'family_realtime_error', phase: 'join' }));
  expect(wire.bind).not.toHaveBeenCalled();
});

it('does not attribute an old notification rejection to a newer connection', async () => {
  let reject!: (error: Error) => void;
  const pending = new Promise<void>((_, fail) => {
    reject = fail;
  });
  vi.mocked(inbox.getState().fetchUnreadCount).mockReturnValueOnce(pending);
  const emit = vi.fn();
  driver().emit = emit;
  driver().connect();
  wire.start.mock.calls.slice(-1)[0]?.[0].onNotificationChange();
  driver().connect();
  reject(new Error('Old connection failure'));
  await Promise.allSettled([pending]);
  await Promise.resolve();
  expect(emit).not.toHaveBeenCalled();
});

it('keeps a replacement installation intact when old Auth callbacks and cleanup run later', () => {
  const firstDispose = dispose,
    old = wire.event;
  dispose = installFamilyFrontend();
  const currentFetch = window.fetch,
    currentAdapter = apiClient.defaults.adapter;
  wire.stop.mockClear();
  const clear = vi.spyOn(familyFrontend, 'clear');
  old?.('SIGNED_OUT', null);
  if (firstDispose) firstDispose();
  expect(clear).not.toHaveBeenCalled();
  expect(wire.stop).not.toHaveBeenCalled();
  expect(window.fetch).toBe(currentFetch);
  expect(apiClient.defaults.adapter).toBe(currentAdapter);
});
