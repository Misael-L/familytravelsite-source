import { getSupabaseBrowserClient } from './client'
import type { TravelStats } from '../../pages/dashboard/dashboardModel'

/**
 * Family hub travel stats — mirrors iOS AtlasScratchService / family_travel_stats
 * plus family_country_visited → countries.iso2 for passport flags.
 */
export async function fetchFamilyTravelStats(familyId: string): Promise<TravelStats> {
  const client = getSupabaseBrowserClient()

  const [{ data: statsRow, error: statsError }, { data: visitedRows, error: visitedError }] =
    await Promise.all([
      client
        .from('family_travel_stats')
        .select('total_trips,total_days,total_places')
        .eq('family_id', familyId)
        .maybeSingle(),
      client
        .from('family_country_visited')
        .select('country_id')
        .eq('family_id', familyId),
    ])

  if (statsError) throw statsError
  if (visitedError) throw visitedError

  const countryIds = (visitedRows ?? [])
    .map((r: { country_id: string }) => r.country_id)
    .filter(Boolean)

  let countries: string[] = []
  if (countryIds.length > 0) {
    const { data: countryRows, error: countryError } = await client
      .from('countries')
      .select('iso2')
      .in('id', countryIds)
    if (countryError) throw countryError
    countries = (countryRows ?? [])
      .map((c: { iso2?: unknown }) => (typeof c.iso2 === 'string' ? c.iso2.trim().toUpperCase() : ''))
      .filter((iso2) => /^[A-Z]{2}$/.test(iso2))
      .sort()
  }

  return {
    totalTrips: Number(statsRow?.total_trips ?? 0),
    totalDays: Number(statsRow?.total_days ?? 0),
    totalPlaces: Number(statsRow?.total_places ?? 0),
    totalDistanceKm: 0,
    countries,
  }
}
