import { z } from 'zod';
import { plannerBookingRecord, plannerBookingView } from './plannerBookingContract';
import { validatePlannerBookingRows } from './plannerBookings';
import { checkedPlannerView, plannerViewSchema } from './plannerViewContract';
import { FamilyApiError } from './repository';
import { stayId, stayIdentity, stayJson, stayProjection, type StayIdentity } from './stayContract';
import { parseStay } from './stayTransport';
const record = plannerBookingRecord.extend({
  timing_kind: z.enum(['legacy_unclassified', 'untimed', 'timed']).nullable(),
  time_zone: z.string().nullable(),
});
const row = plannerBookingView.shape.bookings.element
  .extend({
    record,
    stay_link: z
      .object({ id: stayId, state: z.enum(['active', 'retained']) })
      .strict()
      .nullable(),
    timing_state: z.enum(['unclassified', 'untimed', 'timed']),
  })
  .strict();
export const bookingStayView = plannerBookingView
  .omit({ version: true, bookings: true })
  .extend({
    version: z.literal(2),
    completeness: z.literal('complete'),
    planner: plannerViewSchema,
    bookings: z.array(row).max(2000),
    stays: z.array(stayProjection).max(2000),
    capabilities: z
      .object({
        read: z.literal(true),
        native_read: z.literal(false),
        native_write: z.literal(false),
        confirmed_timing_write: z.literal(false),
      })
      .strict(),
  })
  .strict();
export type BookingStayView = z.infer<typeof bookingStayView>;
function invalid(): never {
  throw new FamilyApiError(502, 'booking_stay_contract', 'The complete booking/stay observation is inconsistent.');
}
function validateTiming(r: BookingStayView['bookings'][number]) {
  const b = r.record;
  const kind = b.timing_kind === 'timed' ? 'timed' : b.timing_kind === 'untimed' ? 'untimed' : 'unclassified';
  if (r.timing_state !== kind) invalid();
  if (kind === 'untimed' && (b.starts_at !== null || b.ends_at !== null || b.time_zone !== null)) invalid();
  if (kind === 'unclassified' && b.time_zone !== null) invalid();
  if (kind === 'timed') {
    if (
      !b.time_zone ||
      (!b.starts_at && !b.ends_at) ||
      !['hotel', 'restaurant', 'event', 'tour', 'other'].includes(b.type)
    )
      invalid();
    for (const stamp of [b.starts_at, b.ends_at])
      if (stamp !== null && !z.string().datetime({ offset: true }).safeParse(stamp).success) invalid();
  }
}
function validateCalendar(p: BookingStayView) {
  const state = p.planner.state;
  if (state.trip_revision !== p.trip_revision || state.days.length !== p.days.length) invalid();
  const days = new Map(state.days.map((d) => [d.id, d]));
  for (const d of p.days) {
    const other = days.get(d.id);
    if (
      !other ||
      other.civil_day !== d.civil_day ||
      other.day_index !== d.day_index ||
      other.title !== d.title ||
      (other.revision !== undefined && other.revision !== d.revision)
    )
      invalid();
  }
}
type Stay = BookingStayView['stays'][number];
type Booking = BookingStayView['bookings'][number];
function validateLinkedBooking(s: Stay, b: Booking | undefined) {
  if (!s.link) return;
  if (
    !b ||
    b.record.type !== 'hotel' ||
    b.stay_link?.id !== s.stay.id ||
    b.stay_link.state !== 'active' ||
    stayJson(s.booking) !== stayJson({ record: b.record, dates: b.dates })
  )
    invalid();
  if (b.record.hotel_id !== null && (s.location.source.kind !== 'hotel' || b.record.hotel_id !== s.location.source.id))
    invalid();
}
function validateActiveStay(p: BookingStayView, s: Stay) {
  if (
    s.stay.trip_id !== p.trip_id ||
    s.stay.family_id !== p.family_id ||
    s.stay.deleted_at !== null ||
    s.location.deleted_at !== null ||
    !['hotel', 'manual'].includes(s.location.source.kind)
  )
    invalid();
  if (
    s.arrival_day_id !== (p.days.find((d) => d.civil_day === s.stay.arrival_date)?.id ?? null) ||
    s.departure_day_id !== (p.days.find((d) => d.civil_day === s.stay.departure_date)?.id ?? null)
  )
    invalid();
}
function validateBookingLinks(p: BookingStayView, stays: Map<string, Stay>) {
  const linked = new Set<string>();
  for (const b of p.bookings) {
    validateTiming(b);
    if (!b.stay_link) continue;
    if (b.record.type !== 'hotel' || linked.has(b.stay_link.id)) invalid();
    linked.add(b.stay_link.id);
    if (b.stay_link.state === 'retained') {
      if (stays.has(b.stay_link.id)) invalid();
    } else if (stays.get(b.stay_link.id)?.link?.reservation_id !== b.record.id) invalid();
  }
}
function validateStays(p: BookingStayView) {
  const stays = new Map(p.stays.map((s) => [s.stay.id, s])),
    bookings = new Map(p.bookings.map((b) => [b.record.id, b])),
    pool = new Map(p.planner.state.locations.map((l) => [l.id, l]));
  if (stays.size !== p.stays.length) invalid();
  for (const s of p.stays) {
    validateActiveStay(p, s);
    if (stayJson(pool.get(s.stay.location_id)) !== stayJson(s.location)) invalid();
    if (s.link) validateLinkedBooking(s, bookings.get(s.link.reservation_id));
  }
  validateBookingLinks(p, stays);
}
/** Validate without silently stripping any observed fact or relabeling a v1 reply. */
function checkedCore(raw: unknown, expected: StayIdentity, native: boolean): BookingStayView {
  const p = parseStay(bookingStayView, raw, 8388608),
    e = stayIdentity.parse(expected);
  if (stayJson(raw) !== stayJson(p) || stayJson(stayIdentity.parse(p)) !== stayJson(e)) invalid();
  checkedPlannerView(p.planner, { ...e, layer: 'published' });
  if (p.planner.state.trip_id !== p.trip_id || p.planner.state.family_id !== p.family_id) invalid();
  validatePlannerBookingRows({
    version: 1,
    ...e,
    trip_revision: p.trip_revision,
    days: p.days,
    bookings: p.bookings.map(({ stay_link: _l, timing_state: _t, ...b }) => b),
  });
  validateCalendar(p);
  validateStays(p);
  const owners = new Set<string>();
  for (const v of p.planner.state.visits) {
    if (v.owning_stay_id === undefined) continue;
    const s = p.stays.find((s) => s.stay.id === v.owning_stay_id);
    if (
      !native ||
      !s ||
      owners.has(s.stay.id) ||
      v.trip_id !== p.trip_id ||
      v.plan_location_id !== s.stay.location_id ||
      v.trip_day_id !== s.arrival_day_id ||
      v.timing_kind !== 'untimed' ||
      v.starts_at !== null ||
      v.ends_at !== null ||
      v.time_zone !== null ||
      v.deleted_at != null
    )
      invalid();
    owners.add(s.stay.id);
  }
  return p;
}

export function checkedBookingStayView(raw: unknown, expected: StayIdentity): BookingStayView {
  return checkedCore(raw, expected, false);
}
/** Only the tagged native RPC/cache producer may admit explicitly owned arrivals. */
export function checkedNativeStayCore(raw: unknown, expected: StayIdentity): BookingStayView {
  return checkedCore(raw, expected, true);
}
