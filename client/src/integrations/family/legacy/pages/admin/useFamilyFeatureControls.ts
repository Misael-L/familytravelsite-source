import { useCallback, useLayoutEffect } from 'react';
import { useToast } from '../../components/shared/Toast';
import {
  listFamilyFeatureControls,
  listFeatureRolloutEvents,
  updateFamilyFeatureOverrides,
  updateFeatureRollout,
  type FamilyFeatureControls,
  type FamilyFeatureKey,
  type FamilyFeatureMode,
  type FamilyFeatureRolloutState,
  type FeatureRolloutEvent,
} from '../../data/supabase/familyFeatures';
import { useTranslation } from '../../i18n';
import { useFamilyFeatureStore } from '../../store/familyFeatureStore';
import { useFamilySettingsState } from './useFamilySettingsScope';

function modeToPatch(mode: FamilyFeatureMode): boolean | null {
  if (mode === 'inherit') return null;
  return mode === 'enabled';
}

type FeatureSnapshot = FamilyFeatureControls & { events: FeatureRolloutEvent[] };

export function useFamilyFeatureControls() {
  const toast = useToast();
  const { t } = useTranslation();
  const refreshAvailability = useFamilyFeatureStore((s) => s.refresh);
  const { scope, begin, beginRead, stored, setStored, loading, setLoading, error, setError, saving, setSaving } =
    useFamilySettingsState<FeatureSnapshot>();

  const reload = useCallback(async () => {
    const request = beginRead();
    if (!request) return;
    try {
      const controls = await listFamilyFeatureControls(request.familyId);
      if (!request.current()) return;
      if (controls.familyId !== request.familyId) throw new Error(t('admin.familyFeatures.loadError'));
      const events = controls.isSuperAdmin ? await listFeatureRolloutEvents(40) : [];
      if (!request.current()) return;
      setStored({ snapshot: { ...controls, events }, scope: request.scope });
      setError(null);
    } catch (err) {
      if (!request.current()) return;
      setError(err instanceof Error ? err.message : t('admin.familyFeatures.loadError'));
      setStored(null);
    } finally {
      if (request.current()) setLoading(false);
    }
  }, [beginRead, setError, setLoading, setStored, t]);

  useLayoutEffect(() => {
    void reload();
  }, [reload, scope]);

  const handleSaveError = useCallback(
    (err: unknown) => toast.error(err instanceof Error ? err.message : t('admin.familyFeatures.saveError')),
    [t, toast]
  );

  const saveFamilyMode = useCallback(
    async (key: FamilyFeatureKey, mode: FamilyFeatureMode) => {
      const request = begin();
      if (!request || stored?.scope !== request.scope || !stored.snapshot.canManage) return;
      setSaving(true);
      try {
        const controls = await updateFamilyFeatureOverrides(request.familyId, { [key]: modeToPatch(mode) });
        if (!request.current()) return;
        if (controls.familyId !== request.familyId) throw new Error(t('admin.familyFeatures.saveError'));
        const events = controls.isSuperAdmin ? stored.snapshot.events : [];
        setStored({ snapshot: { ...controls, events }, scope: request.scope });
        await refreshAvailability();
        if (request.current()) toast.success(t('admin.familyFeatures.saved'));
      } catch (err) {
        if (request.current()) handleSaveError(err);
      } finally {
        if (request.current()) setSaving(false);
      }
    },
    [begin, handleSaveError, refreshAvailability, setSaving, setStored, stored, t, toast]
  );

  const saveRollout = useCallback(
    async (key: FamilyFeatureKey, state: FamilyFeatureRolloutState) => {
      const request = begin();
      if (!request || stored?.scope !== request.scope || !stored.snapshot.isSuperAdmin) return;
      setSaving(true);
      try {
        await updateFeatureRollout(key, state);
        if (!request.current()) return;
        await reload();
        if (!request.current()) return;
        await refreshAvailability();
        if (request.current()) toast.success(t('admin.familyFeatures.rolloutSaved'));
      } catch (err) {
        if (request.current()) handleSaveError(err);
      } finally {
        if (request.current()) setSaving(false);
      }
    },
    [begin, handleSaveError, refreshAvailability, reload, setSaving, stored, t, toast]
  );

  const snapshot = stored?.snapshot ?? null;
  return {
    snapshot,
    events: snapshot?.events ?? [],
    canManage: snapshot?.canManage ?? false,
    isSuperAdmin: snapshot?.isSuperAdmin ?? false,
    loading,
    error,
    saving,
    saveFamilyMode,
    saveRollout,
  };
}
