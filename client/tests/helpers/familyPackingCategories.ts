import {
  observePackingCategory,
  type PackingCategoryAck,
  type PackingCategoryEnvelope,
  type PackingCategoryIntent,
  type PackingCategoryPacket,
} from '../../src/integrations/family/packingCategoryContract';
import {
  packingFixtureAt as at,
  canonicalPackingList,
  canonicalPackingRow,
  packingFixtureId as id,
} from './familyPacking';

export function canonicalPackingCategories(): PackingCategoryPacket {
  const packing = canonicalPackingList({}, true);
  packing.collection_revision = 7;
  packing.items = [5, 8].map((n, sort_order) =>
    canonicalPackingRow({
      id: id(n),
      category: 'Gear',
      sort_order,
      bag_id: null,
      is_private: false,
      owner_person_id: null,
      recipient_person_ids: [],
      contributor_person_ids: [],
    })
  );
  packing.unassigned_weight_grams = 2100;
  return {
    version: 1,
    scope: structuredClone(packing.scope),
    collection_revision: packing.collection_revision,
    packing,
    categories: [
      {
        id: id(20),
        trip_id: packing.scope.trip_id,
        owner_person_id: null,
        name: 'Gear',
        revision: 1,
        created_at: at,
        updated_at: at,
        assignments: [],
      },
    ],
    item_categories: packing.items.map((r) => ({ item_id: r.id, category_id: id(20) })),
    people: [],
  };
}
export function canonicalCategoryEnvelope(
  packet = canonicalPackingCategories(),
  intent: PackingCategoryIntent = { action: 'category-rename', values: { name: 'Renamed' } }
): PackingCategoryEnvelope {
  const selected = observePackingCategory(packet, packet.categories[0].id);
  return {
    version: 1,
    source_url: 'http://127.0.0.1:55431',
    view_layer: 'published',
    original_items: selected.items,
    command: {
      version: 1,
      kind: 'packing-category',
      operation_id: id(100),
      scope: structuredClone(packet.scope),
      expected_collection_revision: packet.collection_revision,
      observed_category: selected.category,
      ...intent,
    },
  };
}
export function canonicalCategoryAck(p: PackingCategoryEnvelope): PackingCategoryAck {
  const c = p.command,
    before = structuredClone(c.observed_category);
  const changed =
    c.action === 'category-rename'
      ? c.values.name !== before.name
      : JSON.stringify(c.values.person_ids) !== JSON.stringify(before.assignments.map((a) => a.person_id));
  const category =
    c.action === 'category-rename'
      ? {
          ...before,
          name: c.values.name,
          revision: before.revision + (changed ? 1 : 0),
          updated_at: changed ? '2026-11-11T12:34:57.123456+00:00' : before.updated_at,
        }
      : {
          ...before,
          assignments: c.values.person_ids.map(
            (person_id) =>
              before.assignments.find((a) => a.person_id === person_id) ?? {
                person_id,
                assigned_at: at,
                assigned_by_person_id: c.scope.person_id,
              }
          ),
        };
  return {
    version: 1,
    kind: 'packing-category',
    trip_id: c.scope.trip_id,
    operation_id: c.operation_id,
    scope: structuredClone(c.scope),
    action: c.action,
    values: structuredClone(c.values),
    collection_revision: c.expected_collection_revision + (changed ? 1 : 0),
    category,
    changed_item_revisions:
      changed && c.action === 'category-rename'
        ? p.original_items.map((r) => ({ item_id: r.id, revision: r.revision + 1 }))
        : [],
  };
}
