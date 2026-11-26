import { isTransportReservationType } from '@trek/shared';
import { create } from 'zustand';
import { hasReadOnlySession } from '../../db/readOnlySession';
import type { FamilyControllerValue } from './controllerContext';
import { writeModeForCapability } from './legacy/pages/familyTripWorkspace/workspaceGovernanceModel';
import { isFamilyFrontendActive } from './runtime';
const capabilities: Record<string, string> = {
  day_edit: 'trip.schedule.manage',
  place_edit: 'trip.places.manage',
  reservation_edit: 'trip.reservations.manage',
  budget_edit: 'trip.costs.manage',
  packing_edit: 'trip.packing.manage',
  todo_edit: 'trip.todos.manage',
  file_upload: 'trip.files.upload',
  file_edit: 'trip.files.metadata',
  file_delete: 'trip.files.trash',
  trip_edit: 'trip.metadata.edit',
  trip_delete: 'trip.archive',
  trip_title_edit: 'trip.metadata.edit',
  trip_dates_edit: 'trip.metadata.edit',
  trip_assign_dates: 'trip.metadata.edit',
};
export type FamilyPermissionController = Pick<FamilyControllerValue, 'gov'> &
  Partial<Pick<FamilyControllerValue, 'core' | 'partialLoad'>> & {
    isCurrent?: () => boolean;
    supportsAction?: (action: string) => boolean;
  };
export const useFamilyUiPermissions = create<{ controller: FamilyPermissionController | null }>(() => ({
  controller: null,
}));
export function familyCanDo(action: string, controller: FamilyPermissionController | null) {
  if (hasReadOnlySession()) return false;
  if (!controller || controller.isCurrent?.() === false || controller.supportsAction?.(action) === false) return false;
  const key = capabilities[action];
  if (!key) return false;
  const gov = controller.gov;
  if (action === 'trip_assign_dates') return gov.layer === 'published' &&
    gov.actionOutcomes['trip.metadata.edit'] === 'direct' && gov.actionOutcomes['trip.schedule.manage'] === 'direct';
  if (action === 'todo_edit' || action === 'packing_edit') return gov.actionOutcomes[key] === 'direct';
  const mode = writeModeForCapability({
    layer: gov.layer,
    outcome: gov.actionOutcomes[key] ?? 'deny',
    key,
    isHof: gov.canMutate,
  });
  return mode === 'direct' || mode === 'draft';
}

// The Family planner can read saved transport, but lacks its editor and transit search APIs.
export function transportPlannerActionsAvailable(): boolean {
  return !isFamilyFrontendActive();
}

export function familyReservationEditable(reservation: { type: string }): boolean {
  return (
    !isTransportReservationType(reservation.type) &&
    familyCanDo('reservation_edit', useFamilyUiPermissions.getState().controller)
  );
}
