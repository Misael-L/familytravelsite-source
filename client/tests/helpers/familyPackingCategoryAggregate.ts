import {
  packingCategoryAggregateEnvelope,
  type PackingCategoryAggregateAck,
  type PackingCategoryAggregateEnvelope,
} from '../../src/integrations/family/packingCategoryAggregateContract';
import { canonicalPackingRow, packingFixtureId as id } from './familyPacking';
import { categoryV2, snapshotV2 } from './familyPackingCategoryV2';
export const aggregateAt = '2026-11-12T12:00:00.123456+00:00';
export function aggregateTrash(): PackingCategoryAggregateEnvelope {
  const p = snapshotV2(),
    category = categoryV2();
  return packingCategoryAggregateEnvelope.parse({
    version: 3,
    source_url: 'http://127.0.0.1:55731',
    view_layer: 'published',
    command: {
      version: 3,
      kind: 'packing-category-aggregate',
      action: 'category-trash-batch',
      operation_id: id(100),
      scope: p.scope,
      expected_collection_revision: 7,
      target_id: category.id,
      values: {},
      observed: {
        version: 3,
        kind: 'packing-category-observation',
        scope: p.scope,
        collection_revision: 7,
        category,
        batch: null,
        items: [canonicalPackingRow({ id: id(30), category: category.name, owner_person_id: null, is_private: false })],
      },
    },
  });
}
export function aggregateReorder(): PackingCategoryAggregateEnvelope {
  const p = snapshotV2();
  return packingCategoryAggregateEnvelope.parse({
    version: 3,
    source_url: 'http://127.0.0.1:55731',
    view_layer: 'published',
    command: {
      version: 3,
      kind: 'packing-category-aggregate',
      action: 'category-reorder',
      operation_id: id(101),
      scope: p.scope,
      expected_collection_revision: 7,
      target_id: null,
      values: { ordered_ids: [id(21), id(20)] },
      observed: {
        version: 3,
        kind: 'packing-category-lane',
        scope: p.scope,
        collection_revision: 7,
        lane: 'common',
        owner_person_id: null,
        categories: [categoryV2({ sort_order: 5 }), categoryV2({ id: id(21), name: 'Other', sort_order: 5 })],
      },
    },
  });
}
export function aggregateAck(p: PackingCategoryAggregateEnvelope): PackingCategoryAggregateAck {
  const c = p.command,
    common = {
      version: 3 as const,
      kind: c.kind,
      trip_id: c.scope.trip_id,
      operation_id: c.operation_id,
      scope: structuredClone(c.scope),
      values: structuredClone(c.values),
      collection_revision: c.expected_collection_revision + 3,
      changed: true,
    };
  if (c.action === 'category-reorder') {
    const changed =
      JSON.stringify(c.values.ordered_ids) !== JSON.stringify(c.observed.categories.map((category) => category.id));
    return {
      ...common,
      action: c.action,
      target_id: null,
      lane: c.observed.lane,
      values: c.values,
      changed,
      collection_revision: c.expected_collection_revision + (changed ? 2 : 0),
      categories: c.values.ordered_ids.map((key, i) => {
        const old = c.observed.categories.find((category) => category.id === key);
        if (!old) throw Error('Incomplete fixture');
        const sort_order = changed ? i : old.sort_order,
          updated = sort_order !== old.sort_order;
        return {
          ...old,
          sort_order,
          revision: old.revision + (updated ? 1 : 0),
          updated_at: updated ? aggregateAt : old.updated_at,
        };
      }),
    };
  }
  const deleted = c.action === 'category-trash-batch',
    o = c.observed;
  return {
    ...common,
    action: c.action,
    target_id: c.target_id,
    values: {},
    category: {
      ...o.category,
      revision: o.category.revision + 1,
      updated_at: aggregateAt,
      deleted_at: deleted ? aggregateAt : null,
      deleted_by_person_id: deleted ? c.scope.person_id : null,
    },
    items: o.items.map((row) => ({
      ...row,
      revision: row.revision + 1,
      updated_at: aggregateAt,
      deleted_at: deleted ? aggregateAt : null,
      deleted_by_person_id: deleted ? c.scope.person_id : null,
    })),
    batch: deleted
      ? { actor_user_id: c.scope.user_id, operation_id: c.operation_id, item_count: o.items.length }
      : required(o.batch),
  };
}
export function aggregateRestore(): PackingCategoryAggregateEnvelope {
  const p = aggregateTrash(),
    a = aggregateAck(p);
  if (a.action === 'category-reorder') throw Error();
  // Distinct instants for the later restore proof.
  a.category.updated_at = '2026-11-11T12:00:00.123456+00:00';
  a.items.forEach((row) => {
    row.updated_at = a.category.updated_at;
  });
  return packingCategoryAggregateEnvelope.parse({
    ...p,
    command: {
      ...p.command,
      action: 'category-restore-batch',
      operation_id: id(102),
      expected_collection_revision: a.collection_revision,
      observed: {
        version: 3,
        kind: 'packing-category-observation',
        scope: a.scope,
        collection_revision: a.collection_revision,
        category: a.category,
        items: a.items,
        batch: a.batch,
      },
    },
  });
}

function required<T>(value: T | null | undefined): T {
  if (value == null) throw Error('Synthetic batch required');
  return value;
}
