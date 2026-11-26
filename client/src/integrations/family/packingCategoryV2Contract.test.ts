import { describe, expect, it, vi } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import { ackV2, categoryV2, itemV2, lifecycleV2, snapshotV2 } from '../../../tests/helpers/familyPackingCategoryV2';
import { packingCategoryEnvelope, packingCategoryPacket } from './packingCategoryContract';
import {
  packingCategoryKey,
  packingCategorySnapshotV2,
  packingCategoryV2Envelope,
  packingItemKey,
} from './packingCategoryV2Contract';
import {
  checkPackingCategorySnapshotV2,
  checkPackingCategoryV2Acknowledgement,
  createPackingCategoryV2Transport,
  type PackingCategoryV2Rpc,
} from './packingCategoryV2Transport';

describe('strict separate category v2 protocols', () => {
  it('accepts retained empty cards without relaxing v1 or mixing item/category identities', () => {
    const p = snapshotV2();
    expect(checkPackingCategorySnapshotV2(p, p.scope)).toEqual(p);
    expect(packingCategoryPacket.safeParse({ ...p, version: 1 }).success).toBe(false);
    expect(packingCategoryEnvelope.safeParse(lifecycleV2()).success).toBe(false);
    expect(packingCategoryKey(id(30))).not.toBe(packingItemKey(id(30)));
    expect(() => packingCategoryKey('virtual:Gear')).toThrow();
  });
  it.each([
    'version',
    'unknown',
    'unsafe',
    'boolean',
    'extra-category',
    'unretained-empty',
    'foreign-empty',
    'duplicate',
    'trash',
    'trip',
    'people',
    'links',
    'scope',
    'collection',
    'assignment-map',
    'assignment-pair',
    'assignment-order',
  ])('rejects invalid active packet: %s', (kind) => {
    const p = snapshotV2();
    if (kind === 'version') Object.assign(p, { version: 1 });
    if (kind === 'unknown') Object.assign(p, { surprise: true });
    if (kind === 'unsafe') p.categories[0].sort_order = Number.MAX_SAFE_INTEGER + 1;
    if (kind === 'boolean') Object.assign(p.categories[0], { retained_when_empty: 'true' });
    if (kind === 'extra-category') Object.assign(p.categories[0], { display_name: 'extra' });
    if (kind === 'unretained-empty') p.categories[0].retained_when_empty = false;
    if (kind === 'foreign-empty') {
      p.categories[0].owner_person_id = id(700);
      p.people = [{ id: id(700), display_name: 'Peer', is_guest: false, eligible: true }];
    }
    if (kind === 'duplicate') p.categories.push(structuredClone(p.categories[0]));
    if (kind === 'trash') {
      p.categories[0].deleted_at = p.categories[0].created_at;
      p.categories[0].deleted_by_person_id = p.scope.person_id;
    }
    if (kind === 'trip') p.categories[0].trip_id = id(700);
    if (kind === 'people') p.people.push({ id: id(700), display_name: 'Extra', is_guest: true, eligible: false });
    if (kind === 'links') p.item_categories.push({ item_id: id(700), category_id: id(20) });
    if (kind === 'scope') p.scope.person_id = id(700);
    if (kind === 'collection') p.collection_revision++;
    if (kind.startsWith('assignment')) {
      p.categories[0].assignments = [{ person_id: p.scope.person_id, assigned_at: null, assigned_by_person_id: null }];
      p.people = [{ id: p.scope.person_id, display_name: 'Historical', is_guest: true, eligible: false }];
      if (kind !== 'assignment-map') p.packing.category_assignees.Gear = [p.scope.person_id];
      if (kind === 'assignment-pair') p.categories[0].assignments[0].assigned_by_person_id = p.scope.person_id;
      if (kind === 'assignment-order')
        p.categories[0].assignments.push(structuredClone(p.categories[0].assignments[0]));
    }
    expect(() => checkPackingCategorySnapshotV2(p, snapshotV2().scope)).toThrow();
  });
  it('orders by owner lane and rank, preserves raw empty versus literal Other, historical people and provenance', () => {
    const p = snapshotV2();
    p.categories = [
      categoryV2({ id: id(90), name: '', sort_order: 0 }),
      categoryV2({ id: id(10), name: 'Other', sort_order: 1 }),
      categoryV2({ id: id(15), name: 'Other', sort_order: 0, owner_person_id: p.scope.person_id }),
    ];
    p.people = [{ id: p.scope.person_id, display_name: 'Former traveler', is_guest: true, eligible: false }];
    expect(packingCategorySnapshotV2.parse(p).categories.map((c) => c.name)).toEqual(['', 'Other', 'Other']);
    p.categories.reverse();
    expect(packingCategorySnapshotV2.safeParse(p).success).toBe(false);
  });
  it.each([
    'version',
    'kind',
    'virtual',
    'deleted',
    'owner',
    'trip',
    'extra',
    'privacy-field',
    'bad-quantity',
    'both-packed',
    'unsafe',
    'draft',
    'unpaired-null',
  ])('rejects invalid original item command %s before RPC', async (kind) => {
    const p = itemV2();
    if (kind === 'version') Object.assign(p.command, { version: 1 });
    if (kind === 'kind') Object.assign(p.command, { kind: 'packing-category' });
    if (kind === 'virtual') p.command.category_id = 'virtual:Gear';
    if (kind === 'deleted') {
      p.command.observed_category.deleted_at = categoryV2().created_at;
      p.command.observed_category.deleted_by_person_id = p.command.scope.person_id;
    }
    if (kind === 'owner') p.command.observed_category.owner_person_id = id(999);
    if (kind === 'trip') p.command.observed_category.trip_id = id(999);
    if (kind === 'extra') Object.assign(p, { original_items: [] });
    if (kind === 'privacy-field') Object.assign(p.command.values, { visibility: 'personal' });
    if (kind === 'bad-quantity') Object.assign(p.command.values, { packed_quantity: 4 });
    if (kind === 'both-packed') Object.assign(p.command.values, { checked: false });
    if (kind === 'unsafe') p.command.expected_collection_revision = Number.MAX_SAFE_INTEGER + 1;
    if (kind === 'draft') Object.assign(p, { view_layer: 'myDraft' });
    if (kind === 'unpaired-null') p.original_category_id = id(20);
    const rpc = vi.fn<PackingCategoryV2Rpc>();
    await expect(createPackingCategoryV2Transport(rpc).execute(p)).rejects.toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('keeps PG space-only trimming and raw scalar names, rejects empty new names and invalid text', () => {
    for (const name of [' ', '', '\0', '\ud800', 'x'.repeat(201)]) {
      const p = lifecycleV2();
      Object.assign(p.command.values, { name });
      expect(packingCategoryV2Envelope.safeParse(p).success).toBe(false);
    }
    const p = lifecycleV2();
    Object.assign(p.command.values, { name: '\t' });
    expect(packingCategoryV2Envelope.safeParse(p).success).toBe(true);
  });
  it.each([lifecycleV2, itemV2])('retains exact typed args and rejects forged commitments', async (factory) => {
    const original = factory(),
      rpc = vi.fn<PackingCategoryV2Rpc>().mockResolvedValue(ackV2(original));
    const transport = createPackingCategoryV2Transport(rpc);
    await transport.execute(original);
    const args = rpc.mock.calls[0][1];
    expect(args).toEqual({
      p_trip_id: original.command.scope.trip_id,
      p_operation_id: original.command.operation_id,
      p_scope: original.command.scope,
      p_action: original.command.action,
      p_target_id: original.command.target_id,
      p_expected_collection_revision: original.command.expected_collection_revision,
      p_observed_category: original.command.observed_category,
      p_values: original.command.values,
      ...(original.command.kind === 'packing-category-item'
        ? { p_category_id: original.command.category_id, p_expected_revision: original.command.expected_revision }
        : {}),
    });
    for (const field of [
      'operation',
      'scope',
      'category',
      'owner',
      'revision',
      'values',
      'collection',
      'changed',
      'extra',
      'kind',
    ]) {
      const a = ackV2(original);
      if (field === 'operation') a.operation_id = id(999);
      if (field === 'scope') a.scope = { ...a.scope, trip_lifecycle_revision: 99 };
      if (field === 'category') a.category.id = id(999);
      if (field === 'owner') a.category.owner_person_id = id(999);
      if (field === 'revision') a.category.revision += 3;
      if (field === 'values') Object.assign(a, { values: { name: 'Replacement' } });
      if (field === 'collection') a.collection_revision = original.command.expected_collection_revision;
      if (field === 'changed') a.changed = false;
      if (field === 'extra') Object.assign(a, { optimistic: true });
      if (field === 'kind') Object.assign(a, { kind: 'packing-group' });
      expect(() => checkPackingCategoryV2Acknowledgement(a, original), field).toThrow();
    }
  });
  it.each(['category-retain', 'category-dismiss-empty', 'category-restore-empty'] as const)(
    'validates exact lifecycle facts and no-op retain: %s',
    (action) => {
      const p = lifecycleV2();
      p.command = { ...p.command, action, target_id: id(20), observed_category: categoryV2(), values: {} };
      if (action === 'category-restore-empty') {
        required(p.command.observed_category).deleted_at = categoryV2().created_at;
        required(p.command.observed_category).deleted_by_person_id = p.command.scope.person_id;
      }
      const a = ackV2(p);
      expect(checkPackingCategoryV2Acknowledgement(a, p)).toEqual(a);
      a.category.sort_order++;
      expect(() => checkPackingCategoryV2Acknowledgement(a, p)).toThrow();
    }
  );
  it.each([true, false])('move preserves item identity/content and handles same-ID no-op=%s', (noop) => {
    const p = itemV2(),
      old = ackV2(p);
    if (old.kind !== 'packing-category-item') throw Error();
    p.original_item = old.item;
    p.original_category_id = noop ? id(20) : id(19);
    p.command = { ...p.command, action: 'category-item-move', expected_revision: old.item.revision, values: {} };
    const a = ackV2(p);
    expect(checkPackingCategoryV2Acknowledgement(a, p)).toEqual(a);
    if (a.kind !== 'packing-category-item') throw Error();
    a.item.quantity++;
    expect(() => checkPackingCategoryV2Acknowledgement(a, p)).toThrow();
    p.original_item.is_private = true;
    p.original_item.owner_person_id = p.command.scope.person_id;
    expect(packingCategoryV2Envelope.safeParse(p).success).toBe(false);
  });
  it.each(['42501', 'PGRST301', 'PT409', '22023', '23503', '54000', '0A000'])(
    'maps SQL refusal %s without fallback',
    async (code) => {
      const rpc = vi.fn<PackingCategoryV2Rpc>().mockRejectedValue({ code });
      await expect(createPackingCategoryV2Transport(rpc).execute(itemV2())).rejects.toHaveProperty(
        'status',
        { '42501': 403, PGRST301: 401, PT409: 409, '22023': 400, '23503': 422, '54000': 413, '0A000': 422 }[code]
      );
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  );
});

describe('separate lookup/Trash/receipt reads', () => {
  it('looks up exact raw default and Trash metadata without hiding reserved identities', async () => {
    const p = snapshotV2(),
      c = categoryV2({ name: '', retained_when_empty: false });
    const rpc = vi
      .fn<PackingCategoryV2Rpc>()
      .mockResolvedValue({ version: 2, scope: p.scope, collection_revision: 1, category: c });
    expect((await createPackingCategoryV2Transport(rpc).lookup(p.scope, 'common', '')).category).toEqual(c);
    expect(rpc.mock.calls[0][1]).toEqual({ p_trip_id: p.scope.trip_id, p_visibility: 'common', p_name: '' });
    await expect(createPackingCategoryV2Transport(rpc).lookup(p.scope, 'common', 'Other')).rejects.toBeDefined();
  });
  it('carries the exact microsecond Trash cursor into the next page', async () => {
    const { scope } = snapshotV2();
    const cursor = { id: id(20), deleted_at: '2026-11-12T00:00:00.000002+00:00' };
    const newer = categoryV2({ ...cursor, deleted_by_person_id: scope.person_id });
    // The older entry shares the same millisecond and would sort first by ID.
    const older = categoryV2({
      id: id(21),
      deleted_at: '2026-11-12T00:00:00.000001+00:00',
      deleted_by_person_id: scope.person_id,
    });
    const page = {
      version: 2,
      kind: 'packing-category-trash',
      scope,
      collection_revision: 1,
      categories: [newer],
      next_cursor: cursor,
    };
    const rpc = vi
      .fn<PackingCategoryV2Rpc>()
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce({ ...page, categories: [older], next_cursor: null });
    const transport = createPackingCategoryV2Transport(rpc);

    const first = await transport.trash(scope, 1);
    expect(first.next_cursor).toEqual(cursor);
    const last = await transport.trash(scope, 1, first.next_cursor);
    expect(last.categories).toEqual([older]);
    expect(last.next_cursor).toBeNull();
    expect(rpc).toHaveBeenNthCalledWith(2, 'list_family_trip_packing_category_trash_v2', {
      p_trip_id: scope.trip_id,
      p_limit: 1,
      p_before_deleted_at: cursor.deleted_at,
      p_before_id: cursor.id,
    });
  });
  it('rejects repeated or mismatched Trash cursors and invalid page sizes', async () => {
    const p = snapshotV2();
    const cursor = { id: id(20), deleted_at: '2026-11-12T00:00:00.000001+00:00' };
    const c = categoryV2({ ...cursor, deleted_by_person_id: p.scope.person_id });
    const page = {
      version: 2,
      kind: 'packing-category-trash',
      scope: p.scope,
      collection_revision: 1,
      categories: [c],
      next_cursor: cursor,
    };
    const rpc = vi.fn<PackingCategoryV2Rpc>().mockResolvedValue(page),
      t = createPackingCategoryV2Transport(rpc);
    const invalid = { code: 'invalid_packing_category_v2_response' };
    await expect(t.trash(p.scope, 1, cursor)).rejects.toMatchObject(invalid);
    await expect(t.trash(p.scope, 0)).rejects.toBeDefined();
    expect(rpc).toHaveBeenCalledTimes(1);

    rpc.mockResolvedValueOnce({ ...page, next_cursor: { ...cursor, id: id(999) } });
    await expect(t.trash(p.scope, 1)).rejects.toMatchObject(invalid);
    rpc.mockResolvedValueOnce({ ...page, next_cursor: { ...cursor, deleted_at: '2026-11-12T00:00:00.000000+00:00' } });
    await expect(t.trash(p.scope, 1)).rejects.toMatchObject(invalid);
  });
  for (const factory of [lifecycleV2, itemV2]) {
    it.each(['unknown', 'visible', 'redacted'] as const)(
      `${factory.name} current-authority %s receipt never executes`,
      async (proof) => {
        const p = factory(),
          r = {
            version: 2,
            kind: p.command.kind,
            trip_id: p.command.scope.trip_id,
            operation_id: p.command.operation_id,
            scope: { ...p.command.scope, trip_lifecycle_revision: p.command.scope.trip_lifecycle_revision + 1 },
            status: proof === 'unknown' ? 'unknown' : 'committed',
            result_redacted: proof === 'redacted',
            result: proof === 'visible' ? ackV2(p) : null,
          };
        const rpc = vi.fn<PackingCategoryV2Rpc>().mockResolvedValue(r);
        expect(await createPackingCategoryV2Transport(rpc).receipt(p)).toEqual(r);
        expect(rpc).toHaveBeenCalledTimes(1);
        for (const bad of [
          { ...r, kind: 'packing-category' },
          { ...r, operation_id: id(999) },
          { ...r, status: 'unknown', result_redacted: true },
          { ...r, status: 'committed', result_redacted: false, result: null },
        ]) {
          rpc.mockResolvedValueOnce(bad);
          await expect(createPackingCategoryV2Transport(rpc).receipt(p)).rejects.toBeDefined();
        }
      }
    );
  }
});

describe('category identity and retention edge cases', () => {
  it('rejects two real identities occupying the same raw owner/name lane', () => {
    const p = snapshotV2();
    p.categories.push(categoryV2({ id: id(22), sort_order: 1 }));
    expect(packingCategorySnapshotV2.safeParse(p).success).toBe(false);
  });
  it('fills an unretained target by ID while preserving its label, owner and assignment provenance', () => {
    const p = itemV2();
    p.command.observed_category.retained_when_empty = false;
    const a = ackV2(p);
    expect(checkPackingCategoryV2Acknowledgement(a, p)).toEqual(a);
    expect(a.category.retained_when_empty).toBe(true);
    expect(a.category.revision).toBe(2);
  });
  it('clones exact original facts before a delayed RPC can observe caller mutation', async () => {
    const p = itemV2(),
      original = structuredClone(p);
    let resolve!: (value: unknown) => void;
    const rpc = vi.fn<PackingCategoryV2Rpc>(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    const pending = createPackingCategoryV2Transport(rpc).execute(p);
    p.command.observed_category.name = 'Different generation';
    p.command.expected_collection_revision++;
    resolve(ackV2(original));
    expect(await pending).toEqual(ackV2(original));
    expect(rpc.mock.calls[0][1].p_observed_category).toEqual(original.command.observed_category);
  });
});

function required<T>(value: T | null | undefined): T {
  if (value == null) throw Error('Required original observation missing');
  return value;
}

it('refuses item values beyond the qualified v1 64KiB bound before retaining or sending them', async () => {
  const p = itemV2();
  Object.assign(p.command.values, { name: ' '.repeat(65536) + 'x' });
  const rpc = vi.fn<PackingCategoryV2Rpc>();
  await expect(createPackingCategoryV2Transport(rpc).execute(p)).rejects.toBeDefined();
  expect(rpc).not.toHaveBeenCalled();
});
