import { useCallback, useLayoutEffect } from 'react';
import { useToast } from '../../components/shared/Toast';
import {
  getFamilyNotificationDefaults,
  updateFamilyNotificationDefaults,
  type FamilyNotificationDefaults,
} from '../../data/supabase/familyNotifications';
import { useTranslation } from '../../i18n';
import { useFamilySettingsState } from './useFamilySettingsScope';

export function useFamilyNotificationDefaults() {
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
  } = useFamilySettingsState<FamilyNotificationDefaults>();

  const reload = useCallback(async () => {
    const request = beginRead();
    if (!request) return;
    try {
      const snapshot = await getFamilyNotificationDefaults(request.familyId);
      if (!request.current()) return;
      if (snapshot.familyId !== request.familyId) throw new Error(t('admin.familyNotifications.loadError'));
      setStored({ snapshot, scope: request.scope });
      setError(null);
    } catch (err) {
      if (!request.current()) return;
      setError(err instanceof Error ? err.message : t('admin.familyNotifications.loadError'));
      setStored(null);
    } finally {
      if (request.current()) setLoading(false);
    }
  }, [beginRead, setError, setLoading, setStored, t]);

  useLayoutEffect(() => {
    void reload();
  }, [reload, scope]);

  const save = useCallback(
    async (patch: Record<string, boolean | null>) => {
      const request = begin();
      if (!request || stored?.scope !== request.scope || !stored.snapshot.canManage) return;
      setSaving(true);
      try {
        const snapshot = await updateFamilyNotificationDefaults(request.familyId, patch, () => {
          if (!request.current()) throw new Error(t('admin.familyNotifications.saveError'));
        });
        if (!request.current()) return;
        if (snapshot.familyId !== request.familyId) throw new Error(t('admin.familyNotifications.saveError'));
        setStored({ snapshot, scope: request.scope });
        toast.success(t('admin.familyNotifications.saved'));
      } catch (err) {
        if (request.current())
          toast.error(err instanceof Error ? err.message : t('admin.familyNotifications.saveError'));
      } finally {
        if (request.current()) setSaving(false);
      }
    },
    [begin, setSaving, setStored, stored, t, toast]
  );

  const snapshot = stored?.snapshot ?? null;
  return { familyId, snapshot, canManage: snapshot?.canManage ?? false, loading, error, saving, reload, save };
}
