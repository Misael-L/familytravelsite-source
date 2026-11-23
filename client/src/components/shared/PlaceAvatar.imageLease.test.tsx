import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPlaceImageLease } from '../../repo/placeImageLease';
import { useAuthStore } from '../../store/authStore';
import PlaceAvatar from './PlaceAvatar';
const photo = vi.hoisted(() => ({ getCached: vi.fn(), fetchPhoto: vi.fn() }));
vi.mock('../../services/photoService', () => ({
  getCached: photo.getCached,
  fetchPhoto: photo.fetchPhoto,
  isLoading: () => false,
  onThumbReady: () => () => {},
  onPhotoLoaded: () => () => {},
}));
let stop = () => {};
const initial = useAuthStore.getState();
beforeEach(() => {
  photo.getCached.mockReset().mockReturnValue({
    photoUrl: 'https://old-provider.invalid/photo.jpg',
    thumbDataUrl: 'data:image/webp;base64,older',
  });
  photo.fetchPhoto.mockReset();
  useAuthStore.setState({ placesPhotosEnabled: true });
});
afterEach(() => {
  stop();
  useAuthStore.setState(initial, true);
});
describe('native avatar saved-image policy', () => {
  it('keeps the existing placeholder instead of consulting stale provider bytes for an admitted Trip miss', async () => {
    stop = registerPlaceImageLease(
      () => false,
      (place) => place.trip_id === 77
    );
    const place = { id: 1, trip_id: 77, name: 'Saved place', image_url: null, lat: 1, lng: 2 };
    const view = render(<PlaceAvatar place={place} />);
    await waitFor(() => expect(view.container.querySelector('img')).toBeNull());
    expect(photo.getCached).not.toHaveBeenCalled();
    expect(photo.fetchPhoto).not.toHaveBeenCalled();
  });
  it('shows an exact owned image without consulting provider photos', async () => {
    stop = registerPlaceImageLease(
      (url) => url === 'blob:checked',
      (place) => place.trip_id === 77
    );
    const place = { id: 1, trip_id: 77, name: 'Saved place', image_url: 'blob:checked', lat: 1, lng: 2 };
    render(<PlaceAvatar place={place} />);
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Saved place' })).toHaveAttribute('src', 'blob:checked')
    );
    expect(photo.getCached).not.toHaveBeenCalled();
    expect(photo.fetchPhoto).not.toHaveBeenCalled();
  });
});
