import { describe, expect, it } from 'vitest';
import { completeId, completeTripCaptureFixture } from '../../../tests/helpers/familyCompleteTrip';
import { parseCompleteTrip, serializeCompleteTrip } from './completeTripSnapshot';
import type { PackingCategoryPacket } from './packingCategoryContract';
import { checkPackingCategoryPacket } from './packingCategoryTransport';

function captureCategories() {
  const capture = completeTripCaptureFixture(),
    data = capture.data as import('./completeTripSnapshot').CompleteTripData,
    p = data.packing;
  const first = p.items[0];
  const categories: PackingCategoryPacket = {
    version: 1,
    scope: p.scope,
    collection_revision: p.collection_revision,
    packing: structuredClone(p),
    categories: [
      {
        id: completeId(400),
        trip_id: p.scope.trip_id,
        owner_person_id: p.scope.person_id,
        name: first.category,
        revision: 1,
        created_at: first.created_at,
        updated_at: first.updated_at,
        assignments: [],
      },
    ],
    item_categories: p.items.map((r) => ({ item_id: r.id, category_id: completeId(400) })),
    people: [{ id: p.scope.person_id, display_name: 'Synthetic member', is_guest: false, eligible: true }],
  };
  checkPackingCategoryPacket(categories, p.scope);
  return { ...capture, data: { ...data, packing_categories: categories } };
}
const expected = (c: ReturnType<typeof completeTripCaptureFixture>) => ({
  source: c.source,
  scope: c.scope,
  ownership: c.ownership,
  now: c.capturedAt,
});
describe('optional coupled category facts in complete offline Trip capture', () => {
  it('round trips category/Person/provenance references in the same verified generation', async () => {
    const c = captureCategories(),
      e = await serializeCompleteTrip(c),
      p = await parseCompleteTrip(JSON.stringify(e), expected(c));
    expect(p.data.packing_categories).toEqual(c.data.packing_categories);
    expect(e.manifests.packing_categories).toBeDefined();
    expect(e.capabilities.writes).toBe(false);
  });
  it('retains old complete packages without inventing category identity or category-write capability', async () => {
    const c = completeTripCaptureFixture(),
      e = await serializeCompleteTrip(c),
      p = await parseCompleteTrip(JSON.stringify(e), expected(c));
    expect(p.data.packing_categories).toBeUndefined();
    expect(e.manifests.packing_categories).toBeUndefined();
    expect(e.capabilities.writes).toBe(false);
  });
  it('refuses mixed collection generations even if both individual packets are otherwise valid', async () => {
    const c = captureCategories();
    c.data.packing_categories.collection_revision++;
    c.data.packing_categories.packing.collection_revision++;
    await expect(serializeCompleteTrip(c)).rejects.toThrow('Mixed packing/category generation');
  });
  it('protects the optional category section with the existing manifest and full digest', async () => {
    const c = captureCategories(),
      e = await serializeCompleteTrip(c);
    required(e.data.packing_categories).categories[0].name = 'Forged';
    await expect(parseCompleteTrip(e, expected(c))).rejects.toThrow();
  });
});

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Required test observation missing');
  return value;
}
