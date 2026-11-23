import { z } from 'zod';
import { packingCategory, packingCategoryPacket } from './packingCategoryContract';
import { packingJson, trimPackingName } from './packingCommandContract';
import { packingCursor, packingId, packingList, packingRow, packingScope, packingTimestamp } from './packingContract';
import { packingGroupBytes } from './packingGroupContract';

const counter = z.number().int().nonnegative().safe();
const scalarText = (s: string) => !s.includes('\0') && !/\p{Surrogate}/u.test(s);
const label = z.string().refine((s) => scalarText(s) && Array.from(s).length <= 200);
const newLabel = label.refine((s) => Array.from(trimPackingName(s)).length > 0);
const assignment = z
  .object({
    person_id: packingId,
    assigned_at: packingTimestamp.nullable(),
    assigned_by_person_id: packingId.nullable(),
  })
  .strict()
  .refine((a) => (a.assigned_at === null) === (a.assigned_by_person_id === null));
const ascending = (ids: string[]) => ids.every((id, i) => i === 0 || ids[i - 1] < id);
const bounded = (v: unknown, limit = 8388608) => {
  try {
    return packingGroupBytes(v) <= limit;
  } catch {
    return false;
  }
};
export const packingCategoryV2 = z
  .object({
    id: packingId,
    trip_id: packingId,
    owner_person_id: packingId.nullable(),
    name: label,
    revision: counter.refine((n) => n > 0),
    created_at: packingTimestamp,
    updated_at: packingTimestamp,
    assignments: z
      .array(assignment)
      .max(2000)
      .refine((a) => ascending(a.map((x) => x.person_id))),
    retained_when_empty: z.boolean(),
    sort_order: counter,
    deleted_at: packingTimestamp.nullable(),
    deleted_by_person_id: packingId.nullable(),
  })
  .strict()
  .refine(
    (c) =>
      (c.owner_person_id === null || c.assignments.length === 0) &&
      (c.deleted_at === null) === (c.deleted_by_person_id === null)
  );
export type PackingCategoryV2 = z.infer<typeof packingCategoryV2>;
export const categoryV1Facts = (c: PackingCategoryV2) =>
  packingCategory.parse({
    id: c.id,
    trip_id: c.trip_id,
    owner_person_id: c.owner_person_id,
    name: c.name,
    revision: c.revision,
    created_at: c.created_at,
    updated_at: c.updated_at,
    assignments: c.assignments,
  });
const referencedPeople = (categories: PackingCategoryV2[]) =>
  new Set(
    categories.flatMap((c) => [
      ...(c.owner_person_id ? [c.owner_person_id] : []),
      ...(c.deleted_by_person_id ? [c.deleted_by_person_id] : []),
      ...c.assignments.flatMap((a) => [a.person_id, ...(a.assigned_by_person_id ? [a.assigned_by_person_id] : [])]),
    ])
  );
const compareCategory = (a: PackingCategoryV2, b: PackingCategoryV2) =>
  a.owner_person_id !== b.owner_person_id
    ? a.owner_person_id === null
      ? -1
      : b.owner_person_id === null
        ? 1
        : a.owner_person_id < b.owner_person_id
          ? -1
          : 1
    : a.sort_order !== b.sort_order
      ? a.sort_order < b.sort_order
        ? -1
        : 1
      : a.id < b.id
        ? -1
        : a.id === b.id
          ? 0
          : 1;
