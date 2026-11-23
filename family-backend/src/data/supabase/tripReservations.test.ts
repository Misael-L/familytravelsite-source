import { describe, expect, it } from 'vitest'
import {
  BOOKING_TYPES,
  TRANSPORT_MANUAL_TYPES,
  TRANSPORT_TYPES,
  costCategoryForBookingType,
  costCategoryForTransportType,
  isBookingType,
  isTransportType,
  normalizeBookingDraft,
  normalizeTransportDraft,
  type FamilyBookingDraft,
  type FamilyTransportDraft,
} from './tripReservations'

function draft(partial: Partial<FamilyBookingDraft> & Pick<FamilyBookingDraft, 'type' | 'title'>): FamilyBookingDraft {
  return {
    status: 'pending',
    ...partial,
  }
}

describe('BOOKING_TYPES vs TRANSPORT_TYPES', () => {
  it('excludes flights and other transport types from Bookings', () => {
    expect(BOOKING_TYPES).toEqual(['hotel', 'restaurant', 'event', 'tour', 'other'])
    expect(isBookingType('flight')).toBe(false)
    expect(isTransportType('flight')).toBe(true)
    expect(TRANSPORT_TYPES).toContain('flight')
    expect(TRANSPORT_TYPES.some(t => (BOOKING_TYPES as readonly string[]).includes(t))).toBe(false)
  })
})

describe('normalizeBookingDraft', () => {
  it('forces hotel schedule_item_id to null and keeps location metadata', () => {
    const row = normalizeBookingDraft(draft({
      type: 'hotel',
      title: '  Villa Erba  ',
      hotelId: 'h1',
      scheduleItemId: 'sched-should-drop',
      metadata: { location: 'Como', check_in_until: '15:00' },
    }))
    expect(row.schedule_item_id).toBeNull()
    expect(row.hotel_id).toBe('h1')
    expect(row.title).toBe('Villa Erba')
    expect(row.metadata).toEqual({ location: 'Como', check_in_until: '15:00' })
  })

  it('strips hotel_id and check_in_until on non-hotel types', () => {
    const row = normalizeBookingDraft(draft({
      type: 'restaurant',
      title: 'Osteria',
      hotelId: 'h1',
      scheduleItemId: 's1',
      metadata: { location: 'Piazza', check_in_until: '15:00' },
    }))
    expect(row.hotel_id).toBeNull()
    expect(row.schedule_item_id).toBe('s1')
    expect(row.metadata).toEqual({ location: 'Piazza' })
  })

  it('throws on empty title and transport types', () => {
    expect(() => normalizeBookingDraft(draft({ type: 'hotel', title: '   ' }))).toThrow('Title is required')
    expect(() => normalizeBookingDraft(draft({ type: 'flight' as never, title: 'LH123' }))).toThrow('Invalid booking type')
  })
})

describe('costCategoryForBookingType', () => {
  it('maps booking types onto Costs categories', () => {
    expect(costCategoryForBookingType('hotel')).toBe('accommodation')
    expect(costCategoryForBookingType('restaurant')).toBe('food')
    expect(costCategoryForBookingType('event')).toBe('activities')
    expect(costCategoryForBookingType('tour')).toBe('activities')
    expect(costCategoryForBookingType('other')).toBe('other')
  })
})

describe('TRANSPORT_MANUAL_TYPES', () => {
  it('excludes Automated transit from manual chips', () => {
    expect(TRANSPORT_MANUAL_TYPES).not.toContain('transit')
    expect(TRANSPORT_TYPES).toContain('transit')
  })
})

describe('normalizeTransportDraft', () => {
  function transport(partial: Partial<FamilyTransportDraft> & Pick<FamilyTransportDraft, 'type' | 'title'>): FamilyTransportDraft {
    return {
      status: 'pending',
      endpoints: [],
      legs: [],
      ...partial,
    }
  }

  it('nulls hotel_id and schedule_item_id and pairs legs to consecutive endpoints', () => {
    const row = normalizeTransportDraft(transport({
      type: 'flight',
      title: '  AA 100  ',
      endpoints: [
        { name: 'JFK', code: 'JFK' },
        { name: 'DUB', code: 'DUB' },
        { name: 'FCO', code: 'FCO' },
      ],
      legs: [
        { carrierName: 'AA', serviceNumber: '100', seat: '12A' },
        { carrierName: 'AA', serviceNumber: '90' },
      ],
    }))
    expect(row.hotel_id).toBeNull()
    expect(row.schedule_item_id).toBeNull()
    expect(row.title).toBe('AA 100')
    expect(row.endpoints).toHaveLength(3)
    expect(row.endpoints.map(e => e.role)).toEqual(['from', 'stop', 'to'])
    expect(row.legs).toHaveLength(2)
    expect(row.legs[0].from_endpoint_id).toBe(row.endpoints[0].id)
    expect(row.legs[0].to_endpoint_id).toBe(row.endpoints[1].id)
    expect(row.legs[0].carrier_name).toBe('AA')
    expect(row.legs[0].service_number).toBe('100')
    expect(row.legs[1].from_endpoint_id).toBe(row.endpoints[1].id)
    expect(row.legs[1].to_endpoint_id).toBe(row.endpoints[2].id)
  })

  it('throws on empty title, booking types, and Automated transit', () => {
    expect(() => normalizeTransportDraft(transport({ type: 'flight', title: '   ' }))).toThrow('Title is required')
    expect(() => normalizeTransportDraft(transport({ type: 'hotel' as never, title: 'Stay' }))).toThrow('Invalid transport type')
    expect(() => normalizeTransportDraft(transport({ type: 'transit', title: 'U4' }))).toThrow('Invalid transport type')
  })
})

describe('costCategoryForTransportType', () => {
  it('maps flight to flights and other transport to transport', () => {
    expect(costCategoryForTransportType('flight')).toBe('flights')
    expect(costCategoryForTransportType('train')).toBe('transport')
    expect(costCategoryForTransportType('car')).toBe('transport')
  })
})
