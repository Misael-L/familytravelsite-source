import { hasReadOnlyBuild } from '../../db/readOnlySession';
import { FamilyApiError } from './errors';
import { getSupabaseBrowserClient } from './legacy/data/supabase/client';
import type { FamilyFrontendRepository } from './repository';
import { waypointRpcSchema, waypointSaveSchema } from './routeWaypointContract';
import type { FamilyRequest } from './transport';

export async function handleRouteWaypoints(repo: FamilyFrontendRepository, tripId: string, request: FamilyRequest) {
  const context = repo.captureContext(tripId, { revision: false });
  const views = await context.perform(() => repo.views());
  const published = repo.getLayer(tripId) === 'published';
  const client = getSupabaseBrowserClient();
  const input = request.method === 'PUT' ? waypointSaveSchema.safeParse(request.body) : null;
  if (input && !published)
    throw new FamilyApiError(403, 'route_published_required', 'Open the published itinerary to edit waypoints.');
  if (input && !input.success)
    throw new FamilyApiError(422, 'route_waypoint_invalid', 'Enter a valid latitude and longitude.');
  const { data, error } = await context.perform(async () => {
    if (!input?.success) return client.rpc('get_family_route_waypoints_v1', { p_trip_id: tripId });
    const leg = input.data;
    return client.rpc('save_family_route_waypoint_v1', {
      p_trip_id: tripId,
      p_day_id: views.ids.uuid('day', leg.dayId),
      p_from_visit_id: views.ids.uuid('assignment', leg.fromId),
      p_to_visit_id: views.ids.uuid('assignment', leg.toId),
      p_expected_revision: leg.revision,
      p_lat: leg.point?.lat ?? null,
      p_lng: leg.point?.lng ?? null,
    });
  });
  if (error) {
    if (error.code === 'PT409')
      throw new FamilyApiError(409, 'route_waypoint_conflict', 'This leg or waypoint changed. Check the latest route and try again.');
    if (error.code === '22023') throw new FamilyApiError(422, 'route_waypoint_invalid', 'Enter a valid latitude and longitude.');
    if (error.code === '42501') throw new FamilyApiError(403, 'route_waypoint_denied', 'Waypoints are unavailable for this trip or session.');
    throw new FamilyApiError(503, 'route_waypoint_unavailable', 'Waypoints are temporarily unavailable.');
  }
  const response = waypointRpcSchema.safeParse(data);
  if (!response.success || response.data.trip_id !== tripId)
    throw new FamilyApiError(502, 'route_waypoint_response_invalid', 'Waypoints returned an invalid response.');
  return {
    editable: published && response.data.editable && !hasReadOnlyBuild(),
    legs: response.data.legs.map(leg => ({
      dayId: views.ids.register('day', leg.day_id),
      fromId: views.ids.register('assignment', leg.from_visit_id),
      toId: views.ids.register('assignment', leg.to_visit_id),
      revision: leg.revision,
      waypointId: leg.waypoint_id === null ? null : views.ids.register('waypoint', leg.waypoint_id),
      point: leg.lat === null || leg.lng === null ? null : { lat: leg.lat, lng: leg.lng },
    })),
  };
}
