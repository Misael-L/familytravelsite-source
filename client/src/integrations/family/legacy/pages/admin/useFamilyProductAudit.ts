import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { captureFamilyActor } from '../../../actorContext';
import {
  listFamilyAuditEvents,
  type FamilyAuditEvent,
  type FamilyAuditPage,
  type FamilyPermissionOutcome,
} from '../../data/supabase/familyPermissions';
import { useAuthStore } from '../../store/authStore';

type FamilyAuth = ReturnType<typeof useAuthStore.getState>;
type AuditCursor = NonNullable<FamilyAuditPage['nextCursor']>;

function activeFamilyId(state: FamilyAuth) {
  return state.isAuthenticated && state.authGate === 'ok' && !state.authCheckFailed && !state.isLoading
    ? state.familyId
    : null;
}

function auditScope(state: FamilyAuth) {
  return JSON.stringify([
    activeFamilyId(state),
    state.authUserId,
    state.personId,
    state.membershipRole,
    state.membershipStatus,
    state.isSuperAdmin,
  ]);
}

export function useFamilyProductAudit() {
  const familyId = useAuthStore(activeFamilyId);
  const [events, setEvents] = useState<FamilyAuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<AuditCursor | null>(null);
  const [loading, setLoading] = useState(Boolean(familyId));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capabilityKey, setCapabilityKey] = useState('');
  const [outcome, setOutcome] = useState<'' | FamilyPermissionOutcome>('');
  const [actorPersonId, setActorPersonId] = useState('');
  const [scopeVersion, setScopeVersion] = useState(0);
  const latestRequest = useRef(0);

  useLayoutEffect(() => {
    // Observe every transition, including signing out and returning to the
    // same account before React renders the intermediate state.
    return useAuthStore.subscribe((state, previous) => {
      if (auditScope(state) === auditScope(previous)) return;
      latestRequest.current++;
      setEvents([]);
      setNextCursor(null);
      setError(null);
      setLoading(Boolean(activeFamilyId(state)));
      setLoadingMore(false);
      setScopeVersion((version) => version + 1);
    });
  }, []);

  const load = useCallback(
    async (cursor?: AuditCursor) => {
      if (!familyId || activeFamilyId(useAuthStore.getState()) !== familyId) return;
      const actor = captureFamilyActor();
      const request = ++latestRequest.current;
      const isCurrent = () => request === latestRequest.current && actor.current();

      if (cursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setLoadingMore(false);
        setNextCursor(null);
      }
      try {
        const page = await listFamilyAuditEvents({
          familyId,
          limit: 40,
          beforeCreatedAt: cursor?.createdAt,
          beforeId: cursor?.id,
          capabilityKey: capabilityKey || null,
          outcome: outcome || null,
          actorPersonId: actorPersonId || null,
        });
        if (!isCurrent()) return;
        setEvents((prev) => (cursor ? [...prev, ...page.events] : page.events));
        setNextCursor(page.nextCursor);
        setError(null);
      } catch (err) {
        if (!isCurrent()) return;
        setError(err instanceof Error ? err.message : 'Could not load audit');
        if (!cursor) setEvents([]);
      } finally {
        if (isCurrent()) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [actorPersonId, capabilityKey, familyId, outcome]
  );

  useLayoutEffect(() => {
    void load();
    return () => {
      latestRequest.current++;
    };
  }, [load, scopeVersion]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loading || loadingMore) return;
    void load(nextCursor);
  }, [load, loading, loadingMore, nextCursor]);

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
    reload: () => {
      void load();
    },
    loadMore,
  };
}
