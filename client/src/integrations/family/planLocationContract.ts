import { z } from 'zod';

const uuid = z.string().uuid();
const coordinate = z.number().finite().nullable();
const source = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manual') }).strict(),
  ...(['place', 'food', 'hotel', 'experience'] as const).map((kind) =>
    z.object({ kind: z.literal(kind), id: uuid }).strict()
  ),
]);
const fields = {
  label: z.string().max(500).nullable().optional(),
  description_override: z.string().max(20000).nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
  latitude: coordinate.optional(),
  longitude: coordinate.optional(),
  address: z.string().max(2000).nullable().optional(),
  website: z.string().max(2048).nullable().optional(),
  phone: z.string().max(100).nullable().optional(),
  family_place_category_id: uuid.nullable().optional(),
};
export const createLocationRequest = z.object({ operation_id: uuid, source, ...fields }).strict();
export const updateLocationRequest = z
  .object({ operation_id: uuid, expected_revision: z.number().int().positive().safe(), ...fields })
  .strict();
export const locationLifecycleRequest = z
  .object({ operation_id: uuid, expected_revision: z.number().int().positive().safe() })
  .strict();
export const locationId = uuid;
export const locationSchema = z.object({
  id: uuid,
  trip_id: uuid,
  revision: z.number().int().positive().safe(),
  deleted_at: z.string().nullable(),
  source: z.object({ kind: z.enum(['manual', 'place', 'food', 'hotel', 'experience']), id: uuid.nullable() }),
  source_archived: z.boolean(),
  name: z.string(),
  description: z.string().nullable(),
  notes: z.string().nullable(),
  latitude: coordinate,
  longitude: coordinate,
  is_located: z.boolean(),
  address: z.string().nullable(),
  website: z.string().nullable(),
  phone: z.string().nullable(),
  context_place_id: uuid.nullable(),
  context_place_name: z.string().nullable(),
  country_id: uuid.nullable(),
  country_name: z.string().nullable(),
  country_code: z.string().nullable(),
  time_zone: z.string().nullable(),
  source_type_label: z.string().nullable(),
  cover_media_id: uuid.nullable(),
  category: z.object({ id: uuid, name: z.string(), color: z.string(), icon: z.string() }).nullable(),
  overrides: z.object(fields),
  created_at: z.string(),
  updated_at: z.string(),
});
export type PlanLocation = z.infer<typeof locationSchema>;
export const locationPageSchema = z.object({
  version: z.literal(1),
  locations: z.array(locationSchema),
  has_more: z.boolean(),
  next_cursor: uuid.nullable(),
});
export const locationDetailSchema = z.object({ version: z.literal(1), location: locationSchema });
export const locationReceiptSchema = z.object({
  id: uuid,
  revision: z.number().int().positive().safe(),
  deleted_at: z.string().nullable(),
});
