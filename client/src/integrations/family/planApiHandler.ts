import { handleFamilyBookingCalendar } from './bookingCalendarHandler';
import { handleFamilyBookingDetails } from './bookingDetailsHandler';
import { handleFamilyBookingStayView } from './bookingStayRead';
import { handleFamilyDestinationBridge } from './destinationBridge';
import { handleFamilyGovernance } from './governanceHandler';
import { NOT_HANDLED } from './listHandler';
import { handleFamilyLocationForm } from './locationFormHandler';
import { handleFamilyPlanChanges } from './planChanges';
import { handleFamilyPlanEntries } from './planEntries';
import { handleFamilyPlanLocations } from './planLocationHandler';
import { handleFamilyPlannerArrangement } from './plannerArrangementHandler';
import { handleFamilyPlannerCalendar } from './plannerCalendarHandler';
import { handleFamilyPlannerCreation } from './plannerCreationHandler';
import { handleFamilyPlannerEditorCommand } from './plannerEditorCommand';
import { handleFamilyPlannerState } from './plannerState';
import { handleFamilyPlannerView } from './plannerView';
import { handleFamilyPlanVisits } from './planVisits';
import type { FamilyFrontendRepository } from './repository';
import { handleFamilyStays } from './stayHandler';
import type { FamilyRequest } from './transport';
import { handleFamilyVisitCommands } from './visitCommands';
import { handleFamilyVisitForm } from './visitFormHandler';
import { handleFamilyVisitTiming } from './visitTiming';

const handlers = [
  handleFamilyBookingStayView,
  handleFamilyStays,
  handleFamilyGovernance,
  handleFamilyBookingDetails,
  handleFamilyBookingCalendar,
  handleFamilyPlannerCalendar,
  handleFamilyPlannerArrangement,
  handleFamilyPlannerCreation,
  handleFamilyPlannerEditorCommand,
  handleFamilyPlannerView,
  handleFamilyVisitForm,
  handleFamilyLocationForm,
  handleFamilyDestinationBridge,
  handleFamilyPlannerState,
  handleFamilyPlanEntries,
  handleFamilyPlanChanges,
  handleFamilyVisitTiming,
  handleFamilyVisitCommands,
  handleFamilyPlanVisits,
  handleFamilyPlanLocations,
];

/** Keeps the versioned plan APIs together while preserving their dispatch precedence. */
export async function handleFamilyPlanApi(repo: FamilyFrontendRepository, request: FamilyRequest) {
  for (const handler of handlers) {
    const result = await handler(repo, request);
    if (result !== NOT_HANDLED) return result;
  }
  return NOT_HANDLED;
}
