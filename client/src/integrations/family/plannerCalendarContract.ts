import { z } from 'zod';
import { locationId } from './planLocationContract';
import { creationScope } from './plannerCreationContract';
const rev = z.number().int().positive().safe(),
  date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stamp = z.string().datetime({ offset: true });
export const calendarDay = z
  .object({ id: locationId, revision: rev, civil_day: date, day_index: rev, title: z.string().nullable() })
  .strict();
export const calendarObservation = z
  .object({
    trip_revision: rev,
    start_at: stamp.nullable(),
    end_at: stamp.nullable(),
    days: z.array(calendarDay).max(3660),
  })
  .strict();
export const calendarContext = z.object({
  version: z.literal(1),
  trip_id: locationId,
  family_id: locationId,
  user_id: locationId,
  person_id: locationId,
  observation: calendarObservation,
});
export const calendarChange = z.discriminatedUnion('action', [
  z.object({ action: z.literal('title'), day_id: locationId, title: z.string().max(20000).nullable() }).strict(),
  z.object({ action: z.literal('append') }).strict(),
  z.object({ action: z.literal('trash_day'), day_id: locationId }).strict(),
  z.object({ action: z.literal('restore_day'), day_id: locationId, operation_id: locationId }).strict(),
  z.object({ action: z.literal('remove_day'), day_id: locationId }).strict(),
  z.object({ action: z.literal('restore_removed_day'), day_id: locationId, operation_id: locationId }).strict(),
  z.object({ action: z.literal('insert'), position: rev.max(3661) }).strict(),
  z.object({ action: z.literal('undo_insert'), operation_id: locationId, day_id: locationId }).strict(),
  z.object({ action: z.literal('reorder'), order: z.array(locationId).min(1).max(3660) }).strict(),
  z.object({ action: z.literal('restore_order'), operation_id: locationId }).strict(),
  z.object({ action: z.literal('extend'), end_date: date }).strict(),
]);
export const calendarPacket = z
  .object({
    version: z.literal(1),
    source_url: z.string().url().max(2048),
    operation_id: locationId,
    scope: creationScope,
    observation: calendarObservation,
    change: calendarChange,
  })
  .strict();
export const calendarReceipt = z.object({
  version: z.literal(1),
  state: z.literal('published'),
  changed: z.boolean(),
  day_id: locationId.nullable(),
  added_day_ids: z.array(locationId).max(3660),
  observation: calendarObservation,
  undo_operation_id: locationId.nullable().optional(),
  removed_day_id: locationId.optional(),
  creation_reversed: z.boolean().optional(),
  removal_reversed: z.boolean().optional(),
  restored_day_id: locationId.optional(),
  archived_day_id: locationId.optional(),
});
export type CalendarReceipt = z.infer<typeof calendarReceipt>;
export type CalendarPacket = z.infer<typeof calendarPacket>;
export type CalendarChange = z.infer<typeof calendarChange>;
export type CalendarObservation = z.infer<typeof calendarObservation>;
