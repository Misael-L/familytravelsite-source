import { describe, expect, it } from 'vitest';
import { canonicalPackingRow, packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import { categoryV2, snapshotV2 } from '../../../tests/helpers/familyPackingCategoryV2';
import { groupByCategory, packingCsv, packingMarkdown } from '../../components/Packing/packingExport';
import {
  groupPackingItems,
  isPackingPlaceholder,
  packingCategoryOrder,
  packingGroupKey,
  packingItemWeight,
  packingProgress,
  packingStatusFiltered,
  packingViewItems,
} from '../../components/Packing/packingListModel';
import {
  assertRealPackingItems,
  assertRealPackingValue,
  packingCategoryId,
} from '../../repo/packingCategoryPresentation';
import type { PackingItem } from '../../types';
import { FamilyIdentityRegistry } from './identity';
import { observePackingCategoryForWrite, packingCategoryPresentation } from './packingCategoryPresentation';
import { categoryV1Facts, packingCategoryKey, packingCategorySnapshotV2 } from './packingCategoryV2Contract';
import { projectPacking } from './plannerPacking';

function fixture() {
  const p = snapshotV2(),
    own = p.scope.person_id,
    peer = id(70),
    guest = id(71),
    author = id(72);
  p.categories = [
    categoryV2({ name: '' }),
    categoryV2({ id: id(21), name: 'Other', sort_order: 1 }),
    categoryV2({
      id: id(22),
      name: 'Gear',
      sort_order: 2,
      assignments: [{ person_id: guest, assigned_at: p.categories[0].created_at, assigned_by_person_id: author }],
    }),
    categoryV2({ id: id(23), name: 'Other', owner_person_id: own }),
    categoryV2({ id: id(25), name: 'Empty', owner_person_id: own, sort_order: 1 }),
    categoryV2({ id: id(24), name: 'Other', owner_person_id: peer }),
  ];
  p.packing.items = [
    canonicalPackingRow({
      id: id(100),
      trip_id: p.scope.trip_id,
      name: 'Boots',
      category: '',
      quantity: 2,
      packed_quantity: 1,
      weight_grams: 100,
      sort_order: 0,
      bag_id: null,
      is_private: false,
      owner_person_id: null,
      recipient_person_ids: [],
      contributor_person_ids: [],
    }),
    canonicalPackingRow({
      id: id(101),
      trip_id: p.scope.trip_id,
      name: 'Passport',
      category: 'Other',
      quantity: 1,
      checked: true,
      packed_quantity: null,
      weight_grams: 0,
      sort_order: 1,
      bag_id: null,
      is_private: false,
      owner_person_id: null,
      recipient_person_ids: [],
      contributor_person_ids: [],
    }),
    canonicalPackingRow({
      id: id(102),
      trip_id: p.scope.trip_id,
      name: '...',
      category: 'Other',
      quantity: 1,
      packed_quantity: null,
      weight_grams: 50,
      sort_order: 2,
      bag_id: null,
      owner_person_id: own,
      recipient_person_ids: [],
      contributor_person_ids: [],
    }),
    canonicalPackingRow({
      id: id(103),
      trip_id: p.scope.trip_id,
      name: 'Peer item',
      category: 'Other',
      quantity: 1,
      packed_quantity: null,
      weight_grams: 100,
      sort_order: 3,
      bag_id: null,
      owner_person_id: peer,
      recipient_person_ids: [own],
      contributor_person_ids: [],
    }),
  ];
  p.packing.unassigned_weight_grams = 1000;
  p.packing.category_assignees = { Gear: [guest] };
  p.item_categories = [20, 21, 23, 24].map((category, n) => ({ item_id: id(100 + n), category_id: id(category) }));
  p.people = [own, peer, guest, author].map((person) => ({
    id: person,
    display_name: 'Person ' + person,
    is_guest: person === guest,
    eligible: person === own,
  }));
  const packet = packingCategorySnapshotV2.parse(p),
    ids = new FamilyIdentityRegistry(p.scope.user_id);
  const projected = projectPacking(
    packet.packing,
    ids,
    packet.people.map((x) => ({ personId: x.id, displayName: x.display_name })),
    packet
  );
  const cards = packingCategoryPresentation(packet);
  return { packet, projected, cards };
}

describe('pure category identity presentation and model', () => {
  it('keeps raw empty, literal Other and equal owner labels as separate stable cards', () => {
    const { cards } = fixture();
    expect(cards.map((c) => c.key)).toEqual([20, 21, 22, 23, 25, 24].map((n) => packingCategoryKey(id(n))));
    expect(cards.filter((c) => c.rawName === 'Other')).toHaveLength(3);
    expect(new Set(cards.map((c) => c.key)).size).toBe(6);
    expect(cards.find((c) => c.id === id(24))).toMatchObject({ owned: false, ownerPersonId: id(70) });
    expect(cards.find((c) => c.id === id(23))).toMatchObject({ owned: true });
  });
  it('projects only real stored items and metadata-only empty cards without modifying canonical facts', () => {
    const { packet, projected, cards } = fixture(),
      before = structuredClone(packet);
    expect(projected.items).toHaveLength(4);
    expect(projected.categoryViews).toEqual(cards);
    expect(cards.filter((c) => c.placeholder).map((c) => c.id)).toEqual([id(22), id(25)]);
    for (const c of cards.filter((c) => c.placeholder))
      expect(c.placeholder).toEqual({ kind: 'virtual-category', key: `virtual-packing-category:${c.id}` });
    expect(projected.items.map(packingCategoryId)).toEqual([20, 21, 23, 24].map(id));
    packingCategoryPresentation(packet);
    groupPackingItems(
      packingViewItems(projected.items, 'common'),
      'all',
      'Other',
      cards.filter((c) => c.ownerPersonId === null)
    );
    expect(packet).toEqual(before);
  });
  it('groups equal displayed defaults by ID and preserves independent personal-owner read-only state', () => {
    const { projected, cards } = fixture();
    const common = groupPackingItems(
      packingViewItems(projected.items, 'common'),
      'all',
      'Other',
      cards.filter((c) => c.ownerPersonId === null)
    );
    expect(common.map((g) => [packingGroupKey(g), g.category, g.items.length])).toEqual([
      [packingCategoryKey(id(20)), 'Other', 1],
      [packingCategoryKey(id(21)), 'Other', 1],
      [packingCategoryKey(id(22)), 'Gear', 0],
    ]);
    const personal = groupPackingItems(
      packingViewItems(projected.items, 'personal'),
      'all',
      'Other',
      cards.filter((c) => c.ownerPersonId !== null)
    );
    expect(personal.map((g) => [packingGroupKey(g), g.items.length, g.readOnly])).toEqual([
      [packingCategoryKey(id(23)), 1, false],
      [packingCategoryKey(id(25)), 0, false],
      [packingCategoryKey(id(24)), 1, true],
    ]);
  });
  it('filters real rows without replacing a filtered-out occupied category with an empty card', () => {
    const { projected, cards } = fixture(),
      commonCards = cards.filter((c) => c.ownerPersonId === null);
    const common = packingViewItems(projected.items, 'common');
    expect(groupPackingItems(common, 'open', 'Other', commonCards).map(packingGroupKey)).toEqual([
      packingCategoryKey(id(20)),
      packingCategoryKey(id(22)),
    ]);
    const done = groupPackingItems(common, 'done', 'Other', commonCards);
    expect(done.map(packingGroupKey)).toEqual([packingCategoryKey(id(21))]);
    expect(done[0].placeholder).toBeNull();
    expect(packingCategoryOrder(common, 'Other', commonCards)).toEqual(commonCards.map((c) => c.key));
  });
  it('counts and weighs only real rows; a literal stored ... remains a real item', () => {
    const { projected } = fixture();
    expect(packingProgress(projected.items)).toEqual({ checked: 1, total: 4, pct: 25 });
    expect(packingProgress(packingViewItems(projected.items, 'common'))).toEqual({ checked: 1, total: 2, pct: 50 });
    expect(packingProgress(packingViewItems(projected.items, 'personal'))).toEqual({ checked: 0, total: 2, pct: 0 });
    expect(projected.items.map(packingItemWeight)).toEqual([200, 0, 50, 100]);
    expect(isPackingPlaceholder(projected.items[2])).toBe(false);
    expect(isPackingPlaceholder({ name: '...' })).toBe(true);
    expect(projected.items.filter((x) => !isPackingPlaceholder(x))).toHaveLength(4);
  });
  it('keeps successful empty metadata cards without inventing row counts or weights', () => {
    const p = packingCategorySnapshotV2.parse(snapshotV2()),
      cards = packingCategoryPresentation(p);
    const groups = groupPackingItems([], 'all', 'Other', cards);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toEqual([]);
    expect(groups[0].placeholder).toBeDefined();
    expect(packingProgress(groups.flatMap((g) => g.items))).toEqual({ checked: 0, total: 0, pct: 0 });
    expect(groupPackingItems([], 'done', 'Other', cards)).toEqual([]);
    expect(p.packing.items).toEqual([]);
  });
  it('exports every real identity once without emitting metadata-only cards or virtual values', () => {
    const { projected } = fixture(),
      groups = groupByCategory(projected.items, 'Other');
    expect(groups).toHaveLength(4);
    expect(groups.map((g) => g.items.length)).toEqual([1, 1, 1, 1]);
    const markdown = packingMarkdown(projected.items, 'Packing', 'Other');
    expect(markdown).toContain('- [ ] ...');
    expect(markdown).not.toContain('virtual-packing-category:');
    expect(markdown).not.toContain('## Gear');
    const csv = packingCsv(projected.items, () => undefined);
    expect(csv.trim().split('\n')).toHaveLength(4);
    expect(csv).toContain(',...');
    expect(csv).not.toContain('virtual-packing-category:');
  });
  it('keeps legacy label grouping without fabricating canonical category IDs', () => {
    const { packet } = fixture(),
      ids = new FamilyIdentityRegistry(packet.scope.user_id);
    const old = projectPacking(packet.packing, ids, []);
    expect(old.categoryViews).toBeUndefined();
    expect(old.items.map(packingCategoryId)).toEqual([null, null, null, null]);
    const groups = groupPackingItems(packingViewItems(old.items, 'common'), 'all', 'Other');
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].key).toBeUndefined();
  });
  it('retains exact v1 write observations from only the linked category identity', () => {
    const { packet } = fixture();
    const own = observePackingCategoryForWrite(packet, id(23));
    expect(own.category).toEqual(categoryV1Facts(packet.categories[3]));
    expect(own.items.map((r) => r.id)).toEqual([id(102)]);
    const empty = observePackingCategoryForWrite(packet, id(22));
    expect(empty.items).toEqual([]);
    expect(empty.category.assignments).toEqual(packet.categories[2].assignments);
    expect(empty.category).not.toHaveProperty('retained_when_empty');
    expect(() => observePackingCategoryForWrite(packet, id(999))).toThrow();
  });
  it.each(['key', 'tag', 'id-object', 'key-object'] as const)(
    'rejects a virtual %s before item/model/export use',
    (kind) => {
      const key = `virtual-packing-category:${id(20)}`;
      const value: unknown =
        kind === 'key'
          ? key
          : kind === 'tag'
            ? { kind: 'virtual-category', key }
            : kind === 'id-object'
              ? { id: key, name: 'Not an item' }
              : { key, name: 'Not an item' };
      expect(() => assertRealPackingValue(value)).toThrow();
      expect(() => assertRealPackingItems([value])).toThrow();
      if (kind === 'key') return;
      const rows = [value as PackingItem];
      expect(() => packingViewItems(rows, 'common')).toThrow();
      expect(() => packingStatusFiltered(rows, 'all')).toThrow();
      expect(() => packingProgress(rows)).toThrow();
      expect(() => packingItemWeight(rows[0])).toThrow();
      expect(() => groupByCategory(rows, 'Other')).toThrow();
      expect(() => packingCsv(rows, () => undefined)).toThrow();
      expect(() => packingMarkdown(rows, 'Packing', 'Other')).toThrow();
    }
  );
});
