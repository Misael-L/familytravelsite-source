import { z } from 'zod';
import { locationId, locationSchema } from './planLocationContract';
const text = z.string().nullable(),
  coordinate = z.number().finite().nullable();
export const formValuesSchema = z
  .object({
    name: text,
    description: text,
    notes: text,
    address: text,
    website: text,
    phone: text,
    latitude: coordinate,
    longitude: coordinate,
    family_place_category_id: locationId.nullable(),
  })
  .strict();
export const formLayerSchema = z.enum(['published', 'myDraft']);
export const formObservationSchema = z
  .object({
    version: z.literal(1),
    trip_id: locationId,
    location_id: locationId,
    family_id: locationId,
    user_id: locationId,
    person_id: locationId,
    revision: z.number().int().positive().safe(),
    layer: formLayerSchema,
    draft: z
      .object({ op_id: locationId, payload_sha256: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .nullable(),
    published: formValuesSchema,
    shown: formValuesSchema,
  })
  .strict();
export const formContextSchema = z.object({
  version: z.literal(1),
  layer: formLayerSchema,
  location: locationSchema,
  published_location: locationSchema,
  observation: formObservationSchema,
});
export const formSaveSchema = z
  .object({
    operation_id: locationId,
    observation: formObservationSchema,
    form: formValuesSchema,
  })
  .strict();
export const formReceiptSchema = z.object({
  version: z.literal(1),
  location_id: locationId,
  revision: z.number().int().positive().safe(),
  state: z.enum(['published', 'draft']),
  changed: z.boolean(),
  draft_id: locationId.nullable(),
  op_id: locationId.nullable(),
});
export type FormObservation = z.infer<typeof formObservationSchema>;
export type FormContext = z.infer<typeof formContextSchema>;
export type FormValues = z.infer<typeof formValuesSchema>;
export type FormReceipt = z.infer<typeof formReceiptSchema>;
