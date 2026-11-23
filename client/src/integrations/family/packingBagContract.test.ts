import { describe, expect, it, vi } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import {
  bagAck,
  bagCreate,
  bagMembers,
  bagObservation,
  bagReceipt,
  bagRestore,
  bagSnapshot,
  bagTrash,
  bagUpdate,
} from '../../../tests/helpers/familyPackingBags';
import { bagBounded, packingBagEnvelope, packingBagObservation, packingBagSnapshot } from './packingBagContract';
import { checkPackingBagAcknowledgement, createPackingBagTransport, type PackingBagRpc } from './packingBagTransport';
import { packingCategoryEnvelope } from './packingCategoryContract';
import { packingEnvelope } from './packingCommandContract';
for (const factory of [bagCreate, bagUpdate, bagMembers, bagTrash, bagRestore])
  describe(factory.name + ' strict bag protocol', () => {
    it('roundtrips an original and sends exact126 RPC facts', async () => {
      const p = factory(),
        rpc = vi.fn<PackingBagRpc>().mockResolvedValue(bagAck(p)),
        c = p.command;
      expect(packingBagEnvelope.parse(p)).toEqual(p);
      expect(packingEnvelope.safeParse(p).success).toBe(false);
      expect(packingCategoryEnvelope.safeParse(p).success).toBe(false);
      expect(await createPackingBagTransport(rpc).execute(p)).toEqual(bagAck(p));
      expect(rpc).toHaveBeenCalledWith('execute_family_trip_packing_bag_v1', {
        p_trip_id: c.scope.trip_id,
        p_operation_id: c.operation_id,
        p_scope: c.scope,
        p_action: c.action,
        p_target_id: c.target_id,
        p_expected_revision: c.expected_revision,
        p_expected_collection_revision: c.expected_collection_revision,
        p_observed: c.observed,
        p_values: c.values,
      });
    });
    it.each([
      'version',
      'domain',
      'extra',
      'id',
      'scope',
      'unsafe',
      'bound',
      'draft',
      'unknown-value',
      'null-value',
      'observation',
      'lifecycle',
      'revision',
      'collection',
    ] as const)('refuses invalid %s before RPC', async (fault) => {
      const p = factory(),
        c = p.command,
        rpc = vi.fn<PackingBagRpc>();
      if (fault === 'version') Object.assign(p, { version: 2 });
      if (fault === 'domain') Object.assign(c, { kind: 'packing-group' });
      if (fault === 'extra') Object.assign(c, { copy: true });
      if (fault === 'id') c.target_id = 'virtual:bag';
      if (fault === 'scope') Object.assign(c.scope, { person_id: c.observed ? id(999) : 'invalid' });
      if (fault === 'unsafe') c.expected_collection_revision = Number.MAX_SAFE_INTEGER + 1;
      if (fault === 'bound') p.source_url = 'x'.repeat(1048577);
      if (fault === 'draft') Object.assign(p, { view_layer: 'myDraft' });
      if (fault === 'unknown-value') Object.assign(c.values, { owner_person_id: id(999) });
      if (fault === 'null-value') Object.assign(c, { values: null });
      if (fault === 'observation') Object.assign(c, { observed: c.observed ? null : bagObservation() });
      if (fault === 'lifecycle') {
        if (c.observed) {
          c.observed.bag.deleted_at = c.observed.bag.deleted_at ? null : c.observed.bag.created_at;
          c.observed.bag.deleted_by_person_id = c.observed.bag.deleted_at ? id(9) : null;
        } else Object.assign(c, { expected_revision: 1 });
      }
      if (fault === 'revision')
        Object.assign(c, { expected_revision: c.expected_revision === null ? 1 : c.expected_revision + 1 });
      if (fault === 'collection') {
        if (c.observed) c.observed.collection_revision++;
        else c.expected_collection_revision = -1;
      }
      await expect(createPackingBagTransport(rpc).execute(p), fault).rejects.toBeDefined();
      expect(rpc).not.toHaveBeenCalled();
    });
    it.each([
      'scope',
      'operation',
      'action',
      'target',
      'values',
      'changed',
      'counter',
      'name',
      'trip',
      'rank',
      'revision',
      'created',
      'timestamp',
      'extra',
      'members',
    ] as const)('rejects forged %s proof', (fault) => {
      const p = factory(),
        a = bagAck(p);
      if (fault === 'scope') a.scope.trip_lifecycle_revision++;
      if (fault === 'operation') a.operation_id = id(999);
      if (fault === 'action') Object.assign(a, { action: 'group-trash' });
      if (fault === 'target') a.target_id = id(999);
      if (fault === 'values') Object.assign(a.values as object, { name: 'tampered' });
      if (fault === 'changed') a.changed = !a.changed;
      if (fault === 'counter') a.collection_revision = p.command.expected_collection_revision;
      if (fault === 'name') a.bag.name = 'forged';
      if (fault === 'trip') a.bag.trip_id = id(999);
      if (fault === 'rank') {
        if (p.command.action === 'bag-create') a.bag.sort_order = -1;
        else a.bag.sort_order++;
      }
      if (fault === 'revision') a.bag.revision = p.command.observed?.bag.revision ?? 2;
      if (fault === 'created') a.bag.created_at = 'invalid';
      if (fault === 'timestamp') a.bag.updated_at = 'infinity';
      if (fault === 'extra') Object.assign(a.bag, { owner_person_id: id(9) });
      if (fault === 'members') a.member_person_ids.push(id(999));
      expect(() => checkPackingBagAcknowledgement(a, p), fault).toThrow();
    });
    it.each(['unknown', 'visible', 'redacted'] as const)(
      'validates %s receipt without authority from a result',
      async (mode) => {
        const p = factory(),
          r = bagReceipt(p, mode),
          rpc = vi.fn<PackingBagRpc>().mockResolvedValue(r),
          t = createPackingBagTransport(rpc);
        expect(await t.receipt(p)).toEqual(r);
        for (const bad of [
          { ...r, operation_id: id(999) },
          { ...r, result_redacted: true, result: bagAck(p) },
          { ...r, scope: { ...r.scope, person_id: id(999) } },
          { ...r, status: 'committed', result_redacted: false, result: null },
          { ...r, status: 'unknown', result_redacted: true },
        ]) {
          rpc.mockResolvedValueOnce(bad);
          await expect(t.receipt(p)).rejects.toBeDefined();
        }
      }
    );
    it('clones original arguments before a delayed RPC sees caller changes', async () => {
      const p = factory(),
        original = structuredClone(p);
      let resolve!: (x: unknown) => void;
      const rpc = vi.fn<PackingBagRpc>(
        () =>
          new Promise((r) => {
            resolve = r;
          })
      );
      const pending = createPackingBagTransport(rpc).execute(p);
      p.command.scope.trip_lifecycle_revision++;
      resolve(bagAck(original));
      expect(await pending).toEqual(bagAck(original));
      expect(rpc.mock.calls[0][1].p_scope).toEqual(original.command.scope);
    });
  });
