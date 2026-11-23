import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useToast } from '../../components/shared/Toast';
import {
  getFamilyFilePolicy,
  getFamilyIdentityAssurance,
  linkFamilyMemberPerson,
  type FamilyFilePolicy,
  type FamilyIdentityAssurance,
} from '../../data/supabase/familyIdentity';
import { useTranslation } from '../../i18n';
import { useFamilySettingsScope } from './useFamilySettingsScope';

type IdentitySnapshot = {
  identity: FamilyIdentityAssurance;
  files: FamilyFilePolicy;
  scope: number;
};

export function useFamilyIdentitySettings() {
  const toast = useToast();
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<IdentitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const readVersion = useRef(0);

  const reset = useCallback((nextFamilyId: string | null) => {
    setSnapshot(null);
    setLoading(Boolean(nextFamilyId));
    setError(null);
    setSaving(false);
  }, []);
  const { familyId, scope, begin } = useFamilySettingsScope(reset);

  const reload = useCallback(async () => {
    const request = begin();
    if (!request) {
      setLoading(false);
      return;
    }
    const version = ++readVersion.current;
    const current = () => request.current() && version === readVersion.current;
    setLoading(true);
    try {
      const [identity, files] = await Promise.all([
        getFamilyIdentityAssurance(request.familyId),
        getFamilyFilePolicy(request.familyId),
      ]);
      if (!current()) return;
      if (identity.familyId !== request.familyId || files.familyId !== request.familyId) {
        throw new Error(t('admin.familyIdentity.loadError'));
      }
      setSnapshot({ identity, files, scope: request.scope });
      setError(null);
    } catch (err) {
      if (!current()) return;
      setSnapshot(null);
      setError(err instanceof Error ? err.message : t('admin.familyIdentity.loadError'));
    } finally {
      if (current()) setLoading(false);
    }
  }, [begin, t]);

  useLayoutEffect(() => {
    void reload();
  }, [reload, scope]);

  const link = useCallback(
    async (personId: string, userId: string) => {
      const request = begin();
      if (!request || snapshot?.scope !== request.scope || !snapshot.identity.canManage) return;
      setSaving(true);
      try {
        await linkFamilyMemberPerson({ familyId: request.familyId, personId, userId });
        if (!request.current()) return;
        await reload();
        if (request.current()) toast.success(t('admin.familyIdentity.linkSuccess'));
      } catch (err) {
        if (request.current()) toast.error(err instanceof Error ? err.message : t('admin.familyIdentity.linkError'));
      } finally {
        if (request.current()) setSaving(false);
      }
    },
    [begin, snapshot, reload, t, toast]
  );

  return {
    familyId,
    scope,
    identity: snapshot?.identity ?? null,
    files: snapshot?.files ?? null,
    canManage: snapshot?.identity.canManage ?? false,
    loading,
    error,
    saving,
    reload,
    link,
  };
}
