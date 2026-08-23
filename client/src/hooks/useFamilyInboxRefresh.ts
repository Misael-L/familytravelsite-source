import { useEffect } from 'react'
import { isSupabaseDataPlane } from '../data/supabase/auth'
import { selectMayHydratePrivateFamily, useAuthStore } from '../store/authStore'
import { useInAppNotificationStore } from '../store/inAppNotificationStore.ts'

const POLL_MS = 60_000

/** Family plane: refresh inbox on auth, visibility, and a modest active-session interval. Nest WS stays in useInAppNotificationListener. */
export function useFamilyInboxRefresh(): void {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const familyId = useAuthStore(s => s.familyId)
  const authGate = useAuthStore(s => s.authGate)
  const fetchUnreadCount = useInAppNotificationStore(s => s.fetchUnreadCount)
  const mayHydrate = selectMayHydratePrivateFamily(authGate)

  useEffect(() => {
    if (!isSupabaseDataPlane() || !isAuthenticated || !familyId || !mayHydrate) return
    void fetchUnreadCount()
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
    }
  }, [isAuthenticated, familyId, mayHydrate, fetchUnreadCount])
}
