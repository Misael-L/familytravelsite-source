import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../tests/helpers/factories';
import { resetAllStores } from '../../tests/helpers/store';
import axios, { authApi } from '../api/client';
import { invalidateOfflineSession } from '../db/offlineDb';
import { sessionRead } from '../repo/sessionRead';
import { isAuthed } from '../sync/authGate';
import { captureReadSession } from '../sync/readSession';
import { useAuthStore } from './authStore';
import { useSystemNoticeStore } from './systemNoticeStore';

const dbIO = vi.hoisted(() => ({ beforeReopen: null as null | (() => Promise<void>) }));
vi.mock('../db/offlineDb', async (original) => {
  const actual = await original<typeof import('../db/offlineDb')>();
  return {
    ...actual,
    reopenForUser: async (id: number | string) => {
      await dbIO.beforeReopen?.();
      return actual.reopenForUser(id);
    },
  };
});

vi.mock('../sync/syncTriggers', () => ({ registerSyncTriggers: vi.fn(), unregisterSyncTriggers: vi.fn() }));
vi.mock('../sync/tripSyncManager', () => ({ tripSyncManager: { syncAll: vi.fn(async () => {}) } }));

beforeEach(() => {
  dbIO.beforeReopen = null;
  resetAllStores();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('overlapping session validation', () => {
  it('ignores an older refusal after a newer validation succeeds', async () => {
    const user = buildUser({ username: 'validated-current' });
    useAuthStore.setState({ user, isAuthenticated: true, authCheckFailed: false });
    let rejectOlder!: (error: Error) => void;
    const older = new Promise<Awaited<ReturnType<typeof authApi.me>>>((_, reject) => {
      rejectOlder = reject;
    });
    vi.spyOn(authApi, 'me')
      .mockImplementationOnce(() => older)
      .mockResolvedValueOnce({ user });
    const first = useAuthStore.getState().loadUser();
    await useAuthStore.getState().loadUser({ silent: true });
    rejectOlder(Object.assign(new Error('Retired actor context'), { response: { status: 409 } }));
    await first;
    expect(useAuthStore.getState().user).toEqual(user);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().authCheckFailed).toBe(false);
  });

  it('does not replace a newer validated display record with an older successful response', async () => {
    const current = buildUser({ username: 'validated-current' });
    const outdated = { ...current, username: 'older-display-record' };
    let resolveOlder!: (value: Awaited<ReturnType<typeof authApi.me>>) => void;
    const older = new Promise<Awaited<ReturnType<typeof authApi.me>>>((resolve) => {
      resolveOlder = resolve;
    });
    vi.spyOn(authApi, 'me')
      .mockImplementationOnce(() => older)
      .mockResolvedValueOnce({ user: current });
    const first = useAuthStore.getState().loadUser();
    await useAuthStore.getState().loadUser({ silent: true });
    resolveOlder({ user: outdated });
    await first;
    expect(useAuthStore.getState().user).toEqual(current);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().authCheckFailed).toBe(false);
  });
  it.each([401, 503])('keeps a newer %s refusal when an older success arrives afterwards', async (status) => {
    const user = buildUser();
    useAuthStore.setState({ user, isAuthenticated: true, authCheckFailed: false });
    let resolveOlder!: (value: Awaited<ReturnType<typeof authApi.me>>) => void;
    const older = new Promise<Awaited<ReturnType<typeof authApi.me>>>((resolve) => {
      resolveOlder = resolve;
    });
    vi.spyOn(authApi, 'me')
      .mockImplementationOnce(() => older)
      .mockRejectedValueOnce(Object.assign(new Error('Current validation refused'), { response: { status } }));
    const first = useAuthStore.getState().loadUser();
    await useAuthStore.getState().loadUser({ silent: true });
    resolveOlder({ user });
    await first;
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(status !== 401);
    expect(state.authCheckFailed).toBe(status === 503);
    expect(state.user).toEqual(status === 401 ? null : user);
  });
  it('clears the notice state when session validation returns unauthorized', async () => {
    const user = buildUser();
    useAuthStore.setState({ user, isAuthenticated: true });
    useSystemNoticeStore.setState({ loaded: true });
    vi.spyOn(authApi, 'me').mockRejectedValue(Object.assign(new Error('Unauthorized'), { response: { status: 401 } }));

    await useAuthStore.getState().loadUser({ silent: true });

    expect(useSystemNoticeStore.getState()).toMatchObject({ notices: [], loaded: false, fetching: false });
  });

  it('reloads notices for a silently replaced account and ignores the previous notice reply', async () => {
    const outgoing = buildUser({ id: 21 });
    const incoming = buildUser({ id: 22 });
    const notice = {
      id: 'incoming',
      display: 'banner',
      severity: 'info',
      titleKey: 'notice.title',
      bodyKey: 'notice.body',
      dismissible: true,
    };
    useAuthStore.setState({ user: outgoing, isAuthenticated: true });
    useSystemNoticeStore.getState().reset();

    let resolvePrevious!: (data: { data: (typeof notice)[] }) => void;
    const previous = new Promise<{ data: (typeof notice)[] }>((resolve) => {
      resolvePrevious = resolve;
    });
    const getNotices = vi
      .spyOn(axios, 'get')
      .mockImplementationOnce(() => previous)
      .mockResolvedValueOnce({ data: [notice] });
    vi.spyOn(authApi, 'me').mockResolvedValue({ user: incoming });

    const oldFetch = useSystemNoticeStore.getState().fetch();
    await useAuthStore.getState().loadUser({ silent: true });
    resolvePrevious({ data: [{ ...notice, id: 'outgoing' }] });
    await oldFetch;

    expect(getNotices).toHaveBeenCalledTimes(2);
    expect(useSystemNoticeStore.getState().notices).toEqual([notice]);
    useSystemNoticeStore.getState().reset();
  });

  it('keeps an in-flight read alive when the same validated session refreshes', async () => {
    invalidateOfflineSession();
    const user = buildUser();
    vi.spyOn(authApi, 'me').mockResolvedValue({ user });
    await useAuthStore.getState().loadUser();
    const session = captureReadSession();
    let release!: (value: string) => void;
    const response = new Promise<string>((resolve) => {
      release = resolve;
    });
    const original = sessionRead(
      async () => response,
      async () => 'cached'
    ).then(
      (value) => ({ ok: true, value }),
      () => ({ ok: false, value: null })
    );
    dbIO.beforeReopen = async () => {
      release('original response');
      await original;
    };
    await useAuthStore.getState().loadUser({ silent: true });
    release('original response');
    expect(await original).toEqual({ ok: true, value: 'original response' });
    expect(session.current()).toBe(true);
  });
  it('still pauses and retires reads after the offline ownership epoch changes', async () => {
    invalidateOfflineSession();
    const user = buildUser();
    vi.spyOn(authApi, 'me').mockResolvedValue({ user });
    await useAuthStore.getState().loadUser();
    const original = captureReadSession();
    invalidateOfflineSession();
    const pauses: boolean[] = [];
    dbIO.beforeReopen = async () => {
      pauses.push(!isAuthed());
    };
    await useAuthStore.getState().loadUser({ silent: true });
    expect(pauses).toEqual([true]);
    expect(original.current()).toBe(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
