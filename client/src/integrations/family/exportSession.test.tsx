import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
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
import * as runtime from './runtime';

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
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  let url = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:fixture-${++url}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  useFamilyUiPermissions.setState({ controller: null });
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
  useFamilyUiPermissions.setState({ controller: null });
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

import * as pdf from '../../components/PDF/TripPDF';
import { saveBlob, useTripExport, type TripExportOptions } from '../../components/Planner/useTripExport';
import type { FamilyControllerValue } from './controllerContext';
import { FamilyIdentityRegistry } from './identity';
import { buildFamilyPlanIcs } from './legacy/lib/plan/familyPlanIcs';
import * as planExport from './planExport';
import { familyFrontend, type FamilyCore } from './repository';
import { useFamilyUiPermissions } from './uiPermissions';
import { FamilyViews } from './views';
const EXPORT = /\/(?:export\.ics|places\/export\.gpx)(?:\?|$)/;
function opts(exclusive = true): TripExportOptions {
  return {
    tripId: 101,
    open: true,
    data: {
      trip,
      days: [day, departure],
      places: [place],
      assignments: {},
      categories: [],
      reservations: [],
      dayNotes: {},
    },
    t: (k) => k,
    locale: 'en',
    toast: { error: vi.fn(), info: vi.fn() },
    exclusive,
    onExported: vi.fn(),
    requireTrip: true,
    closeAfterPdf: true,
    logPdfErrors: false,
  };
}
const methods = ['ics', 'gpx'] as const;
function run(h: { current: ReturnType<typeof useTripExport> }, kind: (typeof methods)[number]) {
  return kind === 'ics' ? h.current.downloadIcs() : h.current.downloadGpx('all', '?waypoints=false');
}
function respond(status = 200, blob = vi.fn(async () => new Blob(['private-export'], { type: 'text/plain' }))) {
  return { ok: status >= 200 && status < 300, status, blob } as unknown as Response;
}
function exportsOnly(read: () => Promise<Response>) {
  const native = globalThis.fetch;
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input, init) => (EXPORT.test(String(input)) ? read() : native(input, init)));
}
const UUID = '11111111-1111-4111-8111-111111111111',
  USER = '22222222-2222-4222-8222-222222222222',
  FAMILY = '33333333-3333-4333-8333-333333333333';
function family() {
  const ids = new FamilyIdentityRegistry(USER, undefined, () => 101);
  ids.register('trip', UUID);
  vi.spyOn(familyFrontend, 'knownViews').mockReturnValue(new FamilyViews(ids));
  vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true);
  const core: FamilyCore = {
    trip: {
      id: UUID,
      family_id: FAMILY,
      title: 'Published Family',
      description: null,
      start_date: '2026-11-07',
      end_date: '2026-11-07',
      cover_image: null,
      is_archived: 0,
      currency: 'USD',
      reminder_days: 7,
      status: 'planned',
    },
    days: [{ id: 'day-one', tripId: UUID, civilDay: '2026-11-07', dayIndex: 0, title: null }],
    places: [],
    schedule: [
      {
        id: 'visit-one',
        tripId: UUID,
        activity: 'Published visit',
        placeId: null,
        startsAt: '2026-11-07T09:00:00Z',
        endsAt: '2026-11-07T10:00:00Z',
        address: 'Original address',
        timeZone: 'UTC',
        sortOrder: 0,
        experienceId: null,
        foodId: null,
        linkUrl: null,
      },
    ],
    notes: [],
  };
  useFamilyUiPermissions.setState({
    controller: {
      core,
      partialLoad: { failed: false, retry: () => {} },
      gov: { layer: 'myDraft', draftOps: [{ activity: 'Never export this draft' }] },
    } as unknown as FamilyControllerValue,
  });
  return core;
}

