import { getSupabaseBrowserClient } from './client'
import type { GeoJsonLineGeometry, TrackKind, TrackSource } from '../../lib/tracks/parseGpxKml'

export type FamilyTrackWaypoint = {
  id: string
  trackId: string
  name: string
  lat: number
  lng: number
  elevation: number | null
  sortOrder: number
}

export type FamilyTripTrack = {
  id: string
  tripId: string
  name: string
  kind: TrackKind
  source: TrackSource
  sourceFilename: string | null
  geometry: GeoJsonLineGeometry | null
  startLat: number
  startLng: number
  color: string | null
  createdByPersonId: string | null
  createdAt: string
  updatedAt: string
  waypoints: FamilyTrackWaypoint[]
}

export type InsertTripTrackInput = {
  name: string
  kind: TrackKind
  source: TrackSource
  sourceFilename: string | null
  geometry: GeoJsonLineGeometry | null
  startLat: number
  startLng: number
  color?: string | null
  createdByPersonId: string | null
  waypoints: Array<{
    name: string
    lat: number
    lng: number
    elevation: number | null
    sortOrder: number
  }>
}

type TrackRow = {
  id: string
  trip_id: string
  name: string
  kind: TrackKind
  source: TrackSource
  source_filename: string | null
  geometry: GeoJsonLineGeometry | null
  start_lat: number
  start_lng: number
  color: string | null
  created_by_person_id: string | null
  created_at: string
  updated_at: string
  trip_track_waypoints?: WaypointRow[] | null
}

type WaypointRow = {
  id: string
  track_id: string
  name: string
  lat: number
  lng: number
  elevation: number | null
  sort_order: number
}

function mapWaypoint(row: WaypointRow): FamilyTrackWaypoint {
  return {
    id: row.id,
    trackId: row.track_id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    elevation: row.elevation,
    sortOrder: row.sort_order,
  }
}

function mapTrack(row: TrackRow): FamilyTripTrack {
  const wps = [...(row.trip_track_waypoints ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  return {
    id: row.id,
    tripId: row.trip_id,
    name: row.name,
    kind: row.kind,
    source: row.source,
    sourceFilename: row.source_filename,
    geometry: row.geometry,
    startLat: row.start_lat,
    startLng: row.start_lng,
    color: row.color,
    createdByPersonId: row.created_by_person_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    waypoints: wps.map(mapWaypoint),
  }
}

export async function listTripTracks(tripId: string): Promise<FamilyTripTrack[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('trip_tracks')
    .select('*, trip_track_waypoints(*)')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return ((data ?? []) as TrackRow[]).map(mapTrack)
}

export async function insertTripTrack(tripId: string, input: InsertTripTrackInput): Promise<FamilyTripTrack> {
  const client = getSupabaseBrowserClient()
  const { data, error } = await client
    .from('trip_tracks')
    .insert({
      trip_id: tripId,
      name: input.name,
      kind: input.kind,
      source: input.source,
      source_filename: input.sourceFilename,
      geometry: input.geometry,
      start_lat: input.startLat,
      start_lng: input.startLng,
      color: input.color ?? null,
      created_by_person_id: input.createdByPersonId,
    })
    .select('*')
    .single()

  if (error) throw error
  const row = data as TrackRow

  if (input.waypoints.length > 0) {
    const { data: wps, error: werr } = await client
      .from('trip_track_waypoints')
      .insert(
        input.waypoints.map(w => ({
          track_id: row.id,
          name: w.name,
          lat: w.lat,
          lng: w.lng,
          elevation: w.elevation,
          sort_order: w.sortOrder,
        })),
      )
      .select('*')

    if (werr) {
      await client.from('trip_tracks').delete().eq('id', row.id)
      throw werr
    }
    return mapTrack({ ...row, trip_track_waypoints: (wps ?? []) as WaypointRow[] })
  }

  return mapTrack({ ...row, trip_track_waypoints: [] })
}

export async function deleteTripTrack(trackId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .from('trip_tracks')
    .delete()
    .eq('id', trackId)

  if (error) throw error
}
