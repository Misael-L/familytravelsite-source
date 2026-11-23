import { packingCategoryV2Rpc, type PackingCategoryV2RpcName } from '@family/backend/supabase/packingCategoryV2Rpc';
import { z } from 'zod';
import { FamilyApiError } from './errors';
import {
  equalPackingFacts as equal,
  packingCategoryLookupV2,
  packingCategorySnapshotV2,
  packingCategoryTrashV2,
  packingCategoryV2Ack,
  packingCategoryV2Envelope,
  packingCategoryV2Receipt,
  type PackingCategoryItemEnvelope,
  type PackingCategoryLifecycleEnvelope,
  type PackingCategoryV2,
  type PackingCategoryV2Ack,
  type PackingCategoryV2Envelope,
} from './packingCategoryV2Contract';
import { trimPackingName } from './packingCommandContract';
import { packingCursor, packingIdentity, type PackingIdentity, type PackingScope } from './packingContract';
import { packingGroupBytes } from './packingGroupContract';
import { checkPackingList } from './packingTransport';

export type PackingCategoryV2Rpc = (name: PackingCategoryV2RpcName, args: Record<string, unknown>) => Promise<unknown>;
function invalid(): never {
  throw new FamilyApiError(
    502,
    'invalid_packing_category_v2_response',
    'The category result does not match the original context.'
  );
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  try {
    if (packingGroupBytes(raw) > 8388608) invalid();
  } catch {
    invalid();
  }
  const p = schema.safeParse(raw);
  return p.success ? p.data : invalid();
}
function identity(s: PackingScope, expected: PackingIdentity) {
  if (
    s.trip_id !== expected.trip_id ||
    s.family_id !== expected.family_id ||
    s.user_id !== expected.user_id ||
    s.person_id !== expected.person_id
  )
    invalid();
}
function lane(c: PackingCategoryV2, s: PackingScope) {
  if (c.trip_id !== s.trip_id || (c.owner_person_id !== null && c.owner_person_id !== s.person_id)) invalid();
}
function modifiedCategory(
  before: PackingCategoryV2,
  after: PackingCategoryV2,
  changes: Partial<PackingCategoryV2>,
  changed: boolean
) {
  if (changed && after.updated_at === before.updated_at) invalid();
  if (
    !equal(after, {
      ...before,
      ...changes,
      revision: before.revision + (changed ? 1 : 0),
      updated_at: changed ? after.updated_at : before.updated_at,
    })
  )
    invalid();
}
export function checkPackingCategorySnapshotV2(raw: unknown, expected: PackingIdentity) {
  const p = parse(packingCategorySnapshotV2, raw);
  checkPackingList(p.packing, packingIdentity.parse(expected));
  return p;
}
type LifecycleAck = Extract<PackingCategoryV2Ack, { kind: 'packing-category-lifecycle' }>;
type ItemAck = Extract<PackingCategoryV2Ack, { kind: 'packing-category-item' }>;
function matches<T extends object>(row: T, facts: Partial<T>) {
  return Object.entries(facts).every(([key, value]) => equal(row[key as keyof T], value));
}
function checkLifecycle(a: LifecycleAck, p: PackingCategoryLifecycleEnvelope) {
  const c = p.command,
    after = a.category,
    before = c.observed_category;
  if (c.action === 'category-create') {
    const facts = {
      id: c.target_id,
      name: c.values.name,
      revision: 1,
      owner_person_id: c.values.visibility === 'personal' ? c.scope.person_id : null,
      retained_when_empty: true,
      deleted_at: null,
      assignments: [],
    };
    if (!a.changed || !matches(after, facts)) invalid();
    return;
  }
  if (!before) invalid();
  const changed = c.action !== 'category-retain' || !before.retained_when_empty;
  if (a.changed !== changed) invalid();
  const changes: Partial<PackingCategoryV2> =
    c.action === 'category-dismiss-empty'
      ? { deleted_at: after.deleted_at, deleted_by_person_id: c.scope.person_id }
      : { retained_when_empty: true, deleted_at: null, deleted_by_person_id: null };
  if (c.action === 'category-dismiss-empty' && after.deleted_at === null) invalid();
  modifiedCategory(before, after, changes, changed);
}
function checkCreatedItem(
  r: ItemAck['item'],
  c: Extract<PackingCategoryItemEnvelope['command'], { action: 'category-item-create' }>
) {
  const v = c.values,
    n = v.packed_quantity ?? 0,
    q = v.quantity ?? 1;
  const facts = {
    name: trimPackingName(v.name),
    quantity: q,
    weight_grams: v.weight_grams ?? null,
    bag_id: v.bag_id ?? null,
    revision: 1,
    recipient_person_ids: [],
    contributor_person_ids: [],
    checked: 'packed_quantity' in v ? n === q : (v.checked ?? false),
    packed_quantity: n > 0 && n < q ? n : null,
  };
  if (!matches(r, facts)) invalid();
}
function checkItem(a: ItemAck, p: PackingCategoryItemEnvelope) {
  const c = p.command,
    before = c.observed_category,
    r = a.item;
  const changed = c.action === 'category-item-create' || p.original_category_id !== c.category_id;
  if (
    a.target_id !== c.target_id ||
    !matches(r, {
      id: c.target_id,
      trip_id: c.scope.trip_id,
      deleted_at: null,
      category: before.name,
      owner_person_id: before.owner_person_id,
      is_private: before.owner_person_id !== null,
    }) ||
    a.changed !== changed
  )
    invalid();
  const retained = changed && !before.retained_when_empty;
  modifiedCategory(before, a.category, retained ? { retained_when_empty: true } : {}, retained);
  if (c.action === 'category-item-create') checkCreatedItem(r, c);
  else {
    const b = p.original_item;
    if (
      !b ||
      (changed && r.updated_at === b.updated_at) ||
      !equal(r, {
        ...b,
        category: before.name,
        revision: b.revision + (changed ? 1 : 0),
        updated_at: changed ? r.updated_at : b.updated_at,
      })
    )
      invalid();
  }
}
/** A historical proof, never a current snapshot or permission to publish one. */
export function checkPackingCategoryV2Acknowledgement(
  raw: unknown,
  original: PackingCategoryV2Envelope
): PackingCategoryV2Ack {
  const p = packingCategoryV2Envelope.parse(original),
    c = p.command,
    a = parse(packingCategoryV2Ack, raw);
  if (
    !matches<Pick<PackingCategoryV2Ack, 'kind' | 'action' | 'trip_id' | 'operation_id' | 'scope' | 'values'>>(a, {
      kind: c.kind,
      action: c.action,
      trip_id: c.scope.trip_id,
      operation_id: c.operation_id,
      scope: c.scope,
      values: c.values,
    })
  )
    invalid();
  lane(a.category, c.scope);
  if (p.command.kind === 'packing-category-lifecycle' && a.kind === 'packing-category-lifecycle')
    checkLifecycle(a, p as PackingCategoryLifecycleEnvelope);
  else if (p.command.kind === 'packing-category-item' && a.kind === 'packing-category-item' && 'original_item' in p)
    checkItem(a, p);
  else invalid();
  if (
    a.changed
      ? a.collection_revision <= c.expected_collection_revision
      : a.collection_revision !== c.expected_collection_revision
  )
    invalid();
  return a;
}
function instant(s: string) {
  const fraction = s.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? '';
  return BigInt(Date.parse(s)) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3, 6));
}
async function readCategoryTrash(
  call: PackingCategoryV2Rpc,
  expected: PackingIdentity,
  limit: number,
  before: z.infer<typeof packingCursor> | null
) {
  const e = packingIdentity.parse(expected),
    n = z.number().int().min(1).max(100).parse(limit),
    cursor = before === null ? null : packingCursor.parse(before);
  const p = parse(
    packingCategoryTrashV2,
    await call('list_family_trip_packing_category_trash_v2', {
      p_trip_id: e.trip_id,
      p_limit: n,
      p_before_deleted_at: cursor?.deleted_at ?? null,
      p_before_id: cursor?.id ?? null,
    })
  );
  identity(p.scope, e);
  const follows = (a: z.infer<typeof packingCursor>, b: z.infer<typeof packingCursor>) =>
    instant(a.deleted_at) < instant(b.deleted_at) || (instant(a.deleted_at) === instant(b.deleted_at) && a.id < b.id);
  if (p.categories.length > n || new Set(p.categories.map((c) => c.id)).size !== p.categories.length) invalid();
  let previous = cursor;
  for (const c of p.categories) {
    lane(c, p.scope);
    if (c.deleted_at === null) invalid();
    const current = { id: c.id, deleted_at: c.deleted_at };
    if (previous && !follows(current, previous)) invalid();
    previous = current;
  }
  if (p.next_cursor && (p.categories.length !== n || !equal(p.next_cursor, previous))) invalid();
  return p;
}
export function createPackingCategoryV2Transport(rpc: PackingCategoryV2Rpc = packingCategoryV2Rpc) {
  const call: PackingCategoryV2Rpc = async (name, args) => {
    try {
      return await rpc(name, args);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      const codes: Record<string, number> = {
        '42501': 403,
        PGRST301: 401,
        PGRST302: 401,
        PGRST303: 401,
        PT409: 409,
        '40001': 409,
        '22023': 400,
        '23503': 422,
        '23514': 422,
        '54000': 413,
        '0A000': 422,
      };
      if (Object.prototype.hasOwnProperty.call(codes, code))
        throw new FamilyApiError(
          codes[code],
          'packing_category_v2_refused',
          'The original category request was refused.'
        );
      throw error;
    }
  };
  return {
    async list(expected: PackingIdentity) {
      const e = packingIdentity.parse(expected);
      return checkPackingCategorySnapshotV2(
        await call('get_family_trip_packing_with_categories_v2', { p_trip_id: e.trip_id }),
        e
      );
    },
    async lookup(expected: PackingIdentity, visibility: 'common' | 'personal', name: string) {
      const e = packingIdentity.parse(expected);
      const args = z
        .object({
          visibility: z.enum(['common', 'personal']),
          name: z.string().refine((s) => !s.includes('\0') && !/\p{Surrogate}/u.test(s) && Array.from(s).length <= 200),
        })
        .strict()
        .parse({ visibility, name });
      const p = parse(
        packingCategoryLookupV2,
        await call('lookup_family_trip_packing_category_v2', {
          p_trip_id: e.trip_id,
          p_visibility: args.visibility,
          p_name: args.name,
        })
      );
      identity(p.scope, e);
      if (p.category) {
        lane(p.category, p.scope);
        if (p.category.name !== name || p.category.owner_person_id !== (visibility === 'personal' ? e.person_id : null))
          invalid();
      }
      return p;
    },
    trash: (expected: PackingIdentity, limit = 50, before: z.infer<typeof packingCursor> | null = null) =>
      readCategoryTrash(call, expected, limit, before),
    async execute(original: PackingCategoryV2Envelope) {
      const p = packingCategoryV2Envelope.parse(original),
        c = p.command;
      const args = {
        p_trip_id: c.scope.trip_id,
        p_operation_id: c.operation_id,
        p_scope: c.scope,
        p_action: c.action,
        p_target_id: c.target_id,
        p_expected_collection_revision: c.expected_collection_revision,
        p_observed_category: c.observed_category,
        p_values: c.values,
      };
      const raw =
        c.kind === 'packing-category-lifecycle'
          ? await call('execute_family_trip_packing_category_lifecycle_v2', args)
          : await call('execute_family_trip_packing_category_item_v2', {
              ...args,
              p_expected_revision: c.expected_revision,
              p_category_id: c.category_id,
            });
      return checkPackingCategoryV2Acknowledgement(raw, p);
    },
    async receipt(original: PackingCategoryV2Envelope) {
      const p = packingCategoryV2Envelope.parse(original),
        c = p.command;
      const r = parse(
        packingCategoryV2Receipt,
        await call(
          c.kind === 'packing-category-lifecycle'
            ? 'get_family_trip_packing_category_lifecycle_receipt_v2'
            : 'get_family_trip_packing_category_item_receipt_v2',
          { p_trip_id: c.scope.trip_id, p_operation_id: c.operation_id }
        )
      );
      identity(r.scope, c.scope);
      if (
        r.kind !== c.kind ||
        r.trip_id !== c.scope.trip_id ||
        r.operation_id !== c.operation_id ||
        r.scope.trip_lifecycle_revision < c.scope.trip_lifecycle_revision
      )
        invalid();
      if (
        r.status === 'unknown'
          ? r.result !== null || r.result_redacted
          : r.result_redacted
            ? r.result !== null
            : r.result === null
      )
        invalid();
      if (r.result) checkPackingCategoryV2Acknowledgement(r.result, p);
      return r;
    },
  };
}
