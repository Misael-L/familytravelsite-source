import { getSupabaseBrowserClient } from './client'
import { listFamilyPeople, listFamilyPeopleByIds, listTravelerPresetBranches } from './familyRoster'
import { listOpenTripProposals } from './tripProposals'
import { listHubTripTravelers } from './tripTravelers'
import { toDateOnly } from '../../pages/dashboard/familyDashboardModel'
import {
  type CalendarEntryKind,
  type FamilyCalendarSettings,
  type PtoYearRow,
  type VacayAccessRequest,
  type VacayOverlayPreset,
  type VacayTripWindow,
  defaultFamilyCalendarSettings,
  filterTripWindowsForOverlay,
  intersectVisibleWithViewable,
  orderVisibleUsers,
  paintablePersonIds,
  rosterToVacayUsers,
  settingsToVacayPlan,
  tripOverlayKind,
  visiblePersonIdSet,
} from '../../pages/vacay/vacayModel'
import type { VacayEntry, VacayHolidayCalendar, VacayPlan, VacayUser } from '../../types'

export type { FamilyCalendarSettings, PtoYearRow, VacayTripWindow }

type SettingsRow = {
  family_id: string
  block_weekends: boolean | null
  weekend_days: string | null
  week_start: number | null
  holidays_enabled: boolean | null
  family_days_enabled: boolean | null
  carry_over_enabled: boolean | null
  visible_years: number[] | null
}

type HolidayCalendarRow = {
  id: string
  family_id: string
  region: string
  label: string | null
  color: string | null
  sort_order: number | null
}

type EntryRow = {
  id: string
  family_id: string
  person_id: string
  entry_date: string
  kind: string | null
  note: string | null
}

type BlockedRow = {
  id: string
  family_id: string
  entry_date: string
  note: string | null
}

type PtoRow = {
  family_id: string
  person_id: string
  year: number
  entitled_days: number | null
  carried_over: number | null
}

type TripWindowRow = {
  id: string
  name: string | null
  start_at: string | null
  end_at: string | null
  status: string | null
}

function denied(): Error {
  return Object.assign(new Error('permission denied'), { code: '42501' })
}

function mapSettings(familyId: string, row: SettingsRow | null): FamilyCalendarSettings {
  if (!row) return defaultFamilyCalendarSettings(familyId)
  return {
    familyId,
    blockWeekends: row.block_weekends !== false,
    weekendDays: row.weekend_days || '0,6',
    weekStart: row.week_start === 0 ? 0 : 1,
    holidaysEnabled: !!row.holidays_enabled,
    familyDaysEnabled: row.family_days_enabled !== false,
    carryOverEnabled: row.carry_over_enabled !== false,
    visibleYears: Array.isArray(row.visible_years) ? row.visible_years : [],
  }
}

function mapHolidayCalendar(row: HolidayCalendarRow): VacayHolidayCalendar {
  return {
    id: row.id,
    plan_id: row.family_id,
    region: row.region,
    label: row.label,
    color: row.color || '#fecaca',
    sort_order: row.sort_order ?? 0,
  }
}

export async function fetchCalendarSettings(familyId: string): Promise<FamilyCalendarSettings> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('family_calendar_settings')
    .select('family_id,block_weekends,weekend_days,week_start,holidays_enabled,family_days_enabled,carry_over_enabled,visible_years')
    .eq('family_id', familyId)
    .maybeSingle()
  if (error) throw error
  return mapSettings(familyId, (data ?? null) as SettingsRow | null)
}

