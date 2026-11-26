import { getSupabaseBrowserClient } from './client'
import type { FamilyTripDay } from './tripDays'

const SCHEDULE_SELECT =
  'id,trip_id,activity,starts_at,ends_at,address,time_zone,place_id,sort_order,experience_id,food_id,link_url'

/** UUID schedule row — not Nest Assignment. */
export type FamilyScheduleItem = {
  id: string
  tripId: string
  activity: string
  placeId: string | null
  startsAt: string | null
  endsAt: string | null
  address: string | null
  timeZone: string | null
  sortOrder: number
  experienceId: string | null
  foodId: string | null
  linkUrl: string | null
}

type ScheduleItemRow = {
  id: string
  trip_id: string
  activity: string | null
  place_id: string | null
  starts_at: string | null
  ends_at: string | null
  address: string | null
  time_zone: string | null
  sort_order: number | null
  experience_id: string | null
  food_id: string | null
  link_url: string | null
}

function rowToItem(r: ScheduleItemRow): FamilyScheduleItem {
  return {
    id: r.id,
    tripId: r.trip_id,
    activity: r.activity?.trim() || 'Untitled',
    placeId: r.place_id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    address: r.address,
    timeZone: r.time_zone,
    sortOrder: r.sort_order ?? 0,
    experienceId: r.experience_id ?? null,
    foodId: r.food_id ?? null,
    linkUrl: r.link_url ?? null,
  }
}

/** UTC civil YYYY-MM-DD from timestamptz (or date-only string). */
export function utcCivilDay(iso: string | null | undefined): string | null {
  if (!iso) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** UTC midnight ISO for a civil day string (matches iOS dayStart for assign). */
export function civilDayToUtcMidnightIso(civilDay: string): string {
  return `${civilDay}T00:00:00.000Z`
}

export async function listScheduleItems(tripId: string): Promise<FamilyScheduleItem[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('schedule_items')
    .select(SCHEDULE_SELECT)
    .eq('trip_id', tripId)
    .order('starts_at', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error) throw error
  return ((data ?? []) as ScheduleItemRow[]).map(rowToItem)
}

export async function insertScheduleItem(opts: {
  tripId: string
  activity: string
  placeId: string | null
  address?: string | null
  startsAt: string | null
  sortOrder: number
  experienceId?: string | null
  foodId?: string | null
  linkUrl?: string | null
}): Promise<FamilyScheduleItem> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('schedule_items')
    .insert({
      trip_id: opts.tripId,
      activity: opts.activity,
      place_id: opts.placeId,
      address: opts.address ?? null,
      starts_at: opts.startsAt,
      sort_order: opts.sortOrder,
      experience_id: opts.experienceId ?? null,
      food_id: opts.foodId ?? null,
      link_url: opts.linkUrl ?? null,
    })
    .select(SCHEDULE_SELECT)
    .single()

  if (error) throw error
  return rowToItem(data as ScheduleItemRow)
}

export async function deleteScheduleItem(id: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .from('schedule_items')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function updateScheduleSortOrders(
  updates: Array<{ id: string; sortOrder: number }>,
): Promise<void> {
  const sb = getSupabaseBrowserClient()
  for (const u of updates) {
    const { error } = await sb
      .from('schedule_items')
      .update({ sort_order: u.sortOrder })
      .eq('id', u.id)
    if (error) throw error
  }
}

/**
 * Attach items to trip_days by UTC civil date of starts_at.
 * Null starts_at items are omitted (no Unscheduled section in W5).
 */
export function groupScheduleByCivilDay(
  items: FamilyScheduleItem[],
  days: FamilyTripDay[],
): Map<string, FamilyScheduleItem[]> {
  const byCivil = new Map<string, FamilyScheduleItem[]>()
  for (const item of items) {
    const civil = utcCivilDay(item.startsAt)
    if (!civil) continue
    const list = byCivil.get(civil) ?? []
    list.push(item)
    byCivil.set(civil, list)
  }

  const result = new Map<string, FamilyScheduleItem[]>()
  for (const day of days) {
    const list = byCivil.get(day.civilDay) ?? []
    list.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return a.activity.localeCompare(b.activity)
    })
    result.set(day.id, list)
  }
  return result
}

/** Whether this trip already has a Plan row for the catalog experience or food. */
export async function tripContainsCatalogPlanItem(opts: {
  tripId: string
  experienceId?: string | null
  foodId?: string | null
}): Promise<boolean> {
  const sb = getSupabaseBrowserClient()
  if (opts.experienceId) {
    const { data, error } = await sb
      .from('schedule_items')
      .select('id')
      .eq('trip_id', opts.tripId)
      .eq('experience_id', opts.experienceId)
      .limit(1)
    if (error) throw error
    return (data?.length ?? 0) > 0
  }
  if (opts.foodId) {
    const { data, error } = await sb
      .from('schedule_items')
      .select('id')
      .eq('trip_id', opts.tripId)
      .eq('food_id', opts.foodId)
      .limit(1)
    if (error) throw error
    return (data?.length ?? 0) > 0
  }
  return false
}

/** Place ids that appear on at least one schedule row. */
export function plannedPlaceIds(items: FamilyScheduleItem[]): Set<string> {
  const ids = new Set<string>()
  for (const item of items) {
    if (item.placeId) ids.add(item.placeId)
  }
  return ids
}
