import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nativeApi from '../../../src/api/client';
import familyApi, { authApi as familyAuthApi } from '../../../src/integrations/family/legacy/api/client';
import { useAuthStore as familyAuth } from '../../../src/integrations/family/legacy/store/authStore';
import { useSystemNoticeStore as familyNotices } from '../../../src/integrations/family/legacy/store/systemNoticeStore';
import { useSystemNoticeStore as nativeNotices } from '../../../src/store/systemNoticeStore';
import { buildUser } from '../../helpers/factories';

const plane = vi.hoisted(() => ({ supabase: false }));

vi.mock('../../../src/integrations/family/legacy/data/supabase/auth', async (original) => ({
  ...(await original<typeof import('../../../src/integrations/family/legacy/data/supabase/auth')>()),
  isSupabaseDataPlane: () => plane.supabase,
}));

vi.mock('../../../src/integrations/family/legacy/api/websocket', async (original) => ({
  ...(await original<typeof import('../../../src/integrations/family/legacy/api/websocket')>()),
  connect: vi.fn(),
}));
vi.mock('../../../src/integrations/family/legacy/db/offlineDb', async (original) => ({
  ...(await original<typeof import('../../../src/integrations/family/legacy/db/offlineDb')>()),
  reopenForUser: vi.fn(async () => {}),
}));
vi.mock('../../../src/integrations/family/legacy/sync/tripSyncManager', () => ({
  tripSyncManager: { syncAll: vi.fn(async () => {}) },
}));

const initialFamilyAuth = familyAuth.getState();

function notice(id: string) {
  return {
    id,
    display: 'banner' as const,
    severity: 'info' as const,
    dismissible: true,
    titleKey: 'notice.title',
    bodyKey: 'notice.body',
  };
}

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const result = new Promise<T>((onSuccess, onError) => {
    resolve = onSuccess;
    reject = onError;
  });
  return { result, resolve, reject };
}

function resetStores() {
  nativeNotices.getState().reset();
  familyNotices.getState().reset();
  plane.supabase = false;
}

beforeEach(resetStores);
afterEach(() => {
  familyAuth.setState(initialFamilyAuth, true);
  resetStores();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.each([
  { name: 'TREK', store: nativeNotices, api: nativeApi },
  { name: 'the retained Family Nest path', store: familyNotices, api: familyApi },
])('$name notice lifecycle', ({ store, api }) => {
  it('keeps the current notice list after an older successful fetch settles', async () => {
    const prior = pending<{ data: ReturnType<typeof notice>[] }>();
    const get = vi
      .spyOn(api, 'get')
      .mockImplementationOnce(() => prior.result)
      .mockResolvedValueOnce({ data: [notice('current')] });

    const first = store.getState().fetch();
    await store.getState().fetch();
    expect(get).toHaveBeenCalledTimes(1);
    store.getState().reset();
    await store.getState().fetch();

    prior.resolve({ data: [notice('previous')] });
    await first;
    expect(store.getState()).toMatchObject({ notices: [notice('current')], loaded: true, fetching: false });
  });

  it('keeps a current read in progress when an older read fails after reset', async () => {
    const prior = pending<{ data: ReturnType<typeof notice>[] }>();
    const next = pending<{ data: ReturnType<typeof notice>[] }>();
    vi.spyOn(api, 'get')
      .mockImplementationOnce(() => prior.result)
      .mockImplementationOnce(() => next.result);

    const first = store.getState().fetch();
    store.getState().reset();
    const current = store.getState().fetch();
    prior.reject(new Error('previous request failed'));
    await first;

    expect(store.getState()).toMatchObject({ notices: [], loaded: false, fetching: true });
    next.resolve({ data: [notice('current')] });
    await current;
    expect(store.getState()).toMatchObject({ notices: [notice('current')], loaded: true, fetching: false });
  });

  it('removes a notice optimistically and retries a failed dismissal once', async () => {
    vi.useFakeTimers();
    const post = vi
      .spyOn(api, 'post')
      .mockRejectedValueOnce(new Error('first attempt failed'))
      .mockResolvedValueOnce({});
    store.setState({ notices: [notice('dismissed'), notice('other')] });

    store.getState().dismiss('dismissed');
    expect(store.getState().notices).toEqual([notice('other')]);
    expect(post).toHaveBeenCalledExactlyOnceWith('/system-notices/dismissed/dismiss');

    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(post.mock.calls).toEqual([['/system-notices/dismissed/dismiss'], ['/system-notices/dismissed/dismiss']]);
  });

  it.each(['before the reply', 'after the retry was scheduled'])(
    'cancels a dismissal retry when reset runs %s',
    async (timing) => {
      vi.useFakeTimers();
      const reply = pending<object>();
      const post = vi.spyOn(api, 'post').mockImplementationOnce(() => reply.result);
      store.setState({ notices: [notice('previous')] });

      store.getState().dismiss('previous');
      if (timing === 'before the reply') store.getState().reset();
      reply.reject(new Error('first attempt failed'));
      await vi.advanceTimersByTimeAsync(0);
      if (timing === 'after the retry was scheduled') store.getState().reset();
      await vi.advanceTimersByTimeAsync(2000);

      expect(post).toHaveBeenCalledExactlyOnceWith('/system-notices/previous/dismiss');
      expect(store.getState()).toMatchObject({ notices: [], loaded: false, fetching: false });
    }
  );
});

it('marks Family notices as loaded and empty on Supabase without making notice requests', async () => {
  plane.supabase = true;
  const get = vi.spyOn(familyApi, 'get');
  const post = vi.spyOn(familyApi, 'post');
  nativeNotices.setState({ notices: [notice('native-only')], loaded: true });
  await familyNotices.getState().fetch();
  familyNotices.getState().dismiss('previous');

  expect(familyNotices.getState()).toMatchObject({ notices: [], loaded: true, fetching: false });
  expect(nativeNotices.getState().notices).toEqual([notice('native-only')]);
  expect(get).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
});

it.each(['password', 'mfa'])('reloads Family Nest notices when %s sign-in replaces the account', async (mode) => {
  const outgoing = buildUser({ id: 31 });
  const incoming = buildUser({ id: 32 });
  familyAuth.setState({ user: outgoing, isAuthenticated: true });
  familyNotices.setState({ notices: [notice('outgoing')], loaded: true });
  const read = vi.spyOn(familyApi, 'get').mockResolvedValue({ data: [notice('incoming')] });
  const signedIn = { user: incoming, token: 'fixture-session' };

  if (mode === 'password') {
    vi.spyOn(familyAuthApi, 'login').mockResolvedValue(signedIn);
    expect(await familyAuth.getState().login(incoming.email, 'fixture')).toEqual(signedIn);
  } else {
    vi.spyOn(familyAuthApi, 'verifyMfaLogin').mockResolvedValue(signedIn);
    expect(await familyAuth.getState().completeMfaLogin('verification', '123 456')).toEqual(signedIn);
  }

  expect(read).toHaveBeenCalledExactlyOnceWith('/system-notices/active');
  expect(familyAuth.getState().user?.id).toBe(incoming.id);
  expect(familyNotices.getState().notices).toEqual([notice('incoming')]);
});
