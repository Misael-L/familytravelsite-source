import { stayRpc, type StayRpc } from '@family/backend/supabase/stayRpc';
import { z } from 'zod';
import { FamilyApiError } from './errors';
import {
  stayAck,
  stayContext,
  stayEditor,
  stayEnvelope,
  stayHistory,
  stayId,
  stayIdentity,
  stayJson,
  stayOutcome,
  stayScope,
  staySnapshot,
  type StayEnvelope,
  type StayIdentity,
} from './stayContract';
export function invalidStay(): never {
  throw new FamilyApiError(502, 'stay_response_contract', 'The stay response does not match its original identity.');
}
export function parseStay<T>(schema: z.ZodType<T>, raw: unknown, bytes = 1048576): T {
  try {
    const json = JSON.stringify(raw);
    if (typeof json !== 'string' || new TextEncoder().encode(json).length > bytes) invalidStay();
    const p = schema.safeParse(raw);
    return p.success ? p.data : invalidStay();
  } catch (e) {
    if (e instanceof FamilyApiError) throw e;
    return invalidStay();
  }
}
export function originalStay(raw: unknown) {
  const p = parseStay(stayEnvelope, raw);
  return structuredClone(p);
}
function sameIdentity(value: StayIdentity, expected: StayIdentity) {
  if (stayJson(stayIdentity.parse(value)) !== stayJson(expected)) invalidStay();
}
export function checkStayAck(raw: unknown, original: StayEnvelope) {
  const c = originalStay(original).command,
    a = parseStay(stayAck, raw, 32768),
    old = c.observation.stay?.stay;
  if (
    a.trip_id !== c.scope.trip_id ||
    a.stay_id !== c.stay_id ||
    a.operation_id !== c.operation_id ||
    a.action !== (c.action === 'save' ? (old ? 'edit' : 'create') : c.action)
  )
    invalidStay();
  if (
    !old
      ? a.stay_revision_after !== 1 || !a.changed
      : a.changed
        ? a.stay_revision_after <= old.revision
        : a.stay_revision_after !== old.revision
  )
    invalidStay();
  if (
    a.changed
      ? a.trip_revision_after <= c.observation.trip_revision
      : a.trip_revision_after !== c.observation.trip_revision
  )
    invalidStay();
  return a; // Historical acknowledgement only; never a native row/cache payload.
}
const stayRpcStatuses = new Map<string, number>([
  ['42501', 403],
  ['PGRST301', 401],
  ['PGRST302', 401],
  ['PGRST303', 401],
  ['PT409', 409],
  ['40001', 409],
  ['22023', 400],
  ['23503', 422],
  ['23514', 422],
  ['54000', 413],
  ['0A000', 422],
  ['PGRST202', 503],
]);

export function throwStayRpcRefusal(error: unknown, refusalCode: string, message: string): never {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const status = stayRpcStatuses.get(code);
  if (status !== undefined) throw new FamilyApiError(status, refusalCode, message);
  throw error;
}

