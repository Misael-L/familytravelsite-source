import { notesByCivilDay } from './legacy/data/supabase/dayNotes';
import { groupScheduleByCivilDay } from './legacy/data/supabase/scheduleItems';
import type { FamilyPlanExportInput } from './legacy/lib/plan/familyPlanIcs';
import { familyFrontend } from './repository';
import { useFamilyUiPermissions } from './uiPermissions';

/** The open trip has no ready, complete published snapshot. */
export class FamilyPlanNotReady extends Error {
  constructor() {
    super('The published plan is not ready.');
    this.name = 'FamilyPlanNotReady';
  }
}

/**
 * The published rows on the open controller. This does not fetch and does not
 * merge draft operations. The Published / My Draft switch only changes the view.
 * A missing controller or a failed partial load cannot export.
 */
export function loadFamilyPlanExport(tripId: number | string): FamilyPlanExportInput {
  const controller = useFamilyUiPermissions.getState().controller;
  if (
    !controller?.core ||
    !controller.partialLoad ||
    controller.partialLoad.failed ||
    controller.isCurrent?.() === false
  ) {
    throw new FamilyPlanNotReady();
  }
  const core = controller.core;
  let selectedId: string | undefined;
  try {
    selectedId =
      typeof tripId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tripId)
        ? tripId
        : familyFrontend.knownViews()?.ids.uuid('trip', tripId);
  } catch {
    throw new FamilyPlanNotReady();
  }
  if (!selectedId || selectedId.toLowerCase() !== core.trip.id.toLowerCase()) {
    throw new FamilyPlanNotReady();
  }
  return {
    tripTitle: core.trip.title,
    days: core.days,
    itemsByDayId: groupScheduleByCivilDay(core.schedule, core.days),
    placesById: new Map(core.places.map((place) => [place.id, place])),
    notesByCivilDay: notesByCivilDay(core.notes),
  };
}
