import { currentPlannerPackingPort } from '../../repo/plannerPackingPort';
import { currentPlannerTaskPort } from '../../repo/plannerTaskPort';
import { currentPlannerCalendarPort } from '../../repo/plannerCalendarPort';
/** Native permission keys are broader than individual commands. This is availability,
 * not Family authorization: both must pass, and unsupported raw writers still refuse. */
export const plannerActionSupport = {
  day_edit: 'observed day/calendar commands',
  place_edit: 'observed saved-location/visit forms and scheduling',
  reservation_edit: 'observed booking forms only; raw repository mutations still refuse',
} as const;
/** Unqualified and unknown native actions cannot become writable from a server grant alone. */
export function plannerActionAvailable(action: string): boolean {
  if (action === 'packing_edit') return currentPlannerPackingPort() !== null;
  if (action === 'todo_edit') return currentPlannerTaskPort() !== null;
  if (action === 'trip_assign_dates') return currentPlannerCalendarPort() !== null;
  return Object.prototype.hasOwnProperty.call(plannerActionSupport, action);
}
