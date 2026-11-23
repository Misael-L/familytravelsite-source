import { useNetworkMode } from '../../hooks/useNetworkMode';
import { currentPlannerCreationPort } from '../../repo/plannerCreationPort';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { isFamilyRoutePlanningPreview } from './routePlanningPreview';
import { familyCanDo, useFamilyUiPermissions } from './uiPermissions';

function allowed(controller: ReturnType<typeof useFamilyUiPermissions.getState>['controller'], offline: boolean) {
  return isFamilyRoutePlanningPreview() && !offline && !!currentPlannerCreationPort() &&
    controller?.gov.layer === 'published' && controller.gov.actionOutcomes['trip.schedule.manage'] === 'direct' &&
    familyCanDo('day_edit', controller);
}

export function canAssignPreviewTour(): boolean {
  return allowed(useFamilyUiPermissions.getState().controller, isEffectivelyOffline());
}

export function useCanAssignPreviewTour(): boolean {
  const controller = useFamilyUiPermissions(state => state.controller);
  const { offline } = useNetworkMode();
  return allowed(controller, offline);
}
