import { useEffect } from 'react'
import { isSupabaseDataPlane } from '../data/supabase/auth'
import { familyRealtime, isFamilyRealtimeUuid } from '../data/supabase/familyRealtime'
import { selectMayHydratePrivateFamily, useAuthStore } from '../store/authStore'

/**
 * Bind the open Family UUID trip to the §43 Realtime channel.
 * The adapter coalesces itinerary bursts; this hook only binds/unbinds the active trip.
 */
export function useFamilyItineraryRealtime(tripId: string, onReload: () => void | Promise<void>): void {
  const authGate = useAuthStore(s => s.authGate)
  const familyId = useAuthStore(s => s.familyId)
  const personId = useAuthStore(s => s.personId)
  const mayHydrate = selectMayHydratePrivateFamily(authGate)

  useEffect(() => {
    if (
      !isSupabaseDataPlane()
      || !mayHydrate
      || !familyId
      || !personId
      || !tripId
      || !isFamilyRealtimeUuid(tripId)
    ) {
      familyRealtime.bindItinerary(null)
      return
    }
    familyRealtime.bindItinerary({
      tripId,
      onChange: () => { void onReload() },
    })
    return () => {
      familyRealtime.bindItinerary(null)
    }
  }, [tripId, familyId, personId, mayHydrate, onReload])
}
