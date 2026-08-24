import type { FamilyPerson } from '../../data/supabase/familyRoster'
import type {
  HolidaysMap,
  VacayEntry,
  VacayHolidayCalendar,
  VacayPlan,
  VacayStat,
  VacayUser,
} from '../../types'

/** Match iOS `AppColors.personPalette` (sRGB 0–1 → #RRGGBB). Display-only; do not seed `people.color`. */
export const VACAY_PERSON_PALETTE = [
  '#4F45E6', '#38B36B', '#D97333', '#DB3370', '#3394DB', '#A16BDB',
] as const

export const DEFAULT_VACAY_COLOR = VACAY_PERSON_PALETTE[0]

export function vacayColorForPerson(stored: string | null | undefined, index: number): string {
  const hex = stored?.trim()
  if (hex) return hex
  return VACAY_PERSON_PALETTE[index % VACAY_PERSON_PALETTE.length]
}

export type CalendarEntryKind = 'away' | 'school_break'

export type FamilyCalendarSettings = {
  familyId: string
  blockWeekends: boolean
  weekendDays: string
  weekStart: number
  holidaysEnabled: boolean
  familyDaysEnabled: boolean
  carryOverEnabled: boolean
  visibleYears: number[]
}

export type VacayTripWindow = {
  tripId: string
  name: string
  startDate: string
  endDate: string
  overlay: 'approved' | 'proposed'
  travelerIds: string[]
}

export type NagerHoliday = {
  date: string
  name: string
  localName: string
  global?: boolean
  counties?: string[] | null
}

export function defaultFamilyCalendarSettings(familyId: string): FamilyCalendarSettings {
  return {
    familyId,
    blockWeekends: true,
    weekendDays: '0,6',
    weekStart: 1,
    holidaysEnabled: false,
    familyDaysEnabled: true,
    carryOverEnabled: true,
    visibleYears: [],
  }
}

/** Empty persisted array → show the current year (client; no write). */
export function resolveVisibleYears(stored: number[] | null | undefined, currentYear: number): number[] {
  if (!stored || stored.length === 0) return [currentYear]
  const years = [...new Set(stored.filter(y => Number.isFinite(y)))].sort((a, b) => a - b)
  return years.length > 0 ? years : [currentYear]
}

/** Keep the header year inside `years`. Prefer civil current year, else the max. */
export function clampVisibleYear(years: number[], selected: number, currentYear: number): number {
  const resolved = years.length > 0
    ? [...new Set(years.filter(y => Number.isFinite(y)))].sort((a, b) => a - b)
    : [currentYear]
  if (resolved.includes(selected)) return selected
  if (resolved.includes(currentYear)) return currentYear
  return resolved[resolved.length - 1] ?? currentYear
}

/** Previous/next year in the sorted visible list. Null if `selected` is missing or at the end. */
export function adjacentVisibleYear(years: number[], selected: number, delta: -1 | 1): number | null {
  const sorted = [...new Set(years.filter(y => Number.isFinite(y)))].sort((a, b) => a - b)
  const idx = sorted.indexOf(selected)
  if (idx < 0) return null
  return sorted[idx + delta] ?? null
}

export type PersonDayKinds = { away: boolean; school: boolean }

export function personKindsOnDate(
  entries: VacayEntry[],
  personId: string | number | null | undefined,
  date: string,
): PersonDayKinds {
  const id = personId == null ? '' : String(personId)
  const kinds: PersonDayKinds = { away: false, school: false }
  if (!id) return kinds
  for (const e of entries) {
    if (String(e.user_id) !== id || e.date !== date) continue
    if (e.kind === 'school_break') kinds.school = true
    else kinds.away = true
  }
  return kinds
}

export function resolvePersonPaintClick(
  mode: 'away' | 'school',
  kinds: PersonDayKinds,
): 'toggle' | 'blocked-other-kind' {
  if (mode === 'away' && kinds.school && !kinds.away) return 'blocked-other-kind'
  if (mode === 'school' && kinds.away && !kinds.school) return 'blocked-other-kind'
  return 'toggle'
}

export function cellHasSchoolBreak(entries: VacayEntry[]): boolean {
  return entries.some(e => e.kind === 'school_break')
}

