import {
  packingBagTerminalDigest,
  packingBagTerminalEnvelope,
  type PackingBagTerminalEnvelope,
} from '../../src/integrations/family/packingBagTerminalContract';
import { bagAck, bagOriginal } from './familyPackingBags';
export const bagActions = ['bag-create', 'bag-update', 'bag-members', 'bag-trash-empty'] as const;
export function bagTerminalOriginal(action: (typeof bagActions)[number] = 'bag-update') {
  const p = bagOriginal(action);
  p.source_url = 'http://127.0.0.1:56041';
  return packingBagTerminalEnvelope.parse(p);
}
export async function bagTerminalProof(
  p: PackingBagTerminalEnvelope,
  status: 'unknown' | 'cancelled' | 'committed' = 'cancelled',
  redacted = false,
  current = p.command.scope
) {
  return {
    version: 1,
    kind: 'packing-bag-command-terminal',
    trip_id: p.command.scope.trip_id,
    operation_id: p.command.operation_id,
    protocol: 'packing-bag-v1',
    action: p.command.action,
    target_id: p.command.target_id,
    scope: structuredClone(current),
    request_sha256: await packingBagTerminalDigest(p),
    status,
    cancelled_at: status === 'cancelled' ? '2026-11-12T17:00:00.123456+00:00' : null,
    result_redacted: status === 'committed' && redacted,
    result: status === 'committed' && !redacted ? bagAck(p) : null,
  };
}
