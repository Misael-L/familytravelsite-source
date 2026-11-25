import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAssignment, buildDay, buildPlace, buildTrip } from '../../tests/helpers/factories';
import { resetAllStores } from '../../tests/helpers/store';
import type { calculateRouteWithLegs } from '../components/Map/RouteCalculator';
import { useSettingsStore } from '../store/settingsStore';
import { useTripStore } from '../store/tripStore';
import type { Accommodation, Day } from '../types';
import { useRouteCalculation } from './useRouteCalculation';

type Answer = Awaited<ReturnType<typeof calculateRouteWithLegs>>;
const transport = vi.hoisted(() => vi.fn());
vi.mock('../components/Map/RouteCalculator', async (original) => ({
  ...(await original<typeof import('../components/Map/RouteCalculator')>()),
  calculateRouteWithLegs: transport,
}));

const hotel = [48.1, 11.1];
const stops = [
  [48.11, 11.11],
  [48.12, 11.12],
];
const stays: Accommodation[] = [
  { id: 5, trip_id: 42, place_id: 50, start_day_id: 1, end_day_id: 3, place_lat: 48.1, place_lng: 11.1 },
];

function calendar(outside = false, numbered = true): Day[] {
  return (outside ? [1, 3, 2] : [1, 2, 3]).map((id, index) =>
    buildDay({
      id,
      trip_id: 42,
      date: `2027-04-0${id}`,
      ...(numbered ? { day_number: index + 1 } : {}),
    })
  );
}

function seed(outside = false, numbered = true) {
  const places = [buildPlace({ id: 11, lat: 48.11, lng: 11.11 }), buildPlace({ id: 12, lat: 48.12, lng: 11.12 })];
  const assignments = {
    '2': places.map((place, order_index) => buildAssignment({ id: 21 + order_index, day_id: 2, order_index, place })),
  };
  useTripStore.setState({
    trip: buildTrip({ id: 42 }),
    days: calendar(outside, numbered),
    places,
    assignments,
    reservations: [],
    selectedDayId: 2,
  });
}

function mount(enabled = true) {
  return renderHook(() =>
    useRouteCalculation({ assignments: useTripStore((state) => state.assignments) }, 2, enabled, 'driving', stays)
  );
}

async function settle() {
  await act(async () => {});
}

async function reorder(outside: boolean, numbered = true) {
  const { places, assignments, reservations } = useTripStore.getState();
  await act(async () => {
    useTripStore.setState({ days: calendar(outside, numbered) });
  });
  expect(useTripStore.getState().places).toBe(places);
  expect(useTripStore.getState().assignments).toBe(assignments);
  expect(useTripStore.getState().reservations).toBe(reservations);
}

beforeEach(() => {
  resetAllStores();
  transport.mockReset().mockImplementation(async (points: Array<{ lat: number; lng: number }>) => ({
    coordinates: points.map((point) => [point.lat, point.lng]),
    legs: [],
    distance: 1000,
    duration: 60,
  }));
  useSettingsStore.setState((state) => ({ settings: { ...state.settings, optimize_from_accommodation: true } }));
});

describe('native route calendar dependency through real topology and retry adapters', () => {
  it.each([true, false])(
    'removes stale hotel legs when calendar order leaves the stay (numbered=%s)',
    async (numbered) => {
      seed(false, numbered);
      const { result, rerender } = mount();
      await settle();
      expect(result.current.route?.flat()[0]).toEqual(hotel);
      expect(result.current.route?.flat().slice(-1)[0]).toEqual(hotel);
      expect(result.current.route?.flat()).toEqual(expect.arrayContaining(stops));
      await reorder(true, numbered);
      rerender(); // The native planner also observes days; a parent render alone must not be required to fix routing.
      await settle();
      expect(result.current.route).toEqual([stops]);
    }
  );

  it.each([true, false])(
    'adds hotel legs when the calendar moves the selected day into the stay (numbered=%s)',
    async (numbered) => {
      seed(true, numbered);
      const { result } = mount();
      await settle();
      expect(result.current.route).toEqual([stops]);
      await reorder(false, numbered);
      expect(result.current.route?.flat()[0]).toEqual(hotel);
      expect(result.current.route?.flat().slice(-1)[0]).toEqual(hotel);
      expect(result.current.route?.flat()).toEqual(expect.arrayContaining(stops));
    }
  );

  it.each(['resolve', 'reject'] as const)(
    'retires a pending route after calendar replacement, including a late %s',
    async (outcome) => {
      seed();
      let resolve!: (answer: Answer) => void;
      let reject!: (reason: Error) => void;
      transport.mockReturnValueOnce(
        new Promise<Answer>((yes, no) => {
          resolve = yes;
          reject = no;
        })
      );
      const { result } = mount();
      const oldSignal = transport.mock.calls[0][1].signal as AbortSignal;
      await reorder(true);
      const requests = transport.mock.calls.length;
      await act(async () => {
        if (outcome === 'resolve')
          resolve({
            coordinates: [
              [55, 15],
              [56, 16],
            ],
            legs: [],
            distance: 1,
            duration: 1,
          });
        else reject(new Error('retired provider failure'));
      });
      expect(oldSignal.aborted).toBe(true);
      expect(result.current.route).toEqual([stops]);
      expect(transport).toHaveBeenCalledTimes(requests);
    }
  );

  it('keeps the native straight-line fallback tied to the updated calendar on a current provider failure', async () => {
    seed();
    const { result } = mount();
    await settle();
    transport.mockRejectedValue(new Error('provider unavailable'));
    await reorder(true);
    expect(result.current.route).toEqual([stops]);
    expect(result.current.routeSegments).toEqual([]);
  });

  it('continues rerouting after a collaborator changes the selected day default mode', async () => {
    seed();
    mount();
    await settle();
    transport.mockClear();
    await act(async () => {
      useTripStore.setState((state) => ({
        days: state.days.map((day) => (day.id === 2 ? { ...day, default_transport_mode: 'walking' } : day)),
      }));
    });
    expect(transport).toHaveBeenCalled();
    expect(transport.mock.calls.every((call) => call[1].profile === 'walking')).toBe(true);
  });

  it('does not send another request for an unrelated parent render with unchanged route inputs', async () => {
    seed();
    const { rerender } = mount();
    await settle();
    const count = transport.mock.calls.length;
    rerender();
    await settle();
    expect(transport).toHaveBeenCalledTimes(count);
  });

  it('leaves route calculation disabled through calendar replacement', async () => {
    seed();
    const { result } = mount(false);
    await reorder(true);
    expect(result.current.route).toBeNull();
    expect(transport).not.toHaveBeenCalled();
  });

  it('preserves direct current-store reads by an already captured imperative command', async () => {
    seed();
    const { result } = mount();
    await settle();
    const command = result.current.updateRouteForDay;
    await act(async () => {
      useTripStore.setState({ days: calendar(true) });
      await command(2);
    });
    expect(result.current.route).toEqual([stops]);
  });
});
