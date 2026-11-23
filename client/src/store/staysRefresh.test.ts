import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STAYS_REFRESH_SETTLE_MS, useStaysRefresh } from '../components/Planner/useStaysRefresh';
import { requestStaysRefresh, subscribeStaysRefresh } from './staysRefresh';

const disposers: (() => void)[] = [];

function subscribe(listener: () => void): () => void {
  const dispose = subscribeStaysRefresh(listener);
  disposers.push(dispose);
  return dispose;
}

function legacy(listener: EventListener): () => void {
  window.addEventListener('accommodations:refresh', listener);
  const dispose = () => window.removeEventListener('accommodations:refresh', listener);
  disposers.push(dispose);
  return dispose;
}

function elapse(): void {
  act(() => {
    vi.advanceTimersByTime(STAYS_REFRESH_SETTLE_MS);
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  disposers.splice(0).forEach((dispose) => dispose());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('typed lodging refresh compatibility', () => {
  it('delivers once synchronously in registration order across native and legacy readers', () => {
    const order: string[] = [];
    legacy(() => order.push('legacy-before'));
    subscribe(() => order.push('native-first'));
    legacy(() => order.push('legacy-middle'));
    subscribe(() => order.push('native-second'));
    legacy(() => order.push('legacy-after'));

    requestStaysRefresh();
    expect(order).toEqual(['legacy-before', 'native-first', 'legacy-middle', 'native-second', 'legacy-after']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves the original no-payload CustomEvent and keeps event objects out of native callbacks', () => {
    const native = vi.fn();
    subscribe(native);
    const received: Event[] = [];
    legacy((event) => received.push(event));

    requestStaysRefresh();
    expect(native).toHaveBeenCalledExactlyOnceWith();
    expect(received).toHaveLength(1);
    expect(received[0]).toBeInstanceOf(CustomEvent);
    expect(received[0]).toMatchObject({
      type: 'accommodations:refresh',
      detail: null,
      bubbles: false,
      cancelable: false,
      composed: false,
    });
  });

  it.each([
    new Event('accommodations:refresh'),
    new CustomEvent('accommodations:refresh', { detail: { stale: 'ignored' } }),
  ])('receives a retained legacy publisher without leaking its event payload (%#)', (event) => {
    const native = vi.fn();
    subscribe(native);
    window.dispatchEvent(event);
    expect(native).toHaveBeenCalledExactlyOnceWith();
  });

  it('ignores unrelated events', () => {
    const native = vi.fn();
    subscribe(native);
    for (const name of ['memories:updated', 'reservation:updated', 'resize']) {
      const event = new CustomEvent(name);
      window.dispatchEvent(event);
    }
    expect(native).not.toHaveBeenCalled();
  });

  it('disposes one subscription idempotently without removing other native or legacy readers', () => {
    const first = vi.fn();
    const second = vi.fn();
    const retained = vi.fn();
    const dispose = subscribe(first);
    subscribe(second);
    legacy(retained);

    dispose();
    dispose();
    requestStaysRefresh();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith();
    expect(retained).toHaveBeenCalledTimes(1);
  });

  it('gives two subscriptions of the same callback independent lifetimes', () => {
    const listener = vi.fn();
    const first = subscribe(listener);
    const second = subscribe(listener);
    requestStaysRefresh();
    expect(listener).toHaveBeenCalledTimes(2);
    first();
    requestStaysRefresh();
    expect(listener).toHaveBeenCalledTimes(3);
    second();
    requestStaysRefresh();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('preserves removal and registration during synchronous dispatch', () => {
    const order: string[] = [];
    let removeSecond = () => {};
    let installed = false;
    subscribe(() => {
      order.push('first');
      removeSecond();
      if (!installed) {
        installed = true;
        subscribe(() => order.push('new'));
      }
    });
    removeSecond = subscribe(() => order.push('removed'));
    subscribe(() => order.push('last'));

    requestStaysRefresh();
    expect(order).toEqual(['first', 'last']);
    requestStaysRefresh();
    expect(order).toEqual(['first', 'last', 'first', 'last', 'new']);
  });

  it('preserves a deliberate nested request without introducing an echo loop', () => {
    let nested = false;
    const native = vi.fn(() => {
      if (!nested) {
        nested = true;
        requestStaysRefresh();
      }
    });
    const retained = vi.fn();
    subscribe(native);
    legacy(retained);

    requestStaysRefresh();
    expect(native).toHaveBeenCalledTimes(2);
    expect(retained).toHaveBeenCalledTimes(2);
  });

  it('coalesces typed and legacy requests in the actual native hook at the original 250ms boundary', () => {
    const reload = vi.fn();
    renderHook(() => useStaysRefresh(reload));
    act(() => {
      requestStaysRefresh();
      const event = new Event('accommodations:refresh');
      window.dispatchEvent(event);
      requestStaysRefresh();
      vi.advanceTimersByTime(STAYS_REFRESH_SETTLE_MS - 1);
    });
    expect(reload).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(reload).toHaveBeenCalledExactlyOnceWith();
  });

  it('uses the latest native reload callback after a legacy request', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ reload }) => useStaysRefresh(reload), { initialProps: { reload: first } });
    const event = new CustomEvent('accommodations:refresh');
    act(() => {
      window.dispatchEvent(event);
    });
    rerender({ reload: second });
    elapse();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith();
  });

  it('retires an unmounted hook and does not replay old requests to a fresh mount', () => {
    const oldReload = vi.fn();
    const nextReload = vi.fn();
    const { unmount } = renderHook(() => useStaysRefresh(oldReload));
    act(() => requestStaysRefresh());
    unmount();
    requestStaysRefresh();
    renderHook(() => useStaysRefresh(nextReload));
    elapse();
    expect(oldReload).not.toHaveBeenCalled();
    expect(nextReload).not.toHaveBeenCalled();
    act(() => requestStaysRefresh());
    elapse();
    expect(nextReload).toHaveBeenCalledExactlyOnceWith();
  });

  it('does not launch a queued follow-up after unmount while a native reload is in flight', async () => {
    let land = () => {};
    const reload = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          land = resolve;
        })
    );
    const { unmount } = renderHook(() => useStaysRefresh(reload));
    act(() => requestStaysRefresh());
    elapse();
    act(() => requestStaysRefresh());
    elapse();
    expect(reload).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => land());
    requestStaysRefresh();
    elapse();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
