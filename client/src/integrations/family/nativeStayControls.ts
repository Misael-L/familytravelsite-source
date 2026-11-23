import { AxiosError, AxiosHeaders } from 'axios';
import { hasReadOnlySession } from '../../db/readOnlySession';
import type { PlannerStayWritePort } from '../../repo/plannerStayPort';
import type { NativeStaySessionEnvironment } from './nativeStayCommandSession';
import { createNativeStayCreation } from './nativeStayCreation';
import { createNativeStayLifecycle } from './nativeStayLifecycle';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import { useFamilyUiPermissions } from './uiPermissions';

/** Current Direct admission only; a saved capability, private draft or retired publication is insufficient. */
export function nativeStayControlsAllowed(creation = false) {
  const controller = useFamilyUiPermissions.getState().controller;
  return (
    !hasReadOnlySession() &&
    !!controller &&
    controller.isCurrent?.() !== false &&
    controller.gov.layer === 'published' &&
    controller.supportsAction?.('day_edit') !== false &&
    controller.gov.actionOutcomes['trip.schedule.manage'] === 'direct' &&
    (!creation ||
      (controller.supportsAction?.('reservation_edit') !== false &&
        controller.gov.actionOutcomes['trip.reservations.manage'] === 'direct'))
  );
}
/** One combined local candidate; both halves retain the original command and use the owned complete refresher. */
export function createNativeStayControls(
  repo: FamilyFrontendRepository,
  env: NativeStaySessionEnvironment
): PlannerStayWritePort {
  const creation = createNativeStayCreation(repo, { ...env, allowed: () => nativeStayControlsAllowed(true) });
  const lifecycle = createNativeStayLifecycle(repo, { ...env, allowed: () => nativeStayControlsAllowed() });
  return {
    captureCreation: creation.captureCreation,
    eligibleLodging: creation.eligibleLodging,
    create: nativeStayUiCall(creation.create),
    update: nativeStayUiCall(lifecycle.update),
    trash: nativeStayUiCall(lifecycle.trash),
    trashPage: nativeStayUiCall(lifecycle.trashPage),
    restore: nativeStayUiCall(lifecycle.restore),
  };
}
/** Native TREK's save handlers read response.data.error. Translate only the public Family refusal at this boundary. */
export function nativeStayUiCall<A extends unknown[], R>(action: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    try {
      return await action(...args);
    } catch (error) {
      if (!(error instanceof FamilyApiError)) throw error;
      const config = { headers: new AxiosHeaders() };
      throw new AxiosError(
        error.message,
        error.status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
        config,
        undefined,
        {
          status: error.status,
          statusText: 'Family request refused',
          config,
          headers: {},
          data: { error: error.message, code: error.code },
        }
      );
    }
  };
}
