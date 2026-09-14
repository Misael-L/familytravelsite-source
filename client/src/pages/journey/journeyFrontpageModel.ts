import { computeJourneyLifecycle } from '../../utils/journeyLifecycle'
import { addLocalIsoDays, localIsoDate } from '../../utils/localIsoDate'
import type { Journey, JourneyEntityId } from '../../store/journeyStore'

export const FAMILY_JOURNEY_SUGGESTION_WINDOW_DAYS = 30

export type JourneyListItem = Journey & {
  entry_count?: number
  photo_count?: number
  place_count?: number
  linked_trip_ids?: JourneyEntityId[]
}

export type JourneySuggestionTrip = {
  id: JourneyEntityId
  title: string
  start_date?: string | null
  end_date?: string | null
  cover_image?: string | null
  place_count?: number
  linked?: boolean
}

export function pickJourneyHero(
  journeys: Journey[],
  searchQuery: string,
  today: string = localIsoDate(),
): Journey | null {
  if (searchQuery.trim() || journeys.length === 0) return null
  const live = journeys.find(j =>
    computeJourneyLifecycle(j.status, j.trip_date_min, j.trip_date_max, today) === 'live',
  )
  return live ?? journeys[0]
}

export function isLiveJourney(journey: Journey | null, today: string = localIsoDate()): boolean {
  if (!journey) return false
  return computeJourneyLifecycle(journey.status, journey.trip_date_min, journey.trip_date_max, today) === 'live'
}

export function linkedTripIdSet(journeys: JourneyListItem[]): Set<string> {
  const ids = new Set<string>()
  for (const journey of journeys) {
    for (const id of journey.linked_trip_ids ?? []) {
      if (id != null && String(id)) ids.add(String(id))
    }
  }
  return ids
}

/**
 * Family `Trip just ended` eligibility — documented in locks §44.
 * Nest `getSuggestions` is not used on the Family plane.
 */
export function pickFamilyEndedTripSuggestion(
  trips: JourneySuggestionTrip[],
  linkedTripIds: Iterable<string>,
  today: string = localIsoDate(),
  windowDays: number = FAMILY_JOURNEY_SUGGESTION_WINDOW_DAYS,
): JourneySuggestionTrip | undefined {
  const linked = new Set([...linkedTripIds].map(String))
  const windowStart = addLocalIsoDays(today, -windowDays)
  const eligible = trips.filter(trip => {
    if (trip.linked === true) return false
    if (linked.has(String(trip.id))) return false
    const end = trip.end_date
    if (!end) return false
    return end <= today && end >= windowStart
  })
  eligible.sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)))
  return eligible[0]
}

export function journeyStatDisplay(value: number | undefined | null): string | number {
  if (value == null || value <= 0) return '--'
  return value
}