function stayCaller(rpc: StayRpc): StayRpc {
  return async (name, args) => {
    try {
      return await rpc(name, args);
    } catch (error) {
      throwStayRpcRefusal(error, 'stay_refused', 'The original stay operation was refused or unavailable.');
    }
  };
}
function boundProjection(p: z.infer<typeof stayEditor>['observation'], e: StayIdentity, id?: string) {
  if (p.stay.trip_id !== e.trip_id || p.stay.family_id !== e.family_id || (id && p.stay.id !== id)) invalidStay();
}
function args(p: StayEnvelope) {
  const c = p.command;
  return {
    p_trip_id: c.scope.trip_id,
    p_stay_id: c.stay_id,
    p_operation_id: c.operation_id,
    p_scope: c.scope,
    p_observation: c.observation,
  };
}
function stayReads(call: StayRpc) {
  return {
    async list(expected: StayIdentity) {
      const e = stayIdentity.parse(expected),
        p = parseStay(staySnapshot, await call('get_family_trip_stay_view_v1', { p_trip_id: e.trip_id }), 8388608);
      sameIdentity(p, e);
      const seen = new Set<string>();
      for (const row of p.stays) {
        boundProjection(row, e);
        if (
          row.stay.deleted_at ||
          seen.has(row.stay.id) ||
          row.location.deleted_at ||
          !['manual', 'hotel'].includes(row.location.source.kind)
        )
          invalidStay();
        seen.add(row.stay.id);
      }
      return p;
    },
    async editor(expected: StayIdentity, id: string) {
      const e = stayIdentity.parse(expected),
        s = stayId.parse(id),
        p = parseStay(
          stayEditor,
          await call('get_family_stay_editor_v1', { p_trip_id: e.trip_id, p_stay_id: s }),
          262144
        );
      sameIdentity(p, e);
      boundProjection(p.observation, e, s);
      if ((p.state === 'trash') !== (p.observation.stay.deleted_at !== null)) invalidStay();
      return p;
    },
    async context(
      expected: z.infer<typeof stayScope>,
      id: string,
      location: string | null = null,
      booking: string | null = null
    ) {
      const e = stayScope.parse(expected),
        s = stayId.parse(id),
        l = stayId.nullable().parse(location),
        b = stayId.nullable().parse(booking);
      const p = parseStay(
        stayContext,
        await call('get_family_stay_command_context_v1', {
          p_trip_id: e.trip_id,
          p_stay_id: s,
          p_location_id: l,
          p_reservation_id: b,
        }),
        524288
      );
      if (stayJson(p.scope) !== stayJson(e)) invalidStay();
      const o = p.observation;
      if (o.stay) boundProjection(o.stay, stayIdentity.parse(e), s);
      if (
        (p.state === 'absent') !== (o.stay === null) ||
        (o.stay && (p.state === 'trash') !== (o.stay.stay.deleted_at !== null)) ||
        (o.candidate_location &&
          (o.candidate_location.trip_id !== e.trip_id ||
            o.candidate_location.id !== (l ?? o.stay?.stay.location_id))) ||
        (o.candidate_booking?.record.id ?? null) !== b ||
        (o.candidate_booking && o.candidate_booking.record.trip_id !== e.trip_id)
      )
        invalidStay();
      return p;
    },
  };
}
function stayHistoryReader(call: StayRpc) {
  return {
    async history(expected: StayIdentity, id: string, before: number | null = null, limit = 50) {
      const e = stayIdentity.parse(expected),
        s = stayId.parse(id),
        n = z.number().int().min(1).max(100).parse(limit),
        cursor = z.number().int().positive().safe().nullable().parse(before);
      const p = parseStay(
        stayHistory,
        await call('get_family_stay_history_v1', {
          p_trip_id: e.trip_id,
          p_stay_id: s,
          p_before_sequence: cursor,
          p_limit: n,
        }),
        8388608
      );
      if (
        p.trip_id !== e.trip_id ||
        p.stay_id !== s ||
        p.events.length > n ||
        p.has_more !== (p.next_before_sequence !== null) ||
        (p.has_more && (p.events.length !== n || p.events[p.events.length - 1]?.sequence !== p.next_before_sequence))
      )
        invalidStay();
      let last = cursor ?? Infinity;
      const ops = new Set<string>();
      for (const event of p.events) {
        if (event.sequence >= last || ops.has(event.operation_id)) invalidStay();
        last = event.sequence;
        ops.add(event.operation_id);
        boundProjection(event.after, e, s);
        if (event.before) boundProjection(event.before, e, s);
      }
      return p;
    },
  };
}
function stayWriters(call: StayRpc) {
  return {
    async execute(original: StayEnvelope) {
      const p = originalStay(original),
        c = p.command,
        a = args(p);
      const raw =
        c.action === 'save'
          ? await call('save_family_stay_v1', { ...a, p_changes: c.changes })
          : c.action === 'link'
            ? await call('set_family_stay_booking_link_v1', { ...a, p_reservation_id: c.reservation_id })
            : await call(c.action === 'trash' ? 'trash_family_stay_v1' : 'restore_family_stay_v1', a);
      return checkStayAck(raw, p);
    },
    async outcome(original: StayEnvelope, current: z.infer<typeof stayScope>, cancel = false) {
      const p = originalStay(original),
        c = p.command,
        now = stayScope.parse(current),
        r = parseStay(
          stayOutcome,
          await call(cancel ? 'cancel_family_stay_command_v1' : 'get_family_stay_command_outcome_v1', {
            ...args(p),
            p_action: c.action,
            p_changes: c.changes,
            p_reservation_id: c.reservation_id,
          }),
          32768
        );
      sameIdentity(now, stayIdentity.parse(c.scope));
      if (
        r.trip_id !== c.scope.trip_id ||
        r.stay_id !== c.stay_id ||
        r.operation_id !== c.operation_id ||
        r.original_session_id !== c.scope.session_id ||
        stayJson(r.current_scope) !== stayJson(now) ||
        (cancel && r.status === 'unknown')
      )
        invalidStay();
      if (r.acknowledgement) checkStayAck(r.acknowledgement, p);
      return r;
    },
  };
}
export function createStayTransport(rpc: StayRpc = stayRpc) {
  const call = stayCaller(rpc);
  return { ...stayReads(call), ...stayHistoryReader(call), ...stayWriters(call) };
}
