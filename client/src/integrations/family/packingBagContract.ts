import { z } from 'zod';
import { packingJson, trimPackingName } from './packingCommandContract';
import { packingCursor, packingId, packingList, packingScope, packingTimestamp } from './packingContract';
import { packingGroupBytes } from './packingGroupContract';

export const PACKING_BAG_BYTES = 1048576;
export const PACKING_BAG_SNAPSHOT_BYTES = 8388608;
export function bagBounded(value: unknown, limit = PACKING_BAG_BYTES) {
  try {
    return packingGroupBytes(value) <= limit;
  } catch {
    return false;
  }
}
export const equalBagFacts = (a: unknown, b: unknown) => packingJson(a) === packingJson(b);
const counter = z.number().int().nonnegative().safe();
const revision = counter.refine((n) => n > 0);
const text = z.string().refine((s) => !s.includes('\0') && !/\p{Surrogate}/u.test(s));
const name = text.refine((s) => s === trimPackingName(s) && Array.from(s).length >= 1 && Array.from(s).length <= 500);
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullable();
const weight = z.number().int().min(1).max(10000000).nullable();
const sorted = (ids: string[]) => ids.every((id, i) => i === 0 || ids[i - 1] < id);
const members = z.array(packingId).refine(sorted);
export const packingBagRow = z
  .object({
    id: packingId,
    trip_id: packingId,
    name: text,
    color: text.nullable(),
    sort_order: z.number().int().min(0).max(2147483647),
    weight_limit_grams: weight,
    created_at: packingTimestamp,
    updated_at: packingTimestamp,
    revision,
    deleted_at: packingTimestamp.nullable(),
    deleted_by_person_id: packingId.nullable(),
  })
  .strict()
  .refine((b) => (b.deleted_at === null) === (b.deleted_by_person_id === null));
export type PackingBagRow = z.infer<typeof packingBagRow>;
export const packingBagObservation = z
  .object({
    version: z.literal(1),
    kind: z.literal('packing-bag-observation'),
    scope: packingScope,
    collection_revision: counter,
    bag: packingBagRow,
    member_person_ids: members,
  })
  .strict()
  .refine((o) => o.bag.trip_id === o.scope.trip_id && bagBounded(o));
export type PackingBagObservation = z.infer<typeof packingBagObservation>;
export const packingBagSnapshot = z
  .object({
    version: z.literal(1),
    kind: z.literal('packing-bag-snapshot'),
    scope: packingScope,
    collection_revision: counter,
    packing: packingList,
    bags: z.array(packingBagObservation).max(2000),
    people: z.array(z.object({ id: packingId, display_name: text, eligible: z.boolean() }).strict()),
  })
  .strict()
  .refine((p) => {
    if (
      !bagBounded(p, PACKING_BAG_SNAPSHOT_BYTES) ||
      !equalBagFacts(p.scope, p.packing.scope) ||
      p.collection_revision !== p.packing.collection_revision ||
      p.bags.length !== p.packing.bags.length ||
      new Set(p.bags.map((o) => o.bag.id)).size !== p.bags.length ||
      !sorted(p.people.map((x) => x.id))
    )
      return false;
    const people = new Set(p.people.map((x) => x.id));
    return (
      p.bags.every((o, i) => {
        const b = o.bag,
          old = p.packing.bags[i],
          previous = p.bags[i - 1]?.bag;
        const legacy = {
          id: b.id,
          trip_id: b.trip_id,
          name: b.name,
          color: b.color,
          sort_order: b.sort_order,
          weight_limit_grams: b.weight_limit_grams,
          created_at: b.created_at,
          updated_at: b.updated_at,
        };
        return (
          b.deleted_at === null &&
          b.trip_id === p.scope.trip_id &&
          equalBagFacts(o.scope, p.scope) &&
          o.collection_revision === p.collection_revision &&
          (!previous ||
            previous.sort_order < b.sort_order ||
            (previous.sort_order === b.sort_order && previous.id < b.id)) &&
          equalBagFacts(
            { ...legacy, member_person_ids: o.member_person_ids, total_weight_grams: old.total_weight_grams },
            old
          ) &&
          o.member_person_ids.every((id) => people.has(id))
        );
      }) &&
      p.packing.items.every(
        (i) => i.trip_id === p.scope.trip_id && (i.bag_id === null || p.bags.some((o) => o.bag.id === i.bag_id))
      )
    );
  });
export type PackingBagSnapshot = z.infer<typeof packingBagSnapshot>;
const defined = (v: object) => Object.values(v).every((x) => x !== undefined);
const createValues = z
  .object({ name, color: color.optional(), weight_limit_grams: weight.optional() })
  .strict()
  .refine(defined);
const updateValues = z
  .object({ name: name.optional(), color: color.optional(), weight_limit_grams: weight.optional() })
  .strict()
  .refine((v) => defined(v) && Object.keys(v).length > 0);
