import { hasReadOnlyBuild } from '../../db/readOnlySession';
import { FamilyApiError } from './errors';
import { getSupabaseBrowserClient } from './legacy/data/supabase/client';
import type { FamilyFrontendRepository } from './repository';
import { routePreferencesSaveSchema, routePreferencesSnapshotSchema } from './routePreferencesContract';
import { handleRouteWaypoints } from './routeWaypoints';
import type { FamilyRequest } from './transport';

export async function handleRoutePreview(
  repo: FamilyFrontendRepository,
  tripId: string,
  suffix: string,
  request: FamilyRequest,
  readOnly = false,
) {
  await repo.tripHeader(tripId);
  if (readOnly && request.method !== 'GET')
    throw new FamilyApiError(405, 'family_route_read_only', 'Driving settings and waypoints are read-only on this trip.');
  if (suffix === 'family/route-waypoints' && ['GET','PUT'].includes(request.method)) {
    const view = await handleRouteWaypoints(repo, tripId, request);
    return readOnly ? { ...view, editable: false } : view;
  }
  if (request.method === 'GET' && suffix === 'roadtrip/vias') return { vias: [], tracks: [] };
  if (request.method === 'GET' && suffix === 'roadtrip/day-boundaries') return { boundaries: [] };
  if (suffix !== 'family/route-preferences' || !['GET', 'PUT'].includes(request.method)) {
    throw new FamilyApiError(501, 'family_route_action_unavailable', 'This Road trip action is unavailable in the preview.');
  }

  const context = repo.captureContext(tripId, { revision: false });
  const views = await context.perform(() => repo.views());
  const layer = repo.getLayer(tripId);
  const client = getSupabaseBrowserClient();
  const saving = request.method === 'PUT';
  const input = saving ? routePreferencesSaveSchema.safeParse(request.body) : null;
  if (input && (!input.success || layer !== 'published')) {
    if (layer !== 'published') throw new FamilyApiError(403, 'route_published_required', 'Open the published itinerary to edit driving settings.');
    throw new FamilyApiError(422, 'route_preferences_invalid', 'Check the driving settings and try again.');
  }

  const { data, error } = await context.perform(async () =>
    input?.success
      ? client.rpc('save_family_route_preferences_v1', {
          p_trip_id: tripId, p_expected_revision: input.data.revision, p_patch: input.data.preferences,
        })
      : client.rpc('get_family_route_preferences_v1', { p_trip_id: tripId })
  );
  if (error) {
    if (error.code === 'PT409') throw new FamilyApiError(409, 'route_preferences_conflict', 'Driving settings changed. Review the latest values and try again.');
    if (error.code === '22023') throw new FamilyApiError(422, 'route_preferences_invalid', error.message);
    if (error.code === '42501') throw new FamilyApiError(403, 'route_preferences_denied', 'Driving settings are unavailable for this trip or session.');
    throw new FamilyApiError(503, 'route_preferences_unavailable', 'Driving settings are temporarily unavailable.');
  }
  const view = routePreferencesSnapshotSchema.safeParse(data);
  if (!view.success || data.trip_id !== tripId) {
    throw new FamilyApiError(502, 'route_preferences_response_invalid', 'Driving settings returned an invalid response.');
  }
  return { ...view.data, editable: view.data.editable && layer === 'published' && !readOnly && !hasReadOnlyBuild(), tripId: views.ids.register('trip', tripId) };
}
