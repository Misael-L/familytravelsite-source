import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useFamilyFeatureStore } from '../../store/familyFeatureStore'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
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
} from '../../data/supabase/familyFeatures'

function modeToPatch(mode: FamilyFeatureMode): boolean | null {
  if (mode === 'inherit') return null
  return mode === 'enabled'
}

export function useFamilyFeatureControls() {
  const familyId = useAuthStore(s => s.familyId)
  const toast = useToast()
  const { t } = useTranslation()
  const refreshAvailability = useFamilyFeatureStore(s => s.refresh)
  const [snapshot, setSnapshot] = useState<FamilyFeatureControls | null>(null)
  const [events, setEvents] = useState<FeatureRolloutEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    if (!familyId) {
      setSnapshot(null)
      setEvents([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    try {
      const next = await listFamilyFeatureControls(familyId)
      setSnapshot(next)
      if (next.isSuperAdmin) {
        setEvents(await listFeatureRolloutEvents(40))
      } else {
        setEvents([])
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.familyFeatures.loadError'))
      setSnapshot(null)
    } finally {
      setLoading(false)
    }
  }, [familyId, t])

  useEffect(() => {
    void reload()
  }, [reload])

  const saveFamilyMode = useCallback(async (key: FamilyFeatureKey, mode: FamilyFeatureMode) => {
    if (!familyId || !snapshot?.canManage) return
    setSaving(true)
    try {
      setSnapshot(await updateFamilyFeatureOverrides(familyId, { [key]: modeToPatch(mode) }))
      await refreshAvailability()
      toast.success(t('admin.familyFeatures.saved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.familyFeatures.saveError'))
    } finally {
      setSaving(false)
    }
  }, [familyId, snapshot?.canManage, refreshAvailability, t, toast])

  const saveRollout = useCallback(async (key: FamilyFeatureKey, state: FamilyFeatureRolloutState) => {
    if (!snapshot?.isSuperAdmin) return
    setSaving(true)
    try {
      await updateFeatureRollout(key, state)
      await reload()
      await refreshAvailability()
      toast.success(t('admin.familyFeatures.rolloutSaved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.familyFeatures.saveError'))
    } finally {
      setSaving(false)
    }
  }, [snapshot?.isSuperAdmin, reload, refreshAvailability, t, toast])

  return {
    snapshot,
    events,
    canManage: snapshot?.canManage ?? false,
    isSuperAdmin: snapshot?.isSuperAdmin ?? false,
    loading,
    error,
    saving,
    saveFamilyMode,
    saveRollout,
  }
}
