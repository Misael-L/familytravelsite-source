import { hasReadOnlySession } from '../../db/readOnlySession';
import { currentPlannerAssignmentPort } from '../../repo/plannerAssignmentPort';
import { currentPlannerReadPort } from '../../repo/plannerReadPort';
import { captureTripRead } from '../../store/tripReadScope';
import { useTripStore, type TripStoreState } from '../../store/tripStore';
import type { TranslationFn } from '../../types';
import { getMergedItems, getTransportForDay, stopDayIds, type MergedItem } from '../../utils/dayMerge';

type Assignments = TripStoreState['assignments'];
type PushUndo = (label: string, undo: () => Promise<void>, dayIds: number[], placeIds: number[]) => void;
type Toast = { info: (message: string) => void; error: (message: string) => void };

export const familyTimelineMoveUnavailable =
  'That move needs a booking, note, or visit-time change that Family cannot save here.';

export function familyTimelineIsVisitOnly() {
  return currentPlannerReadPort() !== null || hasReadOnlySession();
}

interface FamilyTimelineOrder {
  tripId: number | string;
  dayId: number;
  before: readonly MergedItem[];
  requested: readonly MergedItem[];
  storedAssignments: Assignments;
  bookingAssignments?: Assignments;
}

function sameRows(a: readonly MergedItem[], b: readonly MergedItem[]) {
  return (
    a.length === b.length &&
    a.every(
      (row, i) =>
        row.type === b[i].type && row.data.id === b[i].data.id && row.data.__leg?.index === b[i].data.__leg?.index
    )
  );
}

/** Project the visit command against the current native reader, using the original booking and note values. */
function preflight(input: FamilyTimelineOrder, state: TripStoreState) {
  const { tripId, dayId, before, requested, storedAssignments, bookingAssignments = storedAssignments } = input;
  if (!state.trip || String(state.trip.id) !== String(tripId) || state.assignments !== storedAssignments) return;
  if (!state.days.some((d) => d.id === dayId)) return;

  const day = (state.assignments[dayId] ?? []).slice().sort((a, b) => a.order_index - b.order_index);
  const visible = new Set(before.filter((row) => row.type === 'place').map((row) => row.data.id));
  const dayTransports = getTransportForDay({
    reservations: state.reservations,
    dayId,
    days: state.days,
    dayAssignmentIds: (bookingAssignments[dayId] ?? []).map((a) => a.id),
    stopDays: stopDayIds(bookingAssignments),
  });
  const project = (visits: typeof day) =>
    getMergedItems({
      dayId,
      dayNotes: state.dayNotes[dayId] ?? [],
      dayTransports,
      dayAssignments: visits.filter((a) => visible.has(a.id)),
    });
  if (!sameRows(before, project(day))) return;

  const requestedIds = requested.filter((row) => row.type === 'place').map((row) => row.data.id);
  if (
    requestedIds.length !== visible.size ||
    new Set(requestedIds).size !== visible.size ||
    requestedIds.some((id) => !visible.has(id))
  )
    return;
  const byId = new Map(day.map((a) => [a.id, a]));
  let next = 0;
  const ordered: typeof day = [];
  for (const visit of day) {
    const row = visible.has(visit.id) ? byId.get(requestedIds[next++]) : visit;
    if (!row) return;
    ordered.push({ ...row, order_index: ordered.length });
  }
  if (!sameRows(requested, project(ordered))) return;
  return { day, ordered };
}

export async function saveFamilyTimelineOrder(
  input: FamilyTimelineOrder,
  {
    toast,
    t,
    pushUndo,
    onSaved,
  }: { toast: Toast; t: TranslationFn; pushUndo?: PushUndo; onSaved?: (dayId: number) => void }
) {
  const planner = currentPlannerAssignmentPort();
  const state = useTripStore.getState();
  const plan = planner && preflight(input, state);
  if (!planner || !plan) {
    toast.info(familyTimelineMoveUnavailable);
    return;
  }
  const { tripId, dayId } = input;
  const previous = plan.day.map((a) => a.id);
  const order = plan.ordered.map((a) => a.id);
  if (order.every((id, i) => id === previous[i])) return;

  const sameTrip = captureTripRead(tripId, useTripStore.getState);
  const ownsCommand = () => sameTrip() && planner === currentPlannerAssignmentPort();
  try {
    await state.reorderAssignments(tripId, dayId, order);
    if (!ownsCommand()) return;
    pushUndo?.(
      t('undo.reorder'),
      async () => {
        if (!ownsCommand()) throw new Error(familyTimelineMoveUnavailable);
        await state.reorderAssignments(tripId, dayId, previous);
      },
      [dayId],
      [...new Set(plan.day.map((a) => a.place_id))]
    );
    onSaved?.(dayId);
  } catch (err) {
    if (ownsCommand()) toast.error(err instanceof Error ? err.message : t('trip.toast.reorderError'));
  }
}
