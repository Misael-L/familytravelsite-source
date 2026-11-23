import { currentPlannerCalendarPort, recordCalendarUndo } from '../../repo/plannerCalendarPort'
import { CalendarMinus, Undo2, ShieldCheck } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTripStore } from '../../store/tripStore'
import { useNetworkMode } from '../../hooks/useNetworkMode'
import { dayDeleteImpact, deleteDayBlockedReason } from '../../utils/dayDeleteImpact'
import { deleteDayLines as buildDeleteDayLines, type DayDeleteQuestion, type ImpactLine } from '../../utils/dayImpactLines'
import { dayDate, dayLabel } from '../../utils/dayLabel'
import type { Accommodation, Day, Place, Reservation, Trip } from '../../types'

type Translate = (key: string, params?: Record<string, string | number>) => string

interface DayDeleteOptions {
  tripId: number
  trip: Trip | null
  days: Day[]
  places: Place[]
  reservations: Reservation[]
  accommodations: Accommodation[]
  pushUndo?: (label: string, undo: () => Promise<void>) => void
  canEditDays: boolean
  t: Translate
  locale: string
  toast: { success: (message: string) => unknown; error: (message: string) => unknown }
  /**
   * After a delete went through, with the day that went: the stays, the route
   * of the selected day, an open day panel and the undo steps are the planner's.
   */
  onDeleted: (dayId: number) => void
}

export interface DayDelete {
  /** The day the question is asked about, or null while no question is open. */
  deleteDayId: number | null
  setDeleteDayId: (dayId: number | null) => void
  /** "Delete Tue, Oct 13?", the day named the way the reorder list names it. */
  deleteDayTitle: string
  /** What goes with the day, ready for DayImpactList and its phone skin. */
  deleteDayLines: ImpactLine[]
  /** Why no day can be deleted right now (the last day, offline), or null. */
  deleteDayBlocked: string | null
  handleDeleteDay: (dayId: number) => void
  confirmDeleteDay: () => Promise<void>
  /** The same question as one object, for the reorder dialog to ask in place; null while none is open. */
  deleteDayQuestion: DayDeleteQuestion | null
}

const byNumber = (a: Day, b: Day): number => (a.day_number ?? 0) - (b.day_number ?? 0)

/**
 * Deleting a day from the reorder dialog, for both shells: which day is asked
 * about, the question's title and the list of what goes with the day, and the
 * delete itself. The desktop dialog and the phone sheet only render what this
 * returns, which keeps the logic in one place for the duplication gate.
 *
 * Native no-port deletion has no Undo: its server cancels stays and moves dates.
 * The optional Family calendar port supplies its own accurate confirmation and
 * exact server-backed recovery while retaining visits, notes, linked documents and independent bookings.
 */
