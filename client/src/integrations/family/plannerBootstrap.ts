import {
  packingAggregateQualificationEnabled,
  packingBagQualificationEnabled,
  packingCategoryQualificationEnabled,
  packingIdentityQualificationEnabled,
  packingRecoveryQualificationEnabled,
} from './offlineTripQualification';
import { createFamilyPlannerCohort } from './plannerCohort';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyHandler } from './transport';

/** Only Trip-scoped planner contracts enter the private read/session boundary.
 * Authentication, public routes and account bootstrap remain on the application handler. */
export function isPlannerRequest(path: string): boolean {
  return (
    /^\/trips\/[^/]+(?:\/|$)/.test(path) ||
    /^\/(?:day-schedule|day-tints|map-markers|map-layers|trip-warnings)\/[^/]+$/.test(path) ||
    /^\/view-contributions\/[^/]+\/[^/]+$/.test(path)
  );
}

/** One composition owns transport dispatch, native ports and the route controller together. */
export function installFamilyPlanner(repo: FamilyFrontendRepository, application: FamilyHandler) {
  const recovery = packingRecoveryQualificationEnabled();
  const bags = packingBagQualificationEnabled() || recovery;
  const cohort = createFamilyPlannerCohort(repo, {
    bagManagement: bags,
    bagRecovery: recovery,
    application,
    categoryMetadata: packingCategoryQualificationEnabled(),
    categoryIdentity: packingIdentityQualificationEnabled() || packingAggregateQualificationEnabled() || bags,
    categoryAggregates: packingAggregateQualificationEnabled() || bags,
    reportError: (error) =>
      window.alert(error instanceof Error ? error.message : 'The planner action could not complete.'),
  });
  let release: () => void;
  try {
    release = cohort.install();
  } catch (error) {
    cohort.dispose();
    throw error;
  }
  let disposed = false;
  const handle: FamilyHandler = (request) => {
    if (disposed)
      return Promise.reject(new FamilyApiError(409, 'planner_cohort_disposed', 'This planner session ended.'));
    return isPlannerRequest(request.pathname) ? cohort.handle(request) : application(request);
  };
  return {
    handle,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      release();
    },
  };
}
