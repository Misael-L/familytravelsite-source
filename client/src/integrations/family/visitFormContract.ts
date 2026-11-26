import { z } from 'zod';
import { formObservationSchema, formValuesSchema } from './locationFormContract';
import { locationId, locationSchema } from './planLocationContract';
import { visitSchema } from './planVisits';
const revision = z.number().int().positive().safe();
export const selectedVisitSchema = visitSchema.extend({
  timing_kind: z.enum(['untimed', 'timed']),
  trip_day_id: locationId,
  plan_location_id: locationId,
  revision,
  deleted_at: z.null(),
  start_local: z.string().nullable(),
  end_local: z.string().nullable(),
});
export const visitFormObservationSchema = z
  .object({
    version: z.literal(1),
    layer: z.enum(['published', 'myDraft']),
    location: formObservationSchema,
    visit_id: locationId,
    visit_revision: revision,
    draft: formObservationSchema.shape.draft,
    shown_visit: selectedVisitSchema,
    published_visit: selectedVisitSchema,
    clock_zone: z.string().nullable(),
  })
  .strict();
export const visitFormContextSchema = z.object({
  version: z.literal(1),
  layer: z.enum(['published', 'myDraft']),
  location: locationSchema,
  published_location: locationSchema,
  visit: selectedVisitSchema,
  published_visit: selectedVisitSchema,
  clock_zone: z.string().nullable(),
  observation: visitFormObservationSchema,
});
const clock = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable();
export const visitFormValuesSchema = z
  .object({
    location: formValuesSchema,
    visit_notes: z.string().nullable(),
    clocks: z.object({ start: clock, end: clock }).strict(),
  })
  .strict();
export const visitFormSaveSchema = z
  .object({
    operation_id: locationId,
    observation: visitFormObservationSchema,
    form: visitFormValuesSchema,
  })
  .strict();
export const visitFormReceiptSchema = z.object({
  version: z.literal(1),
  visit_id: locationId,
  location_id: locationId,
  state: z.enum(['published', 'draft']),
  changed: z.boolean(),
  places_intent: z.boolean(),
  visit_revision: revision,
  location_revision: revision,
  draft_id: locationId.nullable(),
  op_id: locationId.nullable(),
});
export type VisitFormContext = z.infer<typeof visitFormContextSchema>;
export type VisitFormObservation = z.infer<typeof visitFormObservationSchema>;
export type VisitFormReceipt = z.infer<typeof visitFormReceiptSchema>;
export type VisitFormValues = z.infer<typeof visitFormValuesSchema>;
