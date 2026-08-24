import { describe, expect, it } from 'vitest'
import { buildFamilyPlanPdfHtml, escHtml } from './familyPlanPdf'
import type { FamilyScheduleItem } from '../../data/supabase/scheduleItems'
import type { FamilyTripDay } from '../../data/supabase/tripDays'
import type { FamilyTripPlace } from '../../data/supabase/tripPlaces'

const copy = {
  travelPlan: 'Travel Plan',
  saveAsPdf: 'Save as PDF',
  emptyDay: 'No places planned for this day',
  dayN: (n: number) => `Day ${n}`,
}

describe('escHtml', () => {
  it('escapes tags and quotes', () => {
    expect(escHtml('<script>x</script>')).toBe('&lt;script&gt;x&lt;/script&gt;')
    expect(escHtml('"hi"')).toBe('&quot;hi&quot;')
  })
})

describe('buildFamilyPlanPdfHtml', () => {
  it('includes trip title, day heading, place name, address, and note', () => {
    const html = buildFamilyPlanPdfHtml({
      tripTitle: 'Mexico',
      days: [{ id: 'd1', tripId: 't1', civilDay: '2026-12-01', dayIndex: 0, title: 'Arrival' }],
      itemsByDayId: new Map([['d1', [{
        id: 'i1',
        tripId: 't1',
        activity: 'Should not win',
        placeId: 'p1',
        startsAt: null,
        endsAt: null,
        address: 'Zócalo',
        timeZone: null,
        sortOrder: 0,
        experienceId: null,
        foodId: null,
        linkUrl: null,
      } satisfies FamilyScheduleItem]]]),
      placesById: new Map([['p1', {
        id: 'p1',
        name: 'Ciudad De Mexico',
        lat: 19.43,
        lng: -99.13,
        notes: null,
        timeZone: null,
        countryId: null,
        placeTypeId: null,
        isPrimary: true,
        imageUrl: null,
        familyPlaceCategoryId: null,
        familyPlaceCategoryName: null,
        familyPlaceCategoryColor: null,
        familyPlaceCategoryIcon: null,
      } satisfies FamilyTripPlace]]),
      notesByCivilDay: new Map([['2026-12-01', {
        id: 'n1', tripId: 't1', civilDay: '2026-12-01', body: 'Pack layers', icon: null, sortOrder: 0,
      }]]),
    }, copy, 'en')
    expect(html).toContain('Mexico')
    expect(html).toContain('Arrival')
    expect(html).toContain('Ciudad De Mexico')
    expect(html).toContain('Zócalo')
    expect(html).toContain('Pack layers')
    expect(html).not.toContain('Should not win')
  })

  it('escapes HTML in the trip title and lists empty days', () => {
    const html = buildFamilyPlanPdfHtml({
      tripTitle: '<b>Hack</b>',
      days: [{ id: 'd1', tripId: 't1', civilDay: '2026-12-01', dayIndex: 0, title: null } satisfies FamilyTripDay],
      itemsByDayId: new Map(),
      placesById: new Map(),
    }, copy, 'en')
    expect(html).toContain('&lt;b&gt;Hack&lt;/b&gt;')
    expect(html).not.toContain('<b>Hack</b>')
    expect(html).toContain('Day 1')
    expect(html).toContain('No places planned for this day')
  })
})
