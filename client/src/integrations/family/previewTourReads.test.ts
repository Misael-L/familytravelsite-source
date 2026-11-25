import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FamilyFrontendRepository } from './repository';
import { handlePreviewTour, handlePreviewTourRead } from './previewTourReads';
import { withPreviewTourTracks } from './previewTourTrack';
import { buildPlace } from '../../../tests/helpers/factories';

const { rpc, ids } = vi.hoisted(() => ({ rpc: vi.fn(), ids: { register: vi.fn(), uuid: vi.fn() } }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => ({ rpc }) }));

const tripId = '00000000-0000-4000-8000-000000000001';
const locationId = '00000000-0000-4000-8000-000000000002';
const track = [[19.43, -99.13], [19.43, -99.14], [19.44, -99.14], [19.44, -99.15]];
const walk = {
  location_id: locationId,
  name: 'Preview walk',
  description: null,
  tour_type: 'walk',
  revision: 1,
  track,
  stops: [
    { key: 'the-start', name: 'Start', index: 0, stay_minutes: 0 },
    { key: 'the-plaza', name: 'Plaza', index: 2, stay_minutes: 10 },
    { key: 'the-finish', name: 'Finish', index: 3, stay_minutes: 0 },
  ],
  planned_minutes: 25,
  planned: false,
};
const repo = {
  captureContext: () => ({ perform: async (fn: () => unknown) => fn() }),
  views: async () => ({ ids }),
  getLayer: () => 'published',
  tripHeader: vi.fn(),
} as unknown as FamilyFrontendRepository;

function read(suffix: string, method = 'GET') {
  return handlePreviewTourRead(repo, tripId, suffix, {
    method, pathname: `/trips/${tripId}/${suffix}`, query: new URLSearchParams(), body: undefined,
  });
}

const move = (body: unknown) => handlePreviewTour(repo, tripId, 'family/tours/19/track-point', {
  method: 'PUT', pathname: `/trips/${tripId}/family/tours/19/track-point`, query: new URLSearchParams(), body,
});

const editStation = (body: unknown) => handlePreviewTour(repo, tripId, 'family/tours/19/station', {
  method: 'PUT', pathname: `/trips/${tripId}/family/tours/19/station`, query: new URLSearchParams(), body,
});

