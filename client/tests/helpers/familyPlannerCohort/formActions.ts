import { vi } from 'vitest';
import type { PlaceSubmitData } from '../../../src/components/Planner/PlaceFormModal';
import { DEFAULT_FORM, placeFormPayload } from '../../../src/components/Planner/PlaceFormModal.helpers';
import { usePlannerHistory } from '../../../src/hooks/usePlannerHistory';
import { useDayAdd } from '../../../src/pages/tripPlanner/useDayAdd';
import { useDayDelete } from '../../../src/pages/tripPlanner/useDayDelete';
import { useDayPlanEdits } from '../../../src/pages/tripPlanner/useDayPlanEdits';
import { useTripStore } from '../../../src/store/tripStore';
import { renderHook } from '../render';
import { load, required } from './core';
import { cohortState, toast } from './state';

export function newData(over: Partial<PlaceSubmitData> = {}): PlaceSubmitData {
  return { ...placeFormPayload({ ...DEFAULT_FORM }, [], null), name: 'New native location', ...over };
}

export async function beginNew(onDay = false) {
  await load();
  const context = {
    tripId: required(useTripStore.getState().trip).id,
    dayId: onDay ? useTripStore.getState().days[0].id : null,
    position: null,
  };
  await cohortState.cohort.creation.beginForm(context);
  return context;
}

export function nativeDayHook() {
  const st = useTripStore.getState(),
    undo = vi.fn(),
    reanchor = vi.fn(),
    route = vi.fn();
  const hook = renderHook(() =>
    useDayPlanEdits({
      tripId: required(st.trip).id,
      tripActions: useTripStore.getState(),
      toast,
      t: (k: string) => k,
      selectedDayId: st.days[0].id,
      storedAssignments: st.assignments,
      places: st.places,
      tripAccommodations: [],
      isTourPlace: () => false,
      pushUndo: undo,
      reloadTourPlaceIds: vi.fn(),
      updateRouteForDay: route,
      roadtripVias: { byDay: {}, reanchor },
      roadtripStopsOf: () => [],
      viasAfterInsert: vi.fn(),
    } as unknown as Parameters<typeof useDayPlanEdits>[0])
  );
  return { ...hook, undo, reanchor, route };
}

export function nativeAddHook(canEditDays = true) {
  const undo = vi.fn();
  const hook = renderHook(() => {
    const trip = useTripStore((s) => s.trip),
      days = useTripStore((s) => s.days);
    return useDayAdd({
      tripId: Number(required(trip).id),
      trip,
      days,
      canEditDays,
      t: (k: string) => k,
      locale: 'en',
      toast,
      pushUndo: undo,
    });
  });
  return { ...hook, undo };
}

export function addWithNativeHistory() {
  const removed = vi.fn();
  const hook = renderHook(() => {
    const history = usePlannerHistory(),
      trip = useTripStore((s) => s.trip),
      days = useTripStore((s) => s.days);
    const add = useDayAdd({
      tripId: Number(required(trip).id),
      trip,
      days,
      canEditDays: true,
      t: (k: string) => k,
      locale: 'en',
      toast,
      pushUndo: history.pushUndo,
      onInsertionUndone: removed,
    });
    return { ...add, history };
  });
  return { ...hook, removed };
}

export function removalHook(canEditDays = true) {
  const removed = vi.fn(),
    routeTripId = Number(required(useTripStore.getState().trip).id);
  const hook = renderHook(() => {
    const trip = useTripStore((s) => s.trip),
      days = useTripStore((s) => s.days),
      places = useTripStore((s) => s.places),
      history = usePlannerHistory();
    const deletion = useDayDelete({
      tripId: routeTripId,
      trip,
      days,
      places,
      reservations: [],
      accommodations: [],
      canEditDays,
      t: (k: string) => k,
      locale: 'en',
      toast,
      onDeleted: removed,
      pushUndo: history.pushUndo,
    });
    return { ...deletion, history };
  });
  return { ...hook, removed };
}
