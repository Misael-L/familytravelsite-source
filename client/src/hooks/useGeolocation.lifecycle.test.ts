import { act, cleanup, renderHook } from '@testing-library/react';
import { startTransition, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { useGeolocation } from './useGeolocation';

interface Watch {
  id: number;
  success: PositionCallback;
  failure: PositionErrorCallback;
}

const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
let watches: Watch[];
let permissions: ((value: string) => void)[];
let duringRegistration: ((watch: Watch) => void) | undefined;
let clearWatch: ReturnType<typeof vi.fn<Geolocation['clearWatch']>>;
let listen: MockInstance<typeof window.addEventListener>;

function fix(heading: number | null = null): GeolocationPosition {
  const coords: GeolocationCoordinates = {
    latitude: 19.04,
    longitude: -98.19,
    accuracy: 12,
    altitude: null,
    altitudeAccuracy: null,
    heading,
    speed: null,
    toJSON: () => ({ latitude: 19.04, longitude: -98.19 }),
  };
  return { coords, timestamp: 123, toJSON: () => ({ coords, timestamp: 123 }) };
}

function failure(code = 1): GeolocationPositionError {
  return { code, message: `failure ${code}`, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
}

function watch(index = 0): Watch {
  const value = watches[index];
  if (!value) throw new Error('Expected a registered location watch');
  return value;
}

function orientation(heading: number): Event {
  return Object.assign(new Event('deviceorientation'), { webkitCompassHeading: heading });
}

function orientationListener(index = 0): EventListener {
  const listener = listen.mock.calls.filter(([type]) => type === 'deviceorientation')[index]?.[1];
  if (typeof listener !== 'function') throw new Error('Expected an orientation listener');
  return listener;
}

function deferPermission(): void {
  vi.stubGlobal(
    'DeviceOrientationEvent',
    Object.assign(function () {}, {
      requestPermission: () => new Promise<string>((resolve) => permissions.push(resolve)),
    })
  );
}

async function grant(index: number): Promise<void> {
  const resolve = permissions[index];
  if (!resolve) throw new Error('Expected a pending orientation permission');
  await act(async () => {
    resolve('granted');
  });
}

beforeEach(() => {
  watches = [];
  permissions = [];
  duringRegistration = undefined;
  clearWatch = vi.fn();
  listen = vi.spyOn(window, 'addEventListener');
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('DeviceOrientationEvent', undefined);
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: (success: PositionCallback, onError?: PositionErrorCallback | null) => {
        const item = { id: watches.length + 10, success, failure: onError ?? (() => {}) };
        watches.push(item);
        duringRegistration?.(item);
        return item.id;
      },
      clearWatch,
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalGeolocation) Object.defineProperty(navigator, 'geolocation', originalGeolocation);
  else Reflect.deleteProperty(navigator, 'geolocation');
});

describe('location watch lifetime', () => {
  it.each([1, 2, 3, 99])('ignores retired error %i without changing the replacement watch', async (code) => {
    const { result } = renderHook(() => useGeolocation());
    await act(() => result.current.cycleMode());
    const retired = watch();
    act(() => result.current.setMode('off'));
    act(() => result.current.setMode('show'));
    const current = watch(1);
    act(() => current.success(fix(90)));
    const before = result.current;
    act(() => retired.failure(failure(code)));
    expect(result.current).toBe(before);
    expect(result.current.mode).toBe('show');
    expect(clearWatch).toHaveBeenCalledTimes(1);
    expect(clearWatch).not.toHaveBeenCalledWith(current.id);
  });

  it.each(['off', 'replacement', 'unmount'])('ignores a retired position after %s', async (state) => {
    const { result, unmount } = renderHook(() => useGeolocation());
    await act(() => result.current.cycleMode());
    const retired = watch();
    act(() => result.current.setMode('off'));
    if (state === 'replacement') {
      act(() => result.current.setMode('show'));
      act(() => watch(1).failure(failure(3)));
    }
    if (state === 'unmount') unmount();
    const before = result.current;
    act(() => retired.success(fix(180)));
    expect(result.current).toBe(before);
    expect(result.current.position).toBeNull();
    if (state === 'replacement') expect(result.current.errorCode).toBe('timeout');
  });

  it('does not read payload properties from retired callbacks', async () => {
    const { result } = renderHook(() => useGeolocation());
    await act(() => result.current.cycleMode());
    const retired = watch();
    act(() => result.current.setMode('off'));
    const position = fix();
    const error = failure();
    const coords = vi.fn(() => position.coords);
    const message = vi.fn(() => error.message);
    const stalePosition = Object.create(position);
    const staleError = Object.create(error);
    Object.defineProperty(stalePosition, 'coords', { get: coords });
    Object.defineProperty(staleError, 'message', { get: message });
    act(() => {
      retired.success(stalePosition);
      retired.failure(staleError);
    });
    expect(coords).not.toHaveBeenCalled();
    expect(message).not.toHaveBeenCalled();
  });

  it.each(['off', 'replacement', 'unmount'])('ignores a held orientation callback after %s', async (state) => {
    const { result, unmount } = renderHook(() => useGeolocation());
    await act(() => result.current.cycleMode());
    act(() => watch().success(fix()));
    const retired = orientationListener();
    act(() => result.current.setMode('off'));
    if (state === 'replacement') {
      act(() => result.current.setMode('show'));
      act(() => watch(1).success(fix()));
    }
    if (state === 'unmount') unmount();
    const before = result.current;
    act(() => retired(orientation(270)));
    expect(result.current).toBe(before);
    if (state === 'replacement') {
      act(() => watch(1).success(fix()));
      expect(result.current.position?.heading).toBeNull();
    }
  });

  it('retires callbacks before clearWatch can deliver one synchronously', async () => {
    const { result } = renderHook(() => useGeolocation());
    await act(() => result.current.cycleMode());
    const retired = watch();
    const heldOrientation = orientationListener();
    clearWatch.mockImplementation(() => {
      retired.success(fix(90));
      retired.failure(failure(3));
      heldOrientation(orientation(180));
    });
    act(() => result.current.setMode('off'));
    expect(result.current.mode).toBe('off');
    expect(result.current.position).toBeNull();
    expect(result.current.errorCode).toBeNull();
    expect(clearWatch).toHaveBeenCalledTimes(1);
  });

  it('releases an id returned after a synchronous permission denial', async () => {
    duringRegistration = (item) => {
      item.failure(failure());
      item.success(fix(90));
    };
    const { result, unmount } = renderHook(() => useGeolocation());
    await act(() => result.current.cycleMode());
    expect(result.current.mode).toBe('off');
    expect(result.current.errorCode).toBe('permission-denied');
    expect(result.current.position).toBeNull();
    expect(clearWatch).toHaveBeenCalledExactlyOnceWith(10);
    unmount();
    expect(clearWatch).toHaveBeenCalledTimes(1);
  });

  it('keeps a synchronous success subscribed until normal teardown', async () => {
    duringRegistration = (item) => item.success(fix(0));
    const { result, unmount } = renderHook(() => useGeolocation());
    await act(() => result.current.cycleMode());
    expect(result.current.mode).toBe('show');
    expect(result.current.position?.heading).toBe(0);
    expect(clearWatch).not.toHaveBeenCalled();
    unmount();
    expect(clearWatch).toHaveBeenCalledExactlyOnceWith(10);
  });

  it.each([2, 3])('keeps a synchronous temporary error %i subscribed for recovery', async (code) => {
    duringRegistration = (item) => item.failure(failure(code));
    const { result } = renderHook(() => useGeolocation());
    await act(() => result.current.cycleMode());
    expect(result.current.mode).toBe('show');
    expect(clearWatch).not.toHaveBeenCalled();
    act(() => watch().success(fix()));
    expect(result.current.errorCode).toBeNull();
  });

  it('survives clearWatch throwing while releasing a synchronous denial', async () => {
    clearWatch.mockImplementation(() => {
      throw new Error('device gone');
    });
    duringRegistration = (item) => item.failure(failure());
    const { result } = renderHook(() => useGeolocation());
    await act(() => result.current.cycleMode());
    expect(result.current.mode).toBe('off');
    expect(result.current.errorCode).toBe('permission-denied');
  });

  it.each([false, true])(
    'does not reopen tracking when a pending cycle is retired (unmount=%s)',
    async (unmountEarly) => {
      const { result, unmount } = renderHook(() => useGeolocation());
      await act(async () => {
        const pending = result.current.cycleMode();
        if (unmountEarly) unmount();
        else result.current.setMode('off');
        await pending;
      });
      expect(result.current.mode).toBe('off');
      expect(clearWatch).toHaveBeenCalledExactlyOnceWith(10);
    }
  );

  it('does not overwrite a newer follow mode when the older cycle settles', async () => {
    const { result } = renderHook(() => useGeolocation());
    await act(async () => {
      const pending = result.current.cycleMode();
      result.current.setMode('off');
      result.current.setMode('follow');
      await pending;
    });
    expect(result.current.mode).toBe('follow');
    expect(watches).toHaveLength(2);
    expect(clearWatch).not.toHaveBeenCalledWith(11);
  });

  it.each([
    [0, 1],
    [1, 0],
  ])('keeps only the latest pending permission run for grant order %s,%s', async (first, second) => {
    deferPermission();
    const { result } = renderHook(() => useGeolocation(), { wrapper: StrictMode });
    act(() => result.current.setMode('show'));
    act(() => result.current.setMode('off'));
    act(() => result.current.setMode('follow'));
    await grant(first);
    await grant(second);
    expect(watches).toHaveLength(1);
    expect(result.current.mode).toBe('follow');
    act(() => watch().success(fix()));
    expect(result.current.position).not.toBeNull();
  });

  it('does not create a watch when permission resolves after unmount', async () => {
    deferPermission();
    const { result, unmount } = renderHook(() => useGeolocation());
    act(() => result.current.setMode('show'));
    unmount();
    await grant(0);
    expect(watches).toHaveLength(0);
  });

  it('keeps a replacement position when a queued compass update is replayed', async () => {
    const { result } = renderHook(() => useGeolocation());
    await act(() => result.current.cycleMode());
    act(() => watch().success(fix()));
    const retired = orientationListener();
    act(() => {
      startTransition(() => retired(orientation(270)));
      result.current.setMode('off');
      result.current.setMode('show');
      watch(1).success(fix(90));
    });
    expect(result.current.mode).toBe('show');
    expect(result.current.position?.heading).toBe(90);
    expect(clearWatch).not.toHaveBeenCalledWith(11);
  });

  it('preserves current-watch recovery, compass smoothing, callback identities and denial', async () => {
    const { result } = renderHook(() => useGeolocation());
    const initialSetMode = result.current.setMode;
    await act(() => result.current.cycleMode());
    const currentCycle = result.current.cycleMode;
    act(() => watch().failure(failure(3)));
    expect(result.current.errorCode).toBe('timeout');
    act(() => watch().success(fix()));
    act(() => {
      window.dispatchEvent(orientation(350));
    });
    act(() => {
      window.dispatchEvent(orientation(10));
    });
    expect(result.current.position?.heading).toBe(355);
    expect(result.current.errorCode).toBeNull();
    expect(result.current.setMode).toBe(initialSetMode);
    expect(result.current.cycleMode).toBe(currentCycle);
    act(() => watch().failure(failure()));
    expect(result.current.mode).toBe('off');
    expect(result.current.errorCode).toBe('permission-denied');
    expect(clearWatch).toHaveBeenCalledExactlyOnceWith(10);
  });
});
