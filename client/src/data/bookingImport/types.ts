import type { BookingType, TransportType } from '../supabase/tripReservations'

export type FamilyImportKind = 'booking' | 'transport'

export type FamilyImportItem = {
  kind: FamilyImportKind
  type: BookingType | TransportType
  title: string
  confirmationCode: string | null
  startsAt: string | null
  endsAt: string | null
  location: string | null
  url: string | null
  venueName: string | null
  sourceFileName: string
  needsReview: boolean
  iataFrom?: string | null
  iataTo?: string | null
}

export type FamilyImportResult = {
  items: FamilyImportItem[]
  warnings: string[]
}

export function isImportBookingType(type: string): type is BookingType {
  return type === 'hotel' || type === 'restaurant' || type === 'event' || type === 'tour' || type === 'other'
}
