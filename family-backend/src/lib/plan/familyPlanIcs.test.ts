import { describe, expect, it } from 'vitest'
import {
  buildFamilyPlanIcs,
  escapeIcsText,
  familyPlanIcsFilename,
  formatIcsUtc,
  sanitizePlanFilename,
} from './familyPlanIcs'
import type { FamilyScheduleItem } from '../../data/supabase/scheduleItems'
import type { FamilyTripDay } from '../../data/supabase/tripDays'
import type { FamilyTripPlace } from '../../data/supabase/tripPlaces'

function day(partial: Partial<FamilyTripDay> & Pick<FamilyTripDay, 'id' | 'civilDay' | 'dayIndex'>): FamilyTripDay {
  return { tripId: 'trip-1', title: null, ...partial }
}

function item(partial: Partial<FamilyScheduleItem> & Pick<FamilyScheduleItem, 'id'>): FamilyScheduleItem {
  return {
    tripId: 'trip-1',
    activity: 'Untitled',
    placeId: null,
    startsAt: null,
    endsAt: null,
    address: null,
    timeZone: null,
    sortOrder: 0,
    experienceId: null,
    foodId: null,
    linkUrl: null,
    ...partial,
  }
}

describe('escapeIcsText', () => {
  it('escapes backslash, semicolon, comma, and newlines', () => {
    expect(escapeIcsText('A;B,C\\D\nE')).toBe('A\\;B\\,C\\\\D\\nE')
  })
})

describe('sanitizePlanFilename / familyPlanIcsFilename', () => {
  it('strips punctuation and appends -plan.ics', () => {
    expect(sanitizePlanFilename('Mexico / CDMX!')).toBe('Mexico-CDMX')
    expect(familyPlanIcsFilename('España')).toBe('Espa-a-plan.ics')
  })
})

describe('formatIcsUtc', () => {
  it('formats UTC as yyyyMMddTHHmmssZ', () => {
    expect(formatIcsUtc(new Date('2026-08-14T18:30:05.000Z'))).toBe('20260814T183005Z')
  })
})

describe('buildFamilyPlanIcs', () => {
  it('emits a valid empty calendar when there are no items', () => {
    const ics = buildFamilyPlanIcs({
      tripTitle: 'Mexico',
      days: [day({ id: 'd1', civilDay: '2026-12-01', dayIndex: 0 })],
      itemsByDayId: new Map(),
      placesById: new Map(),
    })
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics).toContain('PRODID:-//FamilyTravelApp//Plan//EN')
    expect(ics).not.toContain('BEGIN:VEVENT')
    expect(ics.endsWith('END:VCALENDAR')).toBe(true)
  })

  it('writes one VEVENT per schedule row with UID and escaped SUMMARY', () => {
    const ics = buildFamilyPlanIcs({
      tripTitle: 'Mexico',
      days: [day({ id: 'd1', civilDay: '2026-12-01', dayIndex: 0 })],
      itemsByDayId: new Map([
        ['d1', [
          item({
            id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            activity: 'Lunch; tacos, salsa',
            startsAt: '2026-12-01T16:00:00.000Z',
            endsAt: '2026-12-01T17:30:00.000Z',
            address: 'Roma Norte, CDMX',
          }),
        ]],
      ]),
      placesById: new Map<string, FamilyTripPlace>(),
    })
    expect(ics).toContain('UID:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee@familytravel')
    expect(ics).toContain('SUMMARY:Lunch\\; tacos\\, salsa')
    expect(ics).toContain('DTSTART:20261201T160000Z')
    expect(ics).toContain('DTEND:20261201T173000Z')
    expect(ics).toContain('LOCATION:Roma Norte\\, CDMX')
  })

  it('falls back to civil-day midnight and +1h when times are missing', () => {
    const ics = buildFamilyPlanIcs({
      tripTitle: 'Mexico',
      days: [day({ id: 'd1', civilDay: '2026-12-01', dayIndex: 0 })],
      itemsByDayId: new Map([['d1', [item({ id: 'item-1', activity: 'Walk' })]]]),
      placesById: new Map(),
    })
    expect(ics).toContain('DTSTART:20261201T000000Z')
    expect(ics).toContain('DTEND:20261201T010000Z')
  })
})
