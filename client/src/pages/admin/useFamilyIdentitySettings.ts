import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
import {
  getFamilyFilePolicy,
  getFamilyIdentityAssurance,
  linkFamilyMemberPerson,
  type FamilyFilePolicy,
  type FamilyIdentityAssurance,
} from '../../data/supabase/familyIdentity'

export function useFamilyIdentitySettings() {
  const familyId = useAuthStore(s => s.familyId)
  const toast = useToast()
  const { t } = useTranslation()
  const [identity, setIdentity] = useState<FamilyIdentityAssurance | null>(null)
  const [files, setFiles] = useState<FamilyFilePolicy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    if (!familyId) {
      setIdentity(null)
      setFiles(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    try {
      const [nextIdentity, nextFiles] = await Promise.all([
        getFamilyIdentityAssurance(familyId),
        getFamilyFilePolicy(familyId),
      ])
      setIdentity(nextIdentity)
      setFiles(nextFiles)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.familyIdentity.loadError'))
      setIdentity(null)
      setFiles(null)
    } finally {
      setLoading(false)
    }
  }, [familyId, t])

  useEffect(() => {
    void reload()
  }, [reload])

  const link = useCallback(async (personId: string, userId: string) => {
    if (!familyId || !identity?.canManage) return
    setSaving(true)
    try {
      await linkFamilyMemberPerson({ familyId, personId, userId })
      await reload()
      toast.success(t('admin.familyIdentity.linkSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.familyIdentity.linkError'))
    } finally {
      setSaving(false)
    }
  }, [familyId, identity?.canManage, reload, t, toast])

  return {
    familyId,
    identity,
    files,
    canManage: identity?.canManage ?? false,
    loading,
    error,
    saving,
    reload,
    link,
  }
}
