import type { FamilyTripDay } from '../../data/supabase/tripDays'
import type { FamilyTripExpense } from '../../data/supabase/tripExpenses'
import type { FamilyTripFile } from '../../data/supabase/tripFiles'
import type {
  FamilyTransportEndpoint,
  FamilyTransportLeg,
  FamilyTransportReservation,
} from '../../data/supabase/tripReservations'

export type FamilyTransportDetailExpense = {
  id: string
  name: string
  amount: number
  currencyCode: string
}

export type FamilyTransportDetailFile = {
  id: string
  originalName: string
  storagePath: string
}

export type FamilyTransportDetailEndpoint = {
  id: string
  role: FamilyTransportEndpoint['role']
  sequence: number
  name: string
  code: string | null
  localDate: string | null
  localTime: string | null
  timeZone: string | null
}

export type FamilyTransportDetailLeg = {
  id: string
  sequence: number
  fromEndpointId: string | null
  toEndpointId: string | null
  carrierName: string | null
  serviceNumber: string | null
  platform: string | null
  seat: string | null
}

export type FamilyTransportDetail = {
  id: string
  title: string
  type: FamilyTransportReservation['type']
  status: FamilyTransportReservation['status']
  confirmationCode: string | null
  notes: string | null
  url: string | null
  startCivil: string | null
  endCivil: string | null
  endpoints: FamilyTransportDetailEndpoint[]
  legs: FamilyTransportDetailLeg[]
  expenses: FamilyTransportDetailExpense[]
  files: FamilyTransportDetailFile[]
}

function recorded(value: string | null | undefined): string | null {
  const text = value?.trim()
  return text ? text : null
}

function civilFromInstant(iso: string | null | undefined): string | null {
  const day = recorded(iso)?.slice(0, 10) ?? null
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

function civilFromDayId(dayId: string | null, days: FamilyTripDay[]): string | null {
  if (!dayId) return null
  return days.find(day => day.id === dayId)?.civilDay ?? null
}

function bySequence<T extends { sequence: number }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item.sequence - b.item.sequence) || (a.index - b.index))
    .map(entry => entry.item)
}

function projectEndpoint(endpoint: FamilyTransportEndpoint): FamilyTransportDetailEndpoint {
  return {
    id: endpoint.id,
    role: endpoint.role,
    sequence: endpoint.sequence,
    name: endpoint.name,
    code: recorded(endpoint.code),
    localDate: recorded(endpoint.localDate),
    localTime: recorded(endpoint.localTime),
    timeZone: recorded(endpoint.timeZone),
  }
}

function projectLeg(leg: FamilyTransportLeg): FamilyTransportDetailLeg {
  return {
    id: leg.id,
    sequence: leg.sequence,
    fromEndpointId: leg.fromEndpointId,
    toEndpointId: leg.toEndpointId,
    carrierName: recorded(leg.carrierName),
    serviceNumber: recorded(leg.serviceNumber),
    platform: recorded(leg.platform),
    seat: recorded(leg.seat),
  }
}

export function projectFamilyTransportDetail(input: {
  reservation: FamilyTransportReservation
  days: FamilyTripDay[]
  expenses: FamilyTripExpense[]
  currencyCode: string
  files?: FamilyTripFile[]
}): FamilyTransportDetail {
  const { reservation, days, expenses, currencyCode } = input
  const endpoints = bySequence(reservation.endpoints).map(projectEndpoint)
  const seen = new Set<string>()
  const files: FamilyTransportDetailFile[] = []
  for (const file of input.files ?? []) {
    if (file.deletedAt) continue
    if (seen.has(file.id)) continue
    const linked = file.links.some(link => link.reservationId === reservation.id)
    if (!linked) continue
    seen.add(file.id)
    files.push({
      id: file.id,
      originalName: file.originalName,
      storagePath: file.storagePath,
    })
  }
  return {
    id: reservation.id,
    title: reservation.title,
    type: reservation.type,
    status: reservation.status,
    confirmationCode: recorded(reservation.confirmationCode),
    notes: recorded(reservation.notes),
    url: recorded(reservation.url),
    startCivil: civilFromInstant(reservation.startsAt)
      ?? endpoints[0]?.localDate
      ?? civilFromDayId(reservation.startTripDayId, days),
    endCivil: civilFromInstant(reservation.endsAt)
      ?? endpoints[endpoints.length - 1]?.localDate
      ?? civilFromDayId(reservation.endTripDayId, days),
    endpoints,
    legs: bySequence(reservation.legs).map(projectLeg),
    expenses: expenses
      .filter(expense => expense.reservationId === reservation.id)
      .map(expense => ({
        id: expense.id,
        name: expense.name,
        amount: expense.totalAmount,
        currencyCode: expense.currencyCode || currencyCode,
      })),
    files,
  }
}
