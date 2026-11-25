import { isFamilyFrontendActive } from '../../integrations/family/runtime';
import { currentPlannerBookingPort } from '../../repo/plannerBookingPort';

/** Booking review still requires the native, unqualified reservation writer. */
export function canReviewBookingImport() {
  return !isFamilyFrontendActive() && !currentPlannerBookingPort();
}
