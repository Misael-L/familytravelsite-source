import {
  equalBagFacts as equal,
  packingBagAck,
  packingBagEnvelope,
  type PackingBagAck,
  type PackingBagEnvelope,
  type PackingBagObservation,
  type PackingBagSnapshot,
} from '../../src/integrations/family/packingBagContract';
import {
  packingFixtureAt as at,
  canonicalPackingBag,
  canonicalPackingList,
  packingFixtureId as id,
} from './familyPacking';
export const later = '2026-11-12T12:34:57.123456+00:00';
export function bagObservation(deleted = false): PackingBagObservation {
  const b = canonicalPackingBag();
  const old = {
    id: b.id,
    trip_id: b.trip_id,
    name: b.name,
    color: b.color,
    sort_order: b.sort_order,
    weight_limit_grams: b.weight_limit_grams,
    created_at: b.created_at,
    updated_at: b.updated_at,
  };
  return {
    version: 1,
    kind: 'packing-bag-observation',
    scope: canonicalPackingList().scope,
    collection_revision: 7,
    bag: { ...old, revision: 4, deleted_at: deleted ? at : null, deleted_by_person_id: deleted ? id(9) : null },
    member_person_ids: b.member_person_ids,
  };
}
export function bagSnapshot(): PackingBagSnapshot {
  const o = bagObservation(),
    packing = canonicalPackingList();
  return {
    version: 1,
    kind: 'packing-bag-snapshot',
    scope: structuredClone(o.scope),
    collection_revision: 7,
    packing,
    bags: [o],
    people: [
      { id: id(4), display_name: 'Owner', eligible: true },
      { id: id(7), display_name: 'Carrier', eligible: true },
    ],
  };
}
export function bagOriginal(action: PackingBagEnvelope['command']['action'] = 'bag-update'): PackingBagEnvelope {
  const o = bagObservation(action === 'bag-restore');
  const values =
    action === 'bag-create'
      ? { name: 'New bag', color: '#112233' }
      : action === 'bag-update'
        ? { name: 'Renamed' }
        : action === 'bag-members'
          ? { person_ids: [id(4), id(7)] }
          : {};
  return packingBagEnvelope.parse({
    version: 1,
    source_url: 'http://127.0.0.1:55831',
    view_layer: 'published',
    command: {
      version: 1,
      kind: 'packing-bag',
      operation_id: id(100),
      scope: structuredClone(o.scope),
      action,
      target_id: action === 'bag-create' ? id(30) : o.bag.id,
      expected_revision: action === 'bag-create' ? null : o.bag.revision,
      expected_collection_revision: 7,
      observed: action === 'bag-create' ? null : o,
      values,
    },
  });
}
export const bagCreate = () => bagOriginal('bag-create');
export const bagUpdate = () => bagOriginal('bag-update');
export const bagMembers = () => bagOriginal('bag-members');
export const bagTrash = () => bagOriginal('bag-trash-empty');
export const bagRestore = () => bagOriginal('bag-restore');
export function bagAck(p: PackingBagEnvelope): PackingBagAck {
  const c = p.command,
    old = c.observed;
  let changed = true,
    bag = old
      ? structuredClone(old.bag)
      : {
          ...bagObservation().bag,
          id: c.target_id,
          name: '',
          color: null,
          weight_limit_grams: null,
          sort_order: 1,
          revision: 1,
          created_at: later,
          updated_at: later,
        };
  let members = old ? structuredClone(old.member_person_ids) : [];
  if (c.action === 'bag-create')
    bag = {
      ...bag,
      name: c.values.name,
      color: c.values.color ?? null,
      weight_limit_grams: c.values.weight_limit_grams ?? null,
    };
  if (c.action === 'bag-update') {
    const next = { ...bag, ...c.values };
    changed = !equal(next, bag);
    bag = next;
  }
  if (c.action === 'bag-members') {
    members = structuredClone(c.values.person_ids);
    changed = !equal(members, old?.member_person_ids);
  }
  if (c.action === 'bag-trash-empty') bag = { ...bag, deleted_at: later, deleted_by_person_id: c.scope.person_id };
  if (c.action === 'bag-restore') bag = { ...bag, deleted_at: null, deleted_by_person_id: null };
  if (changed && old)
    bag = { ...bag, revision: bag.revision + (c.action === 'bag-members' ? 3 : 1), updated_at: later };
  return packingBagAck.parse({
    version: 1,
    kind: 'packing-bag',
    trip_id: c.scope.trip_id,
    operation_id: c.operation_id,
    scope: structuredClone(c.scope),
    action: c.action,
    target_id: c.target_id,
    values: structuredClone(c.values),
    collection_revision: c.expected_collection_revision + (changed ? 4 : 0),
    changed,
    bag,
    member_person_ids: members,
  });
}
export function bagReceipt(p: PackingBagEnvelope, mode: 'unknown' | 'visible' | 'redacted' = 'unknown') {
  return {
    version: 1 as const,
    kind: 'packing-bag' as const,
    trip_id: p.command.scope.trip_id,
    operation_id: p.command.operation_id,
    scope: {
      ...p.command.scope,
      trip_lifecycle_revision: p.command.scope.trip_lifecycle_revision + (mode === 'redacted' ? 1 : 0),
    },
    status: mode === 'unknown' ? ('unknown' as const) : ('committed' as const),
    result_redacted: mode === 'redacted',
    result: mode === 'visible' ? bagAck(p) : null,
  };
}
