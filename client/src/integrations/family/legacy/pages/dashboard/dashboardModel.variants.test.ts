import { describe, expect, it } from 'vitest';
import { familyTripToHeroBundle } from './dashboardModel';
import type { FamilyDashboardTrip } from './familyDashboardModel';

const VARIANT = 'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/aa/thumb-bb.webp';
const CANONICAL = 'https://catalog.example.invalid/storage/v1/object/public/catalog/places/gubbio.jpg';

function trip(hubPlaces: FamilyDashboardTrip['hub_places']): FamilyDashboardTrip {
  return {
    id: 't1',
    family_id: 'fam-1',
    title: 'Trip',
    description: null,
    start_date: '2026-08-10',
    end_date: '2026-08-17',
    cover_image: null,
    is_archived: 0,
    currency: 'USD',
    reminder_days: 0,
    status: 'published',
    hub_places: hubPlaces,
  };
}

describe('familyTripToHeroBundle catalog images', () => {
  it('keeps a ready thumb and leaves a canonical cover as a placeholder', () => {
    const ready = familyTripToHeroBundle(
      trip([{ id: 'pl1', name: 'Gubbio', lat: 43.35, lng: 12.57, imageUrl: VARIANT }])
    );
    expect(ready.places[0]?.image_url).toBe(VARIANT);

    const missing = familyTripToHeroBundle(
      trip([{ id: 'pl1', name: 'Gubbio', lat: 43.35, lng: 12.57, imageUrl: CANONICAL }])
    );
    expect(missing.places[0]?.image_url).toBeNull();
    expect(JSON.stringify(missing)).not.toContain('/render/image/');
  });
});
