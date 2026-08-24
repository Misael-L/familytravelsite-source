import { describe, expect, it } from 'vitest'
import {
  applyHubEnrichment,
  familyTripRowToDashboardTrip,
  hubDayCount,
  keepHubEnrichment,
  type FamilyDashboardTrip,
} from './familyDashboardModel'
import { familyTripToHeroBundle } from './dashboardModel'

function trip(partial: Partial<FamilyDashboardTrip> & Pick<FamilyDashboardTrip, 'id'>): FamilyDashboardTrip {
  return {
    family_id: 'fam-1',
    title: 'Trip',
    description: null,
    start_date: '2026-08-10',
    end_date: '2026-08-17',
    cover_image: null,
    is_archived: 0,
    currency: 'USD',
    reminder_days: 0,
    status: 'published',
    day_count: 8,
    place_count: 0,
    traveler_count: 0,
    is_owner: 1,
    ...partial,
  }
}

describe('hubDayCount', () => {
  it('counts inclusive civil days', () => {
    expect(hubDayCount('2026-08-20', '2026-08-27')).toBe(8)
    expect(hubDayCount('2026-08-10', '2026-08-10')).toBe(1)
  })

  it('returns 0 when dates are missing or inverted', () => {
    expect(hubDayCount(null, '2026-08-27')).toBe(0)
    expect(hubDayCount('2026-08-20', null)).toBe(0)
    expect(hubDayCount(undefined, undefined)).toBe(0)
    expect(hubDayCount('2026-08-27', '2026-08-20')).toBe(0)
  })
})

describe('familyTripRowToDashboardTrip', () => {
  it('sets day_count from dates and does not set shared_count', () => {
    const mapped = familyTripRowToDashboardTrip({
      id: 't1',
      family_id: 'fam-1',
      name: 'Como',
      start_at: '2026-08-10T00:00:00Z',
      end_at: '2026-08-17T00:00:00Z',
      status: 'published',
      cover_url: 'https://cover',
      notes: null,
      reminder_days: 3,
      archived_at: null,
      currency_code: 'eur',
    })
    expect(mapped.day_count).toBe(8)
    expect(mapped.place_count).toBe(0)
    expect(mapped.traveler_count).toBe(0)
    expect(mapped.shared_count).toBeUndefined()
    expect(mapped.cover_image).toBe('https://cover')
  })

  it('uses day_count 0 without dates', () => {
    const mapped = familyTripRowToDashboardTrip({
      id: 't1',
      family_id: 'fam-1',
      name: 'Idea',
      start_at: null,
      end_at: null,
      status: 'idea',
      cover_url: null,
      notes: null,
      reminder_days: null,
      archived_at: null,
    })
    expect(mapped.day_count).toBe(0)
  })
})

describe('applyHubEnrichment', () => {
  it('groups travelers and places by trip_id', () => {
    const [a, b] = applyHubEnrichment(
      [trip({ id: 't1' }), trip({ id: 't2' })],
      [
        { tripId: 't1', personId: 'p1', displayName: 'Ada', color: '#111', avatarUrl: null },
        { tripId: 't1', personId: 'p2', displayName: 'Bob', color: null, avatarUrl: '/a.png' },
        { tripId: 't2', personId: 'p3', displayName: 'Cam', color: null, avatarUrl: null },
      ],
      [
        { tripId: 't1', placeId: 'pl1', name: 'Paris', lat: 1, lng: 2 },
        { tripId: 't1', placeId: 'pl2', name: 'Lyon', lat: 3, lng: 4 },
        { tripId: 't2', placeId: 'pl3', name: 'Nice', lat: null, lng: null },
      ],
    )
    expect(a.traveler_count).toBe(2)
    expect(a.place_count).toBe(2)
    expect(a.hub_members?.map(m => m.displayName)).toEqual(['Ada', 'Bob'])
    expect(b.traveler_count).toBe(1)
    expect(b.place_count).toBe(1)
  })

  it('counts unnamed travelers but skips them on avatars', () => {
    const [row] = applyHubEnrichment(
      [trip({ id: 't1' })],
      [
        { tripId: 't1', personId: 'p1', displayName: 'Ada', color: '#abc', avatarUrl: null },
        { tripId: 't1', personId: 'p2', displayName: null, color: null, avatarUrl: null },
        { tripId: 't1', personId: 'p3', displayName: '   ', color: null, avatarUrl: null },
      ],
      [],
    )
    expect(row.traveler_count).toBe(3)
    expect(row.hub_members).toEqual([
      { personId: 'p1', displayName: 'Ada', color: '#abc', avatarUrl: null },
    ])
  })

  it('falls back untitled place names and counts every place_id', () => {
    const [row] = applyHubEnrichment(
      [trip({ id: 't1' })],
      [],
      [{ tripId: 't1', placeId: 'pl1', name: null, lat: null, lng: null }],
    )
    expect(row.place_count).toBe(1)
    expect(row.hub_places?.[0]?.name).toBe('Untitled place')
    expect(row.hub_places?.[0]?.imageUrl).toBeNull()
  })
})

describe('keepHubEnrichment', () => {
  it('copies hub fields from the in-memory trip', () => {
    const prev = trip({
      id: 't1',
      place_count: 4,
      traveler_count: 3,
      hub_members: [{ personId: 'p1', displayName: 'Ada', color: '#111', avatarUrl: null }],
      hub_places: [{ id: 'pl1', name: 'Paris', lat: 1, lng: 2, imageUrl: null }],
    })
    const next = trip({ id: 't1', is_archived: 1, place_count: 0, traveler_count: 0, day_count: 8 })
    const kept = keepHubEnrichment(next, prev)
    expect(kept.is_archived).toBe(1)
    expect(kept.day_count).toBe(8)
    expect(kept.place_count).toBe(4)
    expect(kept.traveler_count).toBe(3)
    expect(kept.hub_members).toEqual(prev.hub_members)
    expect(kept.hub_places).toEqual(prev.hub_places)
  })

  it('returns next when there is no previous trip', () => {
    const next = trip({ id: 't1' })
    expect(keepHubEnrichment(next, undefined)).toBe(next)
  })
})

describe('familyTripToHeroBundle', () => {
  it('maps named members and place chips without photos', () => {
    const bundle = familyTripToHeroBundle(trip({
      id: 't1',
      hub_members: [{ personId: 'p1', displayName: 'Ada', color: '#6366f1', avatarUrl: null }],
      hub_places: [{ id: 'pl1', name: 'Paris', lat: 48.8, lng: 2.3, imageUrl: null }],
    }))
    expect(bundle.members).toEqual([
      { id: 'p1', username: 'Ada', avatar_url: null, color: '#6366f1' },
    ])
    expect(bundle.places).toEqual([
      {
        id: 'pl1',
        name: 'Paris',
        image_url: null,
        lat: 48.8,
        lng: 2.3,
        google_place_id: null,
        osm_id: null,
      },
    ])
  })

  it('rewrites catalog cover URLs to thumb transforms on chips', () => {
    const bundle = familyTripToHeroBundle(trip({
      id: 't1',
      hub_places: [{
        id: 'pl1',
        name: 'Gubbio',
        lat: 43.35,
        lng: 12.57,
        imageUrl: 'https://example.supabase.co/storage/v1/object/public/catalog/places/gubbio.jpg',
      }],
    }))
    expect(bundle.places[0]?.image_url).toBe(
      'https://example.supabase.co/storage/v1/render/image/public/catalog/places/gubbio.jpg?width=96&resize=contain&quality=75',
    )
  })
})
