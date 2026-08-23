import { getSupabaseBrowserClient } from './client'

export type FamilyAirportSearchRow = {
  id: string
  name: string
  iataCode: string
  latitude: number | null
  longitude: number | null
}

const AIRPORT_SEARCH_MIN = 2

/** Returns the ilike pattern, or null when the query is too short to search. */
export function airportSearchPattern(query: string): string | null {
  const q = query.trim()
  if (q.length < AIRPORT_SEARCH_MIN) return null
  return `%${q}%`
}

export function normalizeIataCode(raw: string | null | undefined): string | null {
  const code = (raw ?? '').trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : null
}

export async function lookupAirportByIata(iata: string): Promise<FamilyAirportSearchRow | null> {
  const code = normalizeIataCode(iata)
  if (!code) return null

  const { data, error } = await getSupabaseBrowserClient()
    .from('airports')
    .select('id,name,iata_code,latitude,longitude')
    .is('archived_at', null)
    .eq('iata_code', code)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  const r = data as {
    id: string
    name: string | null
    iata_code: string | null
    latitude: number | string | null
    longitude: number | string | null
  }
  return {
    id: r.id,
    name: r.name?.trim() || r.iata_code || 'Airport',
    iataCode: (r.iata_code || code).trim().toUpperCase(),
    latitude: toCoord(r.latitude),
    longitude: toCoord(r.longitude),
  }
}

export async function searchAirports(query: string, limit = 20): Promise<FamilyAirportSearchRow[]> {
  const pattern = airportSearchPattern(query)
  if (!pattern) return []

  const { data, error } = await getSupabaseBrowserClient()
    .from('airports')
    .select('id,name,iata_code,latitude,longitude')
    .is('archived_at', null)
    .or(`iata_code.ilike.${pattern},name.ilike.${pattern}`)
    .order('iata_code')
    .limit(limit)

  if (error) throw error
  return ((data ?? []) as Array<{
    id: string
    name: string | null
    iata_code: string | null
    latitude: number | string | null
    longitude: number | string | null
  }>).map(r => ({
    id: r.id,
    name: r.name?.trim() || r.iata_code || 'Airport',
    iataCode: (r.iata_code || '').trim().toUpperCase(),
    latitude: toCoord(r.latitude),
    longitude: toCoord(r.longitude),
  }))
}

function toCoord(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}
