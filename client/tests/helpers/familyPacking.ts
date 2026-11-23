import type { PackingBag, PackingList, PackingRow, PackingScope } from '../../src/integrations/family/packingContract';
export const packingFixtureId = (n: number) => `a0bc0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const packingFixtureAt = '2026-11-08T12:34:56.123456+00:00';
export const canonicalPackingScope = (change: Partial<PackingScope> = {}): PackingScope => ({
  version: 1,
  trip_id: packingFixtureId(1),
  family_id: packingFixtureId(2),
  user_id: packingFixtureId(3),
  person_id: packingFixtureId(4),
  layer: 'published',
  trip_lifecycle_revision: 0,
  ...change,
});
export const canonicalPackingRow = (change: Partial<PackingRow> = {}): PackingRow => ({
  id: packingFixtureId(5),
  trip_id: packingFixtureId(1),
  name: 'Raincoat',
  category: 'Clothes',
  checked: false,
  sort_order: 0,
  quantity: 3,
  packed_quantity: 1,
  weight_grams: 350,
  bag_id: packingFixtureId(6),
  is_private: true,
  owner_person_id: packingFixtureId(4),
  created_at: packingFixtureAt,
  updated_at: packingFixtureAt,
  revision: 3,
  deleted_at: null,
  deleted_by_person_id: null,
  recipient_person_ids: [packingFixtureId(7)],
  contributor_person_ids: [packingFixtureId(4)],
  ...change,
});
export const canonicalPackingBag = (change: Partial<PackingBag> = {}): PackingBag => ({
  id: packingFixtureId(6),
  trip_id: packingFixtureId(1),
  name: 'Cabin bag',
  color: '#336699',
  weight_limit_grams: 8000,
  sort_order: 0,
  created_at: packingFixtureAt,
  updated_at: packingFixtureAt,
  member_person_ids: [packingFixtureId(7)],
  total_weight_grams: 2200,
  ...change,
});
export function canonicalPackingList(scope: Partial<PackingScope> = {}, empty = false): PackingList {
  const s = canonicalPackingScope(scope);
  return {
    version: 1,
    scope: s,
    collection_revision: 7,
    trash_count: 1,
    items: empty ? [] : [canonicalPackingRow({ trip_id: s.trip_id, owner_person_id: s.person_id })],
    bags: empty ? [] : [canonicalPackingBag({ trip_id: s.trip_id })],
    category_assignees: empty ? {} : { Clothes: [s.person_id] },
    unassigned_weight_grams: 0,
  };
}
