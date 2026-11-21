import { Download } from 'lucide-react';
import React from 'react';
import type { FamilyExportJobStatus } from '../../data/supabase/familyExport';
import { useTranslation } from '../../i18n';
import { useFamilyExport } from './useFamilyExport';

const STATUS_KEY: Record<FamilyExportJobStatus, string> = {
  queued: 'admin.familyExport.status.queued',
  processing: 'admin.familyExport.status.processing',
  completed: 'admin.familyExport.status.completed',
  failed: 'admin.familyExport.status.failed',
  expired: 'admin.familyExport.status.expired',
};

function formatExpiry(value: string | null, locale: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale);
}

export default function FamilyDataExportPanel(): React.ReactElement {
  const { t, locale } = useTranslation();
  const { snapshot, canManage, loading, error, busy, requestExport, downloadExport } = useFamilyExport();

  if (loading) {
    return <p className="text-body text-content-muted">{t('common.loading')}</p>;
  }
  if (error) {
    return <p className="text-body text-danger">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-subtitle font-semibold text-content">
          <Download className="h-5 w-5" />
          {t('admin.familyExport.title')}
        </h2>
        <p className="mt-1 text-body text-content-muted">{t('admin.familyExport.subtitle')}</p>
        {!canManage && <p className="mt-2 text-caption text-content-faint">{t('admin.familyExport.readOnly')}</p>}
      </div>

      <div className="space-y-2 rounded-xl border border-edge bg-surface-card px-4 py-3 text-body text-content-muted">
        <p>{t('admin.familyExport.includes')}</p>
        <p>{t('admin.familyExport.excludes')}</p>
        <p>{t('admin.familyExport.retention')}</p>
      </div>

      {canManage && (
        <button
          type="button"
          className="rounded-lg bg-inverse px-4 py-2 text-body font-semibold text-inverse-text disabled:opacity-50"
          disabled={busy}
          onClick={() => {
            void requestExport();
          }}
        >
          {t('admin.familyExport.request')}
        </button>
      )}

      <div className="divide-y divide-edge rounded-xl border border-edge bg-surface-card">
        {(snapshot?.jobs ?? []).length === 0 ? (
          <p className="px-4 py-3 text-body text-content-muted">{t('admin.familyExport.empty')}</p>
        ) : (
          (snapshot?.jobs ?? []).map((job) => (
            <div key={job.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-body font-medium text-content">{t(STATUS_KEY[job.status])}</p>
                <p className="text-caption text-content-faint">
                  {t('admin.familyExport.expires')}: {formatExpiry(job.expiresAt, locale)}
                </p>
                {job.errorCode && <p className="mt-1 text-caption text-danger">{job.errorCode}</p>}
              </div>
              {canManage && job.status === 'completed' && (
                <button
                  type="button"
                  className="text-body font-semibold text-content hover:text-content disabled:opacity-50"
                  disabled={busy}
                  onClick={() => {
                    void downloadExport(job.id);
                  }}
                >
                  {t('admin.familyExport.download')}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
