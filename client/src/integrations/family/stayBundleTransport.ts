import { stayBundleRpc, type StayBundleRpc, type StayBundleRpcArgs } from '@family/backend/supabase/stayBundleRpc';
import { FamilyApiError } from './errors';
import {
  originalStayBundle,
  stayBundleAck,
  stayBundleContext,
  stayBundleOutcome,
  type StayBundleEnvelope,
} from './stayBundleContract';
import { stayId, stayJson, stayScope } from './stayContract';
import { parseStay, throwStayRpcRefusal } from './stayTransport';

type Scope = ReturnType<typeof stayScope.parse>;
type Selection = Omit<StayBundleRpcArgs['get_family_stay_bundle_context_v1'], 'p_trip_id'>;
function invalid(): never {
  throw new FamilyApiError(502, 'stay_bundle_response', 'The atomic stay response does not match the original intent.');
}
export function checkStayBundleAck(raw: unknown, original: StayBundleEnvelope) {
  const c = originalStayBundle(original).command,
    a = parseStay(stayBundleAck, raw, 32768);
  if (
    a.trip_id !== c.scope.trip_id ||
    a.stay_id !== c.stay_id ||
    a.reservation_id !== c.reservation_id ||
    a.operation_id !== c.operation_id ||
    a.trip_revision_after <= c.observation.trip_revision
  )
    invalid();
  return a;
}
export function createStayBundleTransport(rpc: StayBundleRpc = stayBundleRpc) {
  const call: StayBundleRpc = async (name, args) => {
    try {
      return await rpc(name, args);
    } catch (error) {
      throwStayRpcRefusal(error, 'stay_bundle_refused', 'The atomic stay operation was refused or unavailable.');
    }
  };
  return {
    async context(expected: Scope, selection: Selection) {
      const scope = stayScope.parse(expected),
        chosen = Object.fromEntries(Object.entries(selection).map(([k, v]) => [k, stayId.parse(v)])) as Selection;
      if (
        Object.keys(chosen).sort().join() !==
          ['p_arrival_day_id', 'p_departure_day_id', 'p_location_id', 'p_reservation_id', 'p_stay_id'].sort().join() ||
        chosen.p_stay_id === chosen.p_reservation_id
      )
        invalid();
      const r = parseStay(
          stayBundleContext,
          await call('get_family_stay_bundle_context_v1', { p_trip_id: scope.trip_id, ...chosen }),
          524288
        ),
        o = r.observation;
      if (
        stayJson(r.scope) !== stayJson(scope) ||
        o.candidate_location.trip_id !== scope.trip_id ||
        o.candidate_location.id !== chosen.p_location_id ||
        o.arrival_day.id !== chosen.p_arrival_day_id ||
        o.departure_day.id !== chosen.p_departure_day_id ||
        !['hotel', 'manual'].includes(o.candidate_location.source.kind) ||
        o.candidate_location.deleted_at !== null ||
        o.candidate_location.source_archived
      )
        invalid();
      return structuredClone(r);
    },
    async execute(original: StayBundleEnvelope) {
      const p = originalStayBundle(original);
      return checkStayBundleAck(await call('create_family_stay_bundle_v1', { p_command: p.command }), p);
    },
    async outcome(original: StayBundleEnvelope, expected: Scope, cancel = false) {
      const p = originalStayBundle(original),
        now = stayScope.parse(expected),
        c = p.command;
      if (stayJson({ ...now, session_id: c.scope.session_id }) !== stayJson(c.scope)) invalid();
      const r = parseStay(
        stayBundleOutcome,
        await call(cancel ? 'cancel_family_stay_bundle_v1' : 'get_family_stay_bundle_outcome_v1', {
          p_command: p.command,
        }),
        32768
      );
      if (
        r.trip_id !== c.scope.trip_id ||
        r.stay_id !== c.stay_id ||
        r.reservation_id !== c.reservation_id ||
        r.operation_id !== c.operation_id ||
        r.original_session_id !== c.scope.session_id ||
        stayJson(r.current_scope) !== stayJson(now) ||
        (cancel && r.status === 'unknown')
      )
        invalid();
      if (r.acknowledgement) checkStayBundleAck(r.acknowledgement, p);
      return r;
    },
  };
}
