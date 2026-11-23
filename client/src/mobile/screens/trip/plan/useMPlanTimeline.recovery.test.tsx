import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { buildAssignment, buildDay, buildPlace } from '../../../../../tests/helpers/factories';
import { useTripStore } from '../../../../store/tripStore';
import type { TripPlanner } from '../MTripShell';
import { useMPlanTimeline } from './useMPlanTimeline';

vi.mock('../../../../hooks/useRouteCalculation', () => ({ useRouteCalculation: () => ({ routeSegments: [] }) }));
vi.mock('../../../../components/Planner/useLegModeActions', () => ({
  useLegModeActions: () => ({ routeModeOptions: [], persistLegMode: vi.fn() }),
}));
vi.mock('../../../../components/Planner/useTransitLegPlanner', () => ({
  useTransitLegPlanner: () => ({ legFor: vi.fn(), plan: vi.fn(), lateBefore: vi.fn() }),
}));

function fixture() {
  const day = buildDay({ id: 1, trip_id: 11, date: '2027-04-01' });
  const assignments = [1, 2].map((id) =>
    buildAssignment({
      id,
      day_id: 1,
      order_index: id - 1,
      assignment_time: null,
      place: buildPlace({ id, lat: null, lng: null, place_time: null }),
    })
  );
  const actions = {
    reorderAssignments: vi.fn(async () => undefined),
    refreshDays: vi.fn(async () => undefined),
    loadReservations: vi.fn(async () => undefined),
  };
  const pushUndo = vi.fn(),
    updateRouteForDay = vi.fn(),
    toast = { error: vi.fn(), info: vi.fn(), success: vi.fn() };
  const planner = {
    tripId: 11,
    selectedDayId: 1,
    days: [day],
    assignments: { '1': assignments },
    reservations: [],
    tripAccommodations: [],
    places: assignments.map((a) => a.place),
    tours: [],
    toursEnabled: false,
    t: (key: string) => key,
    language: 'en',
    settings: {},
    roadtripVias: { byDay: {} },
    routeProfile: 'foot',
    tripActions: actions,
    pushUndo,
    updateRouteForDay,
    toast,
  } as unknown as TripPlanner;
  return { planner, actions, pushUndo, updateRouteForDay, toast };
}

beforeEach(() => useTripStore.getState().resetTrip());
it.each(['days', 'reservations', 'both'])(
  'native phone reorder handles a refused %s recovery read without another writer or Undo',
  async (failure) => {
    const f = fixture();
    f.actions.reorderAssignments.mockRejectedValue(new Error('Original remains unresolved'));
    if (failure !== 'reservations') f.actions.refreshDays.mockRejectedValue(new Error('Planner read held'));
    if (failure !== 'days') f.actions.loadReservations.mockRejectedValue(new Error('Reservation read held'));
    const hook = renderHook(() => useMPlanTimeline(f.planner));
    act(() => hook.result.current.moveRow(hook.result.current.merged[0], 'down'));
    await waitFor(() => expect(f.actions.loadReservations).toHaveBeenCalledOnce());
    // Let both native rejection handlers run; an escaped rejection fails this test run.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(f.actions.reorderAssignments).toHaveBeenCalledExactlyOnceWith(11, 1, [2, 1]);
    expect(f.actions.refreshDays).toHaveBeenCalledExactlyOnceWith(11);
    expect(f.actions.loadReservations).toHaveBeenCalledExactlyOnceWith(11);
    expect(f.toast.error).toHaveBeenCalledWith('Original remains unresolved');
    expect(f.pushUndo).not.toHaveBeenCalled();
    expect(f.updateRouteForDay).not.toHaveBeenCalled();
  }
);
it('successful native phone reorder retains its original Undo and route behavior', async () => {
  const f = fixture(),
    hook = renderHook(() => useMPlanTimeline(f.planner));
  act(() => hook.result.current.moveRow(hook.result.current.merged[0], 'down'));
  await waitFor(() => expect(f.pushUndo).toHaveBeenCalledOnce());
  expect(f.actions.refreshDays).not.toHaveBeenCalled();
  expect(f.actions.loadReservations).not.toHaveBeenCalled();
  expect(f.updateRouteForDay).toHaveBeenCalledExactlyOnceWith(1);
  await f.pushUndo.mock.calls[0][1]();
  expect(f.actions.reorderAssignments.mock.calls).toEqual([
    [11, 1, [2, 1]],
    [11, 1, [1, 2]],
  ]);
});
