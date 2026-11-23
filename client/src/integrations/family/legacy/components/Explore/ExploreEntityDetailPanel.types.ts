import type { ExploreCatalogKind } from '../../data/supabase/catalogExploreLists';
import type { StageExploreOp } from '../../data/supabase/exploreAddToTrip';
import type { FamilyScheduleItem } from '../../data/supabase/scheduleItems';
import type { FamilyTripDay } from '../../data/supabase/tripDays';

export type ExploreEntityDetailPanelProps = {
  kind: ExploreCatalogKind;
  entityId: string;
  onBack: () => void;
  tripId: string;
  canMutate: boolean;
  writeMode?: 'direct' | 'draft' | 'nudge' | 'deny';
  nextSortOrder?: number;
  stageOp?: StageExploreOp;
  tripPlaceIds: readonly string[];
  days: FamilyTripDay[];
  scheduleItems: FamilyScheduleItem[];
  onItineraryChanged: () => Promise<void>;
  familyId: string | null;
  personId: string | null;
};
