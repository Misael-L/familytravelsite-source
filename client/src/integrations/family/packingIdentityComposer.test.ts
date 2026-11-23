import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalPackingRow, packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import { categoryV2, snapshotV2 } from '../../../tests/helpers/familyPackingCategoryV2';
import { installReadOnlySession } from '../../db/readOnlySession';
import { FamilyIdentityRegistry } from './identity';
import type { PackingCategoryReadPacket } from './packingCategoryPresentation';
import { packingCategoryKey, packingCategorySnapshotV2, packingCategoryV2Envelope } from './packingCategoryV2Contract';
import { createPackingIdentityComposer, identityCategory } from './packingIdentityComposer';
import { projectPacking } from './plannerPacking';

let releaseReadOnly: (() => void) | undefined;
afterEach(() => {
  releaseReadOnly?.();
  releaseReadOnly = undefined;
  vi.restoreAllMocks();
});

function harness(input = snapshotV2()) {
  const canonical = packingCategorySnapshotV2.parse(input);
  const state = {
    source: 'http://127.0.0.1:55631',
    loggedIn: true,
    active: true,
    allowed: true,
    view: 'common' as 'common' | 'personal',
    layer: 'published' as 'published' | 'myDraft',
  };
  const ids = new FamilyIdentityRegistry(canonical.scope.user_id);
  const projection = projectPacking(canonical.packing, ids, [], canonical);
  const capture = vi.fn((trip: number | string) => {
    if (trip !== canonical.scope.trip_id) throw Error('Wrong Trip');
    const source = state.source,
      view = state.view,
      layer = state.layer;
    const check = vi.fn(() => {
      if (!state.active || !state.loggedIn || state.source !== source || state.view !== view || state.layer !== layer)
        throw Error('Captured context retired');
    });
    check();
    return {
      packet: structuredClone(canonical.packing),
      categories: structuredClone(canonical) as PackingCategoryReadPacket | null,
      ids,
      source,
      layer,
      check,
    };
  });
  const send = vi.fn(
    async (
      _c: ReturnType<typeof capture>,
      _p: import('./packingCategoryV2Contract').PackingCategoryV2Envelope,
      check: () => void
    ) => {
      check();
      return projection;
    }
  );
  const composer = createPackingIdentityComposer({ capture, allowed: () => state.allowed, send });
  return { canonical, state, capture, send, composer, projection, trip: canonical.scope.trip_id };
}
function fixedIds() {
  vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce('a0bc0000-0000-4000-8000-000000000100')
    .mockReturnValueOnce('a0bc0000-0000-4000-8000-000000000101');
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function commandBase(h: ReturnType<typeof harness>) {
  return {
    version: 2,
    operation_id: id(100),
    scope: h.canonical.scope,
    expected_collection_revision: h.canonical.collection_revision,
  };
}
function personalSnapshot() {
  const p = snapshotV2();
  p.categories[0] = categoryV2({ owner_person_id: p.scope.person_id });
  p.people = [{ id: p.scope.person_id, display_name: 'Owner', is_guest: false, eligible: true }];
  return p;
}
function foreignSnapshot() {
  const p = snapshotV2(),
    peer = id(70);
  p.categories.push(categoryV2({ id: id(21), owner_person_id: peer }));
  p.packing.items = [
    canonicalPackingRow({
      id: id(30),
      trip_id: p.scope.trip_id,
      owner_person_id: peer,
      category: 'Gear',
      bag_id: null,
      recipient_person_ids: [p.scope.person_id],
      contributor_person_ids: [],
    }),
  ];
  p.packing.unassigned_weight_grams = 1050;
  p.item_categories = [{ item_id: id(30), category_id: id(21) }];
  p.people = [{ id: peer, display_name: 'Peer', is_guest: false, eligible: true }];
  return p;
}

describe('original category identity composers', () => {
  it.each(['common', 'personal'] as const)('creates an exact original %s v2 lifecycle intent', async (view) => {
    fixedIds();
    const h = harness();
    h.state.view = view;
    const original = structuredClone(h.canonical),
      c = h.composer.create(h.trip, view);
    h.canonical.collection_revision++;
    h.canonical.packing.collection_revision++;
    h.canonical.categories[0].name = 'Later observation';
    await c.save('\tGear\t');
    expect(h.capture).toHaveBeenCalledTimes(1);
    expect(h.send).toHaveBeenCalledTimes(1);
    const packet = h.send.mock.calls[0][1];
    expect(packet).toEqual({
      version: 2,
      source_url: h.state.source,
      view_layer: 'published',
      command: {
        ...commandBase({ ...h, canonical: original }),
        kind: 'packing-category-lifecycle',
        action: 'category-create',
        target_id: id(101),
        observed_category: null,
        values: { name: '\tGear\t', visibility: view },
      },
    });
    expect(packingCategoryV2Envelope.parse(packet)).toEqual(packet);
  });
  it.each([snapshotV2, personalSnapshot])(
    'fills the exact observed category without routing by its current label',
    async (factory) => {
      fixedIds();
      const h = harness(factory()),
        original = structuredClone(h.canonical),
        c = h.composer.fill(h.trip, packingCategoryKey(id(20)));
      h.canonical.categories[0].name = 'Renamed elsewhere';
      h.canonical.categories[0].revision++;
      await c.save('...');
      expect(h.send.mock.calls[0][1]).toEqual({
        version: 2,
        source_url: h.state.source,
        view_layer: 'published',
        original_item: null,
        original_category_id: null,
        command: {
          ...commandBase(h),
          kind: 'packing-category-item',
          action: 'category-item-create',
          target_id: id(101),
          expected_revision: null,
          category_id: id(20),
          observed_category: original.categories[0],
          values: { name: '...' },
        },
      });
    }
  );
  it('dismisses an empty card with one exact lifecycle intent and no item intent', async () => {
    fixedIds();
    const h = harness(),
      original = structuredClone(h.canonical.categories[0]);
    const c = h.composer.dismiss(h.trip, packingCategoryKey(id(20)));
    await c.submit({ action: 'group-trash', values: {} });
    expect(h.send.mock.calls[0][1]).toEqual({
      version: 2,
      source_url: h.state.source,
      view_layer: 'published',
      command: {
        ...commandBase(h),
        kind: 'packing-category-lifecycle',
        action: 'category-dismiss-empty',
        target_id: id(20),
        observed_category: original,
        values: {},
      },
    });
    expect(h.send).toHaveBeenCalledTimes(1);
  });
  it('coalesces concurrent identical submits and refuses a changed in-flight intent', async () => {
    const h = harness(),
      wait = deferred<typeof h.projection>();
    h.send.mockReturnValueOnce(wait.promise);
    const c = h.composer.fill(h.trip, packingCategoryKey(id(20)));
    const first = c.save('Passport'),
      second = c.save('Passport');
    await expect(c.save('Changed passport')).rejects.toThrow('original category save');
    expect(h.send).toHaveBeenCalledTimes(1);
    wait.resolve(h.projection);
    await Promise.all([first, second]);
    await expect(c.save('Passport')).rejects.toThrow('already completed');
    expect(h.send).toHaveBeenCalledTimes(1);
  });
  it.each(['create', 'fill'] as const)(
    'retries an uncertain %s with unchanged operation, target, values and original metadata',
    async (kind) => {
      const h = harness();
      h.send.mockRejectedValueOnce(Error('Lost reply after possible commit'));
      const c =
        kind === 'create' ? h.composer.create(h.trip, 'common') : h.composer.fill(h.trip, packingCategoryKey(id(20)));
      await expect(c.save('Passport')).rejects.toThrow('Lost reply');
      const original = structuredClone(h.send.mock.calls[0][1]);
      h.canonical.categories[0].revision++;
      h.canonical.collection_revision++;
      h.canonical.packing.collection_revision++;
      await expect(c.save('Changed passport')).rejects.toThrow('original category save');
      expect(h.send).toHaveBeenCalledTimes(1);
      await c.save('Passport');
      expect(h.capture).toHaveBeenCalledTimes(1);
      expect(h.send).toHaveBeenCalledTimes(2);
      expect(h.send.mock.calls[1][1]).toEqual(original);
    }
  );
  it.each(['close', 'source', 'logout', 'view', 'layer', 'readonly', 'denied'] as const)(
    'refuses %s retirement before effects and after an outstanding reply',
    async (change) => {
      for (const pending of [false, true]) {
        const h = harness(),
          wait = deferred<typeof h.projection>();
        const c = h.composer.fill(h.trip, packingCategoryKey(id(20)));
        if (pending) h.send.mockReturnValueOnce(wait.promise);
        const flight = pending ? c.save('Passport') : null;
        const refusal = flight !== null ? expect(flight).rejects.toBeDefined() : null;
        if (change === 'close') c.close();
        if (change === 'source') h.state.source = 'http://127.0.0.1:55331';
        if (change === 'logout') h.state.loggedIn = false;
        if (change === 'view') h.state.view = 'personal';
        if (change === 'layer') h.state.layer = 'myDraft';
        if (change === 'readonly') releaseReadOnly = installReadOnlySession();
        if (change === 'denied') h.state.allowed = false;
        expect(c.current()).toBe(false);
        await expect(c.save('Passport')).rejects.toBeDefined();
        if (pending) {
          wait.resolve(h.projection);
          await refusal;
        }
        expect(h.send).toHaveBeenCalledTimes(pending ? 1 : 0);
        releaseReadOnly?.();
        releaseReadOnly = undefined;
      }
    }
  );
  it('refuses opening in a saved read-only session before capture or send', () => {
    const h = harness();
    releaseReadOnly = installReadOnlySession();
    expect(() => h.composer.create(h.trip, 'common')).toThrow('read only');
    expect(() => h.composer.fill(h.trip, packingCategoryKey(id(20)))).toThrow('read only');
    expect(() => h.composer.dismiss(h.trip, packingCategoryKey(id(20)))).toThrow('read only');
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });
  it('refuses a foreign same-label category rather than choosing the writable common one', () => {
    const h = harness(foreignSnapshot());
    expect(() => h.composer.fill(h.trip, packingCategoryKey(id(21)))).toThrow('not writable');
    expect(() => h.composer.dismiss(h.trip, packingCategoryKey(id(21)))).toThrow('not writable');
    expect(h.send).not.toHaveBeenCalled();
  });
  it('refuses nonempty dismissal, unknown and virtual category identities before sending', () => {
    const p = foreignSnapshot();
    p.categories[1].owner_person_id = p.scope.person_id;
    p.packing.items[0].owner_person_id = p.scope.person_id;
    p.people = [{ id: p.scope.person_id, display_name: 'Owner', is_guest: false, eligible: true }];
    const h = harness(p);
    expect(() => h.composer.dismiss(h.trip, packingCategoryKey(id(21)))).toThrow('Nonempty');
    for (const key of ['Gear', packingCategoryKey(id(999)), `virtual-packing-category:${id(20)}`])
      expect(() => h.composer.fill(h.trip, key)).toThrow();
    expect(h.send).not.toHaveBeenCalled();
  });
  it.each(['missing', 'v1', 'draft', 'denied'] as const)('requires current v2 authoring, refusing %s', (change) => {
    const h = harness();
    if (change === 'draft') h.state.layer = 'myDraft';
    if (change === 'denied') h.state.allowed = false;
    if (change === 'missing' || change === 'v1') {
      const capture = h.capture.getMockImplementation();
      if (!capture) throw Error('Missing capture implementation');
      h.capture.mockImplementation((trip) => {
        const c = capture(trip);
        c.categories =
          change === 'missing' ? null : ({ ...h.canonical, version: 1 } as unknown as PackingCategoryReadPacket);
        return c;
      });
    }
    expect(() => h.composer.create(h.trip, 'common')).toThrow();
    expect(h.send).not.toHaveBeenCalled();
  });
  it('refuses unsupported dismissal intents before any send', async () => {
    const h = harness(),
      c = h.composer.dismiss(h.trip, packingCategoryKey(id(20)));
    await expect(c.submit({ action: 'group-packed-state', values: { checked: true } })).rejects.toThrow(
      'dismissal only'
    );
    await expect(c.submit({ action: 'clear-completed', values: {} })).rejects.toThrow('dismissal only');
    expect(h.send).not.toHaveBeenCalled();
  });
  it('uses a stable ID for raw empty versus literal Other and never resolves a raw label', async () => {
    const p = snapshotV2();
    p.categories = [categoryV2({ name: '' }), categoryV2({ id: id(21), name: 'Other', sort_order: 1 })];
    const h = harness(p);
    for (const category of h.canonical.categories) {
      const c = h.composer.fill(h.trip, packingCategoryKey(category.id));
      await c.save('Real item');
      expect(h.send.mock.calls[h.send.mock.calls.length - 1]?.[1].command).toMatchObject({
        category_id: category.id,
        observed_category: category,
      });
    }
    expect(() => identityCategory(h.capture(h.trip), 'Other')).toThrow();
  });
});
