import type { TourListItem } from '@trek/shared';
import { useMemo } from 'react';
import type { useOutsidePressGuard } from '../../components/Ferratas/useOutsidePressGuard';
import { usePreviewTourMapDraft, type PreviewTourMapDraft } from '../../components/Tours/planner/PreviewTourMapContext';
import type { TourPlannerController } from '../../components/Tours/planner/useTourPlanner';
import type { TerrainWaypoints } from '../../components/Tours/terrain/useTerrainPins';
import { useTranslation } from '../../i18n';
import { previewTourStations, previewTourTrack } from '../../integrations/family/previewTourTrack';
import { parseRenderableRouteGeometry } from '../../utils/routeGeometry';

function savedStations(tour: TourListItem | null | undefined, stayLabel: (minutes: number) => string): TerrainWaypoints | null {
  if (!tour || tour.tour_type !== 'walk') return null;
  const stations = previewTourStations(tour);
  if (!stations.length) return null;
  const track = parseRenderableRouteGeometry(previewTourTrack(tour));
  // A filtered or incomplete path must not shift the indices used by saved stations.
  if (!track || stations[stations.length - 1].index !== track.length - 1) return null;
  const points = stations.flatMap((station, index) => {
    const point = track[station.index];
    if (!point) return [];
    const [lat, lng] = point;
    return [{ id: station.key, lat, lng, name: station.name, label: String(index + 1),
      detail: stayLabel(station.stay_minutes) }];
  });
  return { points, selectedId: null };
}

function draftMapProps(draft: PreviewTourMapDraft, guard: ReturnType<typeof useOutsidePressGuard>['guard']) {
  return {
    route: [draft.line],
    routeWalking: undefined,
    routeColors: undefined,
    plannerWaypoints: draft.plannerWaypoints,
    selectedPlannerWaypointId: draft.selectedPlannerWaypointId,
    onPlannerWaypointClick: draft.onPlannerWaypointClick,
    onPlannerWaypointMove: draft.onPlannerWaypointMove,
    onRouteClick: guard(draft.onRouteClick),
    onToggleTerrain3d: undefined,
  };
}

export function usePreviewWalkMap(
  tripId: PreviewTourMapDraft['tripId'],
  planner: Pick<TourPlannerController, 'mode' | 'readOnlyGpxTour'>,
  guard: ReturnType<typeof useOutsidePressGuard>['guard'],
  terrainAvailable: boolean,
) {
  const { t } = useTranslation();
  const tour = planner.mode.type === 'view-gpx' ? planner.readOnlyGpxTour?.tour : null;
  const draft = usePreviewTourMapDraft(tripId, tour);
  const savedWaypoints = useMemo(
    () => savedStations(tour, count => t('tours.durationMinutes', { count })),
    [tour, t],
  );
  const previewProps = useMemo(() => draft ? draftMapProps(draft, guard) : {}, [draft, guard]);
  return { previewProps, savedWaypoints, terrain3d: terrainAvailable && !draft };
}
