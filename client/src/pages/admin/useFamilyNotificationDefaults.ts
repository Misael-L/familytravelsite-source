import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
import {
  getFamilyNotificationDefaults,
  updateFamilyNotificationDefaults,
  type FamilyNotificationDefaults,
} from '../../data/supabase/familyNotifications'

export function useFamilyNotificationDefaults() {
  const familyId = useAuthStore(s => s.familyId)
  const toast = useToast()
  const { t } = useTranslation()
  const [snapshot, setSnapshot] = useState<FamilyNotificationDefaults | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    if (!familyId) {
      setSnapshot(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    try {
      setSnapshot(await getFamilyNotificationDefaults(familyId))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.familyNotifications.loadError'))
      setSnapshot(null)
    } finally {
      setLoading(false)
    }
  }, [familyId, t])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = useCallback(async (patch: Record<string, boolean | null>) => {
    if (!familyId || !snapshot?.canManage) return
    setSaving(true)
    try {
      setSnapshot(await updateFamilyNotificationDefaults(familyId, patch))
      toast.success(t('admin.familyNotifications.saved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.familyNotifications.saveError'))
    } finally {
      setSaving(false)
    }
  }, [familyId, snapshot?.canManage, t, toast])

  return {
    familyId,
    snapshot,
    canManage: snapshot?.canManage ?? false,
    loading,
    error,
    saving,
    reload,
    save,
  }
}
