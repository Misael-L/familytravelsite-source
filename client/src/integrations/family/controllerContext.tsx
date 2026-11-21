import { createContext, useContext } from 'react';
import type { ExploreCatalogKind, ExploreDeepLink } from './legacy/data/supabase/catalogExploreLists';
import type { UseFamilyTripWorkspaceGovernanceResult } from './legacy/pages/familyTripWorkspace/useFamilyTripWorkspaceGovernance';
import type { WorkspaceWriteMode } from './legacy/pages/familyTripWorkspace/workspaceGovernanceModel';
import type { FamilyCore } from './repository';

interface FamilyExploreState {
  open: boolean;
  pendingDeepLink: ExploreDeepLink | null;
  countryIds: string[];
  tripPlaceIds: readonly string[];
  familyId: string | null;
  personId: string | null;
  canMutate: boolean;
  writeMode: WorkspaceWriteMode;
  writeModeFor: (kind: ExploreCatalogKind) => WorkspaceWriteMode;
  openExplore: (link: ExploreDeepLink | null) => void;
  closeExplore: () => void;
  consumeDeepLink: () => void;
}

export interface FamilyControllerValue {
  core: FamilyCore;
  gov: UseFamilyTripWorkspaceGovernanceResult;
  selectedDayId: string | null;
  selectedPlaceId: string | null;
  selectDay: (id: string | null) => void;
  selectPlace: (id: string | null) => void;
  setTab: (tab: 'plan' | 'explore' | 'transports' | 'buchungen' | 'lists' | 'finanzplan' | 'files') => void;
  reload: () => Promise<void>;
  explore: FamilyExploreState;
  partialLoad: {
    failed: boolean;
    retry: () => void;
  };
}

export const FamilyControllerContext = createContext<FamilyControllerValue | null>(null);
export function useFamilyController() {
  return useContext(FamilyControllerContext);
}
