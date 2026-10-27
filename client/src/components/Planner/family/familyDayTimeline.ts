import type { FamilyDayNote } from '../../../data/supabase/dayNotes'
import type { FamilyScheduleItem } from '../../../data/supabase/scheduleItems'
import { utcCivilDay } from '../../../data/supabase/scheduleItems'
import type { FamilyTripDay } from '../../../data/supabase/tripDays'
import type { FamilyTripPlace } from '../../../data/supabase/tripPlaces'
import type {
  FamilyTransportEndpoint,
  FamilyTransportReservation,
  FamilyTripReservation,
} from '../../../data/supabase/tripReservations'

export type FamilyDayTimelineSource = 'schedule' | 'booking' | 'transport'
export type FamilyDayTimelinePhase = 'single' | 'start' | 'end' | 'pill' | 'depart' | 'arrive' | 'stop'

export type FamilyDayTimelineRowModel = {
  key: string
  source: FamilyDayTimelineSource
  id: string
  phase: FamilyDayTimelinePhase
  endpointId: string | null
  dayId: string
  title: string
  clockLabel: string | null
  minutes: number | null
  sortOrder: number
  sequence: number
  placeId: string | null
  detailBookingId: string | null
  detailTransportId: string | null
  moveUp: boolean
  moveDown: boolean
}

export type FamilyDayTimelineDay = {
  dayId: string
  noteId: string | null
  pills: FamilyDayTimelineRowModel[]
  rows: FamilyDayTimelineRowModel[]
}

const SOURCE_RANK: Record<FamilyDayTimelineSource, number> = {
  schedule: 0,
  booking: 1,
  transport: 2,
}

const CARRIER = new Set(['flight', 'train', 'bus', 'ferry', 'cruise'])
const HOP = new Set(['bicycle', 'taxi', 'transit', 'transport_other'])

function recorded(value: string | null | undefined): string | null {
  const text = value?.trim()
  return text ? text : null
}

function civilPrefix(iso: string | null | undefined): string | null {
  const day = recorded(iso)?.slice(0, 10) ?? null
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

function clockParts(iso: string | null | undefined): { hhmm: string; anchor: boolean } | null {
  if (!iso || !iso.includes('T')) return null
  const hhmm = iso.slice(11, 16)
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null
  return { hhmm, anchor: hhmm === '00:00' }
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function bySequence<T extends { sequence: number }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item.sequence - b.item.sequence) || (a.index - b.index))
    .map(entry => entry.item)
}

function dayCivil(days: FamilyTripDay[], dayId: string | null | undefined): string | null {
  if (!dayId) return null
  return days.find(day => day.id === dayId)?.civilDay ?? null
}

function spineByCivil(days: FamilyTripDay[]): Map<string, FamilyTripDay> {
  const map = new Map<string, FamilyTripDay>()
  for (const day of [...days].sort((a, b) => a.dayIndex - b.dayIndex)) map.set(day.civilDay, day)
  return map
}

function rowKey(row: Pick<FamilyDayTimelineRowModel, 'source' | 'id' | 'phase' | 'endpointId' | 'dayId'>): string {
  return `${row.source}:${row.id}:${row.phase}:${row.endpointId ?? ''}:${row.dayId}`
}

type TimelineUnit = {
  rows: FamilyDayTimelineRowModel[]
  minutes: number | null
  sortOrder: number
  source: FamilyDayTimelineSource
  id: string
}

function unitAnchor(rows: FamilyDayTimelineRowModel[]): number | null {
  const ordered = [...rows].sort((a, b) => a.sequence - b.sequence || (a.key < b.key ? -1 : 1))
  return ordered.find(row => row.minutes != null)?.minutes ?? null
}

