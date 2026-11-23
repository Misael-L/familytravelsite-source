import { nativeStayRpc, type NativeStayRpc } from '@family/backend/supabase/nativeStayRpc';
import { z } from 'zod';
import { FamilyApiError } from './errors';
import {
  nativeStayAck,
  nativeStayContext,
  nativeStayInner,
  nativeStayOutcome,
  nativeStayTrash,
  originalNativeStayIntent,
  stayTrashCursor,
  strictStayJsonBytes,
  type NativeStayEnvelope,
} from './nativeStayContract';
import { stayId, stayJson, stayScope } from './stayContract';
import { parseStay, throwStayRpcRefusal } from './stayTransport';
type Scope = ReturnType<typeof stayScope.parse>;
function invalid(): never {
  throw new FamilyApiError(
    502,
    'native_stay_response',
    'The native stay response does not match the complete original operation.'
  );
}
function lossless<T>(schema: z.ZodType<T>, raw: unknown, bound: number): T {
  strictStayJsonBytes(raw);
  const p = parseStay(schema, raw, bound);
  if (stayJson(p) !== stayJson(raw)) invalid();
  return p;
}
export function checkNativeStayAck(raw: unknown, original: NativeStayEnvelope) {
  const c = originalNativeStayIntent(original).command,
    a = lossless(nativeStayAck, raw, 32768),
    action = 'format' in c.inner ? 'create' : c.inner.action;
  if (
    a.trip_id !== c.scope.trip_id ||
    a.stay_id !== c.stay_id ||
    a.operation_id !== c.operation_id ||
    a.action !== action ||
    a.trip_revision_after < c.observation.trip_revision
  )
    invalid();
  return a;
}
// PostgreSQL Trash keys have microsecond precision. Never collapse them to JS milliseconds.
function cursorKey(cursor: ReturnType<typeof stayTrashCursor.parse>) {
  const m = cursor.deleted_at.match(/^(.*:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/);
  if (!m) invalid();
  const base = Date.parse(m[1] + m[3]);
  if (!Number.isFinite(base)) invalid();
  return { time: BigInt(base) * 1000n + BigInt((m[2] ?? '').padEnd(6, '0')), id: cursor.id.toLowerCase() };
}
function after(a: ReturnType<typeof stayTrashCursor.parse>, b: ReturnType<typeof stayTrashCursor.parse>) {
  const x = cursorKey(a),
    y = cursorKey(b);
  return x.time > y.time || (x.time === y.time && x.id > y.id);
}
function guardedNativeRpc(rpc: NativeStayRpc): NativeStayRpc {
  return async (name, args) => {
    try {
      return await rpc(name, args);
    } catch (error) {
      throwStayRpcRefusal(error, 'native_stay_refused', 'The native stay operation was refused or unavailable.');
    }
  };
}
export function createNativeStayTransport(rpc: NativeStayRpc = nativeStayRpc) {
  const call = guardedNativeRpc(rpc);
  return {
    async context(
      source_url: string,
      inner: ReturnType<typeof nativeStayInner.parse>,
      arrival_visit_id: string,
      keep_stop = false
    ) {
      // Validate all old inner contracts and fixed IDs before any RPC; server fills only the new original observation.
      const i = nativeStayInner.parse(inner),
        location = 'format' in i ? i.stay.location_id : (i.changes.location_id ?? i.observation.stay?.stay.location_id),
        day = 'format' in i ? i.observation.arrival_day.id : (i.observation.stay?.arrival_day_id ?? i.stay_id);
      strictStayJsonBytes(inner);
      if (stayJson(i) !== stayJson(inner)) invalid();
      originalNativeStayIntent({
        version: 1,
        source_url,
        command: {
          format: 'family.native-stay.v1',
          operation_id: i.operation_id,
          scope: i.scope,
          stay_id: i.stay_id,
          inner: i,
          arrival_visit_id,
          keep_stop,
          observation: {
            trip_revision: i.observation.trip_revision,
            day_id: day,
            location_id: location,
            owned_visit: null,
            day_visits: [],
          },
        },
      });
      const r = lossless(
        nativeStayContext,
        await call('get_family_native_stay_context_v1', {
          p_inner: structuredClone(i),
          p_arrival_visit_id: arrival_visit_id,
          p_keep_stop: keep_stop,
        }),
        2101248
      );
      if (
        stayJson(r.command.inner) !== stayJson(i) ||
        r.command.arrival_visit_id !== arrival_visit_id ||
        r.command.keep_stop !== keep_stop
      )
        invalid();
      return originalNativeStayIntent({ version: 1, source_url, command: r.command });
    },
    async execute(original: NativeStayEnvelope) {
      const p = originalNativeStayIntent(original);
      return checkNativeStayAck(await call('execute_family_native_stay_v1', { p_command: p.command }), p);
    },
    async outcome(original: NativeStayEnvelope, expected: Scope, cancel = false) {
      const p = originalNativeStayIntent(original),
        now = stayScope.parse(expected),
        c = p.command;
      if (stayJson({ ...now, session_id: c.scope.session_id }) !== stayJson(c.scope)) invalid();
      const r = lossless(
        nativeStayOutcome,
        await call(cancel ? 'cancel_family_native_stay_v1' : 'get_family_native_stay_outcome_v1', { p_command: c }),
        32768
      );
      if (
        r.trip_id !== c.scope.trip_id ||
        r.stay_id !== c.stay_id ||
        r.operation_id !== c.operation_id ||
        r.original_session_id !== c.scope.session_id ||
        stayJson(r.current_scope) !== stayJson(now) ||
        (cancel && r.status === 'unknown')
      )
        invalid();
      if (r.acknowledgement) checkNativeStayAck(r.acknowledgement, p);
      return r;
    },
    async trash(trip: string, cursor: unknown = null, limit = 25) {
      const id = stayId.parse(trip),
        n = z.number().int().min(1).max(50).parse(limit),
        afterCursor = cursor === null ? null : stayTrashCursor.parse(cursor);
      if (afterCursor) {
        if (stayJson(afterCursor) !== stayJson(cursor) || strictStayJsonBytes(afterCursor) > 512) invalid();
        cursorKey(afterCursor);
      }
      const r = lossless(
        nativeStayTrash,
        await call('list_family_trashed_stays_v1', { p_trip_id: id, p_after: afterCursor, p_limit: n }),
        524288
      );
      if (
        r.trip_id !== id ||
        r.items.length > n ||
        new Set(r.items.map((v) => v.id)).size !== r.items.length ||
        r.has_more !== (r.next_cursor !== null) ||
        (r.has_more && r.items.length !== n)
      )
        invalid();
      let previous = afterCursor;
      for (const item of r.items) {
        const key = { id: item.id, deleted_at: item.deleted_at };
        cursorKey(key);
        if (item.departure_date < item.arrival_date || (previous && !after(key, previous))) invalid();
        previous = key;
      }
      if (r.next_cursor && stayJson(r.next_cursor) !== stayJson(previous)) invalid();
      return r;
    },
  };
}
