import type { FamilyTripTrack } from '../../data/supabase/tripTracks'

export const RECORDED_TRACK_LINE_SOURCE = 'trip-recorded-tracks'
export const RECORDED_TRACK_WPT_SOURCE = 'trip-recorded-waypoints'
export const DEFAULT_TRACK_COLOR = '#b45309'

export type RecordedTracksCollection = GeoJSON.FeatureCollection<
  GeoJSON.LineString | GeoJSON.MultiLineString | GeoJSON.Point
>

export function tracksToRecordedGeojson(tracks: FamilyTripTrack[]): RecordedTracksCollection {
  const features: RecordedTracksCollection['features'] = []
  for (const tr of tracks) {
    if (tr.geometry && (tr.geometry.type === 'LineString' || tr.geometry.type === 'MultiLineString')) {
      features.push({
        type: 'Feature',
        id: `track-line-${tr.id}`,
        properties: {
          trackId: tr.id,
          color: tr.color || DEFAULT_TRACK_COLOR,
          kind: tr.kind,
          role: 'line',
        },
        geometry: tr.geometry,
      })
    }
    for (const w of tr.waypoints) {
      features.push({
        type: 'Feature',
        id: `track-wpt-${w.id}`,
        properties: {
          trackId: tr.id,
          waypointId: w.id,
          name: w.name,
          role: 'waypoint',
        },
        geometry: { type: 'Point', coordinates: [w.lng, w.lat] },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

export function recordedTracksFitLatLngs(fc: RecordedTracksCollection | null | undefined): [number, number][] {
  if (!fc) return []
  const out: [number, number][] = []
  const walk = (coords: unknown): void => {
    if (!Array.isArray(coords) || coords.length === 0) return
    if (typeof coords[0] === 'number') {
      const lng = coords[0] as number
      const lat = coords[1] as number
      if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng])
      return
    }
    coords.forEach(walk)
  }
  for (const f of fc.features) {
    if (f.geometry && 'coordinates' in f.geometry) walk(f.geometry.coordinates)
  }
  return out
}
