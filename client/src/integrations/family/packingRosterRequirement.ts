import type { PackingList } from './packingContract';
export function packingNeedsRoster(packet: PackingList) {
  return (
    packet.items.some((r) => r.owner_person_id || r.recipient_person_ids.length || r.contributor_person_ids.length) ||
    packet.bags.some((b) => b.member_person_ids.length) ||
    Object.values(packet.category_assignees).some((ids) => ids.length)
  );
}
