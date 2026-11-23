import type {
  PackingCategoryItemEnvelope,
  PackingCategoryLifecycleEnvelope,
  PackingCategorySnapshotV2,
  PackingCategoryV2,
  PackingCategoryV2Ack,
  PackingCategoryV2Envelope,
} from '../../src/integrations/family/packingCategoryV2Contract';
import {
  packingFixtureAt as at,
  canonicalPackingList,
  canonicalPackingRow,
  packingFixtureId as id,
} from './familyPacking';
export function categoryV2(extra: Partial<PackingCategoryV2> = {}): PackingCategoryV2 {
  return {
    id: id(20),
    trip_id: canonicalPackingList().scope.trip_id,
    owner_person_id: null,
    name: 'Gear',
    revision: 1,
    created_at: at,
    updated_at: at,
    assignments: [],
    sort_order: 0,
    retained_when_empty: true,
    deleted_at: null,
    deleted_by_person_id: null,
    ...extra,
  };
}
export function snapshotV2(): PackingCategorySnapshotV2 {
  const packing = canonicalPackingList();
  packing.items = [];
  packing.bags = [];
  packing.category_assignees = {};
  packing.unassigned_weight_grams = 0;
  return {
    version: 2,
    scope: structuredClone(packing.scope),
    collection_revision: packing.collection_revision,
    packing,
    categories: [categoryV2()],
    item_categories: [],
    people: [],
  };
}
export function lifecycleV2(): PackingCategoryLifecycleEnvelope {
  const s = snapshotV2();
  return {
    version: 2,
    source_url: 'http://127.0.0.1:55631',
    view_layer: 'published',
    command: {
      version: 2,
      kind: 'packing-category-lifecycle',
      operation_id: id(100),
      scope: s.scope,
      target_id: id(21),
      action: 'category-create',
      observed_category: null,
      expected_collection_revision: s.collection_revision,
      values: { name: 'Empty category', visibility: 'common' },
    },
  };
}
export function itemV2(): PackingCategoryItemEnvelope {
  const p = lifecycleV2();
  return {
    ...p,
    original_item: null,
    original_category_id: null,
    command: {
      version: 2,
      kind: 'packing-category-item',
      operation_id: id(101),
      scope: p.command.scope,
      target_id: id(30),
      expected_revision: null,
      expected_collection_revision: p.command.expected_collection_revision,
      category_id: id(20),
      observed_category: categoryV2(),
      action: 'category-item-create',
      values: { name: '  Real item  ', quantity: 3, packed_quantity: 2, weight_grams: 4 },
    },
  };
}
export function ackV2(p: PackingCategoryV2Envelope): PackingCategoryV2Ack {
  const c = p.command,
    later = '2026-11-12T12:34:57.123456+00:00';
  const base = {
    version: 2 as const,
    trip_id: c.scope.trip_id,
    operation_id: c.operation_id,
    scope: structuredClone(c.scope),
    collection_revision: c.expected_collection_revision + 1,
  };
  if (c.kind === 'packing-category-lifecycle') {
    if (c.action === 'category-create')
      return {
        ...base,
        kind: c.kind,
        action: c.action,
        values: c.values,
        changed: true,
        category: categoryV2({
          id: c.target_id,
          trip_id: c.scope.trip_id,
          name: c.values.name,
          owner_person_id: c.values.visibility === 'personal' ? c.scope.person_id : null,
        }),
      };
    const b = c.observed_category;
    if (!b) throw Error('Expected original category');
    const changed = c.action !== 'category-retain' || !b.retained_when_empty;
    return {
      ...base,
      collection_revision: c.expected_collection_revision + (changed ? 1 : 0),
      kind: c.kind,
      action: c.action,
      values: {},
      changed,
      category: {
        ...b,
        revision: b.revision + (changed ? 1 : 0),
        updated_at: changed ? later : b.updated_at,
        retained_when_empty: c.action === 'category-dismiss-empty' ? b.retained_when_empty : true,
        deleted_at: c.action === 'category-dismiss-empty' ? later : null,
        deleted_by_person_id: c.action === 'category-dismiss-empty' ? c.scope.person_id : null,
      },
    };
  }
  const b = c.observed_category,
    original = 'original_item' in p ? p.original_item : null;
  const changed =
    c.action === 'category-item-create' || ('original_category_id' in p && p.original_category_id !== c.category_id);
  const retained = changed && !b.retained_when_empty;
  const v: Extract<PackingCategoryItemEnvelope['command'], { action: 'category-item-create' }>['values'] =
    c.action === 'category-item-create' ? c.values : { name: 'unused move fixture' };
  return {
    ...base,
    kind: c.kind,
    action: c.action,
    target_id: c.target_id,
    values: c.values,
    changed,
    collection_revision: c.expected_collection_revision + (changed ? 1 : 0),
    category: {
      ...b,
      retained_when_empty: b.retained_when_empty || retained,
      revision: b.revision + (retained ? 1 : 0),
      updated_at: retained ? later : b.updated_at,
    },
    item: original
      ? {
          ...original,
          category: b.name,
          revision: original.revision + (changed ? 1 : 0),
          updated_at: changed ? later : original.updated_at,
        }
      : canonicalPackingRow({
          id: c.target_id,
          trip_id: c.scope.trip_id,
          name: v.name.replace(/^ +| +$/g, ''),
          category: b.name,
          quantity: v.quantity ?? 1,
          weight_grams: v.weight_grams ?? null,
          bag_id: v.bag_id ?? null,
          revision: 1,
          is_private: b.owner_person_id !== null,
          owner_person_id: b.owner_person_id,
          recipient_person_ids: [],
          contributor_person_ids: [],
          checked: 'packed_quantity' in v ? v.packed_quantity === (v.quantity ?? 1) : (v.checked ?? false),
          packed_quantity: v.packed_quantity && v.packed_quantity < (v.quantity ?? 1) ? v.packed_quantity : null,
        }),
  };
}
