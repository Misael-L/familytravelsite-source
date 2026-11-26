import { packingBagEnvelope } from '../../src/integrations/family/packingBagContract';
import { packingCategoryAggregateEnvelope } from '../../src/integrations/family/packingCategoryAggregateContract';
import { packingEnvelope } from '../../src/integrations/family/packingCommandContract';
import {
  packingRestoreDigest,
  packingRestoreEnvelope,
  packingRestoreRequest,
  type PackingRestoreEnvelope,
} from '../../src/integrations/family/packingTerminalContract';
import { canonicalPackingScope, packingFixtureId as id } from './familyPacking';
import { bagAck, bagRestore } from './familyPackingBags';
import { aggregateAck, aggregateRestore } from './familyPackingCategoryAggregate';
import { canonicalPackingAck } from './familyPackingCommands';
export function terminalOriginal(domain: 'item' | 'bag' | 'batch' = 'item'): PackingRestoreEnvelope {
  const p =
    domain === 'bag'
      ? bagRestore()
      : domain === 'batch'
        ? aggregateRestore()
        : packingEnvelope.parse({
            version: 1,
            source_url: 'https://fixture.supabase.invalid',
            view_layer: 'published',
            command: {
              version: 1,
              operation_id: id(100),
              scope: canonicalPackingScope(),
              action: 'restore',
              target_id: id(5),
              expected_revision: 3,
              expected_collection_revision: null,
              values: {},
            },
          });
  p.source_url = 'https://fixture.supabase.invalid';
  return packingRestoreEnvelope.parse(p);
}
export function terminalAck(p: PackingRestoreEnvelope) {
  const b = packingBagEnvelope.safeParse(p),
    a = packingCategoryAggregateEnvelope.safeParse(p);
  return b.success
    ? bagAck(b.data)
    : a.success
      ? aggregateAck(a.data)
      : canonicalPackingAck(packingEnvelope.parse(p).command);
}
export async function terminalProof(
  p: PackingRestoreEnvelope,
  status: 'unknown' | 'cancelled' | 'committed' = 'cancelled',
  redacted = false,
  current = p.command.scope
) {
  return {
    version: 1,
    kind: 'packing-restore-terminal',
    trip_id: p.command.scope.trip_id,
    operation_id: p.command.operation_id,
    protocol: packingRestoreRequest(p).protocol,
    action: p.command.action,
    target_id: p.command.target_id,
    scope: structuredClone(current),
    request_sha256: await packingRestoreDigest(p),
    status,
    cancelled_at: status === 'cancelled' ? '2026-11-12T16:00:00.123456+00:00' : null,
    result_redacted: status === 'committed' && redacted,
    result: status === 'committed' && !redacted ? terminalAck(p) : null,
  };
}
