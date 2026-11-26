import { packingCommandRpc } from '@family/backend/supabase/packingCommandRpc';
import { FamilyApiError } from './errors';
import { packingCommand, packingJson, trimPackingName, type PackingCommand } from './packingCommandContract';
import { packingAck, type PackingAck, type PackingRow } from './packingContract';

export type PackingCommandRpc = (
  name: 'execute_family_trip_packing_v1',
  args: Record<string, unknown>
) => Promise<unknown>;
function invalid(): never {
  throw new FamilyApiError(
    502,
    'invalid_packing_acknowledgement',
    'The packing acknowledgement does not match its original command.'
  );
}
/** An acknowledgement is historical proof only. It must never replace a fresh canonical list. */
export function checkPackingAcknowledgement(raw: unknown, original: PackingCommand): PackingAck {
  const p = packingCommand.parse(original);
  const text = JSON.stringify(raw);
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > 8388608) invalid();
  const parsed = packingAck.safeParse(raw);
  if (!parsed.success) invalid();
  const a = parsed.data;
  if (
    a.operation_id !== p.operation_id ||
    a.trip_id !== p.scope.trip_id ||
    a.action !== p.action ||
    a.target_id !== p.target_id ||
    packingJson(a.scope) !== packingJson(p.scope)
  )
    invalid();
  if (p.action === 'reorder') {
    if (
      a.item !== null ||
      packingJson(a.ordered_ids) !== packingJson(p.values.ids) ||
      a.collection_revision < p.expected_collection_revision
    )
      invalid();
    return a; // A reorder to the same order is a genuine no-op.
  }
  const row = checkedRow(a, p);
  if (p.action === 'create' || p.action === 'update') matchValues(row, p);
  if (p.action === 'create') matchCreate(row, p);
  if (p.action === 'create' || p.action === 'packed-state') matchPackedState(row, p);
  if (p.action === 'trash' && row.deleted_by_person_id !== p.scope.person_id) invalid();
  return a;
}

function checkedRow(a: PackingAck, p: Exclude<PackingCommand, { action: 'reorder' }>): PackingRow {
  const row = a.item;
  if (
    !row ||
    row.id !== p.target_id ||
    row.trip_id !== p.scope.trip_id ||
    a.ordered_ids !== null ||
    (row.deleted_at !== null) !== (p.action === 'trash')
  )
    invalid();
  // Revisions are opaque. Related-row triggers can legitimately advance them more than once.
  if (p.action === 'create' ? row.revision !== 1 : row.revision <= p.expected_revision) invalid();
  return row;
}
function matchValues(row: PackingRow, p: Extract<PackingCommand, { action: 'create' | 'update' }>) {
  for (const [key, value] of Object.entries(p.values)) {
    if (key === 'visibility' || key === 'checked' || key === 'packed_quantity') continue;
    if (row[key as keyof PackingRow] !== (key === 'name' ? trimPackingName(value as string) : value)) invalid();
  }
}
function matchCreate(row: PackingRow, p: Extract<PackingCommand, { action: 'create' }>) {
  const v = p.values,
    personal = v.visibility === 'personal';
  if (
    row.category !== (v.category ?? '') ||
    row.quantity !== (v.quantity ?? 1) ||
    row.weight_grams !== (v.weight_grams ?? null) ||
    row.bag_id !== (v.bag_id ?? null) ||
    row.is_private !== personal ||
    row.owner_person_id !== (personal ? p.scope.person_id : null) ||
    row.recipient_person_ids.length ||
    row.contributor_person_ids.length
  )
    invalid();
}
function matchPackedState(row: PackingRow, p: Extract<PackingCommand, { action: 'create' | 'packed-state' }>) {
  const v = p.values;
  const n = 'packed_quantity' in v ? (v.packed_quantity ?? 0) : null;
  const checked = n === null ? ('checked' in v ? v.checked : false) : n === row.quantity;
  if (
    (n !== null && n > row.quantity) ||
    row.checked !== checked ||
    row.packed_quantity !== (n !== null && n > 0 && n < row.quantity ? n : null)
  )
    invalid();
}

export function createPackingCommandTransport(rpc: PackingCommandRpc = packingCommandRpc) {
  return {
    async execute(original: PackingCommand) {
      // Parse before awaiting: caller mutations cannot change an in-flight command or its matcher.
      const p = packingCommand.parse(original);
      if (new TextEncoder().encode(JSON.stringify(p.values)).byteLength > (p.action === 'reorder' ? 98304 : 65536))
        throw new FamilyApiError(400, 'packing_values_bound', 'Packing values exceed their bound.');
      let raw: unknown;
      try {
        raw = await rpc('execute_family_trip_packing_v1', {
          p_trip_id: p.scope.trip_id,
          p_operation_id: p.operation_id,
          p_scope: p.scope,
          p_action: p.action,
          p_target_id: p.target_id,
          p_expected_revision: p.expected_revision,
          p_expected_collection_revision: p.expected_collection_revision,
          p_values: p.values,
        });
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        if (code === '42501')
          throw new FamilyApiError(403, 'packing_access_denied', 'Packing editing is not authorized.');
        if (['PGRST301', 'PGRST302', 'PGRST303'].includes(code))
          throw new FamilyApiError(401, 'packing_session_required', 'Sign in again before saving packing.');
        if (['PT409', '40001'].includes(code))
          throw new FamilyApiError(409, 'packing_conflict', 'The original packing observation changed.');
        if (code === '22023')
          throw new FamilyApiError(400, 'packing_request_invalid', 'The packing request is invalid.');
        if (['23503', '23514'].includes(code))
          throw new FamilyApiError(
            422,
            'packing_relationship_changed',
            'Packing details no longer satisfy the Trip requirements.'
          );
        if (code === '54000')
          throw new FamilyApiError(413, 'packing_service_bound', 'The packing service limit was reached.');
        throw error;
      }
      return checkPackingAcknowledgement(raw, p);
    },
  };
}
