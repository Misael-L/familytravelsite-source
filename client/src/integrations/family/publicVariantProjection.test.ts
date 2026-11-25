import { describe, expect, it, vi } from 'vitest';
import { completeId, completeTripCaptureFixture, completeTripData } from '../../../tests/helpers/familyCompleteTrip';
import { projectCompleteTrip } from './completeTripProjection';
import { serializeCompleteTrip } from './completeTripSnapshot';
import { FamilyIdentityRegistry } from './identity';
import { projectPlanLocations } from './planLocations';

async function envelope() {
  const capture = completeTripCaptureFixture(),
    data = completeTripData(),
    state = data.planner.view.state;
  const original = state.locations[0];
  state.locations.push({
    ...original,
    id: completeId(70),
    name: 'Context city',
    notes: null,
    source: { kind: 'place', id: completeId(7) },
    cover_media_id: null,
    source_type_label: 'City',
  });
  state.destinations.push({ source_place_id: completeId(7), location_id: completeId(70), legacy_category_id: null });
  return serializeCompleteTrip({ ...capture, data, capturedAt: Date.now(), admitReadOnly: true });
}
describe('saved public display URLs at the native DTO boundary', () => {
  it('uses one location image consistently in the native pool and repeated visits without rewriting metadata', async () => {
    const e = await envelope(),
      before = JSON.stringify(e),
      display = vi.fn(async () => 'blob:native-hero');
    const projection = await projectCompleteTrip(e, () => {}, display);
    expect(display).toHaveBeenCalledExactlyOnceWith({
      mediaAssetId: e.data.planner.variants[0].mediaAssetId,
      recipe: 'v1',
      role: 'hero',
      url: e.data.planner.variants[0].heroUrl,
    });
    expect(projection.bundle.places[0].image_url).toBe('blob:native-hero');
    const visits = projection.bundle.days.flatMap((day) => day.assignments ?? []);
    expect(visits).toHaveLength(2);
    expect(visits.map((visit) => visit.place?.image_url)).toEqual(['blob:native-hero', 'blob:native-hero']);
    expect(projection.state.locations[0].hero_url).toBe(e.data.planner.variants[0].heroUrl);
    expect(projection.state.locations[0].thumb_url).toBe(e.data.planner.variants[0].thumbUrl);
    expect(JSON.stringify(e)).toBe(before);
    expect(e.capabilities.mediaBytes).toBe(false);
  });
  it('projects placeholders on a cache miss and keeps ordinary projection URLs unchanged', async () => {
    const e = await envelope();
    const missing = await projectCompleteTrip(
      e,
      () => {},
      async () => null
    );
    expect(missing.bundle.places[0].image_url).toBeNull();
    expect(
      missing.bundle.days.flatMap((day) => day.assignments ?? []).every((visit) => visit.place?.image_url === null)
    ).toBe(true);
    const ordinary = await projectCompleteTrip(e, () => {});
    expect(ordinary.bundle.places[0].image_url).toBe(e.data.planner.variants[0].heroUrl);
  });
  it.each(['original', 'transformation', 'missing'] as const)(
    'rejects the %s hero fixture before display resolution',
    async (kind) => {
      const e = await envelope();
      const row = e.data.planner.view.state.locations[0];
      const variant = e.data.planner.variants[0];
      const display = vi.fn(async () => 'blob:should-not-mint');
      if (!variant.canonicalUrl || !variant.heroUrl) throw Error('Expected original and stored hero fixture URLs');
      const heroes = {
        original: variant.canonicalUrl,
        transformation: variant.heroUrl.replace('/object/public/', '/render/image/public/'),
        missing: null,
      };
      const result = await projectPlanLocations(
        [row],
        new FamilyIdentityRegistry(e.scope.user_id),
        undefined,
        new Map([[variant.mediaAssetId, { ...variant, heroUrl: heroes[kind] }]]),
        display
      );
      expect(display).not.toHaveBeenCalled();
      expect(result[0]).toMatchObject({ hero_url: null, native_place: { image_url: null } });
    }
  );
  it('rechecks the original projection fence after the asynchronous image resolver', async () => {
    const e = await envelope();
    let current = true;
    const fence = () => {
      if (!current) throw Error('Original generation retired');
    };
    await expect(
      projectCompleteTrip(e, fence, async () => {
        current = false;
        return 'blob:late';
      })
    ).rejects.toThrow('Original generation retired');
  });
});
