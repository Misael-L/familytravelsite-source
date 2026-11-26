import { createContext, useContext, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { MapViewProps } from '../../Map/mapViewContract';

export type PreviewTourMapDraft = Pick<MapViewProps,
  'plannerWaypoints' | 'selectedPlannerWaypointId' | 'onPlannerWaypointClick' | 'onPlannerWaypointMove' | 'onRouteClick'
> & {
  tripId: number | string;
  placeId: number;
  revision: number;
  line: [number, number][];
};

export const OpenTrack = createContext<PreviewTourMapDraft | null>(null);
export const PublishTrack = createContext<Dispatch<SetStateAction<PreviewTourMapDraft | null>> | null>(null);

export function usePreviewTourMapDraft(tripId: number | string, view: { place_id: number; revision?: number } | null | undefined) {
  const draft = useContext(OpenTrack);
  return draft && view && String(tripId) === String(draft.tripId) &&
    view.place_id === draft.placeId && view.revision === draft.revision ? draft : null;
}

export function usePublishPreviewTourMap(draft: PreviewTourMapDraft | null) {
  const setDraft = useContext(PublishTrack);
  useEffect(() => {
    if (!setDraft || !draft) return;
    setDraft(draft);
    return () => setDraft(current => current === draft ? null : current);
  }, [draft, setDraft]);
}
