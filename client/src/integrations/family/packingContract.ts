import { z } from 'zod';

export const packingId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const counter = z.number().int().nonnegative().safe();
const rank = z.number().int().min(-2147483648).max(2147483647);
const people = z.array(packingId).refine((ids) => new Set(ids).size === ids.length);
export const packingTimestamp = z
  .string()
  .datetime({ offset: true })
  .regex(/(?:Z|[+-]\d{2}:\d{2})$/)
  .refine((s) => Number.isFinite(Date.parse(s)) && !/\.\d{7}/.test(s));
export const packingScope = z
  .object({
    version: z.literal(1),
    trip_id: packingId,
    family_id: packingId,
    user_id: packingId,
    person_id: packingId,
    layer: z.literal('published'),
    trip_lifecycle_revision: counter,
  })
  .strict();
export type PackingScope = z.infer<typeof packingScope>;
export const packingIdentity = packingScope
  .pick({ trip_id: true, family_id: true, user_id: true, person_id: true })
  .strip();
export type PackingIdentity = z.infer<typeof packingIdentity>;
export const packingRow = z
  .object({
    id: packingId,
    trip_id: packingId,
    name: z
      .string()
      .refine(
        (s) => Array.from(s.replace(/^ +| +$/g, '')).length >= 1 && Array.from(s.replace(/^ +| +$/g, '')).length <= 500
      ),
    category: z.string().refine((s) => Array.from(s).length <= 200),
    checked: z.boolean(),
    sort_order: rank,
    quantity: z.number().int().min(1).max(10000),
    weight_grams: z.number().int().min(0).max(1000000).nullable(),
    bag_id: packingId.nullable(),
    is_private: z.boolean(),
    owner_person_id: packingId.nullable(),
    created_at: packingTimestamp,
    updated_at: packingTimestamp,
    packed_quantity: z.number().int().positive().nullable(),
    revision: counter.refine((n) => n > 0),
    deleted_at: packingTimestamp.nullable(),
    deleted_by_person_id: packingId.nullable(),
    recipient_person_ids: people,
    contributor_person_ids: people,
  })
  .strict()
  .refine((r) => (r.deleted_at === null) === (r.deleted_by_person_id === null))
  .refine((r) => r.packed_quantity === null || (!r.checked && r.packed_quantity < r.quantity));
export type PackingRow = z.infer<typeof packingRow>;
export const packingBag = z
  .object({
    id: packingId,
    trip_id: packingId,
    name: z.string(),
    color: z.string().nullable(),
    sort_order: rank,
    weight_limit_grams: z.number().int().min(1).max(10000000).nullable(),
    created_at: packingTimestamp,
    updated_at: packingTimestamp,
    member_person_ids: people,
    total_weight_grams: counter,
  })
  .strict();
export type PackingBag = z.infer<typeof packingBag>;
// Category labels are data: record parsers must not discard __proto__.
const assignees = z
  .preprocess(
    (value) => {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return undefined;
      return Object.entries(value);
    },
    z.array(z.tuple([z.string(), people]))
  )
  .transform((entries): Record<string, string[]> =>
    Object.fromEntries<string[]>(entries.map(([label, ids]): [string, string[]] => [label, ids]))
  );
export const packingList = z
  .object({
    version: z.literal(1),
    scope: packingScope,
    collection_revision: counter,
    items: z.array(packingRow).max(2000),
    bags: z.array(packingBag),
    category_assignees: assignees,
    unassigned_weight_grams: counter,
    trash_count: counter,
  })
  .strict();
export type PackingList = z.infer<typeof packingList>;
export const packingCursor = z.object({ deleted_at: packingTimestamp, id: packingId }).strict();
export type PackingCursor = z.infer<typeof packingCursor>;
export const packingTrashPage = z
  .object({
    version: z.literal(1),
    scope: packingScope,
    collection_revision: counter,
    items: z.array(packingRow).max(100),
    next_cursor: packingCursor.nullable(),
  })
  .strict();
export type PackingTrashPage = z.infer<typeof packingTrashPage>;
export const packingAck = z
  .object({
    version: z.literal(1),
    trip_id: packingId,
    operation_id: packingId,
    scope: packingScope,
    action: z.enum(['create', 'update', 'packed-state', 'reorder', 'trash', 'restore']),
    target_id: packingId.nullable(),
    collection_revision: counter,
    item: packingRow.nullable(),
    ordered_ids: z.array(packingId).max(2000).nullable(),
  })
  .strict();
export type PackingAck = z.infer<typeof packingAck>;
export const packingReceipt = z
  .object({
    version: z.literal(1),
    trip_id: packingId,
    operation_id: packingId,
    scope: packingScope,
    status: z.enum(['unknown', 'committed']),
    result_redacted: z.boolean(),
    result: packingAck.nullable(),
  })
  .strict();
export type PackingReceipt = z.infer<typeof packingReceipt>;
