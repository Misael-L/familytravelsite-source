import { getSupabaseBrowserClient } from './client'

export type CatalogPlaceHit = {
  id: string
  name: string
  countryId: string | null
}

type PlaceSearchRow = {
  id: string
  name: string | null
  country_id: string | null
}

/** `trips.primary_country_id` ∪ `trip_countries.country_id`. */
export async function listTripCountryIds(tripId: string): Promise<string[]> {
  const sb = getSupabaseBrowserClient()
  const [{ data: trip, error: tripErr }, { data: extra, error: extraErr }] = await Promise.all([
    sb.from('trips').select('primary_country_id').eq('id', tripId).maybeSingle(),
    sb.from('trip_countries').select('country_id').eq('trip_id', tripId),
  ])
  if (tripErr) throw tripErr
  if (extraErr) throw extraErr

  const ids = new Set<string>()
  const primary = (trip as { primary_country_id?: string | null } | null)?.primary_country_id
  if (primary) ids.add(primary)
  for (const row of (extra ?? []) as { country_id: string | null }[]) {
    if (row.country_id) ids.add(row.country_id)
  }
  return [...ids]
}

/**
 * Catalog search for Add Place. Scoped to trip countries when present;
 * otherwise requires ≥2 search characters.
 */
export async function searchCatalogPlaces(opts: {
  query: string
  countryIds: string[]
  excludeIds?: string[]
  limit?: number
}): Promise<CatalogPlaceHit[]> {
  const q = opts.query.trim()
  const countryIds = opts.countryIds
  if (countryIds.length === 0 && q.length < 2) return []

  let req = getSupabaseBrowserClient()
    .from('places')
    .select('id,name,country_id')
    .is('archived_at', null)
    .order('name')
    .limit(opts.limit ?? 80)

  if (countryIds.length > 0) req = req.in('country_id', countryIds)
  if (q) req = req.ilike('name', `%${q}%`)

  const { data, error } = await req
  if (error) throw error

  const exclude = new Set(opts.excludeIds ?? [])
  return ((data ?? []) as PlaceSearchRow[])
    .filter(r => r.id && !exclude.has(r.id))
    .map(r => ({
      id: r.id,
      name: r.name?.trim() || 'Untitled place',
      countryId: r.country_id,
    }))
}

export async function listPlacesByIds(ids: string[]): Promise<CatalogPlaceHit[]> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return []
  const { data, error } = await getSupabaseBrowserClient()
    .from('places')
    .select('id,name,country_id')
    .in('id', unique)
  if (error) throw error
  return ((data ?? []) as PlaceSearchRow[])
    .filter(r => r.id)
    .map(r => ({
      id: r.id,
      name: r.name?.trim() || 'Untitled place',
      countryId: r.country_id,
    }))
}
