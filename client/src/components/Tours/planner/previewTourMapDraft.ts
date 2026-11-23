import { projectOntoTrack } from '../../../utils/paddleTrackMarks';
import type { PreviewTourMapDraft } from './PreviewTourMapContext';

export type TrackCoordinate = [number, number];
export type TrackAction = 'move' | 'insert' | 'remove';
export type TrackPointDraft = { action: TrackAction; index: number; lat: string; lng: string };

export function draftCoordinate(draft: TrackPointDraft): TrackCoordinate | null {
  const lat = Number(draft.lat);
  const lng = Number(draft.lng);
  return draft.lat.trim() && draft.lng.trim() && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}

type MapDraftOptions = {
  points: TrackCoordinate[];
  shape: number[];
  draft: TrackPointDraft;
  interactive: boolean;
  pointLabel: (index: number) => string;
  insertLabel: string;
  select: (index: number, coordinate?: TrackCoordinate) => void;
};

function stageLine(points: TrackCoordinate[], draft: TrackPointDraft, point: TrackCoordinate | null) {
  if (draft.action === 'remove') return points.filter((_, index) => index !== draft.index);
  if (!point) return points;
  const line = points.slice();
  line.splice(draft.index, draft.action === 'move' ? 1 : 0, point);
  return line;
}

export function previewTourMapLayer({ points, shape, draft, interactive, pointLabel, insertLabel, select }: MapDraftOptions):
  Omit<PreviewTourMapDraft, 'tripId' | 'placeId' | 'revision'> {
  const point = draftCoordinate(draft);
  const line = stageLine(points, draft, point);
  const inserting = draft.action === 'insert';
  const moving = draft.action === 'move';
  const positions = moving ? line : points;
  const plannerWaypoints = shape.map(index => ({
    id: String(index), lat: positions[index][0], lng: positions[index][1], shaping: true, name: pointLabel(index),
  }));
  if (inserting && point) plannerWaypoints.push({ id: 'new', lat: point[0], lng: point[1], shaping: true, name: insertLabel });
  const hasPoint = (id: string) => shape.includes(Number(id));
  return {
    line,
    plannerWaypoints,
    selectedPlannerWaypointId: inserting ? 'new' : String(draft.index),
    onPlannerWaypointClick: interactive && !inserting ? id => {
      if (hasPoint(id)) select(Number(id));
    } : undefined,
    onPlannerWaypointMove: interactive && moving ? (id, lat, lng) => {
      if (!hasPoint(id)) return false;
      select(Number(id), [lat, lng]);
      return true;
    } : undefined,
    onRouteClick: interactive && inserting ? (lat, lng) => {
      const projection = projectOntoTrack(line, { lat, lng });
      if (!projection) return;
      // Both portions of a segment split by the pending point still refer to the same saved gap.
      const index = projection.segmentEndIndex - (point && projection.segmentEndIndex > draft.index ? 1 : 0);
      const pendingVertex = point && projection.fraction === 1 && projection.segmentEndIndex === draft.index;
      const interior = projection.fraction > 0 && projection.fraction < 1;
      select(index, interior || pendingVertex ? projection.coordinate : undefined);
    } : undefined,
  };
}
