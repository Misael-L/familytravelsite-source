import { act, cleanup, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAssignment, buildDay, buildPlace, buildTrip, buildUser } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import api, { mapsApi } from '../../api/client';
import { offlineDb, reopenAnonymous } from '../../db/offlineDb';
import type { Translate } from '../../pages/tripPlanner/plannerTypes';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { waitForLogout } from '../../sync/logoutCoordinator';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { tripSyncManager } from '../../sync/tripSyncManager';
import type { Accommodation } from '../../types';
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
const stay: Accommodation = {
  id: 801,
  trip_id: 101,
  place_id: place.id,
  start_day_id: 70,
  end_day_id: 71,
  confirmation: 'Original private confirmation',
  notes: 'Original private stay',
};
const ownStay: Accommodation = {
  ...stay,
  trip_id: 102,
  confirmation: 'Replacement confirmation',
  notes: 'Replacement stay',
};
const visit = buildAssignment({ id: 501, day_id: 70, place_id: place.id, place });
const releases: (() => void)[] = [],
  pending: Promise<unknown>[] = [],
  disposers: (() => void)[] = [];
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
  await offlineDb.accommodations.put(replacement ? ownStay : stay);
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
    http.get('/api/trips/101/accommodations', () => HttpResponse.json({ accommodations: [stay] })),
    http.get('/api/trips/102/accommodations', () => HttpResponse.json({ accommodations: [ownStay] })),
    http.get('/api/trips/:trip/reservations', () => HttpResponse.json({ reservations: [] }))
  );
  await login();
  await seed();
  document.getElementById('pdf-preview-overlay')?.remove();
  document.getElementById('family-pdf-preview-overlay')?.remove();
  server.use(
    http.get('/api/pdf-sections/101', () => HttpResponse.json({ sections: [] })),
    http.get('/api/trips/101/days', () => HttpResponse.json({ days: [day, departure] })),
    http.get('/api/trips/101/budget', () => HttpResponse.json({ items: [] }))
  );
});
afterEach(async () => {
  document.getElementById('pdf-preview-overlay')?.remove();
  document.getElementById('family-pdf-preview-overlay')?.remove();
  cleanup();
  for (const dispose of disposers.splice(0)) dispose();
  api.defaults.adapter = originalAdapter;
  for (const release of releases.splice(0)) release();
  await Promise.allSettled(pending.splice(0));
  await waitForLogout();
  await resetOfflineTestDatabase();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  await Dexie.delete('trek-offline-u1201');
  await Dexie.delete('trek-offline-u1202');
  setAuthed(false);
  vi.restoreAllMocks();
});

import { buildPlanner, buildShell } from '../../../tests/helpers/mobileTrip';
import { render } from '../../../tests/helpers/render';
import { useAssistantHints } from '../../components/Assistant/useAssistantHints';
import * as tripRoutes from '../../components/Map/tripRouteGeometry';
import * as mapImages from '../../components/PDF/tripMapImage';
import { downloadTripPDF } from '../../components/PDF/TripPDF';
import * as dayDetails from '../../components/Planner/useDayDetail';
import { useTripExport } from '../../components/Planner/useTripExport';
import TripFormModal from '../../components/Trips/TripFormModal';
import { useTripRangeGuard } from '../../hooks/useTripRangeGuard';
import { TranslationProvider } from '../../i18n/TranslationContext';
import MNewTripSheet from '../../mobile/screens/dashboard/MNewTripSheet';
import MAccommodationSheet from '../../mobile/screens/trip/sheets/MAccommodationSheet';
import { useAssistantStore } from '../../store/assistantStore';
import { usePermissionsStore } from '../../store/permissionsStore';
import * as planExports from './planExport';

