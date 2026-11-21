import { z } from 'zod';
import { packingJson } from './packingCommandContract';
import { packingId, packingList, packingRow, packingScope, packingTimestamp } from './packingContract';
import { packingGroupBytes } from './packingGroupContract';

const counter = z.number().int().nonnegative().safe();
const ascending = (ids: string[]) => ids.every((id, i) => i === 0 || ids[i - 1] < id);
const label = z.string().refine((s) => !s.includes('\0') && !/\p{Surrogate}/u.test(s) && Array.from(s).length <= 200);
const assignment = z
  .object({
    person_id: packingId,
    assigned_at: packingTimestamp.nullable(),
    assigned_by_person_id: packingId.nullable(),
  })
  .strict()
  .refine((a) => (a.assigned_at === null) === (a.assigned_by_person_id === null));
export const packingCategory = z
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
      .refine((xs) => ascending(xs.map((x) => x.person_id))),
  })
  .strict()
  .refine((c) => c.owner_person_id === null || c.assignments.length === 0);
export type PackingCategory = z.infer<typeof packingCategory>;
export const packingCategoryPacket = z
  .object({
    version: z.literal(1),
    scope: packingScope,
    collection_revision: counter,
    packing: packingList,
    categories: z.array(packingCategory).max(2000),
    item_categories: z.array(z.object({ item_id: packingId, category_id: packingId }).strict()).max(2000),
    people: z.array(
      z
        .object({
          id: packingId,
          display_name: z.string(),
          is_guest: z.boolean(),
          eligible: z.boolean(),
        })
        .strict()
    ),
  })
  .strict()
  .refine((p) => {
    if (
      packingJson(p.scope) !== packingJson(p.packing.scope) ||
      p.collection_revision !== p.packing.collection_revision ||
      !ascending(p.categories.map((c) => c.id)) ||
      !ascending(p.item_categories.map((x) => x.item_id)) ||
      !ascending(p.people.map((x) => x.id)) ||
      p.item_categories.length !== p.packing.items.length
    )
      return false;
    const categories = new Map(p.categories.map((c) => [c.id, c])),
      rows = new Map(p.packing.items.map((r) => [r.id, r])),
      referenced = new Set<string>(),
      people = new Set<string>();
    const categoryPeople = referencedCategoryPeople(p);
    if (categoryPeople === null) return false;
    categoryPeople.forEach((id) => people.add(id));
    for (const link of p.item_categories) {
      const row = rows.get(link.item_id),
        c = categories.get(link.category_id);
      if (
        !row ||
        !c ||
        row.category !== c.name ||
        (row.is_private
          ? row.owner_person_id !== c.owner_person_id || c.owner_person_id === null
          : c.owner_person_id !== null)
      )
        return false;
      referenced.add(c.id);
    }
    return (
      referenced.size === categories.size && people.size === p.people.length && p.people.every((p) => people.has(p.id))
    );
  });
export type PackingCategoryPacket = z.infer<typeof packingCategoryPacket>;
/** Display facts for referenced historical People are not the selectable eligible traveler roster. */
export function packingCategoryPeople(
  packet: Pick<PackingCategoryPacket, 'people'> | undefined,
  roster: { personId: string; displayName: string }[]
) {
  const known = new Set(roster.map((p) => p.personId));
  return roster.concat(
    packet?.people.filter((p) => !known.has(p.id)).map((p) => ({ personId: p.id, displayName: p.display_name })) ?? []
  );
}
const common = {
  version: z.literal(1),
  kind: z.literal('packing-category'),
  operation_id: packingId,
  scope: packingScope,
  expected_collection_revision: counter,
  observed_category: packingCategory.refine((c) => packingGroupBytes(c) <= 262144),
};
export const packingCategoryCommand = z
  .discriminatedUnion('action', [
    z
      .object({
        ...common,
        action: z.literal('category-rename'),
        values: z.object({ name: label.refine((s) => Array.from(s).length > 0) }).strict(),
      })
      .strict(),
    z
      .object({
        ...common,
        action: z.literal('category-assignees'),
        values: z
          .object({
            person_ids: z.array(packingId).max(2000).refine(ascending),
          })
          .strict(),
      })
      .strict(),
  ])
  .refine(
    (c) =>
      c.scope.trip_id === c.observed_category.trip_id &&
      (c.observed_category.owner_person_id === null || c.observed_category.owner_person_id === c.scope.person_id) &&
      (c.action !== 'category-assignees' || c.observed_category.owner_person_id === null) &&
      packingGroupBytes(c.values) <= 262144
  );
