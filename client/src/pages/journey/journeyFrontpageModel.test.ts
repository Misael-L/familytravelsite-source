import { describe, expect, it } from 'vitest'
import type { Journey } from '../../store/journeyStore'
import {
  isLiveJourney,
  journeyStatDisplay,
  linkedTripIdSet,
  pickFamilyEndedTripSuggestion,
  pickJourneyHero,
} from './journeyFrontpageModel'

function journey(overrides: Partial<Journey> & { linked_trip_ids?: string[] } = {}): Journey & { linked_trip_ids?: string[] } {
  return {
    id: 'j-1',
    user_id: 'p-1',
    title: 'Como',
    status: 'draft',
    created_at: 1,
    updated_at: 1,
    ...overrides,
  }
}

describe('pickJourneyHero', () => {
  const today = '2026-08-29'

  it('prefers a live journey over a newer completed one', () => {
    const newest = journey({ id: 'newest', title: 'Latest', trip_date_min: '2026-07-01', trip_date_max: '2026-07-10' })
    const live = journey({ id: 'live', title: 'Live', status: 'active', trip_date_min: '2026-08-20', trip_date_max: '2026-08-31' })
    const hero = pickJourneyHero([newest, live], '', today)
    expect(hero?.id).toBe('live')
    expect(isLiveJourney(hero, today)).toBe(true)
  })

  it('falls back to the first list row as Latest Journey when none are live', () => {
    const newest = journey({ id: 'newest', title: 'Italy 2026', trip_date_min: '2026-07-01', trip_date_max: '2026-07-10' })
    const older = journey({ id: 'older', title: 'Older' })
    const hero = pickJourneyHero([newest, older], '', today)
    expect(hero?.id).toBe('newest')
    expect(isLiveJourney(hero, today)).toBe(false)
  })

  it('suppresses the hero while searching', () => {
    const newest = journey({ id: 'newest', title: 'Italy 2026' })
    expect(pickJourneyHero([newest], 'italy', today)).toBeNull()
  })

  it('returns null when the list is empty', () => {
    expect(pickJourneyHero([], '', today)).toBeNull()
  })
})

describe('pickFamilyEndedTripSuggestion', () => {
  const today = '2026-08-29'
  const ended = {
    id: 'trip-ended',
    title: 'Paris',
    start_date: '2026-08-01',
    end_date: '2026-08-20',
    place_count: 4,
  }

  it('picks a recently ended unlinked trip', () => {
    expect(pickFamilyEndedTripSuggestion([ended], [], today)?.id).toBe('trip-ended')
  })

  it('excludes trips already linked to any journey', () => {
    expect(pickFamilyEndedTripSuggestion([ended], ['trip-ended'], today)).toBeUndefined()
  })

  it('excludes trips flagged linked against the current journey', () => {
    expect(pickFamilyEndedTripSuggestion([{ ...ended, linked: true }], [], today)).toBeUndefined()
  })

  it('excludes trips outside the 30-day window and trips that have not ended', () => {
    const old = { ...ended, id: 'old', end_date: '2026-07-01' }
    const live = { ...ended, id: 'live', end_date: '2026-08-31' }
    expect(pickFamilyEndedTripSuggestion([old, live], [], today)).toBeUndefined()
  })

  it('prefers the most recently ended eligible trip', () => {
    const earlier = { ...ended, id: 'a', end_date: '2026-08-10' }
    const later = { ...ended, id: 'b', end_date: '2026-08-22' }
    expect(pickFamilyEndedTripSuggestion([earlier, later], [], today)?.id).toBe('b')
  })
})

describe('journey list helpers', () => {
  it('collects linked trip ids and renders zero stats as dashes', () => {
    expect([...linkedTripIdSet([
      journey({ linked_trip_ids: ['t-1'] }),
      journey({ id: 'j-2', linked_trip_ids: ['t-2', 't-1'] }),
    ])].sort()).toEqual(['t-1', 't-2'])
    expect(journeyStatDisplay(0)).toBe('--')
    expect(journeyStatDisplay(undefined)).toBe('--')
    expect(journeyStatDisplay(3)).toBe(3)
  })
})
