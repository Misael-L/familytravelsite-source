import { reservationFieldsFrom, reservationSaveData } from '../../components/Planner/reservationFormModel';
import type { Accommodation, Place, Reservation } from '../../types';
import { bookingDetailChanges, type BookingDetailContext } from './bookingDetailsContract';
import { FamilyApiError } from './repository';
/** Semantic equality for JSON observations; object key order is not a version. */
export function bookingJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}
export type BookingFormOptions = {
  accommodations: Accommodation[];
  places: Pick<Place, 'id' | 'address'>[];
  withCheckInEnd: boolean;
};
export function nativeBookingBaseline(original: Reservation, options: BookingFormOptions) {
  const form = reservationFieldsFrom(original, options.accommodations, options.places, true);
  return reservationSaveData(form, {
    assignmentId: original.assignment_id ?? '',
    isEdit: true,
    withCheckInEnd: options.withCheckInEnd,
  });
}
/** Only differences from the served native form become domain writes. No metadata/timestamp replacement. */
export function nativeBookingChanges(
  context: BookingDetailContext,
  before: Record<string, unknown>,
  data: Record<string, unknown>,
  effects: readonly string[]
) {
  if (Object.keys(before).some((key) => !(key in data))) unavailable('Use the complete observed native form.');
  if (effects.length) unavailable('Travelers, files and cost changes need their coordinated writer.');
  const supported = new Set([
    'title',
    'status',
    'confirmation_number',
    'notes',
    'url',
    'reservation_time',
    'reservation_end_time',
  ]);
  for (const key of new Set([...Object.keys(before), ...Object.keys(data)]))
    if (!supported.has(key) && (bookingJson(before[key]) !== bookingJson(data[key]) || !(key in before)))
      unavailable('Changed ' + key + ' needs its complete booking contract. No partial save.');
  const changes = textChanges(before, data);
  const dates = { start_date: context.observation.dates.start_date, end_date: context.observation.dates.end_date };
  for (const [field, column, instant] of [
    ['reservation_time', 'start_date', 'starts_at'],
    ['reservation_end_time', 'end_date', 'ends_at'],
  ] as const) {
    if (bookingJson(data[field]) === bookingJson(before[field])) continue;
    const value = data[field];
    if (
      context.observation.record[instant] !== null ||
      (value !== null && value !== '' && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)))
    )
      unavailable('Changing a confirmed clock needs explicit timezone-aware timing.');
    dates[column] = typeof value === 'string' && value ? value : null;
    changes.dates = dates;
  }
  return bookingDetailChanges.parse(changes);
}
function unavailable(message: string): never {
  throw new FamilyApiError(409, 'booking_form_not_connected', message);
}

function textChanges(before: Record<string, unknown>, data: Record<string, unknown>) {
  const changes: Record<string, unknown> = {};
  for (const [native, column] of [
    ['title', 'title'],
    ['status', 'status'],
    ['confirmation_number', 'confirmation_code'],
    ['notes', 'notes'],
    ['url', 'url'],
  ])
    if (bookingJson(data[native]) !== bookingJson(before[native])) {
      const value = data[native];
      if (value !== null && typeof value !== 'string') unavailable('Native text fields require explicit text or null.');
      changes[column] = native === 'title' || native === 'status' ? value : value || null;
    }
  return changes;
}
