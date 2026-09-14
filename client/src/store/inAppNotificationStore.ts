import { create } from 'zustand'
import { inAppNotificationsApi } from '../api/client'
import { isSupabaseDataPlane } from '../data/supabase/auth'
import type { FamilyRealtimeStatus } from '../data/supabase/familyRealtime'
import { useAuthStore } from './authStore'
import {
  countMyUnreadNotifications,
  dismissAllNotifications,
  dismissNotifications,
  familyEventTextKey,
  familyEventTitleKey,
  familyInboxNavigateTarget,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  markNotificationsUnread,
  type FamilyInboxItem,
} from '../data/supabase/familyNotifications'

// The server contract (@trek/shared `inAppListResultSchema`) deliberately keeps
// each notification row as an open record — the registry-derived shape varies by
// type. This is the client's structured view of that row; the list/unread-count
// responses themselves are now typed + DEV-validated via inAppNotificationsApi.
// Family UUID rows and Nest numeric rows share these pixels; Nest IDs are not SoR.
export type InAppNotificationId = number | string

export interface InAppNotification {
  id: InAppNotificationId
  type: 'simple' | 'boolean' | 'navigate'
  scope: 'trip' | 'user' | 'admin'
  target: number
  sender_id: number | null
  sender_username: string | null
  sender_avatar: string | null
  recipient_id: number
  title_key: string
  title_params: Record<string, string>
  text_key: string
  text_params: Record<string, string>
  positive_text_key: string | null
  negative_text_key: string | null
  response: 'positive' | 'negative' | null
  navigate_text_key: string | null
  navigate_target: string | null
  is_read: boolean
  created_at: string
}

interface RawNotification extends Omit<InAppNotification, 'title_params' | 'text_params' | 'is_read'> {
  title_params: string | Record<string, string>
  text_params: string | Record<string, string>
  is_read: number | boolean
}

function sameId(a: InAppNotificationId, b: InAppNotificationId): boolean {
  return String(a) === String(b)
}

function nestNumericId(id: InAppNotificationId): number {
  return typeof id === 'number' ? id : Number(id)
}

function familyId(): string | null {
  return useAuthStore.getState().familyId
}

function mapFamilyItem(item: FamilyInboxItem): InAppNotification {
  const params = item.label ? { label: item.label } : {}
  return {
    id: item.id,
    type: 'navigate',
    scope: item.destinationKind === 'access_request' ? 'admin' : 'trip',
    target: 0,
    sender_id: null,
    sender_username: null,
    sender_avatar: null,
    recipient_id: 0,
    title_key: familyEventTitleKey(item.eventKey),
    title_params: params,
    text_key: familyEventTextKey(item.eventKey),
    text_params: params,
    positive_text_key: null,
    negative_text_key: null,
    response: null,
    navigate_text_key: 'notifications.open',
    navigate_target: familyInboxNavigateTarget(item),
    is_read: Boolean(item.readAt),
    created_at: item.createdAt,
  }
}

function normalizeNotification(raw: RawNotification): InAppNotification {
  return {
    ...raw,
    title_params: typeof raw.title_params === 'string' ? JSON.parse(raw.title_params || '{}') : raw.title_params,
    text_params: typeof raw.text_params === 'string' ? JSON.parse(raw.text_params || '{}') : raw.text_params,
    is_read: Boolean(raw.is_read),
  }
}

interface NotificationState {
  notifications: InAppNotification[]
  unreadCount: number
  total: number
  isLoading: boolean
  hasMore: boolean
  familyCursor: { beforeCreatedAt: string; beforeId: string } | null
  inboxStale: boolean
  inboxPageActive: boolean
  realtimeStatus: FamilyRealtimeStatus

  fetchNotifications: (reset?: boolean) => Promise<void>
  fetchUnreadCount: () => Promise<void>
  markRead: (id: InAppNotificationId) => Promise<void>
  markUnread: (id: InAppNotificationId) => Promise<void>
  markAllRead: () => Promise<void>
  deleteNotification: (id: InAppNotificationId) => Promise<void>
  deleteAll: () => Promise<void>
  respondToBoolean: (id: InAppNotificationId, response: 'positive' | 'negative') => Promise<void>

  handleNewNotification: (notification: RawNotification) => void
  handleUpdatedNotification: (notification: RawNotification) => void
  beginFamilyInboxSession: (familyId: string, personId: string) => void
  resetFamilyInboxSession: () => void
  invalidateFamilyInbox: () => void
  setInboxPageActive: (active: boolean) => void
  setRealtimeStatus: (status: FamilyRealtimeStatus) => void
}

