import type { PlaceSubmitData } from '../../components/Planner/PlaceFormModal';
import type { PlannerAssignmentRequest } from '../../repo/plannerAssignmentPort';
import type { Assignment, Day } from '../../types';
import type { CalendarChange } from './plannerCalendarContract';
import { FamilyApiError } from './repository';
type State = { days: Day[]; assignments: Record<string, Assignment[]> };
type Visit = Assignment & { family_visit?: { owning_stay_id?: string; trip_day_id?: string } };
const owned = (a: Assignment | undefined) => typeof (a as Visit | undefined)?.family_visit?.owning_stay_id === 'string';
const refuse = () => {
  throw new FamilyApiError(
    409,
    'native_stay_arrival_action',
    'This arrival belongs to a lodging. Use the lodging controls to change its dates or remove it.'
  );
};
export function guardNativeStayArrangement(request: PlannerAssignmentRequest, state: State) {
  if (request.action === 'reorder' || (request.action === 'move' && request.from === request.to)) return;
  const day = request.action === 'move' ? request.from : request.day;
  const rows = state.assignments[String(day)] ?? [];
  if (request.action === 'clear' ? rows.some(owned) : rows.some((a) => a.id === request.visit && owned(a))) refuse();
}
/** Calendar facts may change only if every active owned arrival keeps its original civil day. */
export function guardNativeStayCalendar(change: CalendarChange, state: State) {
  const indices = state.days.flatMap((d, i) => ((state.assignments[String(d.id)] ?? []).some(owned) ? [i] : []));
  if (indices.length === 0 || ['title', 'append', 'extend'].includes(change.action)) return;
  if (change.action === 'insert') {
    if (indices.some((i) => i >= change.position - 1)) refuse();
    return;
  }
  if (change.action === 'reorder') {
    for (const i of indices) {
      const day = state.days[i] as Day & { family_day?: { id?: string } };
      if (!day.family_day?.id || change.order.indexOf(day.family_day.id) !== i) refuse();
    }
    return;
  }
  if (change.action === 'trash_day' || change.action === 'remove_day' || change.action === 'undo_insert') {
    const i = state.days.findIndex(
      (d) => (d as Day & { family_day?: { id?: string } }).family_day?.id === change.day_id
    );
    if (i < 0 || indices.some((n) => n >= i)) refuse();
    return;
  }
  // Restore/order-Undo requires an archived insertion position not present in the active native view.
  refuse();
}
export function guardNativeStayVisitClocks(assignment: Assignment | undefined, data: PlaceSubmitData) {
  if (!owned(assignment)) return;
  if (
    (data.place_time && data.place_time !== assignment?.assignment_time) ||
    (data.end_time && data.end_time !== assignment?.assignment_end_time)
  )
    throw new FamilyApiError(
      409,
      'native_stay_arrival_clock',
      'Set check-in guidance in the lodging editor. Its arrival stays untimed.'
    );
}
