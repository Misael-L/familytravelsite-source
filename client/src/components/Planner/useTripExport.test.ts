// FE-PLANNER-TRIPEXPORT-001 to -013: the trip exports behind the desktop export
// dialog and the phone's export sheet.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { buildAssignment, buildReservation, buildTrip, buildUser } from '../../../tests/helpers/factories';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import type { FamilyControllerValue } from '../../integrations/family/controllerContext';
import { FamilyIdentityRegistry } from '../../integrations/family/identity';
import type { FamilyScheduleItem } from '../../integrations/family/legacy/data/supabase/scheduleItems';
import type { FamilyTripDay } from '../../integrations/family/legacy/data/supabase/tripDays';
import type { FamilyTripPlace } from '../../integrations/family/legacy/data/supabase/tripPlaces';
import { familyFrontend, type FamilyCore } from '../../integrations/family/repository';
import { useFamilyUiPermissions } from '../../integrations/family/uiPermissions';
import { FamilyViews } from '../../integrations/family/views';
import { useAuthStore } from '../../store/authStore';
import type { DayNote } from '../../types';
import { downloadTripPDF } from '../PDF/TripPDF';
import { flatDayNotes, saveBlob, useTripExport, type TripExportOptions } from './useTripExport';

const familyFlag = vi.hoisted(() => ({ on: false }));

vi.mock('../PDF/TripPDF', () => ({ downloadTripPDF: vi.fn() }));
vi.mock('../../integrations/family/runtime', () => ({
  isFamilyFrontendActive: () => familyFlag.on,
}));

const FAMILY_TRIP = '11111111-1111-4111-8111-111111111111';
const t = (key: string) => key;
const trip = buildTrip({ id: 3, title: 'Alps' });
const NOTES = { '7': [{ id: 1, text: 'Pack' }] as unknown as DayNote[] };

function options(overrides: Partial<TripExportOptions> = {}): TripExportOptions {
  return {
    tripId: 3,
    open: true,
    data: { trip, days: [], places: [], assignments: {}, categories: [], reservations: [], dayNotes: NOTES },
    t,
    locale: 'en-US',
    toast: { error: vi.fn(), info: vi.fn() },
    exclusive: true,
    onExported: vi.fn(),
    requireTrip: false,
    closeAfterPdf: true,
    logPdfErrors: true,
    ...overrides,
  };
}

/** How the phone sheet runs the hook. */
const PHONE: Partial<TripExportOptions> = {
  exclusive: false,
  requireTrip: true,
  closeAfterPdf: false,
  logPdfErrors: false,
};

const response = (status: number) =>
  ({ ok: status >= 200 && status < 300, status, blob: async () => new Blob(['x']) }) as unknown as Response;

