import type { PackingRow } from '../../src/integrations/family/packingContract';
import type {
  PackingGroupAck,
  PackingGroupCommand,
  PackingGroupEnvelope,
} from '../../src/integrations/family/packingGroupContract';
import { canonicalPackingRow, canonicalPackingScope, packingFixtureId as id, packingFixtureAt } from './familyPacking';

export function canonicalPackingGroup(
  action: PackingGroupCommand['action'] = 'group-packed-state',
  rows: PackingRow[] = [
    canonicalPackingRow({ id: id(5), is_private: false, owner_person_id: null, category: '', bag_id: null }),
    canonicalPackingRow({
      id: id(8),
      is_private: false,
      owner_person_id: null,
      category: 'Other',
      checked: true,
      packed_quantity: null,
      bag_id: null,
    }),
  ]
): PackingGroupEnvelope {
  return {
    version: 1,
    source_url: 'http://127.0.0.1:55331',
    view_layer: 'published',
    original_items: structuredClone(rows),
    command: {
      version: 1,
      kind: 'packing-group',
      scope: canonicalPackingScope(),
      operation_id: id(10),
      action,
      expected_collection_revision: 7,
      selector: { view: 'common', status: 'all', categories: action === 'clear-completed' ? null : ['', 'Other'] },
      observed_items: rows.map(({ id, revision, checked }) => ({ id, revision, checked })),
      values: action === 'group-packed-state' ? { checked: true } : {},
    } as PackingGroupCommand,
  };
}
/** Synthetic service fixture. Server behavior is also tested independently through real SQL/Auth. */
export function canonicalPackingGroupAck(p: PackingGroupEnvelope): PackingGroupAck {
  const c = p.command,
    changed: string[] = [];
  const items = p.original_items.map((r) => {
    const changedHere =
      c.action === 'group-packed-state'
        ? r.checked !== c.values.checked || r.packed_quantity !== null
        : c.action === 'group-trash' || r.checked;
    if (!changedHere) return structuredClone(r);
    changed.push(r.id);
    return {
      ...structuredClone(r),
      revision: r.revision + 2,
      updated_at: packingFixtureAt,
      ...(c.action === 'group-packed-state'
        ? { checked: c.values.checked, packed_quantity: null }
        : { deleted_at: packingFixtureAt, deleted_by_person_id: c.scope.person_id }),
    };
  });
  return {
    version: 1,
    kind: 'packing-group',
    trip_id: c.scope.trip_id,
    scope: structuredClone(c.scope),
    operation_id: c.operation_id,
    action: c.action,
    selector: structuredClone(c.selector),
    values: structuredClone(c.values),
    collection_revision: c.expected_collection_revision + (changed.length ? 3 : 0),
    items,
    changed_ids: changed,
  };
}
