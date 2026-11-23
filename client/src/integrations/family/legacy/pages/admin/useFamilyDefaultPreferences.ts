import { useCallback, useLayoutEffect } from 'react';
import { useToast } from '../../components/shared/Toast';
import {
  getFamilyPreferenceDefaults,
  updateFamilyPreferenceDefaults,
  type FamilyPreferenceDefaults,
  type PreferenceFields,
  type PreferencePatch,
} from '../../data/supabase/familyPreferences';
import { useTranslation } from '../../i18n';
import { useFamilySettingsState } from './useFamilySettingsScope';

const EMPTY: PreferenceFields = {
  temperatureUnit: null,
  distanceUnit: null,
  timeFormat: null,
  displayCurrency: null,
};

export function useFamilyDefaultPreferences() {
  const toast = useToast();
  const { t } = useTranslation();
  const {
    scope,
    familyId,
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
  } = useFamilySettingsState<FamilyPreferenceDefaults>();

  const reload = useCallback(async () => {
    const request = beginRead();
    if (!request) return;
    try {
      const snapshot = await getFamilyPreferenceDefaults(request.familyId);
      if (!request.current()) return;
      if (snapshot.familyId !== request.familyId) throw new Error(t('admin.familyDefaults.loadError'));
      setStored({ snapshot, scope: request.scope });
      setError(null);
    } catch (err) {
      if (!request.current()) return;
      setError(err instanceof Error ? err.message : t('admin.familyDefaults.loadError'));
      setStored(null);
    } finally {
      if (request.current()) setLoading(false);
    }
  }, [beginRead, setError, setLoading, setStored, t]);

  useLayoutEffect(() => {
    void reload();
  }, [reload, scope]);

  const save = useCallback(
    async (patch: PreferencePatch) => {
      const request = begin();
      if (!request || stored?.scope !== request.scope || !stored.snapshot.canManage) return;
      setSaving(true);
      try {
        const snapshot = await updateFamilyPreferenceDefaults(request.familyId, patch);
        if (!request.current()) return;
        if (snapshot.familyId !== request.familyId) throw new Error(t('admin.familyDefaults.saveError'));
        setStored({ snapshot, scope: request.scope });
        toast.success(t('admin.familyDefaults.saved'));
      } catch (err) {
        if (request.current()) toast.error(err instanceof Error ? err.message : t('admin.familyDefaults.saveError'));
      } finally {
        if (request.current()) setSaving(false);
      }
    },
    [begin, setSaving, setStored, stored, t, toast]
  );

  const resetField = useCallback(
    async (field: keyof PreferencePatch) => {
      await save({ [field]: null });
    },
    [save]
  );

  return {
    familyId,
    defaults: stored?.snapshot.defaults ?? EMPTY,
    canManage: stored?.snapshot.canManage ?? false,
    loading,
    error,
    saving,
    reload,
    save,
    resetField,
  };
}