function sortRows(rows: FamilyDayTimelineRowModel[]): FamilyDayTimelineRowModel[] {
  const groups = new Map<string, FamilyDayTimelineRowModel[]>()
  const seen: string[] = []
  for (const row of rows) {
    const groupKey = row.source === 'transport' ? `transport:${row.id}:${row.dayId}` : row.key
    if (!groups.has(groupKey)) {
      groups.set(groupKey, [])
      seen.push(groupKey)
    }
    groups.get(groupKey)!.push(row)
  }
  const units: TimelineUnit[] = seen.map(groupKey => {
    const grouped = groups.get(groupKey)!
    const ordered = [...grouped].sort((a, b) => a.sequence - b.sequence || (a.key < b.key ? -1 : 1))
    return {
      rows: ordered,
      minutes: unitAnchor(ordered),
      sortOrder: ordered[0]?.sortOrder ?? 0,
      source: ordered[0]?.source ?? 'schedule',
      id: ordered[0]?.id ?? '',
    }
  })
  units.sort((a, b) => {
    const aTimed = a.minutes != null
    const bTimed = b.minutes != null
    if (aTimed !== bTimed) return aTimed ? -1 : 1
    if (a.minutes != null && b.minutes != null && a.minutes !== b.minutes) return a.minutes - b.minutes
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    if (SOURCE_RANK[a.source] !== SOURCE_RANK[b.source]) return SOURCE_RANK[a.source] - SOURCE_RANK[b.source]
    if (a.id !== b.id) return a.id < b.id ? -1 : 1
    return 0
  })
  return units.flatMap(unit => unit.rows)
}

function makeRow(partial: Omit<FamilyDayTimelineRowModel, 'key' | 'moveUp' | 'moveDown'>): FamilyDayTimelineRowModel {
  const row = { ...partial, key: '', moveUp: false, moveDown: false }
  row.key = rowKey(row)
  return row
}

function scheduleClock(item: FamilyScheduleItem): { minutes: number | null; label: string | null } {
  const clock = clockParts(item.startsAt)
  if (!clock || clock.anchor) return { minutes: null, label: null }
  const zone = recorded(item.timeZone)
  return {
    minutes: minutesOf(clock.hhmm),
    label: zone ? `${clock.hhmm} UTC · ${zone}` : `${clock.hhmm} UTC`,
  }
}

function civilClock(iso: string | null | undefined): { minutes: number | null; label: string | null } {
  const clock = clockParts(iso)
  if (!clock || clock.anchor) return { minutes: null, label: null }
  return { minutes: minutesOf(clock.hhmm), label: clock.hhmm }
}

function endpointClock(endpoint: FamilyTransportEndpoint): { minutes: number | null; label: string | null } {
  const raw = recorded(endpoint.localTime)
  if (!raw) return { minutes: null, label: null }
  const hhmm = raw.slice(0, 5)
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return { minutes: null, label: null }
  const zone = recorded(endpoint.timeZone)
  return { minutes: minutesOf(hhmm), label: zone ? `${hhmm} · ${zone}` : hhmm }
}

function bookingStart(reservation: FamilyTripReservation, days: FamilyTripDay[]): string | null {
  return civilPrefix(reservation.startsAt) ?? dayCivil(days, reservation.startTripDayId)
}

function bookingEnd(reservation: FamilyTripReservation, days: FamilyTripDay[]): string | null {
  return civilPrefix(reservation.endsAt) ?? dayCivil(days, reservation.endTripDayId)
}

function transportHeaderStart(reservation: FamilyTransportReservation, days: FamilyTripDay[]): string | null {
  const first = bySequence(reservation.endpoints)[0]
  return civilPrefix(reservation.startsAt) ?? recorded(first?.localDate) ?? dayCivil(days, reservation.startTripDayId)
}

function transportHeaderEnd(reservation: FamilyTransportReservation, days: FamilyTripDay[]): string | null {
  const ordered = bySequence(reservation.endpoints)
  const last = ordered[ordered.length - 1]
  return civilPrefix(reservation.endsAt) ?? recorded(last?.localDate) ?? dayCivil(days, reservation.endTripDayId)
}

function rolePhase(role: FamilyTransportEndpoint['role']): 'depart' | 'arrive' | 'stop' {
  if (role === 'to') return 'arrive'
  if (role === 'stop') return 'stop'
  return 'depart'
}

function endpointCivil(
  endpoint: FamilyTransportEndpoint,
  headerStart: string | null,
  headerEnd: string | null,
): string | null {
  const local = recorded(endpoint.localDate)
  if (local) return local
  if (endpoint.role === 'from') return headerStart
  if (endpoint.role === 'to') return headerEnd
  if (endpoint.role === 'stop' && headerStart && headerStart === headerEnd) return headerStart
  return null
}

