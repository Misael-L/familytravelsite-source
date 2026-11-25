import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAssignment, buildDay, buildPlace, buildTrip } from '../../tests/helpers/factories';
import { resetAllStores } from '../../tests/helpers/store';
import type { calculateRouteWithLegs } from '../components/Map/RouteCalculator';
import { useSettingsStore } from '../store/settingsStore';
import { useTripStore } from '../store/tripStore';
import { useRouteCalculation } from './useRouteCalculation';

type Answer = Awaited<ReturnType<typeof calculateRouteWithLegs>>;
const transport = vi.hoisted(() => vi.fn());
vi.mock('../components/Map/RouteCalculator', async (original) => ({
  ...(await original<typeof import('../components/Map/RouteCalculator')>()),
  calculateRouteWithLegs: transport,
}));

function answer(offset = 0): Answer {
  return {
    coordinates: [
      [48 + offset, 11],
      [49 + offset, 12],
    ],
    distance: 1000,
    duration: 60,
    legs: [
      {
        from: [48, 11],
        to: [49, 12],
        mid: [48.5, 11.5],
        distance: 1000,
        duration: 60,
        distanceText: '1 km',
        durationText: '1 min',
        walkingText: '12 min',
        drivingText: '1 min',
      },
    ],
  };
}

function deferred() {
  let resolve!: (value: Answer) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Answer>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function seed(splitModes = false) {
  const places = [11, 12, 13].map((id) => buildPlace({ id, lat: 48 + id / 100, lng: 11 + id / 100 }));
  const assignments = {
    '1': places.map((place, order_index) =>
      buildAssignment({
        id: 21 + order_index,
        day_id: 1,
        order_index,
        place,
        leg_transport_mode: splitModes && order_index === 0 ? 'walking' : 'driving',
      })
    ),
  };
  useTripStore.setState({
    trip: buildTrip({ id: 42 }),
    days: [buildDay({ id: 1, trip_id: 42 })],
    places,
    assignments,
    reservations: [],
    selectedDayId: 1,
  });
}

function mount() {
  return renderHook(
    ({ day, enabled }: { day: number | null; enabled: boolean }) =>
      useRouteCalculation({ assignments: useTripStore((state) => state.assignments) }, day, enabled),
    { initialProps: { day: 1 as number | null, enabled: true } }
  );
}

beforeEach(() => {
  resetAllStores();
  transport.mockReset().mockResolvedValue(answer());
  useSettingsStore.setState((state) => ({ settings: { ...state.settings, optimize_from_accommodation: false } }));
});

describe('native route lifecycle through the real retry adapter', () => {
  it.each(['resolve', 'reject'] as const)(
    'clearing the selected day retires a pending %s without redrawing it',
    async (outcome) => {
      seed();
      const pending = deferred();
      transport.mockReturnValueOnce(pending.promise);
      const { result, rerender } = mount();
      const signal = transport.mock.calls[0][1].signal as AbortSignal;
      rerender({ day: null, enabled: true });
      expect(result.current.route).toBeNull();
      await act(async () => {
        if (outcome === 'resolve') pending.resolve(answer());
        else pending.reject(new Error('late network failure'));
      });
      expect(result.current.route).toBeNull();
      expect(result.current.routeSegments).toEqual([]);
      expect(result.current.routeVias).toEqual([]);
      expect(signal.aborted).toBe(true);
      expect(transport).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['resolve', 'reject'] as const)(
    'unmount cancels a pending %s before another transport mode is requested',
    async (outcome) => {
      seed(true);
      const pending = deferred();
      transport.mockReturnValueOnce(pending.promise);
      const { unmount } = mount();
      const signal = transport.mock.calls[0][1].signal as AbortSignal;
      unmount();
      await act(async () => {
        if (outcome === 'resolve') pending.resolve(answer());
        else pending.reject(new Error('late network failure'));
      });
      expect(signal.aborted).toBe(true);
      expect(transport).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['resolve', 'reject'] as const)(
    'turning routes off retires a pending %s before requesting the next leg',
    async (outcome) => {
      seed(true);
      const pending = deferred();
      transport.mockReturnValueOnce(pending.promise);
      const { result, rerender } = mount();
      rerender({ day: 1, enabled: false });
      await act(async () => {
        if (outcome === 'resolve') pending.resolve(answer());
        else pending.reject(new Error('late network failure'));
      });
      expect(result.current.route).toBeNull();
      expect(result.current.routeSegments).toEqual([]);
      expect(transport).toHaveBeenCalledTimes(1);
    }
  );

  it('a retired answer cannot overwrite a newly requested route or continue its old legs', async () => {
    seed(true);
    const pending = deferred();
    transport.mockReturnValueOnce(pending.promise);
    const { result } = mount();
    await act(async () => {
      await result.current.updateRouteForDay(1);
    });
    const current = result.current.route;
    const segments = result.current.routeSegments;
    const requests = transport.mock.calls.length;
    await act(async () => pending.resolve(answer(10)));
    expect(result.current.route).toBe(current);
    expect(result.current.routeSegments).toBe(segments);
    expect(transport).toHaveBeenCalledTimes(requests);
  });

  it('a current failure retains the native straight-line fallback and resolves its command', async () => {
    seed();
    transport.mockRejectedValue(new Error('router unavailable'));
    const { result } = mount();
    await act(async () => {
      await result.current.updateRouteForDay(1);
    });
    expect(result.current.route?.[0]).toEqual([
      [48.11, 11.11],
      [48.12, 11.12],
      [48.13, 11.13],
    ]);
    expect(result.current.routeSegments).toEqual([]);
  });
});
