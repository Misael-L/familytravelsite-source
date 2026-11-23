import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDay, buildPlace, buildTrip, buildUser } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import { offlineDb, reopenAnonymous } from '../../db/offlineDb';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { waitForLogout } from '../../sync/logoutCoordinator';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { tripSyncManager } from '../../sync/tripSyncManager';

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
const releases: (() => void)[] = [],
  pending: Promise<unknown>[] = [];
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
    http.get('/api/trips/:trip/reservations', () => HttpResponse.json({ reservations: [] }))
  );
  await login();
  await seed();
  server.use(
    http.get('/api/auth/users', () => HttpResponse.json({ users: [{ id: 1300, username: 'Invitee' }] })),
    http.get('/api/trips/:trip/members', () =>
      HttpResponse.json({ owner: { id: 1201, username: 'Original owner' }, members: [] })
    )
  );
  toast.error.mockClear();
  toast.success.mockClear();
});
afterEach(async () => {
  cleanup();
  for (const release of releases.splice(0)) release();
  await Promise.allSettled(pending.splice(0));
  if (vi.isFakeTimers()) {
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
  }
  document.querySelectorAll('a[download]').forEach((a) => a.remove());

  await waitForLogout();
  await resetOfflineTestDatabase();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  await Dexie.delete('trek-offline-u1201');
  await Dexie.delete('trek-offline-u1202');
  setAuthed(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

import { shareApi, tripInviteApi } from '../../api/client';
import TripMembersModal from '../../components/Trips/TripMembersModal';
import { useShareLink, useTripInviteLink } from '../../components/Trips/useTripShare';
import MTripSettingsSheet from '../../mobile/screens/trip/sheets/MTripSettingsSheet';
import { usePermissionsStore } from '../../store/permissionsStore';
import { copyText } from '../../utils/clipboard';
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('../../components/shared/Toast', () => ({ useToast: () => toast }));
vi.mock('../../i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const hooks = { share: useShareLink, invite: useTripInviteLink },
  apis = { share: shareApi, invite: tripInviteApi };
const kinds = ['share', 'invite'] as const;
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard'),
  secureDescriptor = Object.getOwnPropertyDescriptor(window, 'isSecureContext'),
  execDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');
function context(writeText: () => Promise<void> = async () => {}, secure = true) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, writable: true, configurable: true });
  Object.defineProperty(window, 'isSecureContext', { value: secure, writable: true, configurable: true });
}
afterEach(() => {
  for (const [object, key, descriptor] of [
    [navigator, 'clipboard', clipboardDescriptor],
    [window, 'isSecureContext', secureDescriptor],
    [document, 'execCommand', execDescriptor],
  ] as const) {
    if (descriptor) Object.defineProperty(object, key, descriptor);
    else Reflect.deleteProperty(object, key);
  }
  document.querySelectorAll('textarea').forEach((n) => n.remove());
});
const url = (kind: (typeof kinds)[number], token: string) =>
  `${window.location.origin}/${kind === 'share' ? 'shared' : 'join'}/${token}`;
async function change(kind: string, h: { unmount: () => void; rerender: (id: number) => void }) {
  if (kind === 'other' || kind === 'same')
    await act(async () => {
      await switchAccount(kind === 'same');
    });
  else if (kind === 'navigate') {
    act(navigate);
    h.rerender(102);
  } else h.unmount();
}
function ready(kind: (typeof kinds)[number], token = 'original') {
  return vi
    .spyOn(apis[kind], 'getLink')
    .mockImplementation(async (id) => ({ token: Number(id) === 101 ? token : 'replacement' }));
}

describe('P04ak original share/invite continuation ownership', () => {
  it.each(kinds.flatMap((kind) => ['other', 'same', 'navigate', 'unmount'].map((change) => ({ kind, change }))))(
    'late $kind initial data cannot follow $change',
    async ({ kind, change: transition }) => {
      const reply = deferred({ token: 'private-original' });
      vi.spyOn(apis[kind], 'getLink').mockReturnValueOnce(reply.promise).mockResolvedValue({ token: null });
      const h = renderHook((id) => hooks[kind](id), { initialProps: 101 });
      await change(transition, h);
      await act(async () => {
        reply.resolve({ token: 'private-original' });
        await reply.promise;
      });
      expect(h.result.current.url ?? '').not.toContain('private-original');
      expect(toast.error).not.toHaveBeenCalled();
    }
  );
  it.each(
    kinds.flatMap((kind) =>
      ['create', 'remove'].flatMap((operation) => ['reply', 'error'].map((outcome) => ({ kind, operation, outcome })))
    )
  )('late $kind $operation $outcome cannot replace the next trip', async ({ kind, operation, outcome }) => {
    ready(kind);
    const response = deferred(undefined);
    vi.spyOn(apis[kind], 'createLink').mockImplementation(async () => {
      await response.promise;
      if (outcome === 'error') throw new Error('original denied');
      return { token: 'old-created' };
    });
    vi.spyOn(apis[kind], 'deleteLink').mockImplementation(async () => {
      await response.promise;
      if (outcome === 'error') throw new Error('original denied');
      return {};
    });
    const h = renderHook((id) => hooks[kind](id), { initialProps: 101 });
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    const old = observe(h.result.current[operation === 'create' ? 'create' : 'remove']());
    await change('navigate', h);
    await waitFor(() => expect(h.result.current.url).toBe(url(kind, 'replacement')));
    await act(async () => {
      response.resolve(undefined);
      await old;
    });
    expect(h.result.current.url).toBe(url(kind, 'replacement'));
    expect(toast.error).not.toHaveBeenCalled();
  });
  it.each(kinds)('an accepted $kind creation cannot populate another account', async (kind) => {
    ready(kind);
    const response = deferred({ token: 'old-created' });
    vi.spyOn(apis[kind], 'createLink').mockReturnValue(response.promise);
    const h = renderHook(() => hooks[kind](101));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    const old = observe(h.result.current.create());
    await act(async () => {
      await switchAccount();
    });
    await act(async () => {
      response.resolve({ token: 'old-created' });
      await old;
    });
    expect(h.result.current.url ?? '').not.toContain('old-created');
  });
  it.each(kinds)('retained $kind create and copy callbacks cannot start after unmount', async (kind) => {
    ready(kind);
    const create = vi.spyOn(apis[kind], 'createLink').mockResolvedValue({ token: 'new' }),
      write = vi.fn(async () => {});
    context(write);
    const h = renderHook(() => hooks[kind](101));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    const old = h.result.current;
    h.unmount();
    await old.create();
    await old.copy();
    expect(create).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
  it.each(kinds.flatMap((kind) => ['create', 'remove'].map((operation) => ({ kind, operation }))))(
    'initial $kind read cannot overwrite a newer $operation',
    async ({ kind, operation }) => {
      const initial = deferred({ token: 'stale-read' });
      vi.spyOn(apis[kind], 'getLink').mockReturnValue(initial.promise);
      vi.spyOn(apis[kind], 'createLink').mockResolvedValue({ token: 'new-created' });
      vi.spyOn(apis[kind], 'deleteLink').mockResolvedValue({});
      const h = renderHook(() => hooks[kind](101));
      await act(async () => {
        await h.result.current[operation === 'create' ? 'create' : 'remove']();
      });
      await act(async () => {
        initial.resolve({ token: 'stale-read' });
        await initial.promise;
      });
      expect(h.result.current.url).toBe(operation === 'create' ? url(kind, 'new-created') : null);
      expect(h.result.current.loading).toBe(false);
    }
  );
  it.each(kinds)('same-render duplicate $kind creation is one command', async (kind) => {
    ready(kind);
    const response = deferred({ token: 'new' }),
      create = vi.spyOn(apis[kind], 'createLink').mockReturnValue(response.promise);
    const h = renderHook(() => hooks[kind](101));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    let a!: Promise<void>, b!: Promise<void>;
    act(() => {
      a = h.result.current.create();
      b = h.result.current.create();
    });
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledOnce();
    await act(async () => {
      response.resolve({ token: 'new' });
      await Promise.all([a, b]);
    });
  });
});
describe('P04ak ordered native share permission commands', () => {
  it('same-render changes retain every permission in their exact native payload', async () => {
    ready('share');
    const create = vi.spyOn(shareApi, 'createLink').mockResolvedValue({ token: 'original' });
    const h = renderHook(() => useShareLink(101));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    const change = h.result.current.setPerm;
    await act(async () => {
      await Promise.all([change('share_budget', true), change('share_hide_images', true)]);
    });
    expect(h.result.current.perms.share_budget).toBe(true);
    expect(h.result.current.perms.share_hide_images).toBe(true);
    expect(create.mock.calls[create.mock.calls.length - 1]).toEqual([
      101,
      {
        share_map: true,
        share_bookings: true,
        share_packing: false,
        share_budget: true,
        share_collab: false,
        share_travel_only: false,
        share_hide_images: true,
      },
    ]);
  });
  it('permission writes wait for link creation and retain the latest staged choice', async () => {
    vi.spyOn(shareApi, 'getLink').mockResolvedValue({ token: null });
    const first = deferred({ token: 'created' });
    const create = vi
      .spyOn(shareApi, 'createLink')
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ token: 'created' });
    const h = renderHook(() => useShareLink(101));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    const old = observe(h.result.current.create());
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    const permission = observe(h.result.current.setPerm('share_hide_images', true));
    await act(async () => {
      first.resolve({ token: 'created' });
      await Promise.all([old, permission]);
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][1]?.share_hide_images).toBe(true);
  });
  it('a permission edit queued after deletion cannot recreate a disabled link', async () => {
    ready('share');
    const deleted = deferred({});
    vi.spyOn(shareApi, 'deleteLink').mockReturnValue(deleted.promise);
    const create = vi.spyOn(shareApi, 'createLink').mockResolvedValue({ token: 'unwanted' });
    const h = renderHook(() => useShareLink(101));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    const remove = observe(h.result.current.remove()),
      edit = observe(h.result.current.setPerm('share_budget', true));
    await act(async () => {
      deleted.resolve({});
      await Promise.all([remove, edit]);
    });
    expect(create).not.toHaveBeenCalled();
    expect(h.result.current.url).toBeNull();
    expect(h.result.current.perms.share_budget).toBe(true);
  });
  it('local permission selection before creating a link does not publish one', async () => {
    vi.spyOn(shareApi, 'getLink').mockResolvedValue({ token: null });
    const create = vi.spyOn(shareApi, 'createLink');
    const h = renderHook(() => useShareLink(101));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => {
      await h.result.current.setPerm('share_budget', true);
    });
    expect(create).not.toHaveBeenCalled();
    expect(h.result.current.url).toBeNull();
  });
});
describe('P04ak clipboard ownership and link rotation', () => {
  it.each(kinds.flatMap((kind) => ['other', 'same', 'navigate'].map((change) => ({ kind, change }))))(
    'a late accepted $kind clipboard result cannot mark $change copied',
    async ({ kind, change: transition }) => {
      ready(kind);
      const copied = deferred(undefined),
        write = vi.fn(() => copied.promise);
      context(write);
      const h = renderHook((id) => hooks[kind](id), { initialProps: 101 });
      await waitFor(() => expect(h.result.current.loading).toBe(false));
      const old = observe(h.result.current.copy());
      expect(write).toHaveBeenCalledWith(url(kind, 'original'));
      await change(transition, h);
      await act(async () => {
        copied.resolve(undefined);
        await old;
      });
      expect(h.result.current.copied).toBe(false);
    }
  );
  it.each(kinds)('a retained $kind copy cannot publish the token it replaced', async (kind) => {
    ready(kind);
    vi.spyOn(apis[kind], 'createLink').mockResolvedValue({ token: 'rotated' });
    const write = vi.fn(async () => {});
    context(write);
    const h = renderHook(() => hooks[kind](101));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    const old = h.result.current.copy;
    await act(async () => {
      await h.result.current.create();
    });
    await old();
    expect(write).not.toHaveBeenCalled();
  });
  it.each(kinds)('a new $kind token starts without the previous copied badge', async (kind) => {
    ready(kind);
    vi.spyOn(apis[kind], 'createLink').mockResolvedValue({ token: 'rotated' });
    context();
    const h = renderHook(() => hooks[kind](101));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    await act(async () => {
      await h.result.current.copy();
    });
    expect(h.result.current.copied).toBe(true);
    await act(async () => {
      await h.result.current.create();
    });
    expect(h.result.current.copied).toBe(false);
  });
  it('a current copied badge lasts two seconds and restarts on successful recopy', async () => {
    ready('share');
    context();
    const h = renderHook(() => useShareLink(101));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    vi.useFakeTimers();
    await act(async () => {
      await h.result.current.copy();
    });
    await act(() => vi.advanceTimersByTime(1500));
    await act(async () => {
      await h.result.current.copy();
    });
    await act(() => vi.advanceTimersByTime(500));
    expect(h.result.current.copied).toBe(true);
    await act(() => vi.advanceTimersByTime(1500));
    expect(h.result.current.copied).toBe(false);
  });
  it('a pending copy finished after unmount does not install a timer', async () => {
    ready('share');
    const copied = deferred(undefined);
    context(() => copied.promise);
    const h = renderHook(() => useShareLink(101));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    vi.useFakeTimers();
    const old = observe(h.result.current.copy());
    h.unmount();
    await act(async () => {
      copied.resolve(undefined);
      await old;
    });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('fallback focus ending ownership prevents execCommand and clears the temporary textarea', async () => {
    context(async () => {}, false);
    let current = true;
    const exec = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true, writable: true });
    vi.spyOn(HTMLTextAreaElement.prototype, 'focus').mockImplementationOnce(() => {
      current = false;
    });
    const result = await copyText('private-original', () => {
      if (!current) throw new Error('owner ended');
    });
    expect(result).toBe(false);
    expect(exec).not.toHaveBeenCalled();
    expect(document.querySelector('textarea')).toBeNull();
  });
  it('an append that throws after insertion cannot leave private text behind', async () => {
    context(async () => {}, false);
    const native = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, 'appendChild').mockImplementationOnce((node) => {
      native(node);
      throw new Error('fixture append');
    });
    expect(await copyText('private-original')).toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});

describe('P04ak unchanged native sharing permission gates', () => {
  it.each(['desktop', 'phone'] as const)(
    '%s sharing controls stay unavailable without the existing permission',
    async (mode) => {
      usePermissionsStore.setState({ permissions: { share_manage: 'admin' } });
      const publicRead = vi.spyOn(shareApi, 'getLink').mockResolvedValue({ token: 'must-not-read' }),
        inviteRead = vi.spyOn(tripInviteApi, 'getLink').mockResolvedValue({ token: 'must-not-read' });
      const props = { tripId: 101, tripTitle: 'Original trip', onClose: vi.fn() };
      render(
        mode === 'desktop' ? (
          <TripMembersModal {...props} isOpen={true} />
        ) : (
          <MTripSettingsSheet {...props} open={true} />
        )
      );
      await waitFor(() => expect(screen.getByText('Original owner')).toBeTruthy());
      expect(publicRead).not.toHaveBeenCalled();
      expect(inviteRead).not.toHaveBeenCalled();
    }
  );
});

describe('P04ak ordered command cancellation and distinct intents', () => {
  it('create/remove/create keeps its distinct final intent rather than treating it as a duplicate', async () => {
    ready('invite');
    const first = deferred({ token: 'first' }),
      create = vi
        .spyOn(tripInviteApi, 'createLink')
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue({ token: 'last' }),
      remove = vi.spyOn(tripInviteApi, 'deleteLink').mockResolvedValue({});
    const h = renderHook(() => useTripInviteLink(101));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    const a = observe(h.result.current.create()),
      b = observe(h.result.current.remove()),
      c = observe(h.result.current.create());
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    await act(async () => {
      first.resolve({ token: 'first' });
      await Promise.all([a, b, c]);
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledOnce();
    expect(h.result.current.url).toBe(url('invite', 'last'));
    expect(h.result.current.busy).toBe(false);
  });
  it('a queued command cannot dispatch after the original account ends', async () => {
    ready('invite');
    const first = deferred({ token: 'old-created' });
    vi.spyOn(tripInviteApi, 'createLink').mockReturnValue(first.promise);
    const remove = vi.spyOn(tripInviteApi, 'deleteLink').mockResolvedValue({});
    const h = renderHook(() => useTripInviteLink(101));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    const a = observe(h.result.current.create()),
      b = observe(h.result.current.remove());
    await act(async () => {
      await switchAccount();
    });
    await act(async () => {
      first.resolve({ token: 'old-created' });
      await Promise.all([a, b]);
    });
    expect(remove).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
