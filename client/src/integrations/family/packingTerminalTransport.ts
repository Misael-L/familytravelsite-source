import { packingRestoreRpc, type PackingRestoreRpcName } from '@family/backend/supabase/packingRestoreRpc';
import { packingBagEnvelope } from './packingBagContract';
import { checkPackingBagAcknowledgement } from './packingBagTransport';
import { packingCategoryAggregateEnvelope } from './packingCategoryAggregateContract';
import { checkPackingCategoryAggregateAcknowledgement } from './packingCategoryAggregateTransport';
import { packingEnvelope, packingJson } from './packingCommandContract';
import { checkPackingAcknowledgement } from './packingCommandTransport';
import { packingScope, type PackingScope } from './packingContract';
import { throwPackingRpcRefusal } from './packingRpcErrors';
import {
  packingPgJson,
  packingRestoreDigest,
  packingRestoreRequest,
  packingTerminalProof,
  terminalInvalid,
  type PackingRestoreEnvelope,
} from './packingTerminalContract';
export type PackingTerminalRpc = (name: PackingRestoreRpcName, args: Record<string, unknown>) => Promise<unknown>;
export function createPackingTerminalTransport(rpc: PackingTerminalRpc = packingRestoreRpc) {
  const call = async (method: PackingRestoreRpcName, original: PackingRestoreEnvelope, current: PackingScope) => {
    const r = packingRestoreRequest(original),
      c = r.packet.command,
      expected = packingScope.parse(current);
    if (
      packingJson({ ...c.scope, trip_lifecycle_revision: expected.trip_lifecycle_revision }) !==
        packingJson(expected) ||
      expected.trip_lifecycle_revision < c.scope.trip_lifecycle_revision
    )
      terminalInvalid();
    const digest = await packingRestoreDigest(r.packet);
    let raw: unknown;
    try {
      raw = await rpc(method, {
        p_trip_id: c.scope.trip_id,
        p_operation_id: c.operation_id,
        p_protocol: r.protocol,
        p_original_args: r.args,
      });
    } catch (error) {
      throwPackingRpcRefusal(
        error,
        'packing_terminal_refused',
        'The original restore remains retained; its terminal decision was refused.'
      );
    }
    if (new TextEncoder().encode(packingPgJson(raw)).length > 8388608) terminalInvalid();
    const parsed = packingTerminalProof.safeParse(raw);
    if (!parsed.success) return terminalInvalid();
    const p = parsed.data;
    if (
      packingJson([p.trip_id, p.operation_id, p.protocol, p.action, p.target_id, p.scope, p.request_sha256]) !==
        packingJson([c.scope.trip_id, c.operation_id, r.protocol, c.action, c.target_id, expected, digest]) ||
      (method === 'cancel_family_trip_packing_restore_v1' && p.status === 'unknown')
    )
      terminalInvalid();
    if (p.status === 'committed' && !p.result_redacted) {
      const b = packingBagEnvelope.safeParse(r.packet),
        a = packingCategoryAggregateEnvelope.safeParse(r.packet);
      if (b.success) checkPackingBagAcknowledgement(p.result, b.data);
      else if (a.success) checkPackingCategoryAggregateAcknowledgement(p.result, a.data);
      else checkPackingAcknowledgement(p.result, packingEnvelope.parse(r.packet).command);
    }
    return p;
  };
  return {
    lookup: (original: PackingRestoreEnvelope, current: PackingScope) =>
      call('get_family_trip_packing_restore_cancellation_v1', original, current),
    cancel: (original: PackingRestoreEnvelope, current: PackingScope) =>
      call('cancel_family_trip_packing_restore_v1', original, current),
  };
}
