import { packingGroupRpc, type PackingGroupRpcName } from '@family/backend/supabase/packingGroupRpc';
import { FamilyApiError } from './errors';
import { packingJson } from './packingCommandContract';
import {
  packingGroupAck,
  packingGroupBytes,
  packingGroupEnvelope,
  packingGroupReceipt,
  type PackingGroupAck,
  type PackingGroupEnvelope,
} from './packingGroupContract';
import { throwPackingCategoryOrGroupRefusal } from './packingRpcErrors';

export type PackingGroupRpc = (name: PackingGroupRpcName, args: Record<string, unknown>) => Promise<unknown>;
function invalid(): never {
  throw new FamilyApiError(
    502,
    'invalid_packing_group_response',
    'The packing group response does not match its original intent.'
  );
}
function bounded(raw: unknown) {
  try {
    if (packingGroupBytes(raw) <= 8388608) return;
  } catch {
    /* Unreadable response stays unresolved. */
  }
  invalid();
}
export function checkPackingGroupAcknowledgement(raw: unknown, original: PackingGroupEnvelope): PackingGroupAck {
  const p = packingGroupEnvelope.parse(original),
    c = p.command;
  bounded(raw);
  const parsed = packingGroupAck.safeParse(raw);
  if (!parsed.success) invalid();
  const a = parsed.data;
  if (
    a.trip_id !== c.scope.trip_id ||
    a.operation_id !== c.operation_id ||
    a.action !== c.action ||
    packingJson(a.scope) !== packingJson(c.scope) ||
    packingJson(a.selector) !== packingJson(c.selector) ||
    packingJson(a.values) !== packingJson(c.values) ||
    a.items.length !== p.original_items.length
  )
    invalid();
  const changed: string[] = [];
  let trashAt: string | null = null;
  p.original_items.forEach((before, index) => {
    const after = a.items[index];
    const updates =
      c.action === 'group-packed-state'
        ? before.checked !== c.values.checked || before.packed_quantity !== null
        : c.action === 'group-trash' || before.checked;
    if (!updates) {
      if (packingJson(before) !== packingJson(after)) invalid();
      return;
    }
    changed.push(before.id);
    if (after.id !== before.id || after.revision <= before.revision) invalid();
    const expected = { ...before, revision: after.revision, updated_at: after.updated_at };
    if (c.action === 'group-packed-state') {
      expected.checked = c.values.checked;
      expected.packed_quantity = null;
    } else {
      if (after.deleted_at === null || after.deleted_by_person_id !== c.scope.person_id) invalid();
      trashAt ??= after.deleted_at;
      if (after.deleted_at !== trashAt) invalid();
      expected.deleted_at = after.deleted_at;
      expected.deleted_by_person_id = c.scope.person_id;
    }
    if (packingJson(expected) !== packingJson(after)) invalid();
  });
  if (
    packingJson(a.changed_ids) !== packingJson(changed) ||
    (changed.length
      ? a.collection_revision <= c.expected_collection_revision
      : a.collection_revision !== c.expected_collection_revision)
  )
    invalid();
  return a; // Historical proof only. Publication requires a fresh canonical read.
}
export function createPackingGroupTransport(rpc: PackingGroupRpc = packingGroupRpc) {
  const call: PackingGroupRpc = async (name, args) => {
    try {
      return await rpc(name, args);
    } catch (error) {
      throwPackingCategoryOrGroupRefusal(error, 'group', 'The original packing group command was refused.');
    }
  };
  return {
    async execute(original: PackingGroupEnvelope) {
      const p = packingGroupEnvelope.parse(original),
        c = p.command;
      const raw = await call('execute_family_trip_packing_group_v1', {
        p_trip_id: c.scope.trip_id,
        p_operation_id: c.operation_id,
        p_scope: c.scope,
        p_action: c.action,
        p_expected_collection_revision: c.expected_collection_revision,
        p_selector: c.selector,
        p_observed_items: c.observed_items,
        p_values: c.values,
      });
      return checkPackingGroupAcknowledgement(raw, p);
    },
    async receipt(original: PackingGroupEnvelope) {
      const p = packingGroupEnvelope.parse(original),
        c = p.command;
      const raw = await call('get_family_trip_packing_group_receipt_v1', {
        p_trip_id: c.scope.trip_id,
        p_operation_id: c.operation_id,
      });
      bounded(raw);
      const parsed = packingGroupReceipt.safeParse(raw);
      if (!parsed.success) invalid();
      const r = parsed.data,
        s = r.scope;
      if (
        r.trip_id !== c.scope.trip_id ||
        r.operation_id !== c.operation_id ||
        s.trip_id !== c.scope.trip_id ||
        s.family_id !== c.scope.family_id ||
        s.user_id !== c.scope.user_id ||
        s.person_id !== c.scope.person_id ||
        s.trip_lifecycle_revision < c.scope.trip_lifecycle_revision
      )
        invalid();
      if (r.status === 'unknown') {
        if (r.result !== null || r.result_redacted) invalid();
      } else if (r.result_redacted) {
        if (r.result !== null) invalid();
      } else {
        if (r.result === null) invalid();
        checkPackingGroupAcknowledgement(r.result, p);
      }
      return r;
    },
  };
}
