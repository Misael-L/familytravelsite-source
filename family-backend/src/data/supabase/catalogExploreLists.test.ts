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

const READY_THUMB =
  'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/aa/thumb-aa.webp'

describe('listExploreCatalog place covers', () => {
  const from = vi.fn()
  const inCountry = vi.fn()
  const isFn = vi.fn()
  const order = vi.fn()
  const limit = vi.fn()
  const rpc = vi.fn()

  beforeEach(() => {
    from.mockReset()
    inCountry.mockReset()
    isFn.mockReset()
    order.mockReset()
    limit.mockReset()
    rpc.mockReset()
    rpc.mockResolvedValue({ data: [], error: { code: 'PGRST202', message: 'could not find the function' } })
    limit.mockResolvedValue({
      data: [{
        id: 'pl1',
        name: 'Gubbio',
        place_types: { label: 'Town' },
        cover_media: { id: 'm1', public_url: 'https://cdn.example/gubbio.jpg' },
      }],
      error: null,
    })
    order.mockReturnValue({ limit })
    isFn.mockReturnValue({ order })
    inCountry.mockReturnValue({ is: isFn })
    from.mockReturnValue({
      select: vi.fn().mockReturnValue({ in: inCountry }),
    })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ from, rpc } as never)
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
      'id,name,place_types(label),cover_media:media_assets!cover_media_id(id,public_url)',
    )
    expect(rows).toEqual([{
      id: 'pl1',
      kind: 'place',
      name: 'Gubbio',
      subtitle: 'Town',
      coverUrl: null,
    }])
    expect(JSON.stringify(rows)).not.toContain('/render/image/')
    expect(JSON.stringify(rows)).not.toContain('cdn.example/gubbio.jpg')
    expect(rpc).toHaveBeenCalledWith('catalog_media_variants_for_assets', {
      p_media_ids: ['m1'],
      p_recipe: 'v1',
    })
  })

  it('uses a ready thumb and does not fall back to the canonical cover', async () => {
    limit.mockResolvedValue({
      data: [{
        id: 'pl1',
        name: 'Gubbio',
        place_types: { label: 'Town' },
        cover_media: { id: 'm1', public_url: 'https://cdn.example/gubbio.jpg' },
      }],
      error: null,
    })
    rpc.mockResolvedValue({
      data: [{
        media_asset_id: 'm1',
        public_url: 'https://cdn.example/gubbio.jpg',
        thumb_url: READY_THUMB,
        hero_url: null,
        recipe_version: 'v1',
      }],
      error: null,
    })
    const rows = await listExploreCatalog({
      kind: 'place',
      countryIds: ['c1'],
      limit: 200,
    })
    expect(rpc).toHaveBeenCalledWith('catalog_media_variants_for_assets', {
      p_media_ids: ['m1'],
      p_recipe: 'v1',
    })
    expect(rows[0]?.coverUrl).toBe(READY_THUMB)
    expect(rows[0]?.coverUrl).not.toContain('/render/image/')
  })
})
