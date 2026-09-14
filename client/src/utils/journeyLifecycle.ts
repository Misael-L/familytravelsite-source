import { localIsoDate } from './localIsoDate'

export type JourneyLifecycle = 'archived' | 'live' | 'upcoming' | 'completed' | 'draft'

export function computeJourneyLifecycle(
  status: string,
  tripDateMin: string | null | undefined,
  tripDateMax: string | null | undefined,
  today: string = localIsoDate(),
): JourneyLifecycle {
  if (status === 'archived') return 'archived'

  if (tripDateMin && tripDateMax) {
    if (tripDateMin <= today && today <= tripDateMax) return 'live'
    if (tripDateMin > today) return 'upcoming'
    return 'completed'
  }

  if (!tripDateMin && !tripDateMax) {
    return 'draft'
  }

  if (tripDateMin && !tripDateMax) {
    return tripDateMin > today ? 'upcoming' : 'live'
  }
  if (!tripDateMin && tripDateMax) {
    return tripDateMax < today ? 'completed' : 'live'
  }

  return 'completed'
}
