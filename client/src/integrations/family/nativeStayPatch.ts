import type { AccommodationUpdateRequest } from '@trek/shared';
import type { Accommodation } from '../../types';
import type { BookingStayView } from './bookingStayContract';
import type { FamilyIdentityRegistry } from './identity';
import { FamilyApiError } from './repository';
import { stayPatch, type StayEnvelope } from './stayContract';
const fields = new Set([
  'place_id',
  'start_day_id',
  'end_day_id',
  'check_in',
  'check_in_end',
  'check_out',
  'notes',
  'confirmation',
]);
export const nativeStayRefusal = (message: string) => new FamilyApiError(409, 'native_stay_edit_unavailable', message);
/** Only native facts with a lossless canonical meaning. Confirmed booking data is never a stay patch. */
export function nativeStayPatch(
  body: AccommodationUpdateRequest,
  row: Accommodation,
  core: BookingStayView,
  ids: FamilyIdentityRegistry
): StayEnvelope['command']['changes'] {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((k) => !fields.has(k)))
    throw nativeStayRefusal('Unsupported stay fields; reopen the original editor.');
  const out: Record<string, unknown> = {};
  const day = (value: unknown) => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
      throw nativeStayRefusal('Choose an original Trip day.');
    const id = ids.uuid('day', value),
      date = core.days.find((d) => d.id === id)?.civil_day;
    if (!date) throw nativeStayRefusal('The selected day is outside the original Trip calendar.');
    return date;
  };
  if (body.place_id !== undefined) {
    if (typeof body.place_id !== 'number' || !Number.isSafeInteger(body.place_id) || body.place_id <= 0)
      throw nativeStayRefusal('Choose an original saved lodging.');
    const id = ids.uuid('place', body.place_id);
    if (!core.planner.state.locations.some((l) => l.id === id && ['hotel', 'manual'].includes(l.source.kind)))
      throw nativeStayRefusal('The lodging is not in the original saved locations.');
    out.location_id = id;
  }
  if (body.start_day_id !== undefined) out.arrival_date = day(body.start_day_id);
  if (body.end_day_id !== undefined) out.departure_date = day(body.end_day_id);
  for (const [native, canonical] of [
    ['check_in', 'check_in_time'],
    ['check_in_end', 'check_in_window_end'],
    ['check_out', 'check_out_time'],
    ['notes', 'notes'],
  ] as const)
    if (body[native] !== undefined) out[canonical] = body[native];
  if (body.confirmation !== undefined && body.confirmation !== (row.confirmation ?? null))
    throw nativeStayRefusal(
      'Booking confirmation edits require the separate booking command; the stay was not changed.'
    );
  const patch = stayPatch.parse(out),
    old = core.stays.find((s) => ids.register('stay', s.stay.id) === row.id)?.stay;
  if (!old) throw nativeStayRefusal('The original stay is unavailable.');
  checkNativeStayRange({ ...old, ...patch });
  return patch; // Omitted zone, notes and booking instants are preserved by the canonical patch API.
}

function checkNativeStayRange(after: BookingStayView['stays'][number]['stay']) {
  if (
    [after.check_in_time, after.check_in_window_end, after.check_out_time].some(
      (t) => t !== null && t.length === 8 && t.slice(6) !== '00'
    )
  )
    throw nativeStayRefusal('Subminute clocks need a more precise stay editor.');
  if (
    after.departure_date < after.arrival_date ||
    after.check_in_window_end_day_offset !== 0 ||
    (after.check_in_time && after.check_in_window_end && after.check_in_window_end < after.check_in_time)
  )
    throw nativeStayRefusal('This date range or overnight window needs a more expressive stay editor.');
}