export async function upsertCalendarSettings(
  familyId: string,
  patch: Partial<Omit<FamilyCalendarSettings, 'familyId'>>,
): Promise<FamilyCalendarSettings> {
  const current = await fetchCalendarSettings(familyId)
  const next: FamilyCalendarSettings = { ...current, ...patch, familyId }
  const { data, error } = await getSupabaseBrowserClient()
    .from('family_calendar_settings')
    .upsert({
      family_id: familyId,
      block_weekends: next.blockWeekends,
      weekend_days: next.weekendDays,
      week_start: next.weekStart,
      holidays_enabled: next.holidaysEnabled,
      family_days_enabled: next.familyDaysEnabled,
      carry_over_enabled: next.carryOverEnabled,
      visible_years: next.visibleYears,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'family_id' })
    .select('family_id,block_weekends,weekend_days,week_start,holidays_enabled,family_days_enabled,carry_over_enabled,visible_years')
  if (error) throw error
  const row = (data ?? [])[0] as SettingsRow | undefined
  if (!row) throw denied()
  return mapSettings(familyId, row)
}

export async function listHolidayCalendars(familyId: string): Promise<VacayHolidayCalendar[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('family_holiday_calendars')
    .select('id,family_id,region,label,color,sort_order')
    .eq('family_id', familyId)
    .order('sort_order')
  if (error) throw error
  return ((data ?? []) as HolidayCalendarRow[]).map(mapHolidayCalendar)
}

/** `family_holiday_calendars.label` is NOT NULL — never persist empty/null. */
export function holidayCalendarLabel(label: string | null | undefined, region: string): string {
  return label?.trim() || region
}

export async function insertHolidayCalendar(
  familyId: string,
  input: { region: string; color?: string; label?: string | null },
): Promise<VacayHolidayCalendar> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('family_holiday_calendars')
    .insert({
      family_id: familyId,
      region: input.region,
      color: input.color ?? '#fecaca',
      label: holidayCalendarLabel(input.label, input.region),
      sort_order: 0,
    })
    .select('id,family_id,region,label,color,sort_order')
  if (error) throw error
  const row = (data ?? [])[0] as HolidayCalendarRow | undefined
  if (!row) throw denied()
  return mapHolidayCalendar(row)
}

export async function updateHolidayCalendarRow(
  id: string,
  patch: { region?: string; color?: string; label?: string | null },
): Promise<VacayHolidayCalendar> {
  const next: { region?: string; color?: string; label?: string } = {}
  if (patch.region !== undefined) next.region = patch.region
  if (patch.color !== undefined) next.color = patch.color
  if ('label' in patch) {
    const resolved = holidayCalendarLabel(patch.label, patch.region ?? '')
    if (resolved) next.label = resolved
  }
  const { data, error } = await getSupabaseBrowserClient()
    .from('family_holiday_calendars')
    .update(next)
    .eq('id', id)
    .select('id,family_id,region,label,color,sort_order')
  if (error) throw error
  const row = (data ?? [])[0] as HolidayCalendarRow | undefined
  if (!row) throw denied()
  return mapHolidayCalendar(row)
}

export async function deleteHolidayCalendarRow(id: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .from('family_holiday_calendars')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function listCalendarEntries(
  familyId: string,
  year: number,
  personIds?: string[],
): Promise<VacayEntry[]> {
  if (personIds && personIds.length === 0) return []
  let query = getSupabaseBrowserClient()
    .from('family_calendar_entries')
    .select('id,family_id,person_id,entry_date,kind,note')
    .eq('family_id', familyId)
    .gte('entry_date', `${year}-01-01`)
    .lte('entry_date', `${year}-12-31`)
  if (personIds) query = query.in('person_id', personIds)
  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as EntryRow[]).map(row => ({
    date: row.entry_date,
    user_id: row.person_id,
    plan_id: row.family_id,
    kind: row.kind === 'school_break' ? 'school_break' : 'away',
  }))
}

export async function toggleCalendarEntry(opts: {
  familyId: string
  personId: string
  date: string
  kind: CalendarEntryKind
}): Promise<'inserted' | 'deleted'> {
  const sb = getSupabaseBrowserClient()
  const { data, error } = await sb
    .from('family_calendar_entries')
    .select('id')
    .eq('person_id', opts.personId)
    .eq('entry_date', opts.date)
    .eq('kind', opts.kind)
  if (error) throw error
  const existing = (data ?? [])[0] as { id: string } | undefined
  if (existing?.id) {
    const { error: delErr } = await sb.from('family_calendar_entries').delete().eq('id', existing.id)
    if (delErr) throw delErr
    return 'deleted'
  }
  const { error: insErr } = await sb.from('family_calendar_entries').insert({
    family_id: opts.familyId,
    person_id: opts.personId,
    entry_date: opts.date,
    kind: opts.kind,
  })
  if (insErr) throw insErr
  return 'inserted'
}

