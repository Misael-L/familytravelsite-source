import { act, cleanup, renderHook } from '@testing-library/react';
import type {
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePhotoZoom } from './usePhotoZoom';

const epoch = 1_700_000_000_000;

function mouse(x: number, y: number): ReactMouseEvent {
  return new MouseEvent('mousemove', { clientX: x, clientY: y, cancelable: true }) as unknown as ReactMouseEvent;
}

function wheel(deltaY: number, x: number, y: number): ReactWheelEvent {
  return new WheelEvent('wheel', { deltaY, clientX: x, clientY: y }) as unknown as ReactWheelEvent;
}

function touch(points: number[][] = [], changed: number[][] = []): ReactTouchEvent {
  const fingers = (list: number[][]) => list.map(([clientX, clientY]) => ({ clientX, clientY }));
  return Object.assign(new Event('touchmove'), {
    touches: fingers(points),
    changedTouches: fingers(changed),
  }) as unknown as ReactTouchEvent;
}

function mount() {
  const hook = renderHook(({ photo }) => usePhotoZoom(photo), { initialProps: { photo: 'a' } });
  const image = document.createElement('img');
  vi.spyOn(image, 'getBoundingClientRect').mockImplementation(() => {
    const { scale, x, y } = hook.result.current.zoom;
    return new DOMRect(10 + x - 200 * (scale - 1), 20 + y - 150 * (scale - 1), 400 * scale, 300 * scale);
  });
  hook.result.current.imgRef.current = image;
  return { ...hook, image };
}

beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(epoch));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('photo zoom gestures', () => {
  it('starts at rest, zooms with the buttons and keeps callback identities', () => {
    const { result } = mount();
    const before = result.current;
    expect(before.zoom).toEqual({ scale: 1, x: 0, y: 0 });
    act(() => result.current.zoomIn());
    expect(result.current.zoom).toEqual({ scale: 1.5, x: 0, y: 0 });
    for (const key of Object.keys(before.mouse) as (keyof typeof before.mouse)[]) {
      expect(result.current.mouse[key]).toBe(before.mouse[key]);
    }
    expect(result.current.touchStart).toBe(before.touchStart);
    expect(result.current.touchMove).toBe(before.touchMove);
    expect(result.current.touchEnd).toBe(before.touchEnd);
    act(() => result.current.zoomOut());
    expect(result.current.zoomed).toBe(false);
  });

  it('measures lazily and leaves absent images alone', () => {
    const { result, image } = mount();
    expect(image.getBoundingClientRect).not.toHaveBeenCalled();
    result.current.imgRef.current = null;
    act(() => {
      result.current.zoomIn();
      result.current.mouse.onDoubleClick(mouse(250, 200));
      result.current.mouse.onWheel(wheel(-100, 250, 200));
    });
    expect(
      result.current.touchMove(
        touch([
          [100, 100],
          [200, 100],
        ])
      )
    ).toBe(false);
    expect(result.current.zoomed).toBe(false);
    expect(image.getBoundingClientRect).not.toHaveBeenCalled();
  });

  it('anchors wheel zoom at the pointer in the original image coordinates', () => {
    const { result } = mount();
    act(() => result.current.mouse.onWheel(wheel(-100, 250, 200)));
    const scale = Math.exp(0.2);
    expect(result.current.zoom.scale).toBeCloseTo(scale);
    expect(result.current.zoom.x).toBeCloseTo(40 - 40 * scale);
    expect(result.current.zoom.y).toBeCloseTo(30 - 30 * scale);
    act(() => result.current.mouse.onWheel(wheel(10000, 250, 200)));
    expect(result.current.zoom).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('toggles a double click around the image centre and honors the maximum zoom', () => {
    const { result } = mount();
    act(() => result.current.mouse.onDoubleClick(mouse(210, 170)));
    expect(result.current.zoom).toEqual({ scale: 2.5, x: 0, y: 0 });
    act(() => result.current.mouse.onDoubleClick(mouse(210, 170)));
    expect(result.current.zoomed).toBe(false);
    act(() => {
      for (let i = 0; i < 8; i++) result.current.zoomIn();
    });
    expect(result.current.zoom.scale).toBe(4);
    expect(result.current.canZoomIn).toBe(false);
    act(() => result.current.reset());
    expect(result.current.zoom).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it.each(['onMouseUp', 'onMouseLeave'] as const)('ends the drag on %s', (end) => {
    const { result } = mount();
    const resting = mouse(200, 150);
    act(() => result.current.mouse.onMouseDown(resting));
    expect(resting.defaultPrevented).toBe(false);
    act(() => result.current.zoomIn());
    const down = mouse(200, 150);
    act(() => result.current.mouse.onMouseDown(down));
    expect(down.defaultPrevented).toBe(true);
    act(() => result.current.mouse.onMouseMove(mouse(240, 180)));
    expect(result.current.zoom).toEqual({ scale: 1.5, x: 40, y: 30 });
    act(() => result.current.mouse[end]());
    const before = result.current.zoom;
    act(() => result.current.mouse.onMouseMove(mouse(280, 220)));
    expect(result.current.zoom).toBe(before);
  });

  it('does not pan without an image or a started drag', () => {
    const { result } = mount();
    act(() => result.current.mouse.onMouseMove(mouse(240, 180)));
    expect(result.current.zoomed).toBe(false);
    act(() => result.current.zoomIn());
    act(() => result.current.mouse.onMouseDown(mouse(200, 150)));
    result.current.imgRef.current = null;
    const before = result.current.zoom;
    act(() => result.current.mouse.onMouseMove(mouse(240, 180)));
    expect(result.current.zoom).toBe(before);
  });

  it('pinches around the midpoint and consumes that gesture', () => {
    const { result } = mount();
    expect(
      result.current.touchStart(
        touch([
          [160, 170],
          [260, 170],
        ])
      )
    ).toBe(true);
    let consumed = false;
    act(() => {
      consumed = result.current.touchMove(
        touch([
          [110, 170],
          [310, 170],
        ])
      );
    });
    expect(consumed).toBe(true);
    expect(result.current.zoom).toEqual({ scale: 2, x: 0, y: 0 });
    expect(result.current.touchEnd(touch([], [[310, 170]]))).toBe(true);
  });

  it('pans an enlarged photo with one finger, then releases it', () => {
    const { result } = mount();
    act(() => result.current.zoomIn());
    expect(result.current.touchStart(touch([[200, 150]]))).toBe(true);
    act(() => {
      result.current.touchMove(touch([[240, 180]]));
    });
    expect(result.current.zoom).toEqual({ scale: 1.5, x: 40, y: 30 });
    expect(result.current.touchEnd(touch([], [[240, 180]]))).toBe(true);
    const before = result.current.zoom;
    expect(result.current.touchMove(touch([[260, 200]]))).toBe(false);
    expect(result.current.zoom).toBe(before);
  });

  it('leaves plain swipes, missing starts and unsupported touch counts to the lightbox', () => {
    const { result } = mount();
    expect(result.current.touchEnd(touch([], [[200, 150]]))).toBe(false);
    expect(result.current.touchStart(touch([[200, 150]]))).toBe(false);
    expect(result.current.touchMove(touch([[80, 150]]))).toBe(false);
    expect(result.current.touchEnd(touch([], [[80, 150]]))).toBe(false);
    expect(
      result.current.touchStart(
        touch([
          [100, 100],
          [200, 100],
          [300, 100],
        ])
      )
    ).toBe(false);
    expect(
      result.current.touchMove(
        touch([
          [100, 100],
          [200, 100],
          [300, 100],
        ])
      )
    ).toBe(false);
    expect(result.current.touchEnd(touch())).toBe(false);
  });

  it.each([
    { name: 'inside time and distance limits', delay: 299, distance: 9, zoomed: true },
    { name: 'at the time limit', delay: 300, distance: 9, zoomed: false },
    { name: 'at the movement limit', delay: 299, distance: 10, zoomed: false },
    { name: 'outside the movement limit', delay: 299, distance: 11, zoomed: false },
  ])('recognizes a double tap only $name', ({ delay, distance, zoomed }) => {
    const { result } = mount();
    act(() => {
      result.current.touchStart(touch([[200, 150]]));
      result.current.touchEnd(touch([], [[200, 150]]));
    });
    vi.mocked(Date.now).mockReturnValue(epoch + delay);
    act(() => {
      result.current.touchStart(touch([[200, 150]]));
      result.current.touchEnd(touch([], [[200 + distance, 150]]));
    });
    expect(result.current.zoomed).toBe(zoomed);
  });

  it('keeps the zoom when the same photo rerenders and resets on a changed photo', () => {
    const { result, rerender } = mount();
    act(() => result.current.zoomIn());
    rerender({ photo: 'a' });
    expect(result.current.zoom.scale).toBe(1.5);
    rerender({ photo: 'b' });
    expect(result.current.zoom).toEqual({ scale: 1, x: 0, y: 0 });
    expect(result.current.zoomed).toBe(false);
  });
});
