import { useMemo, useState, useCallback, useEffect } from 'react'
import { useTranslation } from '../../i18n'
import { isWeekend, formatDate } from './holidays'
import { tripsApi } from '../../api/client'
import VacayMonthCard from './VacayMonthCard'
import { Building2, GraduationCap, MousePointer2, Search } from 'lucide-react'
import Modal from '../shared/Modal'
import { useVacayChrome } from '../../pages/vacay/vacaySession'
import { personKindsOnDate, resolvePersonPaintClick, travelerHasAway, tripsOnDate } from '../../pages/vacay/vacayModel'
import { useToast } from '../shared/Toast'

type PaintMode = 'away' | 'school' | 'family' | 'inspect'

export default function VacayCalendar() {
  const { t, locale } = useTranslation()
  const toast = useToast()
  const {
    familyChrome, selectedYear, selectedUserId, entries, companyHolidays, toggleEntry,
    toggleCompanyHoliday, plan, users, holidays, approvedTripDates, proposedTripDates, tripWindows,
  } = useVacayChrome()
  const [paintMode, setPaintMode] = useState<PaintMode>('away')
  const [inspectDate, setInspectDate] = useState<string | null>(null)
  const [nestTripDates, setNestTripDates] = useState<Set<string>>(new Set())

  const companyMode = paintMode === 'family'

  useEffect(() => {
    if (familyChrome) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await tripsApi.list()
        const dates = new Set<string>()
        for (const trip of data.trips || []) {
          if (!trip.start_date || !trip.end_date) continue
          const start = new Date(trip.start_date + 'T00:00:00')
          const end = new Date(trip.end_date + 'T00:00:00')
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const y = d.getFullYear()
            if (y === selectedYear) {
              dates.add(`${y}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
            }
          }
        }
        if (!cancelled) setNestTripDates(dates)
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [selectedYear, familyChrome])

  const companyHolidaySet = useMemo(() => {
    const s = new Set<string>()
    companyHolidays.forEach(h => s.add(h.date))
    return s
  }, [companyHolidays])

  const entryMap = useMemo(() => {
    const map: Record<string, typeof entries> = {}
    entries.forEach(e => {
      if (!map[e.date]) map[e.date] = []
      map[e.date].push(e)
    })
    return map
  }, [entries])

  const blockWeekends = plan?.block_weekends !== false
  const weekendDays: number[] = plan?.weekend_days ? String(plan.weekend_days).split(',').map(Number) : [0, 6]
  const companyHolidaysEnabled = plan?.company_holidays_enabled !== false

  const handleCellClick = useCallback(async (dateStr: string) => {
    if (paintMode === 'inspect') {
      setInspectDate(dateStr)
      return
    }
    if (paintMode === 'family') {
      if (!companyHolidaysEnabled) return
      await toggleCompanyHoliday(dateStr)
      return
    }
    if (blockWeekends && isWeekend(dateStr, weekendDays)) return
    if (companyHolidaysEnabled && companyHolidaySet.has(dateStr)) return
    if (familyChrome && (paintMode === 'away' || paintMode === 'school')) {
      const kinds = personKindsOnDate(entries, selectedUserId, dateStr)
      if (resolvePersonPaintClick(paintMode, kinds) === 'blocked-other-kind') {
        const other = paintMode === 'away' ? t('vacay.modeSchool') : t('vacay.modeAway')
        toast.info(t('vacay.paintUseOtherKind', { kind: other }))
        return
      }
    }
    if (paintMode === 'school') {
      await toggleEntry(dateStr, selectedUserId || undefined, 'school_break')
      return
    }
    await toggleEntry(dateStr, selectedUserId || undefined)
  }, [paintMode, toggleEntry, toggleCompanyHoliday, companyHolidaySet, blockWeekends, companyHolidaysEnabled, selectedUserId, weekendDays, familyChrome, entries, toast, t])

  const selectedUser = users.find(u => u.id === selectedUserId)
  const tripDates = familyChrome ? approvedTripDates : nestTripDates
  const inspectWindows = inspectDate ? tripsOnDate(tripWindows, inspectDate) : []
  const inspectEntries = inspectDate ? (entryMap[inspectDate] || []) : []

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" style={{ paddingBottom: 'calc(var(--bottom-nav-h, 0px) + 80px)' }}>
        {Array.from({ length: 12 }, (_, i) => (
          <VacayMonthCard
            key={i}
            year={selectedYear}
            month={i}
            holidays={holidays}
            companyHolidaySet={companyHolidaySet}
            companyHolidaysEnabled={companyHolidaysEnabled}
            entryMap={entryMap}
            onCellClick={handleCellClick}
            companyMode={companyMode}
            blockWeekends={blockWeekends}
            weekendDays={weekendDays}
            tripDates={tripDates}
            proposedTripDates={familyChrome ? proposedTripDates : undefined}
            weekStart={plan?.week_start ?? 1}
          />
        ))}
      </div>

      {/* Floating toolbar — lift above the mobile bottom nav (z-60). On desktop --bottom-nav-h is 0px. */}
      <div className="sticky mt-3 sm:mt-4 flex items-center justify-center px-2" style={{ bottom: 'calc(var(--bottom-nav-h, 0px) + 12px)', zIndex: 61 }}>
        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl border bg-surface-card border-edge" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
          <button
            onClick={() => setPaintMode('away')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition-[background-color,color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] border ${paintMode === 'away' ? 'bg-content text-surface-card border-transparent' : 'bg-transparent text-content-muted border-edge'}`}>
            <MousePointer2 size={13} />
            {selectedUser && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedUser.color }} />}
            {selectedUser ? selectedUser.username : (familyChrome ? t('vacay.modeAway') : t('vacay.modeVacation'))}
          </button>
          {familyChrome && (
            <button
              onClick={() => setPaintMode('school')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition-[background-color,color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] border ${paintMode === 'school' ? 'bg-content text-surface-card border-transparent' : 'bg-transparent text-content-muted border-edge'}`}>
              <GraduationCap size={13} />
              {t('vacay.modeSchool')}
            </button>
          )}
          {companyHolidaysEnabled && (
            <button
              onClick={() => setPaintMode('family')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition-[background-color,color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] border ${paintMode === 'family' ? 'bg-[#d97706] text-[#fff] border-transparent' : 'bg-transparent text-content-muted border-edge'}`}>
              <Building2 size={13} />
              {familyChrome ? t('vacay.modeFamilyDay') : t('vacay.modeCompany')}
            </button>
          )}
          {familyChrome && (
            <button
              onClick={() => setPaintMode('inspect')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition-[background-color,color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] border ${paintMode === 'inspect' ? 'bg-content text-surface-card border-transparent' : 'bg-transparent text-content-muted border-edge'}`}>
              <Search size={13} />
              {t('vacay.modeInspect')}
            </button>
          )}
        </div>
      </div>

      <Modal
        isOpen={inspectDate != null}
        onClose={() => setInspectDate(null)}
        title={inspectDate ? formatDate(inspectDate, locale) : t('vacay.modeInspect')}
        size="md"
      >
        {inspectDate && (
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-content-faint mb-2">{t('vacay.traveling')}</p>
              {inspectWindows.length === 0 ? (
                <p className="text-xs text-content-faint">{t('vacay.noTravel')}</p>
              ) : (
                <div className="space-y-2">
                  {inspectWindows.map(w => (
                    <div key={w.tripId} className="rounded-lg border border-edge-secondary p-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${w.overlay === 'proposed' ? 'bg-[#f59e0b]' : 'bg-[#3b82f6]'}`} />
                        <span className="text-sm font-medium text-content flex-1 truncate">{w.name}</span>
                        <span className="text-[10px] text-content-faint">
                          {w.overlay === 'proposed' ? t('vacay.proposedTrip') : t('vacay.approvedTrip')}
                        </span>
                      </div>
                      {w.travelerIds.some(id => travelerHasAway(inspectEntries, id, inspectDate)) && (
                        <p className="text-[11px] text-[#d97706] mt-1">{t('vacay.conflictAway')}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-content-faint mb-2">{t('vacay.persons')}</p>
              <div className="space-y-1">
                {users.map(u => {
                  const away = inspectEntries.some(e => String(e.user_id) === String(u.id) && (e.kind ?? 'away') === 'away')
                  const school = inspectEntries.some(e => String(e.user_id) === String(u.id) && e.kind === 'school_break')
                  return (
                    <div key={String(u.id)} className="flex items-center gap-2 px-1 py-1">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: u.color || '#6366f1' }} />
                      <span className="text-xs flex-1 truncate text-content">{u.username}</span>
                      <button
                        onClick={() => void toggleEntry(inspectDate, u.id, 'away')}
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${away ? 'bg-content text-surface-card border-transparent' : 'text-content-muted border-edge'}`}
                      >
                        {t('vacay.away')}
                      </button>
                      <button
                        onClick={() => void toggleEntry(inspectDate, u.id, 'school_break')}
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${school ? 'bg-content text-surface-card border-transparent' : 'text-content-muted border-edge'}`}
                      >
                        {t('vacay.school')}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