describe('P04ai actual calendar and GPX continuation ownership', () => {
  it.each(
    methods.flatMap((kind) =>
      ['headers', 'body'].flatMap((stage) =>
        ['other', 'same', 'navigate', 'unmount'].map((change) => ({ kind, stage, change }))
      )
    )
  )('$kind $stage cannot download or notify after $change', async ({ kind, stage, change }) => {
    const bytes = deferred(new Blob(['original-private-bytes'])),
      headers = deferred(
        respond(
          200,
          vi.fn(() => bytes.promise)
        )
      );
    let sent = false,
      reading = false;
    const body = vi.fn(async () => {
      reading = true;
      return bytes.promise;
    });
    const reply = respond(200, body);
    exportsOnly(async () => {
      sent = true;
      return stage === 'headers' ? headers.promise : reply;
    });
    const o = opts();
    const h = renderHook((p) => useTripExport(p), { initialProps: o });
    const old = observe(run(h.result, kind));
    await waitFor(() => expect(stage === 'headers' ? sent : reading).toBe(true));
    if (change === 'other' || change === 'same')
      await act(async () => {
        await switchAccount(change === 'same');
      });
    else if (change === 'navigate') {
      act(navigate);
      h.rerender({ ...o, tripId: 102, data: { ...o.data, trip: otherTrip } });
    } else h.unmount();
    await act(async () => {
      headers.resolve(reply);
      bytes.resolve(new Blob(['original-private-bytes']));
      await old;
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(o.onExported).not.toHaveBeenCalled();
    expect(o.toast.error).not.toHaveBeenCalled();
    expect(o.toast.info).not.toHaveBeenCalled();
    if (stage === 'headers') expect(body).not.toHaveBeenCalled();
  });
  it.each(methods)('a retained $kind callback cannot issue a fresh request after unmount', async (kind) => {
    const fetch = exportsOnly(async () => respond());
    const h = renderHook(() => useTripExport(opts()));
    const old = kind === 'ics' ? h.result.current.downloadIcs : () => h.result.current.downloadGpx('all', '');
    h.unmount();
    await old();
    expect(fetch.mock.calls.filter(([url]) => EXPORT.test(String(url)))).toHaveLength(0);
  });
  it.each([
    { kind: 'gpx' as const, status: 404 },
    { kind: 'gpx' as const, status: 500 },
    { kind: 'ics' as const, status: 500 },
  ])('current $kind HTTP $status keeps its native error/empty contract', async ({ kind, status }) => {
    exportsOnly(async () => respond(status));
    const o = opts();
    const h = renderHook(() => useTripExport(o));
    await act(async () => {
      await run(h.result, kind);
    });
    if (status === 404) expect(o.toast.info).toHaveBeenCalledWith('dayplan.gpxEmpty');
    else expect(o.toast.error).toHaveBeenCalledWith(kind === 'ics' ? 'planner.icsExportFailed' : 'dayplan.gpxFailed');
    expect(o.onExported).not.toHaveBeenCalled();
    expect(h.result.current.anyRunning).toBe(false);
  });
  it.each(methods)('current $kind preserves URL, credentials, body and filename', async (kind) => {
    const blob = new Blob(['native-bytes']);
    const fetch = exportsOnly(async () =>
      respond(
        200,
        vi.fn(async () => blob)
      )
    );
    const o = opts();
    const h = renderHook(() => useTripExport(o));
    await act(async () => {
      await run(h.result, kind);
    });
    expect(fetch).toHaveBeenCalledWith(
      kind === 'ics' ? '/api/trips/101/export.ics' : '/api/trips/101/places/export.gpx?waypoints=false',
      { credentials: 'include' }
    );
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    const anchor = vi.mocked(HTMLAnchorElement.prototype.click).mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe(`${trip.title}.${kind === 'ics' ? 'ics' : 'gpx'}`);
    expect(o.onExported).toHaveBeenCalledOnce();
    expect(h.result.current.anyRunning).toBe(false);
  });
  it.each(methods)('same-render duplicate $kind calls share an occupied lane', async (kind) => {
    const response = deferred(respond());
    let requests = 0;
    exportsOnly(async () => {
      requests++;
      return response.promise;
    });
    const o = opts(false);
    const h = renderHook(() => useTripExport(o));
    let first!: Promise<void>, second!: Promise<void>;
    act(() => {
      first = run(h.result, kind);
      second = run(h.result, kind);
    });
    await waitFor(() => expect(requests).toBeGreaterThan(0));
    expect(requests).toBe(1);
    await act(async () => {
      response.resolve(respond());
      await Promise.all([first, second]);
    });
    expect(o.onExported).toHaveBeenCalledOnce();
  });
  it('an old completion cannot clear a replacement view calendar lane', async () => {
    const one = deferred(respond()),
      two = deferred(respond());
    let requests = 0;
    exportsOnly(async () => (++requests === 1 ? one.promise : two.promise));
    const o = opts();
    const h = renderHook((p) => useTripExport(p), { initialProps: o });
    const old = observe(h.result.current.downloadIcs());
    await waitFor(() => expect(requests).toBe(1));
    act(navigate);
    h.rerender({ ...o, tripId: 102, data: { ...o.data, trip: otherTrip } });
    const next = observe(h.result.current.downloadIcs());
    await waitFor(() => expect(requests).toBe(2));
    await act(async () => {
      one.resolve(respond());
      await old;
    });
    expect(h.result.current.isRunning('ics')).toBe(true);
    await act(async () => {
      two.resolve(respond());
      await next;
    });
    expect(h.result.current.anyRunning).toBe(false);
  });
  it('a same-render desktop PDF claim blocks calendar before lazy loading finishes', async () => {
    const ready = deferred(undefined);
    vi.spyOn(pdf, 'downloadTripPDF').mockReturnValue(ready.promise);
    const fetch = exportsOnly(async () => respond());
    const o = opts();
    const h = renderHook(() => useTripExport(o));
    let first!: Promise<void>, second!: Promise<void>;
    act(() => {
      first = h.result.current.exportPdf();
      second = h.result.current.downloadIcs();
    });
    await waitFor(() => expect(pdf.downloadTripPDF).toHaveBeenCalled());
    expect(fetch.mock.calls.filter(([url]) => EXPORT.test(String(url)))).toHaveLength(0);
    await act(async () => {
      ready.resolve(undefined);
      await Promise.all([first, second]);
    });
  });
});

describe('P04ai published Family calendar and capability gates', () => {
  it('numeric view keys must match the currently published controller', async () => {
    family();
    expect(() => planExport.loadFamilyPlanExport(102)).toThrow();
  });
  it('numeric-string view keys resolve through the ready trip registry', () => {
    family();
    expect(planExport.loadFamilyPlanExport('101').tripTitle).toBe('Published Family');
  });
  it('a valid key for a different trip cannot export the active controller', () => {
    family();
    const ids = new FamilyIdentityRegistry(USER, undefined, () => 101);
    ids.register('trip', USER);
    vi.mocked(familyFrontend.knownViews).mockReturnValue(new FamilyViews(ids));
    expect(() => planExport.loadFamilyPlanExport(101)).toThrow();
  });
  it('a key belonging to a place cannot select a trip', () => {
    family();
    const ids = new FamilyIdentityRegistry(USER, undefined, () => 101);
    ids.register('place', UUID);
    vi.mocked(familyFrontend.knownViews).mockReturnValue(new FamilyViews(ids));
    expect(() => planExport.loadFamilyPlanExport(101)).toThrow();
  });
  it('missing numeric identity context fails without a new fetch', () => {
    family();
    vi.mocked(familyFrontend.knownViews).mockReturnValue(null);
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect(() => planExport.loadFamilyPlanExport(101)).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('canonical UUIDs still select the exact published controller', () => {
    family();
    expect(planExport.loadFamilyPlanExport(UUID).tripTitle).toBe('Published Family');
    expect(() => planExport.loadFamilyPlanExport(USER)).toThrow();
  });
  it('the real Family calendar uses the published snapshot, native filename and delayed URL cleanup', async () => {
    family();
    vi.useFakeTimers();
    const input = planExport.loadFamilyPlanExport(101),
      o = opts();
    const h = renderHook(() => useTripExport(o));
    await act(async () => {
      await h.result.current.downloadIcs();
    });
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect((await blob.text()).replace(/DTSTAMP:[^\r\n]+/g, 'DTSTAMP:fixed')).toBe(
      buildFamilyPlanIcs(input).replace(/DTSTAMP:[^\r\n]+/g, 'DTSTAMP:fixed')
    );
    expect(await blob.text()).not.toContain('Never export this draft');
    const anchor = vi.mocked(HTMLAnchorElement.prototype.click).mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('Published-Family-plan.ics');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    expect(anchor.isConnected).toBe(false);
    expect(o.onExported).toHaveBeenCalledOnce();
  });
  it.each(['another trip', 'another account', 'same account sign-in'] as const)(
    'a late Family snapshot cannot export after switching to %s',
    async (change) => {
      family();
      const input = planExport.loadFamilyPlanExport(101),
        snapshot = deferred(input);
      const load = vi.spyOn(planExport, 'loadFamilyPlanExport').mockReturnValue(snapshot.promise as never);
      const o = opts();
      const h = renderHook((p) => useTripExport(p), { initialProps: o });
      const old = observe(h.result.current.downloadIcs());
      await waitFor(() => expect(load).toHaveBeenCalledExactlyOnceWith(101));

      if (change === 'another trip') {
        act(navigate);
        h.rerender({ ...o, tripId: 102, data: { ...o.data, trip: otherTrip } });
      } else {
        const same = change === 'same account sign-in';
        await act(async () => switchAccount(same));
        expect(useAuthStore.getState().user?.id).toBe(same ? A.id : B.id);
      }
      await act(async () => {
        snapshot.resolve(input);
        await old;
      });
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
      expect(o.toast.error).not.toHaveBeenCalled();
      expect(o.onExported).not.toHaveBeenCalled();
    }
  );
  it('unready Family data produces no partial calendar', async () => {
    family();
    useFamilyUiPermissions.setState({ controller: null });
    const o = opts();
    const h = renderHook(() => useTripExport(o));
    await act(async () => {
      await h.result.current.downloadIcs();
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(o.toast.error).toHaveBeenCalledWith('planner.icsExportFailed');
  });
  it('all Family GPX scopes remain unavailable without fetching or allocating', async () => {
    family();
    const fetch = exportsOnly(async () => respond());
    const o = opts();
    const h = renderHook(() => useTripExport(o));
    await act(async () => {
      await h.result.current.downloadGpx('all', '');
      await h.result.current.downloadGpx('places', '?dayRoutes=false');
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(fetch.mock.calls.filter(([url]) => EXPORT.test(String(url)))).toHaveLength(0);
    expect(o.toast.error).toHaveBeenCalledWith('settings.toast.nestOnly');
  });
});

describe('P04ai real browser download resource cleanup', () => {
  it.each(['click', 'append'] as const)('a failed %s handoff releases its URL and anchor immediately', (kind) => {
    vi.useFakeTimers();
    if (kind === 'click')
      vi.mocked(HTMLAnchorElement.prototype.click).mockImplementationOnce(() => {
        throw new Error('fixture handoff');
      });
    else
      vi.spyOn(document.body, 'appendChild').mockImplementationOnce(() => {
        throw new Error('fixture append');
      });
    expect(() => saveBlob(new Blob(['bytes']), 'file.ics')).toThrow();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });
  it('ownership lost during URL allocation cannot click the old private bytes', () => {
    vi.useFakeTimers();
    let current = true;
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => {
      current = false;
      return 'blob:lost';
    });
    const assert = () => {
      if (!current) throw new Error('fixture owner ended');
    };
    expect(() => saveBlob(new Blob(['private']), 'file.ics', assert)).toThrow();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:lost');
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });
  it('ordinary cleanup failure still removes the anchor after an accepted handoff', () => {
    vi.useFakeTimers();
    vi.mocked(URL.revokeObjectURL).mockImplementationOnce(() => {
      throw new Error('fixture cleanup');
    });
    saveBlob(new Blob(['bytes']), 'file.gpx');
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });
  it('cleanup still runs after normal view unmount following a successful download', async () => {
    vi.useFakeTimers();
    exportsOnly(async () => respond());
    const h = renderHook(() => useTripExport(opts()));
    await act(async () => {
      await h.result.current.downloadIcs();
    });
    const anchor = vi.mocked(HTMLAnchorElement.prototype.click).mock.contexts[0] as HTMLAnchorElement;
    h.unmount();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    expect(anchor.isConnected).toBe(false);
  });
});