export async function listBlockedDates(familyId: string, year: number): Promise<{ date: string; note?: string }[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('family_blocked_dates')
    .select('id,family_id,entry_date,note')
    .eq('family_id', familyId)
    .gte('entry_date', `${year}-01-01`)
    .lte('entry_date', `${year}-12-31`)
  if (error) throw error
  return ((data ?? []) as BlockedRow[]).map(row => ({
    date: row.entry_date,
    note: row.note ?? undefined,
  }))
}

export async function toggleBlockedDate(familyId: string, date: string): Promise<'inserted' | 'deleted'> {
  const sb = getSupabaseBrowserClient()
  const { data, error } = await sb
    .from('family_blocked_dates')
    .select('id')
    .eq('family_id', familyId)
    .eq('entry_date', date)
  if (error) throw error
  const existing = (data ?? [])[0] as { id: string } | undefined
  if (existing?.id) {
    const { error: delErr } = await sb.from('family_blocked_dates').delete().eq('id', existing.id)
    if (delErr) throw delErr
    return 'deleted'
  }
  const { error: insErr } = await sb.from('family_blocked_dates').insert({
    family_id: familyId,
    entry_date: date,
  })
  if (insErr) throw insErr
  return 'inserted'
}

export async function listPtoYears(
  familyId: string,
  years: number[],
  personIds?: string[],
): Promise<PtoYearRow[]> {
  if (years.length === 0) return []
  if (personIds && personIds.length === 0) return []
  let query = getSupabaseBrowserClient()
    .from('family_pto_years')
    .select('family_id,person_id,year,entitled_days,carried_over')
    .eq('family_id', familyId)
    .in('year', years)
  if (personIds) query = query.in('person_id', personIds)
  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as PtoRow[]).map(row => ({
    personId: row.person_id,
    year: row.year,
    entitledDays: row.entitled_days ?? 30,
    carriedOver: row.carried_over ?? 0,
  }))
}

export async function upsertPtoYear(opts: {
  familyId: string
  personId: string
  year: number
  entitledDays: number
  carriedOver: number
}): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .from('family_pto_years')
    .upsert({
      family_id: opts.familyId,
      person_id: opts.personId,
      year: opts.year,
      entitled_days: opts.entitledDays,
      carried_over: opts.carriedOver,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'person_id,year' })
  if (error) throw error
}

export async function zeroPtoCarryOver(familyId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .from('family_pto_years')
    .update({ carried_over: 0, updated_at: new Date().toISOString() })
    .eq('family_id', familyId)
  if (error) throw error
}

export async function updatePersonColor(personId: string, color: string): Promise<void> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('people')
    .update({ color })
    .eq('id', personId)
    .select('id')
  if (error) throw error
  if (!(data ?? [])[0]) throw denied()
}

export async function loadVacayTripWindows(familyId: string): Promise<VacayTripWindow[]> {
  const sb = getSupabaseBrowserClient()
  const { data, error } = await sb
    .from('trips')
    .select('id,name,start_at,end_at,status')
    .eq('family_id', familyId)
    .neq('status', 'cancelled')
    .not('start_at', 'is', null)
  if (error) throw error
  const trips = ((data ?? []) as TripWindowRow[]).filter(row => toDateOnly(row.start_at) && toDateOnly(row.end_at))
  if (trips.length === 0) return []

  let proposedIds = new Set<string>()
  try {
    const open = await listOpenTripProposals(familyId)
    proposedIds = new Set(open.map(p => p.tripId))
  } catch {
    proposedIds = new Set()
  }

  let travelersByTrip = new Map<string, string[]>()
  try {
    const travelers = await listHubTripTravelers(trips.map(t => t.id))
    for (const row of travelers) {
      const list = travelersByTrip.get(row.tripId) ?? []
      list.push(row.personId)
      travelersByTrip.set(row.tripId, list)
    }
  } catch {
    travelersByTrip = new Map()
  }

  return trips.map(row => ({
    tripId: row.id,
    name: row.name?.trim() || 'Trip',
    startDate: toDateOnly(row.start_at) as string,
    endDate: toDateOnly(row.end_at) as string,
    overlay: tripOverlayKind(row.id, proposedIds),
    travelerIds: travelersByTrip.get(row.id) ?? [],
  }))
}

