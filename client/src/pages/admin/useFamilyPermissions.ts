import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
import {
  listFamilyPermissionPolicies,
  resetFamilyPermissionPolicies,
  updateFamilyPermissionPolicies,
  type FamilyCapabilityKey,
  type FamilyCapabilityPolicy,
  type FamilyPermissionActorScope,
} from '../../data/supabase/familyPermissions'
import { groupPolicies } from './familyPermissionsModel'

export function useFamilyPermissions() {
  const familyId = useAuthStore(s => s.familyId)
  const toast = useToast()
  const { t } = useTranslation()
  const [policies, setPolicies] = useState<FamilyCapabilityPolicy[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const reload = useCallback(async () => {
    if (!familyId) {
      setPolicies([])
      setCanManage(false)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    try {
      const result = await listFamilyPermissionPolicies(familyId)
      setPolicies(result.policies)
      setCanManage(result.canManage)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.permissions.loadError'))
      setPolicies([])
    } finally {
      setLoading(false)
    }
  }, [familyId, t])

  useEffect(() => {
    void reload()
  }, [reload])

  const saveRow = useCallback(async (
    key: FamilyCapabilityKey,
    directScope: FamilyPermissionActorScope | null,
    proposeScope: FamilyPermissionActorScope | null,
  ) => {
    if (!familyId || !canManage) return
    setSaving(true)
    try {
      const result = await updateFamilyPermissionPolicies(familyId, [{
        key,
        directScope,
        proposeScope,
      }])
      setPolicies(result.policies)
      setCanManage(result.canManage)
      toast.success(t('admin.permissions.saved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.permissions.saveError'))
    } finally {
      setSaving(false)
    }
  }, [canManage, familyId, t, toast])

  const resetAll = useCallback(async () => {
    if (!familyId || !canManage) return
    setSaving(true)
    try {
      const result = await resetFamilyPermissionPolicies(familyId)
      setPolicies(result.policies)
      setCanManage(result.canManage)
      setConfirmReset(false)
      toast.success(t('admin.permissions.resetDone'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.permissions.saveError'))
    } finally {
      setSaving(false)
    }
  }, [canManage, familyId, t, toast])

  return {
    familyId,
    loading,
    error,
    saving,
    canManage,
    groups: groupPolicies(policies),
    customizedCount: policies.filter(p => p.isCustom).length,
    reload,
    saveRow,
    resetAll,
    confirmReset,
    setConfirmReset,
  }
}
