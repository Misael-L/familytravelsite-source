import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { captureFamilyActor } from '../../../actorContext';
import { useAuthStore } from '../../store/authStore';

type FamilyAuth = ReturnType<typeof useAuthStore.getState>;

function hasActiveSession(state: FamilyAuth) {
  return state.isAuthenticated && state.authGate === 'ok' && !state.authCheckFailed && !state.isLoading;
}

function activeFamilyId(state: FamilyAuth) {
  return hasActiveSession(state) ? state.familyId : null;
}

function settingsScope(state: FamilyAuth) {
  return JSON.stringify([
    hasActiveSession(state),
    activeFamilyId(state),
    state.authUserId,
    state.personId,
    state.membershipRole,
    state.membershipStatus,
    state.isSuperAdmin,
  ]);
}

export function useFamilySettingsScope(onChange: (familyId: string | null) => void) {
  const familyId = useAuthStore(activeFamilyId);
  const access = useAuthStore(settingsScope);
  const mounted = useRef(false);
  const [scope, setScope] = useState(0);
  const scopeVersion = useRef(0);

  useLayoutEffect(() => {
    mounted.current = true;
    const stop = useAuthStore.subscribe((state, previous) => {
      if (settingsScope(state) === settingsScope(previous)) return;
      setScope(++scopeVersion.current);
      onChange(activeFamilyId(state));
    });
    return () => {
      mounted.current = false;
      scopeVersion.current++;
      stop();
    };
  }, [onChange]);

  const beginSession = useCallback(() => {
    const state = useAuthStore.getState();
    if (!mounted.current || !hasActiveSession(state) || settingsScope(state) !== access) return null;
    const scope = scopeVersion.current;
    const actor = captureFamilyActor();
    return {
      familyId: state.familyId,
      scope,
      current: () => scope === scopeVersion.current && actor.current(),
    };
  }, [access]);

  const begin = useCallback(() => {
    const request = beginSession();
    return request?.familyId ? { ...request, familyId: request.familyId } : null;
  }, [beginSession]);

  return { familyId, scope, begin, beginSession };
}

export function useFamilySettingsState<T>() {
  const [stored, setStored] = useState<{ snapshot: T; scope: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const readVersion = useRef(0);

  const reset = useCallback((nextFamilyId: string | null) => {
    setStored(null);
    setLoading(Boolean(nextFamilyId));
    setError(null);
    setSaving(false);
  }, []);
  const { familyId, scope, begin } = useFamilySettingsScope(reset);

  const beginRead = useCallback(() => {
    const request = begin();
    if (!request) {
      reset(null);
      return null;
    }
    const version = ++readVersion.current;
    setLoading(true);
    return { ...request, current: () => request.current() && version === readVersion.current };
  }, [begin, reset]);

  return {
    familyId,
    scope,
    begin,
    beginRead,
    stored,
    setStored,
    loading,
    setLoading,
    error,
    setError,
    saving,
    setSaving,
  };
}
