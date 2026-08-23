import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import { exploreKindToMediaKind, listExploreCatalog } from './catalogExploreLists'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

describe('exploreKindToMediaKind', () => {
  it('maps place to the catalog_media_urls place kind', () => {
    expect(exploreKindToMediaKind('place')).toBe('place')
    expect(exploreKindToMediaKind('hotel')).toBe('hotel')
  })
})

describe('listExploreCatalog place covers', () => {
  const from = vi.fn()
  const inCountry = vi.fn()
  const isFn = vi.fn()
  const order = vi.fn()
  const limit = vi.fn()

  beforeEach(() => {
    from.mockReset()
    inCountry.mockReset()
    isFn.mockReset()
    order.mockReset()
    limit.mockReset()
    limit.mockResolvedValue({
      data: [{
        id: 'pl1',
        name: 'Gubbio',
        place_types: { label: 'Town' },
        cover_media: { public_url: 'https://cdn.example/gubbio.jpg' },
      }],
      error: null,
    })
    order.mockReturnValue({ limit })
    isFn.mockReturnValue({ order })
    inCountry.mockReturnValue({ is: isFn })
    from.mockReturnValue({
      select: vi.fn().mockReturnValue({ in: inCountry }),
    })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ from } as never)
  })

  it('embeds cover_media on place list rows', async () => {
    const rows = await listExploreCatalog({
      kind: 'place',
      countryIds: ['c1'],
      limit: 200,
    })
    expect(from).toHaveBeenCalledWith('places')
    const select = from.mock.results[0]?.value.select as ReturnType<typeof vi.fn>
    expect(select).toHaveBeenCalledWith(
      'id,name,place_types(label),cover_media:media_assets!cover_media_id(public_url)',
    )
    expect(rows).toEqual([{
      id: 'pl1',
      kind: 'place',
      name: 'Gubbio',
      subtitle: 'Town',
      coverUrl: 'https://cdn.example/gubbio.jpg',
    }])
  })
})
