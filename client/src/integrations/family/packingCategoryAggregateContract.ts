import { z } from 'zod';
import { packingCategoryV2 } from './packingCategoryV2Contract';
import { packingCursor, packingId, packingRow, packingScope } from './packingContract';
import { packingGroupBytes } from './packingGroupContract';

const counter = z.number().int().nonnegative().safe();
const ascending = (ids: string[]) => ids.every((id, i) => i === 0 || ids[i - 1] < id);
export const aggregateBounded = (v: unknown, bytes = 8388608) => {
  try {
    return packingGroupBytes(v) <= bytes;
  } catch {
    return false;
  }
};
const batch = z.object({ actor_user_id: packingId, operation_id: packingId, item_count: counter.max(2000) }).strict();
const categories = z.array(packingCategoryV2).max(2000);
const items = z.array(packingRow).max(2000);
export const aggregateOwner = (c: z.infer<typeof packingCategoryV2>, s: z.infer<typeof packingScope>) =>
  c.trip_id === s.trip_id && (c.owner_person_id === null || c.owner_person_id === s.person_id);
export const aggregateMembers = (rows: z.infer<typeof items>, c: z.infer<typeof packingCategoryV2>, deleted: boolean) =>
  ascending(rows.map((r) => r.id)) &&
  rows.every(
    (r) =>
      !r.name.includes('\0') &&
      !/\p{Surrogate}/u.test(r.name) &&
      r.trip_id === c.trip_id &&
      r.owner_person_id === c.owner_person_id &&
      r.is_private === (c.owner_person_id !== null) &&
      r.category === c.name &&
      (r.deleted_at !== null) === deleted &&
      ascending(r.recipient_person_ids) &&
      ascending(r.contributor_person_ids)
  );
export const packingCategoryLaneV3 = z
  .object({
    version: z.literal(3),
    kind: z.literal('packing-category-lane'),
    scope: packingScope,
    collection_revision: counter,
    lane: z.enum(['common', 'personal']),
    owner_person_id: packingId.nullable(),
    categories,
  })
  .strict()
  .refine(
    (p) =>
      aggregateBounded(p) &&
      p.owner_person_id === (p.lane === 'common' ? null : p.scope.person_id) &&
      new Set(p.categories.map((c) => c.id)).size === p.categories.length &&
      new Set(p.categories.map((c) => c.name)).size === p.categories.length &&
      p.categories.every(
        (c, i) =>
          c.trip_id === p.scope.trip_id &&
          c.owner_person_id === p.owner_person_id &&
          c.deleted_at === null &&
          (i === 0 ||
            p.categories[i - 1].sort_order < c.sort_order ||
            (p.categories[i - 1].sort_order === c.sort_order && p.categories[i - 1].id < c.id))
      )
  );
export const packingCategoryObservationV3 = z
  .object({
    version: z.literal(3),
    kind: z.literal('packing-category-observation'),
    scope: packingScope,
    collection_revision: counter,
    category: packingCategoryV2,
    items,
    batch: batch.nullable(),
  })
  .strict()
  .refine(
    (p) =>
      aggregateBounded(p) &&
      aggregateOwner(p.category, p.scope) &&
      aggregateMembers(p.items, p.category, p.category.deleted_at !== null) &&
      (p.category.deleted_at === null
        ? p.batch === null
        : p.batch === null
          ? p.items.length === 0
          : p.batch.item_count === p.items.length)
  );
const common = {
  version: z.literal(3),
  kind: z.literal('packing-category-aggregate'),
  operation_id: packingId,
  scope: packingScope,
  expected_collection_revision: counter,
};
const empty = z.object({}).strict();
export const packingCategoryAggregateCommand = z
  .discriminatedUnion('action', [
    z
      .object({
        ...common,
        action: z.literal('category-reorder'),
        target_id: z.null(),
        observed: packingCategoryLaneV3,
        values: z.object({ ordered_ids: z.array(packingId).max(2000) }).strict(),
      })
      .strict(),
    ...(['category-trash-batch', 'category-restore-batch'] as const).map((action) =>
      z
        .object({
          ...common,
          action: z.literal(action),
          target_id: packingId,
          observed: packingCategoryObservationV3,
          values: empty,
        })
        .strict()
    ),
  ])
  .refine((c) => {
    if (
      !aggregateBounded(c.scope, 4096) ||
      !aggregateBounded(c.values, 262144) ||
      JSON.stringify(c.scope) !== JSON.stringify(c.observed.scope) ||
      c.expected_collection_revision !== c.observed.collection_revision
    )
      return false;
    if (c.action === 'category-reorder') {
      const o = c.observed,
        ids = c.values.ordered_ids;
      return (
        ids.length === o.categories.length &&
        new Set(ids).size === ids.length &&
        ids.every((id) => o.categories.some((category) => category.id === id))
      );
    }
    const o = c.observed;
    return (
      c.target_id === o.category.id &&
      (c.action === 'category-restore-batch'
        ? o.category.deleted_at !== null && o.batch !== null
        : o.category.deleted_at === null && o.batch === null)
    );
  });
export const packingCategoryAggregateEnvelope = z
  .object({
    version: z.literal(3),
    source_url: z.string().min(1),
    view_layer: z.literal('published'),
    command: packingCategoryAggregateCommand,
  })
  .strict()
  .refine((p) => aggregateBounded(p));
export type PackingCategoryAggregateEnvelope = z.infer<typeof packingCategoryAggregateEnvelope>;
export type PackingCategoryLaneV3 = z.infer<typeof packingCategoryLaneV3>;
export type PackingCategoryObservationV3 = z.infer<typeof packingCategoryObservationV3>;
const ack = {
  version: z.literal(3),
  kind: z.literal('packing-category-aggregate'),
  trip_id: packingId,
  operation_id: packingId,
  scope: packingScope,
  collection_revision: counter,
  changed: z.boolean(),
};
export const packingCategoryAggregateAck = z.discriminatedUnion('action', [
  z
    .object({
      ...ack,
      action: z.literal('category-reorder'),
      target_id: z.null(),
      lane: z.enum(['common', 'personal']),
      values: z.object({ ordered_ids: z.array(packingId).max(2000) }).strict(),
      categories,
    })
    .strict(),
  ...(['category-trash-batch', 'category-restore-batch'] as const).map((action) =>
    z
      .object({
        ...ack,
        action: z.literal(action),
        target_id: packingId,
        values: empty,
        category: packingCategoryV2,
        items,
        batch,
      })
      .strict()
  ),
]);
export type PackingCategoryAggregateAck = z.infer<typeof packingCategoryAggregateAck>;
export const packingCategoryAggregateReceipt = z
  .object({
    version: z.literal(3),
    kind: z.literal('packing-category-aggregate'),
    trip_id: packingId,
    operation_id: packingId,
    scope: packingScope,
    status: z.enum(['unknown', 'committed']),
    result_redacted: z.boolean(),
    result: packingCategoryAggregateAck.nullable(),
  })
  .strict();
export const packingCategoryBatchesV3 = z
  .object({
    version: z.literal(3),
    kind: z.literal('packing-category-trash'),
    scope: packingScope,
    collection_revision: counter,
    categories: z
      .array(z.object({ category: packingCategoryV2, batch: batch.nullable(), item_count: counter.max(2000) }).strict())
      .max(100),
    next_cursor: packingCursor.nullable(),
  })
  .strict();
