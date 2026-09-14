/**
 * Country-scoped Family Catalog lists + entity detail for Workspace Explore (W8.3–W8.4).
 * Mirrors iOS ExploreCatalogService — not bbox POI queries.
 */
import { getSupabaseBrowserClient } from './client'
import type { CatalogPoiKind } from '../../lib/map/catalogPoiRef'
import type { CatalogMediaKind } from './catalogExploreMedia'

export type ExploreCatalogKind = 'place' | 'experience' | 'food' | 'hotel'

export type ExploreCatalogListItem = {
  id: string
  kind: ExploreCatalogKind
  name: string
  subtitle: string | null
  coverUrl: string | null
}

export type ExploreDeepLink = {
  kind: ExploreCatalogKind
  id: string
}

/** Unified detail DTO — mirrors iOS ExploreCatalogEntityDetail. */
export type ExploreCatalogEntityDetail = {
  id: string
  kind: ExploreCatalogKind
  name: string
  notes: string | null
  address: string | null
  linkUrl: string | null
  phone: string | null
  typeLabel: string | null
  latitude: number | null
  longitude: number | null
  coverUrl: string | null
  placeId: string | null
}

const LIST_LIMIT = 200

type LabelEmbed = { label?: string | null } | null
type CoverMediaRow = { public_url?: string | null }
type CoverEmbed = CoverMediaRow | CoverMediaRow[] | null

function sanitizedLabel(embed: LabelEmbed): string | null {
  if (!embed || Array.isArray(embed)) return null
  const label = embed.label?.trim()
  return label || null
}

function coverPublicUrl(embed: CoverEmbed): string | null {
  if (!embed) return null
  const row: CoverMediaRow | undefined = Array.isArray(embed) ? embed[0] : embed
  const url = row?.public_url?.trim()
  return url || null
}

function listSubtitle(address: string | null | undefined, type: string | null | undefined): string | null {
  const a = address?.trim() || null
  const t = type?.trim() || null
  if (t && a) return `${t} · ${a}`
  return t || a
}

