import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import {
  listCatalogVariantSlidesForEntity,
  listCatalogVariantsForAssets,
  readyHeroSlides,
  resolveCatalogImageUrl,
  toDisplayImageUrl,
  toThumbImageUrl,
} from './catalogExploreMedia'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

const OBJECT =
  'https://catalog.example.invalid/storage/v1/object/public/catalog/places/gubbio.jpg'

describe('toDisplayImageUrl', () => {
  it('rewrites catalog object URLs to hero transforms', () => {
    expect(toDisplayImageUrl(OBJECT)).toBe(
      'https://catalog.example.invalid/storage/v1/render/image/public/catalog/places/gubbio.jpg?width=1200&resize=contain&quality=75',
    )
  })

  it('uses thumb width for boarding-pass chips', () => {
    expect(toThumbImageUrl(OBJECT)).toBe(
      'https://catalog.example.invalid/storage/v1/render/image/public/catalog/places/gubbio.jpg?width=96&resize=contain&quality=75',
    )
  })

  it('passes ready variant object URLs through without a transform', () => {
    const variant =
      'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/abc/hero-def.webp'
    expect(toDisplayImageUrl(variant)).toBe(variant)
    expect(toThumbImageUrl(variant)).toBe(variant)
    expect(resolveCatalogImageUrl({ role: 'thumb', thumbUrl: variant })).toBe(variant)
    expect(resolveCatalogImageUrl({ role: 'hero', canonicalUrl: OBJECT })).toBeNull()
    expect(resolveCatalogImageUrl({ role: 'full', canonicalUrl: OBJECT })).toBe(OBJECT)
  })

  it('keeps view-original aligned when earlier slides have no hero', () => {
    const slides = [
      { heroUrl: null, canonicalUrl: 'https://cdn.example/a.jpg' },
      {
        heroUrl: 'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/bb/hero-b.webp',
        canonicalUrl: 'https://cdn.example/b.jpg',
      },
    ]
    const ready = readyHeroSlides(slides)
    expect(ready).toHaveLength(1)
    expect(ready[0]?.heroUrl).toContain('/variants/')
    expect(ready[0]?.canonicalUrl).toBe('https://cdn.example/b.jpg')
  })
})

const THUMB =
  'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/aa/thumb-aa.webp'
const HERO =
  'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/bb/hero-bb.webp'
const CANON =
  'https://catalog.example.invalid/storage/v1/object/public/catalog/places/gubbio.jpg'

describe('catalog variant RPCs', () => {
  const rpc = vi.fn()

  beforeEach(() => {
    rpc.mockReset()
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
  })

  it('requests ready asset variants and ignores null or transformed URLs', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          media_asset_id: 'm1',
          public_url: CANON,
          thumb_url: THUMB,
          hero_url: 'https://catalog.example.invalid/storage/v1/render/image/public/catalog/places/gubbio.jpg',
          recipe_version: 'v1',
        },
        {
          media_asset_id: 'm2',
          public_url: CANON,
          thumb_url: null,
          hero_url: null,
          recipe_version: 'v1',
        },
      ],
      error: null,
    })
    const map = await listCatalogVariantsForAssets(['m1', 'm1', ''])
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('catalog_media_variants_for_assets', {
      p_media_ids: ['m1'],
      p_recipe: 'v1',
    })
    expect(map.get('m1')).toMatchObject({
      thumbUrl: THUMB,
      heroUrl: null,
      canonicalUrl: CANON,
    })
    expect(map.get('m2')).toMatchObject({ thumbUrl: null, heroUrl: null })
    expect(resolveCatalogImageUrl({ role: 'thumb', thumbUrl: map.get('m2')?.thumbUrl, canonicalUrl: CANON })).toBeNull()
    expect(JSON.stringify([...map.values()])).not.toContain('/render/image/')
  })

  it('returns an empty map when the asset variant RPC is unavailable', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.catalog_media_variants_for_assets' },
    })
    await expect(listCatalogVariantsForAssets(['m1'])).resolves.toEqual(new Map())
  })

  it('throws when the asset variant RPC returns a real error', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } })
    await expect(listCatalogVariantsForAssets(['m1'])).rejects.toMatchObject({ message: 'denied' })
  })

  it('orders gallery slides and keeps a missing hero off the display list', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          entity_id: 'e1',
          position: 2,
          media_asset_id: 'c',
          public_url: 'https://cdn.example/c.jpg',
          thumb_url: null,
          hero_url: HERO,
          recipe_version: 'v1',
        },
        {
          entity_id: 'e1',
          position: 0,
          media_asset_id: 'a',
          public_url: 'https://cdn.example/a.jpg',
          thumb_url: null,
          hero_url: null,
          recipe_version: 'v1',
        },
        {
          entity_id: 'e1',
          position: 1,
          media_asset_id: 'b',
          public_url: '   ',
          thumb_url: null,
          hero_url: HERO,
          recipe_version: 'v1',
        },
      ],
      error: null,
    })
    const slides = await listCatalogVariantSlidesForEntity('place', 'e1')
    expect(rpc).toHaveBeenCalledWith('catalog_media_variants', {
      p_entity_kind: 'place',
      p_entity_ids: ['e1'],
      p_limit_per: 8,
      p_recipe: 'v1',
    })
    expect(slides.map(slide => slide.mediaAssetId)).toEqual(['a', 'c'])
    expect(slides[0]?.heroUrl).toBeNull()
    expect(slides[1]?.heroUrl).toBe(HERO)
    expect(readyHeroSlides(slides).map(slide => slide.canonicalUrl)).toEqual(['https://cdn.example/c.jpg'])
  })

  it('returns no slides when the gallery RPC is unavailable', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'could not find the function' },
    })
    await expect(listCatalogVariantSlidesForEntity('hotel', 'h1')).resolves.toEqual([])
  })
})
