import { useCallback, useLayoutEffect, useRef } from 'react';
import { useToast } from '../../components/shared/Toast';
import {
  getFamilyExportDownload,
  isActiveExportJob,
  listFamilyExportJobs,
  requestFamilyExport,
  type FamilyExportJobs,
} from '../../data/supabase/familyExport';
import { useTranslation } from '../../i18n';
import { downloadFile } from '../../utils/fileDownload';
import { useFamilySettingsState } from './useFamilySettingsScope';

export function useFamilyExport() {
  const toast = useToast();
  const { t } = useTranslation();
  const { scope, begin, beginRead, stored, setStored, loading, setLoading, error, setError, saving, setSaving } =
    useFamilySettingsState<FamilyExportJobs>();
  // A file can finish before React renders a newly loaded access grant.
  const latest = useRef<typeof stored>(null);
  const activeAction = useRef<number | null>(null);
  const snapshot = stored?.snapshot ?? null;

  const reload = useCallback(async () => {
    const request = beginRead();
    if (!request) return;
    try {
      const result = await listFamilyExportJobs(request.familyId);
      if (!request.current()) return;
      if (result.familyId !== request.familyId) throw new Error(t('admin.familyExport.loadError'));
      latest.current = { scope: request.scope, snapshot: result };
      setStored(latest.current);
      setError(null);
    } catch (err) {
      if (!request.current()) return;
      latest.current = null;
      setStored(null);
      setError(err instanceof Error ? err.message : t('admin.familyExport.loadError'));
    } finally {
      if (request.current()) setLoading(false);
    }
  }, [beginRead, setError, setLoading, setStored, t]);

  useLayoutEffect(() => {
    latest.current = null;
    void reload();
  }, [reload, scope]);

  const active = snapshot?.jobs.some((job) => isActiveExportJob(job.status)) ?? false;
  useLayoutEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void reload(), 4000);
    return () => window.clearInterval(timer);
  }, [active, reload]);

  const runAction = useCallback(
    async (
      jobId: string | null,
      errorKey: 'admin.familyExport.requestError' | 'admin.familyExport.downloadError',
      action: (familyId: string, current: () => boolean) => Promise<void>
    ) => {
      const request = begin();
      if (!request || stored?.scope !== request.scope || activeAction.current === request.scope) return;
      const current = () => {
        const grant = latest.current;
        if (!request.current() || grant?.scope !== request.scope || !grant.snapshot.canManage) return false;
        return jobId === null || grant.snapshot.jobs.some((job) => job.id === jobId && job.status === 'completed');
      };
      if (!current()) return;
      activeAction.current = request.scope;
      setSaving(true);
      try {
        await action(request.familyId, current);
      } catch (err) {
        if (current()) toast.error(err instanceof Error ? err.message : t(errorKey));
      } finally {
        if (activeAction.current === request.scope) activeAction.current = null;
        if (request.current()) setSaving(false);
      }
    },
    [begin, setSaving, stored?.scope, t, toast]
  );

  const requestExport = useCallback(
    () =>
      runAction(null, 'admin.familyExport.requestError', async (familyId, current) => {
        await requestFamilyExport(familyId);
        if (!current()) return;
        toast.success(t('admin.familyExport.requested'));
        await reload();
      }),
    [reload, runAction, t, toast]
  );

  const downloadExport = useCallback(
    (jobId: string) =>
      runAction(jobId, 'admin.familyExport.downloadError', async (familyId, current) => {
        const artifact = await getFamilyExportDownload(familyId, jobId);
        await downloadFile(artifact.signedUrl, artifact.filename, current);
      }),
    [runAction]
  );

  return {
    snapshot,
    canManage: snapshot?.canManage ?? false,
    loading,
    error,
    busy: saving,
    requestExport,
    downloadExport,
  };
}
