import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import {
  listFamilyAuditEvents,
  type FamilyAuditEvent,
  type FamilyPermissionOutcome,
} from '../../data/supabase/familyPermissions'

export function useFamilyProductAudit() {
  const familyId = useAuthStore(s => s.familyId)
  const [events, setEvents] = useState<FamilyAuditEvent[]>([])
  const [nextCursor, setNextCursor] = useState<{ createdAt: string; id: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [capabilityKey, setCapabilityKey] = useState('')
  const [outcome, setOutcome] = useState<'' | FamilyPermissionOutcome>('')
  const [actorPersonId, setActorPersonId] = useState('')

  const load = useCallback(async (opts?: { append?: boolean }) => {
    if (!familyId) {
      setEvents([])
      setLoading(false)
      return
    }
    const append = !!opts?.append
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const page = await listFamilyAuditEvents({
        familyId,
        limit: 40,
        beforeCreatedAt: append ? nextCursor?.createdAt : null,
        beforeId: append ? nextCursor?.id : null,
        capabilityKey: capabilityKey || null,
        outcome: outcome || null,
        actorPersonId: actorPersonId || null,
      })
      setEvents(prev => append ? [...prev, ...page.events] : page.events)
      setNextCursor(page.nextCursor)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load audit')
      if (!append) setEvents([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [actorPersonId, capabilityKey, familyId, nextCursor?.createdAt, nextCursor?.id, outcome])

  useEffect(() => {
    void load()
    // Reload when filters change, not when the pagination cursor advances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, capabilityKey, outcome, actorPersonId])

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return
    void load({ append: true })
  }, [load, loadingMore, nextCursor])

  return {
    events,
    loading,
    loadingMore,
    error,
    nextCursor,
    capabilityKey,
    setCapabilityKey,
    outcome,
    setOutcome,
    actorPersonId,
    setActorPersonId,
    reload: () => { void load() },
    loadMore,
  }
}
