import type { RoadtripVia } from '@trek/shared';
import type { AssignmentsMap } from '../../types';
import { roadtripStopList } from '../../utils/dayRouteVias';
import type { WaypointView } from './routeWaypointContract';

export function waypointLegIndex(stops: ReturnType<typeof roadtripStopList>, from: number, to: number) {
  return stops.findIndex((stop, index) => stop.id === from && stops[index + 1]?.id === to);
}

export function previewVias(view: WaypointView | null, assignments: AssignmentsMap): Record<number, RoadtripVia[]> {
  const byDay: Record<number, RoadtripVia[]> = {};
  if (!view) return byDay;
  const ordered = new Map<number, ReturnType<typeof roadtripStopList>>();
  for (const leg of view.legs) {
    if (!leg.point || leg.waypointId === null) continue;
    const stops = ordered.get(leg.dayId) ?? roadtripStopList(assignments[String(leg.dayId)]);
    ordered.set(leg.dayId, stops);
    const index = waypointLegIndex(stops, leg.fromId, leg.toId);
    if (index < 0) continue;
    (byDay[leg.dayId] ??= []).push({
      id: leg.waypointId, day_id: leg.dayId, after_order_index: index, sequence: 0, ...leg.point,
    });
  }
  return byDay;
}