export type FamilyVacayYearLoad = {
  settings: FamilyCalendarSettings
  plan: VacayPlan
  users: VacayUser[]
  entries: VacayEntry[]
  blockedDates: { date: string; note?: string }[]
  ptoRows: PtoYearRow[]
  tripWindows: VacayTripWindow[]
  overlay: VacayOverlayLoad
}

export type VacayOverlayLoad = {
  extraPersonIds: string[]
  extraPeople: VacayUser[]
  presets: VacayOverlayPreset[]
  pendingOutgoing: VacayAccessRequest[]
  incomingPending: VacayAccessRequest[]
  viewablePersonIds: string[]
  visiblePersonIds: string[]
  paintablePersonIds: string[]
}

export type VacayPickerOption = {
  value: string
  label: string
}

export function emptyVacayOverlay(currentPersonId = ''): VacayOverlayLoad {
  return {
    extraPersonIds: [],
    extraPeople: [],
    presets: [],
    pendingOutgoing: [],
    incomingPending: [],
    viewablePersonIds: currentPersonId ? [currentPersonId] : [],
    visiblePersonIds: currentPersonId ? [currentPersonId] : [],
    paintablePersonIds: currentPersonId ? [currentPersonId] : [],
  }
}

type OverlayPersonRow = { target_person_id: string | null }
type OverlayBranchRow = { branch_id: string | null }
type AccessRow = {
  id: string
  family_id: string
  grantee_person_id: string
  scope: string
  target_person_id: string | null
  target_branch_id: string | null
  status: string
}

async function rpcRows<T>(name: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await getSupabaseBrowserClient().rpc(name, args)
  if (error) throw error
  return (data ?? []) as T[]
}

export async function listViewablePersonIds(familyId: string): Promise<string[]> {
  const rows = await rpcRows<{ person_id: string }>('list_viewable_person_ids', { p_family_id: familyId })
  return rows.map(r => r.person_id).filter(Boolean)
}

export async function listOverlayableBranchIds(familyId: string): Promise<string[]> {
  const rows = await rpcRows<{ branch_id: string }>('list_overlayable_branch_ids', { p_family_id: familyId })
  return rows.map(r => r.branch_id).filter(Boolean)
}

export async function listOverlayPeople(viewerPersonId: string): Promise<string[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('person_vacay_overlay_people')
    .select('target_person_id')
    .eq('viewer_person_id', viewerPersonId)
  if (error) throw error
  return ((data ?? []) as OverlayPersonRow[]).map(r => r.target_person_id).filter((id): id is string => !!id)
}

export async function listOverlayBranches(viewerPersonId: string): Promise<string[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('person_vacay_overlay_branches')
    .select('branch_id')
    .eq('viewer_person_id', viewerPersonId)
  if (error) throw error
  return ((data ?? []) as OverlayBranchRow[]).map(r => r.branch_id).filter((id): id is string => !!id)
}

export async function listCalendarAccessRows(familyId: string): Promise<AccessRow[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('person_calendar_access')
    .select('id,family_id,grantee_person_id,scope,target_person_id,target_branch_id,status')
    .eq('family_id', familyId)
    .in('status', ['pending', 'approved'])
  if (error) throw error
  return (data ?? []) as AccessRow[]
}