vi.mock('../../components/shared/CustomSelect', () => ({
  default: ({
    value,
    onChange,
    options = [],
  }: {
    value: string | number;
    onChange: (v: string | number) => void;
    options?: { value: string | number; label: string }[];
  }) => (
    <select
      data-testid="choice"
      value={String(value ?? '')}
      onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)?.value ?? e.target.value)}
    >
      <option value="" />
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock('../../components/shared/CustomTimePicker', () => ({
  default: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
  }) => <input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />,
}));
vi.mock('../../components/shared/CustomDateTimePicker', () => ({
  CustomDatePicker: ({
    value,
    onChange,
    label,
    placeholder,
  }: {
    value: string;
    onChange: (v: string) => void;
    label?: string;
    placeholder?: string;
  }) => <input aria-label={label ?? placeholder} value={value} onChange={(e) => onChange(e.target.value)} />,
}));
const wrapper = ({ children }: { children: ReactNode }) => <TranslationProvider>{children}</TranslationProvider>;
function mobile() {
  const planner = buildPlanner({
    tripId: 101,
    trip,
    days: [day, departure],
    places: [place],
    tripAccommodations: [stay],
  });
  const shell = buildShell({ sheet: { id: 'accommodation', payload: { accId: stay.id, dayId: day.id } } });
  return { planner, shell, ...render(<MAccommodationSheet planner={planner} shell={shell} />) };
}
const pdfArgs = () => ({
  trip,
  days: [day, departure],
  places: [place],
  assignments: {},
  categories: [],
  dayNotes: [],
  reservations: [],
  t: (key: string) => key,
  locale: 'en-US',
  budgetItems: [],
});
function exportOptions() {
  return {
    open: true,
    tripId: 101,
    data: { ...pdfArgs(), dayNotes: {} },
    t: ((k: string) => k) as Translate,
    locale: 'en',
    toast: { error: vi.fn(), info: vi.fn() },
    exclusive: true,
    onExported: vi.fn(),
    requireTrip: true,
    closeAfterPdf: true,
    logPdfErrors: false,
  };
}
function hintTrip() {
  useAssistantStore.setState({ status: { available: true } as never });
  useTripStore.setState({
    trip: { ...trip, start_date: '2099-06-01', end_date: '2099-06-02' },
    days: [
      { ...day, date: '2099-06-01' },
      { ...departure, date: '2099-06-02' },
    ],
    assignments: { '70': [{ ...visit, place: { ...place, place_time: '10:00' } }] },
    places: [place],
    reservations: [],
    dayNotes: {},
  });
}

describe('P04ag actual phone stay editor ownership', () => {
  it.each(['reply', 'error'] as const)('a pending save %s cannot notify or close a replacement sheet', async (kind) => {
    const reply = deferred(HttpResponse.json({ accommodation: stay }));
    let sent = false;
    server.use(
      http.put('/api/trips/101/accommodations/801', async () => {
        sent = true;
        return reply.promise;
      })
    );
    const write = vi.spyOn(dayDetails, 'writeStay');
    const h = mobile();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toBe(true));
    h.rerender(
      <MAccommodationSheet planner={h.planner} shell={{ ...h.shell, sheet: { id: 'day', payload: { dayId: 71 } } }} />
    );
    await act(async () => {
      reply.resolve(
        kind === 'reply'
          ? HttpResponse.json({ accommodation: stay })
          : HttpResponse.json({ error: 'rejected' }, { status: 500 })
      );
      await observe(write.mock.results[0].value);
    });
    await waitFor(() => expect(h.planner.toast.error).not.toHaveBeenCalled());
    expect(h.planner.loadAccommodations).not.toHaveBeenCalled();
    expect(h.shell.openSheet).not.toHaveBeenCalled();
  });
  it('an account change clears the already typed private confirmation', async () => {
    const h = mobile();
    fireEvent.change(screen.getByPlaceholderText('ABC-12345'), { target: { value: 'Private draft' } });
    await act(async () => {
      await switchAccount();
    });
    expect(screen.getByPlaceholderText('ABC-12345')).toHaveValue('');
    h.unmount();
  });
  it('a save finishing after unmount cannot refresh its parent', async () => {
    const reply = deferred({ accommodation: stay });
    let sent = false;
    server.use(
      http.put('/api/trips/101/accommodations/801', async () => {
        sent = true;
        return HttpResponse.json(await reply.promise);
      })
    );
    const h = mobile();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toBe(true));
    h.unmount();
    reply.resolve({ accommodation: stay });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(h.planner.loadAccommodations).not.toHaveBeenCalled();
  });
  it('unsupported Family stay editing preserves the cache and creates no queue intent', async () => {
    vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true);
    const h = mobile();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.planner.toast.error).toHaveBeenCalledOnce());
    expect(h.planner.loadAccommodations).not.toHaveBeenCalled();
    expect(h.shell.openSheet).not.toHaveBeenCalled();
    expect(await offlineDb.accommodations.get(stay.id)).toEqual(stay);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('a healthy native save preserves its exact body and return to the day', async () => {
    let saved: unknown;
    server.use(
      http.put('/api/trips/101/accommodations/801', async ({ request }) => {
        saved = await request.json();
        return HttpResponse.json({ accommodation: stay });
      })
    );
    const h = mobile();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.planner.loadAccommodations).toHaveBeenCalledOnce());
    expect(saved).toEqual({
      place_id: 301,
      start_day_id: 70,
      end_day_id: 71,
      check_in: null,
      check_in_end: null,
      check_out: null,
      confirmation: stay.confirmation,
    });
    expect(h.shell.openSheet).toHaveBeenCalledWith('day', { dayId: 70 });
  });
});

