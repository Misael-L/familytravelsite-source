import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTrip } from '../../../tests/helpers/factories';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { ReservationModal } from '../../components/Planner/ReservationModal';
import type { TripPlanner } from '../../mobile/screens/trip/MTripShell';
import MReservationSheet from '../../mobile/screens/trip/sheets/MReservationSheet';
import { installPlannerBookingPort } from '../../repo/plannerBookingPort';
import { useTripStore } from '../../store/tripStore';
import { createFamilyApplicationHandler } from './applicationHandler';
import { createPlannerBookingReader } from './plannerBookings';
import { PlannerCohortBookings } from './plannerCohortBookings';
import { FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter } from './transport';

import api from '../../api/client';
const boundary = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:55331' }));
vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en' }),
  translateApiError: (_t: unknown, e: Error) => e.message,
}));
vi.mock('../../components/shared/Toast', () => ({ useToast: () => toast }));
vi.mock('react-router', async (original) => ({
  ...(await original<typeof import('react-router')>()),
  useParams: () => ({ id: String(key) }),
}));
vi.mock('../../components/shared/CustomDateTimePicker', () => ({
  CustomDatePicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="date picker" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
const fixturePath = process.env.FAMILY_NATIVE_BOOKING_FIXTURE;
const live = fixturePath
  ? (JSON.parse(readFileSync(fixturePath, 'utf8')) as {
      api: string;
      anon_key: string;
      access_token: string;
      trip_id: string;
      family_id: string;
      user_id: string;
      person_id: string;
      bookings: string[];
    })
  : null;
if (live && live.api !== 'http://127.0.0.1:55331') throw new Error('Refusing non-disposable live HTTP target');
const toast = { error: vi.fn(), success: vi.fn() },
  legacy = vi.fn(),
  closed = vi.fn(),
  oldAdapter = api.defaults.adapter;
let key: number, release: (() => void) | undefined, repo: FamilyFrontendRepository;
beforeEach(async () => {
  if (!live) return;
  resetAllStores();
  await resetOfflineTestDatabase();
  boundary.rpc.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
  legacy.mockReset();
  closed.mockReset();
  boundary.rpc.mockImplementation(async (name: string, args: unknown) => {
    const response = await fetch(live.api + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: live.anon_key,
        Authorization: 'Bearer ' + live.access_token,
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    return response.ok ? { data, error: null } : { data: null, error: data };
  });
  repo = new FamilyFrontendRepository(async () => ({
    userId: live.user_id,
    familyId: live.family_id,
    personId: live.person_id,
    user: { username: 'Synthetic AAL2', email: 'local@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  }));
  key = (await repo.views()).ids.register('trip', live.trip_id);
  api.defaults.adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(repo));
  const reader = createPlannerBookingReader(
      repo,
      () => false,
      () => live.api
    ),
    snapshot = await reader.read(live.trip_id);
  useTripStore.setState({
    trip: buildTrip({ id: key }),
    places: [],
    days: [],
    assignments: {},
    reservations: snapshot.reservations,
    budgetItems: [],
    files: [],
  });
  const manager = new PlannerCohortBookings(
    repo,
    async () => {
      const fresh = await reader.read(live.trip_id);
      useTripStore.setState({ reservations: fresh.reservations });
    },
    () => false,
    () => live.api
  );
  const uninstall = installPlannerBookingPort({ open: (r) => manager.open(r) });
  release = () => {
    manager.reset();
    uninstall();
  };
});
afterEach(async () => {
  cleanup();
  release?.();
  release = undefined;
  api.defaults.adapter = oldAdapter;
  await resetOfflineTestDatabase();
});
function Native({ index, phone = false }: { index: number; phone?: boolean }) {
  const [open, setOpen] = useState(true),
    [original] = useState(
      useTripStore
        .getState()
        .reservations.find(
          (r) =>
            (r as unknown as { family_booking_snapshot: { record: { id: string } } }).family_booking_snapshot.record
              .id === live?.bookings[index]
        )
    );
  if (phone) {
    const planner = {
      t: (k: string) => k,
      toast,
      tripId: key,
      days: [],
      places: [],
      tripAccommodations: [],
      tripMembers: [],
      selectedDayId: null,
      showReservationModal: open,
      setShowReservationModal: (v: boolean) => {
        if (!v) closed();
        setOpen(v);
      },
      editingReservation: original,
      setEditingReservation: vi.fn(),
      reservationPrefill: null,
      bookingForAssignmentId: null,
      setBookingForAssignmentId: vi.fn(),
      assignments: {},
      importReviewActive: false,
      advanceImportReview: legacy,
      handleSaveReservation: legacy,
      canUploadFiles: false,
      setReservationModalDayId: vi.fn(),
      reservationModalDayId: null,
      tripActions: { addFile: legacy },
    } as unknown as TripPlanner;
    return <MReservationSheet planner={planner} onOpenExpense={legacy} />;
  }
  return (
    <ReservationModal
      isOpen={open}
      reservation={original ?? null}
      onClose={() => {
        closed();
        setOpen(false);
      }}
      onSave={legacy}
      days={[]}
      places={[]}
      assignments={{}}
      selectedDayId={null}
      onFileDelete={legacy}
    />
  );
}
describe.skipIf(!live)('P04r real Auth/TOTP AAL2 HTTP native callbacks', () => {
  it.each([
    { index: 0, phone: false },
    { index: 1, phone: true },
  ])('actual $phone shell Update commits and refreshes the real booking', async ({ index, phone }) => {
    render(<Native index={index} phone={phone} />);
    await screen.findByDisplayValue('Native live ' + index);
    fireEvent.change(screen.getByPlaceholderText('reservations.notesPlaceholder'), {
      target: { value: 'Actual ' + (phone ? 'phone' : 'desktop') + ' live note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.update' }));
    await waitFor(() => expect(closed).toHaveBeenCalledOnce(), { timeout: 15000 });
    expect(toast.error).not.toHaveBeenCalled();
    expect(legacy).not.toHaveBeenCalled();
    const row = useTripStore.getState().reservations.find((r) => r.notes?.startsWith('Actual'));
    expect(row?.notes).toContain('live note');
    expect(row?.reservation_time).toBe('2027-04-08');
  });
  it('actual hotel form preserves confirmed microseconds hidden by native Save', async () => {
    render(<Native index={2} />);
    await screen.findByDisplayValue('Native live 2');
    fireEvent.change(screen.getByPlaceholderText('reservations.notesPlaceholder'), {
      target: { value: 'Hotel live notes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.update' }));
    await waitFor(() => expect(closed).toHaveBeenCalledOnce(), { timeout: 15000 });
    const row = useTripStore.getState().reservations.find((r) => r.notes === 'Hotel live notes');
    expect(row?.reservation_time).toBe('2027-04-01T00:00:00.123456+00:00');
    expect(legacy).not.toHaveBeenCalled();
  });
  it('actual date-only Save binds the real civil date without a midnight timestamp', async () => {
    render(<Native index={3} />);
    await screen.findByDisplayValue('Native live 3');
    fireEvent.change(screen.getAllByRole('textbox', { name: 'date picker' })[0], { target: { value: '2027-04-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.update' }));
    await waitFor(() => expect(closed).toHaveBeenCalledOnce(), { timeout: 15000 });
    const row = useTripStore.getState().reservations.find((r) => r.title === 'Native live 3') as unknown as {
      reservation_time: string;
      family_booking_snapshot: {
        record: { starts_at: string | null };
        dates: { start_date: string; start_day_id: string | null };
      };
    };
    expect(row.reservation_time).toBe('2027-04-02');
    expect(row.family_booking_snapshot.record.starts_at).toBeNull();
    expect(row.family_booking_snapshot.dates.start_day_id).not.toBeNull();
  });
});
