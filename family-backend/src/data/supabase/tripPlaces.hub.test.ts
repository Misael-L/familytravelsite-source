import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import { listHubTripPlaces } from './tripPlaces'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

const COVER_SELECT =
  'trip_id,place_id,places(name,latitude,longitude,cover_media:media_assets!cover_media_id(id,public_url))'
const FALLBACK_SELECT = 'trip_id,place_id,places(name,latitude,longitude)'

const READY_THUMB =
  'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/aa/thumb-aa.webp'

describe('listHubTripPlaces', () => {
  const from = vi.fn()
  const rpc = vi.fn()

  beforeEach(() => {
    from.mockReset()
    rpc.mockReset()
    rpc.mockResolvedValue({ data: [], error: { code: 'PGRST202', message: 'could not find the function' } })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ from, rpc } as never)
  })

  it('returns [] without querying when tripIds is empty', async () => {
    await expect(listHubTripPlaces([])).resolves.toEqual([])
    expect(from).not.toHaveBeenCalled()
  })

  it('queries hub-light places with cover embed', async () => {
    const inFn = vi.fn().mockResolvedValue({
      data: [
        {
          trip_id: 't1',
          place_id: 'pl1',
          places: {
            name: 'Paris',
            latitude: 48.8,
            longitude: '2.3',
            cover_media: { id: 'm1', public_url: 'https://cdn.example/paris.jpg' },
          },
        },
        {
          trip_id: 't1',
          place_id: 'pl2',
          places: [{ name: 'Lyon', latitude: null, longitude: null }],
        },
      ],
      error: null,
    })
    const select = vi.fn().mockReturnValue({ in: inFn })
    from.mockReturnValue({ select })

    const rows = await listHubTripPlaces(['t1', 't2'])
    expect(from).toHaveBeenCalledWith('trip_places')
    expect(select).toHaveBeenCalledWith(COVER_SELECT)
    expect(inFn).toHaveBeenCalledWith('trip_id', ['t1', 't2'])
    expect(rows).toEqual([
      {
        tripId: 't1',
        placeId: 'pl1',
        name: 'Paris',
        lat: 48.8,
        lng: 2.3,
        imageUrl: null,
      },
      { tripId: 't1', placeId: 'pl2', name: 'Lyon', lat: null, lng: null, imageUrl: null },
    ])
    expect(rpc).toHaveBeenCalledWith('catalog_media_variants_for_assets', {
      p_media_ids: ['m1'],
      p_recipe: 'v1',
    })
    expect(JSON.stringify(rows)).not.toContain('/render/image/')
    expect(JSON.stringify(rows)).not.toContain('cdn.example/paris.jpg')
  })

  it('retries name/coords when the cover embed fails', async () => {
    const coverIn = vi.fn().mockResolvedValue({ data: null, error: { message: 'embed missing' } })
    const fallbackIn = vi.fn().mockResolvedValue({
      data: [{
        trip_id: 't1',
        place_id: 'pl1',
        places: { name: 'Paris', latitude: 48.8, longitude: 2.3 },
      }],
      error: null,
    })
    const select = vi.fn()
      .mockReturnValueOnce({ in: coverIn })
      .mockReturnValueOnce({ in: fallbackIn })
    from.mockReturnValue({ select })

    const rows = await listHubTripPlaces(['t1'])
    expect(select).toHaveBeenNthCalledWith(1, COVER_SELECT)
    expect(select).toHaveBeenNthCalledWith(2, FALLBACK_SELECT)
    expect(rows).toEqual([
      { tripId: 't1', placeId: 'pl1', name: 'Paris', lat: 48.8, lng: 2.3, imageUrl: null },
    ])
    expect(JSON.stringify(rows)).not.toContain('/render/image/')
  })

  it('uses a ready thumb and does not transform the canonical cover', async () => {
    const inFn = vi.fn().mockResolvedValue({
      data: [{
        trip_id: 't1',
        place_id: 'pl1',
        places: {
          name: 'Paris',
          latitude: 48.8,
          longitude: 2.3,
          cover_media: { id: 'm1', public_url: 'https://cdn.example/paris.jpg' },
        },
      }],
      error: null,
    })
    from.mockReturnValue({ select: vi.fn().mockReturnValue({ in: inFn }) })
    rpc.mockResolvedValue({
      data: [{
        media_asset_id: 'm1',
        public_url: 'https://cdn.example/paris.jpg',
        thumb_url: READY_THUMB,
        hero_url: null,
        recipe_version: 'v1',
      }],
      error: null,
    })
    const rows = await listHubTripPlaces(['t1'])
    expect(rpc).toHaveBeenCalledWith('catalog_media_variants_for_assets', {
      p_media_ids: ['m1'],
      p_recipe: 'v1',
    })
    expect(rows[0]?.imageUrl).toBe(READY_THUMB)
    expect(rows[0]?.imageUrl).not.toContain('/render/image/')
  })

  it('throws on { error } when fallback also fails', async () => {
    const inFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'down' } })
    from.mockReturnValue({
      select: vi.fn().mockReturnValue({ in: inFn }),
    })
    await expect(listHubTripPlaces(['t1'])).rejects.toMatchObject({ message: 'down' })
  })
})
