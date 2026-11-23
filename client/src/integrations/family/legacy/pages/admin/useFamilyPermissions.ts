import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { captureFamilyActor } from '../../../actorContext';
import { useToast } from '../../components/shared/Toast';
import {
  listFamilyPermissionPolicies,
  resetFamilyPermissionPolicies,
  updateFamilyPermissionPolicies,
  type FamilyCapabilityKey,
  type FamilyPermissionActorScope,
  type FamilyPermissionPolicyList,
} from '../../data/supabase/familyPermissions';
import { useTranslation } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { groupPolicies } from './familyPermissionsModel';

type FamilyAuth = ReturnType<typeof useAuthStore.getState>;

function activeFamilyId(state: FamilyAuth) {
  return state.isAuthenticated && state.authGate === 'ok' && !state.authCheckFailed ? state.familyId : null;
}

function permissionScope(state: FamilyAuth) {
  return JSON.stringify([
    activeFamilyId(state),
    state.authUserId,
    state.personId,
    state.membershipRole,
    state.membershipStatus,
    state.isSuperAdmin,
  ]);
}

export function useFamilyPermissions() {
  const familyId = useAuthStore(activeFamilyId);
  const toast = useToast();
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<{ data: FamilyPermissionPolicyList; ownsScope: () => boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const scopeVersion = useRef(0);
  const latestRequest = useRef(0);

  useLayoutEffect(() => {
    const stop = useAuthStore.subscribe((state, previous) => {
      if (permissionScope(state) === permissionScope(previous)) return;
      scopeVersion.current++;
      setSnapshot(null);
      setLoading(true);
      setSaving(false);
      setError(null);
      setConfirmReset(false);
      setRefresh((value) => value + 1);
    });
    return () => {
      scopeVersion.current++;
      stop();
    };
  }, []);

  const beginRequest = useCallback((id: string) => {
    if (activeFamilyId(useAuthStore.getState()) !== id) return null;
    const scope = scopeVersion.current;
    const actor = captureFamilyActor();
    const request = ++latestRequest.current;
    const ownsScope = () => scope === scopeVersion.current && actor.current();
    return { ownsScope, isCurrent: () => ownsScope() && request === latestRequest.current };
  }, []);

  const reload = useCallback(async () => {
    if (!familyId) {
      setLoading(false);
      return;
    }
    const request = beginRequest(familyId);
    if (!request) return;
    setLoading(true);
    setSaving(false);
    try {
      const result = await listFamilyPermissionPolicies(familyId);
      if (!request.isCurrent()) return;
      if (result.familyId !== familyId) throw new Error(t('admin.permissions.loadError'));
      setSnapshot({ data: result, ownsScope: request.ownsScope });
      setError(null);
    } catch (err) {
      if (!request.isCurrent()) return;
      setError(err instanceof Error ? err.message : t('admin.permissions.loadError'));
      setSnapshot(null);
    } finally {
      if (request.isCurrent()) setLoading(false);
    }
  }, [beginRequest, familyId, t]);

  useEffect(() => {
    void reload();
  }, [refresh, reload]);

  const canManage = snapshot?.data.familyId === familyId && snapshot.data.canManage;
  const mutate = useCallback(
    async (
      operation: (id: string) => Promise<FamilyPermissionPolicyList>,
      successKey: 'admin.permissions.saved' | 'admin.permissions.resetDone'
    ) => {
      if (!familyId || !canManage || !snapshot?.ownsScope()) return;
      const request = beginRequest(familyId);
      if (!request) return;
      setSaving(true);
      try {
        const result = await operation(familyId);
        if (!request.isCurrent()) return;
        if (result.familyId !== familyId) throw new Error(t('admin.permissions.saveError'));
        setSnapshot({ data: result, ownsScope: request.ownsScope });
        if (successKey === 'admin.permissions.resetDone') setConfirmReset(false);
        toast.success(t(successKey));
      } catch (err) {
        if (request.isCurrent()) toast.error(err instanceof Error ? err.message : t('admin.permissions.saveError'));
      } finally {
        if (request.isCurrent()) setSaving(false);
      }
    },
    [beginRequest, canManage, familyId, snapshot, t, toast]
  );

  const saveRow = useCallback(
    (
      key: FamilyCapabilityKey,
      directScope: FamilyPermissionActorScope | null,
      proposeScope: FamilyPermissionActorScope | null
    ) =>
      mutate(
        (id) => updateFamilyPermissionPolicies(id, [{ key, directScope, proposeScope }]),
        'admin.permissions.saved'
      ),
    [mutate]
  );

  const resetAll = useCallback(() => mutate(resetFamilyPermissionPolicies, 'admin.permissions.resetDone'), [mutate]);
  const policies = snapshot?.data.familyId === familyId ? snapshot.data.policies : [];

  return {
    familyId,
    loading,
    error,
    saving,
    canManage,
    groups: groupPolicies(policies),
    customizedCount: policies.filter((p) => p.isCustom).length,
    reload,
    saveRow,
    resetAll,
    confirmReset,
    setConfirmReset,
  };
}
