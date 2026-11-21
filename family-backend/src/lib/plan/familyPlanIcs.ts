import type { FamilyDayNote } from '../../data/supabase/dayNotes'
import type { FamilyScheduleItem } from '../../data/supabase/scheduleItems'
import { civilDayToUtcMidnightIso } from '../../data/supabase/scheduleItems'
import type { FamilyTripDay } from '../../data/supabase/tripDays'
import type { FamilyTripPlace } from '../../data/supabase/tripPlaces'

const HOUR_MS = 60 * 60 * 1000

export type FamilyPlanExportInput = {
  tripTitle: string
  days: FamilyTripDay[]
  itemsByDayId: Map<string, FamilyScheduleItem[]>
  placesById: Map<string, FamilyTripPlace>
  notesByCivilDay?: Map<string, FamilyDayNote>
}

/** ICS text-value escape (RFC 5545). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
}

export function sanitizePlanFilename(name: string): string {
  const allowed = /[a-zA-Z0-9\s]/
  const cleaned = [...name].map(ch => (allowed.test(ch) ? ch : '-')).join('')
  const dashed = cleaned.replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return dashed || 'trip'
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** UTC `yyyyMMdd'T'HHmmss'Z'` like iOS TripPlanICSExporter. */
export function formatIcsUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  )
}

function startForItem(item: FamilyScheduleItem, day: FamilyTripDay): Date {
  if (item.startsAt) {
    const d = new Date(item.startsAt)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date(civilDayToUtcMidnightIso(day.civilDay))
}

function endForItem(item: FamilyScheduleItem, start: Date): Date {
  if (item.endsAt) {
    const d = new Date(item.endsAt)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date(start.getTime() + HOUR_MS)
}

function locationForItem(item: FamilyScheduleItem): string | null {
  const fromItem = item.address?.trim()
  return fromItem || null
}

export function familyPlanIcsFilename(tripTitle: string): string {
  return `${sanitizePlanFilename(tripTitle)}-plan.ics`
}

/** Build a VCALENDAR body from Family plan rows (iOS TripPlanICSExporter parity). */
export function buildFamilyPlanIcs(input: FamilyPlanExportInput): string {
  const sortedDays = [...input.days].sort((a, b) => a.dayIndex - b.dayIndex)
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FamilyTravelApp//Plan//EN',
    'CALSCALE:GREGORIAN',
  ]
  const stamp = formatIcsUtc(new Date())

  for (const day of sortedDays) {
    const items = input.itemsByDayId.get(day.id) ?? []
    for (const item of items) {
      const start = startForItem(item, day)
      const end = endForItem(item, start)
      lines.push('BEGIN:VEVENT')
      lines.push(`UID:${item.id}@familytravel`)
      lines.push(`DTSTAMP:${stamp}`)
      lines.push(`DTSTART:${formatIcsUtc(start)}`)
      lines.push(`DTEND:${formatIcsUtc(end)}`)
      lines.push(`SUMMARY:${escapeIcsText(item.activity)}`)
      const location = locationForItem(item)
      if (location) lines.push(`LOCATION:${escapeIcsText(location)}`)
      lines.push('END:VEVENT')
    }
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadFamilyPlanIcs(input: FamilyPlanExportInput): void {
  const body = buildFamilyPlanIcs(input)
  const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = familyPlanIcsFilename(input.tripTitle)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
