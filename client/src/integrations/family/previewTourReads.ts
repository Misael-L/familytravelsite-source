import { computeTourMetrics, stationKeySchema, tourDetailResponseSchema, tourListItemSchema, tourTypeKeySchema } from '@trek/shared';
import { z } from 'zod';
import { FamilyApiError } from './errors';
import { getSupabaseBrowserClient } from './legacy/data/supabase/client';
import type { FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';

const point = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])
  .transform(([lat, lng]): [number, number] => [lat, lng]);
const row = z.object({
  location_id: z.string().uuid(),
  name: z.string().trim().min(1).max(500),
  description: z.string().nullable(),
  tour_type: tourTypeKeySchema,
  track: z.array(point).min(2).max(2000),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  stops: z.array(z.object({
    key: stationKeySchema,
    name: z.string().min(1).max(255),
    index: z.number().int().nonnegative(),
    stay_minutes: z.number().int().min(0).max(1440),
  })).min(2).max(100),
  planned_minutes: z.number().int().positive().nullable(),
  planned: z.boolean(),
}).refine(tour =>
  tour.stops[0]?.index === 0 && tour.stops[tour.stops.length - 1]?.index === tour.track.length - 1 &&
  tour.stops.every((stop, i) => i === 0 || stop.index > tour.stops[i - 1].index) &&
  new Set(tour.stops.map(stop => stop.key)).size === tour.stops.length,
);
const answer = z.object({ trip_id: z.string().uuid(), tours: z.array(row) });

function nativeTour(value: z.infer<typeof row>, placeId: number) {
  const { distanceKm } = computeTourMetrics(value.track);
  const tour = tourListItemSchema.parse({
    place_id: placeId,
    name: value.name,
    description: value.description,
    tour_type: value.tour_type,
    duration: value.planned_minutes,
    distance: distanceKm,
    elevation_gain: null,
    elevation_loss: null,
    difficulty: null,
    wanderer_ref: null,
    match_confidence: null,
    max_hiking_difficulty: null,
    planned: value.planned,
    caution: false,
    has_waypoints: true,
    revision: value.revision,
    station_count: value.tour_type === 'walk' ? value.stops.length : null,
  });
  return {
    ...tour,
    previewTrack: JSON.stringify(value.track),
    previewStations: value.stops,
  };
}

const trackCommandFields = {
  expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  pointIndex: z.number().int().min(1).max(1998),
};
const shapeCommandFields = { ...trackCommandFields, operationId: z.uuidv4() };
const previewTourPointCommand = z.union([
  z.strictObject({ ...trackCommandFields, point }),
  z.strictObject({ ...shapeCommandFields, action: z.literal('insert'), point }),
  z.strictObject({ ...shapeCommandFields, action: z.literal('remove') }),
]);
type TrackCommand = z.infer<typeof previewTourPointCommand>;
const stationCommandFields = {
  expectedRevision: trackCommandFields.expectedRevision,
  operationId: z.uuidv4(),
};
const stationDetails = {
  name: z.string().trim().min(1).max(255),
  stayMinutes: z.number().int().min(0).max(1440),
};
const previewTourStationCommand = z.union([
  z.strictObject({ ...stationCommandFields, stationKey: stationKeySchema, ...stationDetails }),
  z.strictObject({ ...stationCommandFields, action: z.literal('add'), pointIndex: trackCommandFields.pointIndex, ...stationDetails }),
  z.strictObject({ ...stationCommandFields, action: z.literal('remove'), stationKey: stationKeySchema }),
  z.strictObject({ ...stationCommandFields, action: z.literal('move'), stationKey: stationKeySchema,
    pointIndex: trackCommandFields.pointIndex }),
]);
type StationCommand = z.infer<typeof previewTourStationCommand>;
type WalkCommand = TrackCommand | StationCommand;
type WalkEdit = 'track' | 'station';

function isStationCommand(input: WalkCommand): input is StationCommand {
  return 'stationKey' in input || ('action' in input && input.action === 'add');
}

