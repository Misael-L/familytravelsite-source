import { packingReadRpc, type PackingReadRpcName } from '@family/backend/supabase/packingReadRpc';
import type { ZodType } from 'zod';
import { FamilyApiError } from './errors';
import {
  packingCursor,
  packingId,
  packingIdentity,
  packingList,
  packingReceipt,
  packingTrashPage,
  type PackingAck,
  type PackingCursor,
  type PackingIdentity,
  type PackingList,
  type PackingRow,
  type PackingScope,
  type PackingTrashPage,
} from './packingContract';

export type PackingRpc = (name: PackingReadRpcName, args: Record<string, unknown>) => Promise<unknown>;
function invalid(message = 'The packing service returned an invalid snapshot.'): never {
  throw new FamilyApiError(502, 'invalid_packing_response', message);
}
function parse<T>(schema: ZodType<T>, raw: unknown): T {
  let text: string;
  try {
    text = JSON.stringify(raw);
  } catch {
    invalid();
  }
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > 8388608) invalid();
  const result = schema.safeParse(raw);
  return result.success ? result.data : invalid();
}
function identity(scope: PackingScope, expected: PackingIdentity) {
  if (
    scope.trip_id !== expected.trip_id ||
    scope.family_id !== expected.family_id ||
    scope.user_id !== expected.user_id ||
    scope.person_id !== expected.person_id
  )
    invalid('The packing snapshot belongs to another context.');
}
function rows(items: PackingRow[], trip: string, trash: boolean) {
  if (
    new Set(items.map((r) => r.id)).size !== items.length ||
    items.some((r) => r.trip_id !== trip || (r.deleted_at !== null) !== trash)
  )
    invalid();
}
function ordered<T extends { sort_order: number; id: string }>(items: T[]) {
  if (
    items.some(
      (r, i) =>
        i > 0 &&
        (r.sort_order < items[i - 1].sort_order ||
          (r.sort_order === items[i - 1].sort_order && r.id <= items[i - 1].id))
    )
  )
    invalid();
}
// Preserve PostgreSQL microseconds, including timezone-equivalent cursor timestamps.
function instant(s: string) {
  const fraction = s.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? '';
  return BigInt(Date.parse(s)) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3, 6));
}
function after(a: PackingCursor, b: PackingCursor) {
  return (
    instant(a.deleted_at) < instant(b.deleted_at) || (instant(a.deleted_at) === instant(b.deleted_at) && a.id > b.id)
  );
}
function ack(a: PackingAck, expected: PackingIdentity, operation: string, lifecycle: number) {
  identity(a.scope, expected);
  if (a.trip_id !== expected.trip_id || a.operation_id !== operation || a.scope.trip_lifecycle_revision > lifecycle)
    invalid();
  if (a.action === 'reorder') {
    if (
      a.target_id !== null ||
      a.item !== null ||
      a.ordered_ids === null ||
      new Set(a.ordered_ids).size !== a.ordered_ids.length
    )
      invalid();
  } else if (
    a.target_id === null ||
    a.ordered_ids !== null ||
    !a.item ||
    a.item.id !== a.target_id ||
    a.item.trip_id !== a.trip_id ||
    (a.item.deleted_at !== null) !== (a.action === 'trash')
  )
    invalid();
}
function validateTrashPage(result: PackingTrashPage, cursor: PackingCursor | null, limit: number) {
  const cursors = result.items.map((r) => ({ id: r.id, deleted_at: r.deleted_at ?? invalid() }));
  if (
    cursors.length > limit ||
    (cursor && cursors.length && !after(cursors[0], cursor)) ||
    cursors.some((c, i) => i > 0 && !after(c, cursors[i - 1]))
  )
    invalid();
  const next = result.next_cursor,
    last = cursors[cursors.length - 1];
  if (next && (!last || cursors.length !== limit || next.id !== last.id || next.deleted_at !== last.deleted_at))
    invalid();
}
/** Pure reads/reconciliation. No mutations, identity allocation, cache publication or retry/rebase. */
export function createPackingTransport(rpc: PackingRpc = packingReadRpc) {
  const call: PackingRpc = async (name, args) => {
    try {
      return await rpc(name, args);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === '42501') throw new FamilyApiError(403, 'packing_access_denied', 'Packing access is not authorized.');
      if (['PGRST301', 'PGRST302', 'PGRST303'].includes(code))
        throw new FamilyApiError(401, 'packing_session_required', 'Sign in again before reading packing.');
      if (['PT409', '40001'].includes(code))
        throw new FamilyApiError(409, 'packing_conflict', 'The original packing observation changed.');
      if (code === '22023') throw new FamilyApiError(400, 'packing_request_invalid', 'The packing request is invalid.');
      if (code === '54000')
        throw new FamilyApiError(413, 'packing_service_bound', 'The packing service limit was reached.');
      throw error;
    }
  };
  return {
    async list(expected: PackingIdentity) {
      return checkPackingList(await call('get_family_trip_packing_v1', { p_trip_id: expected.trip_id }), expected);
    },
    async trash(expected: PackingIdentity, limit = 50, before: PackingCursor | null = null) {
      expected = packingIdentity.parse(expected);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new FamilyApiError(400, 'packing_cursor', 'A bounded packing Trash page is required.');
      const cursor = before === null ? null : packingCursor.parse(before);
      const result = parse(
        packingTrashPage,
        await call('list_family_trip_packing_trash_v1', {
          p_trip_id: expected.trip_id,
          p_limit: limit,
          p_before: cursor?.deleted_at ?? null,
          p_before_id: cursor?.id ?? null,
        })
      );
      identity(result.scope, expected);
      rows(result.items, expected.trip_id, true);
      validateTrashPage(result, cursor, limit);
      return result;
    },
    async receipt(expected: PackingIdentity, operation: string) {
      expected = packingIdentity.parse(expected);
      packingId.parse(operation);
      const result = parse(
        packingReceipt,
        await call('get_family_trip_packing_receipt_v1', { p_trip_id: expected.trip_id, p_operation_id: operation })
      );
      identity(result.scope, expected);
      if (result.trip_id !== expected.trip_id || result.operation_id !== operation) invalid();
      if (result.status === 'unknown') {
        if (result.result_redacted || result.result !== null) invalid();
      } else if (result.result_redacted) {
        if (result.result !== null) invalid();
      } else {
        if (!result.result) invalid();
        ack(result.result, expected, operation, result.scope.trip_lifecycle_revision);
      }
      return result; // Redacted committed is proof; unknown is unresolved. Neither submits a replacement command.
    },
  };
}

/** Strict canonical v1 validation, also used by the single coupled category response. */
export function checkPackingList(raw: unknown, expected: PackingIdentity): PackingList {
  expected = packingIdentity.parse(expected);
  const result = parse(packingList, raw);
  identity(result.scope, expected);
  rows(result.items, expected.trip_id, false);
  ordered(result.items);
  ordered(result.bags);
  if (
    new Set(result.bags.map((b) => b.id)).size !== result.bags.length ||
    result.bags.some((b) => b.trip_id !== expected.trip_id)
  )
    invalid();
  const totals = new Map(result.bags.map((b) => [b.id, 0]));
  let unassigned = 0;
  for (const item of result.items) {
    const grams = (item.weight_grams ?? 0) * item.quantity;
    if (item.bag_id === null) unassigned += grams;
    else {
      const total = totals.get(item.bag_id);
      if (total === undefined) invalid();
      totals.set(item.bag_id, total + grams);
    }
  }
  if (
    unassigned > result.unassigned_weight_grams ||
    result.bags.some((b) => (totals.get(b.id) ?? 0) > b.total_weight_grams)
  )
    invalid();
  return result;
}
