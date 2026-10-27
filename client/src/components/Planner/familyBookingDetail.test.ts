import { describe, expect, it } from 'vitest'
import type { FamilyTripExpense } from '../../data/supabase/tripExpenses'
import type { FamilyTripFile } from '../../data/supabase/tripFiles'
import type { FamilyTripReservation } from '../../data/supabase/tripReservations'
import { projectFamilyBookingDetail } from './familyBookingDetail'

const reservation: FamilyTripReservation = {
  id: '22222222-2222-4222-8222-222222222222',
  tripId: '11111111-1111-4111-8111-111111111111',
  type: 'restaurant',
  status: 'pending',
  title: 'Harbor lunch',
  startTripDayId: 'day-1',
  endTripDayId: 'day-2',
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
  createdAt: '2026-08-20T00:00:00.000Z',
}

function expense(id: string, reservationId: string, currencyCode: string | null): FamilyTripExpense {
  return {
    id,
    tripId: reservation.tripId,
    name: id,
    category: 'food',
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
    tripId: reservation.tripId,
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

describe('projectFamilyBookingDetail', () => {
  it('keeps the reservation id and resolves dates from day ids', () => {
    const detail = projectFamilyBookingDetail({
      reservation,
      days: [
        { id: 'day-1', tripId: reservation.tripId, civilDay: '2026-08-12', dayIndex: 0, title: 'Arrive' },
        { id: 'day-2', tripId: reservation.tripId, civilDay: '2026-08-13', dayIndex: 1, title: null },
      ],
      expenses: [],
      currencyCode: 'EUR',
    })
    expect(detail.id).toBe(reservation.id)
    expect(detail.startCivil).toBe('2026-08-12')
    expect(detail.endCivil).toBe('2026-08-13')
    expect(detail.confirmationCode).toBeNull()
  })

  it('prefers instants over day ids and leaves an unknown day empty', () => {
    const detail = projectFamilyBookingDetail({
      reservation: {
        ...reservation,
        startsAt: '2026-09-01T15:00:00.000Z',
        endsAt: null,
        endTripDayId: 'missing-day',
      },
      days: [{ id: 'day-1', tripId: reservation.tripId, civilDay: '2026-08-12', dayIndex: 0, title: null }],
      expenses: [],
      currencyCode: 'EUR',
    })
    expect(detail.startCivil).toBe('2026-09-01')
    expect(detail.endCivil).toBeNull()
  })

  it('keeps every linked expense currency and falls back to the trip currency', () => {
    const detail = projectFamilyBookingDetail({
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
    const detail = projectFamilyBookingDetail({
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
