import { hotelStayDayIds } from '../supabase/exploreAddToTrip'
import type { FamilyTripDay } from '../supabase/tripDays'
import type { FamilyTripPlace } from '../supabase/tripPlaces'
import {
  isBookingType,
  isTransportType,
  type FamilyBookingDraft,
  type FamilyTransportDraft,
  type TransportType,
} from '../supabase/tripReservations'
import type { FamilyImportItem } from './types'

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ')
}

export function matchTripPlaceId(
  venueName: string | null,
  title: string,
  places: FamilyTripPlace[],
): string | null {
  const needle = norm(venueName || title)
  if (!needle) return null
  const exact = places.find(p => norm(p.name) === needle)
  if (exact) return exact.id
  const loose = places.find(p => {
    const n = norm(p.name)
    return n.includes(needle) || needle.includes(n)
  })
  return loose?.id ?? null
}

function civil(iso: string | null): string | null {
  if (!iso) return null
  const d = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

function clock(iso: string | null): string | null {
  if (!iso || !iso.includes('T')) return null
  const t = iso.slice(11, 16)
  return /^\d{2}:\d{2}$/.test(t) && t !== '00:00' ? t : null
}

export function importItemToDraft(
  item: FamilyImportItem,
  places: FamilyTripPlace[],
  days: FamilyTripDay[],
): FamilyBookingDraft | null {
  if (item.kind !== 'booking' || !isBookingType(item.type)) return null

  const startCivil = civil(item.startsAt)
  const endCivil = civil(item.endsAt)
  const placeId = matchTripPlaceId(item.venueName, item.title, places)
  const metadata: Record<string, string> = {}
  if (item.location) metadata.location = item.location

  let startTripDayId: string | null = null
  let endTripDayId: string | null = null
  if (item.type === 'hotel' && startCivil && endCivil) {
    const ids = hotelStayDayIds(startCivil, endCivil, days)
    startTripDayId = ids.startTripDayId
    endTripDayId = ids.endTripDayId
  } else if (startCivil) {
    startTripDayId = days.find(d => d.civilDay === startCivil)?.id ?? null
    endTripDayId = endCivil ? (days.find(d => d.civilDay === endCivil)?.id ?? null) : startTripDayId
  }

  return {
    type: item.type,
    status: 'pending',
    title: item.title,
    startTripDayId,
    endTripDayId,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    confirmationCode: item.confirmationCode,
    notes: null,
    url: item.url,
    placeId,
    hotelId: null,
    scheduleItemId: null,
    metadata,
  }
}

function exactDayId(civilDay: string | null, days: FamilyTripDay[]): string | null {
  if (!civilDay) return null
  return days.find(d => d.civilDay === civilDay)?.id ?? null
}

/** Transport review draft — always needsReview; no clamp; no guessed airport_id. */
export function importItemToTransportDraft(
  item: FamilyImportItem,
  days: FamilyTripDay[],
): FamilyTransportDraft | null {
  if (item.kind !== 'transport' || !isTransportType(item.type) || item.type === 'transit') return null

  const startCivil = civil(item.startsAt)
  const endCivil = civil(item.endsAt)
  const startTime = clock(item.startsAt)
  const endTime = clock(item.endsAt)
  const fromName = (item.venueName || item.location || item.title).trim()
  const toName = (item.location && item.location.trim() !== fromName ? item.location.trim() : '')
    || (item.iataTo || '')
  const iataFrom = (item.iataFrom || '').trim().toUpperCase() || null
  const iataTo = (item.iataTo || '').trim().toUpperCase() || null

  return {
    type: item.type as TransportType,
    status: 'pending',
    title: item.title,
    startTripDayId: exactDayId(startCivil, days),
    endTripDayId: exactDayId(endCivil, days) ?? exactDayId(startCivil, days),
    confirmationCode: item.confirmationCode,
    notes: null,
    url: item.url,
    endpoints: [
      {
        name: fromName,
        code: iataFrom,
        localDate: startCivil,
        localTime: startTime,
      },
      {
        name: toName,
        code: iataTo,
        localDate: endCivil ?? startCivil,
        localTime: endTime,
      },
    ],
    legs: [],
  }
}

export type FamilyImportReviewItem =
  | { kind: 'booking'; draft: FamilyBookingDraft }
  | { kind: 'transport'; draft: FamilyTransportDraft }

export function mapImportItemsToReview(
  items: FamilyImportItem[],
  places: FamilyTripPlace[],
  days: FamilyTripDay[],
): FamilyImportReviewItem[] {
  const out: FamilyImportReviewItem[] = []
  for (const item of items) {
    if (item.kind === 'booking') {
      const draft = importItemToDraft(item, places, days)
      if (draft) out.push({ kind: 'booking', draft })
    } else {
      const draft = importItemToTransportDraft(item, days)
      if (draft) out.push({ kind: 'transport', draft })
    }
  }
  return out
}
