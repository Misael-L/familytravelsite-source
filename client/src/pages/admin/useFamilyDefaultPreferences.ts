import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
import {
  getFamilyPreferenceDefaults,
  updateFamilyPreferenceDefaults,
  type PreferenceFields,
  type PreferencePatch,
} from '../../data/supabase/familyPreferences'

const EMPTY: PreferenceFields = {
  temperatureUnit: null,
  distanceUnit: null,
  timeFormat: null,
  displayCurrency: null,
}

export function useFamilyDefaultPreferences() {
  const familyId = useAuthStore(s => s.familyId)
  const toast = useToast()
  const { t } = useTranslation()
  const [defaults, setDefaults] = useState<PreferenceFields>(EMPTY)
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    if (!familyId) {
      setDefaults(EMPTY)
      setCanManage(false)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    try {
      const result = await getFamilyPreferenceDefaults(familyId)
      setDefaults(result.defaults)
      setCanManage(result.canManage)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.familyDefaults.loadError'))
      setDefaults(EMPTY)
    } finally {
      setLoading(false)
    }
  }, [familyId, t])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = useCallback(async (patch: PreferencePatch) => {
    if (!familyId || !canManage) return
    setSaving(true)
    try {
      const result = await updateFamilyPreferenceDefaults(familyId, patch)
      setDefaults(result.defaults)
      toast.success(t('admin.familyDefaults.saved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.familyDefaults.saveError'))
    } finally {
      setSaving(false)
    }
  }, [canManage, familyId, t, toast])

  const resetField = useCallback(async (field: keyof PreferencePatch) => {
    await save({ [field]: null })
  }, [save])

  return {
    familyId,
    defaults,
    canManage,
    loading,
    error,
    saving,
    reload,
    save,
    resetField,
  }
}
