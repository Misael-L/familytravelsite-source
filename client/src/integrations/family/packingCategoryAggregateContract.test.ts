import { describe, expect, it, vi } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import {
  aggregateAck,
  aggregateReorder,
  aggregateRestore,
  aggregateTrash,
} from '../../../tests/helpers/familyPackingCategoryAggregate';
import { packingCategoryAggregateEnvelope, packingCategoryObservationV3 } from './packingCategoryAggregateContract';
import {
  checkPackingCategoryAggregateAcknowledgement,
  createPackingCategoryAggregateTransport,
  type PackingCategoryAggregateRpc,
} from './packingCategoryAggregateTransport';
import { packingCategoryEnvelope } from './packingCategoryContract';
import { packingCategoryV2Envelope } from './packingCategoryV2Contract';

for (const factory of [aggregateTrash, aggregateRestore, aggregateReorder])
  describe(factory.name + ' strict domain', () => {
    it('roundtrips originals, isolates old parsers and sends exact RPC facts', async () => {
      const p = factory(),
        rpc = vi.fn<PackingCategoryAggregateRpc>().mockResolvedValue(aggregateAck(p));
      expect(packingCategoryAggregateEnvelope.parse(p)).toEqual(p);
      expect(packingCategoryV2Envelope.safeParse(p).success).toBe(false);
      expect(packingCategoryEnvelope.safeParse(p).success).toBe(false);
      expect(await createPackingCategoryAggregateTransport(rpc).execute(p)).toEqual(aggregateAck(p));
      const c = p.command;
      expect(rpc).toHaveBeenCalledWith('execute_family_trip_packing_category_aggregate_v3', {
        p_trip_id: c.scope.trip_id,
        p_operation_id: c.operation_id,
        p_scope: c.scope,
        p_action: c.action,
        p_target_id: c.target_id,
        p_expected_collection_revision: c.expected_collection_revision,
        p_observed: c.observed,
        p_values: c.values,
      });
    });
    it.each([
      'version',
      'domain',
      'extra',
      'virtual',
      'scope',
      'collection',
      'owner',
      'duplicate',
      'unsorted',
      'wrong-trip',
      'missing',
      'unsafe',
      'bound',
      'draft',
    ])('rejects malformed original %s before RPC', async (fault) => {
      const p = factory(),
        c = p.command,
        rpc = vi.fn<PackingCategoryAggregateRpc>();
      if (fault === 'version') Object.assign(p, { version: 2 });
      if (fault === 'domain') Object.assign(c, { kind: 'packing-group' });
      if (fault === 'extra') Object.assign(c, { original_items: [] });
      if (fault === 'virtual') c.operation_id = 'packing-category:virtual';
      if (fault === 'scope') c.scope.person_id = id(900);
      if (fault === 'collection') c.expected_collection_revision++;
      if (fault === 'unsafe') c.expected_collection_revision = Number.MAX_SAFE_INTEGER + 1;
      if (fault === 'bound') p.source_url = 'x'.repeat(8388609);
      if (fault === 'draft') Object.assign(p, { view_layer: 'myDraft' });
      if (c.action === 'category-reorder') {
        if (fault === 'owner') c.observed.owner_person_id = id(900);
        if (fault === 'duplicate') c.values.ordered_ids[1] = c.values.ordered_ids[0];
        if (fault === 'unsorted') c.observed.categories.reverse();
        if (fault === 'wrong-trip') c.observed.categories[0].trip_id = id(900);
        if (fault === 'missing') c.values.ordered_ids.pop();
      } else {
        if (fault === 'owner') c.observed.category.owner_person_id = id(900);
        if (fault === 'duplicate') c.observed.items.push(structuredClone(c.observed.items[0]));
        if (fault === 'unsorted') c.observed.items[0].recipient_person_ids.reverse();
        if (fault === 'unsorted') c.observed.items[0].recipient_person_ids = [id(9), id(8)];
        if (fault === 'wrong-trip') c.observed.items[0].trip_id = id(900);
        if (fault === 'missing') Reflect.deleteProperty(c.observed.category, 'updated_at');
      }
      await expect(createPackingCategoryAggregateTransport(rpc).execute(p), fault).rejects.toBeDefined();
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
      'category-content',
      'row-count',
      'rank',
      'revision',
      'timestamp',
      'extra',
    ])('refuses forged acknowledgement %s', (fault) => {
      const p = factory(),
        a = aggregateAck(p);
      if (fault === 'scope') a.scope.trip_lifecycle_revision++;
      if (fault === 'operation') a.operation_id = id(999);
      if (fault === 'action') Object.assign(a, { action: 'group-trash' });
      if (fault === 'target') a.target_id = id(999);
      if (fault === 'values') Object.assign(a.values, { name: 'overwrite' });
      if (fault === 'changed') a.changed = !a.changed;
      if (fault === 'counter') a.collection_revision = p.command.expected_collection_revision;
      if (fault === 'extra') Object.assign(a, { current: true });
      const c = a.action === 'category-reorder' ? a.categories[0] : a.category;
      if (fault === 'category-content') c.name = 'Overwritten';
      if (fault === 'rank') c.sort_order++;
      if (fault === 'revision') c.revision++;
      if (fault === 'timestamp')
        c.updated_at =
          p.command.action === 'category-reorder'
            ? required(p.command.observed.categories.find((x) => x.id === c.id)).updated_at
            : p.command.observed.category.updated_at;
      if (fault === 'row-count') {
        if (a.action === 'category-reorder') a.categories.pop();
        else a.items.pop();
      }
      expect(() => checkPackingCategoryAggregateAcknowledgement(a, p), fault).toThrow();
    });
    it('clones the original before a slow RPC sees later caller changes', async () => {
      const p = factory(),
        original = structuredClone(p);
      let resolve!: (value: unknown) => void;
      const rpc = vi.fn<PackingCategoryAggregateRpc>(
        () =>
          new Promise((r) => {
            resolve = r;
          })
      );
      const pending = createPackingCategoryAggregateTransport(rpc).execute(p);
      p.command.scope.trip_lifecycle_revision++;
      resolve(aggregateAck(original));
      expect(await pending).toEqual(aggregateAck(original));
      expect(rpc.mock.calls[0][1].p_scope).toEqual(original.command.scope);
    });
    it.each(['unknown', 'visible', 'redacted'] as const)(
      'validates %s receipt and historical scope without rebasing',
      async (mode) => {
        const p = factory(),
          c = p.command;
        const value = {
          version: 3,
          kind: c.kind,
          trip_id: c.scope.trip_id,
          operation_id: c.operation_id,
          scope: { ...c.scope, trip_lifecycle_revision: c.scope.trip_lifecycle_revision + 2 },
          status: mode === 'unknown' ? 'unknown' : 'committed',
          result_redacted: mode === 'redacted',
          result: mode === 'visible' ? aggregateAck(p) : null,
        };
        const rpc = vi.fn<PackingCategoryAggregateRpc>().mockResolvedValue(value),
          t = createPackingCategoryAggregateTransport(rpc);
        expect(await t.receipt(p)).toEqual(value);
        for (const bad of [
          { ...value, operation_id: id(999) },
          { ...value, result_redacted: true, result: aggregateAck(p) },
          { ...value, scope: { ...value.scope, person_id: id(999) } },
          { ...value, status: 'committed', result_redacted: false, result: null },
          { ...value, status: 'unknown', result_redacted: true },
        ]) {
          rpc.mockResolvedValueOnce(bad);
          await expect(t.receipt(p)).rejects.toBeDefined();
        }
      }
    );
  });

