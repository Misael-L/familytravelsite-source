import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  buildAssignment,
  buildDay,
  buildDayNote,
  buildPlace,
  buildReservation,
  buildTrip,
} from '../../../tests/helpers/factories';
import { resetAllStores } from '../../../tests/helpers/store';
import { installReadOnlySession } from '../../db/readOnlySession';
import { installPlannerAssignmentPort, type PlannerAssignmentPort } from '../../repo/plannerAssignmentPort';
import { installPlannerReadPort } from '../../repo/plannerReadPort';
import { useTripStore } from '../../store/tripStore';
import { getMergedItems, getTransportForDay } from '../../utils/dayMerge';
import { familyTimelineMoveUnavailable, saveFamilyTimelineOrder } from './familyTimelineReorder';

const toast = { info: vi.fn(), error: vi.fn() };
const trip = buildTrip({ id: 7, currency: 'USD' });
const day = buildDay({ id: 10, trip_id: 7 });
const nextDay = buildDay({ id: 11, trip_id: 7 });
const museum = buildPlace({ id: 21, name: 'Fixture museum', lat: null, lng: null, place_time: null });
const park = buildPlace({ id: 22, name: 'Fixture park', lat: null, lng: null, place_time: null });
const museumVisit = buildAssignment({ id: 101, day_id: 10, place: museum, order_index: 0 });
const parkVisit = buildAssignment({ id: 102, day_id: 10, place: park, order_index: 1 });
const note = buildDayNote({ id: 201, day_id: 10, sort_order: 3, text: 'Fixture note' });
const bus = buildReservation({
  id: 301,
  trip_id: 7,
  day_id: 10,
  title: 'Fixture bus',
  type: 'bus',
  day_plan_position: 2,
});
const t = (key: string) => key;

let release: Array<() => void> = [];
beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
});
afterEach(() => {
  release.reverse().forEach((close) => close());
  release = [];
  vi.restoreAllMocks();
});

function install() {
  const execute = vi.fn<PlannerAssignmentPort['execute']>(async (request) => {
    expect(request.action).toBe('reorder');
    if (request.action !== 'reorder') throw new Error('Unexpected fixture command');
    const current = useTripStore.getState().assignments[request.day];
    const ordered = request.order.map((id, order_index) => {
      const visit = current.find((item) => item.id === id);
      if (!visit) throw new Error('Missing fixture visit');
      return { ...visit, order_index };
    });
    useTripStore.setState((s) => ({ assignments: { ...s.assignments, [request.day]: ordered } }));
    return { state: 'published' };
  });
  release.push(
    installPlannerReadPort({ days: async () => ({ days: [day, nextDay] }), places: async () => ({ places: [] }) })
  );
  release.push(installPlannerAssignmentPort({ execute }));
  return execute;
}

function seed(overrides: Partial<ReturnType<typeof useTripStore.getState>> = {}) {
  useTripStore.setState({
    trip,
    days: [day, nextDay],
    places: [museum, park],
    assignments: { 10: [museumVisit, parkVisit] },
    reservations: [bus],
    dayNotes: { 10: [note] },
    ...overrides,
  });
}

it('refuses relocating a Family note before it disappears from the visible day', async () => {
  install();
  seed();
  const state = useTripStore.getState();
  const snapshots: Array<typeof state.dayNotes> = [];
  const unsubscribe = useTripStore.subscribe((next) => snapshots.push(next.dayNotes));
  try {
    await expect(state.moveDayNote(7, 10, 11, note.id)).rejects.toThrow('Native planner writes are not cut over');
    expect(snapshots).toEqual([]);
    expect(useTripStore.getState().dayNotes).toBe(state.dayNotes);
  } finally {
    unsubscribe();
  }
});

it('preserves hidden visits and drops an order prepared from a stale snapshot', async () => {
  const execute = install();
  const hidden = buildAssignment({ id: 103, day_id: 10, order_index: 1, accommodation_id: 91 });
  const last = { ...parkVisit, order_index: 2 };
  seed({ assignments: { 10: [museumVisit, hidden, last] } });
  const storedAssignments = useTripStore.getState().assignments;
  const before = getMergedItems({
    dayId: 10,
    dayAssignments: [museumVisit, last],
    dayNotes: [note],
    dayTransports: [],
  });
  seed({ assignments: storedAssignments, reservations: [] });
  const input = { tripId: 7, dayId: 10, before, requested: [before[1], before[0], before[2]], storedAssignments };
  const pushUndo = vi.fn();
  await saveFamilyTimelineOrder(input, { toast, t, pushUndo });
  expect(execute).toHaveBeenCalledExactlyOnceWith({ action: 'reorder', trip: 7, day: 10, order: [102, 103, 101] });
  await saveFamilyTimelineOrder(input, { toast, t, pushUndo });
  expect(toast.info).toHaveBeenCalledWith(familyTimelineMoveUnavailable);
  expect(execute).toHaveBeenCalledOnce();
  expect(pushUndo).toHaveBeenCalledOnce();
});

it('keeps a multi-leg booking fixed even though both rows share a reservation id', async () => {
  const execute = install();
  const flight = {
    ...bus,
    type: 'flight' as const,
    metadata: JSON.stringify({
      legs: [
        { dep_day_id: 10, arr_day_id: 10, dep_time: '10:00', arr_time: '11:00', from: 'AAA', to: 'BBB' },
        { dep_day_id: 10, arr_day_id: 10, dep_time: '12:00', arr_time: '14:00', from: 'BBB', to: 'CCC' },
      ],
    }),
  };
  seed({ reservations: [flight] });
  const state = useTripStore.getState();
  const dayTransports = getTransportForDay({
    reservations: state.reservations,
    dayId: 10,
    dayAssignmentIds: [101, 102],
    days: state.days,
  });
  expect(dayTransports).toHaveLength(2);
  const before = getMergedItems({ dayId: 10, dayAssignments: state.assignments[10], dayNotes: [note], dayTransports });
  const legs = before.flatMap((row, i) => (row.type === 'transport' ? [i] : []));
  const requested = [...before];
  [requested[legs[0]], requested[legs[1]]] = [requested[legs[1]], requested[legs[0]]];
  await saveFamilyTimelineOrder(
    { tripId: 7, dayId: 10, before, requested, storedAssignments: state.assignments },
    { toast, t }
  );
  expect(toast.info).toHaveBeenCalledWith(familyTimelineMoveUnavailable);
  expect(execute).not.toHaveBeenCalled();
  expect(useTripStore.getState().reservations).toBe(state.reservations);
});

it('keeps the original read-only lease in front of the visit command', async () => {
  const execute = install();
  seed({ reservations: [], dayNotes: {} });
  const storedAssignments = useTripStore.getState().assignments;
  const before = getMergedItems({ dayId: 10, dayAssignments: storedAssignments[10], dayNotes: [], dayTransports: [] });
  const closeLease = installReadOnlySession();
  try {
    await saveFamilyTimelineOrder(
      { tripId: 7, dayId: 10, before, requested: [...before].reverse(), storedAssignments },
      { toast, t }
    );
    expect(execute).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('read only'));
  } finally {
    closeLease();
  }
});
