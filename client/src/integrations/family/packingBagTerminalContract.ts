import { z } from 'zod';
import { packingBagEnvelope } from './packingBagContract';
import { createPackingTerminalProof, packingPgJson, terminalInvalid } from './packingTerminalContract';
export const packingBagTerminalEnvelope = packingBagEnvelope.refine(
  (p) => p.view_layer === 'published' && p.command.action !== 'bag-restore'
);
export type PackingBagTerminalEnvelope = z.infer<typeof packingBagTerminalEnvelope>;
export const packingBagTerminalProof = createPackingTerminalProof(
  'packing-bag-command-terminal',
  z.literal('packing-bag-v1'),
  z.enum(['bag-create', 'bag-update', 'bag-members', 'bag-trash-empty'])
);
export function packingBagTerminalRequest(original: unknown) {
  const packet = packingBagTerminalEnvelope.parse(original),
    c = packet.command;
  const args = {
    p_trip_id: c.scope.trip_id,
    p_operation_id: c.operation_id,
    p_scope: c.scope,
    p_action: c.action,
    p_target_id: c.target_id,
    p_expected_revision: c.expected_revision,
    p_expected_collection_revision: c.expected_collection_revision,
    p_observed: c.observed,
    p_values: c.values,
  };
  if (new TextEncoder().encode(packingPgJson(args)).length > 1048576) terminalInvalid();
  return {
    packet,
    args,
    intent: [
      'packing-bag-v1',
      c.scope,
      c.action,
      c.target_id,
      c.expected_revision,
      c.expected_collection_revision,
      c.observed,
      c.values,
    ],
  };
}
export async function packingBagTerminalDigest(original: unknown) {
  const { intent } = packingBagTerminalRequest(original);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(packingPgJson(intent)))),
    (b) => b.toString(16).padStart(2, '0')
  ).join('');
}
