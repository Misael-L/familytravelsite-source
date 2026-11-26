import { afterEach, describe, expect, it } from 'vitest';
import { canRenderMarkerPhoto, isCustomPlaceImage, placePhotoFull, placePhotoUrl } from '../components/Map/placePhoto';
import { isLeasedPlaceImage, placeImageDisplay, registerPlaceImageLease } from './placeImageLease';
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const stop of cleanups) stop();
  cleanups.length = 0;
});
describe('explicit view-owned native image URLs', () => {
  it('prioritizes a registered exact URL over a stale coordinate/provider thumbnail', () => {
    cleanups.push(registerPlaceImageLease((url) => url === 'blob:checked'));
    const place = { image_url: 'blob:checked', lat: 1, lng: 2 };
    expect(isCustomPlaceImage(place.image_url)).toBe(true);
    expect(canRenderMarkerPhoto(place.image_url)).toBe(true);
    expect(placePhotoUrl(place, { '1,2': 'data:older-photo' })).toBe('blob:checked');
    expect(placePhotoFull(place)).toBe('blob:checked');
  });
  it('never classifies arbitrary Blob URLs as checked and restores ordinary behavior on retirement', () => {
    let live = true;
    const stop = registerPlaceImageLease((url) => live && url === 'blob:one');
    cleanups.push(stop);
    expect(isLeasedPlaceImage('blob:other')).toBe(false);
    expect(isCustomPlaceImage('blob:other')).toBe(false);
    expect(canRenderMarkerPhoto('blob:other')).toBe(false);
    expect(canRenderMarkerPhoto('https://arbitrary.invalid/image.jpg')).toBe(false);
    live = false;
    expect(isLeasedPlaceImage('blob:one')).toBe(false);
    stop();
    stop();
    expect(
      placePhotoUrl({ image_url: 'https://public.example/photo.webp', lat: 1, lng: 2 }, { '1,2': 'data:provider' })
    ).toBe('data:provider');
  });
  it('older view cleanup cannot unregister a different current owner', () => {
    const old = registerPlaceImageLease((url) => url === 'blob:old'),
      next = registerPlaceImageLease((url) => url === 'blob:new');
    cleanups.push(old, next);
    old();
    expect(isLeasedPlaceImage('blob:old')).toBe(false);
    expect(isLeasedPlaceImage('blob:new')).toBe(true);
  });
  it('suppresses provider fallback only for the current handled Trip when its bytes are missing', () => {
    cleanups.push(
      registerPlaceImageLease(
        (url) => url === 'blob:checked',
        (place) => place.trip_id === 77
      )
    );
    const saved = { image_url: null, trip_id: 77, lat: 1, lng: 2 };
    expect(placeImageDisplay(saved)).toEqual({ url: null });
    expect(placePhotoUrl(saved, { '1,2': 'data:older-provider' })).toBeNull();
    expect(placePhotoFull(saved)).toBeNull();
    const other = { ...saved, trip_id: 78 };
    expect(placeImageDisplay(other)).toBeUndefined();
    expect(placePhotoUrl(other, { '1,2': 'data:older-provider' })).toBe('data:older-provider');
  });
});
