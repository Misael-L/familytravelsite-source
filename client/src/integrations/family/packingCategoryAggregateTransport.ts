import {
  packingCategoryAggregateRpc,
  type PackingCategoryAggregateRpcName,
} from '@family/backend/supabase/packingCategoryAggregateRpc';
import { z } from 'zod';
import { FamilyApiError } from './errors';
import {
  aggregateBounded,
  aggregateMembers,
  aggregateOwner,
  packingCategoryAggregateAck,
  packingCategoryAggregateEnvelope,
  packingCategoryAggregateReceipt,
  packingCategoryBatchesV3,
  packingCategoryLaneV3,
  packingCategoryObservationV3,
  type PackingCategoryAggregateAck,
  type PackingCategoryAggregateEnvelope,
} from './packingCategoryAggregateContract';
import { equalPackingFacts as equal, type PackingCategoryV2 } from './packingCategoryV2Contract';
import { packingCursor, packingId, packingIdentity, type PackingIdentity, type PackingScope } from './packingContract';
import { throwPackingRpcRefusal } from './packingRpcErrors';

export type PackingCategoryAggregateRpc = (
  name: PackingCategoryAggregateRpcName,
  args: Record<string, unknown>
) => Promise<unknown>;
function invalid(): never {
  throw new FamilyApiError(
    502,
    'invalid_packing_category_aggregate_response',
    'The category result does not match its original observation.'
  );
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  if (!aggregateBounded(raw)) invalid();
  const p = schema.safeParse(raw);
  return p.success ? p.data : invalid();
}
function identity(scope: PackingScope, expected: PackingIdentity) {
  if (!equal(packingIdentity.parse(scope), expected)) invalid();
}
function modifiedCategory(
  before: PackingCategoryV2,
  after: PackingCategoryV2,
  changes: Partial<PackingCategoryV2>,
  changed: boolean
) {
  if (
    (changed && after.updated_at === before.updated_at) ||
    !equal(after, {
      ...before,
      ...changes,
      revision: before.revision + (changed ? 1 : 0),
      updated_at: changed ? after.updated_at : before.updated_at,
    })
  )
    invalid();
}
type BatchCommand = Exclude<PackingCategoryAggregateEnvelope['command'], { action: 'category-reorder' }>;
type BatchAcknowledgement = Exclude<PackingCategoryAggregateAck, { action: 'category-reorder' }>;
function checkBatchAcknowledgement(a: BatchAcknowledgement, c: BatchCommand) {
  const before = c.observed,
    deleted = c.action === 'category-trash-batch';
  if (
    !a.changed ||
    !aggregateOwner(a.category, c.scope) ||
    !aggregateMembers(a.items, a.category, deleted) ||
    !equal(
      a.items.map((row) => row.id),
      before.items.map((row) => row.id)
    ) ||
    a.batch.item_count !== a.items.length ||
    !equal(
      a.batch,
      deleted
        ? { actor_user_id: c.scope.user_id, operation_id: c.operation_id, item_count: before.items.length }
        : before.batch
    )
  )
    invalid();
  if (deleted && a.category.deleted_at === null) invalid();
  modifiedCategory(
    before.category,
    a.category,
    {
      deleted_at: deleted ? a.category.deleted_at : null,
      deleted_by_person_id: deleted ? c.scope.person_id : null,
    },
    true
  );
  a.items.forEach((row, i) => {
    const old = before.items[i];
    if (
      row.updated_at === old.updated_at ||
      !equal(row, {
        ...old,
        revision: old.revision + 1,
        updated_at: row.updated_at,
        deleted_at: deleted ? a.category.deleted_at : null,
        deleted_by_person_id: deleted ? c.scope.person_id : null,
      })
    )
      invalid();
  });
}
/** Historical proof of this exact original, never a current-state publication. */
export function checkPackingCategoryAggregateAcknowledgement(
  raw: unknown,
  original: PackingCategoryAggregateEnvelope
): PackingCategoryAggregateAck {
  const p = packingCategoryAggregateEnvelope.parse(original),
    c = p.command,
    a = parse(packingCategoryAggregateAck, raw);
  if (
    !equal(
      [a.kind, a.action, a.trip_id, a.operation_id, a.scope, a.target_id, a.values],
      [c.kind, c.action, c.scope.trip_id, c.operation_id, c.scope, c.target_id, c.values]
    )
  )
    invalid();
  if (c.action === 'category-reorder' && a.action === 'category-reorder') {
    const before = c.observed.categories,
      ids = c.values.ordered_ids,
      changed = !equal(
        ids,
        before.map((category) => category.id)
      );
    if (
      a.changed !== changed ||
      a.lane !== c.observed.lane ||
      !equal(
        a.categories.map((category) => category.id),
        ids
      )
    )
      invalid();
    a.categories.forEach((category, i) => {
      const old = before.find((b) => b.id === category.id);
      if (!old) invalid();
      const rank = changed ? i : old.sort_order;
      modifiedCategory(old, category, { sort_order: rank }, rank !== old.sort_order);
    });
  } else if (c.action !== 'category-reorder' && a.action === c.action) {
    checkBatchAcknowledgement(a, c);
  } else invalid();
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
function cursorFollows(a: z.infer<typeof packingCursor>, b: z.infer<typeof packingCursor>) {
  return (
    instant(a.deleted_at) < instant(b.deleted_at) || (instant(a.deleted_at) === instant(b.deleted_at) && a.id < b.id)
  );
}
function batchRowCursor(row: z.infer<typeof packingCategoryBatchesV3>['categories'][number], scope: PackingScope) {
  const c = row.category;
  if (!aggregateOwner(c, scope) || c.deleted_at === null || row.item_count !== (row.batch?.item_count ?? 0)) invalid();
  return { id: c.id, deleted_at: c.deleted_at };
}
async function readBatches(
  call: PackingCategoryAggregateRpc,
  expected: PackingIdentity,
  limit: number,
  before: z.infer<typeof packingCursor> | null
) {
  const e = packingIdentity.parse(expected),
    n = z.number().int().min(1).max(100).parse(limit),
    cursor = before === null ? null : packingCursor.parse(before);
  const p = parse(
    packingCategoryBatchesV3,
    await call('list_family_trip_packing_category_batches_v3', {
      p_trip_id: e.trip_id,
      p_limit: n,
      p_before_deleted_at: cursor?.deleted_at ?? null,
      p_before_id: cursor?.id ?? null,
    })
  );
  identity(p.scope, e);
  if (p.categories.length > n || new Set(p.categories.map((row) => row.category.id)).size !== p.categories.length)
    invalid();
  let previous = cursor;
  for (const row of p.categories) {
    const current = batchRowCursor(row, p.scope);
    if (previous && !cursorFollows(current, previous)) invalid();
    previous = current;
  }
  if (p.next_cursor && (p.categories.length !== n || !equal(p.next_cursor, previous))) invalid();
  return p;
}
export function createPackingCategoryAggregateTransport(
  rpc: PackingCategoryAggregateRpc = packingCategoryAggregateRpc
) {
  const call: PackingCategoryAggregateRpc = async (name, args) => {
    try {
      return await rpc(name, args);
    } catch (error) {
      throwPackingRpcRefusal(error, 'packing_category_aggregate_refused', 'The original category request was refused.');
    }
  };
  return {
    async lane(expected: PackingIdentity, visibility: 'common' | 'personal') {
      const e = packingIdentity.parse(expected),
        lane = z.enum(['common', 'personal']).parse(visibility);
      const p = parse(
        packingCategoryLaneV3,
        await call('get_family_trip_packing_category_lane_v3', { p_trip_id: e.trip_id, p_visibility: lane })
      );
      identity(p.scope, e);
      if (p.lane !== lane) invalid();
      return p;
    },
    async observation(expected: PackingIdentity, categoryId: string, includeDeleted = false) {
      const e = packingIdentity.parse(expected),
        id = packingId.parse(categoryId),
        deleted = z.boolean().parse(includeDeleted);
      const p = parse(
        packingCategoryObservationV3,
        await call('get_family_trip_packing_category_aggregate_v3', {
          p_trip_id: e.trip_id,
          p_category_id: id,
          p_include_deleted: deleted,
        })
      );
      identity(p.scope, e);
      if (p.category.id !== id || (p.category.deleted_at !== null) !== deleted) invalid();
      return p;
    },
    batches: (expected: PackingIdentity, limit = 50, before: z.infer<typeof packingCursor> | null = null) =>
      readBatches(call, expected, limit, before),
    async execute(original: PackingCategoryAggregateEnvelope) {
      const p = packingCategoryAggregateEnvelope.parse(original),
        c = p.command;
      const raw = await call('execute_family_trip_packing_category_aggregate_v3', {
        p_trip_id: c.scope.trip_id,
        p_operation_id: c.operation_id,
        p_scope: c.scope,
        p_action: c.action,
        p_target_id: c.target_id,
        p_expected_collection_revision: c.expected_collection_revision,
        p_observed: c.observed,
        p_values: c.values,
      });
      return checkPackingCategoryAggregateAcknowledgement(raw, p);
    },
    async receipt(original: PackingCategoryAggregateEnvelope) {
      const p = packingCategoryAggregateEnvelope.parse(original),
        c = p.command;
      const r = parse(
        packingCategoryAggregateReceipt,
        await call('get_family_trip_packing_category_aggregate_receipt_v3', {
          p_trip_id: c.scope.trip_id,
          p_operation_id: c.operation_id,
        })
      );
      identity(r.scope, packingIdentity.parse(c.scope));
      if (
        r.trip_id !== c.scope.trip_id ||
        r.operation_id !== c.operation_id ||
        r.scope.trip_lifecycle_revision < c.scope.trip_lifecycle_revision ||
        (r.status === 'unknown'
          ? r.result !== null || r.result_redacted
          : r.result_redacted
            ? r.result !== null
            : r.result === null)
      )
        invalid();
      if (r.result) checkPackingCategoryAggregateAcknowledgement(r.result, p);
      return r;
    },
  };
}
