import { describe, expect, it } from 'vitest'
import type { FamilyTripExpense } from '../../data/supabase/tripExpenses'
import type { FamilyTripFile } from '../../data/supabase/tripFiles'
import type { FamilyTransportEndpoint, FamilyTransportLeg, FamilyTransportReservation } from '../../data/supabase/tripReservations'
import { projectFamilyTransportDetail } from './familyTransportDetail'

const tripId = '11111111-1111-4111-8111-111111111111'

function endpoint(partial: Partial<FamilyTransportEndpoint> & Pick<FamilyTransportEndpoint, 'id' | 'sequence'>): FamilyTransportEndpoint {
  return {
    role: 'stop',
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

function leg(partial: Partial<FamilyTransportLeg> & Pick<FamilyTransportLeg, 'id' | 'sequence'>): FamilyTransportLeg {
  return {
    fromEndpointId: null,
    toEndpointId: null,
    carrierName: null,
    serviceNumber: null,
    platform: null,
    seat: null,
    ...partial,
  }
}

const reservation: FamilyTransportReservation = {
  id: '22222222-2222-4222-8222-222222222222',
  tripId,
  type: 'bus',
  status: 'pending',
  title: 'Night bus',
  startTripDayId: 'day-1',
  endTripDayId: 'day-2',
  startsAt: null,
  endsAt: null,
  confirmationCode: 'AB12',
  notes: null,
  url: null,
  metadata: {},
  sortOrder: 0,
  createdAt: '2026-08-20T00:00:00.000Z',
  endpoints: [],
  legs: [],
}

function expense(id: string, reservationId: string, currencyCode: string | null): FamilyTripExpense {
  return {
    id,
    tripId,
    name: id,
    category: 'transport',
    totalAmount: 10,
    currencyCode,
    exchangeRate: 1,
    expenseDate: null,
    note: null,
    ticketLines: null,
    reservationId,
    sortOrder: 0,
    createdAt: '2026-08-20T00:00:00.000Z',
    shares: [],
    payers: [],
  }
}

function file(id: string, reservationIds: string[]): FamilyTripFile {
  return {
    id,
    tripId,
    storagePath: `${id}.pdf`,
    originalName: `${id}.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 10,
    uploadedBy: null,
    starred: false,
    description: null,
    deletedAt: null,
    createdAt: '2026-08-20T00:00:00.000Z',
    links: reservationIds.map((reservationId, index) => ({
      id: `${id}-link-${index}`,
      fileId: id,
      placeId: null,
      reservationId,
      tripDayId: null,
    })),
  }
}

describe('projectFamilyTransportDetail', () => {
  it('orders endpoints and legs by sequence and keeps each leg on its endpoints', () => {
    const detail = projectFamilyTransportDetail({
      reservation: {
        ...reservation,
        endpoints: [
          endpoint({ id: 'zurich', sequence: 2, role: 'to', name: 'Zurich', localDate: '2026-08-13', localTime: '09:30', timeZone: 'Europe/Zurich' }),
          endpoint({ id: 'rome', sequence: 0, role: 'from', name: 'Rome', code: 'ROM', localDate: '2026-08-12', localTime: '22:00', timeZone: 'Europe/Rome' }),
          endpoint({ id: 'florence', sequence: 1, role: 'stop', name: 'Florence', localDate: '2026-08-13', localTime: '01:00', timeZone: 'Europe/Rome' }),
        ],
        legs: [
          leg({ id: 'second', sequence: 1, fromEndpointId: 'florence', toEndpointId: 'zurich', carrierName: 'SBB', serviceNumber: 'EC 18' }),
          leg({ id: 'first', sequence: 0, fromEndpointId: 'rome', toEndpointId: 'florence', carrierName: 'Trenitalia', serviceNumber: 'FR 9401' }),
        ],
      },
      days: [],
      expenses: [],
      currencyCode: 'EUR',
    })
    expect(detail.endpoints.map(item => item.id)).toEqual(['rome', 'florence', 'zurich'])
    expect(detail.legs).toEqual([
      expect.objectContaining({ id: 'first', fromEndpointId: 'rome', toEndpointId: 'florence' }),
      expect.objectContaining({ id: 'second', fromEndpointId: 'florence', toEndpointId: 'zurich' }),
    ])
    expect(detail.endpoints.map(item => [item.localDate, item.localTime, item.timeZone])).toEqual([
      ['2026-08-12', '22:00', 'Europe/Rome'],
      ['2026-08-13', '01:00', 'Europe/Rome'],
      ['2026-08-13', '09:30', 'Europe/Zurich'],
    ])
    expect(detail.startCivil).toBe('2026-08-12')
    expect(detail.endCivil).toBe('2026-08-13')
  })

  it('keeps a tie in the original array order', () => {
    const detail = projectFamilyTransportDetail({
      reservation: {
        ...reservation,
        endpoints: [
          endpoint({ id: 'a', sequence: 1, name: 'A' }),
          endpoint({ id: 'b', sequence: 1, name: 'B' }),
        ],
        legs: [],
      },
      days: [],
      expenses: [],
      currencyCode: 'EUR',
    })
    expect(detail.endpoints.map(item => item.id)).toEqual(['a', 'b'])
  })

  it('omits a missing code, time, and time zone and does not invent a clock from startsAt', () => {
    const detail = projectFamilyTransportDetail({
      reservation: {
        ...reservation,
        startsAt: '2026-09-01T22:15:00.000Z',
        endsAt: null,
        endTripDayId: 'missing-day',
        endpoints: [
          endpoint({ id: 'rome', sequence: 0, role: 'from', name: 'Rome', code: '  ', localDate: '2026-08-12', localTime: '', timeZone: ' ' }),
        ],
      },
      days: [{ id: 'day-1', tripId, civilDay: '2026-08-01', dayIndex: 0, title: null }],
      expenses: [],
      currencyCode: 'EUR',
    })
    expect(detail.startCivil).toBe('2026-09-01')
    expect(detail.endCivil).toBe('2026-08-12')
    expect(detail.endpoints[0]).toMatchObject({
      name: 'Rome',
      code: null,
      localDate: '2026-08-12',
      localTime: null,
      timeZone: null,
    })
    expect(detail).not.toHaveProperty('startTime')
  })

  it('uses the trip day when no instant or endpoint date is recorded', () => {
    const detail = projectFamilyTransportDetail({
      reservation,
      days: [
        { id: 'day-1', tripId, civilDay: '2026-08-12', dayIndex: 0, title: 'Leave' },
        { id: 'day-2', tripId, civilDay: '2026-08-13', dayIndex: 1, title: null },
      ],
      expenses: [],
      currencyCode: 'EUR',
    })
    expect(detail.id).toBe(reservation.id)
    expect(detail.startCivil).toBe('2026-08-12')
    expect(detail.endCivil).toBe('2026-08-13')
    const unknownEnd = projectFamilyTransportDetail({
      reservation: { ...reservation, endTripDayId: 'missing-day' },
      days: [{ id: 'day-1', tripId, civilDay: '2026-08-12', dayIndex: 0, title: 'Leave' }],
      expenses: [],
      currencyCode: 'EUR',
    })
    expect(unknownEnd.endCivil).toBeNull()
  })

  it('keeps every linked expense currency and falls back to the trip currency', () => {
    const detail = projectFamilyTransportDetail({
      reservation,
      days: [],
      currencyCode: 'EUR',
      expenses: [
        expense('usd', reservation.id, 'USD'),
        expense('blank', reservation.id, null),
        expense('other', 'another-booking', 'GBP'),
      ],
    })
    expect(detail.expenses).toEqual([
      { id: 'usd', name: 'usd', amount: 10, currencyCode: 'USD' },
      { id: 'blank', name: 'blank', amount: 10, currencyCode: 'EUR' },
    ])
  })

  it('dedupes files linked to the reservation and drops other bookings', () => {
    const shared = file('boarding', [reservation.id, reservation.id])
    const detail = projectFamilyTransportDetail({
      reservation,
      days: [],
      expenses: [],
      currencyCode: 'EUR',
      files: [shared, file('other', ['another-booking']), { ...file('gone', [reservation.id]), deletedAt: '2026-08-21T00:00:00.000Z' }],
    })
    expect(detail.files).toEqual([{ id: 'boarding', originalName: 'boarding.pdf', storagePath: 'boarding.pdf' }])
    expect(detail.files[0]).not.toHaveProperty('signedUrl')
  })
})