export function rosterToVacayUsers(people: FamilyPerson[]): VacayUser[] {
  return people.map((p, i) => ({
    id: p.personId,
    username: p.displayName,
    color: vacayColorForPerson(p.color, i),
  }))
}

export function settingsToVacayPlan(
  settings: FamilyCalendarSettings,
  calendars: VacayHolidayCalendar[],
): VacayPlan {
  return {
    id: settings.familyId,
    holidays_enabled: settings.holidaysEnabled,
    holidays_region: null,
    holiday_calendars: calendars,
    block_weekends: settings.blockWeekends,
    carry_over_enabled: settings.carryOverEnabled,
    company_holidays_enabled: settings.familyDaysEnabled,
    weekend_days: settings.weekendDays,
    week_start: settings.weekStart,
  }
}

/** Inclusive civil YYYY-MM-DD list clipped to `year` (UTC, hubDay-style). */
export function civilDatesInYear(start: string | null | undefined, end: string | null | undefined, year: number): string[] {
  if (!start || !end) return []
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  const clipStart = start > yearStart ? start : yearStart
  const clipEnd = end < yearEnd ? end : yearEnd
  if (clipEnd < clipStart) return []
  const a = Date.parse(`${clipStart}T00:00:00.000Z`)
  const b = Date.parse(`${clipEnd}T00:00:00.000Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return []
  const out: string[] = []
  for (let t = a; t <= b; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

export function tripOverlayKind(tripId: string, proposedIds: Iterable<string>): 'approved' | 'proposed' {
  const set = proposedIds instanceof Set ? proposedIds : new Set(proposedIds)
  return set.has(tripId) ? 'proposed' : 'approved'
}

/** Expand a window’s range into the selected year only. */
export function windowDatesInYear(window: VacayTripWindow, year: number): string[] {
  return civilDatesInYear(window.startDate, window.endDate, year)
}

export function collectTripDateSets(windows: VacayTripWindow[], year: number): {
  approvedTripDates: Set<string>
  proposedTripDates: Set<string>
} {
  const approvedTripDates = new Set<string>()
  const proposedTripDates = new Set<string>()
  for (const w of windows) {
    const target = w.overlay === 'proposed' ? proposedTripDates : approvedTripDates
    for (const d of windowDatesInYear(w, year)) target.add(d)
  }
  return { approvedTripDates, proposedTripDates }
}

export function nextYearCarry(entitled: number, carriedOver: number, used: number): number {
  return Math.max(0, entitled + carriedOver - used)
}

export function countAwayDays(entries: VacayEntry[], personId: string | number, year: number): number {
  const prefix = `${year}-`
  const id = String(personId)
  let n = 0
  for (const e of entries) {
    if (String(e.user_id) !== id) continue
    if (!e.date.startsWith(prefix)) continue
    if ((e.kind ?? 'away') !== 'away') continue
    n += 1
  }
  return n
}

export type PtoYearRow = {
  personId: string
  year: number
  entitledDays: number
  carriedOver: number
}

export function buildPtoStats(opts: {
  users: VacayUser[]
  entries: VacayEntry[]
  ptoRows: PtoYearRow[]
  year: number
  carryOverEnabled: boolean
}): VacayStat[] {
  const byPerson = new Map<string, PtoYearRow>()
  for (const row of opts.ptoRows) {
    if (row.year !== opts.year) continue
    byPerson.set(row.personId, row)
  }
  return opts.users.map(u => {
    const row = byPerson.get(String(u.id))
    const vacation_days = row?.entitledDays ?? 30
    const carried_over = opts.carryOverEnabled ? (row?.carriedOver ?? 0) : 0
    const used = countAwayDays(opts.entries, u.id, opts.year)
    const total_available = vacation_days + carried_over
    return {
      user_id: u.id,
      person_name: u.username,
      person_color: u.color || DEFAULT_VACAY_COLOR,
      year: opts.year,
      vacation_days,
      carried_over,
      total_available,
      used,
      remaining: total_available - used,
    }
  })
}

/** One color tile per person when away + school_break both exist. Nest entries have no kind. */
export function entriesForCellFill(entries: VacayEntry[]): VacayEntry[] {
  if (!entries.some(e => e.kind)) return entries
  const seen = new Set<string>()
  const out: VacayEntry[] = []
  for (const e of entries) {
    const k = String(e.user_id)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  return out
}

export function buildHolidaysMap(
  calendars: VacayHolidayCalendar[],
  holidaysByCountry: Record<string, NagerHoliday[]>,
): HolidaysMap {
  const map: HolidaysMap = {}
  for (const cal of calendars) {
    const country = cal.region.split('-')[0]
    const region = cal.region.includes('-') ? cal.region : null
    const data = holidaysByCountry[country] ?? []
    const hasRegions = data.some(h => h.counties && h.counties.length > 0)
    if (hasRegions && !region) continue
    for (const h of data) {
      if (h.global || !h.counties || (region && h.counties.includes(region))) {
        if (!map[h.date]) {
          map[h.date] = { name: h.name, localName: h.localName, color: cal.color, label: cal.label }
        }
      }
    }
  }
  return map
}

export function tripsOnDate(windows: VacayTripWindow[], date: string): VacayTripWindow[] {
  return windows.filter(w => date >= w.startDate && date <= w.endDate)
}

export function travelerHasAway(entries: VacayEntry[], personId: string, date: string): boolean {
  return entries.some(e => String(e.user_id) === personId && e.date === date && (e.kind ?? 'away') === 'away')
}

export type VacayOverlayMode = 'add' | 'request'

export type VacayAccessRequest = {
  id: string
  granteePersonId: string
  granteeName: string
  scope: 'person' | 'branch'
  targetPersonId: string | null
  targetBranchId: string | null
  targetName: string
  status: 'pending' | 'approved' | 'denied' | 'revoked'
}

export type VacayOverlayPreset = {
  id: string
  name: string
  enabled: boolean
  personIds: string[]
}

export function vacayOverlayMode(role: string | null | undefined, isSuperAdmin: boolean): VacayOverlayMode {
  if (isSuperAdmin) return 'add'
  return role === 'patriarch' || role === 'parent' ? 'add' : 'request'
}

/** `{ you } ∪ extra people ∪ members of enabled traveler-preset overlays`. */
export function visiblePersonIdSet(opts: {
  currentPersonId: string
  extraPersonIds: readonly string[]
  enabledBranchMemberIds: readonly (readonly string[])[]
}): string[] {
  const ids = new Set<string>()
  const self = opts.currentPersonId.trim()
  if (self) ids.add(self)
  for (const id of opts.extraPersonIds) {
    if (id) ids.add(id)
  }
  for (const group of opts.enabledBranchMemberIds) {
    for (const id of group) {
      if (id) ids.add(id)
    }
  }
  return [...ids]
}

export function intersectVisibleWithViewable(
  visibleIds: readonly string[],
  viewableIds: readonly string[],
  currentPersonId: string,
): string[] {
  const viewable = new Set(viewableIds.map(String))
  return visibleIds.filter(id => id === currentPersonId || viewable.has(id))
}

/** Paint targets are you + Add Individual rows — never Household/Family toggles. */
export function paintablePersonIds(currentPersonId: string, extraPersonIds: readonly string[]): string[] {
  const ids: string[] = []
  if (currentPersonId) ids.push(currentPersonId)
  for (const id of extraPersonIds) {
    if (id && id !== currentPersonId && !ids.includes(id)) ids.push(id)
  }
  return ids
}

export function clampPaintTarget(
  selectedId: string | number | null | undefined,
  currentPersonId: string,
  allowedIds: readonly string[],
): string {
  const allowed = new Set(allowedIds.map(String))
  const selected = selectedId == null ? '' : String(selectedId)
  if (selected && allowed.has(selected)) return selected
  return currentPersonId
}

export function filterTripWindowsForOverlay(
  windows: VacayTripWindow[],
  visibleIds: readonly string[],
): VacayTripWindow[] {
  const set = new Set(visibleIds.map(String))
  if (set.size === 0) return []
  return windows.filter(w => w.travelerIds.some(id => set.has(id)))
}

export function orderVisibleUsers(users: VacayUser[], currentPersonId: string): VacayUser[] {
  const you = users.filter(u => String(u.id) === currentPersonId)
  const rest = users.filter(u => String(u.id) !== currentPersonId)
  return [...you, ...rest]
}