export async function addOverlayPerson(viewerPersonId: string, targetPersonId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .from('person_vacay_overlay_people')
    .insert({ viewer_person_id: viewerPersonId, target_person_id: targetPersonId })
  if (error) throw error
}

export async function removeOverlayPerson(viewerPersonId: string, targetPersonId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .from('person_vacay_overlay_people')
    .delete()
    .eq('viewer_person_id', viewerPersonId)
    .eq('target_person_id', targetPersonId)
  if (error) throw error
}

export async function setOverlayBranch(
  viewerPersonId: string,
  branchId: string,
  enabled: boolean,
): Promise<void> {
  const sb = getSupabaseBrowserClient()
  if (enabled) {
    const { error } = await sb
      .from('person_vacay_overlay_branches')
      .upsert(
        { viewer_person_id: viewerPersonId, branch_id: branchId },
        { onConflict: 'viewer_person_id,branch_id' },
      )
    if (error) throw error
    return
  }
  const { error } = await sb
    .from('person_vacay_overlay_branches')
    .delete()
    .eq('viewer_person_id', viewerPersonId)
    .eq('branch_id', branchId)
  if (error) throw error
}

export async function requestCalendarAccess(opts: {
  targetPersonId?: string | null
  targetBranchId?: string | null
}): Promise<string> {
  const { data, error } = await getSupabaseBrowserClient().rpc('request_calendar_access', {
    p_target_person_id: opts.targetPersonId ?? null,
    p_target_branch_id: opts.targetBranchId ?? null,
  })
  if (error) throw error
  return String(data)
}

export async function decideCalendarAccess(id: string, approve: boolean): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('decide_calendar_access', {
    p_id: id,
    p_approve: approve,
  })
  if (error) throw error
}

export async function revokeCalendarAccess(id: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('revoke_calendar_access', { p_id: id })
  if (error) throw error
}

export async function listAddableOverlayPeople(opts: {
  familyId: string
  viewerPersonId: string
  extraPersonIds: string[]
}): Promise<VacayPickerOption[]> {
  const viewable = await listViewablePersonIds(opts.familyId)
  const skip = new Set([opts.viewerPersonId, ...opts.extraPersonIds])
  const ids = viewable.filter(id => !skip.has(id))
  const people = await listFamilyPeopleByIds(opts.familyId, ids)
  return people.map(p => ({ value: p.personId, label: p.displayName }))
}

export async function listRequestableCalendarTargets(opts: {
  familyId: string
  viewerPersonId: string
  viewablePersonIds: string[]
  overlayableBranchIds: string[]
}): Promise<VacayPickerOption[]> {
  const viewable = new Set(opts.viewablePersonIds)
  const overlayable = new Set(opts.overlayableBranchIds)
  const [people, presets] = await Promise.all([
    listFamilyPeople(opts.familyId),
    listTravelerPresetBranches(opts.familyId),
  ])
  const personOpts = people
    .filter(p => p.personId !== opts.viewerPersonId && !viewable.has(p.personId))
    .map(p => ({ value: `person:${p.personId}`, label: p.displayName }))
  const branchOpts = presets
    .filter(p => !overlayable.has(p.id))
    .map(p => ({ value: `branch:${p.id}`, label: p.name }))
  return [...branchOpts, ...personOpts]
}

function mapAccessRows(
  rows: AccessRow[],
  viewerPersonId: string,
  peopleById: Map<string, { displayName: string }>,
  presetById: Map<string, { name: string }>,
): { outgoing: VacayAccessRequest[]; incoming: VacayAccessRequest[] } {
  const outgoing: VacayAccessRequest[] = []
  const incoming: VacayAccessRequest[] = []
  for (const row of rows) {
    if (row.status !== 'pending') continue
    const targetName = row.scope === 'branch'
      ? (presetById.get(row.target_branch_id ?? '')?.name ?? 'Group')
      : (peopleById.get(row.target_person_id ?? '')?.displayName ?? 'Member')
    const mapped: VacayAccessRequest = {
      id: row.id,
      granteePersonId: row.grantee_person_id,
      granteeName: peopleById.get(row.grantee_person_id)?.displayName ?? 'Member',
      scope: row.scope === 'branch' ? 'branch' : 'person',
      targetPersonId: row.target_person_id,
      targetBranchId: row.target_branch_id,
      targetName,
      status: 'pending',
    }
    if (row.grantee_person_id === viewerPersonId) outgoing.push(mapped)
    else incoming.push(mapped)
  }
  return { outgoing, incoming }
}

