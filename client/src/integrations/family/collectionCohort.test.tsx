import { describe, expect, it, vi } from 'vitest';
import { registerCollectionCohortLive } from '../../../tests/qualification/collectionCohort.live';
import type { CollectionCohort } from './collectionCohort';
import { familyCollectionTarget } from './collectionRuntime';
import { FamilyIdentityRegistry } from './identity';
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: vi.fn() }));
vi.mock('@family/backend/supabase/env', () => ({ getSupabaseUrl: () => 'https://fixture.invalid' }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
describe('canonical native membership selectors', () => {
  const ids = new FamilyIdentityRegistry(id(1)),
    cohort = { owner: { ids } } as CollectionCohort;
  it.each([
    { name: 'Restaurant' },
    { name: 'Restaurant', lat: 1, lng: 2 },
    { google_place_id: 'provider' },
    { osm_id: 'catalog:food:' + id(2) },
    { source_trip_id: 1, source_place_id: 2 },
  ])('refuses a fuzzy/provider selector %#', (value) => {
    expect(() => familyCollectionTarget(value, cohort)).toThrow('supported Family save identity');
  });
  it('keeps catalog, saved Trip and saved Collection identities distinct', () => {
    for (const target of [
      { kind: 'food', id: id(3) },
      { trip_id: id(4), location_id: id(5) },
      { collection_id: id(6), item_id: id(7) },
    ])
      expect(familyCollectionTarget({ family_identity: target }, cohort)).toEqual(target);
  });
  it('maps only a verified trip namespace for a saved location', () => {
    const trip = ids.register('trip', id(4));
    expect(familyCollectionTarget({ family_location_id: id(5), trip_id: trip }, cohort)).toEqual({
      trip_id: id(4),
      location_id: id(5),
    });
    expect(() => familyCollectionTarget({ family_location_id: id(5), trip_id: 99 }, cohort)).toThrow();
  });
});
registerCollectionCohortLive();
