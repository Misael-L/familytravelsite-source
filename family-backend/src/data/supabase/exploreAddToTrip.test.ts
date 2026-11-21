import { describe, expect, it, vi } from 'vitest'
import {
  addCatalogHotelStayToTrip,
  addCatalogPlaceToTrip,
  addCatalogPlanItemToTrip,
  hotelStayDayIds,
  isUniqueViolation,
  isValidHotelStayRange,
  nextSortOrderForCivilDay,
} from './exploreAddToTrip'
import * as tripPlaces from './tripPlaces'
import * as scheduleItems from './scheduleItems'
import * as tripReservations from './tripReservations'
import type { FamilyScheduleItem } from './scheduleItems'
import type { FamilyTripDay } from './tripDays'

function item(partial: Partial<FamilyScheduleItem> & { startsAt: string; sortOrder: number }): FamilyScheduleItem {
  return {
    id: partial.id ?? 'i',
    tripId: 't',
    activity: 'x',
    placeId: null,
    endsAt: null,
    address: null,
    timeZone: null,
    experienceId: null,
    foodId: null,
    linkUrl: null,
    ...partial,
  }
}

const days: FamilyTripDay[] = [
  { id: 'd1', tripId: 't', civilDay: '2026-08-12', dayIndex: 0, title: 'Arrive' },
  { id: 'd2', tripId: 't', civilDay: '2026-08-14', dayIndex: 2, title: null },
]

describe('nextSortOrderForCivilDay', () => {
  it('starts at 0 when the day is empty', () => {
    expect(nextSortOrderForCivilDay([], '2026-08-12')).toBe(0)
  })

  it('is one past the max sort on that civil day', () => {
    const items = [
      item({ id: 'a', startsAt: '2026-08-12T00:00:00.000Z', sortOrder: 2 }),
      item({ id: 'b', startsAt: '2026-08-12T00:00:00.000Z', sortOrder: 0 }),
      item({ id: 'c', startsAt: '2026-08-13T00:00:00.000Z', sortOrder: 9 }),
    ]
    expect(nextSortOrderForCivilDay(items, '2026-08-12')).toBe(3)
  })
})

describe('hotelStayDayIds', () => {
  it('maps matching civil dates onto trip_days and leaves others null', () => {
    expect(hotelStayDayIds('2026-08-12', '2026-08-14', days)).toEqual({
      startTripDayId: 'd1',
      endTripDayId: 'd2',
    })
    expect(hotelStayDayIds('2026-08-12', '2026-08-20', days)).toEqual({
      startTripDayId: 'd1',
      endTripDayId: null,
    })
  })
})

describe('isValidHotelStayRange', () => {
  it('requires civil dates with check-out after check-in', () => {
    expect(isValidHotelStayRange('2026-08-12', '2026-08-13')).toBe(true)
    expect(isValidHotelStayRange('2026-08-12', '2026-08-12')).toBe(false)
    expect(isValidHotelStayRange('', '2026-08-13')).toBe(false)
    expect(isValidHotelStayRange('12/08/2026', '13/08/2026')).toBe(false)
  })
})

describe('isUniqueViolation', () => {
  it('detects Postgres 23505', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
    expect(isUniqueViolation({ code: '42501' })).toBe(false)
    expect(isUniqueViolation(new Error('dup'))).toBe(false)
  })
})

describe('draft staging', () => {
  it('nudges published non-HOF instead of writing', async () => {
    const upsert = vi.spyOn(tripPlaces, 'upsertTripPlace')
    const result = await addCatalogPlaceToTrip({
      tripId: 'trip-1',
      placeId: 'pl-new',
      tripPlaceIds: new Set(),
      canMutate: false,
      confirmedOutOfPurview: true,
      writeMode: 'nudge',
    })
    expect(result).toEqual({ ok: false, reason: 'switchToDraft' })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('stages trip_place before plan_item when expanding purview', async () => {
    vi.spyOn(scheduleItems, 'tripContainsCatalogPlanItem').mockResolvedValue(false)
    const insert = vi.spyOn(scheduleItems, 'insertScheduleItem')
    const upsert = vi.spyOn(tripPlaces, 'upsertTripPlace')
    const staged: Array<{ module: string; sortOrder?: number }> = []
    const result = await addCatalogPlanItemToTrip({
      tripId: 'trip-1',
      kind: 'experience',
      entityId: 'ex-1',
      name: 'Duomo',
      placeId: 'pl-new',
      address: null,
      linkUrl: null,
      day: days[0],
      scheduleItems: [],
      tripPlaceIds: new Set(),
      canMutate: false,
      confirmedOutOfPurview: true,
      writeMode: 'draft',
      nextSortOrder: 3,
      stageOp: async input => {
        staged.push({ module: input.module, sortOrder: input.sortOrder })
        return true
      },
    })
    expect(result).toEqual({ ok: true, outcome: 'drafted' })
    expect(staged.map(s => s.module)).toEqual(['trip_place', 'plan_item'])
    expect(staged[0]?.sortOrder).toBe(3)
    expect(staged[1]?.sortOrder).toBe(4)
    expect(insert).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('keeps HOF published hotel stays on the reservation adapter', async () => {
    const insert = vi.spyOn(tripReservations, 'insertHotelStay').mockResolvedValue('r1')
    const result = await addCatalogHotelStayToTrip({
      tripId: 'trip-1',
      hotelId: 'h1',
      name: 'Villa Erba',
      placeId: 'pl-1',
      linkUrl: null,
      checkIn: '2026-08-12',
      checkOut: '2026-08-14',
      days,
      tripPlaceIds: new Set(['pl-1']),
      canMutate: true,
      confirmedOutOfPurview: true,
      writeMode: 'direct',
    })
    expect(result).toEqual({ ok: true, outcome: 'added' })
    expect(insert).toHaveBeenCalled()
  })
})
