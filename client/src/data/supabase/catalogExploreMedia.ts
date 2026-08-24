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

/**
 * Rewrite catalog Storage object public URLs to Supabase Image Transformation
 * (mirror iOS CatalogMediaURLPolicy.hero). Hub chips use `toThumbImageUrl`.
 */
export function toDisplayImageUrl(canonical: string, width = HERO_WIDTH): string {
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
    const urls = rows.map(r => toDisplayImageUrl(r.url)).filter(Boolean)
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
