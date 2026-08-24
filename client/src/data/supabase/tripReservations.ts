import { getSupabaseBrowserClient } from './client'
import type { CostCategory } from './tripExpenses'

/**
 * Family-plane trip_reservations. Bookings (W6.2) and Transport (W6.1) share
 * one table; filter by type. Do not mount Nest ReservationModal.
 */

export const BOOKING_TYPES = ['hotel', 'restaurant', 'event', 'tour', 'other'] as const
export const TRANSPORT_TYPES = [
  'flight', 'train', 'bus', 'car', 'taxi', 'bicycle', 'cruise', 'ferry', 'transit', 'transport_other',
] as const

export type BookingType = (typeof BOOKING_TYPES)[number]
export type TransportType = (typeof TRANSPORT_TYPES)[number]
export type ReservationStatus = 'pending' | 'confirmed'
export type EndpointRole = 'from' | 'to' | 'stop'

/** Manual Transport editor chips — no Automated `transit`. */
export const TRANSPORT_MANUAL_TYPES = [
  'flight', 'train', 'bus', 'car', 'taxi', 'bicycle', 'cruise', 'ferry', 'transport_other',
] as const
export type TransportManualType = (typeof TRANSPORT_MANUAL_TYPES)[number]

export function isTransportManualType(type: string): type is TransportManualType {
  return (TRANSPORT_MANUAL_TYPES as readonly string[]).includes(type)
}

export type FamilyTripReservation = {
  id: string
  tripId: string
  type: BookingType
  status: ReservationStatus
  title: string
  startTripDayId: string | null
  endTripDayId: string | null
  startsAt: string | null
  endsAt: string | null
  confirmationCode: string | null
  notes: string | null
  url: string | null
  placeId: string | null
  hotelId: string | null
  scheduleItemId: string | null
  metadata: Record<string, string>
  sortOrder: number
  createdAt: string
}

export type FamilyBookingDraft = {
  id?: string | null
  type: BookingType
  status: ReservationStatus
  title: string
  startTripDayId?: string | null
  endTripDayId?: string | null
  startsAt?: string | null
  endsAt?: string | null
  confirmationCode?: string | null
  notes?: string | null
  url?: string | null
  placeId?: string | null
  hotelId?: string | null
  scheduleItemId?: string | null
  metadata?: Record<string, string>
}

export type NormalizedBookingWrite = {
  type: BookingType
  status: ReservationStatus
  title: string
  place_id: string | null
  hotel_id: string | null
  start_trip_day_id: string | null
  end_trip_day_id: string | null
  starts_at: string | null
  ends_at: string | null
  confirmation_code: string | null
  notes: string | null
  url: string | null
  schedule_item_id: string | null
  metadata: Record<string, string>
}

const BOOKING_SELECT =
  'id,trip_id,type,status,title,start_trip_day_id,end_trip_day_id,starts_at,ends_at,confirmation_code,notes,url,place_id,hotel_id,schedule_item_id,metadata,sort_order,created_at'

type ReservationRow = {
  id: string
  trip_id: string
  type: string
  status: string | null
  title: string | null
  start_trip_day_id: string | null
  end_trip_day_id: string | null
  starts_at: string | null
  ends_at: string | null
  confirmation_code: string | null
  notes: string | null
  url: string | null
  place_id: string | null
  hotel_id: string | null
  schedule_item_id: string | null
  metadata: unknown
  sort_order: number | null
  created_at: string
}

export function isBookingType(type: string): type is BookingType {
  return (BOOKING_TYPES as readonly string[]).includes(type)
}

export function isTransportType(type: string): type is TransportType {
  return (TRANSPORT_TYPES as readonly string[]).includes(type)
}

export function asReservationMetadata(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v) out[k] = v
  }
  return out
}

export function costCategoryForBookingType(type: BookingType): CostCategory {
  switch (type) {
    case 'hotel':
      return 'accommodation'
    case 'restaurant':
      return 'food'
    case 'event':
    case 'tour':
      return 'activities'
    default:
      return 'other'
  }
}

export function costCategoryForTransportType(type: TransportType): CostCategory {
  return type === 'flight' ? 'flights' : 'transport'
}

/** Open Costs editor after saving a booking (UUID — not Nest ExpensePrefill). */
export type FamilyExpensePrefill = {
  name?: string
  category?: CostCategory
  reservationId: string
  expenseId?: string
}

