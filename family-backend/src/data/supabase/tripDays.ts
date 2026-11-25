import { getSupabaseBrowserClient } from './client'

/** UUID day spine row — not `@trek/shared` Day. */
export type FamilyTripDay = {
  id: string
  tripId: string
  civilDay: string
  dayIndex: number
  title: string | null
}

type TripDayRow = {
  id: string
  trip_id: string
  civil_day: string
  day_index: number
  title: string | null
}

/** Materialize contiguous UTC civil days (SECURITY DEFINER). Best-effort on load. */
export async function syncTripDays(tripId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .rpc('sync_trip_days', { p_trip_id: tripId })
  if (error) throw error
}

export async function listTripDays(tripId: string): Promise<FamilyTripDay[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('trip_days')
    .select('id,trip_id,civil_day,day_index,title')
    .eq('trip_id', tripId)
    .order('day_index', { ascending: true })

  if (error) throw error
  return ((data ?? []) as TripDayRow[]).map(r => ({
    id: r.id,
    tripId: r.trip_id,
    civilDay: r.civil_day,
    dayIndex: r.day_index,
    title: r.title,
  }))
}

/** Empty / whitespace title → NULL so default “Day N” label stays honest. */
export async function updateTripDayTitle(dayId: string, title: string | null): Promise<void> {
  const trimmed = title?.trim() || null
  const { error } = await getSupabaseBrowserClient()
    .from('trip_days')
    .update({
      title: trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dayId)
  if (error) throw error
}