function markMoves(rows: FamilyDayTimelineRowModel[]): FamilyDayTimelineRowModel[] {
  return rows.map((row, index) => {
    if (row.source !== 'schedule') return row
    return {
      ...row,
      moveUp: schedulePairMove(rows, row.id, -1) != null && index > 0,
      moveDown: schedulePairMove(rows, row.id, 1) != null && index < rows.length - 1,
    }
  })
}

export function schedulePairMove(
  rows: readonly FamilyDayTimelineRowModel[],
  scheduleId: string,
  direction: -1 | 1,
): { id: string; sortOrder: number }[] | null {
  const index = rows.findIndex(row => row.source === 'schedule' && row.id === scheduleId)
  if (index < 0) return null
  const neighbor = rows[index + direction]
  if (!neighbor || neighbor.source !== 'schedule') return null
  const current = rows[index]
  const swapped = sortRows(rows.map(row => {
    if (row.id === current.id && row.source === 'schedule') return { ...row, sortOrder: neighbor.sortOrder }
    if (row.id === neighbor.id && row.source === 'schedule') return { ...row, sortOrder: current.sortOrder }
    return row
  }))
  const before = rows.map(row => row.key)
  const after = swapped.map(row => row.key)
  const expected = before.slice()
  const pairIndex = index + direction
  if (pairIndex < 0 || pairIndex >= expected.length) return null
  ;[expected[index], expected[pairIndex]] = [expected[pairIndex], expected[index]]
  if (after.join('\n') !== expected.join('\n')) return null
  return [
    { id: current.id, sortOrder: neighbor.sortOrder },
    { id: neighbor.id, sortOrder: current.sortOrder },
  ]
}

export function projectFamilyDayTimeline(input: {
  days: FamilyTripDay[]
  scheduleItems: FamilyScheduleItem[]
  notes: FamilyDayNote[]
  bookings: FamilyTripReservation[]
  transports: FamilyTransportReservation[]
  placesById?: Map<string, FamilyTripPlace>
}): FamilyDayTimelineDay[] {
  const spine = spineByCivil(input.days)
  const notesByCivil = new Map(input.notes.map(note => [note.civilDay, note]))
  const buckets = new Map<string, FamilyDayTimelineRowModel[]>()
  const pills = new Map<string, FamilyDayTimelineRowModel[]>()
  const ensure = (dayId: string) => {
    const list = buckets.get(dayId) ?? []
    buckets.set(dayId, list)
    return list
  }

  const scheduleRows = new Map<string, FamilyDayTimelineRowModel>()
  for (const item of input.scheduleItems) {
    const civil = utcCivilDay(item.startsAt)
    const day = civil ? spine.get(civil) : undefined
    if (!day) continue
    const place = item.placeId ? input.placesById?.get(item.placeId) : undefined
    const clock = scheduleClock(item)
    const row = makeRow({
      source: 'schedule',
      id: item.id,
      phase: 'single',
      endpointId: null,
      dayId: day.id,
      title: place?.name || item.activity,
      clockLabel: clock.label,
      minutes: clock.minutes,
      sortOrder: item.sortOrder,
      sequence: 0,
      placeId: item.placeId,
      detailBookingId: null,
      detailTransportId: null,
    })
    ensure(day.id).push(row)
    scheduleRows.set(item.id, row)
  }

  const linkCandidates = new Map<string, FamilyTripReservation[]>()
  for (const booking of input.bookings) {
    if (!booking.scheduleItemId || !scheduleRows.has(booking.scheduleItemId)) continue
    const list = linkCandidates.get(booking.scheduleItemId) ?? []
    list.push(booking)
    linkCandidates.set(booking.scheduleItemId, list)
  }
  for (const [scheduleId, candidates] of linkCandidates) {
    const chosen = [...candidates].sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1))[0]
    const row = scheduleRows.get(scheduleId)
    if (row && chosen) row.detailBookingId = chosen.id
  }
  for (const booking of input.bookings) {
    if (booking.scheduleItemId && scheduleRows.has(booking.scheduleItemId)) {
      const linked = scheduleRows.get(booking.scheduleItemId)
      const start = bookingStart(booking, input.days)
      const day = start ? spine.get(start) : undefined
      if (linked && day && linked.dayId === day.id) continue
    }
    if (booking.type === 'hotel') {
      placeStay(
        booking,
        bookingStart(booking, input.days),
        bookingEnd(booking, input.days),
        civilClock(booking.startsAt),
        civilClock(booking.endsAt),
        null,
        null,
        spine,
        ensure,
        pills,
      )
      continue
    }
    const start = bookingStart(booking, input.days)
    const day = start ? spine.get(start) : undefined
    if (!day) continue
    const clock = civilClock(booking.startsAt)
    ensure(day.id).push(makeRow({
      source: 'booking',
      id: booking.id,
      phase: 'single',
      endpointId: null,
      dayId: day.id,
      title: booking.title,
      clockLabel: clock.label,
      minutes: clock.minutes,
      sortOrder: booking.sortOrder,
      sequence: 0,
      placeId: booking.placeId,
      detailBookingId: booking.id,
      detailTransportId: null,
    }))
  }

  for (const transport of input.transports) {
    if (transport.type === 'car') {
      const ordered = bySequence(transport.endpoints)
      const from = ordered.find(endpoint => endpoint.role === 'from')
      const to = ordered.find(endpoint => endpoint.role === 'to')
      placeStay(
        transport,
        transportHeaderStart(transport, input.days),
        transportHeaderEnd(transport, input.days),
        from ? endpointClock(from) : UNTIMED,
        to ? endpointClock(to) : UNTIMED,
        from?.id ?? null,
        to?.id ?? null,
        spine,
        ensure,
        pills,
        'transport',
      )
      continue
    }
    if (HOP.has(transport.type)) {
      placeHop(transport, input.days, spine, ensure)
      continue
    }
    if (CARRIER.has(transport.type)) {
      placeCarrier(transport, input.days, spine, ensure)
    }
  }

  return [...input.days]
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map(day => {
      const rows = markMoves(sortRows(buckets.get(day.id) ?? []))
      return {
        dayId: day.id,
        noteId: notesByCivil.get(day.civilDay)?.id ?? null,
        pills: pills.get(day.id) ?? [],
        rows,
      }
    })
}