describe('P04ag actual date impact and callers', () => {
  it('an overlapping older check cannot clear the new check busy state', async () => {
    const r1 = deferred({ accommodations: [] as Accommodation[] }),
      r2 = deferred({ accommodations: [] as Accommodation[] });
    let reads = 0;
    server.use(
      http.get('/api/trips/101/accommodations', async () =>
        HttpResponse.json(await (++reads === 1 ? r1.promise : r2.promise))
      )
    );
    const h = renderHook(() => useTripRangeGuard(), { wrapper });
    let a!: Promise<unknown>, b!: Promise<unknown>;
    act(() => {
      a = observe(h.result.current.check(trip, { start_date: '2026-06-01', end_date: '2026-06-03' }));
    });
    await waitFor(() => expect(reads).toBe(1));
    act(() => {
      b = observe(h.result.current.check(trip, { start_date: '2026-06-01', end_date: '2026-06-04' }));
    });
    await waitFor(() => expect(reads).toBe(2));
    await act(async () => {
      r1.resolve({ accommodations: [] });
      await a;
    });
    expect(h.result.current.checking).toBe(true);
    await act(async () => {
      r2.resolve({ accommodations: [] });
      await b;
    });
    expect(h.result.current.checking).toBe(false);
  });
  it('a malformed stay envelope leaves date impact unknown', async () => {
    server.use(http.get('/api/trips/101/accommodations', () => HttpResponse.json({})));
    const h = renderHook(() => useTripRangeGuard(), { wrapper });
    let value: unknown;
    await act(async () => {
      value = await h.result.current.check(trip, { start_date: '2026-06-01', end_date: '2026-06-03' });
    });
    expect(value).toBe('unknown');
  });
  it('unavailable Family stay information yields an unknown date impact and leaves the cache intact', async () => {
    vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true);
    const h = renderHook(() => useTripRangeGuard(), { wrapper });
    let value: unknown;
    await act(async () => {
      value = await h.result.current.check(trip, { start_date: '2026-06-01', end_date: '2026-06-03' });
    });
    expect(value).toBe('unknown');
    expect(await offlineDb.accommodations.get(stay.id)).toEqual(stay);
  });
  it.each(['desktop', 'phone'] as const)(
    'a %s date check cannot invoke the old save after its dialog closes',
    async (kind) => {
      usePermissionsStore.setState({ can: () => true } as never);
      const target = { ...trip, title: 'Original trip', start_date: '2026-06-01', end_date: '2026-06-02' };
      const reply = deferred({ accommodations: [] as Accommodation[] });
      let read = false;
      server.use(
        http.get('/api/trips/101/accommodations', async () => {
          read = true;
          return HttpResponse.json(await reply.promise);
        })
      );
      const save = vi.fn(async () => ({ trip: target })),
        close = vi.fn();
      const ui = (open: boolean) =>
        kind === 'desktop' ? (
          <TripFormModal isOpen={open} trip={target} onSave={save} onClose={close} />
        ) : (
          <MNewTripSheet open={open} trip={target as never} onSave={save} onClose={close} />
        );
      const h = render(ui(true));
      fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2026-06-03' } });
      fireEvent.click(screen.getByRole('button', { name: 'Update' }));
      await waitFor(() => expect(read).toBe(true));
      h.rerender(ui(false));
      await act(async () => {
        reply.resolve({ accommodations: [] });
      });
      await new Promise((r) => setTimeout(r, 20));
      expect(save).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    }
  );
});

describe('P04ag actual assistant stay hints', () => {
  it('known no-stay data is no longer reused after an account transition', async () => {
    hintTrip();
    server.use(http.get('/api/trips/101/accommodations', () => HttpResponse.json({ accommodations: [] })));
    const h = renderHook(() => useAssistantHints(101, { withStays: true }), { wrapper });
    await waitFor(() => expect(h.result.current.hints.some((x) => x.rule === 'noStay')).toBe(true));
    const blocked = deferred({ accommodations: [] as Accommodation[] });
    server.use(http.get('/api/trips/101/accommodations', () => blocked.promise.then(HttpResponse.json)));
    await act(async () => {
      await switchAccount();
      hintTrip();
    });
    expect(h.result.current.hints.some((x) => x.rule === 'noStay')).toBe(false);
  });
  it('a malformed stay envelope never produces a no-stay recommendation', async () => {
    hintTrip();
    server.use(http.get('/api/trips/101/accommodations', () => HttpResponse.json({})));
    const h = renderHook(() => useAssistantHints(101, { withStays: true }), { wrapper });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(h.result.current.hints.some((v) => v.rule === 'noStay')).toBe(false);
  });
  it('unavailable Family stays suppress the no-stay rule', async () => {
    hintTrip();
    vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true);
    const h = renderHook(() => useAssistantHints(101, { withStays: true }), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(h.result.current.hints.some((x) => x.rule === 'noStay')).toBe(false);
  });
});