function confirmedPoint(tour: z.infer<typeof row>, input: TrackCommand) {
  if (tour.revision === undefined || tour.revision < input.expectedRevision) return false;
  if ('action' in input && tour.revision !== input.expectedRevision + 1) return false;
  if (!('point' in input)) return true;
  const saved = tour.track[input.pointIndex];
  return saved?.[0] === input.point[0] && saved[1] === input.point[1];
}

function confirmedEdit(tour: z.infer<typeof row>, input: WalkCommand) {
  if (!isStationCommand(input)) return confirmedPoint(tour, input);
  const advanced = tour.revision === input.expectedRevision + 1;
  if ('action' in input) {
    if (!advanced) return false;
    if (input.action === 'remove') return tour.stops.every(stop => stop.key !== input.stationKey);
    if (input.action === 'move') return tour.stops.some(stop => stop.key === input.stationKey && stop.index === input.pointIndex);
    return tour.stops.some(stop => stop.key === input.operationId && stop.index === input.pointIndex &&
      stop.name === input.name && stop.stay_minutes === input.stayMinutes);
  }
  const station = tour.stops.find(stop => stop.key === input.stationKey);
  return (tour.revision === input.expectedRevision || advanced) && station?.name === input.name &&
    station.stay_minutes === input.stayMinutes;
}

function savedWalkFor(data: unknown, tripId: string, locationId: string, input: WalkCommand, edit: WalkEdit) {
  const result = answer.safeParse(data);
  const tour = result.success && result.data.trip_id === tripId && result.data.tours.length === 1
    ? result.data.tours[0] : null;
  if (!tour || tour.location_id !== locationId || tour.tour_type !== 'walk' || !confirmedEdit(tour, input))
    throw new FamilyApiError(503, `tour_${edit}_save_unavailable`, 'The walk save could not be confirmed.');
  return tour;
}

function trackPointRpc(tripId: string, locationId: string, input: TrackCommand) {
  const client = getSupabaseBrowserClient();
  const [lat, lng] = 'point' in input ? input.point : [null, null];
  const args = {
    p_trip_id: tripId, p_location_id: locationId, p_expected_revision: input.expectedRevision,
    p_point_index: input.pointIndex, p_lat: lat, p_lng: lng,
  };
  return 'action' in input
    ? client.rpc('edit_family_trip_tour_track_shape_v1', { ...args, p_action: input.action, p_operation_id: input.operationId })
    : client.rpc('move_family_trip_tour_track_point_v1', args);
}

function walkEditRpc(tripId: string, locationId: string, input: WalkCommand) {
  if (!isStationCommand(input)) return trackPointRpc(tripId, locationId, input);
  const client = getSupabaseBrowserClient();
  const common = {
    p_trip_id: tripId, p_location_id: locationId, p_expected_revision: input.expectedRevision,
    p_operation_id: input.operationId,
  };
  if (!('action' in input)) return client.rpc('edit_family_trip_tour_station_v1', {
    ...common, p_station_key: input.stationKey, p_name: input.name, p_stay_minutes: input.stayMinutes,
  });
  return client.rpc('mutate_family_trip_tour_station_v2', {
    ...common, p_action: input.action,
    p_station_key: 'stationKey' in input ? input.stationKey : null,
    p_point_index: 'pointIndex' in input ? input.pointIndex : null,
    p_name: input.action === 'add' ? input.name : null,
    p_stay_minutes: input.action === 'add' ? input.stayMinutes : null,
  });
}

