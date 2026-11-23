import { z } from 'zod';
import { bookingDates, bookingDateState } from './bookingCalendarContract';
import { locationId } from './planLocationContract';
import { plannerBookingRecord } from './plannerBookingContract';
import { creationScope } from './plannerCreationContract';
export const bookingDetailObservation = z.object({ record: plannerBookingRecord, dates: bookingDateState }).strict();
export const bookingDetailContext = z
  .object({
    version: z.literal(1),
    trip_id: locationId,
    family_id: locationId,
    user_id: locationId,
    person_id: locationId,
    observation: bookingDetailObservation,
  })
  .strict();
export const bookingDetailChanges = z
  .object({
    title: z
      .string()
      .min(1)
      .max(4096)
      .refine((s) => !!s.trim())
      .optional(),
    status: z.enum(['pending', 'confirmed']).optional(),
    confirmation_code: z.string().max(4096).nullable().optional(),
    notes: z.string().max(65536).nullable().optional(),
    url: z.string().max(8192).nullable().optional(),
    dates: bookingDates.optional(),
  })
  .strict();
export const bookingDetailPacket = z
  .object({
    version: z.literal(1),
    source_url: z.string().url().max(2048),
    operation_id: locationId,
    scope: creationScope,
    observation: bookingDetailObservation,
    changes: bookingDetailChanges,
  })
  .strict();
export const bookingDetailReceipt = z
  .object({
    version: z.literal(1),
    state: z.literal('published'),
    operation_id: locationId,
    trip_id: locationId,
    reservation_id: locationId,
    changed: z.boolean(),
    dates: bookingDateState,
  })
  .strict();
export type BookingDetailPacket = z.infer<typeof bookingDetailPacket>;
export type BookingDetailContext = z.infer<typeof bookingDetailContext>;
