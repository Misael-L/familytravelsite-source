import { packingBagRpc, type PackingBagRpcName } from '@family/backend/supabase/packingBagRpc';
import { z } from 'zod';
import { FamilyApiError } from './errors';
import {
  bagBounded,
  equalBagFacts as equal,
  packingBagAck,
  packingBagEnvelope,
  packingBagObservation,
  packingBagReceipt,
  packingBagSnapshot,
  packingBagTrash,
  type PackingBagAck,
  type PackingBagEnvelope,
} from './packingBagContract';
import { packingCursor, packingId, packingIdentity, type PackingIdentity, type PackingScope } from './packingContract';
import { throwPackingRpcRefusal } from './packingRpcErrors';
export type PackingBagRpc = (name: PackingBagRpcName, args: Record<string, unknown>) => Promise<unknown>;
function invalid(): never {
  throw new FamilyApiError(
    502,
    'invalid_packing_bag_response',
    'The bag result does not match its original observation.'
  );
}
function parse<T>(schema: z.ZodType<T>, raw: unknown, bytes = 1048576): T {
  if (!bagBounded(raw, bytes)) invalid();
  const p = schema.safeParse(raw);
  return p.success ? p.data : invalid();
}
function identity(s: PackingScope, e: PackingIdentity) {
  if (!equal(packingIdentity.parse(s), e)) invalid();
}
function validateCreatedBagAcknowledgement(
  a: PackingBagAck,
  c: Extract<PackingBagEnvelope['command'], { action: 'bag-create' }>
) {
  if (
    a.bag.name !== c.values.name ||
    a.bag.color !== (c.values.color ?? null) ||
    a.bag.weight_limit_grams !== (c.values.weight_limit_grams ?? null) ||
    a.bag.revision !== 1 ||
    a.bag.deleted_at !== null ||
    a.member_person_ids.length !== 0
  )
    invalid();
}

