import { afterEach, expect, it, vi } from 'vitest';
import { canonicalPackingRow, packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import { aggregateRestore } from '../../../tests/helpers/familyPackingCategoryAggregate';
import { categoryV2, snapshotV2 } from '../../../tests/helpers/familyPackingCategoryV2';
import { installReadOnlySession } from '../../db/readOnlySession';
import { FamilyIdentityRegistry } from './identity';
import { createPackingAggregateComposer } from './packingAggregateComposer';
import { packingCategoryKey as key } from './packingCategoryV2Contract';
import { projectPacking } from './plannerPacking';
let release: (() => void) | undefined;
afterEach(() => {
  release?.();
  release = undefined;
});
function harness() {
  const metadata = snapshotV2();
  metadata.categories = [
    categoryV2({ sort_order: 7 }),
    categoryV2({ id: id(21), name: '__proto__', sort_order: 7 }),
    categoryV2({ id: id(22), owner_person_id: metadata.scope.person_id, name: 'Gear' }),
  ];
  metadata.packing.items = [
    canonicalPackingRow({
      id: id(30),
      category: 'Gear',
      is_private: false,
      owner_person_id: null,
      bag_id: null,
      recipient_person_ids: [],
      contributor_person_ids: [],
    }),
  ];
  metadata.item_categories = [{ item_id: id(30), category_id: id(20) }];
  const ids = new FamilyIdentityRegistry(metadata.scope.user_id),
    view = projectPacking(metadata.packing, ids, [], metadata);
  let current = true,
    allowed = true,
    version = 0;
  const capture = () => ({
    packet: structuredClone(metadata.packing),
    categories: structuredClone(metadata),
    view: structuredClone(view),
    ids,
    source: 'http://127.0.0.1:55731',
    layer: 'published' as const,
    check: () => {
      if (!current) throw Error('Retired');
    },
    version,
  });
  const send = vi.fn(async (_c: ReturnType<typeof capture>, _p: unknown, check: () => void, accept: () => void) => {
    check();
    accept();
    version++;
    check();
  });
  const composer = createPackingAggregateComposer({
    capture,
    allowed: () => allowed,
    unchanged: (c) => c.version === version,
    send,
  });
  return {
    metadata,
    view,
    composer,
    send,
    trip: metadata.scope.trip_id,
    mutate: () => version++,
    deny: () => (allowed = false),
    retire: () => (current = false),
  };
}
it('orders the complete common lane including retained empty/tied ranks and raw names', async () => {
  const h = harness(),
    o = h.composer.order(h.trip, 'common', [key(id(20)), key(id(21))]);
  await o.save([key(id(21)), key(id(20))]);
  const p = h.send.mock.calls[0][1] as ReturnType<typeof aggregateRestore>;
  expect(p.command.action).toBe('category-reorder');
  expect(p.command.values).toEqual({ ordered_ids: [id(21), id(20)] });
  expect(p.command.observed).toMatchObject({
    categories: h.metadata.categories.slice(0, 2),
    lane: 'common',
    owner_person_id: null,
  });
  expect(o.current()).toBe(false);
});
it('isolates own-personal lane even for an identical common label', async () => {
  const h = harness();
  await h.composer.order(h.trip, 'personal', [key(id(22))]).save([key(id(22))]);
  expect(h.send.mock.calls[0][1]).toMatchObject({
    command: { observed: { owner_person_id: h.metadata.scope.person_id }, values: { ordered_ids: [id(22)] } },
  });
});
it.each([[], [key(id(20))], [key(id(21)), key(id(20))], [key(id(20)), key(id(22))]].map((keys) => [keys]))(
  'refuses incomplete or nonoriginal order %j before effects',
  (keys) => {
    const h = harness();
    expect(() => h.composer.order(h.trip, 'common', keys)).toThrow();
    expect(h.send).not.toHaveBeenCalled();
  }
);
it.each(['unknown', 'duplicate', 'missing'])('refuses invalid desired %s order', async (fault) => {
  const h = harness(),
    o = h.composer.order(h.trip, 'common', [key(id(20)), key(id(21))]);
  const keys = fault === 'missing' ? [key(id(20))] : [key(id(20)), key(id(fault === 'unknown' ? 80 : 20))];
  await expect(o.save(keys)).rejects.toBeDefined();
  expect(h.send).not.toHaveBeenCalled();
});
it('trash owns the exact real item set; no category/virtual IDs become items', async () => {
  const h = harness(),
    o = h.composer.trash(h.trip, key(id(20)), h.view.items);
  await o.submit({ action: 'group-trash', values: {} });
  expect(h.send.mock.calls[0][1]).toMatchObject({
    version: 3,
    command: { target_id: id(20), observed: { items: h.metadata.packing.items, batch: null }, values: {} },
  });
});
it.each(['subset', 'duplicate', 'changed', 'other'])('refuses %s rendered category before any command', (fault) => {
  const h = harness(),
    rows = structuredClone(h.view.items);
  if (fault === 'subset') rows.pop();
  if (fault === 'duplicate') rows.push(rows[0]);
  if (fault === 'changed') rows[0].name = 'changed';
  if (fault === 'other') rows[0].id = 300;
  expect(() => h.composer.trash(h.trip, key(id(20)), rows)).toThrow();
  expect(h.send).not.toHaveBeenCalled();
});
for (const kind of ['order', 'trash', 'restore'] as const) {
  function open(h: ReturnType<typeof harness>) {
    if (kind === 'order') {
      const o = h.composer.order(h.trip, 'common', [key(id(20)), key(id(21))]);
      return () => o.save([key(id(21)), key(id(20))]);
    }
    if (kind === 'trash') {
      const o = h.composer.trash(h.trip, key(id(20)), h.view.items);
      return () => o.submit({ action: 'group-trash', values: {} });
    }
    const p = aggregateRestore();
    if (p.command.action !== 'category-restore-batch') throw Error('fixture');
    p.command.observed.collection_revision = h.metadata.collection_revision;
    const o = h.composer.restore(h.trip, p.command.observed);
    return () => o.save([]);
  }
  it.each(['membership', 'publication', 'permission', 'readonly'])(
    kind + ' refuses a retired %s observation',
    async (fault) => {
      const h = harness();
      const work = open(h);
      if (fault === 'membership') h.retire();
      if (fault === 'publication') h.mutate();
      if (fault === 'permission') h.deny();
      if (fault === 'readonly') release = installReadOnlySession();
      await expect(Promise.resolve().then(work)).rejects.toBeDefined();
      expect(h.send).not.toHaveBeenCalled();
    }
  );
}
it('uncertain retry preserves UUID and full original; a changed retry cannot replace it', async () => {
  const h = harness(),
    o = h.composer.order(h.trip, 'common', [key(id(20)), key(id(21))]);
  h.send.mockImplementation(async () => {
    throw Error('lost');
  });
  await expect(o.save([key(id(21)), key(id(20))])).rejects.toThrow('lost');
  await expect(o.save([key(id(21)), key(id(20))])).rejects.toThrow('lost');
  expect(h.send.mock.calls[0][1]).toEqual(h.send.mock.calls[1][1]);
  await expect(o.save([key(id(20)), key(id(21))])).rejects.toThrow('Recover');
  expect(h.send).toHaveBeenCalledTimes(2);
});
it('slow duplicate save shares the original flight', async () => {
  const h = harness(),
    o = h.composer.order(h.trip, 'common', [key(id(20)), key(id(21))]);
  let finish = () => {};
  h.send.mockImplementation(async (_c, _p, check, accept) => {
    await new Promise<void>((r) => (finish = r));
    check();
    accept();
  });
  const a = o.save([key(id(21)), key(id(20))]),
    b = o.save([key(id(21)), key(id(20))]);
  expect(h.send).toHaveBeenCalledTimes(1);
  finish();
  await Promise.all([a, b]);
});
it('closing a slow original cannot publish a late callback', async () => {
  const h = harness(),
    o = h.composer.order(h.trip, 'common', [key(id(20)), key(id(21))]);
  let finish = () => {};
  h.send.mockImplementation(async (_c, _p, check) => {
    await new Promise<void>((r) => (finish = r));
    check();
  });
  const save = o.save([key(id(21)), key(id(20))]);
  o.close();
  finish();
  await expect(save).rejects.toThrow();
});

it('receipt confirmation retires only its original operation and allows a fresh deliberate composer', async () => {
  const h = harness(),
    o = h.composer.trash(h.trip, key(id(20)), h.view.items);
  h.send.mockImplementation(async () => {
    throw Error('lost');
  });
  await expect(o.submit({ action: 'group-trash', values: {} })).rejects.toThrow('lost');
  const p = h.send.mock.calls[0][1] as ReturnType<typeof aggregateRestore>;
  h.composer.confirmed(p.command.operation_id);
  expect(o.settled?.()).toBe(true);
  expect(o.current()).toBe(false);
  const next = h.composer.trash(h.trip, key(id(20)), h.view.items);
  expect(next.settled?.()).toBe(false);
  await expect(next.submit({ action: 'group-trash', values: {} })).rejects.toThrow('lost');
  expect(h.send.mock.calls[1][1]).not.toMatchObject({ command: { operation_id: p.command.operation_id } });
});
