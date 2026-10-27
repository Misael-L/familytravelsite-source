import { describe, expect, it } from 'vitest'
import type { FamilyScheduleItem } from '../../../data/supabase/scheduleItems'
import type { FamilyTripDay } from '../../../data/supabase/tripDays'
import type { FamilyTransportEndpoint, FamilyTransportReservation, FamilyTripReservation } from '../../../data/supabase/tripReservations'
import { projectFamilyDayTimeline, schedulePairMove, type FamilyDayTimelineDay } from './familyDayTimeline'

const tripId = '11111111-1111-4111-8111-111111111111'

function day(id: string, civilDay: string, dayIndex: number): FamilyTripDay {
  return { id, tripId, civilDay, dayIndex, title: null }
}

function schedule(partial: Partial<FamilyScheduleItem> & Pick<FamilyScheduleItem, 'id'>): FamilyScheduleItem {
  return {
    tripId,
    activity: partial.id,
    placeId: null,
    startsAt: '2026-08-12T00:00:00.000Z',
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

function booking(partial: Partial<FamilyTripReservation> & Pick<FamilyTripReservation, 'id' | 'type'>): FamilyTripReservation {
  return {
    tripId,
    status: 'pending',
    title: partial.id,
    startTripDayId: null,
    endTripDayId: null,
    startsAt: null,
    endsAt: null,
    confirmationCode: null,
    notes: null,
    url: null,
    placeId: null,
    hotelId: null,
    scheduleItemId: null,
    metadata: {},
    sortOrder: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...partial,
  }
}

function endpoint(partial: Partial<FamilyTransportEndpoint> & Pick<FamilyTransportEndpoint, 'id' | 'sequence' | 'role'>): FamilyTransportEndpoint {
  return {
    name: partial.id,
    code: null,
    airportId: null,
    placeId: null,
    latitude: null,
    longitude: null,
    timeZone: null,
    localDate: null,
    localTime: null,
    ...partial,
  }
}

function transport(partial: Partial<FamilyTransportReservation> & Pick<FamilyTransportReservation, 'id' | 'type'>): FamilyTransportReservation {
  return {
    tripId,
    status: 'pending',
    title: partial.id,
    startTripDayId: null,
    endTripDayId: null,
    startsAt: null,
    endsAt: null,
    confirmationCode: null,
    notes: null,
    url: null,
    metadata: {},
    sortOrder: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    endpoints: [],
    legs: [],
    ...partial,
  }
}

function project(input: Parameters<typeof projectFamilyDayTimeline>[0]): FamilyDayTimelineDay[] {
  return projectFamilyDayTimeline(input)
}

function phases(days: FamilyDayTimelineDay[], id: string) {
  return days.flatMap(day => [...day.rows, ...day.pills].filter(row => row.id === id).map(row => ({
    dayId: row.dayId,
    phase: row.phase,
    endpointId: row.endpointId,
    clockLabel: row.clockLabel,
  })))
}

describe('projectFamilyDayTimeline', () => {
  const august = [
    day('d12', '2026-08-12', 0),
    day('d13', '2026-08-13', 1),
    day('d14', '2026-08-14', 2),
  ]

  it('keeps an overnight arrival and a stop-only day on their stored roles', () => {
    const days = project({
      days: august,
      scheduleItems: [],
      notes: [],
      bookings: [],
      transports: [transport({
        id: 'flight-1',
        type: 'flight',
        title: 'Night flight',
        endpoints: [
          endpoint({ id: 'rome', sequence: 0, role: 'from', name: 'Rome', localDate: '2026-08-12', localTime: '22:00', timeZone: 'Europe/Rome' }),
          endpoint({ id: 'florence', sequence: 1, role: 'stop', name: 'Florence', localDate: '2026-08-13', localTime: '00:00', timeZone: 'Europe/Rome' }),
          endpoint({ id: 'zurich', sequence: 2, role: 'to', name: 'Zurich', localDate: '2026-08-14', localTime: '09:30', timeZone: 'Europe/Zurich' }),
        ],
      })],
    })
    expect(phases(days, 'flight-1')).toEqual([
      { dayId: 'd12', phase: 'depart', endpointId: 'rome', clockLabel: '22:00 · Europe/Rome' },
      { dayId: 'd13', phase: 'stop', endpointId: 'florence', clockLabel: '00:00 · Europe/Rome' },
      { dayId: 'd14', phase: 'arrive', endpointId: 'zurich', clockLabel: '09:30 · Europe/Zurich' },
    ])
  })

  it('labels a UTC schedule clock without treating the zone as local', () => {
    const days = project({
      days: [day('d13', '2026-08-13', 0)],
      scheduleItems: [schedule({
        id: 'walk',
        startsAt: '2026-08-13T02:00:00.000Z',
        timeZone: 'America/Mexico_City',
      })],
      notes: [],
      bookings: [],
      transports: [],
    })
    expect(days[0].rows[0]).toMatchObject({
      dayId: 'd13',
      clockLabel: '02:00 UTC · America/Mexico_City',
      minutes: 120,
    })
  })

  it('shows a booking civil clock and leaves the assignment anchor untimed', () => {
    const days = project({
      days: [day('d12', '2026-08-12', 0)],
      scheduleItems: [schedule({ id: 'anchor', startsAt: '2026-08-12T00:00:00.000Z' })],
      notes: [],
      bookings: [booking({ id: 'dinner', type: 'restaurant', title: 'Dinner', startsAt: '2026-08-12T15:00:00.000Z' })],
      transports: [],
    })
    expect(days[0].rows.find(row => row.id === 'dinner')?.clockLabel).toBe('15:00')
    expect(days[0].rows.find(row => row.id === 'anchor')?.clockLabel).toBeNull()
    expect(days[0].rows.map(row => row.id)).toEqual(['dinner', 'anchor'])
  })

  it('clips a hotel to interior pills and does not invent a missing checkout', () => {
    const longStay = booking({
      id: 'hotel',
      type: 'hotel',
      title: 'Villa',
      startsAt: '2026-08-10T15:00:00.000Z',
      endsAt: '2026-08-20T11:00:00.000Z',
    })
    const clipped = project({ days: august, scheduleItems: [], notes: [], bookings: [longStay], transports: [] })
    expect(phases(clipped, 'hotel')).toEqual([
      { dayId: 'd12', phase: 'pill', endpointId: null, clockLabel: null },
      { dayId: 'd13', phase: 'pill', endpointId: null, clockLabel: null },
      { dayId: 'd14', phase: 'pill', endpointId: null, clockLabel: null },
    ])
    const oneDay = project({
      days: [day('d13', '2026-08-13', 0)],
      scheduleItems: [],
      notes: [],
      bookings: [longStay],
      transports: [],
    })
    expect(phases(oneDay, 'hotel')).toEqual([
      { dayId: 'd13', phase: 'pill', endpointId: null, clockLabel: null },
    ])
    const noEnd = project({
      days: august,
      scheduleItems: [],
      notes: [],
      bookings: [booking({ id: 'open', type: 'hotel', title: 'Open', startsAt: '2026-08-12T15:00:00.000Z' })],
      transports: [],
    })
    expect(phases(noEnd, 'open').map(row => row.phase)).toEqual(['start'])
  })

  it('shows car pickup and return only on their recorded boundaries', () => {
    const days = project({
      days: august,
      scheduleItems: [],
      notes: [],
      bookings: [],
      transports: [transport({
        id: 'car',
        type: 'car',
        title: 'Hire car',
        startsAt: '2026-08-12T09:00:00.000Z',
        endsAt: '2026-08-14T18:00:00.000Z',
      })],
    })
    expect(phases(days, 'car').map(row => row.phase)).toEqual(['start', 'pill', 'end'])
  })

  it('does not treat a bicycle span as a rental', () => {
    const days = project({
      days: august,
      scheduleItems: [],
      notes: [],
      bookings: [],
      transports: [transport({
        id: 'bike',
        type: 'bicycle',
        title: 'Bike',
        startsAt: '2026-08-12T09:00:00.000Z',
        endsAt: '2026-08-14T18:00:00.000Z',
      })],
    })
    expect(phases(days, 'bike').map(row => `${row.dayId}:${row.phase}`)).toEqual(['d12:depart', 'd14:arrive'])
  })

  it('keeps a taxi on one day and a stored transit row without a pill', () => {
    const days = project({
      days: august,
      scheduleItems: [],
      notes: [],
      bookings: [],
      transports: [
        transport({ id: 'taxi', type: 'taxi', title: 'Taxi', startsAt: '2026-08-12T10:00:00.000Z' }),
        transport({ id: 'other', type: 'transport_other', title: 'Other', startsAt: '2026-08-13T10:00:00.000Z' }),
        transport({ id: 'tram', type: 'transit', title: 'Tram', startsAt: '2026-08-12T11:00:00.000Z', endsAt: '2026-08-14T12:00:00.000Z' }),
      ],
    })
    expect(phases(days, 'taxi')).toEqual([
      { dayId: 'd12', phase: 'single', endpointId: null, clockLabel: null },
    ])
    expect(phases(days, 'tram').every(row => row.phase !== 'pill')).toBe(true)
    expect(phases(days, 'other')).toHaveLength(1)
  })

  it('keeps an endpoint id when the local date is missing and uses null only for a header', () => {
    const dated = project({
      days: [day('d12', '2026-08-12', 0)],
      scheduleItems: [],
      notes: [],
      bookings: [],
      transports: [transport({
        id: 'train',
        type: 'train',
        title: 'Train',
        startsAt: '2026-08-12T08:00:00.000Z',
        endsAt: '2026-08-12T09:00:00.000Z',
        endpoints: [
          endpoint({ id: 'from', sequence: 0, role: 'from', localDate: null }),
          endpoint({ id: 'to', sequence: 1, role: 'to', localDate: '2026-08-12', localTime: '09:00' }),
        ],
      })],
    })
    expect(phases(dated, 'train')).toEqual([
      { dayId: 'd12', phase: 'depart', endpointId: 'from', clockLabel: null },
      { dayId: 'd12', phase: 'arrive', endpointId: 'to', clockLabel: '09:00' },
    ])
    const header = project({
      days: [day('d12', '2026-08-12', 0), day('d13', '2026-08-13', 1)],
      scheduleItems: [],
      notes: [],
      bookings: [],
      transports: [transport({
        id: 'bus',
        type: 'bus',
        title: 'Bus',
        startsAt: '2026-08-12T08:00:00.000Z',
        endsAt: '2026-08-13T09:00:00.000Z',
      })],
    })
    expect(phases(header, 'bus')).toEqual([
      { dayId: 'd12', phase: 'depart', endpointId: null, clockLabel: null },
      { dayId: 'd13', phase: 'arrive', endpointId: null, clockLabel: null },
    ])
    const absent = project({
      days: august,
      scheduleItems: [],
      notes: [],
      bookings: [],
      transports: [transport({ id: 'nowhere', type: 'flight', title: 'Nowhere' })],
    })
    expect(phases(absent, 'nowhere')).toEqual([])
  })

  it('keeps repeated place visits and opens a linked booking from the schedule row', () => {
    const days = project({
      days: [day('d12', '2026-08-12', 0)],
      scheduleItems: [
        schedule({ id: 'visit-a', placeId: 'museum', activity: 'First', sortOrder: 0 }),
        schedule({ id: 'visit-b', placeId: 'museum', activity: 'Second', sortOrder: 1 }),
      ],
      notes: [{ id: 'note-1', tripId, civilDay: '2026-08-12', body: 'Land', icon: null, sortOrder: 0 }],
      bookings: [booking({
        id: 'lunch',
        type: 'restaurant',
        title: 'Lunch',
        scheduleItemId: 'visit-a',
        startsAt: '2026-08-12T00:00:00.000Z',
        sortOrder: 4,
      })],
      transports: [],
      placesById: new Map([['museum', {
        id: 'museum', name: 'City museum', lat: null, lng: null, notes: null, timeZone: 'America/Mexico_City',
        countryId: null, placeTypeId: null, isPrimary: false, imageUrl: null,
        familyPlaceCategoryId: null, familyPlaceCategoryName: null, familyPlaceCategoryColor: null, familyPlaceCategoryIcon: null,
      }]]),
    })
    expect(days[0].noteId).toBe('note-1')
    expect(days[0].rows.map(row => row.id)).toEqual(['visit-a', 'visit-b'])
    expect(days[0].rows[0]).toMatchObject({ title: 'City museum', detailBookingId: 'lunch' })
    expect(days[0].rows[1].detailBookingId).toBeNull()
  })

  it('orders an untimed booking between untimed schedule rows and ties equal clocks by source then id', () => {
    const days = project({
      days: [day('d12', '2026-08-12', 0)],
      scheduleItems: [
        schedule({ id: 'a', sortOrder: 0 }),
        schedule({ id: 'c', sortOrder: 1 }),
        schedule({ id: 'early', startsAt: '2026-08-12T16:00:00.000Z', sortOrder: 9 }),
        schedule({ id: 'later', startsAt: '2026-08-12T16:00:00.000Z', sortOrder: 9 }),
      ],
      notes: [],
      bookings: [booking({ id: 'gap', type: 'event', title: 'Gap', sortOrder: 0, startsAt: '2026-08-12T00:00:00.000Z' })],
      transports: [],
    })
    expect(days[0].rows.map(row => row.id)).toEqual(['early', 'later', 'a', 'gap', 'c'])
  })

  it('swaps only the adjacent schedule pair and leaves the reservation between later rows', () => {
    const days = project({
      days: [day('d12', '2026-08-12', 0)],
      scheduleItems: [
        schedule({ id: 'A', sortOrder: 0 }),
        schedule({ id: 'B', sortOrder: 1 }),
        schedule({ id: 'C', sortOrder: 3 }),
        schedule({ id: 'D', sortOrder: 4 }),
      ],
      notes: [],
      bookings: [booking({ id: 'stay', type: 'event', title: 'Stay', sortOrder: 2, startsAt: '2026-08-12T00:00:00.000Z' })],
      transports: [],
    })
    const rows = days[0].rows
    expect(rows.map(row => row.id)).toEqual(['A', 'B', 'stay', 'C', 'D'])
    expect(rows.find(row => row.id === 'B')?.moveDown).toBe(false)
    expect(rows.find(row => row.id === 'C')?.moveUp).toBe(false)
    const updates = schedulePairMove(rows, 'A', 1)
    expect(updates).toEqual([
      { id: 'A', sortOrder: 1 },
      { id: 'B', sortOrder: 0 },
    ])
    const swapped = project({
      days: [day('d12', '2026-08-12', 0)],
      scheduleItems: [
        schedule({ id: 'A', sortOrder: 1 }),
        schedule({ id: 'B', sortOrder: 0 }),
        schedule({ id: 'C', sortOrder: 3 }),
        schedule({ id: 'D', sortOrder: 4 }),
      ],
      notes: [],
      bookings: [booking({ id: 'stay', type: 'event', title: 'Stay', sortOrder: 2, startsAt: '2026-08-12T00:00:00.000Z' })],
      transports: [],
    })
    expect(swapped[0].rows.map(row => row.id)).toEqual(['B', 'A', 'stay', 'C', 'D'])
    const moved = rows.map(row => row.key)
    const expected = moved.slice()
    ;[expected[0], expected[1]] = [expected[1], expected[0]]
    const replay = schedulePairMove(rows, 'A', 1)
    expect(replay).toEqual(updates)
    const reordered = [...rows]
    if (replay) {
      reordered[0] = { ...rows[1], sortOrder: replay[1].sortOrder }
      reordered[1] = { ...rows[0], sortOrder: replay[0].sortOrder }
    }
    expect(reordered.map(row => row.key)).toEqual(expected)
    expect(reordered.slice(2).map(row => row.key)).toEqual(rows.slice(2).map(row => row.key))
  })

  it('uses a stored endpoint clock for a same-day car or taxi and leaves a header-only flight untimed', () => {
    const car = project({
      days: [day('d12', '2026-08-12', 0)],
      scheduleItems: [],
      notes: [],
      bookings: [],
      transports: [transport({
        id: 'car-1',
        type: 'car',
        startsAt: '2026-08-12T00:00:00.000Z',
        endsAt: '2026-08-12T00:00:00.000Z',
        endpoints: [
          endpoint({ id: 'pickup', sequence: 0, role: 'from', localDate: '2026-08-12', localTime: '09:15', timeZone: 'Europe/Rome' }),
          endpoint({ id: 'return', sequence: 1, role: 'to', localDate: '2026-08-12', localTime: '18:00', timeZone: 'Europe/Rome' }),
        ],
      })],
    })
    expect(car[0].rows[0]).toMatchObject({ endpointId: 'pickup', clockLabel: '09:15 · Europe/Rome' })
    const taxi = project({
      days: [day('d12', '2026-08-12', 0)],
      scheduleItems: [],
      notes: [],
      bookings: [],
      transports: [transport({
        id: 'taxi-1',
        type: 'taxi',
        startsAt: '2026-08-12T00:00:00.000Z',
        endsAt: '2026-08-12T00:00:00.000Z',
        endpoints: [
          endpoint({ id: 'from', sequence: 0, role: 'from', localDate: '2026-08-12', localTime: '00:00', timeZone: 'Europe/Rome' }),
          endpoint({ id: 'to', sequence: 1, role: 'to', localDate: '2026-08-12', localTime: '18:00', timeZone: 'Europe/Rome' }),
        ],
      })],
    })
    expect(taxi[0].rows[0]).toMatchObject({ endpointId: 'from', clockLabel: '00:00 · Europe/Rome' })
    const header = project({
      days: [day('d12', '2026-08-12', 0)],
      scheduleItems: [],
      notes: [],
      bookings: [],
      transports: [transport({ id: 'flight-1', type: 'flight', startsAt: '2026-08-12T08:00:00.000Z', endpoints: [] })],
    })
    expect(header[0].rows[0].clockLabel).toBeNull()
    expect(header[0].rows[0].endpointId).toBeNull()
  })

  it('places each transport once for every input order, including mixed and zoned clocks', () => {
    const flight = transport({
      id: 'transport-1',
      type: 'flight',
      startsAt: '2026-08-12T00:00:00.000Z',
      endsAt: '2026-08-12T00:00:00.000Z',
      endpoints: [
        endpoint({ id: 'from', sequence: 0, role: 'from', localDate: '2026-08-12', localTime: '20:00', timeZone: 'America/New_York' }),
        endpoint({ id: 'to', sequence: 1, role: 'to', localDate: '2026-08-12', localTime: '15:00', timeZone: 'America/New_York' }),
      ],
    })
    const bus = transport({
      id: 'transport-2',
      type: 'bus',
      sortOrder: 4,
      startsAt: '2026-08-12T00:00:00.000Z',
      endpoints: [endpoint({ id: 'bus-from', sequence: 0, role: 'from', localDate: '2026-08-12', localTime: '17:00', timeZone: 'Europe/Rome' })],
    })
    const input = { days: [day('d12', '2026-08-12', 0)], scheduleItems: [], notes: [], bookings: [] }
    const forward = project({ ...input, transports: [flight, bus] })[0].rows.map(row => row.key)
    const reverse = project({ ...input, transports: [bus, flight] })[0].rows.map(row => row.key)
    expect(forward).toEqual(reverse)
    expect(project({ ...input, transports: [flight, bus] })[0].rows.map(row => row.clockLabel)).toEqual([
      '17:00 · Europe/Rome',
      '20:00 · America/New_York',
      '15:00 · America/New_York',
    ])
    const mixed = transport({
      id: 'transport-1',
      type: 'flight',
      endpoints: [
        endpoint({ id: 'from', sequence: 0, role: 'from', localDate: '2026-08-12', localTime: '20:00', timeZone: 'America/New_York' }),
        endpoint({ id: 'stop', sequence: 1, role: 'stop', localDate: '2026-08-12', localTime: null }),
      ],
    })
    const taxi = transport({
      id: 'taxi-1',
      type: 'taxi',
      sortOrder: 3,
      endpoints: [endpoint({ id: 'taxi-from', sequence: 0, role: 'from', localDate: '2026-08-12', localTime: '09:15', timeZone: 'Europe/Rome' })],
    })
    const mixedRows = project({ ...input, transports: [mixed, taxi] })[0].rows
    const mixedReverse = project({ ...input, transports: [taxi, mixed] })[0].rows
    expect(mixedRows.map(row => row.key)).toEqual(mixedReverse.map(row => row.key))
    expect(mixedRows.map(row => row.key)).toEqual([
      'transport:taxi-1:single:taxi-from:d12',
      'transport:transport-1:depart:from:d12',
      'transport:transport-1:stop:stop:d12',
    ])
    expect(mixedRows[2].clockLabel).toBeNull()
  })
})
