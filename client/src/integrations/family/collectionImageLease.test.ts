import { describe, expect, it } from 'vitest';
import { isLeasedPlaceImage, placeImageDisplay } from '../../repo/placeImageLease';
import { createCollectionImageLease } from './collectionImageLease';
const source = 'https://fixture.invalid',
  thumb = source + '/storage/v1/object/public/catalog/variants/v1/fixture/thumb.webp',
  hero = source + '/storage/v1/object/public/catalog/variants/v1/fixture/hero.webp';
describe('owned Collection image roles and placeholders', () => {
  it('keeps small avatars and full detail images distinct, including map clones', () => {
    const lease = createCollectionImageLease(source, () => {}),
      place = lease.tag({ image_url: hero }, { thumb_url: thumb, hero_url: hero });
    expect(placeImageDisplay(place, 'thumb')).toEqual({ url: thumb });
    expect(placeImageDisplay({ ...place, trip_id: 0 })).toEqual({ url: hero });
    lease.retire();
  });
  it('does not enlarge a thumb when the hero is missing', () => {
    const lease = createCollectionImageLease(source, () => {}),
      place = lease.tag({ image_url: null }, { thumb_url: thumb, hero_url: null });
    expect(placeImageDisplay(place, 'thumb')).toEqual({ url: thumb });
    expect(placeImageDisplay(place)).toEqual({ url: null });
    lease.retire();
  });
  it('retired placeholders remain handled and never fall back to providers', () => {
    const lease = createCollectionImageLease(source, () => {}),
      place = lease.tag({ image_url: hero }, { thumb_url: thumb, hero_url: hero });
    lease.retire();
    expect(placeImageDisplay(place)).toEqual({ url: null });
    expect(isLeasedPlaceImage(hero)).toBe(false);
  });
  it('a replacement actor cannot revive the prior image view', () => {
    let active = true;
    const lease = createCollectionImageLease(source, () => {
        if (!active) throw Error('Actor changed');
      }),
      place = lease.tag({ image_url: hero }, { thumb_url: thumb, hero_url: hero });
    active = false;
    expect(placeImageDisplay(place)).toEqual({ url: null });
    lease.retire();
  });
  it('shared public variants keep independent owner lifetimes', () => {
    const a = createCollectionImageLease(source, () => {}),
      b = createCollectionImageLease(source, () => {}),
      first = a.tag({ image_url: hero }, { thumb_url: thumb, hero_url: hero }),
      second = b.tag({ image_url: hero }, { thumb_url: thumb, hero_url: hero });
    a.retire();
    expect(placeImageDisplay(first)).toEqual({ url: null });
    expect(placeImageDisplay(second)).toEqual({ url: hero });
    b.retire();
    expect(isLeasedPlaceImage(hero)).toBe(false);
  });
  it('refuses originals, transformed URLs and foreign sources', () => {
    for (const url of [
      source + '/storage/v1/object/public/catalog/original.webp',
      source + '/storage/v1/render/image/public/catalog/picture.webp',
      'https://other.invalid/storage/v1/object/public/catalog/variants/v1/hero.webp',
    ]) {
      const lease = createCollectionImageLease(source, () => {});
      expect(() => lease.tag({ image_url: url }, { thumb_url: null, hero_url: url })).toThrow();
      lease.retire();
    }
  });
});