describe('P04ag actual native PDF builder and owning callback', () => {
  it.each(['plugins', 'route', 'map', 'photos'] as const)(
    'a pending %s step cannot publish or continue after navigation',
    async (step) => {
      const empty = () => ({ days: [], totalDistance: 0, totalDuration: 0 });
      const route = deferred(empty()),
        plugin = deferred({ sections: [] }),
        image = deferred(null as string | null),
        photo = deferred({ photoUrl: null });
      let reached = false;
      vi.spyOn(tripRoutes, 'routeTrip').mockImplementation(async () => {
        if (step === 'route') {
          reached = true;
          await route.promise;
        }
        return step === 'map'
          ? ({
              ...empty(),
              days: [
                {
                  dayId: 70,
                  dayNumber: 1,
                  lines: [],
                  color: { line: '#000000', casing: '#ffffff' },
                  distance: 0,
                  duration: 0,
                },
              ],
            } as never)
          : (empty() as never);
      });
      vi.spyOn(mapImages, 'renderTripMapImage').mockImplementation(async () => {
        reached = true;
        return image.promise;
      });
      server.use(
        http.get('/api/pdf-sections/101', async () => {
          if (step === 'plugins') {
            reached = true;
            await plugin.promise;
          }
          return HttpResponse.json({ sections: [] });
        })
      );
      vi.spyOn(mapsApi, 'placePhoto').mockImplementation(async () => {
        reached = true;
        return (await photo.promise) as never;
      });
      const args = pdfArgs();
      if (step === 'photos')
        args.assignments = {
          '70': [{ ...visit, place: { ...place, image_url: null, google_place_id: 'fixture' } }],
        } as never;
      const old = observe(downloadTripPDF(args));
      await waitFor(() => expect(reached).toBe(true));
      act(navigate);
      route.resolve(empty());
      plugin.resolve({ sections: [] });
      image.resolve('data:image/png;base64,fixture');
      photo.resolve({ photoUrl: null });
      expect(await old).toBeInstanceOf(Error);
      expect(document.getElementById('pdf-preview-overlay')).toBeNull();
    }
  );
  it('an open native preview is removed on logout/session replacement', async () => {
    vi.spyOn(tripRoutes, 'routeTrip').mockResolvedValue({ days: [], totalDistance: 0, totalDuration: 0 } as never);
    await downloadTripPDF(pdfArgs());
    expect(document.getElementById('pdf-preview-overlay')).not.toBeNull();
    await switchAccount();
    expect(document.getElementById('pdf-preview-overlay')).toBeNull();
  });
  it('Family stay unavailability does not produce a misleading empty native PDF', async () => {
    vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true);
    await expect(downloadTripPDF(pdfArgs())).rejects.toThrow();
    expect(document.getElementById('pdf-preview-overlay')).toBeNull();
  });
  it('the real Family PDF survives closing its export menu and leaves with its session', async () => {
    vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true);
    vi.spyOn(planExports, 'loadFamilyPlanExport').mockResolvedValue({
      tripTitle: 'Private Family plan',
      days: [],
      itemsByDayId: new Map(),
      placesById: new Map(),
    });
    const opts = exportOptions();
    const h = renderHook(() => useTripExport(opts));
    await act(async () => {
      await h.result.current.exportPdf();
    });
    expect(opts.onExported).toHaveBeenCalledOnce();
    h.unmount();
    useTripStore.setState({ budgetItems: [] });
    expect(document.getElementById('family-pdf-preview-overlay')).not.toBeNull();
    await switchAccount();
    expect(document.getElementById('family-pdf-preview-overlay')).toBeNull();
  });
  it('an obsolete PDF callback cannot toast or close the replacement export view', async () => {
    const reply = deferred({ sections: [] });
    let read = false;
    server.use(
      http.get('/api/pdf-sections/101', async () => {
        read = true;
        return HttpResponse.json(await reply.promise);
      })
    );
    vi.spyOn(tripRoutes, 'routeTrip').mockResolvedValue({ days: [], totalDistance: 0, totalDuration: 0 } as never);
    const opts = exportOptions();
    const h = renderHook((props) => useTripExport(props), { initialProps: opts });
    const old = observe(h.result.current.exportPdf());
    await waitFor(() => expect(read).toBe(true));
    act(navigate);
    h.rerender({ ...opts, tripId: 102 });
    reply.resolve({ sections: [] });
    await old;
    expect(opts.toast.error).not.toHaveBeenCalled();
    expect(opts.onExported).not.toHaveBeenCalled();
    expect(h.result.current.isRunning('pdf')).toBe(false);
    expect(document.getElementById('pdf-preview-overlay')).toBeNull();
  });
});
