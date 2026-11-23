import type { PackingCategoryPresentation } from '../../repo/packingCategoryPresentation';
import type { PackingCategoryPacket } from './packingCategoryContract';
import { observePackingCategory } from './packingCategoryContract';
import { categoryV1Facts, packingCategoryKey, type PackingCategorySnapshotV2 } from './packingCategoryV2Contract';
export type PackingCategoryReadPacket = PackingCategoryPacket | PackingCategorySnapshotV2;
export const packingCategoryPresentation = (packet: PackingCategorySnapshotV2): PackingCategoryPresentation[] => {
  const linked = new Set(packet.item_categories.map((x) => x.category_id));
  return packet.categories.map((c) => ({
    key: packingCategoryKey(c.id),
    id: c.id,
    rawName: c.name,
    ownerPersonId: c.owner_person_id,
    owned: c.owner_person_id === null || c.owner_person_id === packet.scope.person_id,
    placeholder: linked.has(c.id) ? null : { kind: 'virtual-category', key: `virtual-packing-category:${c.id}` },
  }));
};
/** V1 commands keep their exact eight-fact observation, even when captured from a coupled v2 read. */
export function observePackingCategoryForWrite(packet: PackingCategoryReadPacket, id: string) {
  if (packet.version === 1) return observePackingCategory(packet, id);
  const category = packet.categories.find((c) => c.id === id);
  if (!category) throw Error('Unknown original category identity');
  const ids = new Set(packet.item_categories.filter((x) => x.category_id === id).map((x) => x.item_id));
  return {
    category: categoryV1Facts(category),
    items: packet.packing.items.filter((x) => ids.has(x.id)).sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
}
