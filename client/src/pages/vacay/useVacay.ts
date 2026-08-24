import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVacayStore } from '../../store/vacayStore'
import { useFamilyFeatureStore } from '../../store/familyFeatureStore'
import { addListener, removeListener } from '../../api/websocket'
import { isSupabaseDataPlane } from '../../data/supabase/auth'
import { canMutateTrips } from '../../data/supabase/capabilities'
import { fetchNagerPublicHolidays } from '../../data/supabase/nagerHolidays'
import {
  addOverlayPerson as persistOverlayPerson,
  decideCalendarAccess as persistDecideCalendarAccess,
  deleteHolidayCalendarRow,
  emptyVacayOverlay,
  insertHolidayCalendar,
  listAddableOverlayPeople,
  listBlockedDates,
  listCalendarEntries,
  listPtoYears,
  listRequestableCalendarTargets,
  loadVacayYear,
  removeOverlayPerson as persistRemoveOverlayPerson,
  requestCalendarAccess as persistRequestCalendarAccess,
  revokeCalendarAccess as persistRevokeCalendarAccess,
  setOverlayBranch,
  toggleBlockedDate,
  toggleCalendarEntry,
  updateHolidayCalendarRow,
  updatePersonColor,
  upsertCalendarSettings,
  upsertPtoYear,
  zeroPtoCarryOver,
  type VacayOverlayLoad,
} from '../../data/supabase/vacay'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
import { getApiErrorMessage } from '../../types'
import type { HolidaysMap, VacayEntry, VacayPlan, VacayStat, VacayUser } from '../../types'
import {
  type CalendarEntryKind,
  type FamilyCalendarSettings,
  type PtoYearRow,
  type VacayTripWindow,
  buildHolidaysMap,
  buildPtoStats,
  clampPaintTarget,
  clampVisibleYear,
  collectTripDateSets,
  countAwayDays,
  nextYearCarry,
  resolveVisibleYears,
  vacayOverlayMode,
} from './vacayModel'
import type { VacayChromeSession } from './vacaySession'

function decorateEntries(entries: VacayEntry[], users: VacayUser[]): VacayEntry[] {
  const byId = new Map(users.map(u => [String(u.id), u]))
  return entries.map(e => {
    const u = byId.get(String(e.user_id))
    return { ...e, person_color: u?.color, person_name: u?.username }
  })
}

async function holidaysForPlan(plan: VacayPlan, year: number): Promise<HolidaysMap> {
  if (!plan.holidays_enabled || (plan.holiday_calendars ?? []).length === 0) return {}
  const byCountry: Record<string, Awaited<ReturnType<typeof fetchNagerPublicHolidays>>> = {}
  for (const cal of plan.holiday_calendars) {
    const country = cal.region.split('-')[0]
    if (!country || byCountry[country]) continue
    try {
      byCountry[country] = await fetchNagerPublicHolidays(year, country)
    } catch {
      byCountry[country] = []
    }
  }
  return buildHolidaysMap(plan.holiday_calendars, byCountry)
}

/**
 * Vacay page logic — Nest path still uses vacayStore + WebSocket.
 * Supabase path loads Family adapters only (no Nest, no WebSocket).
 */