function trimOrNull(v: string | null | undefined): string | null {
  const t = v?.trim()
  return t || null
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** Map map/partial catalog pin kind → Explore list kind. */
export function catalogPoiKindToExploreKind(kind: CatalogPoiKind): ExploreCatalogKind {
  return kind
}

/** Media RPC kinds — places use catalog_media_urls('place'), not map CatalogPoiKind. */
export function exploreKindToMediaKind(kind: ExploreCatalogKind): CatalogMediaKind {
  return kind
}

export async function listExploreCatalog(opts: {
  kind: ExploreCatalogKind
  countryIds: string[]
  limit?: number
}): Promise<ExploreCatalogListItem[]> {
  return queryCatalogList({
    kind: opts.kind,
    countryIds: opts.countryIds,
    limit: opts.limit ?? LIST_LIMIT,
  })
}

/**
 * Hydrate specific catalog ids that also sit in the trip countries.
 * Preserves caller id order (Saved filter uses created_at desc).
 */
export async function listExploreCatalogByIds(opts: {
  kind: ExploreCatalogKind
  countryIds: string[]
  ids: readonly string[]
}): Promise<ExploreCatalogListItem[]> {
  const ids = opts.ids.filter(Boolean)
  if (ids.length === 0) return []
  const rows = await queryCatalogList({
    kind: opts.kind,
    countryIds: opts.countryIds,
    ids,
    limit: ids.length,
  })
  return orderCatalogItemsBySavedIds(rows, ids)
}

/** Keep Saved order; drop ids that failed country / archive hydration. */
export function orderCatalogItemsBySavedIds(
  items: ExploreCatalogListItem[],
  savedIds: readonly string[],
): ExploreCatalogListItem[] {
  const byId = new Map(items.map(item => [item.id, item]))
  const out: ExploreCatalogListItem[] = []
  for (const id of savedIds) {
    const item = byId.get(id)
    if (item) out.push(item)
  }
  return out
}

async function queryCatalogList(opts: {
  kind: ExploreCatalogKind
  countryIds: string[]
  ids?: readonly string[]
  limit: number
}): Promise<ExploreCatalogListItem[]> {
  const countryIds = opts.countryIds.filter(Boolean)
  if (countryIds.length === 0) return []
  if (opts.ids && opts.ids.length === 0) return []

  const sb = getSupabaseBrowserClient()
  const byIds = opts.ids && opts.ids.length > 0

  switch (opts.kind) {
    case 'place': {
      let q = sb
        .from('places')
        .select('id,name,place_types(label),cover_media:media_assets!cover_media_id(public_url)')
        .in('country_id', countryIds)
        .is('archived_at', null)
      if (byIds) q = q.in('id', [...opts.ids!])
      else q = q.order('name').limit(opts.limit)
      const { data, error } = await q
      if (error) throw error
      return ((data ?? []) as Array<{
        id: string
        name: string | null
        place_types: LabelEmbed
        cover_media: CoverEmbed
      }>).map(row => ({
        id: row.id,
        kind: 'place' as const,
        name: row.name?.trim() || 'Untitled place',
        subtitle: sanitizedLabel(row.place_types),
        coverUrl: coverPublicUrl(row.cover_media),
      }))
    }
    case 'experience': {
      let q = sb
        .from('experiences')
        .select('id,name,address,experience_types(label),cover_media:media_assets!cover_media_id(public_url)')
        .in('country_id', countryIds)
        .is('archived_at', null)
      if (byIds) q = q.in('id', [...opts.ids!])
      else q = q.order('name').limit(opts.limit)
      const { data, error } = await q
      if (error) throw error
      return ((data ?? []) as Array<{
        id: string
        name: string | null
        address: string | null
        experience_types: LabelEmbed
        cover_media: CoverEmbed
      }>).map(row => ({
        id: row.id,
        kind: 'experience' as const,
        name: row.name?.trim() || 'Untitled experience',
        subtitle: listSubtitle(row.address, sanitizedLabel(row.experience_types)),
        coverUrl: coverPublicUrl(row.cover_media),
      }))
    }
    case 'food': {
      let q = sb
        .from('foods')
        .select('id,name,address,establishment_types(label),cover_media:media_assets!cover_media_id(public_url)')
        .in('country_id', countryIds)
        .is('archived_at', null)
      if (byIds) q = q.in('id', [...opts.ids!])
      else q = q.order('name').limit(opts.limit)
      const { data, error } = await q
      if (error) throw error
      return ((data ?? []) as Array<{
        id: string
        name: string | null
        address: string | null
        establishment_types: LabelEmbed
        cover_media: CoverEmbed
      }>).map(row => ({
        id: row.id,
        kind: 'food' as const,
        name: row.name?.trim() || 'Untitled food',
        subtitle: listSubtitle(row.address, sanitizedLabel(row.establishment_types)),
        coverUrl: coverPublicUrl(row.cover_media),
      }))
    }
    case 'hotel': {
      let q = sb
        .from('hotels')
        .select('id,name,address,cover_media:media_assets!cover_media_id(public_url)')
        .in('country_id', countryIds)
        .is('archived_at', null)
      if (byIds) q = q.in('id', [...opts.ids!])
      else q = q.order('name').limit(opts.limit)
      const { data, error } = await q
      if (error) throw error
      return ((data ?? []) as Array<{
        id: string
        name: string | null
        address: string | null
        cover_media: CoverEmbed
      }>).map(row => ({
        id: row.id,
        kind: 'hotel' as const,
        name: row.name?.trim() || 'Untitled hotel',
        subtitle: row.address?.trim() || null,
        coverUrl: coverPublicUrl(row.cover_media),
      }))
    }
  }
}

/**
 * Fetch one Catalog entity by id (W8.4). Not country-scoped — deep-link opens
 * detail even when the row is outside the trip-country list filter.
 * Returns null when missing / archived.
 */
export async function fetchExploreCatalogDetail(opts: {
  kind: ExploreCatalogKind
  id: string
}): Promise<ExploreCatalogEntityDetail | null> {
  const id = opts.id?.trim()
  if (!id) return null
  const sb = getSupabaseBrowserClient()

  switch (opts.kind) {
    case 'place': {
      const { data, error } = await sb
        .from('places')
        .select('id,name,notes,latitude,longitude,place_types(label),cover_media:media_assets!cover_media_id(public_url)')
        .eq('id', id)
        .is('archived_at', null)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as {
        id: string
        name: string | null
        notes: string | null
        latitude: unknown
        longitude: unknown
        place_types: LabelEmbed
        cover_media: CoverEmbed
      }
      return {
        id: row.id,
        kind: 'place',
        name: row.name?.trim() || 'Untitled place',
        notes: trimOrNull(row.notes),
        address: null,
        linkUrl: null,
        phone: null,
        typeLabel: sanitizedLabel(row.place_types),
        latitude: numOrNull(row.latitude),
        longitude: numOrNull(row.longitude),
        coverUrl: coverPublicUrl(row.cover_media),
        placeId: row.id,
      }
    }
    case 'experience': {
      const { data, error } = await sb
        .from('experiences')
        .select(
          'id,name,notes,address,inspiration_url,place_id,latitude,longitude,experience_types(label),cover_media:media_assets!cover_media_id(public_url)',
        )
        .eq('id', id)
        .is('archived_at', null)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as {
        id: string
        name: string | null
        notes: string | null
        address: string | null
        inspiration_url: string | null
        place_id: string | null
        latitude: unknown
        longitude: unknown
        experience_types: LabelEmbed
        cover_media: CoverEmbed
      }
      return {
        id: row.id,
        kind: 'experience',
        name: row.name?.trim() || 'Untitled experience',
        notes: trimOrNull(row.notes),
        address: trimOrNull(row.address),
        linkUrl: trimOrNull(row.inspiration_url),
        phone: null,
        typeLabel: sanitizedLabel(row.experience_types),
        latitude: numOrNull(row.latitude),
        longitude: numOrNull(row.longitude),
        coverUrl: coverPublicUrl(row.cover_media),
        placeId: row.place_id,
      }
    }
    case 'food': {
      const { data, error } = await sb
        .from('foods')
        .select(
          'id,name,notes,address,link_url,place_id,latitude,longitude,establishment_types(label),cover_media:media_assets!cover_media_id(public_url)',
        )
        .eq('id', id)
        .is('archived_at', null)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as {
        id: string
        name: string | null
        notes: string | null
        address: string | null
        link_url: string | null
        place_id: string | null
        latitude: unknown
        longitude: unknown
        establishment_types: LabelEmbed
        cover_media: CoverEmbed
      }
      return {
        id: row.id,
        kind: 'food',
        name: row.name?.trim() || 'Untitled food',
        notes: trimOrNull(row.notes),
        address: trimOrNull(row.address),
        linkUrl: trimOrNull(row.link_url),
        phone: null,
        typeLabel: sanitizedLabel(row.establishment_types),
        latitude: numOrNull(row.latitude),
        longitude: numOrNull(row.longitude),
        coverUrl: coverPublicUrl(row.cover_media),
        placeId: row.place_id,
      }
    }
    case 'hotel': {
      const { data, error } = await sb
        .from('hotels')
        .select(
          'id,name,notes,address,website,contact_phone,place_id,latitude,longitude,cover_media:media_assets!cover_media_id(public_url)',
        )
        .eq('id', id)
        .is('archived_at', null)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as {
        id: string
        name: string | null
        notes: string | null
        address: string | null
        website: string | null
        contact_phone: string | null
        place_id: string | null
        latitude: unknown
        longitude: unknown
        cover_media: CoverEmbed
      }
      return {
        id: row.id,
        kind: 'hotel',
        name: row.name?.trim() || 'Untitled hotel',
        notes: trimOrNull(row.notes),
        address: trimOrNull(row.address),
        linkUrl: trimOrNull(row.website),
        phone: trimOrNull(row.contact_phone),
        typeLabel: null,
        latitude: numOrNull(row.latitude),
        longitude: numOrNull(row.longitude),
        coverUrl: coverPublicUrl(row.cover_media),
        placeId: row.place_id,
      }
    }
  }
}
