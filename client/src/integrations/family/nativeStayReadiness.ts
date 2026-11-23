import { accommodationSchema } from '@trek/shared';
import type { Accommodation } from '../../types';
import { checkedBookingStayView, checkedNativeStayCore, type BookingStayView } from './bookingStayContract';
import type { FamilyIdentityRegistry } from './identity';
import { FamilyApiError } from './repository';
import { stayIdentity } from './stayContract';
export type NativeStayBlocker = {
  stay_id: string;
  reason: 'arrival_outside_calendar' | 'departure_outside_calendar' | 'overnight_check_in_window' | 'subminute_clock';
};
export type NativeStayReadiness =
  { status: 'unsupported'; blockers: NativeStayBlocker[] } | { status: 'ready'; accommodations: Accommodation[] };
/** Pure qualification candidate only; native reads/writes and cache publication are still gated. */
export function nativeStayReadiness(
  raw: BookingStayView,
  ids: FamilyIdentityRegistry,
  options: { nativeArrivals?: boolean } = {}
): NativeStayReadiness {
  const p = options.nativeArrivals
    ? checkedNativeStayCore(raw, stayIdentity.parse(raw))
    : checkedBookingStayView(raw, stayIdentity.parse(raw));
  if (!ids.isScopedTo(p.user_id))
    throw new FamilyApiError(409, 'stay_registry_actor', 'This stay registry belongs to another actor.');
  const blockers: NativeStayBlocker[] = [];
  for (const s of p.stays) {
    const add = (reason: NativeStayBlocker['reason']) => blockers.push({ stay_id: s.stay.id, reason });
    if (s.arrival_day_id === null) add('arrival_outside_calendar');
    if (s.departure_day_id === null) add('departure_outside_calendar');
    if (s.stay.check_in_window_end_day_offset === 1) add('overnight_check_in_window');
    if (
      [s.stay.check_in_time, s.stay.check_in_window_end, s.stay.check_out_time].some(
        (t) => t !== null && t.length === 8 && t.slice(6) !== '00'
      )
    )
      add('subminute_clock');
  }
  if (blockers.length) return { status: 'unsupported', blockers };
  const accommodations = p.stays.map((s) => {
    if (s.arrival_day_id === null || s.departure_day_id === null)
      throw new Error('Complete native day bindings required');
    return accommodationSchema.parse({
      id: ids.register('stay', s.stay.id),
      trip_id: ids.register('trip', p.trip_id),
      place_id: ids.register('place', s.stay.location_id),
      start_day_id: ids.register('day', s.arrival_day_id),
      end_day_id: ids.register('day', s.departure_day_id),
      check_in: s.stay.check_in_time,
      check_in_end: s.stay.check_in_window_end,
      check_out: s.stay.check_out_time,
      confirmation: s.booking?.record.confirmation_code ?? null,
      notes: s.stay.notes,
      created_at: s.stay.created_at,
      place_name: s.location.name,
      place_address: s.location.address,
      place_image: null,
      place_lat: s.location.latitude,
      place_lng: s.location.longitude,
      reservation_title: s.booking?.record.title ?? null,
    });
  });
  return { status: 'ready', accommodations };
}
