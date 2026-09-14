import { getSupabaseBrowserClient } from './client'
import type { Poi } from '../../components/Map/poiCategories'
import { abortError, isAbortError, throwIfAborted } from '../../lib/abort'

export type CatalogPoiBbox = {
  south: number
  west: number
  north: number
  east: number
}

/** Web TREK pill keys → Family catalog tables / type codes (mirror iOS WorkspacePoiCatalogMapping). */
const FOOD_CODES: Record<string, string[]> = {
  restaurant: [
    'RESTAURANT', 'BISTRO', 'BRASSERIE', 'PIZZERIA', 'DINER', 'BUFFET',
    'FOOD_TRUCK', 'FOOD_STAND', 'YAKINIKU', 'RAMEN_TEN', 'TEPPANYAKI', 'GRILL',
    'BAR_GRILL', 'FRITERIE', 'DELI', 'FARM', 'MARKET',
  ],
  cafe: [
    'CAF', 'COFFEE_SHOP', 'CAF_STAND', 'BAKERY', 'PATISSERIE', 'PASTRY_SHOP',
    'CHOCOLATERIE', 'DONUT_SHOP', 'CANDY_SHOP',
  ],
  /** Web pill has `bar`; iOS folds bars into restaurant — query bar codes alone. */
  bar: ['BAR', 'COCKTAIL_BAR', 'HOLIDAY_POP_UP_BAR', 'BAR_GRILL'],
}

const EXPERIENCE_CODES: Record<string, string> = {
  sights: 'ATTRACTION',
  museum: 'CULTURAL_EXPERIENCES',
  nature: 'NATURE_OUTDOORS',
  activity: 'ACTIVITY',
}

const DEFAULT_LIMIT = 80

type LatLngRow = {
  id: string
  name: string
  latitude: number | string | null
  longitude: number | string | null
  address?: string | null
  website?: string | null
  phone?: string | null
  link_url?: string | null
  inspiration_url?: string | null
  contact_phone?: string | null
  establishment_type_id?: string | null
  experience_type_id?: string | null
}

function asNum(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function toPoi(opts: {
  kind: 'food' | 'hotel' | 'experience'
  row: LatLngRow
  category: string
  poiType: string
}): Poi | null {
  const lat = asNum(opts.row.latitude)
  const lng = asNum(opts.row.longitude)
  if (lat == null || lng == null) return null
  const website = opts.row.website ?? opts.row.link_url ?? opts.row.inspiration_url ?? null
  const phone = opts.row.phone ?? opts.row.contact_phone ?? null
  return {
    osm_id: `catalog:${opts.kind}:${opts.row.id}`,
    name: opts.row.name,
    lat,
    lng,
    category: opts.category,
    poi_type: opts.poiType,
    address: opts.row.address ?? null,
    website,
    phone,
    opening_hours: null,
    cuisine: null,
    source: 'catalog',
  }
}

function throwQueryError(error: unknown, signal?: AbortSignal): void {
  throwIfAborted(signal)
  if (!error) return
  if (isAbortError(error)) throw abortError()
  throw error
}

async function resolveTypeIds(
  table: 'establishment_types' | 'experience_types',
  codes: string[],
  signal?: AbortSignal,
): Promise<string[]> {
  throwIfAborted(signal)
  if (codes.length === 0) return []
  let q = getSupabaseBrowserClient()
    .from(table)
    .select('id,code')
    .in('code', codes)
  if (signal) q = q.abortSignal(signal)
  const { data, error } = await q
  throwQueryError(error, signal)
  return ((data ?? []) as { id: string; code: string }[]).map(r => r.id)
}

function applyBbox<T extends {
  gte: Function
  lte: Function
  is: Function
  limit: Function
  abortSignal?: (s: AbortSignal) => T
}>(
  q: T,
  bbox: CatalogPoiBbox,
  limit: number,
  signal?: AbortSignal,
): T {
  const next = q
    .gte('latitude', bbox.south)
    .lte('latitude', bbox.north)
    .gte('longitude', bbox.west)
    .lte('longitude', bbox.east)
    .is('archived_at', null)
    .limit(limit) as T
  return signal && typeof next.abortSignal === 'function'
    ? next.abortSignal(signal)
    : next
}

/**
 * Family Catalog POIs for one TREK pill category in a map bbox.
 * Mirrors iOS WorkspacePoiService.fetchCatalogPois (lat/lng filters, limit 80).
 */
export async function listCatalogPoisInBbox(opts: {
  category: string
  bbox: CatalogPoiBbox
  limit?: number
  signal?: AbortSignal
}): Promise<Poi[]> {
  const { category, bbox, signal } = opts
  throwIfAborted(signal)
  const limit = opts.limit ?? DEFAULT_LIMIT
  const sb = getSupabaseBrowserClient()

  if (category === 'hotel') {
    let q = sb
      .from('hotels')
      .select('id,name,latitude,longitude,address,website,contact_phone')
    q = applyBbox(q as never, bbox, limit, signal) as typeof q
    const { data, error } = await q
    throwQueryError(error, signal)
    return ((data ?? []) as LatLngRow[])
      .map(row => toPoi({ kind: 'hotel', row, category, poiType: 'hotel' }))
      .filter((p): p is Poi => p != null)
  }

  const foodCodes = FOOD_CODES[category]
  if (foodCodes) {
    const typeIds = await resolveTypeIds('establishment_types', foodCodes, signal)
    throwIfAborted(signal)
    if (typeIds.length === 0) return []
    let q = sb
      .from('foods')
      .select('id,name,latitude,longitude,address,link_url,establishment_type_id')
      .in('establishment_type_id', typeIds)
    q = applyBbox(q as never, bbox, limit, signal) as typeof q
    const { data, error } = await q
    throwQueryError(error, signal)
    return ((data ?? []) as LatLngRow[])
      .map(row => toPoi({ kind: 'food', row, category, poiType: category }))
      .filter((p): p is Poi => p != null)
  }

  const expCode = EXPERIENCE_CODES[category]
  if (expCode) {
    const typeIds = await resolveTypeIds('experience_types', [expCode], signal)
    throwIfAborted(signal)
    if (typeIds.length === 0) return []
    let q = sb
      .from('experiences')
      .select('id,name,latitude,longitude,address,inspiration_url,experience_type_id')
      .eq('experience_type_id', typeIds[0])
    q = applyBbox(q as never, bbox, limit, signal) as typeof q
    const { data, error } = await q
    throwQueryError(error, signal)
    return ((data ?? []) as LatLngRow[])
      .map(row => toPoi({ kind: 'experience', row, category, poiType: expCode }))
      .filter((p): p is Poi => p != null)
  }

  return []
}
