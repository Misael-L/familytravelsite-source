import { getSupabaseBrowserClient } from './client'
import type { CatalogPoiKind } from '../../lib/map/catalogPoiRef'

/** RPC `catalog_media_urls` kinds. Map `CatalogPoiKind` stays food/hotel/experience. */
export type CatalogMediaKind = CatalogPoiKind | 'place'

type CatalogMediaUrlRow = {
  entity_id: string
  position: number
  public_url: string
}

const sessionMemo = new Map<string, string[]>()

function memoKey(kind: CatalogMediaKind, id: string): string {
  return `${kind}:${id}`
}

const HERO_WIDTH = 1200
const THUMB_WIDTH = 96
const VARIANT_OBJECT_MARK = '/object/public/catalog/variants/'

export type CatalogImageRole = 'thumb' | 'hero' | 'full'

export type CatalogVariantDescriptor = {
  mediaAssetId: string
  canonicalUrl: string | null
  thumbUrl: string | null
  heroUrl: string | null
  recipeVersion: string | null
}

type VariantAssetRow = {
  media_asset_id: string
  public_url: string | null
  thumb_url: string | null
  hero_url: string | null
  recipe_version: string | null
}

type VariantGalleryRow = VariantAssetRow & {
  entity_id: string
  position: number
}

/** Ready derivative stored as an ordinary public catalog object. */
export function isReadyCatalogVariantUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.pathname.includes(VARIANT_OBJECT_MARK) && !parsed.pathname.includes('/render/image/')
  } catch {
    return false
  }
}

export function readyHeroSlides<T extends { heroUrl: string | null; canonicalUrl: string }>(
  slides: readonly T[],
): T[] {
  return slides.filter((slide): slide is T => Boolean(slide.heroUrl))
}

function variantApiMissing(error: { code?: string; message?: string }): boolean {
  const message = error.message ?? ''
  return error.code === 'PGRST202' || /could not find the function/i.test(message)
}

/**
 * Rewrite catalog Storage object public URLs to Supabase Image Transformation
 * for originals. Ready `catalog/variants/` object URLs pass through unchanged.
 * Hub chips should use `resolveCatalogImageUrl` with a ready thumb instead.
 */
export function toDisplayImageUrl(canonical: string, width = HERO_WIDTH): string {
  if (isReadyCatalogVariantUrl(canonical)) return canonical
  try {
    const u = new URL(canonical)
    if (u.pathname.includes('/render/image/public/')) {
      u.searchParams.set('width', String(width))
      u.searchParams.set('resize', 'contain')
      u.searchParams.set('quality', '75')
      return u.toString()
    }
    const marker = '/object/public/'
    const idx = u.pathname.indexOf(marker)
    if (idx < 0) return canonical
    const suffix = u.pathname.slice(idx + marker.length)
    if (!suffix.startsWith('catalog/')) return canonical
    if (suffix.startsWith('catalog/variants/')) return canonical
    u.pathname = `${u.pathname.slice(0, idx)}/render/image/public/${suffix}`
    u.searchParams.set('width', String(width))
    u.searchParams.set('resize', 'contain')
    u.searchParams.set('quality', '75')
    return u.toString()
  } catch {
    return canonical
  }
}

/** Boarding-pass / rail chip size — not Explore hero 1200. */
export function toThumbImageUrl(canonical: string): string {
  return toDisplayImageUrl(canonical, THUMB_WIDTH)
}

/**
 * Role-based display URL. Thumb and hero require a ready variant object URL.
 * Full is the canonical original and is only for an explicit user action.
 */
export function resolveCatalogImageUrl(input: {
  canonicalUrl?: string | null
  role: CatalogImageRole
  thumbUrl?: string | null
  heroUrl?: string | null
}): string | null {
  if (input.role === 'full') {
    const canonical = input.canonicalUrl?.trim()
    return canonical || null
  }
  const ready = input.role === 'thumb' ? input.thumbUrl : input.heroUrl
  if (ready && isReadyCatalogVariantUrl(ready)) return ready
  return null
}

function descriptorFromRow(row: VariantAssetRow): CatalogVariantDescriptor {
  const thumb = row.thumb_url?.trim() || null
  const hero = row.hero_url?.trim() || null
  return {
    mediaAssetId: row.media_asset_id,
    canonicalUrl: row.public_url?.trim() || null,
    thumbUrl: thumb && isReadyCatalogVariantUrl(thumb) ? thumb : null,
    heroUrl: hero && isReadyCatalogVariantUrl(hero) ? hero : null,
    recipeVersion: row.recipe_version,
  }
}

