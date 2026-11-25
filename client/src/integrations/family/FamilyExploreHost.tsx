import { useFamilyController } from './controllerContext';
import TripWorkspaceExplorePanel from './legacy/components/Explore/TripWorkspaceExplorePanel';

/** Catalog Explore, in the planner content well. Close stays in this host. */
export function FamilyExploreHost({ className = '' }: { className?: string }) {
  const controller = useFamilyController();
  if (!controller?.explore.open) return null;
  const { explore, core, gov, reload } = controller;
  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${className}`}>
      <div className="flex shrink-0 justify-end px-3 py-2">
        <button
          type="button"
          onClick={explore.closeExplore}
          className="rounded-lg bg-accent px-3 py-2 text-body text-accent-text"
        >
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <TripWorkspaceExplorePanel
          tripId={core.trip.id}
          countryIds={explore.countryIds}
          pendingDeepLink={explore.pendingDeepLink}
          onConsumeDeepLink={explore.consumeDeepLink}
          canMutate={explore.canMutate}
          writeMode={explore.writeMode}
          writeModeFor={explore.writeModeFor}
          nextSortOrder={gov.nextSortOrder}
          stageOp={gov.addDraftOp}
          tripPlaceIds={explore.tripPlaceIds}
          days={core.days}
          scheduleItems={core.schedule}
          onItineraryChanged={reload}
          familyId={explore.familyId}
          personId={explore.personId}
        />
      </div>
    </div>
  );
}
