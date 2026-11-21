/**
 * Family Travel hub trip shape (UUID ids) — used on the supabase data plane.
 * Do not coerce into @trek/shared Trip (numeric Nest ids).
 */

export type FamilyHubMember = {
  personId: string
  displayName: string
  color: string | null
  avatarUrl: string | null
}

export type FamilyHubPlace = {
  id: string
  name: string
  lat: number | null
  lng: number | null
  imageUrl: string | null
}

/** Batched hub traveler row (non-null person_id). Display name may be missing. */
export type FamilyHubTravelerInput = {
  tripId: string
  personId: string
  displayName: string | null
  color: string | null
  avatarUrl: string | null
}

export type FamilyHubPlaceInput = {
  tripId: string
  placeId: string
  name: string | null
  lat: number | null
  lng: number | null
  imageUrl?: string | null
}

export type FamilyDashboardTrip = {
  id: string
  family_id: string
  title: string
  description: string | null
  start_date: string | null
  end_date: string | null
  cover_image: string | null
  is_archived: number
  currency: string
  reminder_days: number
  status: string
  day_count?: number
  place_count?: number
  traveler_count?: number
  is_owner?: number
  owner_username?: string
  /** Nest collaborator count — omit on Family trips (do not use as traveler total). */
  shared_count?: number
  hub_members?: FamilyHubMember[]
  hub_places?: FamilyHubPlace[]
}

export type FamilyTripRowInput = {
  id: string
  family_id: string
  name: string
  start_at: string | null
  end_at: string | null
  status: string
  cover_url: string | null
  notes: string | null
  reminder_days: number | null
  archived_at: string | null
  currency_code?: string | null
}

/** YYYY-MM-DD from timestamptz / date string for hub date helpers. */
export function toDateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/** Inclusive civil days; 0 when either date is missing (not proposal fallback of 7). */
export function hubDayCount(start: string | null | undefined, end: string | null | undefined): number {
  if (!start || !end) return 0
  const a = Date.parse(`${start}T00:00:00.000Z`)
  const b = Date.parse(`${end}T00:00:00.000Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0
  return Math.round((b - a) / 86400000) + 1
}

export function familyTripRowToDashboardTrip(row: FamilyTripRowInput): FamilyDashboardTrip {
  const start_date = toDateOnly(row.start_at)
  const end_date = toDateOnly(row.end_at)
  return {
    id: row.id,
    family_id: row.family_id,
    title: row.name,
    description: row.notes,
    start_date,
    end_date,
    cover_image: row.cover_url,
    is_archived: row.archived_at ? 1 : 0,
    currency: (row.currency_code?.trim() || 'USD').toUpperCase(),
    reminder_days: row.reminder_days ?? 0,
    status: row.status,
    day_count: hubDayCount(start_date, end_date),
    place_count: 0,
    traveler_count: 0,
    is_owner: 1,
  }
}

export function applyHubEnrichment(
  trips: FamilyDashboardTrip[],
  travelers: FamilyHubTravelerInput[],
  places: FamilyHubPlaceInput[],
): FamilyDashboardTrip[] {
  const travelersByTrip = new Map<string, FamilyHubTravelerInput[]>()
  for (const row of travelers) {
    const list = travelersByTrip.get(row.tripId) ?? []
    list.push(row)
    travelersByTrip.set(row.tripId, list)
  }
  const placesByTrip = new Map<string, FamilyHubPlaceInput[]>()
  for (const row of places) {
    const list = placesByTrip.get(row.tripId) ?? []
    list.push(row)
    placesByTrip.set(row.tripId, list)
  }

  return trips.map((trip) => {
    const tRows = travelersByTrip.get(trip.id) ?? []
    const pRows = placesByTrip.get(trip.id) ?? []
    const hub_members: FamilyHubMember[] = []
    for (const row of tRows) {
      const displayName = row.displayName?.trim()
      if (!displayName) continue
      hub_members.push({
        personId: row.personId,
        displayName,
        color: row.color,
        avatarUrl: row.avatarUrl,
      })
    }
    const hub_places: FamilyHubPlace[] = pRows
      .filter((row) => row.placeId)
      .map((row) => ({
        id: row.placeId,
        name: row.name?.trim() || 'Untitled place',
        lat: row.lat,
        lng: row.lng,
        imageUrl: row.imageUrl ?? null,
      }))
    return {
      ...trip,
      traveler_count: tRows.length,
      place_count: hub_places.length,
      hub_members,
      hub_places,
    }
  })
}

/** Archive/unarchive returns an un-enriched row — copy hub counts from memory. */
export function keepHubEnrichment(
  next: FamilyDashboardTrip,
  prev: FamilyDashboardTrip | undefined,
): FamilyDashboardTrip {
  if (!prev) return next
  return {
    ...next,
    place_count: prev.place_count,
    traveler_count: prev.traveler_count,
    hub_members: prev.hub_members,
    hub_places: prev.hub_places,
  }
}

export function hashTripId(id: string | number): number {
  if (typeof id === 'number' && Number.isFinite(id)) return Math.abs(Math.trunc(id))
  let h = 0
  const s = String(id)
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}
