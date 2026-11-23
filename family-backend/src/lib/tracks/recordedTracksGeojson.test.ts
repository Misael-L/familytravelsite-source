import { describe, expect, it } from 'vitest'
import type { FamilyTripTrack } from '../../data/supabase/tripTracks'
import { tracksToRecordedGeojson } from './recordedTracksGeojson'

const track: FamilyTripTrack = {
  id: 'tr1',
  tripId: 't1',
  name: 'Ridge',
  kind: 'track',
  source: 'gpx',
  sourceFilename: 'ridge.gpx',
  geometry: { type: 'LineString', coordinates: [[9.08, 45.84], [9.09, 45.85]] },
  startLat: 45.84,
  startLng: 9.08,
  color: null,
  createdByPersonId: null,
  createdAt: '2026-08-14T00:00:00Z',
  updatedAt: '2026-08-14T00:00:00Z',
  waypoints: [{
    id: 'w1',
    trackId: 'tr1',
    name: 'Spring',
    lat: 45.84,
    lng: 9.08,
    elevation: null,
    sortOrder: 0,
  }],
}

describe('tracksToRecordedGeojson', () => {
  it('emits RFC 7946 lines and prefixed waypoint ids, not destination pins', () => {
    const fc = tracksToRecordedGeojson([track])
    expect(fc.features).toHaveLength(2)
    expect(fc.features[0].geometry.type).toBe('LineString')
    expect(fc.features[0].id).toBe('track-line-tr1')
    expect((fc.features[0].geometry as GeoJSON.LineString).coordinates[0]).toEqual([9.08, 45.84])
    expect(fc.features[1].id).toBe('track-wpt-w1')
    expect(fc.features[1].properties).toMatchObject({ role: 'waypoint' })
  })
})
