import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canHeartExplorePoi, catalogSaveTargetColumn, listMyCatalogSavesInCountries } from './catalogSaves'
import { getSupabaseBrowserClient } from './client'
import { orderCatalogItemsBySavedIds, type ExploreCatalogListItem } from './catalogExploreLists'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

const rpc = vi.fn()

beforeEach(() => {
  rpc.mockReset()
  vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
})

function item(id: string, name: string): ExploreCatalogListItem {
  return { id, kind: 'hotel', name, subtitle: null, coverUrl: null }
}

describe('catalogSaveTargetColumn', () => {
  it('maps kind to the person_catalog_saves FK column', () => {
    expect(catalogSaveTargetColumn('place')).toBe('place_id')
    expect(catalogSaveTargetColumn('experience')).toBe('experience_id')
    expect(catalogSaveTargetColumn('food')).toBe('food_id')
    expect(catalogSaveTargetColumn('hotel')).toBe('hotel_id')
  })
})

describe('canHeartExplorePoi', () => {
  it('allows Family Catalog refs and rejects OSM / empty', () => {
    expect(canHeartExplorePoi('catalog:hotel:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toBe(true)
    expect(canHeartExplorePoi('catalog:food:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toBe(true)
    expect(canHeartExplorePoi('node/12345')).toBe(false)
    expect(canHeartExplorePoi(null)).toBe(false)
  })
})

describe('orderCatalogItemsBySavedIds', () => {
  it('keeps a late-alphabet save that a 200-row browse page would miss', () => {
    const savedLate = item('z-late', 'Zzz Inn')
    const browseFirst200 = Array.from({ length: 200 }, (_, i) => item(`a-${i}`, `Aaa ${i}`))
    const hydrated = [...browseFirst200.slice(0, 3), savedLate]
    const ordered = orderCatalogItemsBySavedIds(hydrated, ['z-late'])
    expect(ordered.map(r => r.id)).toEqual(['z-late'])
    expect(browseFirst200.some(r => r.id === 'z-late')).toBe(false)
  })

  it('drops ids that failed country hydration and preserves saved order', () => {
    const rows = [item('b', 'B'), item('a', 'A')]
    expect(orderCatalogItemsBySavedIds(rows, ['a', 'missing', 'b']).map(r => r.id)).toEqual(['a', 'b'])
  })
})

describe('listMyCatalogSavesInCountries', () => {
  it('does not call the RPC when country ids are empty', async () => {
    await expect(listMyCatalogSavesInCountries({ familyId: 'fam-1', countryIds: [] })).resolves.toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps RPC rows and throws on error', async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        kind: 'place',
        entity_id: 'place-1',
        name: 'Florence',
        country_id: 'it',
        created_at: '2026-08-17T00:00:00Z',
      }, {
        kind: 'bogus',
        entity_id: 'x',
        name: 'Nope',
        country_id: null,
        created_at: '2026-08-17T00:00:00Z',
      }],
      error: null,
    })
    await expect(listMyCatalogSavesInCountries({
      familyId: 'fam-1',
      countryIds: ['it'],
    })).resolves.toEqual([{
      kind: 'place',
      entityId: 'place-1',
      name: 'Florence',
      countryId: 'it',
      createdAt: '2026-08-17T00:00:00Z',
    }])
    expect(rpc).toHaveBeenCalledWith('list_my_catalog_saves_in_countries', {
      p_family_id: 'fam-1',
      p_country_ids: ['it'],
    })

    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Not a member of this family' },
    })
    await expect(listMyCatalogSavesInCountries({
      familyId: 'fam-1',
      countryIds: ['it'],
    })).rejects.toMatchObject({ message: 'Not a member of this family' })
  })
})
