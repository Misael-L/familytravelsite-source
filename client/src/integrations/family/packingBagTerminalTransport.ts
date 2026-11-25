import {
  packingBagCancellationRpc,
  type PackingBagCancellationRpcName,
} from '@family/backend/supabase/packingBagCancellationRpc';
import {
  packingBagTerminalDigest,
  packingBagTerminalProof,
  packingBagTerminalRequest,
  type PackingBagTerminalEnvelope,
} from './packingBagTerminalContract';
import { checkPackingBagAcknowledgement } from './packingBagTransport';
import { packingJson } from './packingCommandContract';
import { packingScope, type PackingScope } from './packingContract';
import { throwPackingRpcRefusal } from './packingRpcErrors';
import { packingPgJson, terminalInvalid } from './packingTerminalContract';
export type PackingBagTerminalRpc = (
  name: PackingBagCancellationRpcName,
  args: Record<string, unknown>
) => Promise<unknown>;
export function createPackingBagTerminalTransport(rpc: PackingBagTerminalRpc = packingBagCancellationRpc) {
  const call = async (
    method: PackingBagCancellationRpcName,
    original: PackingBagTerminalEnvelope,
    current: PackingScope
  ) => {
    const r = packingBagTerminalRequest(original),
      c = r.packet.command,
      expected = packingScope.parse(current);
    if (
      packingJson({ ...c.scope, trip_lifecycle_revision: expected.trip_lifecycle_revision }) !==
        packingJson(expected) ||
      expected.trip_lifecycle_revision < c.scope.trip_lifecycle_revision
    )
      terminalInvalid();
    const digest = await packingBagTerminalDigest(r.packet);
    let raw: unknown;
    try {
      raw = await rpc(method, { p_trip_id: c.scope.trip_id, p_operation_id: c.operation_id, p_original_args: r.args });
    } catch (error) {
      throwPackingRpcRefusal(
        error,
        'packing_bag_terminal_refused',
        'The saved bag change remains protected; its decision was refused.'
      );
    }
    if (new TextEncoder().encode(packingPgJson(raw)).length > 1048576) terminalInvalid();
    const p = packingBagTerminalProof.safeParse(raw);
    if (!p.success) return terminalInvalid();
    const proof = p.data;
    if (
      packingJson([
        proof.trip_id,
        proof.operation_id,
        proof.action,
        proof.target_id,
        proof.scope,
        proof.request_sha256,
      ]) !== packingJson([c.scope.trip_id, c.operation_id, c.action, c.target_id, expected, digest]) ||
      (method.startsWith('cancel_') && proof.status === 'unknown')
    )
      terminalInvalid();
    if (proof.status === 'committed' && !proof.result_redacted) checkPackingBagAcknowledgement(proof.result, r.packet);
    return proof;
  };
  return {
    lookup: (p: PackingBagTerminalEnvelope, s: PackingScope) =>
      call('get_family_trip_packing_bag_command_cancellation_v1', p, s),
    cancel: (p: PackingBagTerminalEnvelope, s: PackingScope) => call('cancel_family_trip_packing_bag_command_v1', p, s),
  };
}
