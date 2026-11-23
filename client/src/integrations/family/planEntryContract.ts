import { z } from 'zod';
import { createLocationRequest, locationId } from './planLocationContract';
import { visitTimingPayloadSchema } from './visitTiming';

export const planEntryPayloadSchema = z
  .object({
    location: z.union([
      z.object({ id: locationId }).strict(),
      z.object({ create: createLocationRequest.omit({ operation_id: true }) }).strict(),
      z.null(),
    ]),
    visit: z
      .object({
        activity: z.string().max(500).nullable().optional(),
        notes: z.string().max(20000).nullable().optional(),
      })
      .strict(),
    schedule: visitTimingPayloadSchema.refine(
      (value) => !('restore_revision' in value) && !('observed_legacy_timing' in value),
      'A new occurrence requires new timing intent, not history or legacy classification.'
    ),
  })
  .strict();
export const createPlanEntryRequest = planEntryPayloadSchema.extend({ operation_id: locationId });
