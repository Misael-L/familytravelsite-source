import { act, cleanup, fireEvent, render, renderHook, waitFor } from '@testing-library/react';
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
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  let url = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:fixture-${++url}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(async () => {
  cleanup();
  for (const release of releases.splice(0)) release();
  await Promise.allSettled(pending.splice(0));
  if (vi.isFakeTimers()) {
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
  } else await new Promise((r) => setTimeout(r, 110));
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

import { authApi, tripsApi } from '../../api/client';
import { useTripCoverPicker } from '../../components/Trips/useTripCoverPicker';
import { useTripMembers } from '../../components/Trips/useTripShare';
import { applyTripCoverUpdate } from '../../pages/tripPlanner/tripCover';
import * as images from '../../utils/convertHeic';
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('../../components/shared/Toast', () => ({ useToast: () => toast }));
vi.mock('../../i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const photo = {
  id: 'original',
  url: 'https://images.fixture.invalid/original.jpg',
  thumb: 'https://images.fixture.invalid/thumb.jpg',
};
const png = () => new File(['original-cover-bytes'], 'cover.png', { type: 'image/png' });
function options() {
  return {
    trip: { id: 101 } as { id: number } | null,
    title: 'Original title',
    onCoverUpdate: vi.fn(),
    releasePreviewOnChange: false,
    open: true,
  };
}
async function transition(
  kind: string,
  h: { unmount: () => void; rerender: (p: ReturnType<typeof options>) => void },
  o: ReturnType<typeof options>
) {
  if (kind === 'other' || kind === 'same')
    await act(async () => {
      await switchAccount(kind === 'same');
    });
  else if (kind === 'navigate') {
    act(navigate);
    h.rerender({ ...o, trip: { id: 102 } });
  } else if (kind === 'close') h.rerender({ ...o, open: false });
  else if (kind === 'reset') act(() => {});
  else h.unmount();
}
const changes = ['other', 'same', 'navigate', 'close', 'unmount'] as const;
const memberOpts = () => ({ tripId: 101, isOpen: true, onClose: vi.fn(), onMembersChanged: vi.fn() });
const roster = (name = 'Original guest') => ({
  owner: { id: 1201, username: 'Original owner' },
  members: [{ id: 1301, username: name, is_guest: true }],
});

describe('P04aj actual cover picker ownership', () => {
  it.each(changes)('late normalization cannot upload after %s', async (change) => {
    const converted = deferred(png());
    vi.spyOn(images, 'normalizeImageFile').mockReturnValue(converted.promise);
    const upload = vi.spyOn(tripsApi, 'uploadCover').mockResolvedValue({ cover_image: '/uploads/old.jpg' });
    const o = options(),
      h = renderHook((p) => useTripCoverPicker(p), { initialProps: o });
    const old = observe(h.result.current.selectFile(png()));
    await transition(change, h, o);
    await act(async () => {
      converted.resolve(png());
      await old;
    });
    expect(upload).not.toHaveBeenCalled();
    expect(o.onCoverUpdate).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it.each(changes)('late search data is discarded after %s', async (change) => {
    const data = deferred({ photos: [photo] });
    vi.spyOn(tripsApi, 'searchCoverImages').mockReturnValue(data.promise);
    const o = options(),
      h = renderHook((p) => useTripCoverPicker(p), { initialProps: o });
    const old = observe(h.result.current.search());
    await transition(change, h, o);
    await act(async () => {
      data.resolve({ photos: [photo] });
      await old;
    });
    expect(h.result.current.searchResults).toEqual([]);
    expect(toast.error).not.toHaveBeenCalled();
  });
  it.each(['upload', 'photo', 'remove'] as const)('a late %s save cannot patch the replacement trip', async (kind) => {
    const reply = deferred({ cover_image: '/uploads/old.jpg' });
    vi.spyOn(images, 'normalizeImageFile').mockImplementation(async (f) => f);
    vi.spyOn(tripsApi, 'uploadCover').mockReturnValue(reply.promise);
    vi.spyOn(tripsApi, 'update').mockReturnValue(reply.promise as never);
    const o = options(),
      h = renderHook((p) => useTripCoverPicker(p), { initialProps: o });
    const old = observe(
      kind === 'upload'
        ? h.result.current.selectFile(png())
        : kind === 'photo'
          ? h.result.current.selectPhoto(photo)
          : h.result.current.removeCover()
    );
    await waitFor(() => expect(kind === 'upload' ? tripsApi.uploadCover : tripsApi.update).toHaveBeenCalled());
    await transition('navigate', h, o);
    await act(async () => {
      reply.resolve({ cover_image: '/uploads/old.jpg' });
      await old;
    });
    expect(o.onCoverUpdate).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(h.result.current.coverPreview).not.toBe('/uploads/old.jpg');
  });
  it('reset retires a pending search and clears its spinner', async () => {
    const data = deferred({ photos: [photo] });
    vi.spyOn(tripsApi, 'searchCoverImages').mockReturnValue(data.promise);
    const h = renderHook(() => useTripCoverPicker(options()));
    const old = observe(h.result.current.search());
    act(() => h.result.current.resetCover('/stored/new.webp'));
    await act(async () => {
      data.resolve({ photos: [photo] });
      await old;
    });
    expect(h.result.current.searchResults).toEqual([]);
    expect(h.result.current.searching).toBe(false);
    expect(h.result.current.coverPreview).toBe('/stored/new.webp');
  });
  it('an older normalization cannot replace the last picked file', async () => {
    const oldFile = png(),
      newFile = new File(['new'], 'latest.png', { type: 'image/png' });
    const converted = deferred(oldFile);
    vi.spyOn(images, 'normalizeImageFile').mockReturnValueOnce(converted.promise).mockResolvedValueOnce(newFile);
    const o = { ...options(), trip: null },
      h = renderHook(() => useTripCoverPicker(o));
    const old = observe(h.result.current.selectFile(oldFile));
    await act(async () => {
      await h.result.current.selectFile(newFile);
    });
    await act(async () => {
      converted.resolve(oldFile);
      await old;
    });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledWith(newFile);
  });
  it.each([false, true])('a staged preview releases on account replacement in phone mode %s', async (phone) => {
    vi.spyOn(images, 'normalizeImageFile').mockImplementation(async (f) => f);
    const o = { ...options(), trip: null, releasePreviewOnChange: phone },
      h = renderHook(() => useTripCoverPicker(o));
    await act(async () => {
      await h.result.current.selectFile(png());
    });
    await act(async () => {
      await switchAccount();
    });
    expect(h.result.current.coverPreview).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture-1');
  });
  it('old callbacks cannot search or save again after the picker closes', async () => {
    const search = vi.spyOn(tripsApi, 'searchCoverImages').mockResolvedValue({ photos: [] }),
      update = vi.spyOn(tripsApi, 'update').mockResolvedValue({ trip } as never);
    const o = options(),
      h = renderHook((p) => useTripCoverPicker(p), { initialProps: o }),
      old = h.result.current;
    h.rerender({ ...o, open: false });
    await old.search();
    await old.selectPhoto(photo);
    expect(search).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it('removing an empty new-trip cover is a safe no-op', async () => {
    const update = vi.spyOn(tripsApi, 'update');
    const h = renderHook(() => useTripCoverPicker({ ...options(), trip: null }));
    await act(async () => {
      await expect(h.result.current.removeCover()).resolves.toBeUndefined();
    });
    expect(update).not.toHaveBeenCalled();
  });
  it('only the stated trip can receive a cover callback', () => {
    useTripStore.setState({ trip: otherTrip });
    applyTripCoverUpdate(101, '/uploads/old.jpg');
    expect(useTripStore.getState().trip?.cover_image).not.toBe('/uploads/old.jpg');
  });
  it('a healthy native upload preserves its multipart body, filename and stored URL', async () => {
    vi.spyOn(images, 'normalizeImageFile').mockImplementation(async (f) => f);
    const upload = vi
      .spyOn(tripsApi, 'uploadCover')
      .mockResolvedValue({ cover_image: '/storage/v1/object/public/catalog/variants/v1/cover/hero.webp' });
    const o = options(),
      h = renderHook(() => useTripCoverPicker(o));
    await act(async () => {
      await h.result.current.selectFile(png());
    });
    const [id, body] = upload.mock.calls[0];
    expect(id).toBe(101);
    expect((body.get('cover') as File).name).toBe('cover.png');
    expect(o.onCoverUpdate).toHaveBeenCalledWith(101, '/storage/v1/object/public/catalog/variants/v1/cover/hero.webp');
    expect(toast.success).toHaveBeenCalledWith('dashboard.coverSaved');
  });
});

describe('P04aj actual member dialog continuation ownership', () => {
  it.each(changes)('late roster and directory reads do not populate after %s', async (change) => {
    const data = deferred(roster()),
      directory = deferred({ users: [{ id: 1300, username: 'Original directory' }] });
    vi.spyOn(tripsApi, 'getMembers')
      .mockReturnValueOnce(data.promise)
      .mockResolvedValue({ owner: { id: 1202, username: 'Replacement' }, members: [] });
    const { authApi } = await import('../../api/client');
    vi.spyOn(authApi, 'listUsers').mockReturnValueOnce(directory.promise).mockResolvedValue({ users: [] });
    const o = memberOpts(),
      h = renderHook((p) => useTripMembers(p), { initialProps: o });
    if (change === 'other' || change === 'same')
      await act(async () => {
        await switchAccount(change === 'same');
      });
    else if (change === 'navigate') {
      act(navigate);
      h.rerender({ ...o, tripId: 102 });
    } else if (change === 'close') h.rerender({ ...o, isOpen: false });
    else h.unmount();
    await act(async () => {
      data.resolve(roster());
      directory.resolve({ users: [{ id: 1300, username: 'Original directory' }] });
      await Promise.all([data.promise, directory.promise]);
    });
    expect(h.result.current.guests).toEqual([]);
    expect(h.result.current.allUsers).toEqual([]);
  });
  it.each(['addGuest', 'removeGuest', 'remove', 'rename'] as const)(
    'a late %s acknowledgement cannot reload or notify a new account',
    async (kind) => {
      const initial = vi.spyOn(tripsApi, 'getMembers').mockResolvedValue(roster());
      const reply = deferred({});
      vi.spyOn(tripsApi, 'createGuest').mockReturnValue(reply.promise);
      vi.spyOn(tripsApi, 'deleteGuest').mockReturnValue(reply.promise);
      vi.spyOn(tripsApi, 'removeMember').mockReturnValue(reply.promise);
      vi.spyOn(tripsApi, 'renameGuest').mockReturnValue(reply.promise);
      const o = memberOpts(),
        h = renderHook(() => useTripMembers(o));
      await waitFor(() => expect(h.result.current.guests).toHaveLength(1));
      act(() => {
        h.result.current.setNewGuestName('New guest');
        h.result.current.startRename(roster().members[0]);
      });
      let old!: Promise<unknown>;
      act(() => {
        old = observe(
          kind === 'addGuest'
            ? h.result.current.addGuest()
            : kind === 'removeGuest'
              ? h.result.current.removeGuest(1301)
              : kind === 'remove'
                ? h.result.current.remove(1301, false)
                : h.result.current.commitRename(1301)
        );
      });
      const oldReads = initial.mock.calls.length;
      await act(async () => {
        await switchAccount();
      });
      const replacementReads = initial.mock.calls.length;
      await act(async () => {
        reply.resolve({});
        await old;
      });
      expect(initial.mock.calls.length).toBe(Math.max(oldReads, replacementReads));
      expect(o.onMembersChanged).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
    }
  );
  it('a late member transfer cannot close a replacement screen', async () => {
    vi.spyOn(tripsApi, 'getMembers').mockResolvedValue(roster());
    const reply = deferred({});
    vi.spyOn(tripsApi, 'transferOwnership').mockReturnValue(reply.promise);
    const o = memberOpts(),
      h = renderHook((p) => useTripMembers(p), { initialProps: o });
    const old = observe(h.result.current.transfer(1301));
    h.rerender({ ...o, isOpen: false });
    await act(async () => {
      reply.resolve({});
      await old;
    });
    expect(o.onClose).not.toHaveBeenCalled();
  });
  it('a retained guest action cannot send after unmount', async () => {
    const write = vi.spyOn(tripsApi, 'createGuest').mockResolvedValue({});
    const h = renderHook(() => useTripMembers(memberOpts()));
    act(() => h.result.current.setNewGuestName('Original guest'));
    const old = h.result.current.addGuest;
    h.unmount();
    await old();
    expect(write).not.toHaveBeenCalled();
  });
  it('a current guest creation keeps the native request and refresh callback', async () => {
    vi.spyOn(tripsApi, 'getMembers').mockResolvedValue(roster());
    const create = vi.spyOn(tripsApi, 'createGuest').mockResolvedValue({});
    const o = memberOpts(),
      h = renderHook(() => useTripMembers(o));
    act(() => h.result.current.setNewGuestName('  New guest  '));
    await act(async () => {
      await h.result.current.addGuest();
    });
    expect(create).toHaveBeenCalledWith(101, 'New guest');
    expect(o.onMembersChanged).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith('members.guestAdded');
  });
});

import TripFormModal from '../../components/Trips/TripFormModal';
import MNewTripSheet from '../../mobile/screens/dashboard/MNewTripSheet';
import { usePlannerMembers } from '../../pages/tripPlanner/usePlannerMembers';

describe('P04aj extracted planner roster reader', () => {
  it.each(['other', 'same', 'navigate', 'unmount'] as const)(
    'an initial roster cannot follow its replacement after %s',
    async (change) => {
      const data = deferred(roster());
      vi.spyOn(tripsApi, 'getMembers')
        .mockReturnValueOnce(data.promise)
        .mockResolvedValue({ owner: { id: 1202, username: 'Replacement owner' }, members: [] });
      const h = renderHook((id) => usePlannerMembers(id), { initialProps: 101 });
      if (change === 'other' || change === 'same')
        await act(async () => {
          await switchAccount(change === 'same');
        });
      else if (change === 'navigate') {
        act(navigate);
        h.rerender(102);
      } else h.unmount();
      await act(async () => {
        data.resolve(roster());
        await data.promise;
      });
      expect(h.result.current.tripMembers.map((x) => x.username)).not.toContain('Original guest');
    }
  );
  it('a newer roster refresh wins over a slow initial response', async () => {
    const data = deferred(roster());
    vi.spyOn(tripsApi, 'getMembers').mockReturnValueOnce(data.promise).mockResolvedValue(roster('Latest guest'));
    const h = renderHook(() => usePlannerMembers(101));
    await act(async () => {
      await h.result.current.refreshMembers();
    });
    await act(async () => {
      data.resolve(roster());
      await data.promise;
    });
    expect(h.result.current.tripMembers.map((x) => x.username)).toContain('Latest guest');
    expect(h.result.current.tripMembers.map((x) => x.username)).not.toContain('Original guest');
  });
  it('a retained refresh cannot read after the planner unmounts', async () => {
    const read = vi.spyOn(tripsApi, 'getMembers').mockResolvedValue(roster());
    const h = renderHook(() => usePlannerMembers(101));
    await waitFor(() => expect(h.result.current.tripMembers).toHaveLength(2));
    const old = h.result.current.refreshMembers;
    h.unmount();
    read.mockClear();
    await old();
    expect(read).not.toHaveBeenCalled();
  });
  it('an offline roster comes from the original account cache without fetching', async () => {
    await offlineDb.tripMembers.put({ tripId: 101, id: 1301, username: 'Offline guest' });
    setForcedOffline(true);
    const read = vi.spyOn(tripsApi, 'getMembers');
    const h = renderHook(() => usePlannerMembers(101));
    await waitFor(() => expect(h.result.current.tripMembers.map((x) => x.username)).toEqual(['Offline guest']));
    await h.result.current.refreshMembers();
    expect(read).not.toHaveBeenCalled();
  });
  it('a failed online refresh retains the current roster without changing cache or permissions', async () => {
    const read = vi
      .spyOn(tripsApi, 'getMembers')
      .mockResolvedValueOnce(roster())
      .mockRejectedValueOnce(new Error('fixture denied'));
    const h = renderHook(() => usePlannerMembers(101));
    await waitFor(() => expect(h.result.current.tripMembers).toHaveLength(2));
    await act(async () => {
      await h.result.current.refreshMembers();
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(h.result.current.tripMembers.map((x) => x.username)).toContain('Original guest');
    expect(await offlineDb.tripMembers.count()).toBe(0);
  });
});
describe('Trip editor reminder configuration', () => {
  it.each([
    { name: 'omitted', config: {} },
    { name: 'null', config: { trip_reminders_enabled: null } },
    { name: 'string', config: { trip_reminders_enabled: 'false' } },
    { name: 'no response body', config: null },
  ])('preserves the current setting when the flag is $name', async ({ config }) => {
    useAuthStore.setState({ tripRemindersEnabled: true });
    const reply = deferred(config);
    const read = vi.spyOn(authApi, 'getAppConfig').mockReturnValue(reply.promise);
    render(<TripFormModal isOpen trip={trip} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(read).toHaveBeenCalledOnce();
    await act(async () => {
      reply.resolve(config);
      await reply.promise;
    });
    expect(useAuthStore.getState().tripRemindersEnabled).toBe(true);
  });

  it.each([false, true])('applies an explicit %s in the active editor', async (enabled) => {
    useAuthStore.setState({ tripRemindersEnabled: !enabled });
    vi.spyOn(authApi, 'getAppConfig').mockResolvedValue({ trip_reminders_enabled: enabled });
    render(<TripFormModal isOpen trip={trip} onSave={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(useAuthStore.getState().tripRemindersEnabled).toBe(enabled));
  });

  it.each(changes)('ignores a late reminder flag after %s', async (change) => {
    useAuthStore.setState({ tripRemindersEnabled: false });
    const reply = deferred({ trip_reminders_enabled: true });
    const read = vi.spyOn(authApi, 'getAppConfig').mockReturnValueOnce(reply.promise).mockResolvedValue({});
    const props = { trip, isOpen: true, onSave: vi.fn(), onClose: vi.fn() };
    const editor = render(<TripFormModal {...props} />);
    expect(read).toHaveBeenCalledOnce();
    if (change === 'other' || change === 'same') await act(() => switchAccount(change === 'same'));
    else if (change === 'navigate') {
      act(navigate);
      editor.rerender(<TripFormModal {...props} trip={otherTrip} />);
    } else if (change === 'close') editor.rerender(<TripFormModal {...props} isOpen={false} />);
    else editor.unmount();

    await act(async () => {
      reply.resolve({ trip_reminders_enabled: true });
      await reply.promise;
    });
    expect(useAuthStore.getState().tripRemindersEnabled).toBe(false);
  });
});

describe('P04aj native cover form wiring', () => {
  it.each(['desktop', 'phone'] as const)('%s closure retires its real file input conversion', async (mode) => {
    const converted = deferred(png());
    vi.spyOn(images, 'normalizeImageFile').mockReturnValue(converted.promise);
    const upload = vi.spyOn(tripsApi, 'uploadCover').mockResolvedValue({ cover_image: '/uploads/old.jpg' });
    const onCoverUpdate = vi.fn(),
      props = { trip, onClose: vi.fn(), onSave: vi.fn(), onCoverUpdate };
    const view = (open: boolean) =>
      mode === 'desktop' ? <TripFormModal {...props} isOpen={open} /> : <MNewTripSheet {...props} open={open} />;
    const h = render(view(true));
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [png()] } });
    await waitFor(() => expect(images.normalizeImageFile).toHaveBeenCalled());
    h.rerender(view(false));
    await act(async () => {
      converted.resolve(png());
      await converted.promise;
    });
    expect(upload).not.toHaveBeenCalled();
    expect(onCoverUpdate).not.toHaveBeenCalled();
  });
  it('reset during a conversion cannot stage the old file afterward', async () => {
    const converted = deferred(png());
    vi.spyOn(images, 'normalizeImageFile').mockReturnValue(converted.promise);
    const h = renderHook(() => useTripCoverPicker({ ...options(), trip: null }));
    const old = observe(h.result.current.selectFile(png()));
    act(() => h.result.current.resetCover(null));
    await act(async () => {
      converted.resolve(png());
      await old;
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(h.result.current.coverPreview).toBeNull();
  });
  it('losing cover permission before conversion completes prevents a write', async () => {
    const converted = deferred(png());
    vi.spyOn(images, 'normalizeImageFile').mockReturnValue(converted.promise);
    const upload = vi.spyOn(tripsApi, 'uploadCover');
    const o = { ...options(), canChange: true },
      h = renderHook((p) => useTripCoverPicker(p), { initialProps: o });
    const old = observe(h.result.current.selectFile(png()));
    h.rerender({ ...o, canChange: false });
    await act(async () => {
      converted.resolve(png());
      await old;
    });
    expect(upload).not.toHaveBeenCalled();
    expect(h.result.current.uploadingCover).toBe(false);
  });
  it('a staged creation cannot upload from a closed retained callback', async () => {
    vi.spyOn(images, 'normalizeImageFile').mockImplementation(async (f) => f);
    const upload = vi.spyOn(tripsApi, 'uploadCover');
    const o = { ...options(), trip: null },
      h = renderHook((p) => useTripCoverPicker(p), { initialProps: o });
    await act(async () => {
      await h.result.current.selectFile(png());
    });
    const old = h.result.current.applyToCreatedTrip;
    h.rerender({ ...o, open: false });
    await old(301);
    expect(upload).not.toHaveBeenCalled();
  });
  it('an accepted cover write holds its mutation lane until its reply', async () => {
    const data = deferred({ cover_image: '/uploads/accepted.jpg' });
    const update = vi.spyOn(tripsApi, 'update').mockReturnValue(data.promise as never);
    const h = renderHook(() => useTripCoverPicker(options()));
    const first = observe(h.result.current.selectPhoto(photo));
    await h.result.current.selectPhoto({ ...photo, url: 'https://images.fixture.invalid/second.jpg' });
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    await act(async () => {
      data.resolve({ cover_image: '/uploads/accepted.jpg' });
      await first;
    });
    expect(h.result.current.uploadingCover).toBe(false);
  });
});

describe('P04aj cancelled search and initial offline read controls', () => {
  it.each(['empty', 'offline'] as const)(
    'a rejected %s search retires the pending spinner and response',
    async (kind) => {
      const data = deferred({ photos: [photo] });
      vi.spyOn(tripsApi, 'searchCoverImages').mockReturnValue(data.promise);
      const o = { ...options(), title: '' },
        h = renderHook(() => useTripCoverPicker(o));
      act(() => h.result.current.setSearchQuery('first query'));
      const old = observe(h.result.current.search());
      if (kind === 'empty') act(() => h.result.current.setSearchQuery(''));
      else setForcedOffline(true);
      await act(async () => {
        await h.result.current.search();
      });
      expect(h.result.current.searching).toBe(false);
      await act(async () => {
        data.resolve({ photos: [photo] });
        await old;
      });
      expect(h.result.current.searchResults).toEqual([]);
      expect(h.result.current.searchError).toBe(
        kind === 'empty' ? 'dashboard.unsplashQueryRequired' : 'common.needsConnection'
      );
    }
  );
  it('an offline refresh leaves the initial cached roster read eligible to finish', async () => {
    await offlineDb.tripMembers.put({ tripId: 101, id: 1301, username: 'Offline initial guest' });
    setForcedOffline(true);
    const h = renderHook(() => usePlannerMembers(101));
    await act(async () => {
      await h.result.current.refreshMembers();
    });
    await waitFor(() => expect(h.result.current.tripMembers.map((x) => x.username)).toEqual(['Offline initial guest']));
  });
});

import { useStayModalScope } from '../../components/Planner/stayConsumerScope';
import { tripMemberSelection } from '../../components/Trips/tripMemberSelection';
describe('P04aj native form member selector ownership', () => {
  it('a late add cannot clear a replacement selector or notify success', async () => {
    const reply = deferred({});
    vi.spyOn(tripsApi, 'addMember').mockReturnValue(reply.promise);
    const h = renderHook((open) => useStayModalScope({ id: 101 }, open), { initialProps: true }),
      setExistingMembers = vi.fn(),
      setSelectedMembers = vi.fn(),
      setMemberSelectValue = vi.fn();
    const select = tripMemberSelection({
      capture: h.result.current,
      open: true,
      trip,
      allUsers: [{ id: 1300, username: 'Original invitee' }],
      t: (k) => k,
      toast,
      setExistingMembers,
      setSelectedMembers,
      setMemberSelectValue,
    });
    const old = observe(select(1300));
    h.rerender(false);
    await act(async () => {
      reply.resolve({});
      await old;
    });
    expect(setExistingMembers).not.toHaveBeenCalled();
    expect(setMemberSelectValue).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
