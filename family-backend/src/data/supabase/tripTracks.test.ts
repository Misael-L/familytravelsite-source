import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import { deleteTripTrack, insertTripTrack, listTripTracks } from './tripTracks'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

function thenable(result: { data: unknown; error: unknown }) {
  const t: Record<string, unknown> = {}
  const self = () => t
  t.select = self
  t.eq = self
  t.order = self
  t.insert = self
  t.delete = self
  t.single = self
  t.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return t
}

const input = {
  name: 'Hike',
  kind: 'track' as const,
  source: 'gpx' as const,
  sourceFilename: 'hike.gpx',
  geometry: { type: 'LineString' as const, coordinates: [[11, 46], [11.1, 46.1]] as [number, number][] },
  startLat: 46,
  startLng: 11,
  createdByPersonId: 'p1',
  waypoints: [] as Array<{ name: string; lat: number; lng: number; elevation: number | null; sortOrder: number }>,
}

describe('tripTracks adapter', () => {
  const from = vi.fn()

  beforeEach(() => {
    from.mockReset()
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ from } as never)
  })

  it('listTripTracks throws on error', async () => {
    from.mockReturnValue(thenable({ data: null, error: { message: 'nope' } }))
    await expect(listTripTracks('trip-1')).rejects.toMatchObject({ message: 'nope' })
  })

  it('insertTripTrack throws on track insert error', async () => {
    from.mockReturnValue(thenable({ data: null, error: { message: 'hof' } }))
    await expect(insertTripTrack('trip-1', input)).rejects.toMatchObject({ message: 'hof' })
  })

  it('insertTripTrack writes waypoints after the parent row', async () => {
    const trackRow = {
      id: 'tr1',
      trip_id: 'trip-1',
      name: 'Hike',
      kind: 'track',
      source: 'gpx',
      source_filename: 'hike.gpx',
      geometry: input.geometry,
      start_lat: 46,
      start_lng: 11,
      color: null,
      created_by_person_id: 'p1',
      created_at: '2026-08-14T00:00:00Z',
      updated_at: '2026-08-14T00:00:00Z',
    }
    const wpRow = {
      id: 'w1',
      track_id: 'tr1',
      name: 'Spring',
      lat: 46,
      lng: 11,
      elevation: null,
      sort_order: 0,
    }
    from.mockImplementation((table: string) => {
      if (table === 'trip_tracks') return thenable({ data: trackRow, error: null })
      return thenable({ data: [wpRow], error: null })
    })

    const saved = await insertTripTrack('trip-1', {
      ...input,
      waypoints: [{ name: 'Spring', lat: 46, lng: 11, elevation: null, sortOrder: 0 }],
    })
    expect(from).toHaveBeenCalledWith('trip_tracks')
    expect(from).toHaveBeenCalledWith('trip_track_waypoints')
    expect(saved.id).toBe('tr1')
    expect(saved.waypoints).toHaveLength(1)
    expect(saved.waypoints[0].name).toBe('Spring')
  })

  it('deleteTripTrack throws on error', async () => {
    from.mockReturnValue(thenable({ data: null, error: { message: 'denied' } }))
    await expect(deleteTripTrack('tr1')).rejects.toMatchObject({ message: 'denied' })
  })
})