type RecordedClock = { minutes: number | null; label: string | null }
const UNTIMED: RecordedClock = { minutes: null, label: null }

function placeStay(
  reservation: { id: string; title: string; sortOrder: number },
  start: string | null,
  end: string | null,
  startClock: RecordedClock,
  endClock: RecordedClock,
  startEndpointId: string | null,
  endEndpointId: string | null,
  spine: Map<string, FamilyTripDay>,
  ensure: (dayId: string) => FamilyDayTimelineRowModel[],
  pills: Map<string, FamilyDayTimelineRowModel[]>,
  source: 'booking' | 'transport' = 'booking',
): void {
  if (!start || !end) {
    if (start) pushBoundary(reservation, start, start === end ? 'single' : 'start', startClock, startEndpointId, spine, ensure, source)
    else if (end) pushBoundary(reservation, end, 'end', endClock, endEndpointId, spine, ensure, source)
    return
  }
  if (start === end) {
    pushBoundary(reservation, start, 'single', startClock, startEndpointId, spine, ensure, source)
    return
  }
  if (start < end) pushBoundary(reservation, start, 'start', startClock, startEndpointId, spine, ensure, source)
  if (end > start) pushBoundary(reservation, end, 'end', endClock, endEndpointId, spine, ensure, source)
  for (const [civil, day] of spine) {
    if (civil > start && civil < end) {
      const list = pills.get(day.id) ?? []
      list.push(makeRow({
        source,
        id: reservation.id,
        phase: 'pill',
        endpointId: null,
        dayId: day.id,
        title: reservation.title,
        clockLabel: null,
        minutes: null,
        sortOrder: reservation.sortOrder,
        sequence: 0,
        placeId: null,
        detailBookingId: source === 'booking' ? reservation.id : null,
        detailTransportId: source === 'transport' ? reservation.id : null,
      }))
      pills.set(day.id, list)
    }
  }
}

