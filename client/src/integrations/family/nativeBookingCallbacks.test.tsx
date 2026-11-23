import userEvent from '@testing-library/user-event';
import 'fake-indexeddb/auto';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useShallow } from 'zustand/react/shallow';
import { buildBudgetItem, buildTrip, buildTripFile } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import { ReservationModal } from '../../components/Planner/ReservationModal';
import { offlineDb } from '../../db/offlineDb';
import type { TripPlanner } from '../../mobile/screens/trip/MTripShell';
import MReservationSheet from '../../mobile/screens/trip/sheets/MReservationSheet';
import { installPlannerBookingPort } from '../../repo/plannerBookingPort';
import { useAddonStore } from '../../store/addonStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { createFamilyApplicationHandler } from './applicationHandler';
import { asReservationMetadata } from './legacy/data/supabase/tripReservations';
import { bookingJson, nativeBookingBaseline } from './nativeBookingDetails';
import { createPlannerBookingReader } from './plannerBookings';
import { PlannerCohortBookings } from './plannerCohortBookings';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';
const boundary = vi.hoisted(() => ({ rpc: vi.fn(), source: 'https://fixture.supabase.invalid' }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => boundary.source }));
vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en' }),
  translateApiError: (_t: unknown, e: Error) => e.message,
}));
vi.mock('../../components/shared/Toast', () => ({ useToast: () => toast }));
vi.mock('react-router', async (original) => ({
  ...(await original<typeof import('react-router')>()),
  useParams: () => ({ id: String(tripKey) }),
}));
vi.mock('../../components/shared/CustomDateTimePicker', () => ({
  CustomDatePicker: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="date picker" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('../../components/shared/CustomTimePicker', () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="time picker" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
const uuid = (n: number) => `d0410000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const trip = uuid(1),
  booking = uuid(2);
let tripKey: number, manager: PlannerCohortBookings, release: () => void, disposed: boolean, failRead: boolean;
const closed = vi.fn(),
  legacy = vi.fn(),
  toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  costOpened = vi.fn();
const originalAdapter = api.defaults.adapter;
let repo: FamilyFrontendRepository,
  session: FamilySession,
  current: ReturnType<typeof state>,
  saved: Map<string, unknown>;
function state() {
  return {
    record: {
      id: booking,
      trip_id: trip,
      type: 'restaurant',
      title: 'Repeat cafe',
      status: 'confirmed',
      starts_at: null as string | null,
      ends_at: null as string | null,
      start_trip_day_id: null,
      end_trip_day_id: null,
      confirmation_code: 'REF-1',
      notes: 'Personal',
      url: null,
      place_id: null,
      hotel_id: null,
      schedule_item_id: null,
      metadata: { price: 25, currency: 'MXN', keep: true },
      sort_order: 0,
      created_at: '2026-01-01T00:00:00+00:00',
    },
    dates: {
      reservation_id: booking,
      trip_id: trip,
      revision: 1,
      start_date: '2027-04-08',
      end_date: null as string | null,
      start_day_id: null,
      end_day_id: null,
    },
  };
}
async function native() {
  const r = current.record,
    views = await repo.views();
  return {
    ...views.reservation({
      id: r.id,
      tripId: r.trip_id,
      type: 'restaurant',
      title: r.title,
      status: 'confirmed',
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      startTripDayId: null,
      endTripDayId: null,
      confirmationCode: r.confirmation_code,
      notes: r.notes,
      url: r.url,
      placeId: null,
      hotelId: null,
      scheduleItemId: null,
      metadata: asReservationMetadata(r.metadata),
      sortOrder: 0,
      createdAt: r.created_at,
    }),
    reservation_time: r.starts_at ?? current.dates.start_date,
    reservation_end_time: r.ends_at ?? current.dates.end_date,
    family_booking_snapshot: structuredClone(current),
  };
}
function saves() {
  return boundary.rpc.mock.calls.filter(([name]) => name === 'save_family_booking_details_v1');
}
beforeEach(async () => {
  cleanup();
  resetAllStores();
  await resetOfflineTestDatabase();
  localStorage.clear();
  mutationQueue._resetFlushing();
  _resetNetworkMode();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  server.use(http.get('*/api/health', () => HttpResponse.json({ status: 'ok' })));
  boundary.source = 'https://fixture.supabase.invalid';
  boundary.rpc.mockReset();
  current = state();
  saved = new Map();
  session = {
    userId: uuid(3),
    familyId: uuid(4),
    personId: uuid(5),
    user: { username: 'Fixture', email: 'form@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  };
  repo = new FamilyFrontendRepository(async () => session);
  (await repo.views()).ids.register('trip', trip);
  api.defaults.adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(repo));
  boundary.rpc.mockImplementation(async (name, args) => {
    if (name === 'get_family_trip_booking_view_v1') {
      if (failRead) throw new Error('Refresh temporarily failed');
      return {
        data: {
          version: 1,
          trip_id: trip,
          family_id: session.familyId,
          user_id: session.userId,
          person_id: session.personId,
          trip_revision: 1,
          days: [],
          bookings: [{ ...structuredClone(current), visit_state: 'none', endpoints: [], legs: [] }],
        },
        error: null,
      };
    }
    if (name === 'get_family_booking_details_v1')
      return {
        data: {
          version: 1,
          trip_id: trip,
          family_id: session.familyId,
          user_id: session.userId,
          person_id: session.personId,
          observation: structuredClone(current),
        },
        error: null,
      };
    if (name !== 'save_family_booking_details_v1') throw new Error('Legacy fallback ' + name);
    if (!saved.has(args.p_operation_id)) {
      if (bookingJson(args.p_observation) !== bookingJson(current))
        return { data: null, error: { code: 'PT409', message: 'Stale original form' } };
      Object.assign(
        current.record,
        Object.fromEntries(Object.entries(args.p_changes).filter(([key]) => key !== 'dates'))
      );
      if (args.p_changes.dates)
        current.dates = { ...current.dates, ...args.p_changes.dates, revision: current.dates.revision + 1 };
      saved.set(args.p_operation_id, {
        version: 1,
        state: 'published',
        trip_id: trip,
        reservation_id: booking,
        operation_id: args.p_operation_id,
        changed: Object.keys(args.p_changes).length > 0,
        dates: structuredClone(current.dates),
      });
    }
    return { data: structuredClone(saved.get(args.p_operation_id)), error: null };
  });
  tripKey = (await repo.views()).ids.register('trip', trip);
  disposed = false;
  failRead = false;
  closed.mockReset();
  legacy.mockReset();
  costOpened.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
  useTripStore.setState({
    trip: buildTrip({ id: tripKey }),
    days: [],
    places: [],
    assignments: {},
    reservations: [await native()],
    files: [],
    budgetItems: [],
  });
  const reader = createPlannerBookingReader(
    repo,
    () => disposed,
    () => boundary.source
  );
  manager = new PlannerCohortBookings(
    repo,
    async () => {
      const snapshot = await reader.read(trip);
      useTripStore.setState({ reservations: snapshot.reservations });
    },
    () => disposed,
    () => boundary.source
  );
  const uninstall = installPlannerBookingPort({ open: (r) => manager.open(r) });
  release = () => {
    disposed = true;
    manager.reset();
    uninstall();
  };
});
afterEach(async () => {
  cleanup();
  release();
  api.defaults.adapter = originalAdapter;
  setAuthed(false);
  _resetNetworkMode();
  await resetOfflineTestDatabase();
});
function Desktop({
  original = useTripStore.getState().reservations[0],
  existing = true,
  prefill = null,
  reopenable = false,
}: {
  original?: import('../../types').Reservation;
  existing?: boolean;
  reopenable?: boolean;
  prefill?: import('../../components/Planner/parsedItemToDraft').BookingReviewDraft | null;
}) {
  const [open, setOpen] = useState(true),
    state = useTripStore(
      useShallow((s) => ({ days: s.days, places: s.places, assignments: s.assignments, files: s.files }))
    );
  const editor = (
    <ReservationModal
      isOpen={open}
      onClose={() => {
        closed();
        setOpen(false);
      }}
      onSave={legacy}
      reservation={existing ? original : null}
      prefill={prefill}
      days={state.days}
      places={state.places}
      assignments={state.assignments}
      selectedDayId={null}
      files={state.files}
      accommodations={[]}
      onFileUpload={async () => {
        legacy('upload');
      }}
      onFileDelete={async () => {
        legacy('delete file');
      }}
      tripMembers={[{ id: 1, username: 'Alice' }]}
      onOpenExpense={costOpened}
    />
  );
  return (
    <>
      {reopenable && !open && (
        <button type="button" onClick={() => setOpen(true)}>
          Reopen booking
        </button>
      )}
      {editor}
    </>
  );
}
function Phone({
  existing = true,
  imported = false,
  reopenable = false,
}: {
  existing?: boolean;
  imported?: boolean;
  reopenable?: boolean;
}) {
  const [open, setOpen] = useState(true),
    [original] = useState(useTripStore.getState().reservations[0]),
    state = useTripStore(
      useShallow((s) => ({ days: s.days, places: s.places, assignments: s.assignments, files: s.files }))
    );
  const planner = {
    t: (key: string) => key,
    toast,
    tripId: tripKey,
    days: state.days,
    places: state.places,
    tripAccommodations: [],
    tripMembers: [{ id: 1, username: 'Alice' }],
    selectedDayId: null,
    showReservationModal: open,
    setShowReservationModal: (value: boolean) => {
      if (!value) closed();
      setOpen(value);
    },
    editingReservation: existing ? original : null,
    setEditingReservation: vi.fn(),
    reservationPrefill: null,
    bookingForAssignmentId: null,
    setBookingForAssignmentId: vi.fn(),
    assignments: state.assignments,
    importReviewActive: imported,
    advanceImportReview: legacy,
    handleSaveReservation: legacy,
    canUploadFiles: true,
    setReservationModalDayId: vi.fn(),
    reservationModalDayId: null,
    tripActions: { addFile: legacy },
  } as unknown as TripPlanner;
  const editor = <MReservationSheet planner={planner} onOpenExpense={costOpened} />;
  return (
    <>
      {reopenable && !open && (
        <button type="button" onClick={() => setOpen(true)}>
          Reopen booking
        </button>
      )}
      {editor}
    </>
  );
}
async function shown(shell: 'desktop' | 'phone', expectContext = true) {
  render(shell === 'desktop' ? <Desktop /> : <Phone />);
  await screen.findByDisplayValue('Repeat cafe');
  if (expectContext)
    await waitFor(() =>
      expect(boundary.rpc.mock.calls.some(([name]) => name === 'get_family_booking_details_v1')).toBe(true)
    );
}
function update() {
  fireEvent.click(screen.getByRole('button', { name: 'common.update' }));
}
function notes(value: string) {
  fireEvent.change(screen.getByPlaceholderText('reservations.notesPlaceholder'), { target: { value } });
}
async function success() {
  await waitFor(() => expect(closed).toHaveBeenCalledOnce());
  expect(legacy).not.toHaveBeenCalled();
}
function enableCosts() {
  useAddonStore.setState({ addons: [{ id: 'budget', name: 'Budget', type: 'budget', icon: '', enabled: true }] });
}
describe('P04r native desktop and phone callback cutover', () => {
  it.each(['desktop', 'phone'] as const)(
    '%s Update persists notes and refreshes from a new coherent read',
    async (shell) => {
      await shown(shell);
      notes('Actual native notes');
      update();
      await success();
      expect(current.record.notes).toBe('Actual native notes');
      expect(saves()).toHaveLength(1);
      expect(useTripStore.getState().reservations[0].notes).toBe('Actual native notes');
      expect(current.record.starts_at).toBeNull();
      expect(current.record.metadata.keep).toBe(true);
    }
  );
  it.each(['desktop', 'phone'] as const)('%s date-only edit remains a civil date', async (shell) => {
    await shown(shell);
    fireEvent.change(screen.getAllByRole('textbox', { name: 'date picker' })[0], { target: { value: '2027-04-09' } });
    update();
    await success();
    expect(saves()[0][1].p_changes).toEqual({ dates: { start_date: '2027-04-09', end_date: null } });
    expect(current.record.starts_at).toBeNull();
  });
  it.each(['desktop', 'phone'] as const)(
    '%s clock edit refuses the whole save and preserves typed notes',
    async (shell) => {
      await shown(shell);
      notes('Keep dirty notes');
      fireEvent.change(screen.getAllByRole('textbox', { name: 'time picker' })[0], { target: { value: '19:00' } });
      update();
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(saves()).toHaveLength(0);
      expect(closed).not.toHaveBeenCalled();
      expect(screen.getByPlaceholderText('reservations.notesPlaceholder')).toHaveValue('Keep dirty notes');
    }
  );
  it.each(['desktop', 'phone'] as const)(
    '%s unchanged confirmed midnight/precision survives notes edit',
    async (shell) => {
      current.record.starts_at = '2027-04-08T00:00:00.123456+00:00';
      useTripStore.setState({ reservations: [await native()] });
      await shown(shell);
      notes('Preserve exact appointment');
      update();
      await success();
      expect(current.record.starts_at).toContain('.123456');
      expect(saves()[0][1].p_changes).toEqual({ notes: 'Preserve exact appointment' });
    }
  );
  it.each(['desktop', 'phone'] as const)('%s lost acknowledgement retries the same native intent', async (shell) => {
    await shown(shell);
    const impl = boundary.rpc.getMockImplementation();
    boundary.rpc.mockImplementationOnce(async (...args) => {
      await impl?.(...args);
      throw new Error('Lost acknowledgement');
    });
    notes('Retry original');
    update();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(closed).not.toHaveBeenCalled();
    update();
    await success();
    expect(saves()[0]).toEqual(saves()[1]);
    expect(saved.size).toBe(1);
  });
  it.each(['desktop', 'phone'] as const)(
    '%s committed save with failed refresh stays open and retries without overwriting later work',
    async (shell) => {
      await shown(shell);
      failRead = true;
      notes('Committed original');
      update();
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(closed).not.toHaveBeenCalled();
      expect(current.record.notes).toBe('Committed original');
      current.record.notes = 'Later independent edit';
      failRead = false;
      update();
      await success();
      expect(saved.size).toBe(1);
      expect(useTripStore.getState().reservations[0].notes).toBe('Later independent edit');
    }
  );
  it.each(['desktop', 'phone'] as const)('%s traveler change cannot partially save the header', async (shell) => {
    await shown(shell);
    notes('No partial notes');
    if (shell === 'desktop')
      fireEvent.click(
        screen.getByRole('button', {
          name: /reservations.travelers.assign|reservations.travelers.select|reservations.assignTravelers/,
        })
      );
    fireEvent.click(screen.getByText('Alice'));
    update();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(saves()).toHaveLength(0);
    expect(current.record.notes).toBe('Personal');
    expect(legacy).not.toHaveBeenCalled();
  });
  it.each(['desktop', 'phone'] as const)('%s create-cost action refuses before saving the booking', async (shell) => {
    enableCosts();
    await shown(shell);
    notes('No cost half save');
    fireEvent.click(screen.getByRole('button', { name: /reservations.createExpense|reservations.addExpense/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(saves()).toHaveLength(0);
    expect(costOpened).not.toHaveBeenCalled();
  });
  it.each(['desktop', 'phone'] as const)('%s Cancel performs no write', async (shell) => {
    await shown(shell);
    notes('Discard');
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    await waitFor(() => expect(closed).toHaveBeenCalledOnce());
    expect(saves()).toHaveLength(0);
    expect(legacy).not.toHaveBeenCalled();
  });
  it.each(['desktop', 'phone'] as const)(
    '%s editor disposal never falls back to the native legacy callback',
    async (shell) => {
      await shown(shell);
      release();
      notes('Old editor');
      update();
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(saves()).toHaveLength(0);
      expect(legacy).not.toHaveBeenCalled();
    }
  );
  it.each(['desktop', 'phone'] as const)('%s changed account refuses before RPC', async (shell) => {
    await shown(shell);
    session = { ...session, userId: uuid(80) };
    repo.acceptSession(session);
    notes('Wrong account');
    update();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(saves()).toHaveLength(0);
    expect(legacy).not.toHaveBeenCalled();
  });
  it.each(['desktop', 'phone'] as const)('%s changed visible Trip refuses before RPC', async (shell) => {
    await shown(shell);
    useTripStore.setState({ trip: buildTrip({ id: 999 }) });
    notes('Other Trip');
    update();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(saves()).toHaveLength(0);
  });
  it.each(['desktop', 'phone'] as const)('%s private layer refuses without a published fallback', async (shell) => {
    repo.setLayer(trip, 'myDraft');
    await shown(shell, false);
    notes('Private');
    update();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(saves()).toHaveLength(0);
    expect(legacy).not.toHaveBeenCalled();
  });
  it('desktop immediate upload is refused before any upload or header save', async () => {
    await shown('desktop');
    const input = document.querySelector('input[type=file]');
    expect(input).not.toBeNull();
    fireEvent.change(input as HTMLInputElement, { target: { files: [new File(['x'], 'test.txt')] } });
    expect(toast.error).toHaveBeenCalled();
    expect(legacy).not.toHaveBeenCalled();
    expect(saves()).toHaveLength(0);
  });
  it('phone pending files refuse before the booking is saved', async () => {
    await shown('phone');
    const input = document.querySelector('input[type=file]');
    expect(input).not.toBeNull();
    fireEvent.change(input as HTMLInputElement, { target: { files: [new File(['x'], 'test.txt')] } });
    notes('No file half save');
    update();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(saves()).toHaveLength(0);
    expect(legacy).not.toHaveBeenCalled();
  });
  it.each(['desktop', 'phone'] as const)(
    '%s creation remains guarded before any import/stay side effects',
    async (shell) => {
      render(shell === 'desktop' ? <Desktop existing={false} /> : <Phone existing={false} />);
      await screen.findByPlaceholderText('reservations.titlePlaceholder');
      fireEvent.change(screen.getByPlaceholderText('reservations.titlePlaceholder'), {
        target: { value: 'New booking' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'common.add' }));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(saves()).toHaveLength(0);
      expect(legacy).not.toHaveBeenCalled();
    }
  );
});
describe('P04r immediate companion actions and late completions', () => {
  it('desktop unlink refusal keeps the attached file visible', async () => {
    const unlink = vi.fn(),
      r = useTripStore.getState().reservations[0];
    useTripStore.setState({
      files: [buildTripFile({ id: 7, trip_id: tripKey, reservation_id: r.id, original_name: 'keep.pdf' })],
      unlinkFileFromReservation: unlink,
    });
    await shown('desktop');
    fireEvent.click(screen.getByRole('button', { name: 'files.unlink' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(unlink).not.toHaveBeenCalled();
    expect(screen.getByText('keep.pdf')).toBeInTheDocument();
    expect(saves()).toHaveLength(0);
  });
  it.each(['desktop', 'phone'] as const)(
    '%s immediate cost unlink refuses without local or backend changes',
    async (shell) => {
      enableCosts();
      const patch = vi.fn(),
        r = useTripStore.getState().reservations[0];
      useTripStore.setState({
        budgetItems: [buildBudgetItem({ id: 7, trip_id: tripKey, reservation_id: r.id, name: 'Keep linked cost' })],
        updateBudgetItem: patch,
      });
      await shown(shell);
      fireEvent.click(screen.getByRole('button', { name: 'reservations.unlinkExpense' }));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(patch).not.toHaveBeenCalled();
      expect(useTripStore.getState().budgetItems[0].reservation_id).toBe(r.id);
      expect(saves()).toHaveLength(0);
    }
  );
  it.each(['desktop', 'phone'] as const)(
    '%s immediate cost deletion refuses before the delete callback',
    async (shell) => {
      enableCosts();
      const remove = vi.fn(),
        r = useTripStore.getState().reservations[0];
      useTripStore.setState({
        budgetItems: [buildBudgetItem({ id: 7, trip_id: tripKey, reservation_id: r.id, name: 'Keep cost' })],
        deleteBudgetItem: remove,
      });
      await shown(shell);
      fireEvent.click(screen.getByRole('button', { name: 'reservations.removeExpense' }));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(remove).not.toHaveBeenCalled();
      expect(saves()).toHaveLength(0);
    }
  );
  it.each(['desktop', 'phone'] as const)(
    '%s existing cost edit refuses before a header save or expense editor',
    async (shell) => {
      enableCosts();
      const r = useTripStore.getState().reservations[0];
      useTripStore.setState({
        budgetItems: [buildBudgetItem({ id: 7, trip_id: tripKey, reservation_id: r.id, name: 'Keep cost' })],
      });
      await shown(shell);
      notes('No cost partial');
      fireEvent.click(screen.getByRole('button', { name: 'common.edit' }));
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(costOpened).not.toHaveBeenCalled();
      expect(saves()).toHaveLength(0);
    }
  );
  it.each(['desktop', 'phone'] as const)('%s offline Save preserves edits and makes no command RPC', async (shell) => {
    await shown(shell);
    notes('Keep until reconnected');
    setForcedOffline(true);
    update();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(saves()).toHaveLength(0);
    expect(closed).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('reservations.notesPlaceholder')).toHaveValue('Keep until reconnected');
  });
  it('a late committed reply after Cancel cannot close a new editor or hydrate old state', async () => {
    await shown('desktop');
    let acknowledge: () => void = () => {
      throw new Error('not pending');
    };
    const impl = boundary.rpc.getMockImplementation();
    boundary.rpc.mockImplementationOnce(async (...args) => {
      const answer = await impl?.(...args);
      await new Promise<void>((resolve) => {
        acknowledge = resolve;
      });
      return answer;
    });
    notes('May have committed');
    update();
    await waitFor(() => expect(saved.size).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    acknowledge();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(closed).toHaveBeenCalledOnce();
    expect(useTripStore.getState().reservations[0].notes).toBe('Personal');
    expect(current.record.notes).toBe('May have committed');
  });
  it('refreshing store props does not reinitialize a dirty desktop form or rebase its observation', async () => {
    await shown('desktop');
    notes('Typed note survives');
    act(() => useTripStore.setState({ places: [], files: [] }));
    expect(screen.getByPlaceholderText('reservations.notesPlaceholder')).toHaveValue('Typed note survives');
    update();
    await success();
    expect(saves()[0][1].p_observation.record.notes).toBe('Personal');
  });
  it.each(['desktop', 'phone'] as const)('%s keeps a dirty booking until the user discards it', async (shell) => {
    const user = userEvent.setup();
    render(shell === 'desktop' ? <Desktop reopenable /> : <Phone reopenable />);
    const field = await screen.findByDisplayValue('Personal');
    const dismiss = async () => {
      if (shell === 'desktop') {
        await user.keyboard('{Escape}');
        return;
      }
      const backdrop = screen.getByRole('dialog').closest<HTMLElement>('[role="presentation"]');
      if (!backdrop) throw new Error('Missing booking sheet backdrop');
      await user.click(backdrop);
    };
    const question = () => within(screen.getByRole('alertdialog', { name: 'common.unsavedTitle' }));

    await user.type(field, ' unsaved');
    await dismiss();
    expect(closed).not.toHaveBeenCalled();
    await user.click(question().getByRole('button', { name: 'common.keepEditing' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(field).toHaveValue('Personal unsaved');

    await dismiss();
    await user.click(question().getByRole('button', { name: 'common.discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(closed).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Reopen booking' }));
    expect(await screen.findByPlaceholderText('reservations.notesPlaceholder')).toHaveValue('Personal');
    await waitFor(() =>
      expect(boundary.rpc.mock.calls.map(([name]) => name)).toEqual([
        'get_family_booking_details_v1',
        'get_family_booking_details_v1',
      ])
    );
    await dismiss();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(closed).toHaveBeenCalledTimes(2);

    expect(legacy).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(current.record.notes).toBe('Personal');
    expect(useTripStore.getState().reservations[0].notes).toBe('Personal');
  });

  it.each(['desktop', 'phone'] as const)('%s backend refusal leaves the form open and dirty', async (shell) => {
    await shown(shell);
    boundary.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Current permission denied' } });
    notes('Not published');
    update();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(closed).not.toHaveBeenCalled();
    expect(current.record.notes).toBe('Personal');
    expect(screen.getByPlaceholderText('reservations.notesPlaceholder')).toHaveValue('Not published');
  });
});
describe('P04r durable original booking intent', () => {
  it('opening an edit retains the original reservation even if the caller changes it before the read completes', async () => {
    const original = structuredClone(useTripStore.getState().reservations[0]);
    const originalId = original.id;
    const request = { tripId: tripKey, original, accommodations: [], places: [], withCheckInEnd: false };
    const values = nativeBookingBaseline(original, request);
    const opening = manager.open(request);
    original.id += 1000;
    original.notes = 'Later caller mutation';
    request.original = { ...original, id: originalId + 2000 };

    const editor = await opening;
    const refreshed = await editor.save({ ...values, notes: 'Save on the original booking' }, []);
    expect(refreshed.id).toBe(originalId);
    expect(refreshed.notes).toBe('Save on the original booking');
    expect(saves()).toHaveLength(1);
    expect(saves()[0][1].p_observation.record).toMatchObject({ id: booking, notes: 'Personal' });
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('successful acknowledgement removes only its own retained command', async () => {
    await shown('desktop');
    notes('Durable success');
    update();
    await success();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('a lost reply survives close/disposal and replays through the ordinary HTTP/IndexedDB coordinator', async () => {
    await shown('desktop');
    const impl = boundary.rpc.getMockImplementation();
    boundary.rpc.mockImplementationOnce(async (...args) => {
      await impl?.(...args);
      throw new TypeError('Lost reply');
    });
    notes('Retained original');
    update();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const pending = await offlineDb.mutationQueue.toArray();
    expect(pending).toHaveLength(1);
    const original = structuredClone(pending[0].body);
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    release();
    await mutationQueue.flush();
    expect(saved.size).toBe(1);
    expect(current.record.notes).toBe('Retained original');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(saves()[0][1].p_observation).toEqual(saves()[1][1].p_observation);
    expect(saves()[0][1].p_operation_id).toBe((original as { operation_id: string }).operation_id);
  });
  it('a foreign session parks a retained original without replacing its scope or UUID', async () => {
    await shown('desktop');
    boundary.rpc.mockRejectedValueOnce(new TypeError('No connection'));
    notes('Original account');
    update();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const before = (await offlineDb.mutationQueue.toArray())[0];
    release();
    session = { ...session, userId: uuid(89) };
    repo.acceptSession(session);
    await mutationQueue.flush();
    expect((await offlineDb.mutationQueue.get(before.id))?.body).toEqual(before.body);
    expect(saves()).toHaveLength(1);
  });
  it('failed local persistence prevents a remote write', async () => {
    await shown('desktop');
    const write = vi.spyOn(mutationQueue, 'enqueue').mockRejectedValueOnce(new Error('Local storage unavailable'));
    notes('Not sent');
    update();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(saves()).toHaveLength(0);
    expect(current.record.notes).toBe('Personal');
    write.mockRestore();
  });
  it('business refusal is retained as failed without an automatic retry loop', async () => {
    await shown('desktop');
    boundary.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Permission denied' } });
    notes('Refused original');
    update();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const rows = await offlineDb.mutationQueue.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('failed');
    expect(rows[0].body).toMatchObject({ changes: { notes: 'Refused original' } });
    await mutationQueue.flush();
    expect(saves()).toHaveLength(1);
  });
});
