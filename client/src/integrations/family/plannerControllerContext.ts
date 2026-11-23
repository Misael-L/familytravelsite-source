import { createContext, useContext } from 'react';
import type { PlannerBoundaryOwner, PlannerPublication } from './plannerBoundaryOwner';
import type { usePlannerGovernance } from './usePlannerGovernance';
export type FamilyPlannerController = {
  owner: PlannerBoundaryOwner;
  publication: PlannerPublication | null;
  gov: ReturnType<typeof usePlannerGovernance>;
};
export const FamilyPlannerControllerContext = createContext<FamilyPlannerController | null>(null);
export const useFamilyPlannerController = () => useContext(FamilyPlannerControllerContext);
