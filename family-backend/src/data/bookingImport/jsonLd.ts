import { isTransportType, type TransportType } from '../supabase/tripReservations'
import type { FamilyImportItem } from './types'

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

function typeNames(node: Record<string, unknown>): string[] {
  const raw = node['@type']
  if (typeof raw === 'string') return [raw.replace(/^schema:/, '')]
  if (Array.isArray(raw)) {
    return raw.filter((t): t is string => typeof t === 'string').map(t => t.replace(/^schema:/, ''))
  }
  return []
}

function collectNodes(input: unknown): Record<string, unknown>[] {
  if (Array.isArray(input)) return input.flatMap(collectNodes)
  const obj = asRecord(input)
  if (!obj) return []
  const graph = obj['@graph']
  if (graph != null) return [obj, ...collectNodes(graph)]
  return [obj]
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}

function formatAddress(address: unknown): string | null {
  if (typeof address === 'string') return address.trim() || null
  const a = asRecord(address)
  if (!a) return null
  const joined = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry]
    .map(str)
    .filter(Boolean)
    .join(', ')
  return joined || null
}

/** ISO date or date-time; keep date+time when present. */
export function toIsoish(v: unknown): string | null {
  if (!v) return null
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return null
    const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}:\d{2}))?/)
    if (!m) return null
    return m[2] ? `${m[1]}T${m[2]}:00.000Z` : `${m[1]}T00:00:00.000Z`
  }
  const obj = asRecord(v)
  if (obj && typeof obj['@value'] === 'string') return toIsoish(obj['@value'])
  return null
}

function named(v: unknown): { name: string | null; url: string | null; address: string | null } {
  if (typeof v === 'string') return { name: v.trim() || null, url: null, address: null }
  const o = asRecord(v)
  if (!o) return { name: null, url: null, address: null }
  return {
    name: str(o.name),
    url: str(o.url),
    address: formatAddress(o.address),
  }
}

function item(
  partial: Omit<FamilyImportItem, 'needsReview'> & { needsReview?: boolean },
): FamilyImportItem {
  const title = partial.title.trim()
  const needsReview = partial.needsReview
    ?? (!title || (!partial.startsAt && !partial.endsAt))
  return { ...partial, title: title || partial.sourceFileName, needsReview }
}

function mapLodging(node: Record<string, unknown>, fileName: string): FamilyImportItem | null {
  const venue = named(node.reservationFor)
  const title = venue.name
  if (!title) return null
  return item({
    kind: 'booking',
    type: 'hotel',
    title,
    confirmationCode: str(node.reservationNumber),
    startsAt: toIsoish(node.checkinTime),
    endsAt: toIsoish(node.checkoutTime),
    location: venue.address,
    url: venue.url ?? str(node.url),
    venueName: title,
    sourceFileName: fileName,
  })
}

function mapFood(node: Record<string, unknown>, fileName: string): FamilyImportItem | null {
  const venue = named(node.reservationFor)
  const title = venue.name
  if (!title) return null
  return item({
    kind: 'booking',
    type: 'restaurant',
    title,
    confirmationCode: str(node.reservationNumber),
    startsAt: toIsoish(node.startTime),
    endsAt: toIsoish(node.endTime),
    location: venue.address,
    url: venue.url ?? str(node.url),
    venueName: title,
    sourceFileName: fileName,
  })
}

function mapEvent(node: Record<string, unknown>, fileName: string): FamilyImportItem | null {
  const event = named(node.reservationFor)
  const locRaw = asRecord(node.reservationFor)?.location
  const loc = named(locRaw)
  const title = event.name
  if (!title) return null
  return item({
    kind: 'booking',
    type: 'event',
    title,
    confirmationCode: str(node.reservationNumber),
    startsAt: toIsoish(asRecord(node.reservationFor)?.startDate ?? node.startTime),
    endsAt: toIsoish(asRecord(node.reservationFor)?.endDate ?? node.endTime),
    location: loc.address ?? loc.name,
    url: event.url ?? str(node.url),
    venueName: loc.name ?? title,
    sourceFileName: fileName,
  })
}

const TRANSPORT_SCHEMA: Record<string, TransportType> = {
  FlightReservation: 'flight',
  TrainReservation: 'train',
  BusReservation: 'bus',
  BoatReservation: 'ferry',
  RentalCarReservation: 'car',
}

function iataOf(v: unknown): string | null {
  if (typeof v === 'string') {
    const code = v.trim().toUpperCase()
    return /^[A-Z]{3}$/.test(code) ? code : null
  }
  const o = asRecord(v)
  if (!o) return null
  const code = (str(o.iataCode) || str(o.iata) || '').toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : null
}

function mapTransport(
  schemaType: string,
  node: Record<string, unknown>,
  fileName: string,
): FamilyImportItem | null {
  const type = TRANSPORT_SCHEMA[schemaType]
  if (!type || !isTransportType(type)) return null
  const rf = named(node.reservationFor)
  const flight = asRecord(node.reservationFor)
  const title = rf.name || str(node.reservationNumber) || schemaType
  return item({
    kind: 'transport',
    type,
    title,
    confirmationCode: str(node.reservationNumber),
    startsAt: toIsoish(node.startTime ?? flight?.departureTime),
    endsAt: toIsoish(node.endTime ?? flight?.arrivalTime),
    location: rf.address,
    url: rf.url,
    venueName: rf.name,
    sourceFileName: fileName,
    needsReview: true,
    iataFrom: iataOf(flight?.departureAirport),
    iataTo: iataOf(flight?.arrivalAirport),
  })
}

function mapNode(node: Record<string, unknown>, fileName: string): FamilyImportItem[] {
  const items: FamilyImportItem[] = []
  for (const t of typeNames(node)) {
    let mapped: FamilyImportItem | null = null
    if (t === 'LodgingReservation') mapped = mapLodging(node, fileName)
    else if (t === 'FoodEstablishmentReservation') mapped = mapFood(node, fileName)
    else if (t === 'EventReservation' || t === 'TouristAttractionVisit') mapped = mapEvent(node, fileName)
    else if (TRANSPORT_SCHEMA[t]) mapped = mapTransport(t, node, fileName)
    if (mapped) items.push(mapped)
  }
  return items
}

export function itemsFromJsonLd(blocks: unknown[], fileName: string): FamilyImportItem[] {
  const items: FamilyImportItem[] = []
  for (const block of blocks) {
    for (const node of collectNodes(block)) {
      items.push(...mapNode(node, fileName))
    }
  }
  return items
}

