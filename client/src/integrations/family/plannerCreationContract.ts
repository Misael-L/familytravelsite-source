import { z } from 'zod';
import { createLocationRequest, locationId } from './planLocationContract';
const nullableClock = z
  .string()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
  .nullable();
export const creationScope = z
  .object({
    version: z.literal(1),
    trip_id: locationId,
    family_id: locationId,
    user_id: locationId,
    person_id: locationId,
    layer: z.enum(['published', 'myDraft']),
  })
  .strict();
export const creationForm = z
  .object({
    location: z.union([
      z.object({ id: locationId, revision: z.number().int().positive().safe() }).strict(),
      z.object({ create: createLocationRequest.omit({ operation_id: true }) }).strict(),
    ]),
    day: z
      .object({ id: locationId, civil_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .strict()
      .nullable(),
    clocks: z.object({ start: nullableClock, end: nullableClock }).strict(),
    visit_notes: z.string().max(20000).nullable(),
  })
  .strict();
export const creationPacket = z
  .object({
    version: z.literal(1),
    source_url: z.string().url().max(2048),
    operation_id: locationId,
    scope: creationScope,
    form: creationForm,
  })
  .strict();
export type CreationPacket = z.infer<typeof creationPacket>;
export const creationReceipt = z.object({
  version: z.literal(1),
  state: z.enum(['published', 'draft', 'submitted', 'removed']),
  location_id: locationId.nullable(),
  visit_id: locationId.nullable(),
  operation: z
    .object({ id: locationId.optional(), op_id: locationId.optional(), draft_id: locationId.optional() })
    .passthrough(),
});

export type CreationReceipt = z.infer<typeof creationReceipt>;
