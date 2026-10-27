import type { FamilyTripDay } from '../../data/supabase/tripDays'
import type { FamilyTripExpense } from '../../data/supabase/tripExpenses'
import type { FamilyTripFile } from '../../data/supabase/tripFiles'
import type { FamilyTripReservation } from '../../data/supabase/tripReservations'

export type FamilyBookingDetailExpense = {
  id: string
  name: string
  amount: number
  currencyCode: string
}

export type FamilyBookingDetailFile = {
  id: string
  originalName: string
  storagePath: string
}

export type FamilyBookingDetail = {
  id: string
  title: string
  type: FamilyTripReservation['type']
  status: FamilyTripReservation['status']
  timeLabel?: string | null
  confirmationCode: string | null
  notes: string | null
  url: string | null
  startCivil: string | null
  endCivil: string | null
  expenses: FamilyBookingDetailExpense[]
  files: FamilyBookingDetailFile[]
}

function civilFromInstant(iso: string | null | undefined): string | null {
  if (!iso) return null
  const day = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

function civilFromDayId(dayId: string | null, days: FamilyTripDay[]): string | null {
  if (!dayId) return null
  return days.find(day => day.id === dayId)?.civilDay ?? null
}

export function projectFamilyBookingDetail(input: {
  reservation: FamilyTripReservation
  days: FamilyTripDay[]
  expenses: FamilyTripExpense[]
  currencyCode: string
  files?: FamilyTripFile[]
}): FamilyBookingDetail {
  const { reservation, days, expenses, currencyCode } = input
  const seen = new Set<string>()
  const files: FamilyBookingDetailFile[] = []
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
    timeLabel: [reservation.startsAt, reservation.endsAt].map(value => {
      const clock = value?.slice(11, 16)
      return clock && /^\d{2}:\d{2}$/.test(clock) && clock !== '00:00' ? clock : null
    }).filter((value, index, values) => value && values.indexOf(value) === index).join(' – ') || null,
    confirmationCode: reservation.confirmationCode,
    notes: reservation.notes,
    url: reservation.url,
    startCivil: civilFromInstant(reservation.startsAt) ?? civilFromDayId(reservation.startTripDayId, days),
    endCivil: civilFromInstant(reservation.endsAt) ?? civilFromDayId(reservation.endTripDayId, days),
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
