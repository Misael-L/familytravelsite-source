import { getSupabaseBrowserClient } from './client'

export type CatalogCountryHit = {
  id: string
  name: string
  iso2: string | null
}

type CountryRow = {
  id: string
  name: string | null
  iso2: string | null
}

/** iOS `fetchCountries`: empty query lists first `limit`; otherwise `ilike` name. */
export function countryIlikePattern(query: string): string | null {
  const q = query.trim()
  return q ? `%${q}%` : null
}

export async function searchCountries(opts?: {
  query?: string
  limit?: number
}): Promise<CatalogCountryHit[]> {
  const pattern = countryIlikePattern(opts?.query ?? '')
  let req = getSupabaseBrowserClient()
    .from('countries')
    .select('id,name,iso2')
    .is('archived_at', null)
    .order('name')
    .limit(opts?.limit ?? 80)

  if (pattern) req = req.ilike('name', pattern)

  const { data, error } = await req
  if (error) throw error
  return ((data ?? []) as CountryRow[])
    .filter(r => r.id)
    .map(r => ({
      id: r.id,
      name: r.name?.trim() || 'Untitled country',
      iso2: r.iso2?.trim() || null,
    }))
}

export async function listCountriesByIds(ids: string[]): Promise<CatalogCountryHit[]> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return []
  const { data, error } = await getSupabaseBrowserClient()
    .from('countries')
    .select('id,name,iso2')
    .in('id', unique)
  if (error) throw error
  return ((data ?? []) as CountryRow[])
    .filter(r => r.id)
    .map(r => ({
      id: r.id,
      name: r.name?.trim() || 'Untitled country',
      iso2: r.iso2?.trim() || null,
    }))
}
