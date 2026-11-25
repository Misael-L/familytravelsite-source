import { useCallback, useLayoutEffect } from 'react';
import { useToast } from '../../components/shared/Toast';
import {
  classifyFamilyMapError,
  getFamilyMapSettings,
  isMissingMapCredentialError,
  updateFamilyMapSettings,
  type FamilyMapSettings,
  type FamilyMapSettingsPatch,
} from '../../data/supabase/familyMaps';
import { useTranslation } from '../../i18n';
import { useFamilyMapStore } from '../../store/familyMapStore';
import { useFamilySettingsState } from './useFamilySettingsScope';

const EMPTY: FamilyMapSettings = {
  familyId: '',
  canManage: false,
  mapboxPublicToken: null,
  cartoApiKey: null,
  mapboxConfigured: false,
  cartoConfigured: false,
  enabledOptionIds: ['osm'],
  defaultOptionId: 'osm',
  credentialRevision: 0,
  updatedAt: null,
};

export function useFamilyMapSettings() {
  const toast = useToast();
  const { t } = useTranslation();
  const hydrateMaps = useFamilyMapStore((s) => s.hydrate);
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
  } = useFamilySettingsState<FamilyMapSettings>();
  const snapshot = stored?.snapshot ?? EMPTY;

  const reload = useCallback(async () => {
    const request = beginRead();
    if (!request) return;
    try {
      const result = await getFamilyMapSettings(request.familyId);
      if (!request.current()) return;
      if (result.familyId !== request.familyId) throw new Error(t('admin.familyMaps.loadError'));
      setStored({ snapshot: result, scope: request.scope });
      setError(null);
    } catch (err) {
      if (!request.current()) return;
      const kind = classifyFamilyMapError(err);
      const message =
        kind === 'missing_rpc'
          ? t('admin.familyMaps.missingRpc')
          : kind === 'permission'
            ? t('admin.familyMaps.permissionError')
            : kind === 'network'
              ? t('admin.familyMaps.networkError')
              : err instanceof Error
                ? err.message
                : t('admin.familyMaps.loadError');
      setError(message);
      setStored(null);
    } finally {
      if (request.current()) setLoading(false);
    }
  }, [beginRead, setError, setLoading, setStored, t]);

  useLayoutEffect(() => {
    void reload();
  }, [reload, scope]);

  const save = useCallback(
    async (patch: FamilyMapSettingsPatch) => {
      const request = begin();
      if (!request || stored?.scope !== request.scope || !stored.snapshot.canManage) return;
      setSaving(true);
      try {
        const result = await updateFamilyMapSettings(request.familyId, patch);
        if (!request.current()) return;
        if (result.familyId !== request.familyId) throw new Error(t('admin.familyMaps.saveError'));
        setStored({ snapshot: result, scope: request.scope });
        toast.success(t('admin.familyMaps.saved'));
        void hydrateMaps(request.familyId);
      } catch (err) {
        if (!request.current()) return;
        toast.error(
          isMissingMapCredentialError(err)
            ? t('admin.familyMaps.missingCredential')
            : err instanceof Error
              ? err.message
              : t('admin.familyMaps.saveError')
        );
      } finally {
        if (request.current()) setSaving(false);
      }
    },
    [begin, hydrateMaps, setSaving, setStored, stored, t, toast]
  );

  return {
    familyId,
    scope,
    snapshot,
    canManage: snapshot.canManage,
    loading,
    error,
    saving,
    reload,
    save,
  };
}