export const packingCategorySnapshotV2 = z
  .object({
    version: z.literal(2),
    scope: packingScope,
    collection_revision: counter,
    packing: packingList,
    categories: z.array(packingCategoryV2).max(2000),
    item_categories: z.array(z.object({ item_id: packingId, category_id: packingId }).strict()).max(2000),
    people: z
      .array(
        z.object({ id: packingId, display_name: z.string(), is_guest: z.boolean(), eligible: z.boolean() }).strict()
      )
      .max(2000),
  })
  .strict()
  .refine((p) => {
    const ids = new Set(p.categories.map((c) => c.id)),
      linked = new Set(p.item_categories.map((l) => l.category_id));
    if (
      !bounded(p) ||
      ids.size !== p.categories.length ||
      new Set(p.categories.map((c) => JSON.stringify([c.owner_person_id, c.name]))).size !== p.categories.length ||
      p.categories.some(
        (c, i) =>
          c.trip_id !== p.scope.trip_id ||
          c.deleted_at !== null ||
          (i > 0 && compareCategory(p.categories[i - 1], c) >= 0) ||
          (!linked.has(c.id) &&
            (!c.retained_when_empty || (c.owner_person_id !== null && c.owner_person_id !== p.scope.person_id)))
      )
    )
      return false;
    if (
      p.categories.some(
        (c) =>
          c.owner_person_id === null &&
          !equalPackingFacts(
            c.assignments.map((a) => a.person_id),
            Object.prototype.hasOwnProperty.call(p.packing.category_assignees, c.name)
              ? p.packing.category_assignees[c.name]
              : []
          )
      )
    )
      return false;
    const people = referencedPeople(p.categories);
    if (
      !ascending(p.people.map((x) => x.id)) ||
      people.size !== p.people.length ||
      p.people.some((x) => !people.has(x.id))
    )
      return false;
    // Reuse all v1 coupling checks on item-referenced metadata; do not relax the old parser for empty v2 cards.
    const categories = p.categories.filter((c) => linked.has(c.id));
    const itemPeople = referencedPeople(categories);
    return packingCategoryPacket.safeParse({
      ...p,
      version: 1,
      categories: categories.map(categoryV1Facts).sort((a, b) => (a.id < b.id ? -1 : 1)),
      people: p.people.filter((x) => itemPeople.has(x.id)),
    }).success;
  });
export type PackingCategorySnapshotV2 = z.infer<typeof packingCategorySnapshotV2>;
export const packingCategoryLookupV2 = z
  .object({
    version: z.literal(2),
    scope: packingScope,
    collection_revision: counter,
    category: packingCategoryV2.nullable(),
  })
  .strict();
export const packingCategoryTrashV2 = z
  .object({
    version: z.literal(2),
    kind: z.literal('packing-category-trash'),
    scope: packingScope,
    collection_revision: counter,
    categories: z.array(packingCategoryV2).max(100),
    next_cursor: packingCursor.nullable(),
  })
  .strict();
const common = {
  version: z.literal(2),
  operation_id: packingId,
  scope: packingScope,
  target_id: packingId,
  expected_collection_revision: counter,
};
const observed = packingCategoryV2.refine((c) => bounded(c, 262144));
const empty = z.object({}).strict();
export const packingCategoryLifecycleCommand = z
  .discriminatedUnion('action', [
    z
      .object({
        ...common,
        kind: z.literal('packing-category-lifecycle'),
        action: z.literal('category-create'),
        observed_category: z.null(),
        values: z.object({ name: newLabel, visibility: z.enum(['common', 'personal']) }).strict(),
      })
      .strict(),
    ...(['category-retain', 'category-dismiss-empty', 'category-restore-empty'] as const).map((action) =>
      z
        .object({
          ...common,
          kind: z.literal('packing-category-lifecycle'),
          action: z.literal(action),
          observed_category: observed,
          values: empty,
        })
        .strict()
    ),
  ])
  .refine(
    (c) =>
      c.observed_category === null ||
      (c.observed_category.id === c.target_id &&
        c.observed_category.trip_id === c.scope.trip_id &&
        (c.observed_category.owner_person_id === null || c.observed_category.owner_person_id === c.scope.person_id) &&
        (c.action === 'category-restore-empty') === (c.observed_category.deleted_at !== null))
  )
  .refine((c) => bounded(c.values, 262144));
const itemValues = z
  .object({
    name: z
      .string()
      .refine(
        (s) =>
          scalarText(s) && Array.from(trimPackingName(s)).length >= 1 && Array.from(trimPackingName(s)).length <= 500
      ),
    quantity: z.number().int().min(1).max(10000).optional(),
    weight_grams: z.number().int().min(0).max(1000000).nullable().optional(),
    bag_id: packingId.nullable().optional(),
    checked: z.boolean().optional(),
    packed_quantity: z.number().int().min(0).max(10000).nullable().optional(),
  })
  .strict()
  .refine(
    (v) =>
      !('checked' in v && 'packed_quantity' in v) &&
      (v.packed_quantity ?? 0) <= (v.quantity ?? 1) &&
      Object.values(v).every((x) => x !== undefined)
  );