it('reorder no-op preserves sparse original ranks and does not invent counter changes', () => {
  const p = aggregateReorder();
  if (p.command.action !== 'category-reorder') throw Error();
  p.command.values.ordered_ids = p.command.observed.categories.map((c) => c.id);
  const a = aggregateAck(p);
  expect(checkPackingCategoryAggregateAcknowledgement(a, p)).toEqual(a);
  if (a.action !== 'category-reorder') throw Error();
  a.categories[0].sort_order = 0;
  expect(() => checkPackingCategoryAggregateAcknowledgement(a, p)).toThrow();
});
it.each(['quantity', 'name', 'bag_id', 'checked', 'recipient_person_ids', 'contributor_person_ids', 'sort_order'])(
  'batch result cannot alter retained member %s',
  (field) => {
    const p = aggregateTrash(),
      a = aggregateAck(p);
    if (a.action === 'category-reorder') throw Error();
    Object.assign(a.items[0], {
      [field]: field.endsWith('ids')
        ? [id(900)]
        : field === 'bag_id'
          ? id(900)
          : field === 'name'
            ? 'Changed'
            : field === 'checked'
              ? true
              : 900,
    });
    expect(() => checkPackingCategoryAggregateAcknowledgement(a, p)).toThrow();
  }
);
it.each(['42501', 'PT409', 'PGRST301', '22023', '23503', '23514', '54000', '0A000'])(
  'maps %s refusal with no raw/name fallback',
  async (code) => {
    const rpc = vi.fn<PackingCategoryAggregateRpc>().mockRejectedValue({ code });
    await expect(createPackingCategoryAggregateTransport(rpc).execute(aggregateTrash())).rejects.toHaveProperty(
      'status',
      { '42501': 403, PT409: 409, PGRST301: 401, '22023': 400, '23503': 422, '23514': 422, '54000': 413, '0A000': 422 }[
        code
      ]
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  }
);
it('legacy empty dismissal is observable, but cannot become a batch restore', () => {
  const p = aggregateRestore();
  if (p.command.action === 'category-reorder') throw Error();
  p.command.observed.batch = null;
  p.command.observed.items = [];
  expect(packingCategoryObservationV3.safeParse(p.command.observed).success).toBe(true);
  expect(packingCategoryAggregateEnvelope.safeParse(p).success).toBe(false);
});

it.each(['scope', 'lane', 'owner', 'trip', 'duplicate', 'rank', 'extra', 'missing'])(
  'checks the complete lane read: %s',
  async (fault) => {
    const p = aggregateReorder();
    if (p.command.action !== 'category-reorder') throw Error();
    const raw = structuredClone(p.command.observed);
    if (fault === 'scope') raw.scope.user_id = id(999);
    if (fault === 'lane') raw.lane = 'personal';
    if (fault === 'owner') raw.owner_person_id = id(999);
    if (fault === 'trip') raw.categories[0].trip_id = id(999);
    if (fault === 'duplicate') raw.categories[1].id = raw.categories[0].id;
    if (fault === 'rank') raw.categories.reverse();
    if (fault === 'extra') Object.assign(raw, { filtered: true });
    if (fault === 'missing') Reflect.deleteProperty(raw.categories[0], 'updated_at');
    await expect(
      createPackingCategoryAggregateTransport(vi.fn().mockResolvedValue(raw)).lane(p.command.scope, 'common')
    ).rejects.toBeDefined();
  }
);
it.each(['target', 'scope', 'count', 'owner', 'state', 'category', 'private', 'scalar'])(
  'checks full member observation: %s',
  async (fault) => {
    const p = aggregateRestore();
    if (p.command.action === 'category-reorder') throw Error();
    const raw = structuredClone(p.command.observed);
    if (fault === 'target') raw.category.id = id(999);
    if (fault === 'scope') raw.scope.family_id = id(999);
    if (fault === 'count') required(raw.batch).item_count++;
    if (fault === 'owner') raw.items[0].owner_person_id = id(999);
    if (fault === 'state') raw.items[0].deleted_at = null;
    if (fault === 'category') raw.items[0].category = 'Different';
    if (fault === 'private') raw.items[0].is_private = true;
    if (fault === 'scalar') raw.items[0].name = '\ud800';
    await expect(
      createPackingCategoryAggregateTransport(vi.fn().mockResolvedValue(raw)).observation(
        p.command.scope,
        p.command.target_id,
        true
      )
    ).rejects.toBeDefined();
  }
);
it('handles exact raw names and own-personal lanes without category/item namespace mixing', async () => {
  const p = aggregateReorder();
  if (p.command.action !== 'category-reorder') throw Error();
  for (const names of [
    ['', 'Other'],
    ['__proto__', 'constructor'],
    ['é', 'e\u0301'],
  ]) {
    const raw = structuredClone(p.command.observed);
    raw.categories.forEach((c, i) => {
      c.name = names[i];
    });
    const rpc = vi.fn<PackingCategoryAggregateRpc>().mockResolvedValue(raw);
    expect(
      (await createPackingCategoryAggregateTransport(rpc).lane(p.command.scope, 'common')).categories.map((c) => c.name)
    ).toEqual(names);
    raw.lane = 'personal';
    raw.owner_person_id = raw.scope.person_id;
    raw.categories.forEach((c) => {
      c.owner_person_id = raw.scope.person_id;
    });
    expect((await createPackingCategoryAggregateTransport(rpc).lane(p.command.scope, 'personal')).owner_person_id).toBe(
      raw.scope.person_id
    );
  }
});
it.each(['count', 'cursor', 'owner', 'live', 'duplicate', 'scope'])(
  'validates batch-list rows and paired cursor: %s',
  async (fault) => {
    const p = aggregateRestore();
    if (p.command.action === 'category-reorder') throw Error();
    const o = p.command.observed;
    const raw = {
      version: 3,
      kind: 'packing-category-trash',
      scope: o.scope,
      collection_revision: o.collection_revision,
      categories: [{ category: o.category, batch: o.batch, item_count: o.items.length }],
      next_cursor: null as unknown,
    };
    if (fault === 'count') raw.categories[0].item_count++;
    if (fault === 'cursor') raw.next_cursor = { id: id(999), deleted_at: o.category.deleted_at };
    if (fault === 'owner') raw.categories[0].category.owner_person_id = id(999);
    if (fault === 'live') {
      raw.categories[0].category.deleted_at = null;
      raw.categories[0].category.deleted_by_person_id = null;
    }
    if (fault === 'duplicate') raw.categories.push(structuredClone(raw.categories[0]));
    if (fault === 'scope') raw.scope.person_id = id(999);
    await expect(
      createPackingCategoryAggregateTransport(vi.fn().mockResolvedValue(raw)).batches(p.command.scope, 1)
    ).rejects.toBeDefined();
  }
);
it('preserves microsecond cursor ordering instead of rounding down to milliseconds', async () => {
  const p = aggregateRestore();
  if (p.command.action === 'category-reorder') throw Error();
  const o = p.command.observed;
  const before = { id: id(900), deleted_at: '2026-11-12T12:00:00.123456+00:00' };
  o.category.deleted_at = '2026-11-12T12:00:00.123455+00:00';
  const raw = {
    version: 3,
    kind: 'packing-category-trash',
    scope: o.scope,
    collection_revision: o.collection_revision,
    categories: [{ category: o.category, batch: o.batch, item_count: o.items.length }],
    next_cursor: null,
  };
  expect(
    (await createPackingCategoryAggregateTransport(vi.fn().mockResolvedValue(raw)).batches(p.command.scope, 1, before))
      .categories
  ).toHaveLength(1);
  o.category.deleted_at = '2026-11-12T12:00:00.123457+00:00';
  await expect(
    createPackingCategoryAggregateTransport(vi.fn().mockResolvedValue(raw)).batches(p.command.scope, 1, before)
  ).rejects.toBeDefined();
});

function required<T>(value: T | null | undefined): T {
  if (value == null) throw Error('Synthetic fact required');
  return value;
}