function pushBoundary(
  reservation: { id: string; title: string; sortOrder: number },
  civil: string,
  phase: 'single' | 'start' | 'end',
  clock: RecordedClock,
  endpointId: string | null,
  spine: Map<string, FamilyTripDay>,
  ensure: (dayId: string) => FamilyDayTimelineRowModel[],
  source: 'booking' | 'transport',
): void {
  const day = spine.get(civil)
  if (!day) return
  ensure(day.id).push(makeRow({
    source,
    id: reservation.id,
    phase,
    endpointId,
    dayId: day.id,
    title: reservation.title,
    clockLabel: clock.label,
    minutes: clock.minutes,
    sortOrder: reservation.sortOrder,
    sequence: 0,
    placeId: null,
    detailBookingId: source === 'booking' ? reservation.id : null,
    detailTransportId: source === 'transport' ? reservation.id : null,
  }))
}

function placeHop(
  transport: FamilyTransportReservation,
  days: FamilyTripDay[],
  spine: Map<string, FamilyTripDay>,
  ensure: (dayId: string) => FamilyDayTimelineRowModel[],
): void {
  const start = transportHeaderStart(transport, days)
  const end = transportHeaderEnd(transport, days)
  const ordered = bySequence(transport.endpoints)
  const from = ordered.find(endpoint => endpoint.role === 'from')
  const to = ordered.find(endpoint => endpoint.role === 'to')
  if (start && spine.has(start)) {
    const day = spine.get(start)!
    const phase = end && end > start ? 'depart' : 'single'
    const clock = from ? endpointClock(from) : UNTIMED
    ensure(day.id).push(transportHeaderRow(transport, day.id, phase, clock, from?.id ?? null))
  }
  if (end && start && end > start && spine.has(end)) {
    const day = spine.get(end)!
    const clock = to ? endpointClock(to) : UNTIMED
    ensure(day.id).push(transportHeaderRow(transport, day.id, 'arrive', clock, to?.id ?? null))
  }
}

function placeCarrier(
  transport: FamilyTransportReservation,
  days: FamilyTripDay[],
  spine: Map<string, FamilyTripDay>,
  ensure: (dayId: string) => FamilyDayTimelineRowModel[],
): void {
  const headerStart = transportHeaderStart(transport, days)
  const headerEnd = transportHeaderEnd(transport, days)
  const ordered = bySequence(transport.endpoints)
    if (ordered.length === 0) {
    if (headerStart && spine.has(headerStart)) {
      ensure(spine.get(headerStart)!.id).push(transportHeaderRow(transport, spine.get(headerStart)!.id, 'depart', UNTIMED, null))
    }
    if (headerEnd && headerStart && headerEnd !== headerStart && spine.has(headerEnd)) {
      ensure(spine.get(headerEnd)!.id).push(transportHeaderRow(transport, spine.get(headerEnd)!.id, 'arrive', UNTIMED, null))
    }
    return
  }
  ordered.forEach((endpoint, sequence) => {
    const phase = rolePhase(endpoint.role)
    const civil = endpointCivil(endpoint, headerStart, headerEnd)
    const day = civil ? spine.get(civil) : undefined
    if (!day) return
    const clock = endpointClock(endpoint)
    const name = recorded(endpoint.code) ?? recorded(endpoint.name)
    ensure(day.id).push(makeRow({
      source: 'transport',
      id: transport.id,
      phase,
      endpointId: endpoint.id,
      dayId: day.id,
      title: name ? `${transport.title} · ${name}` : transport.title,
      clockLabel: clock.label,
      minutes: clock.minutes,
      sortOrder: transport.sortOrder,
      sequence,
      placeId: endpoint.placeId,
      detailBookingId: null,
      detailTransportId: transport.id,
    }))
  })
}

function transportHeaderRow(
  transport: FamilyTransportReservation,
  dayId: string,
  phase: 'depart' | 'arrive' | 'single',
  clock: RecordedClock,
  endpointId: string | null,
): FamilyDayTimelineRowModel {
  return makeRow({
    source: 'transport',
    id: transport.id,
    phase,
    endpointId,
    dayId,
    title: transport.title,
    clockLabel: clock.label,
    minutes: clock.minutes,
    sortOrder: transport.sortOrder,
    sequence: phase === 'arrive' ? 1 : 0,
    placeId: null,
    detailBookingId: null,
    detailTransportId: transport.id,
  })
}
