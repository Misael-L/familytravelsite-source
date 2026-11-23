import { z } from 'zod';
import { bookingDateState } from './bookingCalendarContract';
import { locationId } from './planLocationContract';
import { calendarDay } from './plannerCalendarContract';
const nullableId = locationId.nullable(),
  text = z.string().nullable();
export const plannerBookingRecord = z
  .object({
    id: locationId,
    trip_id: locationId,
    type: z.string(),
    status: z.enum(['pending', 'confirmed']),
    title: z.string(),
    start_trip_day_id: nullableId,
    end_trip_day_id: nullableId,
    starts_at: text,
    ends_at: text,
    confirmation_code: text,
    notes: text,
    url: text,
    place_id: nullableId,
    hotel_id: nullableId,
    schedule_item_id: nullableId,
    metadata: z.record(z.string(), z.unknown()),
    sort_order: z.number().int(),
    created_at: z.string(),
  })
  .passthrough();
const endpoint = z
  .object({
    id: locationId,
    reservation_id: locationId,
    role: z.enum(['from', 'to', 'stop']),
    sequence: z.number().int(),
    name: text,
    code: text,
    airport_id: nullableId,
    place_id: nullableId,
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    time_zone: text,
    local_date: text,
    local_time: text,
  })
  .passthrough();
const leg = z
  .object({
    id: locationId,
    reservation_id: locationId,
    sequence: z.number().int(),
    from_endpoint_id: nullableId,
    to_endpoint_id: nullableId,
    carrier_name: text,
    service_number: text,
    platform: text,
    seat: text,
  })
  .passthrough();
export const plannerBookingView = z
  .object({
    version: z.literal(1),
    trip_id: locationId,
    family_id: locationId,
    user_id: locationId,
    person_id: locationId,
    trip_revision: z.number().int().positive().safe(),
    days: z.array(calendarDay).max(3660),
    bookings: z
      .array(
        z
          .object({
            record: plannerBookingRecord,
            dates: bookingDateState,
            visit_state: z.enum(['none', 'active', 'retained']),
            endpoints: z.array(endpoint).max(2000),
            legs: z.array(leg).max(2000),
          })
          .strict()
      )
      .max(2000),
  })
  .strict();
export type PlannerBookingView = z.infer<typeof plannerBookingView>;
export type PlannerBookingRow = PlannerBookingView['bookings'][number];