export const packingCategoryItemCommand = z
  .discriminatedUnion('action', [
    z
      .object({
        ...common,
        kind: z.literal('packing-category-item'),
        action: z.literal('category-item-create'),
        expected_revision: z.null(),
        category_id: packingId,
        observed_category: observed,
        values: itemValues,
      })
      .strict(),
    z
      .object({
        ...common,
        kind: z.literal('packing-category-item'),
        action: z.literal('category-item-move'),
        expected_revision: counter.refine((n) => n > 0),
        category_id: packingId,
        observed_category: observed,
        values: empty,
      })
      .strict(),
  ])
  .refine(
    (c) =>
      c.category_id === c.observed_category.id &&
      c.observed_category.trip_id === c.scope.trip_id &&
      c.observed_category.deleted_at === null &&
      (c.observed_category.owner_person_id === null || c.observed_category.owner_person_id === c.scope.person_id)
  )
  .refine((c) => bounded(c.values, 65536));
export const packingCategoryLifecycleEnvelope = z
  .object({
    version: z.literal(2),
    source_url: z.string().min(1),
    view_layer: z.literal('published'),
    command: packingCategoryLifecycleCommand,
  })
  .strict()
  .refine((v) => bounded(v));
export const packingCategoryItemEnvelope = z
  .object({
    version: z.literal(2),
    source_url: z.string().min(1),
    view_layer: z.literal('published'),
    command: packingCategoryItemCommand,
    original_item: packingRow.nullable(),
    original_category_id: packingId.nullable(),
  })
  .strict()
  .refine((p) => {
    const c = p.command,
      r = p.original_item;
    return (
      bounded(p) &&
      (c.action === 'category-item-create'
        ? r === null && p.original_category_id === null
        : r !== null &&
          p.original_category_id !== null &&
          r.id === c.target_id &&
          r.revision === c.expected_revision &&
          r.trip_id === c.scope.trip_id &&
          r.deleted_at === null &&
          r.owner_person_id === c.observed_category.owner_person_id &&
          r.is_private === (c.observed_category.owner_person_id !== null))
    );
  });
export const packingCategoryV2Envelope = z.union([packingCategoryLifecycleEnvelope, packingCategoryItemEnvelope]);
export type PackingCategoryV2Envelope = z.infer<typeof packingCategoryV2Envelope>;
export type PackingCategoryLifecycleEnvelope = z.infer<typeof packingCategoryLifecycleEnvelope>;
export type PackingCategoryItemEnvelope = z.infer<typeof packingCategoryItemEnvelope>;
const ack = {
  version: z.literal(2),
  trip_id: packingId,
  operation_id: packingId,
  scope: packingScope,
  collection_revision: counter,
  category: packingCategoryV2,
  changed: z.boolean(),
};
export const packingCategoryLifecycleAck = z
  .object({
    ...ack,
    kind: z.literal('packing-category-lifecycle'),
    action: z.enum(['category-create', 'category-retain', 'category-dismiss-empty', 'category-restore-empty']),
    values: z.union([z.object({ name: newLabel, visibility: z.enum(['common', 'personal']) }).strict(), empty]),
  })
  .strict();
export const packingCategoryItemAck = z
  .object({
    ...ack,
    kind: z.literal('packing-category-item'),
    action: z.enum(['category-item-create', 'category-item-move']),
    target_id: packingId,
    values: z.union([itemValues, empty]),
    item: packingRow,
  })
  .strict();
export const packingCategoryV2Ack = z.union([packingCategoryLifecycleAck, packingCategoryItemAck]);
export type PackingCategoryV2Ack = z.infer<typeof packingCategoryV2Ack>;
const receipt = {
  version: z.literal(2),
  trip_id: packingId,
  operation_id: packingId,
  scope: packingScope,
  status: z.enum(['unknown', 'committed']),
  result_redacted: z.boolean(),
};
export const packingCategoryV2Receipt = z.union([
  z
    .object({
      ...receipt,
      kind: z.literal('packing-category-lifecycle'),
      result: packingCategoryLifecycleAck.nullable(),
    })
    .strict(),
  z
    .object({ ...receipt, kind: z.literal('packing-category-item'), result: packingCategoryItemAck.nullable() })
    .strict(),
]);
/** Typed keys preserve record identity; category UUIDs never enter the packing item namespace. */
export const packingCategoryKey = (id: string) => `packing-category:${packingId.parse(id)}` as const;
export const packingItemKey = (id: string) => `packing-item:${packingId.parse(id)}` as const;
export const equalPackingFacts = (a: unknown, b: unknown) => packingJson(a) === packingJson(b);