export function useVacay() {
  const nest = useVacayStore()
  const supabasePlane = isSupabaseDataPlane()
  const vacayEnabled = useFamilyFeatureStore(s => s.isEnabled('vacay'))
  const toast = useToast()
  const { t } = useTranslation()
  const { familyId, personId, isSuperAdmin, membershipRole } = useAuthStore()
  const canReview = canMutateTrips({ isSuperAdmin, membershipRole: membershipRole ?? null })

  const [showSettings, setShowSettings] = useState<boolean>(false)
  const [deleteYear, setDeleteYear] = useState<number | null>(null)
  const [showMobileSidebar, setShowMobileSidebar] = useState<boolean>(false)

  const currentYear = new Date().getFullYear()
  const [familyBooting, setFamilyBooting] = useState(true)
  const [familyYears, setFamilyYears] = useState<number[]>([currentYear])
  const [familySelectedYear, setFamilySelectedYear] = useState(currentYear)
  const yearsRef = useRef(familyYears)
  yearsRef.current = familyYears
  const yearWriteChainRef = useRef(Promise.resolve())

  const enqueueYearWrite = useCallback((op: () => Promise<void>) => {
    const run = yearWriteChainRef.current.then(op, op)
    yearWriteChainRef.current = run.then(() => undefined, () => undefined)
    return run
  }, [])
  const [familyPlan, setFamilyPlan] = useState<VacayPlan | null>(null)
  const [familySettings, setFamilySettings] = useState<FamilyCalendarSettings | null>(null)
  const [familyUsers, setFamilyUsers] = useState<VacayUser[]>([])
  const [familyEntries, setFamilyEntries] = useState<VacayEntry[]>([])
  const [familyBlocked, setFamilyBlocked] = useState<{ date: string; note?: string }[]>([])
  const [familyStats, setFamilyStats] = useState<VacayStat[]>([])
  const [familyPto, setFamilyPto] = useState<PtoYearRow[]>([])
  const [familyHolidays, setFamilyHolidays] = useState<HolidaysMap>({})
  const [familyWindows, setFamilyWindows] = useState<VacayTripWindow[]>([])
  const [familySelectedUserId, setFamilySelectedUserId] = useState<string | number | null>(null)
  const [familyOverlay, setFamilyOverlay] = useState<VacayOverlayLoad>(() => emptyVacayOverlay())
  const overlayMode = vacayOverlayMode(membershipRole, !!isSuperAdmin)

  const applyYearLoad = useCallback((loaded: Awaited<ReturnType<typeof loadVacayYear>>, year: number) => {
    const overlay = loaded.overlay ?? emptyVacayOverlay(personId ?? '')
    const users = loaded.users
    const entries = decorateEntries(loaded.entries, users)
    const civilYear = new Date().getFullYear()
    const years = resolveVisibleYears(loaded.settings.visibleYears, civilYear)
    const clamped = clampVisibleYear(years, year, civilYear)
    setFamilySettings(loaded.settings)
    setFamilyPlan(loaded.plan)
    setFamilyUsers(users)
    setFamilyEntries(entries)
    setFamilyBlocked(loaded.blockedDates)
    setFamilyPto(loaded.ptoRows)
    setFamilyWindows(loaded.tripWindows)
    setFamilyOverlay(overlay)
    setFamilyYears(years)
    yearsRef.current = years
    setFamilySelectedUserId(prev => clampPaintTarget(prev, personId ?? '', overlay.paintablePersonIds))
    setFamilyStats(buildPtoStats({
      users,
      entries,
      ptoRows: loaded.ptoRows,
      year: clamped === year ? year : clamped,
      carryOverEnabled: loaded.settings.carryOverEnabled,
    }))
    if (clamped !== year) setFamilySelectedYear(clamped)
    return { users, entries, plan: loaded.plan, settings: loaded.settings, years, clamped, overlay }
  }, [personId])

  const persistNextYearCarry = useCallback(async (
    settings: FamilyCalendarSettings,
    users: VacayUser[],
    entries: VacayEntry[],
    ptoRows: PtoYearRow[],
    year: number,
    visibleYears: number[],
  ) => {
    if (!settings.carryOverEnabled || !visibleYears.includes(year + 1)) return
    await Promise.all(users.map(async u => {
      const id = String(u.id)
      if (!canReview && id !== personId) return
      const used = countAwayDays(entries, u.id, year)
      const row = ptoRows.find(r => r.personId === id && r.year === year)
      const next = ptoRows.find(r => r.personId === id && r.year === year + 1)
      await upsertPtoYear({
        familyId: settings.familyId,
        personId: id,
        year: year + 1,
        entitledDays: next?.entitledDays ?? 30,
        carriedOver: nextYearCarry(row?.entitledDays ?? 30, row?.carriedOver ?? 0, used),
      })
    }))
  }, [canReview, personId])

  useEffect(() => {
    if (supabasePlane) return
    nest.loadAll()
  }, [supabasePlane]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleWsMessage = useCallback((msg: { type: string }) => {
    if (msg.type === 'vacay:update' || msg.type === 'vacay:settings') {
      nest.loadPlan()
      nest.loadEntries(nest.selectedYear)
      nest.loadStats(nest.selectedYear)
      if (msg.type === 'vacay:settings') nest.loadAll()
    }
    if (msg.type === 'vacay:invite' || msg.type === 'vacay:accepted' || msg.type === 'vacay:declined' || msg.type === 'vacay:cancelled' || msg.type === 'vacay:dissolved') {
      nest.loadAll()
    }
  }, [nest.selectedYear]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (supabasePlane) return
    addListener(handleWsMessage)
    return () => removeListener(handleWsMessage)
  }, [handleWsMessage, supabasePlane])

  useEffect(() => {
    if (supabasePlane) return
    if (nest.selectedYear) {
      nest.loadEntries(nest.selectedYear)
      nest.loadStats(nest.selectedYear)
      nest.loadHolidays(nest.selectedYear)
    }
  }, [nest.selectedYear, supabasePlane]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!supabasePlane) return
    if (!vacayEnabled) {
      setFamilyBooting(false)
      return
    }
    let cancelled = false
    ;(async () => {
      if (!familyId || !personId) {
        toast.error(t('dashboard.propose.missingPerson'))
        setFamilyBooting(false)
        return
      }
      try {
        const loaded = await loadVacayYear(familyId, familySelectedYear, personId)
        if (cancelled) return
        const applied = applyYearLoad(loaded, familySelectedYear)
        setFamilyHolidays(await holidaysForPlan(applied.plan, applied.clamped))
        if (applied.clamped === familySelectedYear) {
          void persistNextYearCarry(
            applied.settings,
            applied.users,
            applied.entries,
            loaded.ptoRows,
            familySelectedYear,
            applied.years,
          ).catch(() => { /* carry write is best-effort; stats already shown */ })
        }
      } catch (err: unknown) {
        if (!cancelled) toast.error(getApiErrorMessage(err, t('vacay.noData')))
      } finally {
        if (!cancelled) setFamilyBooting(false)
      }
    })()
    return () => { cancelled = true }
  }, [supabasePlane, vacayEnabled, familyId, personId, familySelectedYear]) // eslint-disable-line react-hooks/exhaustive-deps

  const runWrite = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('vacay.noData')))
      throw err
    }
  }, [toast, t])

  const familySetSelectedYear = useCallback((year: number) => {
    setFamilySelectedYear(year)
  }, [])

  const familyAddYear = useCallback(async (year: number) => {
    if (!familyId || !familySettings) return
    await enqueueYearWrite(() => runWrite(async () => {
      const civilYear = new Date().getFullYear()
      const nextYears = resolveVisibleYears([...yearsRef.current, year], civilYear)
      const settings = await upsertCalendarSettings(familyId, { visibleYears: nextYears })
      setFamilySettings(settings)
      setFamilyYears(nextYears)
      yearsRef.current = nextYears
      setFamilySelectedYear(clampVisibleYear(nextYears, year, civilYear))
      const users = familyUsers
      const pto = familyPto
      void (async () => {
        try {
          const sourceYear = year - 1
          const sourceEntries = decorateEntries(
            await listCalendarEntries(familyId, sourceYear, familyOverlay.visiblePersonIds),
            users,
          )
          await persistNextYearCarry(settings, users, sourceEntries, pto, sourceYear, nextYears)
        } catch { /* reviewer-only for others */ }
      })()
    }))
  }, [familyId, familySettings, familyUsers, familyPto, familyOverlay.visiblePersonIds, persistNextYearCarry, runWrite, enqueueYearWrite])

  const familyRemoveYear = useCallback(async (year: number | null) => {
    if (!familyId || year == null || !familySettings) return
    await enqueueYearWrite(() => runWrite(async () => {
      const civilYear = new Date().getFullYear()
      const nextYears = yearsRef.current.filter(y => y !== year)
      const stored = nextYears.length > 0 ? nextYears : []
      const settings = await upsertCalendarSettings(familyId, { visibleYears: stored })
      const resolved = resolveVisibleYears(stored, civilYear)
      setFamilySettings(settings)
      setFamilyYears(resolved)
      yearsRef.current = resolved
      setFamilySelectedYear(prev => clampVisibleYear(resolved, prev, civilYear))
    }))
  }, [familyId, familySettings, runWrite, enqueueYearWrite])

  const familyUpdatePlan = useCallback(async (updates: Partial<VacayPlan>) => {
    if (!familyId) return
    await runWrite(async () => {
      const patch: Partial<Omit<FamilyCalendarSettings, 'familyId'>> = {}
      if (updates.block_weekends !== undefined) patch.blockWeekends = updates.block_weekends
      if (updates.weekend_days !== undefined) patch.weekendDays = updates.weekend_days
      if (updates.week_start !== undefined) patch.weekStart = updates.week_start
      if (updates.holidays_enabled !== undefined) patch.holidaysEnabled = updates.holidays_enabled
      if (updates.company_holidays_enabled !== undefined) patch.familyDaysEnabled = updates.company_holidays_enabled
      if (updates.carry_over_enabled !== undefined) patch.carryOverEnabled = updates.carry_over_enabled
      const settings = await upsertCalendarSettings(familyId, patch)
      if (updates.carry_over_enabled === false) await zeroPtoCarryOver(familyId)
      setFamilySettings(settings)
      setFamilyPlan(prev => prev ? {
        ...prev,
        block_weekends: settings.blockWeekends,
        weekend_days: settings.weekendDays,
        week_start: settings.weekStart,
        holidays_enabled: settings.holidaysEnabled,
        company_holidays_enabled: settings.familyDaysEnabled,
        carry_over_enabled: settings.carryOverEnabled,
      } : prev)
      if (updates.holidays_enabled !== undefined && familyPlan) {
        setFamilyHolidays(await holidaysForPlan({ ...familyPlan, holidays_enabled: settings.holidaysEnabled }, familySelectedYear))
      }
      if (updates.carry_over_enabled !== undefined) {
        setFamilyStats(buildPtoStats({
          users: familyUsers,
          entries: familyEntries,
          ptoRows: familyPto,
          year: familySelectedYear,
          carryOverEnabled: settings.carryOverEnabled,
        }))
      }
    })
  }, [familyId, familyPlan, familyUsers, familyEntries, familyPto, familySelectedYear, runWrite])

  const familyToggleEntry = useCallback(async (date: string, targetUserId?: string | number, kind: CalendarEntryKind = 'away') => {
    if (!familyId) return
    const person = String(targetUserId ?? familySelectedUserId ?? personId ?? '')
    if (!person) return
    await runWrite(async () => {
      await toggleCalendarEntry({ familyId, personId: person, date, kind })
      const entries = decorateEntries(
        await listCalendarEntries(familyId, familySelectedYear, familyOverlay.visiblePersonIds),
        familyUsers,
      )
      setFamilyEntries(entries)
      const ptoRows = await listPtoYears(
        familyId,
        [familySelectedYear - 1, familySelectedYear, familySelectedYear + 1],
        familyOverlay.visiblePersonIds,
      )
      setFamilyPto(ptoRows)
      setFamilyStats(buildPtoStats({
        users: familyUsers,
        entries,
        ptoRows,
        year: familySelectedYear,
        carryOverEnabled: familySettings?.carryOverEnabled !== false,
      }))
      if (familySettings) {
        void persistNextYearCarry(familySettings, familyUsers, entries, ptoRows, familySelectedYear, familyYears)
          .catch(() => { /* */ })
      }
    })
  }, [familyId, familySelectedUserId, personId, familySelectedYear, familyUsers, familySettings, familyYears, familyOverlay.visiblePersonIds, persistNextYearCarry, runWrite])

  const familyToggleBlocked = useCallback(async (date: string) => {
    if (!familyId) return
    await runWrite(async () => {
      await toggleBlockedDate(familyId, date)
      setFamilyBlocked(await listBlockedDates(familyId, familySelectedYear))
    })
  }, [familyId, familySelectedYear, runWrite])

  const familyUpdateColor = useCallback(async (color: string, targetUserId?: string | number) => {
    const id = String(targetUserId ?? familySelectedUserId ?? personId ?? '')
    if (!id) return
    await runWrite(async () => {
      await updatePersonColor(id, color)
      setFamilyUsers(prev => prev.map(u => String(u.id) === id ? { ...u, color } : u))
      setFamilyEntries(prev => prev.map(e => String(e.user_id) === id ? { ...e, person_color: color } : e))
      setFamilyStats(prev => prev.map(s => String(s.user_id) === id ? { ...s, person_color: color } : s))
    })
  }, [familySelectedUserId, personId, runWrite])

  const familyUpdateVacationDays = useCallback(async (year: number, days: number, targetUserId?: string | number) => {
    if (!familyId) return
    const id = String(targetUserId ?? familySelectedUserId ?? personId ?? '')
    if (!id) return
    await runWrite(async () => {
      const existing = familyPto.find(r => r.personId === id && r.year === year)
      await upsertPtoYear({
        familyId,
        personId: id,
        year,
        entitledDays: days,
        carriedOver: familySettings?.carryOverEnabled === false ? 0 : (existing?.carriedOver ?? 0),
      })
      const ptoRows = await listPtoYears(familyId, [year - 1, year, year + 1], familyOverlay.visiblePersonIds)
      setFamilyPto(ptoRows)
      setFamilyStats(buildPtoStats({
        users: familyUsers,
        entries: familyEntries,
        ptoRows,
        year,
        carryOverEnabled: familySettings?.carryOverEnabled !== false,
      }))
    })
  }, [familyId, familySelectedUserId, personId, familyPto, familyUsers, familyEntries, familySettings, familyOverlay.visiblePersonIds, runWrite])

  const familyLoadStats = useCallback(async (year?: number) => {
    if (!familyId) return
    const y = year ?? familySelectedYear
    const [entries, ptoRows] = await Promise.all([
      listCalendarEntries(familyId, y, familyOverlay.visiblePersonIds),
      listPtoYears(familyId, [y - 1, y, y + 1], familyOverlay.visiblePersonIds),
    ])
    const decorated = decorateEntries(entries, familyUsers)
    setFamilyEntries(decorated)
    setFamilyPto(ptoRows)
    setFamilyStats(buildPtoStats({
      users: familyUsers,
      entries: decorated,
      ptoRows,
      year: y,
      carryOverEnabled: familySettings?.carryOverEnabled !== false,
    }))
  }, [familyId, familySelectedYear, familyUsers, familySettings, familyOverlay.visiblePersonIds])

  const familyAddHolidayCalendar = useCallback(async (data: { region: string; color?: string; label?: string | null }) => {
    if (!familyId) return
    await runWrite(async () => {
      const cal = await insertHolidayCalendar(familyId, data)
      setFamilyPlan(prev => prev ? { ...prev, holiday_calendars: [...(prev.holiday_calendars ?? []), cal] } : prev)
      if (familyPlan) setFamilyHolidays(await holidaysForPlan({
        ...familyPlan,
        holiday_calendars: [...(familyPlan.holiday_calendars ?? []), cal],
      }, familySelectedYear))
    })
  }, [familyId, familyPlan, familySelectedYear, runWrite])

  const familyUpdateHolidayCalendar = useCallback(async (id: string | number, data: { region?: string; color?: string; label?: string | null }) => {
    await runWrite(async () => {
      const cal = await updateHolidayCalendarRow(String(id), data)
      setFamilyPlan(prev => prev ? {
        ...prev,
        holiday_calendars: (prev.holiday_calendars ?? []).map(c => String(c.id) === String(id) ? cal : c),
      } : prev)
      if (familyPlan) {
        const nextCals = (familyPlan.holiday_calendars ?? []).map(c => String(c.id) === String(id) ? cal : c)
        setFamilyHolidays(await holidaysForPlan({ ...familyPlan, holiday_calendars: nextCals }, familySelectedYear))
      }
    })
  }, [familyPlan, familySelectedYear, runWrite])

  const familyDeleteHolidayCalendar = useCallback(async (id: string | number) => {
    await runWrite(async () => {
      await deleteHolidayCalendarRow(String(id))
      setFamilyPlan(prev => prev ? {
        ...prev,
        holiday_calendars: (prev.holiday_calendars ?? []).filter(c => String(c.id) !== String(id)),
      } : prev)
      if (familyPlan) {
        const nextCals = (familyPlan.holiday_calendars ?? []).filter(c => String(c.id) !== String(id))
        setFamilyHolidays(await holidaysForPlan({ ...familyPlan, holiday_calendars: nextCals }, familySelectedYear))
      }
    })
  }, [familyPlan, familySelectedYear, runWrite])

  const reloadFamilyYear = useCallback(async () => {
    if (!familyId || !personId) return
    const loaded = await loadVacayYear(familyId, familySelectedYear, personId)
    applyYearLoad(loaded, familySelectedYear)
  }, [familyId, personId, familySelectedYear, applyYearLoad])

  const familyToggleOverlayPreset = useCallback(async (branchId: string, enabled: boolean) => {
    if (!personId) return
    await runWrite(async () => {
      await setOverlayBranch(personId, branchId, enabled)
      await reloadFamilyYear()
    })
  }, [personId, runWrite, reloadFamilyYear])

  const familyAddOverlayPerson = useCallback(async (targetPersonId: string) => {
    if (!personId) return
    await runWrite(async () => {
      await persistOverlayPerson(personId, targetPersonId)
      await reloadFamilyYear()
    })
  }, [personId, runWrite, reloadFamilyYear])

  const familyRemoveOverlayPerson = useCallback(async (targetPersonId: string) => {
    if (!personId) return
    await runWrite(async () => {
      await persistRemoveOverlayPerson(personId, targetPersonId)
      await reloadFamilyYear()
    })
  }, [personId, runWrite, reloadFamilyYear])

  const familyRequestCalendarAccess = useCallback(async (target: { personId?: string; branchId?: string }) => {
    await runWrite(async () => {
      await persistRequestCalendarAccess({
        targetPersonId: target.personId ?? null,
        targetBranchId: target.branchId ?? null,
      })
      await reloadFamilyYear()
    })
  }, [runWrite, reloadFamilyYear])

  const familyRevokeCalendarAccess = useCallback(async (id: string) => {
    await runWrite(async () => {
      await persistRevokeCalendarAccess(id)
      await reloadFamilyYear()
    })
  }, [runWrite, reloadFamilyYear])

  const familyDecideCalendarAccess = useCallback(async (id: string, approve: boolean) => {
    await runWrite(async () => {
      await persistDecideCalendarAccess(id, approve)
      await reloadFamilyYear()
    })
  }, [runWrite, reloadFamilyYear])

  const familyLoadOverlayPickerOptions = useCallback(async () => {
    if (!familyId || !personId) return []
    if (overlayMode === 'add') {
      return listAddableOverlayPeople({
        familyId,
        viewerPersonId: personId,
        extraPersonIds: familyOverlay.extraPersonIds,
      })
    }
    return listRequestableCalendarTargets({
      familyId,
      viewerPersonId: personId,
      viewablePersonIds: familyOverlay.viewablePersonIds,
      overlayableBranchIds: familyOverlay.presets.map(p => p.id),
    })
  }, [familyId, personId, overlayMode, familyOverlay.extraPersonIds, familyOverlay.viewablePersonIds, familyOverlay.presets])

  const tripDates = useMemo(
    () => collectTripDateSets(familyWindows, familySelectedYear),
    [familyWindows, familySelectedYear],
  )

  const familySession: VacayChromeSession | null = useMemo(() => {
    if (!supabasePlane) return null
    return {
      familyChrome: true,
      plan: familyPlan,
      users: familyUsers,
      pendingInvites: [],
      isFused: true,
      entries: familyEntries,
      companyHolidays: familyBlocked,
      stats: familyStats,
      selectedYear: familySelectedYear,
      selectedUserId: familySelectedUserId,
      holidays: familyHolidays,
      tripWindows: familyWindows,
      approvedTripDates: tripDates.approvedTripDates,
      proposedTripDates: tripDates.proposedTripDates,
      currentPersonId: personId,
      canReview,
      overlayMode,
      overlayPresets: familyOverlay.presets,
      overlayPeople: familyOverlay.extraPeople,
      pendingOutgoing: familyOverlay.pendingOutgoing,
      incomingAccess: familyOverlay.incomingPending,
      setSelectedUserId: setFamilySelectedUserId,
      updatePlan: familyUpdatePlan,
      updateColor: familyUpdateColor,
      invite: async () => {},
      cancelInvite: async () => {},
      dissolve: async () => {},
      toggleEntry: familyToggleEntry,
      toggleCompanyHoliday: familyToggleBlocked,
      loadStats: familyLoadStats,
      updateVacationDays: familyUpdateVacationDays,
      addHolidayCalendar: familyAddHolidayCalendar,
      updateHolidayCalendar: familyUpdateHolidayCalendar,
      deleteHolidayCalendar: familyDeleteHolidayCalendar,
      toggleOverlayPreset: familyToggleOverlayPreset,
      addOverlayPerson: familyAddOverlayPerson,
      removeOverlayPerson: familyRemoveOverlayPerson,
      requestCalendarAccess: familyRequestCalendarAccess,
      revokeCalendarAccess: familyRevokeCalendarAccess,
      loadOverlayPickerOptions: familyLoadOverlayPickerOptions,
    }
  }, [
    supabasePlane, familyPlan, familyUsers, familyEntries, familyBlocked, familyStats,
    familySelectedYear, familySelectedUserId, familyHolidays, familyWindows, tripDates,
    personId, canReview, overlayMode, familyOverlay, familyUpdatePlan, familyUpdateColor, familyToggleEntry,
    familyToggleBlocked, familyLoadStats, familyUpdateVacationDays, familyAddHolidayCalendar,
    familyUpdateHolidayCalendar, familyDeleteHolidayCalendar, familyToggleOverlayPreset,
    familyAddOverlayPerson, familyRemoveOverlayPerson, familyRequestCalendarAccess,
    familyRevokeCalendarAccess, familyLoadOverlayPickerOptions,
  ])

  const handleAddNextYear = () => {
    if (supabasePlane) {
      const nextYear = familyYears.length > 0 ? Math.max(...familyYears) + 1 : currentYear
      void familyAddYear(nextYear)
      return
    }
    const nextYear = nest.years.length > 0 ? Math.max(...nest.years) + 1 : currentYear
    nest.addYear(nextYear)
  }

  const handleAddPrevYear = () => {
    if (supabasePlane) {
      const prevYear = familyYears.length > 0 ? Math.min(...familyYears) - 1 : currentYear
      void familyAddYear(prevYear)
      return
    }
    const prevYear = nest.years.length > 0 ? Math.min(...nest.years) - 1 : currentYear
    nest.addYear(prevYear)
  }

  if (supabasePlane) {
    return {
      years: familyYears,
      selectedYear: familySelectedYear,
      setSelectedYear: familySetSelectedYear,
      removeYear: familyRemoveYear,
      loading: familyBooting,
      incomingInvites: [] as { plan_id: number; owner_username: string }[],
      acceptInvite: async () => {},
      declineInvite: async () => {},
      incomingAccess: familyOverlay.incomingPending,
      decideCalendarAccess: familyDecideCalendarAccess,
      plan: familyPlan,
      showSettings, setShowSettings, deleteYear, setDeleteYear,
      showMobileSidebar, setShowMobileSidebar,
      handleAddNextYear, handleAddPrevYear,
      familySession,
      familyChrome: true,
    }
  }

  return {
    years: nest.years,
    selectedYear: nest.selectedYear,
    setSelectedYear: nest.setSelectedYear,
    removeYear: nest.removeYear,
    loading: nest.loading,
    incomingInvites: nest.incomingInvites,
    acceptInvite: nest.acceptInvite,
    declineInvite: nest.declineInvite,
    incomingAccess: [] as VacayChromeSession['incomingAccess'],
    decideCalendarAccess: async () => {},
    plan: nest.plan,
    showSettings, setShowSettings, deleteYear, setDeleteYear,
    showMobileSidebar, setShowMobileSidebar,
    handleAddNextYear, handleAddPrevYear,
    familySession: null,
    familyChrome: false,
  }
}
