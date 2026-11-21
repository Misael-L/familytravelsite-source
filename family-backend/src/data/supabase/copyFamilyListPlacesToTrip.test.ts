import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addCatalogPlaceToTrip } from './exploreAddToTrip'
import {
  copyFamilyListPlacesToTrip,
  isFamilyCopyPlaceItem,
} from './copyFamilyListPlacesToTrip'

vi.mock('./exploreAddToTrip', () => ({
  addCatalogPlaceToTrip: vi.fn(),
}))

describe('isFamilyCopyPlaceItem', () => {
  it('accepts catalog places and rejects other kinds', () => {
    expect(isFamilyCopyPlaceItem({
      id: 'i1', name: 'Gubbio', catalog_kind: 'place', catalog_entity_id: 'pl-1',
    })).toBe(true)
    expect(isFamilyCopyPlaceItem({
      id: 'i2', name: 'Pasta', catalog_kind: 'food', catalog_entity_id: 'f-1',
    })).toBe(false)
    expect(isFamilyCopyPlaceItem({
      id: 'i3', name: 'Inn', catalog_kind: 'hotel', catalog_entity_id: 'h-1',
    })).toBe(false)
    expect(isFamilyCopyPlaceItem({
      id: 'i4', name: 'Tour', catalog_kind: 'experience', catalog_entity_id: 'ex-1',
    })).toBe(false)
  })
})

describe('copyFamilyListPlacesToTrip', () => {
  beforeEach(() => {
    vi.mocked(addCatalogPlaceToTrip).mockReset()
  })

  it('throws hofOnly without calling addCatalogPlaceToTrip', async () => {
    await expect(copyFamilyListPlacesToTrip({
      tripId: 'trip-1',
      items: [{ id: 'i1', name: 'Gubbio', catalog_kind: 'place', catalog_entity_id: 'pl-1' }],
      canMutate: false,
      tripPlaceIds: new Set(),
    })).rejects.toMatchObject({ code: 'hofOnly' })
    expect(addCatalogPlaceToTrip).not.toHaveBeenCalled()
  })

  it('copies places via W8.5 and skips food/hotel/experience', async () => {
    vi.mocked(addCatalogPlaceToTrip).mockResolvedValue({ ok: true, outcome: 'added' })
    const res = await copyFamilyListPlacesToTrip({
      tripId: 'trip-1',
      items: [
        { id: 'i1', name: 'Gubbio', catalog_kind: 'place', catalog_entity_id: 'pl-1' },
        { id: 'i2', name: 'Trattoria', catalog_kind: 'food', catalog_entity_id: 'f-1' },
        { id: 'i3', name: 'Inn', catalog_kind: 'hotel', catalog_entity_id: 'h-1' },
        { id: 'i4', name: 'Tour', catalog_kind: 'experience', catalog_entity_id: 'ex-1' },
      ],
      canMutate: true,
      tripPlaceIds: new Set(),
    })
    expect(addCatalogPlaceToTrip).toHaveBeenCalledTimes(1)
    expect(addCatalogPlaceToTrip).toHaveBeenCalledWith(expect.objectContaining({
      tripId: 'trip-1',
      placeId: 'pl-1',
      canMutate: true,
      confirmedOutOfPurview: true,
    }))
    expect(res.copied).toBe(1)
    expect(res.skipped.map(s => s.name)).toEqual(['Trattoria', 'Inn', 'Tour'])
  })

  it('counts already-on-trip places as skipped', async () => {
    vi.mocked(addCatalogPlaceToTrip).mockResolvedValue({ ok: true, outcome: 'already' })
    const res = await copyFamilyListPlacesToTrip({
      tripId: 'trip-1',
      items: [{ id: 'i1', name: 'Gubbio', catalog_kind: 'place', catalog_entity_id: 'pl-1' }],
      canMutate: true,
      tripPlaceIds: new Set(['pl-1']),
    })
    expect(res).toEqual({ copied: 0, skipped: [{ id: 'i1', name: 'Gubbio' }] })
  })
})