async function handlePreviewTourEdit(
  repo: FamilyFrontendRepository, tripId: string, placeId: string, edit: WalkEdit, request: FamilyRequest,
) {
  if (request.method !== 'PUT' || request.query.size)
    throw new FamilyApiError(405, `tour_${edit}_method`, 'This walk edit requires PUT.');
  const schema = edit === 'station' ? previewTourStationCommand : previewTourPointCommand;
  const input = schema.safeParse(request.body);
  if (!input.success)
    throw new FamilyApiError(400, `tour_${edit}_invalid`, 'Enter valid details for this walk edit.');

  const context = repo.captureContext(tripId, { revision: false });
  const { ids } = await context.perform(() => repo.views());
  if (repo.getLayer(tripId) !== 'published')
    throw new FamilyApiError(403, `tour_${edit}_published_required`, 'Open the published itinerary to edit the walk.');
  const locationId = ids.uuid('place', placeId);
  const { data, error } = await context.perform(async () => {
    const rpc = walkEditRpc(tripId, locationId, input.data);
    return request.signal ? rpc.abortSignal(request.signal) : rpc;
  });
  if (error?.code === 'PT409')
    throw new FamilyApiError(409, `tour_${edit}_conflict`, 'This walk has changed.');
  if (error?.code === '42501' || error?.code === 'PT404')
    throw new FamilyApiError(403, `tour_${edit}_unavailable`, 'This walk is unavailable for editing.');
  if (error?.code === '22023')
    throw new FamilyApiError(400, `tour_${edit}_invalid`, 'This edit could not be applied to the saved walk.');
  if (error)
    throw new FamilyApiError(503, `tour_${edit}_save_unavailable`, 'The walk save could not be confirmed.');
  const tour = savedWalkFor(data, tripId, locationId, input.data, edit);
  return { tour: nativeTour(tour, ids.register('place', tour.location_id)) };
}

const walkEditPath = /^family\/tours\/(\d+)\/(track-point|station)$/;

export function previewTourPath(suffix: string) {
  return suffix === 'tour-visits' || suffix === 'tour-draft' || /^tours(?:\/|$)/.test(suffix) || walkEditPath.test(suffix);
}

export function handlePreviewTour(repo: FamilyFrontendRepository, tripId: string, suffix: string, request: FamilyRequest) {
  const walkEdit = walkEditPath.exec(suffix);
  return walkEdit ? handlePreviewTourEdit(repo, tripId, walkEdit[1], walkEdit[2] === 'station' ? 'station' : 'track', request)
    : handlePreviewTourRead(repo, tripId, suffix, request);
}

export async function handlePreviewTourRead(repo: FamilyFrontendRepository, tripId: string, suffix: string, request: FamilyRequest) {
  if (request.method !== 'GET' || request.query.size)
    throw new FamilyApiError(405, 'tour_preview_read_only', 'Tour editing is unavailable in this preview.');
  if (suffix === 'tour-visits' || suffix === 'tour-draft') {
    await repo.tripHeader(tripId);
    return suffix === 'tour-visits' ? { visits: [] } : { draft: null };
  }
  const id = /^tours\/(\d+)$/.exec(suffix)?.[1];
  if (suffix !== 'tours' && id === undefined)
    throw new FamilyApiError(404, 'tour_preview_unavailable', 'This tour resource is unavailable in the preview.');
  const context = repo.captureContext(tripId);
  const { ids } = await context.perform(() => repo.views());
  const locationId = id === undefined ? null : ids.uuid('place', id);
  const client = getSupabaseBrowserClient();
  const { data, error } = await context.perform(async () => {
    const rpc = client.rpc('get_family_trip_tours_v1', { p_trip_id: tripId, p_location_id: locationId });
    return request.signal ? rpc.abortSignal(request.signal) : rpc;
  });
  if (error?.code === '42501') throw new FamilyApiError(403, 'tour_access_denied', 'These tours are unavailable for this trip or session.');
  const result = answer.safeParse(data);
  if (error || !result.success || result.data.trip_id !== tripId)
    throw new FamilyApiError(503, 'tour_read_unavailable', 'Tours are temporarily unavailable.');
  if (locationId === null) {
    return { tours: result.data.tours.map(tour => nativeTour(tour, ids.register('place', tour.location_id))) };
  }
  const selected = result.data.tours.find(tour => tour.location_id === locationId);
  if (!selected) throw new FamilyApiError(404, 'tour_not_found', 'This tour is unavailable.');
  const waypoints = selected.stops.map((stop, index) => {
    const [lat, lng] = selected.track[stop.index];
    const next = selected.stops[index + 1];
    return {
      key: stop.key, name: stop.name, lat, lng, sequence: index, stay_minutes: stop.stay_minutes,
      role: index === 0 ? 'start' : next ? 'via' : 'end',
      ...(next ? { fixed_leg: { kind: 'free', geometry: selected.track.slice(stop.index, next.index + 1) } } : {}),
    };
  });
  return tourDetailResponseSchema.parse({ tour: nativeTour(selected, ids.register('place', locationId)), waypoints });
}
