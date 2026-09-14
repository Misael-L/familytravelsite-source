import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
import {
  classifyFamilyMapError,
  getFamilyMapSettings,
  isMissingMapCredentialError,
  updateFamilyMapSettings,
  type FamilyMapSettings,
  type FamilyMapSettingsPatch,
} from '../../data/supabase/familyMaps'
import { useFamilyMapStore } from '../../store/familyMapStore'

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
}

export function useFamilyMapSettings() {
  const familyId = useAuthStore(s => s.familyId)
  const toast = useToast()
  const { t } = useTranslation()
  const hydrateMaps = useFamilyMapStore(s => s.hydrate)
  const [snapshot, setSnapshot] = useState<FamilyMapSettings>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    if (!familyId) {
      setSnapshot(EMPTY)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    try {
      const result = await getFamilyMapSettings(familyId)
      setSnapshot(result)
      setError(null)
    } catch (err) {
      const kind = classifyFamilyMapError(err)
      const message = kind === 'missing_rpc'
        ? t('admin.familyMaps.missingRpc')
        : kind === 'permission'
          ? t('admin.familyMaps.permissionError')
          : kind === 'network'
            ? t('admin.familyMaps.networkError')
            : err instanceof Error ? err.message : t('admin.familyMaps.loadError')
      setError(message)
      setSnapshot({ ...EMPTY, familyId })
    } finally {
      setLoading(false)
    }
  }, [familyId, t])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = useCallback(async (patch: FamilyMapSettingsPatch) => {
    if (!familyId || !snapshot.canManage) return
    setSaving(true)
    try {
      const result = await updateFamilyMapSettings(familyId, patch)
      setSnapshot(result)
      toast.success(t('admin.familyMaps.saved'))
      void hydrateMaps(familyId)
    } catch (err) {
      toast.error(
        isMissingMapCredentialError(err)
          ? t('admin.familyMaps.missingCredential')
          : err instanceof Error ? err.message : t('admin.familyMaps.saveError'),
      )
    } finally {
      setSaving(false)
    }
  }, [familyId, hydrateMaps, snapshot.canManage, t, toast])

  return {
    familyId,
    snapshot,
    canManage: snapshot.canManage,
    loading,
    error,
    saving,
    reload,
    save,
  }
}