/** Exact historical proof; never publish an acknowledgement as current bag state. */
export function checkPackingBagAcknowledgement(raw: unknown, original: PackingBagEnvelope): PackingBagAck {
  const p = packingBagEnvelope.parse(original),
    c = p.command,
    a = parse(packingBagAck, raw),
    before = c.observed;
  if (
    !equal(
      [a.action, a.operation_id, a.trip_id, a.target_id, a.scope, a.values],
      [c.action, c.operation_id, c.scope.trip_id, c.target_id, c.scope, c.values]
    )
  )
    invalid();
  let changed = true;
  if (c.action === 'bag-create') {
    validateCreatedBagAcknowledgement(a, c);
  } else {
    if (!before) invalid();
    const old = before.bag;
    let expected = { ...old };
    let members = before.member_person_ids;
    if (c.action === 'bag-update') {
      expected = { ...old, ...c.values };
      changed = !equal(expected, old);
    }
    if (c.action === 'bag-members') {
      members = c.values.person_ids;
      changed = !equal(members, before.member_person_ids);
    }
    if (c.action === 'bag-trash-empty')
      expected = { ...old, deleted_at: a.bag.deleted_at, deleted_by_person_id: c.scope.person_id };
    if (c.action === 'bag-restore') expected = { ...old, deleted_at: null, deleted_by_person_id: null };
    if (c.action === 'bag-trash-empty' && a.bag.deleted_at === null) invalid();
    if (
      (changed ? a.bag.revision <= old.revision : a.bag.revision !== old.revision) ||
      !equal(a.member_person_ids, members) ||
      !equal(a.bag, { ...expected, revision: a.bag.revision, updated_at: changed ? a.bag.updated_at : old.updated_at })
    )
      invalid();
  }
  if (
    a.changed !== changed ||
    (changed
      ? a.collection_revision <= c.expected_collection_revision
      : a.collection_revision !== c.expected_collection_revision)
  )
    invalid();
  // The private database receipt includes history not sent to the browser. Refuse
  // impossible successes whose known history already exceeds its complete bound.
  const after = {
    version: 1,
    kind: 'packing-bag-observation',
    scope: a.scope,
    collection_revision: a.collection_revision,
    bag: a.bag,
    member_person_ids: a.member_person_ids,
  };
  if (!bagBounded({ before_state: { bag: before }, after_state: { bag: after }, result: a })) invalid();
  return a;
}
function micros(s: string) {
  const f = s.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? '';
  return BigInt(Date.parse(s)) * 1000n + BigInt(f.padEnd(6, '0').slice(3, 6));
}
function follows(a: z.infer<typeof packingCursor>, b: z.infer<typeof packingCursor>) {
  return micros(a.deleted_at) < micros(b.deleted_at) || (micros(a.deleted_at) === micros(b.deleted_at) && a.id < b.id);
}
export function createPackingBagTransport(rpc: PackingBagRpc = packingBagRpc) {
  const call: PackingBagRpc = async (name, args) => {
    try {
      return await rpc(name, args);
    } catch (error) {
      throwPackingRpcRefusal(error, 'packing_bag_refused', 'The original bag request was refused.');
    }
  };
  return {
    async list(expected: PackingIdentity) {
      const e = packingIdentity.parse(expected),
        p = parse(packingBagSnapshot, await call('get_family_trip_packing_bags_v1', { p_trip_id: e.trip_id }), 8388608);
      identity(p.scope, e);
      return p;
    },
    async observation(expected: PackingIdentity, bagId: string, includeDeleted = false) {
      const e = packingIdentity.parse(expected),
        id = packingId.parse(bagId),
        deleted = z.boolean().parse(includeDeleted);
      const p = parse(
        packingBagObservation,
        await call('get_family_trip_packing_bag_v1', { p_trip_id: e.trip_id, p_bag_id: id, p_include_deleted: deleted })
      );
      identity(p.scope, e);
      if (p.bag.id !== id || (!deleted && p.bag.deleted_at !== null)) invalid();
      return p;
    },
    async trash(expected: PackingIdentity, limit = 50, before: z.infer<typeof packingCursor> | null = null) {
      const e = packingIdentity.parse(expected),
        n = z.number().int().min(1).max(100).parse(limit),
        cursor = before === null ? null : packingCursor.parse(before);
      const p = parse(
        packingBagTrash,
        await call('list_family_trip_packing_bag_trash_v1', {
          p_trip_id: e.trip_id,
          p_limit: n,
          p_before_deleted_at: cursor?.deleted_at ?? null,
          p_before_id: cursor?.id ?? null,
        }),
        8388608
      );
      identity(p.scope, e);
      if (p.bags.length > n) invalid();
      let last = cursor;
      for (const o of p.bags) {
        if (o.bag.deleted_at === null) invalid();
        const next = { id: o.bag.id, deleted_at: o.bag.deleted_at };
        if (last && !follows(next, last)) invalid();
        last = next;
      }
      if (p.next_cursor && (p.bags.length !== n || !equal(p.next_cursor, last))) invalid();
      return p;
    },
    async execute(original: PackingBagEnvelope) {
      const p = packingBagEnvelope.parse(original),
        c = p.command;
      const raw = await call('execute_family_trip_packing_bag_v1', {
        p_trip_id: c.scope.trip_id,
        p_operation_id: c.operation_id,
        p_scope: c.scope,
        p_action: c.action,
        p_target_id: c.target_id,
        p_expected_revision: c.expected_revision,
        p_expected_collection_revision: c.expected_collection_revision,
        p_observed: c.observed,
        p_values: c.values,
      });
      return checkPackingBagAcknowledgement(raw, p);
    },
    async receipt(original: PackingBagEnvelope) {
      const p = packingBagEnvelope.parse(original),
        c = p.command;
      const r = parse(
        packingBagReceipt,
        await call('get_family_trip_packing_bag_receipt_v1', {
          p_trip_id: c.scope.trip_id,
          p_operation_id: c.operation_id,
        })
      );
      identity(r.scope, packingIdentity.parse(c.scope));
      if (
        r.trip_id !== c.scope.trip_id ||
        r.operation_id !== c.operation_id ||
        r.scope.trip_lifecycle_revision < c.scope.trip_lifecycle_revision
      )
        invalid();
      if (r.result) {
        if (!equal(r.scope, c.scope)) invalid();
        checkPackingBagAcknowledgement(r.result, p);
      }
      return r;
    },
  };
}
