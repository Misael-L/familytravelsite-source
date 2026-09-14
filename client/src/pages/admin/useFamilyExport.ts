import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
import { downloadFile } from '../../utils/fileDownload'
import {
  getFamilyExportDownload,
  isActiveExportJob,
  listFamilyExportJobs,
  requestFamilyExport,
  type FamilyExportJobs,
} from '../../data/supabase/familyExport'

export function useFamilyExport() {
  const familyId = useAuthStore(s => s.familyId)
  const toast = useToast()
  const { t } = useTranslation()
  const [snapshot, setSnapshot] = useState<FamilyExportJobs | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    if (!familyId) {
      setSnapshot(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    try {
      setSnapshot(await listFamilyExportJobs(familyId))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.familyExport.loadError'))
      setSnapshot(null)
    } finally {
      setLoading(false)
    }
  }, [familyId, t])

  useEffect(() => {
    void reload()
  }, [reload])

  const active = snapshot?.jobs.some(job => isActiveExportJob(job.status)) ?? false
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => { void reload() }, 4000)
    return () => window.clearInterval(timer)
  }, [active, reload])

  const requestExport = useCallback(async () => {
    if (!familyId || !snapshot?.canManage) return
    setBusy(true)
    try {
      await requestFamilyExport(familyId)
      setSnapshot(await listFamilyExportJobs(familyId))
      toast.success(t('admin.familyExport.requested'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.familyExport.requestError'))
    } finally {
      setBusy(false)
    }
  }, [familyId, snapshot?.canManage, t, toast])

  const downloadExport = useCallback(async (jobId: string) => {
    if (!familyId || !snapshot?.canManage) return
    setBusy(true)
    try {
      const artifact = await getFamilyExportDownload(familyId, jobId)
      await downloadFile(artifact.signedUrl, artifact.filename)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.familyExport.downloadError'))
    } finally {
      setBusy(false)
    }
  }, [familyId, snapshot?.canManage, t, toast])

  return {
    snapshot,
    canManage: snapshot?.canManage ?? false,
    loading,
    error,
    busy,
    requestExport,
    downloadExport,
  }
}
