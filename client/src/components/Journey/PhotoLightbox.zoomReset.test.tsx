import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import PhotoLightbox from './PhotoLightbox';

vi.mock('./VideoPlayer', () => ({ default: ({ src }: { src: string }) => <video src={src} /> }));
vi.mock('../../api/websocket', () => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  getSocketId: vi.fn(() => null),
  setRefetchCallback: vi.fn(),
  setPreReconnectHook: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
}));

const photos = [
  { id: 'a', src: '/photos/a.webp', caption: 'Photo A' },
  { id: 'b', src: '/photos/b.webp', caption: 'Photo B' },
];

beforeEach(() => {
  resetAllStores();
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 300));
});

afterEach(() => vi.restoreAllMocks());

function tap(): void {
  const dialog = screen.getByRole('dialog');
  fireEvent.touchStart(dialog, { touches: [{ clientX: 200, clientY: 150 }] });
  fireEvent.touchEnd(dialog, { touches: [], changedTouches: [{ clientX: 200, clientY: 150 }] });
}

describe('photo-specific gesture reset', () => {
  it('does not combine taps on different photos into one double tap', () => {
    render(<PhotoLightbox photos={photos} onClose={vi.fn()} />);
    tap();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    vi.mocked(Date.now).mockReturnValue(1_700_000_000_100);
    tap();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/photos/b.webp');
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  });

  it('discards a drag from the previous photo', () => {
    render(<PhotoLightbox photos={photos} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.mouseDown(screen.getByRole('img'), { clientX: 200, clientY: 150 });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    const image = screen.getByRole('img');
    const before = image.style.transform;
    fireEvent.mouseMove(image, { clientX: 280, clientY: 190 });
    expect(image.style.transform).toBe(before);
    expect(image.style.cursor).toBe('grab');
    expect(image.style.transition).toBe('transform 160ms ease');
  });

  it('does not continue the old pinch on the next photo', () => {
    render(<PhotoLightbox photos={photos} onClose={vi.fn()} />);
    fireEvent.touchStart(screen.getByRole('dialog'), {
      touches: [
        { clientX: 100, clientY: 150 },
        { clientX: 200, clientY: 150 },
      ],
    });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.touchMove(screen.getByRole('dialog'), {
      touches: [
        { clientX: 50, clientY: 150 },
        { clientX: 250, clientY: 150 },
      ],
    });
    expect(screen.getByRole('img').style.transform).toBe('translate(0px, 0px) scale(1)');
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  });

  it('does not swipe the new photo with a gesture started on the previous one', () => {
    render(
      <PhotoLightbox photos={[...photos, { id: 'c', src: '/photos/c.webp', caption: 'Photo C' }]} onClose={vi.fn()} />
    );
    fireEvent.touchStart(screen.getByRole('dialog'), { touches: [{ clientX: 200, clientY: 150 }] });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.touchEnd(screen.getByRole('dialog'), { touches: [], changedTouches: [{ clientX: 100, clientY: 150 }] });
    expect(screen.getByRole('img')).toHaveAttribute('src', '/photos/b.webp');
  });

  it('discards a touch started on the previous photo', () => {
    render(<PhotoLightbox photos={photos} onClose={vi.fn()} />);
    fireEvent.touchStart(screen.getByRole('dialog'), { touches: [{ clientX: 200, clientY: 150 }] });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.touchEnd(screen.getByRole('dialog'), {
      touches: [],
      changedTouches: [{ clientX: 200, clientY: 150 }],
    });
    vi.mocked(Date.now).mockReturnValue(1_700_000_000_100);
    tap();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  });
});