/** Batch ready variants by original media asset id. One descriptor per source. */
export async function listCatalogVariantsForAssets(
  mediaIds: string[],
): Promise<Map<string, CatalogVariantDescriptor>> {
  const out = new Map<string, CatalogVariantDescriptor>()
  const ids = [...new Set(mediaIds.filter(Boolean))]
  if (ids.length === 0) return out
  const { data, error } = await getSupabaseBrowserClient().rpc('catalog_media_variants_for_assets', {
    p_media_ids: ids,
    p_recipe: 'v1',
  })
  if (error) {
    if (variantApiMissing(error)) return out
    throw error
  }
  for (const row of (data ?? []) as VariantAssetRow[]) {
    out.set(row.media_asset_id, descriptorFromRow(row))
  }
  return out
}

type GallerySlide = {
  position: number
  mediaAssetId: string
  canonicalUrl: string
  heroUrl: string | null
}

/** Ordered gallery slides. Hero URLs are ready variants only; missing heroes are omitted from display. */
export async function listCatalogVariantSlides(opts: {
  kind: CatalogMediaKind
  ids: string[]
  limitPer?: number
}): Promise<Map<string, GallerySlide[]>> {
  const out = new Map<string, GallerySlide[]>()
  const ids = opts.ids.filter(Boolean)
  if (ids.length === 0) return out
  const { data, error } = await getSupabaseBrowserClient().rpc('catalog_media_variants', {
    p_entity_kind: opts.kind,
    p_entity_ids: ids,
    p_limit_per: opts.limitPer ?? 8,
    p_recipe: 'v1',
  })
  if (error) {
    if (variantApiMissing(error)) return out
    throw error
  }
  const byId = new Map<string, GallerySlide[]>()
  for (const row of (data ?? []) as VariantGalleryRow[]) {
    const canonical = row.public_url?.trim()
    if (!canonical) continue
    const hero = row.hero_url?.trim() || null
    const list = byId.get(row.entity_id) ?? []
    list.push({
      position: row.position,
      mediaAssetId: row.media_asset_id,
      canonicalUrl: canonical,
      heroUrl: hero && isReadyCatalogVariantUrl(hero) ? hero : null,
    })
    byId.set(row.entity_id, list)
  }
  for (const id of ids) {
    const slides = (byId.get(id) ?? []).sort((a, b) => a.position - b.position)
    out.set(id, slides)
  }
  return out
}

export async function listCatalogVariantSlidesForEntity(
  kind: CatalogMediaKind,
  id: string,
  limitPer = 8,
): Promise<GallerySlide[]> {
  const map = await listCatalogVariantSlides({ kind, ids: [id], limitPer })
  return map.get(id) ?? []
}

/**
 * Ordered public catalog image URLs for Explore partial hero.
 * RPC `catalog_media_urls` — member-gated; images only.
 */
export async function listCatalogMediaUrls(opts: {
  kind: CatalogMediaKind
  ids: string[]
  limitPer?: number
}): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  const ids = opts.ids.filter(Boolean)
  if (ids.length === 0) return out

  const uncached: string[] = []
  for (const id of ids) {
    const hit = sessionMemo.get(memoKey(opts.kind, id))
    if (hit) out.set(id, hit)
    else uncached.push(id)
  }
  if (uncached.length === 0) return out

  const { data, error } = await getSupabaseBrowserClient().rpc('catalog_media_urls', {
    p_entity_kind: opts.kind,
    p_entity_ids: uncached,
    p_limit_per: opts.limitPer ?? 8,
  })
  if (error) throw error

  const byId = new Map<string, { position: number; url: string }[]>()
  for (const row of (data ?? []) as CatalogMediaUrlRow[]) {
    const list = byId.get(row.entity_id) ?? []
    list.push({ position: row.position, url: row.public_url })
    byId.set(row.entity_id, list)
  }

  for (const id of uncached) {
    const rows = (byId.get(id) ?? []).sort((a, b) => a.position - b.position)
    const urls = rows.map(r => r.url).filter(Boolean)
    sessionMemo.set(memoKey(opts.kind, id), urls)
    out.set(id, urls)
  }
  return out
}

/** Convenience: media URLs for one catalog entity (empty array if none / OSM). */
export async function listCatalogMediaUrlsForEntity(
  kind: CatalogMediaKind,
  id: string,
  limitPer = 8,
): Promise<string[]> {
  const map = await listCatalogMediaUrls({ kind, ids: [id], limitPer })
  return map.get(id) ?? []
}
