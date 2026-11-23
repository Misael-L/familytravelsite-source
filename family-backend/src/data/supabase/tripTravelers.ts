import { getSupabaseBrowserClient } from './client'

/** Costs roster chip — personId = people.id (mirrors iOS Trip.Traveler.id). */
export type FamilyTripTraveler = {
  personId: string
  displayName: string
  /** Vacay legend color (hex). Null = SPLIT_COLORS fallback in UI. */
  color: string | null
}

type PeopleEmbed = {
  display_name: string | null
  color: string | null
}

type TravelerJoinRow = {
  person_id: string | null
  people: PeopleEmbed | PeopleEmbed[] | null
}

function embedPeople(raw: PeopleEmbed | PeopleEmbed[] | null): PeopleEmbed | null {
  if (!raw) return null
  return Array.isArray(raw) ? (raw[0] ?? null) : raw
}

/**
 * Trip travelers for Costs chips — mirrors iOS fetchTripTravelers
 * (person_id + people.display_name, color).
 */
export async function listTripTravelers(tripId: string): Promise<FamilyTripTraveler[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('trip_travelers')
    .select('person_id,people(display_name,color)')
    .eq('trip_id', tripId)
    .not('person_id', 'is', null)

  if (error) throw error

  const out: FamilyTripTraveler[] = []
  for (const row of (data ?? []) as unknown as TravelerJoinRow[]) {
    if (!row.person_id) continue
    const people = embedPeople(row.people)
    const displayName = people?.display_name?.trim()
    if (!displayName) continue
    out.push({
      personId: row.person_id,
      displayName,
      color: people?.color ?? null,
    })
  }

  out.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
  )
  return out
}

export type FamilyHubTravelerRow = {
  tripId: string
  personId: string
  displayName: string | null
  color: string | null
  avatarUrl: string | null
}

type HubTravelerJoinRow = {
  trip_id: string | null
  person_id: string | null
  people: PeopleEmbed | PeopleEmbed[] | null
}

/**
 * Batched hub travelers — mirrors iOS fetchTripTravelers(tripIds).
 * Counts every non-null person_id; display name may be missing.
 */
export async function listHubTripTravelers(tripIds: string[]): Promise<FamilyHubTravelerRow[]> {
  if (tripIds.length === 0) return []

  const { data, error } = await getSupabaseBrowserClient()
    .from('trip_travelers')
    .select('trip_id,person_id,people(display_name,color)')
    .in('trip_id', tripIds)

  if (error) throw error

  const out: FamilyHubTravelerRow[] = []
  for (const row of (data ?? []) as unknown as HubTravelerJoinRow[]) {
    if (!row.trip_id || !row.person_id) continue
    const people = embedPeople(row.people)
    const displayName = people?.display_name?.trim() || null
    out.push({
      tripId: row.trip_id,
      personId: row.person_id,
      displayName,
      color: people?.color ?? null,
      avatarUrl: null,
    })
  }
  return out
}