/** Hotels never carry a Plan assignment; non-hotels never keep catalog hotel_id or check_in_until. */
export function normalizeBookingDraft(draft: FamilyBookingDraft): NormalizedBookingWrite {
  const title = draft.title.trim()
  if (!title) throw new Error('Title is required')
  if (!isBookingType(draft.type)) throw new Error('Invalid booking type')

  const isHotel = draft.type === 'hotel'
  const metadata = { ...(draft.metadata ?? {}) }
  if (!isHotel) delete metadata.check_in_until

  return {
    type: draft.type,
    status: draft.status === 'confirmed' ? 'confirmed' : 'pending',
    title,
    place_id: draft.placeId ?? null,
    hotel_id: isHotel ? (draft.hotelId ?? null) : null,
    start_trip_day_id: draft.startTripDayId ?? null,
    end_trip_day_id: draft.endTripDayId ?? null,
    starts_at: draft.startsAt ?? null,
    ends_at: draft.endsAt ?? null,
    confirmation_code: draft.confirmationCode?.trim() || null,
    notes: draft.notes?.trim() || null,
    url: draft.url?.trim() || null,
    schedule_item_id: isHotel ? null : (draft.scheduleItemId ?? null),
    metadata,
  }
}

function rowToBooking(r: ReservationRow): FamilyTripReservation | null {
  if (!isBookingType(r.type)) return null
  return {
    id: r.id,
    tripId: r.trip_id,
    type: r.type,
    status: r.status === 'confirmed' ? 'confirmed' : 'pending',
    title: r.title?.trim() || 'Untitled',
    startTripDayId: r.start_trip_day_id,
    endTripDayId: r.end_trip_day_id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    confirmationCode: r.confirmation_code,
    notes: r.notes,
    url: r.url,
    placeId: r.place_id,
    hotelId: r.hotel_id,
    scheduleItemId: r.schedule_item_id,
    metadata: asReservationMetadata(r.metadata),
    sortOrder: r.sort_order ?? 0,
    createdAt: r.created_at,
  }
}

export async function listTripBookings(tripId: string): Promise<FamilyTripReservation[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('trip_reservations')
    .select(BOOKING_SELECT)
    .eq('trip_id', tripId)
    .in('type', [...BOOKING_TYPES])
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return ((data ?? []) as ReservationRow[]).map(rowToBooking).filter((r): r is FamilyTripReservation => r != null)
}

