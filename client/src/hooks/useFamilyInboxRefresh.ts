import { useEffect } from 'react'
import { isSupabaseDataPlane } from '../data/supabase/auth'
import { familyRealtime } from '../data/supabase/familyRealtime'
import { selectMayHydratePrivateFamily, useAuthStore } from '../store/authStore'
import { useInAppNotificationStore } from '../store/inAppNotificationStore.ts'

const POLL_MS = 60_000

/**
 * Family plane: refresh inbox on auth, visibility, a modest interval, and §43 Postgres Changes.
 * Nest WS stays in useInAppNotificationListener.
 */
export function useFamilyInboxRefresh(): void {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const familyId = useAuthStore(s => s.familyId)
  const personId = useAuthStore(s => s.personId)
  const authGate = useAuthStore(s => s.authGate)
  const fetchUnreadCount = useInAppNotificationStore(s => s.fetchUnreadCount)
  const beginFamilyInboxSession = useInAppNotificationStore(s => s.beginFamilyInboxSession)
  const resetFamilyInboxSession = useInAppNotificationStore(s => s.resetFamilyInboxSession)
  const invalidateFamilyInbox = useInAppNotificationStore(s => s.invalidateFamilyInbox)
  const setRealtimeStatus = useInAppNotificationStore(s => s.setRealtimeStatus)
  const mayHydrate = selectMayHydratePrivateFamily(authGate)

  useEffect(() => {
    if (!isSupabaseDataPlane()) return
    if (!isAuthenticated || !familyId || !personId || !mayHydrate) {
      familyRealtime.stopAll()
      if (!isAuthenticated || !familyId || !personId) resetFamilyInboxSession()
      return
    }
    beginFamilyInboxSession(familyId, personId)
    void fetchUnreadCount()
    familyRealtime.startSession({
      familyId,
      personId,
      onNotificationChange: () => invalidateFamilyInbox(),
      onStatus: setRealtimeStatus,
    })
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchUnreadCount()
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void fetchUnreadCount()
    }, POLL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
      familyRealtime.stopSession()
    }
  }, [
    isAuthenticated,
    familyId,
    personId,
    mayHydrate,
    fetchUnreadCount,
    beginFamilyInboxSession,
    resetFamilyInboxSession,
    invalidateFamilyInbox,
    setRealtimeStatus,
  ])
}
