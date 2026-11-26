import type { PackingCommand, PackingEnvelope } from '../../src/integrations/family/packingCommandContract';
import type { PackingAck } from '../../src/integrations/family/packingContract';
import { canonicalPackingRow, canonicalPackingScope, packingFixtureId as id, packingFixtureAt } from './familyPacking';
export const canonicalPackingCommand = (): Extract<PackingCommand, { action: 'update' }> => ({
  version: 1,
  operation_id: id(10),
  scope: canonicalPackingScope(),
  action: 'update',
  target_id: id(5),
  expected_revision: 3,
  expected_collection_revision: null,
  values: { name: ' Raincoat ' },
});
export const canonicalPackingEnvelope = (command: PackingCommand = canonicalPackingCommand()): PackingEnvelope => ({
  version: 1,
  source_url: 'https://fixture.supabase.invalid',
  view_layer: 'published',
  command,
});
/** Synthetic service fixture only; real SQL behavior is independently qualified through Auth/PostgREST. */
export function canonicalPackingAck(p: PackingCommand = canonicalPackingCommand()): PackingAck {
  const a: PackingAck = {
    version: 1,
    trip_id: p.scope.trip_id,
    scope: structuredClone(p.scope),
    operation_id: p.operation_id,
    action: p.action,
    target_id: p.target_id,
    collection_revision: 8,
    ordered_ids: null,
    item: null,
  };
  if (p.action === 'reorder') {
    a.ordered_ids = [...p.values.ids];
    return a;
  }
  a.item = canonicalPackingRow({
    id: p.target_id,
    trip_id: p.scope.trip_id,
    revision: p.action === 'create' ? 1 : p.expected_revision + 1,
    deleted_at: p.action === 'trash' ? packingFixtureAt : null,
    deleted_by_person_id: p.action === 'trash' ? p.scope.person_id : null,
  });
  if (p.action === 'create') {
    const v = p.values;
    Object.assign(a.item, {
      name: v.name.replace(/^ +| +$/g, ''),
      category: v.category ?? '',
      quantity: v.quantity ?? 1,
      weight_grams: v.weight_grams ?? null,
      bag_id: v.bag_id ?? null,
      is_private: v.visibility === 'personal',
      owner_person_id: v.visibility === 'personal' ? p.scope.person_id : null,
      recipient_person_ids: [],
      contributor_person_ids: [],
    });
  } else if (p.action === 'update') {
    Object.assign(a.item, p.values);
    a.item.name = a.item.name.replace(/^ +| +$/g, '');
    if (a.item.packed_quantity !== null && a.item.packed_quantity >= a.item.quantity) {
      a.item.checked = true;
      a.item.packed_quantity = null;
    }
  }
  if (p.action === 'create' || p.action === 'packed-state') {
    const v = p.values,
      n = 'packed_quantity' in v ? (v.packed_quantity ?? 0) : null;
    a.item.checked = n === null ? ('checked' in v ? (v.checked ?? false) : false) : n === a.item.quantity;
    a.item.packed_quantity = n !== null && n > 0 && n < a.item.quantity ? n : null;
  }
  return a;
}
