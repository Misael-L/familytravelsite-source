import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReservation, buildTrip, buildUser } from '../../../tests/helpers/factories';
import { cleanup, fireEvent, render, screen } from '../../../tests/helpers/render';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import { ReservationModal } from '../../components/Planner/ReservationModal';
import { TransportModal } from '../../components/Planner/TransportModal';
import { hotelStayTimes } from '../../components/Planner/bookings/bookingsModel';
import type { BookingReviewDraft } from '../../components/Planner/parsedItemToDraft';
import { reservationFieldsFrom } from '../../components/Planner/reservationFormModel';
import { installPlannerBookingPort } from '../../repo/plannerBookingPort';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import type { Accommodation } from '../../types';

vi.mock('react-router', async (load) => ({
  ...(await load<typeof import('react-router')>()),
  useParams: () => ({ id: '1' }),
}));
let release: () => void;
beforeEach(() => {
  resetAllStores();
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true });
  seedStore(useTripStore, { trip: buildTrip({ id: 1 }), budgetItems: [] });
  // A qualified Family port keeps unsupported creates gated; these tests inspect initialization only.
  release = installPlannerBookingPort({
    open: async () => {
      throw new Error('Creating bookings remains unavailable.');
    },
  });
});
afterEach(() => {
  cleanup();
  release();
});
const props = {
  isOpen: true,
  reservation: null,
  onClose: vi.fn(),
  onFileDelete: vi.fn<() => Promise<void>>(async () => {}),
  onSave: vi.fn<() => Promise<undefined>>(async () => undefined),
  days: [],
  places: [],
  assignments: {},
  selectedDayId: null,
  files: [],
  accommodations: [],
};
function draft(title: string, type: string): BookingReviewDraft & { title: string; type: string } {
  return { title, type, status: 'pending' };
}
function ui(shell: string, prefill: BookingReviewDraft, open = true) {
  const refreshed = {
    ...props,
    days: [...props.days],
    places: [...props.places],
    files: [...props.files],
    accommodations: [...props.accommodations],
  };
  return shell === 'booking' ? (
    <ReservationModal {...refreshed} prefill={prefill} isOpen={open} />
  ) : (
    <TransportModal {...refreshed} prefill={prefill} isOpen={open} />
  );
}
describe('U05-B2 native draft identity under Family initialization', () => {
  it.each(['booking', 'transport'])(
    '%s switches to a deliberately selected second import draft without closing',
    (shell) => {
      const first = draft('First reviewed item', shell === 'booking' ? 'event' : 'transport_other');
      const second = draft('Second reviewed item', first.type);
      const h = render(ui(shell, first));
      expect(screen.getByDisplayValue(first.title)).toBeInTheDocument();
      fireEvent.change(screen.getByDisplayValue(first.title), { target: { value: 'Typed first draft' } });
      h.rerender(ui(shell, second));
      expect(screen.getByDisplayValue(second.title)).toBeInTheDocument();
      expect(screen.queryByDisplayValue('Typed first draft')).toBeNull();
      expect(props.onSave).not.toHaveBeenCalled();
    }
  );
  it.each(['booking', 'transport'])(
    '%s keeps typed fields through refreshed arrays, then resets when reopened',
    (shell) => {
      const first = draft('Reviewed item', shell === 'booking' ? 'event' : 'transport_other');
      const h = render(ui(shell, first));
      fireEvent.change(screen.getByDisplayValue(first.title), { target: { value: 'Unsaved original' } });
      h.rerender(ui(shell, first));
      expect(screen.getByDisplayValue('Unsaved original')).toBeInTheDocument();
      h.rerender(ui(shell, first, false));
      h.rerender(ui(shell, first));
      expect(screen.getByDisplayValue(first.title)).toBeInTheDocument();
    }
  );
});

describe('U05-B2 native hotel form and card preserve check-in window provenance', () => {
  const stay: Accommodation = {
    id: 9,
    trip_id: 1,
    place_id: 4,
    start_day_id: 2,
    end_day_id: 3,
    check_in: '15:00',
    check_in_end: '22:00',
    check_out: '11:00',
    confirmation: null,
    notes: null,
  };
  it.each([
    [{ check_in_time: '14:00' }, '14:00', '', '11:00'],
    [{ check_in_time: '14:00', check_in_end_time: '20:00' }, '14:00', '20:00', '11:00'],
    [{ check_in_end_time: '20:00' }, '15:00', '22:00', '11:00'],
    [{ check_out_time: '09:00' }, '15:00', '22:00', '09:00'],
  ] as const)('uses the check-in and window end from one source for %j', (meta, checkIn, until, checkOut) => {
    const booking = buildReservation({
      type: 'hotel',
      accommodation_id: stay.id,
      metadata: JSON.stringify(meta),
      accommodation_check_in: stay.check_in,
      accommodation_check_in_end: stay.check_in_end,
      accommodation_check_out: stay.check_out,
    });
    const form = reservationFieldsFrom(booking, [stay], [], true);
    expect(form).toMatchObject({
      meta_check_in_time: checkIn,
      meta_check_in_end_time: until,
      meta_check_out_time: checkOut,
    });
    expect(hotelStayTimes(booking, meta)).toEqual({ checkIn, checkInEnd: until || null, checkOut });
    expect(reservationFieldsFrom(booking, [stay], [], false)).not.toHaveProperty('meta_check_in_end_time');
  });
  it('omits an orphan window end when its source has no check-in', () => {
    const booking = buildReservation({ type: 'hotel', accommodation_id: stay.id, metadata: '{}' });
    expect(reservationFieldsFrom(booking, [{ ...stay, check_in: null }], [], true)).toMatchObject({
      meta_check_in_time: '',
      meta_check_in_end_time: '',
    });
  });
  it('does not borrow another accommodation with a similar label', () => {
    const booking = buildReservation({ type: 'hotel', accommodation_id: 10, metadata: '{}' });
    expect(reservationFieldsFrom(booking, [stay], [], true)).toMatchObject({
      meta_check_in_time: '',
      meta_check_in_end_time: '',
      meta_check_out_time: '',
    });
  });
});