export function useDayDelete(options: DayDeleteOptions): DayDelete {
  const { tripId, trip, days, places, reservations, accommodations, canEditDays, t, locale, toast, onDeleted, pushUndo } = options
  const { offline } = useNetworkMode()
  const assignments = useTripStore(s => s.assignments)
  const dayNotes = useTripStore(s => s.dayNotes)
  const budgetItems = useTripStore(s => s.budgetItems)
  const [deleteDayId, setDeleteDayId] = useState<number | null>(null)
  const removing=useRef(false)
  const prepared=useRef<{day:number;run:Promise<()=>Promise<{undo:()=>Promise<void>}>>}|null>(null)
  const shown=useRef<Pick<ReturnType<typeof useTripStore.getState>,'trip'|'days'>|null>(null)

  const deleteDayBlocked = deleteDayBlockedReason(days.length, offline, t)

  const ordered = useMemo(() => [...days].sort(byNumber), [days])
  const index = deleteDayId == null ? -1 : ordered.findIndex(d => d.id === deleteDayId)
  const target = index < 0 ? null : ordered[index]

  const deleteDayTitle = useMemo(
    () => (target ? t('dayplan.deleteDayTitle', { day: dayLabel(target, index, t, locale) }) : ''),
    [target, index, t, locale],
  )

  const deleteDayLines = useMemo(() => {
    if (!target) return []
    if(currentPlannerCalendarPort()) return [
      {key:'calendar',icon:CalendarMinus,tone:'warning' as const,text:'Remove this day and move later itinerary days one date earlier. Confirmed bookings are kept on their existing dates.'},
      {key:'recovery',icon:Undo2,tone:'muted' as const,text:'The day, visits and notes are retained for exact Undo while the calendar remains unchanged. Already-trashed visits stay trashed after recovery.'},
      {key:'retained',icon:ShieldCheck,tone:'neutral' as const,text:'Linked documents stay in Files and bookings stay in Bookings, with their existing dates and times. Undo restores their day links. Resolve pending planning changes first.'},
    ]
    const budget = { items: budgetItems, currency: trip?.currency, locale }
    const impact = dayDeleteImpact(target, days, { assignments, dayNotes, reservations, accommodations, places, budget }, trip)
    return buildDeleteDayLines(impact, t, iso => dayDate(iso, locale) ?? iso, (day, i) => dayLabel(day, i, t, locale))
  }, [target, days, assignments, dayNotes, reservations, accommodations, places, budgetItems, trip, t, locale])

  const handleDeleteDay = useCallback((dayId: number) => {
    if (!canEditDays || deleteDayBlocked) return
    const state=useTripStore.getState();shown.current={trip:state.trip,days:state.days}
    const calendar=currentPlannerCalendarPort()
    if(calendar){const run=calendar.prepareTrash(tripId,dayId);void run.catch(()=>{});prepared.current={day:dayId,run}}
    setDeleteDayId(dayId)
  }, [canEditDays, deleteDayBlocked, tripId])

  const confirmDeleteDay = useCallback(async () => {
    if (deleteDayId == null) return
    const dayId = deleteDayId
    const calendar=currentPlannerCalendarPort()
    if(calendar){
      if(removing.current)return
      removing.current=true
      setDeleteDayId(null)
      try {
        const state=useTripStore.getState()
        if(!shown.current || state.trip!==shown.current.trip || state.days!==shown.current.days)throw new Error('The displayed calendar changed. Reopen the day confirmation.')
        if(prepared.current?.day!==dayId)throw new Error('Reopen the original day confirmation.')
        const result=await (await prepared.current.run)()
        if(pushUndo)recordCalendarUndo(pushUndo,t('dayplan.deleteDay'),result.undo)
        onDeleted(dayId)
        toast.success(t('dayplan.deleteDaySuccess'))
      }catch(error:unknown){toast.error(error instanceof Error?error.message:t('dayplan.deleteDayError'))}
      finally{removing.current=false}
      return
    }
    setDeleteDayId(null)
    try {
      await useTripStore.getState().deleteDay(tripId, dayId)
    } catch (err: unknown) {
      // The store has put the day back already; the server's own sentence is
      // English, so the toast says it in the traveller's language instead.
      console.error('Failed to delete day:', err)
      toast.error(t('dayplan.deleteDayError'))
      return
    }
    onDeleted(dayId)
    toast.success(t('dayplan.deleteDaySuccess'))
  }, [deleteDayId, tripId, toast, t, onDeleted, pushUndo])

  const cancelDeleteDay = useCallback(() => setDeleteDayId(null), [])
  const deleteDayQuestion = useMemo<DayDeleteQuestion | null>(
    () => (target
      ? { dayId: target.id, title: deleteDayTitle, lines: deleteDayLines, onCancel: cancelDeleteDay, onConfirm: () => { void confirmDeleteDay() } }
      : null),
    [target, deleteDayTitle, deleteDayLines, cancelDeleteDay, confirmDeleteDay],
  )

  return { deleteDayId, setDeleteDayId, deleteDayTitle, deleteDayLines, deleteDayBlocked, handleDeleteDay, confirmDeleteDay, deleteDayQuestion }
}
