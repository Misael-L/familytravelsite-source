import { z } from 'zod';
import { locationId, locationSchema } from './planLocationContract';
import { visitSchema } from './planVisits';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const revision = z.number().int().positive().safe();
export const plannerStateSchema = z.object({
  version: z.literal(1),
  trip_id: locationId,
  family_id: locationId,
  trip_revision: revision,
  locations: z.array(locationSchema).max(10000),
  visits: z
    .array(
      visitSchema.extend({
        timing_kind: z.enum(['legacy', 'untimed', 'timed']),
        trip_day_id: locationId.nullable(),
        revision,
      })
    )
    .max(10000),
  days: z
    .array(
      z.object({
        id: locationId,
        trip_id: locationId,
        civil_day: date,
        day_index: revision,
        revision: revision.optional(),
        title: z.string().nullable(),
        updated_at: z.string(),
      })
    )
    .max(10000),
  notes: z
    .array(
      z.object({
        id: locationId,
        trip_id: locationId,
        civil_day: date,
        body: z.string(),
        icon: z.string().nullable(),
        sort_order: z.number().int(),
        updated_at: z.string(),
      })
    )
    .max(10000),
  destinations: z
    .array(
      z.object({
        source_place_id: locationId,
        location_id: locationId.nullable(),
        legacy_category_id: locationId.nullable(),
      })
    )
    .max(10000),
});
export type PlannerState = z.infer<typeof plannerStateSchema>;
