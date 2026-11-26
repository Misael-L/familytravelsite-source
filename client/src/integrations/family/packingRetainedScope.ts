import type { PackingList, PackingScope } from './packingContract';
import type { RetainedPackingEnvelope } from './packingIntentQueue';
export function retainedPackingScopeMismatch(
  p: Pick<RetainedPackingEnvelope, 'source_url' | 'view_layer'>,
  scope: PackingScope,
  c: { source: string; layer: string; packet: Pick<PackingList, 'scope'> }
) {
  return (
    p.source_url !== c.source ||
    p.view_layer !== c.layer ||
    scope.trip_id !== c.packet.scope.trip_id ||
    scope.user_id !== c.packet.scope.user_id ||
    scope.person_id !== c.packet.scope.person_id ||
    scope.family_id !== c.packet.scope.family_id
  );
}
