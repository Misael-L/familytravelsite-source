import { getSupabaseBrowserClient } from './client'

/** UUID day note — keyed by civil_day, not Nest numeric day_id. */
export type FamilyDayNote = {
  id: string
  tripId: string
  civilDay: string
  body: string
  icon: string | null
  sortOrder: number
}

type DayNoteRow = {
  id: string
  trip_id: string
  civil_day: string
  body: string | null
  icon: string | null
  sort_order: number | null
}

function rowToNote(r: DayNoteRow): FamilyDayNote {
  return {
    id: r.id,
    tripId: r.trip_id,
    civilDay: r.civil_day,
    body: r.body ?? '',
    icon: r.icon,
    sortOrder: r.sort_order ?? 0,
  }
}

export async function listDayNotes(tripId: string): Promise<FamilyDayNote[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('day_notes')
    .select('id,trip_id,civil_day,body,icon,sort_order')
    .eq('trip_id', tripId)
    .order('civil_day', { ascending: true })
    .order('sort_order', { ascending: true })

  if (error) throw error
  return ((data ?? []) as DayNoteRow[]).map(rowToNote)
}

/**
 * Update body if noteId set; else insert with sort_order 0 (mirror iOS upsertDayNote).
 */
export async function upsertDayNote(opts: {
  tripId: string
  civilDay: string
  body: string
  noteId?: string | null
}): Promise<FamilyDayNote> {
  const sb = getSupabaseBrowserClient()
  const body = opts.body.trim()

  if (opts.noteId) {
    const { data, error } = await sb
      .from('day_notes')
      .update({ body, updated_at: new Date().toISOString() })
      .eq('id', opts.noteId)
      .select('id,trip_id,civil_day,body,icon,sort_order')
      .single()
    if (error) throw error
    return rowToNote(data as DayNoteRow)
  }

  const { data, error } = await sb
    .from('day_notes')
    .insert({
      trip_id: opts.tripId,
      civil_day: opts.civilDay,
      body,
      sort_order: 0,
    })
    .select('id,trip_id,civil_day,body,icon,sort_order')
    .single()
  if (error) throw error
  return rowToNote(data as DayNoteRow)
}

export async function deleteDayNote(id: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .from('day_notes')
    .delete()
    .eq('id', id)
  if (error) throw error
}

/** First note per civil day (W5.1 UI — matches iOS notes(for:).first). */
export function notesByCivilDay(notes: FamilyDayNote[]): Map<string, FamilyDayNote> {
  const map = new Map<string, FamilyDayNote>()
  for (const note of notes) {
    const existing = map.get(note.civilDay)
    if (!existing || note.sortOrder < existing.sortOrder) {
      map.set(note.civilDay, note)
    }
  }
  return map
}
