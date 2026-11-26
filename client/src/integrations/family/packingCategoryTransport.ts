import { packingCategoryRpc, type PackingCategoryRpcName } from '@family/backend/supabase/packingCategoryRpc';
import { FamilyApiError } from './errors';
import {
  packingCategoryAck,
  packingCategoryEnvelope,
  packingCategoryPacket,
  packingCategoryReceipt,
  type PackingCategoryAck,
  type PackingCategoryEnvelope,
  type PackingCategoryPacket,
} from './packingCategoryContract';
import { packingJson } from './packingCommandContract';
import { packingIdentity, type PackingIdentity } from './packingContract';
import { packingGroupBytes } from './packingGroupContract';
import { throwPackingCategoryOrGroupRefusal } from './packingRpcErrors';
import { checkPackingList } from './packingTransport';

export type PackingCategoryRpc = (name: PackingCategoryRpcName, args: Record<string, unknown>) => Promise<unknown>;
function invalid(): never {
  throw new FamilyApiError(
    502,
    'invalid_packing_category_response',
    'The category response does not match its original context.'
  );
}
function bounded(raw: unknown) {
  try {
    if (packingGroupBytes(raw) <= 8388608) return;
  } catch {
    /* Invalid JSON remains unresolved. */
  }
  invalid();
}
export function checkPackingCategoryPacket(raw: unknown, identity: PackingIdentity): PackingCategoryPacket {
  const expected = packingIdentity.parse(identity);
  bounded(raw);
  const result = packingCategoryPacket.safeParse(raw);
  if (!result.success) invalid();
  checkPackingList(result.data.packing, expected);
  return result.data;
}
export function checkPackingCategoryAcknowledgement(
  raw: unknown,
  original: PackingCategoryEnvelope
): PackingCategoryAck {
  const p = packingCategoryEnvelope.parse(original),
    c = p.command,
    before = c.observed_category;
  bounded(raw);
  const parsed = packingCategoryAck.safeParse(raw);
  if (!parsed.success) invalid();
  const a = parsed.data,
    after = a.category;
  if (
    a.trip_id !== c.scope.trip_id ||
    a.operation_id !== c.operation_id ||
    a.action !== c.action ||
    packingJson(a.scope) !== packingJson(c.scope) ||
    packingJson(a.values) !== packingJson(c.values) ||
    after.id !== before.id ||
    after.trip_id !== before.trip_id ||
    after.owner_person_id !== before.owner_person_id ||
    after.created_at !== before.created_at
  )
    invalid();
  const changed = categoryChanged(a, p);
  if (
    changed
      ? a.collection_revision <= c.expected_collection_revision
      : a.collection_revision !== c.expected_collection_revision
  )
    invalid();
  return a; // Commitment proof only; publish a fresh coupled read, never this historical acknowledgement.
}
export function createPackingCategoryTransport(rpc: PackingCategoryRpc = packingCategoryRpc) {
  const call: PackingCategoryRpc = async (name, args) => {
    try {
      return await rpc(name, args);
    } catch (error) {
      throwPackingCategoryOrGroupRefusal(error, 'category', 'The original category request was refused.');
    }
  };
  return {
    async list(expected: PackingIdentity) {
      expected = packingIdentity.parse(expected);
      return checkPackingCategoryPacket(
        await call('get_family_trip_packing_with_categories_v1', { p_trip_id: expected.trip_id }),
        expected
      );
    },
    async execute(original: PackingCategoryEnvelope) {
      const p = packingCategoryEnvelope.parse(original),
        c = p.command;
      return checkPackingCategoryAcknowledgement(
        await call('execute_family_trip_packing_category_v1', {
          p_trip_id: c.scope.trip_id,
          p_operation_id: c.operation_id,
          p_scope: c.scope,
          p_action: c.action,
          p_expected_collection_revision: c.expected_collection_revision,
          p_observed_category: c.observed_category,
          p_values: c.values,
        }),
        p
      );
    },
    async receipt(original: PackingCategoryEnvelope) {
      const p = packingCategoryEnvelope.parse(original),
        c = p.command;
      const raw = await call('get_family_trip_packing_category_receipt_v1', {
        p_trip_id: c.scope.trip_id,
        p_operation_id: c.operation_id,
      });
      bounded(raw);
      const parsed = packingCategoryReceipt.safeParse(raw);
      if (!parsed.success) invalid();
      const r = parsed.data,
        s = r.scope;
      if (
        r.trip_id !== c.scope.trip_id ||
        r.operation_id !== c.operation_id ||
        ['trip_id', 'family_id', 'user_id', 'person_id'].some((k) => s[k as 'trip_id'] !== c.scope[k as 'trip_id']) ||
        s.trip_lifecycle_revision < c.scope.trip_lifecycle_revision
      )
        invalid();
      if (r.status === 'unknown') {
        if (r.result !== null || r.result_redacted) invalid();
      } else if (r.result_redacted) {
        if (r.result !== null) invalid();
      } else {
        if (r.result === null) invalid();
        checkPackingCategoryAcknowledgement(r.result, p);
      }
      return r;
    },
  };
}

function categoryChanged(a: PackingCategoryAck, p: PackingCategoryEnvelope) {
  const c = p.command,
    before = c.observed_category,
    after = a.category;

  if (c.action === 'category-rename') {
    const changed = c.values.name !== before.name;
    if (
      after.name !== c.values.name ||
      after.revision !== before.revision + (changed ? 1 : 0) ||
      packingJson(after.assignments) !== packingJson(before.assignments) ||
      packingJson(a.changed_item_revisions) !==
        packingJson(changed ? p.original_items.map((r) => ({ item_id: r.id, revision: r.revision + 1 })) : [])
    )
      invalid();
    if (!changed && packingJson(after) !== packingJson(before)) invalid();
    return changed;
  }
  return assignmentsChanged(a, p);
}
function assignmentsChanged(a: PackingCategoryAck, p: PackingCategoryEnvelope) {
  const c = p.command,
    before = c.observed_category,
    after = a.category;
  if (c.action !== 'category-assignees') invalid();
  const desired = c.values.person_ids,
    old = new Map(before.assignments.map((x) => [x.person_id, x]));
  const changed = packingJson(desired) !== packingJson(before.assignments.map((x) => x.person_id));
  if (
    after.name !== before.name ||
    after.revision !== before.revision ||
    after.updated_at !== before.updated_at ||
    a.changed_item_revisions.length ||
    packingJson(after.assignments.map((x) => x.person_id)) !== packingJson(desired)
  )
    invalid();
  let additionTime: string | null = null;
  for (const link of after.assignments) {
    const prior = old.get(link.person_id);
    if (prior) {
      if (packingJson(link) !== packingJson(prior)) invalid();
    } else {
      if (link.assigned_at === null || link.assigned_by_person_id !== c.scope.person_id) invalid();
      additionTime ??= link.assigned_at;
      if (link.assigned_at !== additionTime) invalid();
    }
  }
  return changed;
}
