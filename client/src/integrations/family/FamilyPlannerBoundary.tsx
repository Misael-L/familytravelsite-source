import { useLayoutEffect, useMemo, useSyncExternalStore, type PropsWithChildren } from 'react';
import { useParams } from 'react-router';
import { FamilyPlannerReadProblem } from './FamilyPlannerReadProblem';
import { FamilyStayManagement } from './FamilyStayManagement';
import { FamilyTripParamsBoundary } from './navigation';
import { plannerActionAvailable } from './plannerActionAvailability';
import { currentPlannerBoundaryOwner, type PlannerBoundaryOwner } from './plannerBoundaryOwner';
import { useFamilyUiPermissions } from './uiPermissions';
import { usePlannerGovernance } from './usePlannerGovernance';

import { FamilyPlannerControllerContext } from './plannerControllerContext';

/** The existing route boundary, with no legacy itinerary reads or fabricated legacy city DTOs. */
export function FamilyPlannerBoundary({ owner, children }: PropsWithChildren<{ owner: PlannerBoundaryOwner | null }>) {
  if (!owner) return <p role="alert">This planner session ended. Reopen the Trip before continuing.</p>;
  return (
    <FamilyTripParamsBoundary repository={owner.repository}>
      <PlannerController owner={owner}>{children}</PlannerController>
    </FamilyTripParamsBoundary>
  );
}
function PlannerController({ owner, children }: PropsWithChildren<{ owner: PlannerBoundaryOwner }>) {
  const { id } = useParams();
  const snapshot = useSyncExternalStore(owner.subscribe, owner.get, owner.get);
  const publication = snapshot && String(snapshot.ids.register('trip', snapshot.trip)) === id ? snapshot : null;
  const gov = usePlannerGovernance(
    {
      tripId: publication?.trip ?? '',
      personId: publication?.session.personId ?? null,
      enabled: publication !== null,
      readKey: publication,
      layer: publication?.layer,
    },
    owner.governance
  );
  const controller = useMemo(
    () => ({
      gov,
      supportsAction: plannerActionAvailable,
      isCurrent: () =>
        currentPlannerBoundaryOwner() === owner &&
        publication !== null &&
        owner.get() === publication &&
        publication.current() &&
        !gov.mutateGateError &&
        gov.layer === publication.layer,
    }),
    [owner, publication, gov]
  );
  useLayoutEffect(() => {
    useFamilyUiPermissions.setState({ controller });
    return () => {
      if (useFamilyUiPermissions.getState().controller === controller)
        useFamilyUiPermissions.setState({ controller: null });
    };
  }, [controller]);
  return (
    <FamilyPlannerControllerContext.Provider value={{ owner, publication, gov }}>
      {children}
      <FamilyPlannerReadProblem owner={owner} />
      <FamilyStayManagement />
    </FamilyPlannerControllerContext.Provider>
  );
}
