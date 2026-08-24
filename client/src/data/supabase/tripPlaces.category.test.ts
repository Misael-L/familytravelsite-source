import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import { listTripPlaces, updateTripPlaceCategory } from './tripPlaces'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

describe('tripPlaces family category', () => {
  const from = vi.fn()

  beforeEach(() => {
    from.mockReset()
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ from } as never)
  })

  it('decodes the joined Family category and does not use catalog place_type_id as category', async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [{
        place_id: 'pl1',
        is_primary: true,
        family_place_category_id: 'cat-1',
        places: {
          id: 'pl1',
          name: 'Cernobbio',
          latitude: 45.84,
          longitude: 9.08,
          notes: null,
          time_zone: null,
          country_id: 'it',
          place_type_id: 'city',
          cover_media: null,
        },
        family_place_categories: {
          id: 'cat-1',
          name: 'Food',
          color_hex: '#10b981',
          icon_key: 'Utensils',
        },
      }],
      error: null,
    })
    const select = vi.fn().mockReturnValue({ eq })
    from.mockReturnValue({ select })

    const rows = await listTripPlaces('t1')
    expect(select).toHaveBeenCalledWith(expect.stringContaining('family_place_category_id'))
    expect(select).toHaveBeenCalledWith(expect.stringContaining('family_place_categories'))
    expect(rows[0]).toMatchObject({
      id: 'pl1',
      isPrimary: true,
      placeTypeId: 'city',
      familyPlaceCategoryId: 'cat-1',
      familyPlaceCategoryName: 'Food',
      familyPlaceCategoryColor: '#10b981',
      familyPlaceCategoryIcon: 'Utensils',
    })
  })

  it('throws when category patch errors', async () => {
    const eqPlace = vi.fn().mockResolvedValue({ error: { message: 'denied' } })
    const eqTrip = vi.fn().mockReturnValue({ eq: eqPlace })
    const update = vi.fn().mockReturnValue({ eq: eqTrip })
    from.mockReturnValue({ update })
    await expect(updateTripPlaceCategory('t1', 'pl1', null)).rejects.toMatchObject({ message: 'denied' })
    expect(update).toHaveBeenCalledWith({ family_place_category_id: null })
  })
})