export async function upsertTripBooking(tripId: string, draft: FamilyBookingDraft): Promise<string> {
  const row = normalizeBookingDraft(draft)
  const now = new Date().toISOString()
  const sb = getSupabaseBrowserClient()

  if (draft.id) {
    const { error } = await sb
      .from('trip_reservations')
      .update({ ...row, updated_at: now })
      .eq('id', draft.id)
      .eq('trip_id', tripId)
    if (error) throw error
    return draft.id
  }

  const { data, error } = await sb
    .from('trip_reservations')
    .insert({
      trip_id: tripId,
      ...row,
      updated_at: now,
    })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function deleteTripReservation(id: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .from('trip_reservations')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function setTripReservationStatus(
  id: string,
  status: ReservationStatus,
): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .from('trip_reservations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Explore W8.5 hotel stay — single write path through upsert. */
export async function insertHotelStay(opts: {
  tripId: string
  title: string
  hotelId: string
  placeId: string | null
  checkInCivil: string
  checkOutCivil: string
  startTripDayId: string | null
  endTripDayId: string | null
  url?: string | null
}): Promise<string> {
  return upsertTripBooking(opts.tripId, {
    type: 'hotel',
    status: 'pending',
    title: opts.title,
    hotelId: opts.hotelId,
    placeId: opts.placeId,
    startTripDayId: opts.startTripDayId,
    endTripDayId: opts.endTripDayId,
    startsAt: `${opts.checkInCivil}T00:00:00.000Z`,
    endsAt: `${opts.checkOutCivil}T00:00:00.000Z`,
    url: opts.url ?? null,
    scheduleItemId: null,
  })
}

export type FamilyTransportEndpoint = {
  id: string
  role: EndpointRole
  sequence: number
  name: string
  code: string | null
  airportId: string | null
  placeId: string | null
  latitude: number | null
  longitude: number | null
  timeZone: string | null
  localDate: string | null
  localTime: string | null
}

export type FamilyTransportLeg = {
  id: string
  sequence: number
  fromEndpointId: string | null
  toEndpointId: string | null
  carrierName: string | null
  serviceNumber: string | null
  platform: string | null
  seat: string | null
}

export type FamilyTransportReservation = {
  id: string
  tripId: string
  type: TransportType
  status: ReservationStatus
  title: string
  startTripDayId: string | null
  endTripDayId: string | null
  startsAt: string | null
  endsAt: string | null
  confirmationCode: string | null
  notes: string | null
  url: string | null
  metadata: Record<string, string>
  sortOrder: number
  createdAt: string
  endpoints: FamilyTransportEndpoint[]
  legs: FamilyTransportLeg[]
}

export type FamilyTransportEndpointDraft = {
  id?: string
  name: string
  code?: string | null
  airportId?: string | null
  placeId?: string | null
  latitude?: number | null
  longitude?: number | null
  timeZone?: string | null
  localDate?: string | null
  localTime?: string | null
}

export type FamilyTransportLegDraft = {
  carrierName?: string
  serviceNumber?: string
  platform?: string
  seat?: string
}

export type FamilyTransportDraft = {
  id?: string | null
  type: TransportType
  status: ReservationStatus
  title: string
  startTripDayId?: string | null
  endTripDayId?: string | null
  confirmationCode?: string | null
  notes?: string | null
  url?: string | null
  endpoints: FamilyTransportEndpointDraft[]
  legs: FamilyTransportLegDraft[]
}

export type NormalizedTransportWrite = {
  type: TransportType
  status: ReservationStatus
  title: string
  start_trip_day_id: string | null
  end_trip_day_id: string | null
  starts_at: string | null
  ends_at: string | null
  confirmation_code: string | null
  notes: string | null
  url: string | null
  hotel_id: null
  schedule_item_id: null
  endpoints: Array<{
    id: string
    role: EndpointRole
    sequence: number
    name: string
    code: string | null
    airport_id: string | null
    place_id: string | null
    latitude: number | null
    longitude: number | null
    time_zone: string | null
    local_date: string | null
    local_time: string | null
  }>
  legs: Array<{
    sequence: number
    from_endpoint_id: string
    to_endpoint_id: string
    carrier_name: string | null
    service_number: string | null
    platform: string | null
    seat: string | null
  }>
}

function emptyNil(s: string | null | undefined): string | null {
  const t = (s ?? '').trim()
  return t || null
}

function normalizeLocalTime(raw: string | null | undefined): string | null {
  const t = emptyNil(raw)
  if (!t) return null
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`
  if (/^\d{2}:\d{2}:\d{2}/.test(t)) return t.slice(0, 8)
  return t
}

function combineCivilTime(civil: string | null, time: string | null): string | null {
  if (!civil) return null
  const clock = time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : '00:00'
  return `${civil}T${clock}:00.000Z`
}

function endpointRole(index: number, count: number): EndpointRole {
  if (index === 0) return 'from'
  if (index === count - 1) return 'to'
  return 'stop'
}

/** Title required; reject booking types and Automated `transit`; null lodging columns. */
export function normalizeTransportDraft(draft: FamilyTransportDraft): NormalizedTransportWrite {
  const title = draft.title.trim()
  if (!title) throw new Error('Title is required')
  if (!isTransportType(draft.type) || draft.type === 'transit') throw new Error('Invalid transport type')

  const named = draft.endpoints.filter(ep =>
    (ep.name ?? '').trim() || (ep.code ?? '').trim() || ep.airportId || ep.placeId,
  )
  const endpoints = named.map((ep, idx) => {
    const code = emptyNil(ep.code)
    const name = (ep.name ?? '').trim() || code || 'Stop'
    return {
      id: ep.id || crypto.randomUUID(),
      role: endpointRole(idx, named.length),
      sequence: idx,
      name,
      code,
      airport_id: ep.airportId ?? null,
      place_id: ep.placeId ?? null,
      latitude: ep.latitude ?? null,
      longitude: ep.longitude ?? null,
      time_zone: emptyNil(ep.timeZone),
      local_date: emptyNil(ep.localDate),
      local_time: normalizeLocalTime(ep.localTime),
    }
  })

  const legs = endpoints.length >= 2
    ? endpoints.slice(0, -1).map((_, idx) => {
      const leg = draft.legs[idx] ?? {}
      return {
        sequence: idx,
        from_endpoint_id: endpoints[idx].id,
        to_endpoint_id: endpoints[idx + 1].id,
        carrier_name: emptyNil(leg.carrierName),
        service_number: emptyNil(leg.serviceNumber),
        platform: emptyNil(leg.platform),
        seat: emptyNil(leg.seat),
      }
    })
    : []

  const first = endpoints[0]
  const last = endpoints[endpoints.length - 1]
  return {
    type: draft.type,
    status: draft.status === 'confirmed' ? 'confirmed' : 'pending',
    title,
    start_trip_day_id: draft.startTripDayId ?? null,
    end_trip_day_id: draft.endTripDayId ?? null,
    starts_at: combineCivilTime(first?.local_date ?? null, first?.local_time ?? null),
    ends_at: combineCivilTime(last?.local_date ?? null, last?.local_time ?? null),
    confirmation_code: emptyNil(draft.confirmationCode),
    notes: emptyNil(draft.notes),
    url: emptyNil(draft.url),
    hotel_id: null,
    schedule_item_id: null,
    endpoints,
    legs,
  }
}

export function transportRouteLabel(r: Pick<FamilyTransportReservation, 'endpoints'>): string {
  const named = [...r.endpoints].sort((a, b) => a.sequence - b.sequence).filter(e => e.name || e.code)
  if (named.length < 2) return ''
  return named.map(e => e.code || e.name).join(' → ')
}

export function transportLegMeta(r: Pick<FamilyTransportReservation, 'legs'>): string {
  const leg = [...r.legs].sort((a, b) => a.sequence - b.sequence)[0]
  if (!leg) return ''
  return [leg.carrierName, leg.serviceNumber].filter(Boolean).join(' ')
}

const TRANSPORT_SELECT =
  'id,trip_id,type,status,title,start_trip_day_id,end_trip_day_id,starts_at,ends_at,confirmation_code,notes,url,metadata,sort_order,created_at'

const ENDPOINT_SELECT =
  'id,reservation_id,role,sequence,name,code,airport_id,place_id,latitude,longitude,time_zone,local_date,local_time'

const LEG_SELECT =
  'id,reservation_id,sequence,from_endpoint_id,to_endpoint_id,carrier_name,service_number,platform,seat'

type EndpointRow = {
  id: string
  reservation_id: string
  role: string
  sequence: number
  name: string | null
  code: string | null
  airport_id: string | null
  place_id: string | null
  latitude: number | string | null
  longitude: number | string | null
  time_zone: string | null
  local_date: string | null
  local_time: string | null
}

type LegRow = {
  id: string
  reservation_id: string
  sequence: number
  from_endpoint_id: string | null
  to_endpoint_id: string | null
  carrier_name: string | null
  service_number: string | null
  platform: string | null
  seat: string | null
}

function toCoord(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function rowToEndpoint(r: EndpointRow): FamilyTransportEndpoint {
  const role: EndpointRole = r.role === 'to' || r.role === 'stop' ? r.role : 'from'
  return {
    id: r.id,
    role,
    sequence: r.sequence,
    name: r.name?.trim() || r.code || 'Stop',
    code: r.code,
    airportId: r.airport_id,
    placeId: r.place_id,
    latitude: toCoord(r.latitude),
    longitude: toCoord(r.longitude),
    timeZone: r.time_zone,
    localDate: r.local_date,
    localTime: r.local_time ? r.local_time.slice(0, 5) : null,
  }
}

function rowToLeg(r: LegRow): FamilyTransportLeg {
  return {
    id: r.id,
    sequence: r.sequence,
    fromEndpointId: r.from_endpoint_id,
    toEndpointId: r.to_endpoint_id,
    carrierName: r.carrier_name,
    serviceNumber: r.service_number,
    platform: r.platform,
    seat: r.seat,
  }
}

function rowToTransport(
  r: ReservationRow,
  endpoints: FamilyTransportEndpoint[],
  legs: FamilyTransportLeg[],
): FamilyTransportReservation | null {
  if (!isTransportType(r.type)) return null
  return {
    id: r.id,
    tripId: r.trip_id,
    type: r.type,
    status: r.status === 'confirmed' ? 'confirmed' : 'pending',
    title: r.title?.trim() || 'Untitled',
    startTripDayId: r.start_trip_day_id,
    endTripDayId: r.end_trip_day_id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    confirmationCode: r.confirmation_code,
    notes: r.notes,
    url: r.url,
    metadata: asReservationMetadata(r.metadata),
    sortOrder: r.sort_order ?? 0,
    createdAt: r.created_at,
    endpoints: endpoints.slice().sort((a, b) => a.sequence - b.sequence),
    legs: legs.slice().sort((a, b) => a.sequence - b.sequence),
  }
}

export async function listTripTransports(tripId: string): Promise<FamilyTransportReservation[]> {
  const sb = getSupabaseBrowserClient()
  const { data, error } = await sb
    .from('trip_reservations')
    .select(TRANSPORT_SELECT)
    .eq('trip_id', tripId)
    .in('type', [...TRANSPORT_TYPES])
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  const headers = (data ?? []) as ReservationRow[]
  if (headers.length === 0) return []

  const ids = headers.map(r => r.id)
  const [{ data: epData, error: epError }, { data: legData, error: legError }] = await Promise.all([
    sb.from('trip_reservation_endpoints').select(ENDPOINT_SELECT).in('reservation_id', ids).order('sequence', { ascending: true }),
    sb.from('trip_reservation_legs').select(LEG_SELECT).in('reservation_id', ids).order('sequence', { ascending: true }),
  ])
  if (epError) throw epError
  if (legError) throw legError

  const endpointsByRes = new Map<string, FamilyTransportEndpoint[]>()
  for (const row of (epData ?? []) as EndpointRow[]) {
    const list = endpointsByRes.get(row.reservation_id) ?? []
    list.push(rowToEndpoint(row))
    endpointsByRes.set(row.reservation_id, list)
  }
  const legsByRes = new Map<string, FamilyTransportLeg[]>()
  for (const row of (legData ?? []) as LegRow[]) {
    const list = legsByRes.get(row.reservation_id) ?? []
    list.push(rowToLeg(row))
    legsByRes.set(row.reservation_id, list)
  }

  return headers
    .map(r => rowToTransport(r, endpointsByRes.get(r.id) ?? [], legsByRes.get(r.id) ?? []))
    .filter((r): r is FamilyTransportReservation => r != null)
}

export async function upsertTripTransport(tripId: string, draft: FamilyTransportDraft): Promise<string> {
  const row = normalizeTransportDraft(draft)
  const now = new Date().toISOString()
  const sb = getSupabaseBrowserClient()
  const header = {
    type: row.type,
    status: row.status,
    title: row.title,
    start_trip_day_id: row.start_trip_day_id,
    end_trip_day_id: row.end_trip_day_id,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    confirmation_code: row.confirmation_code,
    notes: row.notes,
    url: row.url,
    hotel_id: row.hotel_id,
    schedule_item_id: row.schedule_item_id,
    updated_at: now,
  }

  let reservationId = draft.id ?? ''
  if (draft.id) {
    const { error } = await sb
      .from('trip_reservations')
      .update(header)
      .eq('id', draft.id)
      .eq('trip_id', tripId)
    if (error) throw error
    reservationId = draft.id
    const { error: delLegs } = await sb.from('trip_reservation_legs').delete().eq('reservation_id', reservationId)
    if (delLegs) throw delLegs
    const { error: delEps } = await sb.from('trip_reservation_endpoints').delete().eq('reservation_id', reservationId)
    if (delEps) throw delEps
  } else {
    const { data, error } = await sb
      .from('trip_reservations')
      .insert({ trip_id: tripId, ...header })
      .select('id')
      .single()
    if (error) throw error
    reservationId = (data as { id: string }).id
  }

  if (row.endpoints.length > 0) {
    const { error: epErr } = await sb.from('trip_reservation_endpoints').insert(
      row.endpoints.map(ep => ({
        id: ep.id,
        reservation_id: reservationId,
        role: ep.role,
        sequence: ep.sequence,
        name: ep.name,
        code: ep.code,
        airport_id: ep.airport_id,
        place_id: ep.place_id,
        latitude: ep.latitude,
        longitude: ep.longitude,
        time_zone: ep.time_zone,
        local_date: ep.local_date,
        local_time: ep.local_time,
      })),
    )
    if (epErr) throw epErr
  }

  if (row.legs.length > 0) {
    const { error: legErr } = await sb.from('trip_reservation_legs').insert(
      row.legs.map(leg => ({
        reservation_id: reservationId,
        sequence: leg.sequence,
        from_endpoint_id: leg.from_endpoint_id,
        to_endpoint_id: leg.to_endpoint_id,
        carrier_name: leg.carrier_name,
        service_number: leg.service_number,
        platform: leg.platform,
        seat: leg.seat,
      })),
    )
    if (legErr) throw legErr
  }

  return reservationId
}