const memberValues = z.object({ person_ids: members.refine((ids) => ids.length <= 2000) }).strict();
const actions = z.discriminatedUnion('action', [
  z.object({ action: z.literal('bag-create'), values: createValues }).strict(),
  z.object({ action: z.literal('bag-update'), values: updateValues }).strict(),
  z.object({ action: z.literal('bag-members'), values: memberValues }).strict(),
  z.object({ action: z.literal('bag-trash-empty'), values: z.object({}).strict() }).strict(),
  z.object({ action: z.literal('bag-restore'), values: z.object({}).strict() }).strict(),
]);
const common = {
  version: z.literal(1),
  kind: z.literal('packing-bag'),
  operation_id: packingId,
  scope: packingScope,
  target_id: packingId,
  expected_collection_revision: counter,
};
export const packingBagCommand = z
  .object({
    ...common,
    action: z.enum(['bag-create', 'bag-update', 'bag-members', 'bag-trash-empty', 'bag-restore']),
    expected_revision: revision.nullable(),
    observed: packingBagObservation.nullable(),
    values: z.unknown(),
  })
  .strict()
  .refine((c) => {
    if (
      !actions.safeParse({ action: c.action, values: c.values }).success ||
      !bagBounded(c.scope, 4096) ||
      !bagBounded([
        c.scope.trip_id,
        c.operation_id,
        c.scope,
        c.action,
        c.target_id,
        c.expected_revision,
        c.expected_collection_revision,
        c.observed,
        c.values,
      ])
    )
      return false;
    if (c.action === 'bag-create') return c.expected_revision === null && c.observed === null;
    const o = c.observed;
    return (
      o !== null &&
      c.expected_revision === o.bag.revision &&
      c.target_id === o.bag.id &&
      c.expected_collection_revision === o.collection_revision &&
      equalBagFacts(c.scope, o.scope) &&
      (c.action === 'bag-restore' ? o.bag.deleted_at !== null : o.bag.deleted_at === null)
    );
  })
  .transform((c) => ({ ...c, ...actions.parse({ action: c.action, values: c.values }) }));
export const packingBagEnvelope = z
  .object({
    version: z.literal(1),
    source_url: text.min(1).max(4096),
    view_layer: z.literal('published'),
    command: packingBagCommand,
  })
  .strict()
  .refine((p) => bagBounded(p));
export type PackingBagEnvelope = z.infer<typeof packingBagEnvelope>;
export const packingBagAck = z
  .object({
    version: z.literal(1),
    kind: z.literal('packing-bag'),
    trip_id: packingId,
    operation_id: packingId,
    scope: packingScope,
    action: z.enum(['bag-create', 'bag-update', 'bag-members', 'bag-trash-empty', 'bag-restore']),
    target_id: packingId,
    values: z.unknown(),
    collection_revision: counter,
    changed: z.boolean(),
    bag: packingBagRow,
    member_person_ids: members,
  })
  .strict()
  .refine(
    (a) =>
      actions.safeParse({ action: a.action, values: a.values }).success &&
      a.trip_id === a.scope.trip_id &&
      a.bag.trip_id === a.trip_id &&
      a.bag.id === a.target_id &&
      bagBounded(a)
  )
  .transform((a) => ({ ...a, ...actions.parse({ action: a.action, values: a.values }) }));
export type PackingBagAck = z.infer<typeof packingBagAck>;
export const packingBagReceipt = z
  .object({
    version: z.literal(1),
    kind: z.literal('packing-bag'),
    trip_id: packingId,
    operation_id: packingId,
    scope: packingScope,
    status: z.enum(['unknown', 'committed']),
    result_redacted: z.boolean(),
    result: packingBagAck.nullable(),
  })
  .strict()
  .refine(
    (r) =>
      bagBounded(r) &&
      r.trip_id === r.scope.trip_id &&
      (r.status === 'unknown'
        ? !r.result_redacted && r.result === null
        : r.result_redacted
          ? r.result === null
          : r.result !== null)
  );
export const packingBagTrash = z
  .object({
    version: z.literal(1),
    kind: z.literal('packing-bag-trash'),
    scope: packingScope,
    collection_revision: counter,
    bags: z.array(packingBagObservation).max(100),
    next_cursor: packingCursor.nullable(),
  })
  .strict()
  .refine(
    (p) =>
      bagBounded(p, PACKING_BAG_SNAPSHOT_BYTES) &&
      new Set(p.bags.map((o) => o.bag.id)).size === p.bags.length &&
      p.bags.every(
        (o) =>
          o.bag.deleted_at !== null &&
          equalBagFacts(o.scope, p.scope) &&
          o.collection_revision === p.collection_revision
      )
  );

export type PackingBagTrashPage = z.infer<typeof packingBagTrash>;