export type PackingCategoryCommand = z.infer<typeof packingCategoryCommand>;
export type PackingCategoryIntent =
  | { action: 'category-rename'; values: { name: string } }
  | { action: 'category-assignees'; values: { person_ids: string[] } };
export const packingCategoryEnvelope = z
  .object({
    version: z.literal(1),
    source_url: z.string().min(1),
    view_layer: z.enum(['published', 'myDraft']),
    command: packingCategoryCommand,
    original_items: z.array(packingRow).max(2000),
  })
  .strict()
  .refine((p) => {
    const c = p.command.observed_category;
    return (
      ascending(p.original_items.map((r) => r.id)) &&
      p.original_items.every(
        (r) =>
          r.deleted_at === null &&
          r.trip_id === c.trip_id &&
          r.category === c.name &&
          (c.owner_person_id === null ? !r.is_private : r.is_private && r.owner_person_id === c.owner_person_id)
      ) &&
      packingGroupBytes(p) <= 8388608
    );
  });
export type PackingCategoryEnvelope = z.infer<typeof packingCategoryEnvelope>;
export function observePackingCategory(packet: PackingCategoryPacket, id: string) {
  const p = packingCategoryPacket.parse(packet),
    c = p.categories.find((c) => c.id === id);
  if (!c) throw new Error('A category from the coupled original is required.');
  const links = new Set(p.item_categories.filter((x) => x.category_id === id).map((x) => x.item_id));
  return { category: c, items: p.packing.items.filter((r) => links.has(r.id)).sort((a, b) => (a.id < b.id ? -1 : 1)) };
}
export const packingCategoryAck = z
  .object({
    version: z.literal(1),
    kind: z.literal('packing-category'),
    trip_id: packingId,
    operation_id: packingId,
    scope: packingScope,
    action: z.enum(['category-rename', 'category-assignees']),
    values: z.union([
      z.object({ name: label }).strict(),
      z.object({ person_ids: z.array(packingId).max(2000).refine(ascending) }).strict(),
    ]),
    collection_revision: counter,
    category: packingCategory,
    changed_item_revisions: z
      .array(z.object({ item_id: packingId, revision: counter.refine((n) => n > 0) }).strict())
      .max(2000)
      .refine((xs) => ascending(xs.map((x) => x.item_id))),
  })
  .strict();
export type PackingCategoryAck = z.infer<typeof packingCategoryAck>;
export const packingCategoryReceipt = z
  .object({
    version: z.literal(1),
    kind: z.literal('packing-category'),
    trip_id: packingId,
    operation_id: packingId,
    scope: packingScope,
    status: z.enum(['unknown', 'committed']),
    result_redacted: z.boolean(),
    result: packingCategoryAck.nullable(),
  })
  .strict();

function referencedCategoryPeople(p: {
  categories: PackingCategory[];
  scope: { trip_id: string };
  packing: { category_assignees?: Record<string, string[]> };
}) {
  const people = new Set<string>();
  if (!p.packing.category_assignees) return null;
  for (const c of p.categories) {
    if (c.trip_id !== p.scope.trip_id) return null;
    if (c.owner_person_id) people.add(c.owner_person_id);
    for (const a of c.assignments) {
      people.add(a.person_id);
      if (a.assigned_by_person_id) people.add(a.assigned_by_person_id);
    }
    if (
      c.owner_person_id === null &&
      packingJson(c.assignments.map((a) => a.person_id)) !==
        packingJson(
          Object.prototype.hasOwnProperty.call(p.packing.category_assignees, c.name)
            ? p.packing.category_assignees[c.name]
            : []
        )
    )
      return null;
  }
  return people;
}
