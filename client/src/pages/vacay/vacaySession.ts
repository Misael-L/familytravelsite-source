import { createContext, createElement, useContext, type ReactNode } from 'react'
import { useVacayStore } from '../../store/vacayStore'
import type { HolidaysMap, VacayEntry, VacayPlan, VacayStat, VacayUser } from '../../types'
import type {
  CalendarEntryKind,
  VacayAccessRequest,
  VacayOverlayMode,
  VacayOverlayPreset,
  VacayTripWindow,
} from './vacayModel'

export type VacayPendingInvite = {
  user_id: string | number
  username: string
}

export type VacayIncomingInvite = {
  plan_id: number
  owner_username: string
}

export type VacayPickerOption = {
  value: string
  label: string
}

export type VacayChromeSession = {
  familyChrome: boolean
  plan: VacayPlan | null
  users: VacayUser[]
  pendingInvites: VacayPendingInvite[]
  isFused: boolean
  entries: VacayEntry[]
  companyHolidays: { date: string; note?: string }[]
  stats: VacayStat[]
  selectedYear: number
  selectedUserId: string | number | null
  holidays: HolidaysMap
  tripWindows: VacayTripWindow[]
  approvedTripDates: Set<string>
  proposedTripDates: Set<string>
  currentPersonId: string | number | null
  canReview: boolean
  overlayMode: VacayOverlayMode
  overlayPresets: VacayOverlayPreset[]
  overlayPeople: VacayUser[]
  pendingOutgoing: VacayAccessRequest[]
  incomingAccess: VacayAccessRequest[]
  setSelectedUserId: (id: string | number | null) => void
  updatePlan: (updates: Partial<VacayPlan>) => Promise<void>
  updateColor: (color: string, targetUserId?: string | number) => Promise<void>
  invite: (userId: number) => Promise<void>
  cancelInvite: (userId: number) => Promise<void>
  dissolve: () => Promise<void>
  toggleEntry: (date: string, targetUserId?: string | number, kind?: CalendarEntryKind) => Promise<void>
  toggleCompanyHoliday: (date: string) => Promise<void>
  loadStats: (year?: number) => Promise<void>
  updateVacationDays: (year: number, days: number, targetUserId?: string | number) => Promise<void>
  addHolidayCalendar: (data: { region: string; color?: string; label?: string | null }) => Promise<void>
  updateHolidayCalendar: (id: string | number, data: { region?: string; color?: string; label?: string | null }) => Promise<void>
  deleteHolidayCalendar: (id: string | number) => Promise<void>
  toggleOverlayPreset: (branchId: string, enabled: boolean) => Promise<void>
  addOverlayPerson: (personId: string) => Promise<void>
  removeOverlayPerson: (personId: string) => Promise<void>
  requestCalendarAccess: (target: { personId?: string; branchId?: string }) => Promise<void>
  revokeCalendarAccess: (id: string) => Promise<void>
  loadOverlayPickerOptions: () => Promise<VacayPickerOption[]>
}

const noopAsync = async () => {}

const FamilyVacayContext = createContext<VacayChromeSession | null>(null)

export function FamilyVacayProvider({
  value,
  children,
}: {
  value: VacayChromeSession | null
  children: ReactNode
}) {
  return createElement(FamilyVacayContext.Provider, { value }, children)
}

export function useVacayChrome(): VacayChromeSession {
  const family = useContext(FamilyVacayContext)
  const store = useVacayStore()
  if (family) return family
  return {
    familyChrome: false,
    plan: store.plan,
    users: store.users,
    pendingInvites: store.pendingInvites,
    isFused: store.isFused,
    entries: store.entries,
    companyHolidays: store.companyHolidays,
    stats: store.stats,
    selectedYear: store.selectedYear,
    selectedUserId: store.selectedUserId,
    holidays: store.holidays,
    tripWindows: [],
    approvedTripDates: new Set(),
    proposedTripDates: new Set(),
    currentPersonId: null,
    canReview: store.isFused,
    overlayMode: 'add',
    overlayPresets: [],
    overlayPeople: [],
    pendingOutgoing: [],
    incomingAccess: [],
    setSelectedUserId: store.setSelectedUserId,
    updatePlan: store.updatePlan,
    updateColor: store.updateColor,
    invite: store.invite,
    cancelInvite: store.cancelInvite,
    dissolve: store.dissolve,
    toggleEntry: store.toggleEntry,
    toggleCompanyHoliday: store.toggleCompanyHoliday,
    loadStats: store.loadStats,
    updateVacationDays: store.updateVacationDays,
    addHolidayCalendar: store.addHolidayCalendar,
    updateHolidayCalendar: store.updateHolidayCalendar,
    deleteHolidayCalendar: store.deleteHolidayCalendar,
    toggleOverlayPreset: noopAsync,
    addOverlayPerson: noopAsync,
    removeOverlayPerson: noopAsync,
    requestCalendarAccess: noopAsync,
    revokeCalendarAccess: noopAsync,
    loadOverlayPickerOptions: async () => [],
  }
}