describe('Mexico preview Tour reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: { trip_id: tripId, tours: [walk] }, error: null });
    ids.register.mockReturnValue(19);
    ids.uuid.mockReturnValue(locationId);
  });

  it('attaches a published tour’s track only to its saved location', async () => {
    const result = await read('tours');
    if (!('tours' in result)) throw new Error('Expected Tours');
    expect(result.tours).toMatchObject([{ place_id: 19, station_count: 3, planned: false,
      revision: 1, previewStations: walk.stops }]);
    const samePlace = buildPlace({ id: 19 });
    const otherPlace = buildPlace({ id: 18 });
    const places = withPreviewTourTracks([samePlace, otherPlace], result.tours);
    expect(places[0].route_geometry).toBe(JSON.stringify(track));
    expect(places[1]).toBe(otherPlace);
    expect(samePlace.route_geometry).not.toBe(places[0].route_geometry);
  });

  it('reads the exact selected location and supplies the saved geometry to the native tour planner', async () => {
    const result = await read('tours/19');
    expect(ids.uuid).toHaveBeenCalledWith('place', '19');
    expect(rpc).toHaveBeenCalledWith('get_family_trip_tours_v1', { p_trip_id: tripId, p_location_id: locationId });
    expect(result).toMatchObject({ waypoints: [
      { role: 'start', fixed_leg: { geometry: track.slice(0, 3) } },
      { role: 'via', name: 'Plaza', fixed_leg: { geometry: track.slice(2) } },
      { role: 'end', name: 'Finish' },
    ] });
  });

  it('blocks Tour writes and refuses a response scoped to another trip', async () => {
    await expect(read('tours/19', 'PUT')).rejects.toMatchObject({ status: 405 });
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: { trip_id: locationId, tours: [walk] }, error: null });
    await expect(read('tours')).rejects.toMatchObject({ status: 503 });
  });

  it('sends only the observed revision and selected point and returns the canonical map geometry', async () => {
    const point = [19.431, -99.141];
    const command = { expectedRevision: 1, pointIndex: 1, point };
    const updatedTrack = [track[0], point, ...track.slice(2)];
    await expect(move({ ...command, tourType: 'hike' })).rejects.toMatchObject({ status: 400 });
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: { trip_id: tripId, tours: [{ ...walk, revision: 2, track: updatedTrack }] }, error: null });
    await expect(move(command)).resolves.toMatchObject({ tour: { revision: 2, previewTrack: JSON.stringify(updatedTrack) } });
    expect(rpc).toHaveBeenCalledWith('move_family_trip_tour_track_point_v1', {
      p_trip_id: tripId, p_location_id: locationId, p_expected_revision: 1,
      p_point_index: 1, p_lat: point[0], p_lng: point[1],
    });
  });

  it('surfaces stale revisions and refuses to confirm an unexpected save response', async () => {
    const command = { expectedRevision: 1, pointIndex: 1, point: [19.431, -99.141] };
    rpc.mockResolvedValueOnce({ error: { code: 'PT409' } });
    await expect(move(command)).rejects.toMatchObject({ status: 409 });
    await expect(move(command)).rejects.toMatchObject({ status: 503 });
  });

  it('inserts a point before a station and returns its new index with the saved track', async () => {
    const point = [19.435, -99.14];
    const operationId = '00000000-0000-4000-8000-000000000003';
    const shaped = [track[0], track[1], point, ...track.slice(2)];
    rpc.mockResolvedValueOnce({ data: { trip_id: tripId, tours: [{
      ...walk, track: shaped, revision: 2,
      stops: walk.stops.map(stop => ({ ...stop, index: stop.index ? stop.index + 1 : 0 })),
    }] } });
    await expect(move({ action: 'insert', expectedRevision: 1, pointIndex: 2, point, operationId }))
      .resolves.toMatchObject({ tour: { revision: 2, previewTrack: JSON.stringify(shaped),
        previewStations: [{ index: 0 }, { index: 3 }, { index: 4 }] } });
    expect(rpc).toHaveBeenCalledWith('edit_family_trip_tour_track_shape_v1', {
      p_trip_id: tripId, p_location_id: locationId, p_expected_revision: 1, p_point_index: 2,
      p_action: 'insert', p_operation_id: operationId, p_lat: point[0], p_lng: point[1],
    });
  });

  it('requires a revision advance for removal and sends the original operation on that command', async () => {
    const operationId = '00000000-0000-4000-8000-000000000004';
    const command = { action: 'remove', expectedRevision: 1, pointIndex: 1, operationId };
    await expect(move({ ...command, point: [19.43, -99.13] })).rejects.toMatchObject({ status: 400 });
    expect(rpc).not.toHaveBeenCalled();
    await expect(move(command)).rejects.toMatchObject({ status: 503 });
    expect(rpc).toHaveBeenCalledWith('edit_family_trip_tour_track_shape_v1', {
      p_trip_id: tripId, p_location_id: locationId, p_expected_revision: 1, p_point_index: 1,
      p_action: 'remove', p_operation_id: operationId, p_lat: null, p_lng: null,
    });
  });

  it('saves a station by stable key and accepts only the canonical revision and fields', async () => {
    const operationId = '00000000-0000-4000-8000-000000000005';
    const command = { expectedRevision: 1, operationId, stationKey: 'the-plaza', name: ' Main plaza ', stayMinutes: 18 };
    await expect(editStation({ ...command, index: 2 })).rejects.toMatchObject({ status: 400 });
    expect(rpc).not.toHaveBeenCalled();
    await expect(editStation(command)).rejects.toMatchObject({ status: 503 });
    const stops = [walk.stops[0], { ...walk.stops[1], name: 'Main plaza', stay_minutes: 18 }, walk.stops[2]];
    rpc.mockResolvedValueOnce({ data: { trip_id: tripId, tours: [{ ...walk, revision: 4, stops }] } });
    await expect(editStation(command)).rejects.toMatchObject({ status: 503 });
    rpc.mockResolvedValueOnce({ data: { trip_id: tripId, tours: [{ ...walk, revision: 2, stops }] } });
    await expect(editStation(command)).resolves.toMatchObject({
      tour: { revision: 2, previewTrack: JSON.stringify(track), previewStations: stops },
    });
    expect(rpc).toHaveBeenLastCalledWith('edit_family_trip_tour_station_v1', {
      p_trip_id: tripId, p_location_id: locationId, p_expected_revision: 1, p_operation_id: operationId,
      p_station_key: 'the-plaza', p_name: 'Main plaza', p_stay_minutes: 18,
    });
  });

  it('reports an intervening walk edit using the station conflict response', async () => {
    const command = { expectedRevision: 1, operationId: '00000000-0000-4000-8000-000000000005',
      stationKey: 'the-plaza', name: 'Plaza', stayMinutes: 0 };
    rpc.mockResolvedValueOnce({ error: { code: 'PT409' } });
    await expect(editStation(command)).rejects.toMatchObject({ status: 409, code: 'tour_station_conflict' });
  });

  it('adds a station to an existing track point and verifies the returned identity and index', async () => {
    const operationId = '00000000-0000-4000-8000-000000000006';
    const command = { action: 'add', expectedRevision: 1, operationId, pointIndex: 1, name: 'West plaza', stayMinutes: 5 };
    await expect(editStation({ ...command, pointIndex: 0 })).rejects.toMatchObject({ status: 400 });
    const added = { key: operationId, index: 1, name: 'West plaza', stay_minutes: 5 };
    const stops = [walk.stops[0], added, ...walk.stops.slice(1)];
    const response = (entry: typeof added) => ({
      data: { trip_id: tripId, tours: [{ ...walk, revision: 2, stops: [stops[0], entry, ...stops.slice(2)] }] },
    });
    rpc.mockResolvedValueOnce(response({ ...added, key: 'different-key' }));
    await expect(editStation(command)).rejects.toMatchObject({ status: 503 });
    rpc.mockResolvedValueOnce(response(added));
    await expect(editStation(command)).resolves.toMatchObject({
      tour: { revision: 2, previewTrack: JSON.stringify(track), previewStations: stops },
    });
    expect(rpc).toHaveBeenLastCalledWith('mutate_family_trip_tour_station_v2', {
      p_trip_id: tripId, p_location_id: locationId, p_expected_revision: 1, p_operation_id: operationId,
      p_action: 'add', p_point_index: 1, p_station_key: null, p_name: 'West plaza', p_stay_minutes: 5,
    });
  });

  it('uses the stable station key for removal and requires its absence in the next revision', async () => {
    const operationId = '00000000-0000-4000-8000-000000000007';
    const command = { action: 'remove', expectedRevision: 1, operationId, stationKey: 'the-plaza' };
    rpc.mockResolvedValueOnce({ data: { trip_id: tripId, tours: [{ ...walk, revision: 2 }] } });
    await expect(editStation(command)).rejects.toMatchObject({ status: 503 });
    const stops = [walk.stops[0], walk.stops[2]];
    rpc.mockResolvedValueOnce({ data: { trip_id: tripId, tours: [{ ...walk, revision: 2, stops }] } });
    await expect(editStation(command)).resolves.toMatchObject({
      tour: { previewTrack: JSON.stringify(track), previewStations: stops },
    });
    expect(rpc).toHaveBeenLastCalledWith('mutate_family_trip_tour_station_v2', {
      p_trip_id: tripId, p_location_id: locationId, p_expected_revision: 1, p_operation_id: operationId,
      p_action: 'remove', p_point_index: null, p_station_key: 'the-plaza', p_name: null, p_stay_minutes: null,
    });
  });

  it('moves the same station key to a free point and requires confirmation at that point', async () => {
    const operationId = '00000000-0000-4000-8000-000000000008';
    const command = { action: 'move', expectedRevision: 1, operationId, stationKey: 'the-plaza', pointIndex: 1 };
    await expect(editStation({ ...command, name: 'Unexpected name change' })).rejects.toMatchObject({ status: 400 });
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: { trip_id: tripId, tours: [{ ...walk, revision: 2 }] } });
    await expect(editStation(command)).rejects.toMatchObject({ status: 503 });
    const stops = [walk.stops[0], { ...walk.stops[1], index: 1 }, walk.stops[2]];
    rpc.mockResolvedValueOnce({ data: { trip_id: tripId, tours: [{ ...walk, revision: 2, stops }] } });
    await expect(editStation(command)).resolves.toMatchObject({
      tour: { previewTrack: JSON.stringify(track), previewStations: stops },
    });
    expect(rpc).toHaveBeenLastCalledWith('mutate_family_trip_tour_station_v2', {
      p_trip_id: tripId, p_location_id: locationId, p_expected_revision: 1, p_operation_id: operationId,
      p_action: 'move', p_point_index: 1, p_station_key: 'the-plaza', p_name: null, p_stay_minutes: null,
    });
  });
});