/**
 * Core year load. Trip overlay is best-effort: failures keep the calendar.
 * Settings / overlay / roster / entries / blocked / PTO throw on `{ error }`.
 */
export async function loadVacayYear(
  familyId: string,
  year: number,
  viewerPersonId: string,
): Promise<FamilyVacayYearLoad> {
  const [
    settings,
    calendars,
    extraPersonIds,
    enabledBranchIds,
    accessRows,
    viewablePersonIds,
    overlayableBranchIds,
    allPresets,
    blockedDates,
  ] = await Promise.all([
    fetchCalendarSettings(familyId),
    listHolidayCalendars(familyId),
    listOverlayPeople(viewerPersonId),
    listOverlayBranches(viewerPersonId),
    listCalendarAccessRows(familyId),
    listViewablePersonIds(familyId),
    listOverlayableBranchIds(familyId),
    listTravelerPresetBranches(familyId),
    listBlockedDates(familyId, year),
  ])

  const overlayable = new Set(overlayableBranchIds)
  const presets: VacayOverlayPreset[] = allPresets
    .filter(p => overlayable.has(p.id))
    .map(p => ({
      id: p.id,
      name: p.name,
      enabled: enabledBranchIds.includes(p.id),
      personIds: p.personIds,
    }))
  const enabledMembers = presets.filter(p => p.enabled).map(p => p.personIds)
  const visibleIds = intersectVisibleWithViewable(
    visiblePersonIdSet({
      currentPersonId: viewerPersonId,
      extraPersonIds,
      enabledBranchMemberIds: enabledMembers,
    }),
    viewablePersonIds,
    viewerPersonId,
  )
  const paintIds = paintablePersonIds(viewerPersonId, extraPersonIds.filter(id => visibleIds.includes(id)))

  const nameIds = [
    ...visibleIds,
    ...extraPersonIds,
    ...accessRows.flatMap(r => [r.grantee_person_id, r.target_person_id].filter((id): id is string => !!id)),
  ]
  const namedPeople = await listFamilyPeopleByIds(familyId, nameIds)
  const peopleById = new Map(namedPeople.map(p => [p.personId, p]))
  const presetById = new Map(allPresets.map(p => [p.id, p]))
  const { outgoing, incoming } = mapAccessRows(accessRows, viewerPersonId, peopleById, presetById)

  const visiblePeople = namedPeople.filter(p => visibleIds.includes(p.personId))
  const users = orderVisibleUsers(rosterToVacayUsers(visiblePeople), viewerPersonId)
  const extraPeople = rosterToVacayUsers(
    namedPeople.filter(p => extraPersonIds.includes(p.personId) && paintIds.includes(p.personId) && p.personId !== viewerPersonId),
  )
  const plan = settingsToVacayPlan(settings, calendars)

  const [entries, ptoRows] = await Promise.all([
    listCalendarEntries(familyId, year, visibleIds),
    listPtoYears(familyId, [year - 1, year, year + 1], visibleIds),
  ])

  let tripWindows: VacayTripWindow[] = []
  try {
    tripWindows = filterTripWindowsForOverlay(await loadVacayTripWindows(familyId), visibleIds)
  } catch {
    tripWindows = []
  }

  return {
    settings,
    plan,
    users,
    entries,
    blockedDates,
    ptoRows,
    tripWindows,
    overlay: {
      extraPersonIds,
      extraPeople,
      presets,
      pendingOutgoing: outgoing,
      incomingPending: incoming,
      viewablePersonIds,
      visiblePersonIds: visibleIds,
      paintablePersonIds: paintIds,
    },
  }
}