const PAGE_SIZE = 20

let inboxGeneration = 0
let inboxSessionFamilyId: string | null = null
let inboxSessionPersonId: string | null = null
let pendingFamilyReset = false

function currentPersonId(): string | null {
  return useAuthStore.getState().personId
}

function familyInboxSessionCurrent(fid: string | null, pid: string | null, gen: number): boolean {
  if (gen !== inboxGeneration) return false
  if (inboxSessionFamilyId !== fid || inboxSessionPersonId !== pid) return false
  const auth = useAuthStore.getState()
  return auth.familyId === fid && auth.personId === pid
}

export const useInAppNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  total: 0,
  isLoading: false,
  hasMore: false,
  familyCursor: null,
  inboxStale: false,
  inboxPageActive: false,
  realtimeStatus: 'idle',

  fetchNotifications: async (reset = false) => {
    const { notifications, isLoading, familyCursor } = get()
    if (isLoading) {
      if (reset && isSupabaseDataPlane()) pendingFamilyReset = true
      return
    }
    set({ isLoading: true })

    if (isSupabaseDataPlane()) {
      const fid = familyId()
      const pid = currentPersonId()
      const gen = inboxGeneration
      if (!fid) {
        set({ notifications: [], total: 0, unreadCount: 0, hasMore: false, familyCursor: null, isLoading: false, inboxStale: false })
        return
      }
      try {
        const page = await listMyNotifications(fid, {
          limit: PAGE_SIZE,
          beforeCreatedAt: reset ? null : familyCursor?.beforeCreatedAt,
          beforeId: reset ? null : familyCursor?.beforeId,
        })
        const unread = await countMyUnreadNotifications(fid)
        if (!familyInboxSessionCurrent(fid, pid, gen)) {
          if (gen === inboxGeneration) set({ isLoading: false })
          return
        }
        const mapped = page.items.map(mapFamilyItem)
        const merged = reset ? mapped : [...notifications, ...mapped]
        set({
          notifications: merged,
          total: merged.length,
          unreadCount: unread,
          hasMore: page.nextCursor != null,
          familyCursor: page.nextCursor,
          isLoading: false,
          inboxStale: false,
        })
      } catch {
        if (!familyInboxSessionCurrent(fid, pid, gen)) {
          if (gen === inboxGeneration) set({ isLoading: false })
          return
        }
        set({ isLoading: false })
      }
      if (pendingFamilyReset && familyInboxSessionCurrent(fid, pid, gen)) {
        pendingFamilyReset = false
        void get().fetchNotifications(true)
      }
      return
    }

    try {
      const offset = reset ? 0 : notifications.length
      const data = await inAppNotificationsApi.list({ limit: PAGE_SIZE, offset })
      const normalized = (data.notifications as unknown as RawNotification[]).map(normalizeNotification)

      set({
        notifications: reset ? normalized : [...notifications, ...normalized],
        total: data.total,
        unreadCount: data.unread_count,
        hasMore: (reset ? normalized.length : notifications.length + normalized.length) < data.total,
        isLoading: false,
      })
    } catch {
      set({ isLoading: false })
    }
  },

  fetchUnreadCount: async () => {
    try {
      if (isSupabaseDataPlane()) {
        const fid = familyId()
        const pid = currentPersonId()
        const gen = inboxGeneration
        if (!fid) {
          set({ unreadCount: 0 })
          return
        }
        const unread = await countMyUnreadNotifications(fid)
        if (!familyInboxSessionCurrent(fid, pid, gen)) return
        set({ unreadCount: unread })
        return
      }
      const data = await inAppNotificationsApi.unreadCount()
      set({ unreadCount: data.count })
    } catch {
      // best-effort — do not treat a failed refresh as an empty inbox
    }
  },

  markRead: async (id) => {
    try {
      if (isSupabaseDataPlane()) await markNotificationsRead([String(id)])
      else await inAppNotificationsApi.markRead(nestNumericId(id))
      set(state => ({
        notifications: state.notifications.map(n => sameId(n.id, id) ? { ...n, is_read: true } : n),
        unreadCount: Math.max(0, state.unreadCount - (state.notifications.find(n => sameId(n.id, id))?.is_read ? 0 : 1)),
      }))
    } catch {
      // best-effort
    }
  },

  markUnread: async (id) => {
    try {
      if (isSupabaseDataPlane()) await markNotificationsUnread([String(id)])
      else await inAppNotificationsApi.markUnread(nestNumericId(id))
      set(state => ({
        notifications: state.notifications.map(n => sameId(n.id, id) ? { ...n, is_read: false } : n),
        unreadCount: state.unreadCount + (state.notifications.find(n => sameId(n.id, id))?.is_read ? 1 : 0),
      }))
    } catch {
      // best-effort
    }
  },

  markAllRead: async () => {
    try {
      if (isSupabaseDataPlane()) {
        const fid = familyId()
        if (fid) await markAllNotificationsRead(fid)
      } else {
        await inAppNotificationsApi.markAllRead()
      }
      set(state => ({
        notifications: state.notifications.map(n => ({ ...n, is_read: true })),
        unreadCount: 0,
      }))
    } catch {
      // best-effort
    }
  },

  deleteNotification: async (id) => {
    const notification = get().notifications.find(n => sameId(n.id, id))
    try {
      if (isSupabaseDataPlane()) await dismissNotifications([String(id)])
      else await inAppNotificationsApi.delete(nestNumericId(id))
      set(state => ({
        notifications: state.notifications.filter(n => !sameId(n.id, id)),
        total: Math.max(0, state.total - 1),
        unreadCount: notification && !notification.is_read ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      }))
    } catch {
      // best-effort
    }
  },

  deleteAll: async () => {
    try {
      if (isSupabaseDataPlane()) {
        const fid = familyId()
        if (fid) await dismissAllNotifications(fid)
      } else {
        await inAppNotificationsApi.deleteAll()
      }
      set({ notifications: [], total: 0, unreadCount: 0, hasMore: false, familyCursor: null })
    } catch {
      // best-effort
    }
  },

  respondToBoolean: async (id, response) => {
    if (isSupabaseDataPlane()) return
    try {
      const data = await inAppNotificationsApi.respond(nestNumericId(id), response)
      if (data.notification) {
        const normalized = normalizeNotification(data.notification as RawNotification)
        set(state => ({
          notifications: state.notifications.map(n => sameId(n.id, id) ? normalized : n),
          unreadCount: !state.notifications.find(n => sameId(n.id, id))?.is_read
            ? Math.max(0, state.unreadCount - 1)
            : state.unreadCount,
        }))
      }
    } catch {
      // best-effort
    }
  },

  handleNewNotification: (raw: RawNotification) => {
    const notification = normalizeNotification(raw)
    set(state => ({
      notifications: [notification, ...state.notifications],
      total: state.total + 1,
      unreadCount: state.unreadCount + 1,
    }))
  },

  handleUpdatedNotification: (raw: RawNotification) => {
    const notification = normalizeNotification(raw)
    set(state => ({
      notifications: state.notifications.map(n => sameId(n.id, notification.id) ? notification : n),
    }))
  },

  beginFamilyInboxSession: (nextFamilyId, nextPersonId) => {
    if (inboxSessionFamilyId === nextFamilyId && inboxSessionPersonId === nextPersonId) return
    inboxGeneration += 1
    pendingFamilyReset = false
    inboxSessionFamilyId = nextFamilyId
    inboxSessionPersonId = nextPersonId
    set({
      notifications: [],
      unreadCount: 0,
      total: 0,
      hasMore: false,
      familyCursor: null,
      inboxStale: false,
      isLoading: false,
    })
  },

  resetFamilyInboxSession: () => {
    inboxGeneration += 1
    pendingFamilyReset = false
    inboxSessionFamilyId = null
    inboxSessionPersonId = null
    set({
      notifications: [],
      unreadCount: 0,
      total: 0,
      hasMore: false,
      familyCursor: null,
      inboxStale: false,
      inboxPageActive: false,
      realtimeStatus: 'idle',
      isLoading: false,
    })
  },

  invalidateFamilyInbox: () => {
    const fid = familyId()
    const pid = currentPersonId()
    if (!familyInboxSessionCurrent(fid, pid, inboxGeneration)) return
    set({ inboxStale: true })
    void get().fetchUnreadCount()
    if (get().inboxPageActive) void get().fetchNotifications(true)
  },

  setInboxPageActive: (active) => {
    set({ inboxPageActive: active })
  },

  setRealtimeStatus: (next) => {
    set({ realtimeStatus: next })
  },
}))

export function resetFamilyInboxGenerationForTests(): void {
  inboxGeneration = 0
  inboxSessionFamilyId = null
  inboxSessionPersonId = null
  pendingFamilyReset = false
}

