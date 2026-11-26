import { z } from 'zod';
import { locationId } from './planLocationContract';
import { creationScope } from './plannerCreationContract';
export const observedOccurrence = z.object({ id: locationId, revision: z.number().int().positive().safe() }).strict();
export const arrangementPlan = z
  .object({
    version: z.literal(1),
    action: z.enum(['move', 'trash', 'restore', 'reorder', 'clear']),
    visit: observedOccurrence.nullable(),
    days: z
      .array(
        z
          .object({
            id: locationId,
            civil_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
            observed: z.array(observedOccurrence).max(1000),
            order: z.array(locationId).max(1000),
          })
          .strict()
      )
      .min(1)
      .max(2),
  })
  .strict();
export const arrangementPacket = z
  .object({
    version: z.literal(1),
    source_url: z.string().url().max(2048),
    operation_id: locationId,
    scope: creationScope,
    plan: arrangementPlan,
  })
  .strict();
export const arrangementReceipt = z.object({
  version: z.literal(1),
  state: z.enum(['published', 'draft', 'submitted', 'removed']),
  changed: z.boolean(),
  operation: z.object({ op_id: locationId, draft_id: locationId }).passthrough().nullable(),
  result: z
    .object({
      id: locationId.nullable(),
      revision: z.number().int().positive().safe().nullable(),
      changed: z.boolean(),
      rows: z.array(observedOccurrence).max(2001),
      removed: z.array(observedOccurrence.extend({ day_id: locationId })).max(2000),
    })
    .nullable(),
});
export type ArrangementPlan = z.infer<typeof arrangementPlan>;
export type ArrangementPacket = z.infer<typeof arrangementPacket>;
export type ArrangementReceipt = z.infer<typeof arrangementReceipt>;
