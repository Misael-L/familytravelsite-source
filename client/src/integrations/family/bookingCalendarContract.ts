import { z } from 'zod';
import { locationId } from './planLocationContract';
import { creationScope } from './plannerCreationContract';
export const civilDate = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
  .refine((value) => {
    const parsed = new Date(value + 'T00:00:00Z');
    return (
      value >= '0001-01-01' &&
      value <= '9999-12-31' &&
      Number.isFinite(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, 'Use a real ISO calendar date without a clock.');
export const bookingDates = z
  .object({
    start_date: civilDate.nullable(),
    end_date: civilDate.nullable(),
  })
  .strict()
  .refine(
    (dates) => !dates.start_date || !dates.end_date || dates.start_date <= dates.end_date,
    'The booking header end date must not precede its start date.'
  );
export const bookingDateState = z
  .object({
    reservation_id: locationId,
    trip_id: locationId,
    revision: z.number().int().positive().safe(),
    start_date: civilDate.nullable(),
    end_date: civilDate.nullable(),
    start_day_id: locationId.nullable(),
    end_day_id: locationId.nullable(),
  })
  .strict()
  .refine(
    (dates) =>
      (!dates.start_day_id || !!dates.start_date) &&
      (!dates.end_day_id || !!dates.end_date) &&
      (!dates.start_date || !dates.end_date || dates.start_date <= dates.end_date),
    'Invalid booking date associations.'
  );
export const bookingCalendarContext = z
  .object({
    version: z.literal(1),
    trip_id: locationId,
    family_id: locationId,
    user_id: locationId,
    person_id: locationId,
    dates: bookingDateState,
  })
  .strict();
export const bookingCalendarPacket = z
  .object({
    version: z.literal(1),
    source_url: z.string().url().max(2048),
    operation_id: locationId,
    scope: creationScope,
    observation: bookingDateState,
    dates: bookingDates,
  })
  .strict();
export const bookingCalendarReceipt = z
  .object({
    version: z.literal(1),
    state: z.literal('published'),
    operation_id: locationId,
    changed: z.boolean(),
    dates: bookingDateState,
  })
  .strict();

export type BookingCalendarPacket = z.infer<typeof bookingCalendarPacket>;
export type BookingCalendarReceipt = z.infer<typeof bookingCalendarReceipt>;