it.each([
  ['bag-update', { name: 'Cabin bag' }],
  ['bag-members', { person_ids: [id(7)] }],
] as const)('accepts exact %s no-op only without business changes', (action, values) => {
  const p = bagOriginalForNoop(action, values),
    a = bagAck(p);
  expect(a.changed).toBe(false);
  expect(checkPackingBagAcknowledgement(a, p)).toEqual(a);
  a.bag.updated_at = '2027-01-01T00:00:00Z';
  expect(() => checkPackingBagAcknowledgement(a, p)).toThrow();
});
function bagOriginalForNoop(action: string, values: object) {
  const p = action === 'bag-update' ? bagUpdate() : bagMembers();
  return packingBagEnvelope.parse({ ...p, command: { ...p.command, values } });
}
it('permits monotonic multi-trigger revisions instead of requiring exactly+1', () => {
  const p = bagMembers(),
    a = bagAck(p);
  a.bag.revision += 7;
  a.collection_revision += 9;
  expect(checkPackingBagAcknowledgement(a, p)).toEqual(a);
});
it('preserves null and omission while refusing undefined/coerced content', () => {
  const p = bagUpdate();
  p.command.values = { color: null, weight_limit_grams: null };
  expect(packingBagEnvelope.parse(p).command.values).toEqual(p.command.values);
  for (const values of [
    { name: ' padded ' },
    { name: 'x'.repeat(501) },
    { name: '\0' },
    { color: 'red' },
    { weight_limit_grams: 1.5 },
    { weight_limit_grams: true },
    { color: undefined },
    {},
  ])
    expect(packingBagEnvelope.safeParse({ ...p, command: { ...p.command, values } }).success).toBe(false);
});
it('legacy names/colors may be observed but cannot be introduced as new content', () => {
  const o = bagObservation();
  o.bag.name = 'x'.repeat(600);
  o.bag.color = 'legacy';
  expect(packingBagObservation.parse(o)).toEqual(o);
  const p = bagUpdate();
  p.command.observed = o;
  p.command.values = { weight_limit_grams: 3 };
  const a = bagAck(p);
  expect(checkPackingBagAcknowledgement(a, p)).toEqual(a);
});
it('refuses success whose known private before/after history already exceeds1MiB', () => {
  const p = bagUpdate();
  if (!p.command.observed) throw Error();
  p.command.observed.bag.name = 'x'.repeat(400000);
  p.command.values = { weight_limit_grams: 3 };
  expect(packingBagEnvelope.safeParse(p).success).toBe(true);
  const a = bagAck(p);
  expect(bagBounded(a)).toBe(true);
  expect(() => checkPackingBagAcknowledgement(a, p)).toThrow();
});
it.each([
  'scope',
  'collection',
  'projection',
  'members',
  'people',
  'extra-roster',
  'duplicate',
  'inactive',
  'order',
  'unsafe',
])('rejects torn snapshot %s', (fault) => {
  const p = bagSnapshot();
  if (fault === 'scope') p.bags[0].scope.person_id = id(99);
  if (fault === 'collection') p.bags[0].collection_revision++;
  if (fault === 'projection') p.packing.bags[0].name = 'torn';
  if (fault === 'members') p.bags[0].member_person_ids = [];
  if (fault === 'people') p.people = [];
  if (fault === 'extra-roster') Object.assign(p.people[0], { is_guest: false });
  if (fault === 'duplicate') p.bags.push(structuredClone(p.bags[0]));
  if (fault === 'inactive') {
    p.bags[0].bag.deleted_at = p.bags[0].bag.created_at;
    p.bags[0].bag.deleted_by_person_id = id(9);
  }
  if (fault === 'order') p.people.reverse();
  if (fault === 'unsafe') p.packing.bags[0].total_weight_grams = Number.MAX_SAFE_INTEGER + 1;
  expect(packingBagSnapshot.safeParse(p).success).toBe(false);
});
it('preserves authoritative hidden-inclusive weight with no private item detail', () => {
  const p = bagSnapshot();
  expect(packingBagSnapshot.parse(p)).toEqual(p);
  expect(p.packing.bags[0].total_weight_grams).toBe(2200);
});
it('includeDeleted permits a live observation without inventing deleted lifecycle', async () => {
  const o = bagObservation(),
    rpc = vi.fn<PackingBagRpc>().mockResolvedValue(o);
  expect(await createPackingBagTransport(rpc).observation(o.scope, o.bag.id, true)).toEqual(o);
});
it('keeps microsecond tied Trash cursors in descending UUID order', async () => {
  const p = bagObservation(true),
    q = structuredClone(p);
  q.bag.id = id(5);
  const page = {
    version: 1,
    kind: 'packing-bag-trash',
    scope: p.scope,
    collection_revision: p.collection_revision,
    bags: [p, q],
    next_cursor: { id: q.bag.id, deleted_at: q.bag.deleted_at },
  };
  const rpc = vi.fn<PackingBagRpc>().mockResolvedValue(page),
    t = createPackingBagTransport(rpc);
  expect((await t.trash(p.scope, 2)).bags).toHaveLength(2);
  rpc.mockResolvedValueOnce({ ...page, bags: [q, p] });
  await expect(t.trash(p.scope, 2)).rejects.toBeDefined();
});
it.each(['42501', 'PT409', '54000', '22023', '23503'])('maps server refusal %s without fallback', async (code) => {
  const rpc = vi.fn<PackingBagRpc>().mockRejectedValue({ code });
  await expect(createPackingBagTransport(rpc).execute(bagCreate())).rejects.toBeDefined();
  expect(rpc).toHaveBeenCalledTimes(1);
});