/** A promise the test settles by hand, to look at the hook while an export runs. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let fetchSpy: MockInstance<typeof fetch>;
let clickSpy: MockInstance<() => void>;

beforeEach(() => {
  familyFlag.on = false;
  resetAllStores();
  vi.mocked(downloadTripPDF).mockReset().mockResolvedValue(undefined);
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(200));
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:trek/file');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('flatDayNotes and saveBlob', () => {
  it('FE-PLANNER-TRIPEXPORT-001: the day notes come as one list that names each day', () => {
    expect(flatDayNotes({ '2': [{ id: 1 }, { id: 2 }] as DayNote[], '5': [{ id: 3 }] as DayNote[] })).toEqual([
      { id: 1, day_id: 2 },
      { id: 2, day_id: 2 },
      { id: 3, day_id: 5 },
    ]);
  });

  it('FE-PLANNER-TRIPEXPORT-002: a file is handed over under its name and its URL let go a moment later', () => {
    vi.useFakeTimers();
    saveBlob(new Blob(['x']), 'Alps.ics');
    const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('Alps.ics');
    expect(anchor.getAttribute('href')).toBe('blob:trek/file');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:trek/file');
    expect(document.body.contains(anchor)).toBe(false);
  });
});

describe('useTripExport', () => {
  it('FE-PLANNER-TRIPEXPORT-003: names the files after the trip and offers my plan once somebody has a part', () => {
    expect(renderHook(() => useTripExport(options())).result.current).toMatchObject({
      fileBase: 'Alps',
      offerMine: false,
    });
    const untitled = options({ data: { ...options().data, trip: null } });
    expect(renderHook(() => useTripExport(untitled)).result.current.fileBase).toBe('trip');

    seedStore(useAuthStore, { user: buildUser({ id: 9 }) });
    const shared = options({
      data: { ...options().data, reservations: [buildReservation({ travelers: [{ user_id: 9, username: 'me' }] })] },
    });
    expect(renderHook(() => useTripExport(shared)).result.current.offerMine).toBe(true);
    const assigned = options({
      data: {
        ...options().data,
        assignments: { '1': [buildAssignment({ participants: [{ user_id: 9, username: 'me' }] })] },
      },
    });
    expect(renderHook(() => useTripExport(assigned)).result.current.offerMine).toBe(true);
  });

  it('FE-PLANNER-TRIPEXPORT-004: the PDF gets the whole plan, or only mine, and the desktop closes once it is out', async () => {
    seedStore(useAuthStore, { user: buildUser({ id: 9 }) });
    const opts = options();
    const { result } = renderHook(() => useTripExport(opts));
    await act(() => result.current.exportPdf());
    expect(downloadTripPDF).toHaveBeenCalledWith(
      expect.objectContaining({
        trip,
        dayNotes: [{ id: 1, text: 'Pack', day_id: 7 }],
        locale: 'en-US',
        onlyUserId: undefined,
      })
    );
    expect(opts.onExported).toHaveBeenCalledTimes(1);
    await act(() => result.current.exportPdf(true));
    expect(vi.mocked(downloadTripPDF).mock.calls[1][0]).toMatchObject({ onlyUserId: 9 });
  });

  it('FE-PLANNER-TRIPEXPORT-005: the phone stays open after the PDF and prints nothing without a trip', async () => {
    const opts = options(PHONE);
    const { result } = renderHook(() => useTripExport(opts));
    await act(() => result.current.exportPdf());
    expect(downloadTripPDF).toHaveBeenCalledTimes(1);
    expect(opts.onExported).not.toHaveBeenCalled();

    const noTrip = renderHook(() => useTripExport({ ...opts, data: { ...opts.data, trip: null } })).result;
    await act(() => noTrip.current.exportPdf());
    expect(downloadTripPDF).toHaveBeenCalledTimes(1);
  });

  it('FE-PLANNER-TRIPEXPORT-006: a failed PDF says why; only the desktop also logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(downloadTripPDF).mockRejectedValue(new Error('font missing'));
    const desktop = options();
    const d = renderHook(() => useTripExport(desktop)).result;
    await act(() => d.current.exportPdf());
    expect(desktop.toast.error).toHaveBeenCalledWith('dayplan.pdfError: font missing');
    expect(desktop.onExported).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);

    vi.mocked(downloadTripPDF).mockRejectedValue('renderer gone');
    const phone = options(PHONE);
    const p = renderHook(() => useTripExport(phone)).result;
    await act(() => p.current.exportPdf());
    expect(phone.toast.error).toHaveBeenCalledWith('dayplan.pdfError: renderer gone');
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('FE-PLANNER-TRIPEXPORT-007: on the desktop one running export holds every other', async () => {
    const pdf = deferred();
    vi.mocked(downloadTripPDF).mockReturnValue(pdf.promise);
    const { result } = renderHook(() => useTripExport(options()));
    let running!: Promise<void>;
    act(() => {
      running = result.current.exportPdf();
    });
    await vi.waitFor(() => expect(downloadTripPDF).toHaveBeenCalled());
    expect(result.current.isRunning('pdf')).toBe(true);
    expect(result.current.isRunning('pdf:mine')).toBe(false);
    expect(result.current.anyRunning).toBe(true);
    await act(() => result.current.downloadIcs());
    expect(fetchSpy).not.toHaveBeenCalled();
    await act(async () => {
      pdf.resolve();
      await running;
    });
    expect(result.current.anyRunning).toBe(false);
  });

  it('FE-PLANNER-TRIPEXPORT-008: on the phone a running PDF holds only another PDF', async () => {
    const pdf = deferred();
    vi.mocked(downloadTripPDF).mockReturnValue(pdf.promise);
    const opts = options(PHONE);
    const { result } = renderHook(() => useTripExport(opts));
    let running!: Promise<void>;
    act(() => {
      running = result.current.exportPdf();
    });
    await vi.waitFor(() => expect(downloadTripPDF).toHaveBeenCalledTimes(1));
    await act(() => result.current.exportPdf(true));
    expect(downloadTripPDF).toHaveBeenCalledTimes(1);
    await act(() => result.current.downloadIcs());
    expect(fetchSpy).toHaveBeenCalledWith('/api/trips/3/export.ics', { credentials: 'include' });
    expect(opts.onExported).toHaveBeenCalledTimes(1);
    expect(result.current.isRunning('pdf')).toBe(true);
    await act(async () => {
      pdf.resolve();
      await running;
    });
    expect(result.current.isRunning('pdf')).toBe(false);
  });

  it('FE-PLANNER-TRIPEXPORT-009: the calendar file is saved under the trip title, and a refusal says so', async () => {
    const opts = options();
    const { result } = renderHook(() => useTripExport(opts));
    await act(() => result.current.downloadIcs());
    expect((clickSpy.mock.contexts[0] as HTMLAnchorElement).download).toBe('Alps.ics');
    expect(opts.onExported).toHaveBeenCalledTimes(1);

    fetchSpy.mockResolvedValue(response(500));
    await act(() => result.current.downloadIcs());
    expect(opts.toast.error).toHaveBeenCalledWith('planner.icsExportFailed');
    expect(opts.onExported).toHaveBeenCalledTimes(1);
  });

  it('FE-PLANNER-TRIPEXPORT-010: a GPX scope asks for its own query; an empty one and a broken one say so apart', async () => {
    const opts = options();
    const { result } = renderHook(() => useTripExport(opts));
    await act(() => result.current.downloadGpx('places', '?dayRoutes=false'));
    expect(fetchSpy).toHaveBeenCalledWith('/api/trips/3/places/export.gpx?dayRoutes=false', { credentials: 'include' });
    expect((clickSpy.mock.contexts[0] as HTMLAnchorElement).download).toBe('Alps.gpx');
    expect(opts.onExported).toHaveBeenCalledTimes(1);

    fetchSpy.mockResolvedValue(response(404));
    await act(() => result.current.downloadGpx('all', ''));
    expect(opts.toast.info).toHaveBeenCalledWith('dayplan.gpxEmpty');
    expect(opts.toast.error).not.toHaveBeenCalled();

    fetchSpy.mockRejectedValue(new Error('offline'));
    await act(() => result.current.downloadGpx('all', ''));
    expect(opts.toast.error).toHaveBeenCalledWith('dayplan.gpxFailed');
    expect(opts.onExported).toHaveBeenCalledTimes(1);
    expect(result.current.anyRunning).toBe(false);
  });

  it('FE-PLANNER-TRIPEXPORT-011: the PDF routes what the planner draws, counts its legs and can print without the rest', async () => {
    const pdf = deferred();
    vi.mocked(downloadTripPDF).mockReturnValue(pdf.promise);
    const viasByDay = { 7: [] };
    const tourStageStops = new Map();
    const opts = options({ data: { ...options().data, viasByDay, tourStageStops } });
    const { result } = renderHook(() => useTripExport(opts));
    let running!: Promise<void>;
    act(() => {
      running = result.current.exportPdf();
    });
    await vi.waitFor(() => expect(downloadTripPDF).toHaveBeenCalled());
    const { route } = vi.mocked(downloadTripPDF).mock.calls[0][0];
    expect(route).toMatchObject({ viasByDay, tourStageStops });
    expect(result.current.pdfRouting).toBeNull();

    act(() => route?.onProgress?.(0, 60));
    act(() => route?.onProgress?.(23, 60));
    expect(result.current.pdfRouting).toEqual({ done: 23, total: 60 });
    expect(result.current.pdfRoutingLabel('pdf')).toBe('dayplan.pdfRouting');
    expect(result.current.pdfRoutingLabel('pdf:mine')).toBeNull();

    // Skipping stops the routing, not the export: the document still comes out.
    act(() => result.current.skipPdfRouting());
    expect(route?.signal?.aborted).toBe(true);
    expect(vi.mocked(downloadTripPDF).mock.calls[0][0].signal?.aborted).toBe(false);
    expect(result.current.pdfRouting).toBeNull();
    // The leg that was already on its way still reports; the row does not come back for it.
    act(() => route?.onProgress?.(24, 60));
    expect(result.current.pdfRouting).toBeNull();
    expect(result.current.isRunning('pdf')).toBe(true);
    await act(async () => {
      pdf.resolve();
      await running;
    });
    expect(result.current.anyRunning).toBe(false);
    expect(opts.onExported).toHaveBeenCalledTimes(1);
  });

  it('FE-PLANNER-TRIPEXPORT-012: closing the dialog while the PDF routes gives the export up, and nothing opens', async () => {
    const pdf = deferred();
    vi.mocked(downloadTripPDF).mockReturnValue(pdf.promise);
    const opts = options();
    const { result, rerender } = renderHook((open: boolean) => useTripExport({ ...opts, open }), {
      initialProps: true,
    });
    let running!: Promise<void>;
    act(() => {
      running = result.current.exportPdf();
    });
    await vi.waitFor(() => expect(downloadTripPDF).toHaveBeenCalled());
    const { route, signal } = vi.mocked(downloadTripPDF).mock.calls[0][0];

    rerender(false);
    expect(route?.signal?.aborted).toBe(true);
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      pdf.resolve();
      await running;
    });
    expect(opts.onExported).not.toHaveBeenCalled();
    expect(opts.toast.error).not.toHaveBeenCalled();
    expect(result.current.anyRunning).toBe(false);
  });

  it('FE-PLANNER-TRIPEXPORT-013: leaving the trip while the PDF routes gives the export up too', async () => {
    vi.mocked(downloadTripPDF).mockReturnValue(deferred().promise);
    const { result, unmount } = renderHook(() => useTripExport(options(PHONE)));
    act(() => {
      void result.current.exportPdf();
    });
    await vi.waitFor(() => expect(downloadTripPDF).toHaveBeenCalled());
    const { route, signal } = vi.mocked(downloadTripPDF).mock.calls[0][0];

    unmount();
    expect(route?.signal?.aborted).toBe(true);
    expect(signal?.aborted).toBe(true);
  });
});

function familyPlace(id: string, name: string): FamilyTripPlace {
  return {
    id,
    name,
    lat: null,
    lng: null,
    notes: null,
    timeZone: null,
    countryId: null,
    placeTypeId: null,
    isPrimary: false,
    imageUrl: null,
    familyPlaceCategoryId: null,
    familyPlaceCategoryName: null,
    familyPlaceCategoryColor: null,
    familyPlaceCategoryIcon: null,
  };
}

function familyDay(id: string, civilDay: string, dayIndex: number): FamilyTripDay {
  return { id, tripId: FAMILY_TRIP, civilDay, dayIndex, title: null };
}

function familyItem(id: string, activity: string, startsAt: string | null, placeId: string | null): FamilyScheduleItem {
  return {
    id,
    tripId: FAMILY_TRIP,
    activity,
    placeId,
    startsAt,
    endsAt: null,
    address: null,
    timeZone: null,
    sortOrder: 0,
    experienceId: null,
    foodId: null,
    linkUrl: null,
  };
}

function publishedPlan(): FamilyCore {
  return {
    trip: { id: FAMILY_TRIP, title: 'Lisbon' } as FamilyCore['trip'],
    days: [familyDay('day-1', '2026-06-01', 0), familyDay('day-2', '2026-06-02', 1)],
    places: [familyPlace('p1', 'Louvre'), familyPlace('p2', 'Borough Market')],
    schedule: [
      familyItem('a', 'Museum', '2026-06-01T10:00:00.000Z', 'p1'),
      familyItem('b', 'Market', '2026-06-02T15:00:00.000Z', 'p2'),
      familyItem('c', 'Undated', null, null),
    ],
    notes: [],
  };
}

function publishController(core: FamilyCore, partial = false, layer: 'published' | 'myDraft' = 'published') {
  const ids = new FamilyIdentityRegistry('22222222-2222-4222-8222-222222222222', undefined, () => 3);
  ids.register('trip', FAMILY_TRIP);
  vi.spyOn(familyFrontend, 'knownViews').mockReturnValue(new FamilyViews(ids));
  useFamilyUiPermissions.setState({
    controller: {
      core,
      partialLoad: { failed: partial, retry: () => {} },
      gov: { layer },
    } as unknown as FamilyControllerValue,
  });
}

describe('useTripExport Family plan', () => {
  beforeEach(() => {
    familyFlag.on = true;
    useFamilyUiPermissions.setState({ controller: null });
    document.getElementById('family-pdf-preview-overlay')?.remove();
  });

  afterEach(() => {
    useFamilyUiPermissions.setState({ controller: null });
    document.getElementById('family-pdf-preview-overlay')?.remove();
  });

  it('prints both civil days in the preview and the calendar, and leaves the undated item out', async () => {
    publishController(publishedPlan());
    const core = vi.spyOn(familyFrontend, 'core');
    const captured: { calendar: Blob | null } = { calendar: null };
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
      if (value instanceof Blob) captured.calendar = value;
      return 'blob:family';
    });
    const opts = options();
    const { result } = renderHook(() => useTripExport(opts));
    await act(() => result.current.exportPdf());
    const overlay = document.getElementById('family-pdf-preview-overlay');
    const frame = overlay?.querySelector('iframe');
    expect(overlay?.id).toBe('family-pdf-preview-overlay');
    expect(frame?.srcdoc).toContain('Lisbon');
    expect(frame?.srcdoc).toContain('Louvre');
    expect(frame?.srcdoc).toContain('Borough Market');
    expect(frame?.srcdoc).not.toContain('Undated');
    expect(opts.onExported).toHaveBeenCalledTimes(1);
    expect(downloadTripPDF).not.toHaveBeenCalled();

    await act(() => result.current.downloadIcs());
    const ics = await captured.calendar?.text();
    expect(ics?.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART:20260601T100000Z');
    expect(ics).toContain('DTSTART:20260602T150000Z');
    expect(ics).not.toContain('Undated');
    expect(opts.onExported).toHaveBeenCalledTimes(2);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(core).not.toHaveBeenCalled();
    expect(result.current.anyRunning).toBe(false);
  });

  it('keeps the desktop dialog open when the PDF preview should not close it', async () => {
    publishController(publishedPlan());
    const opts = options({ closeAfterPdf: false });
    const { result } = renderHook(() => useTripExport(opts));
    await act(() => result.current.exportPdf());
    expect(document.getElementById('family-pdf-preview-overlay')).not.toBeNull();
    expect(opts.onExported).not.toHaveBeenCalled();
    expect(result.current.anyRunning).toBe(false);
  });

  it('does not export or close when the controller is missing or the load is partial', async () => {
    const core = vi.spyOn(familyFrontend, 'core');
    const opts = options();
    const missing = renderHook(() => useTripExport(opts));
    await act(() => missing.result.current.exportPdf());
    await act(() => missing.result.current.downloadIcs());

    publishController(publishedPlan(), true);
    const partial = renderHook(() => useTripExport(opts));
    await act(() => partial.result.current.exportPdf());
    await act(() => partial.result.current.downloadIcs());

    expect(opts.onExported).not.toHaveBeenCalled();
    expect(core).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.getElementById('family-pdf-preview-overlay')).toBeNull();
    expect(missing.result.current.anyRunning).toBe(false);
    expect(partial.result.current.anyRunning).toBe(false);
  });

  it('exports the same published snapshot from My Draft without merging draft operations', async () => {
    const core = vi.spyOn(familyFrontend, 'core');
    const captured: { calendar: Blob | null } = { calendar: null };
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
      if (value instanceof Blob) captured.calendar = value;
      return 'blob:family';
    });
    publishController(publishedPlan(), false, 'myDraft');
    const state = useFamilyUiPermissions.getState().controller as unknown as {
      gov: { draftOps: Array<{ activity: string }> };
    };
    state.gov.draftOps = [{ activity: 'Draft only museum' }];
    const opts = options();
    const { result } = renderHook(() => useTripExport(opts));
    await act(() => result.current.exportPdf());
    const srcdoc = document.getElementById('family-pdf-preview-overlay')?.querySelector('iframe')?.srcdoc ?? '';
    expect(srcdoc).toContain('Lisbon');
    expect(srcdoc).toContain('Louvre');
    expect(srcdoc).toContain('Borough Market');
    expect(srcdoc).not.toContain('Draft only museum');
    expect(srcdoc).not.toContain('Undated');
    await act(() => result.current.downloadIcs());
    const ics = await captured.calendar?.text();
    expect(ics?.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART:20260601T100000Z');
    expect(ics).toContain('DTSTART:20260602T150000Z');
    expect(ics).not.toContain('Draft only museum');
    expect(opts.onExported).toHaveBeenCalledTimes(2);
    expect(core).not.toHaveBeenCalled();
    expect(result.current.anyRunning).toBe(false);
  });

  it('leaves my plan and every GPX scope unavailable', async () => {
    publishController(publishedPlan());
    const core = vi.spyOn(familyFrontend, 'core');
    const opts = options();
    const { result } = renderHook(() => useTripExport(opts));
    await act(() => result.current.exportPdf(true));
    await act(() => result.current.downloadGpx('all', ''));
    await act(() => result.current.downloadGpx('places', '?dayRoutes=false'));
    await act(() => result.current.downloadGpx('days', '?waypoints=false&tracks=false'));
    expect(core).not.toHaveBeenCalled();
    expect(downloadTripPDF).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(opts.onExported).not.toHaveBeenCalled();
    expect(document.getElementById('family-pdf-preview-overlay')).toBeNull();
    expect(result.current.anyRunning).toBe(false);
  });
});
