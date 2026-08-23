import React from 'react'
import { Download } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useFamilyExport } from './useFamilyExport'
import type { FamilyExportJobStatus } from '../../data/supabase/familyExport'

const STATUS_KEY: Record<FamilyExportJobStatus, string> = {
  queued: 'admin.familyExport.status.queued',
  processing: 'admin.familyExport.status.processing',
  completed: 'admin.familyExport.status.completed',
  failed: 'admin.familyExport.status.failed',
  expired: 'admin.familyExport.status.expired',
}

function formatExpiry(value: string | null, locale: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale)
}

export default function FamilyDataExportPanel(): React.ReactElement {
  const { t, locale } = useTranslation()
  const { snapshot, canManage, loading, error, busy, requestExport, downloadExport } = useFamilyExport()

  if (loading) {
    return <p className="text-sm text-content-muted">{t('common.loading')}</p>
  }
  if (error) {
    return <p className="text-sm text-red-500">{error}</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-content flex items-center gap-2">
          <Download className="w-5 h-5" />
          {t('admin.familyExport.title')}
        </h2>
        <p className="text-sm mt-1 text-content-muted">{t('admin.familyExport.subtitle')}</p>
        {!canManage && (
          <p className="text-xs mt-2 text-content-faint">{t('admin.familyExport.readOnly')}</p>
        )}
      </div>

      <div className="rounded-xl border border-edge bg-surface-card px-4 py-3 space-y-2 text-sm text-content-muted">
        <p>{t('admin.familyExport.includes')}</p>
        <p>{t('admin.familyExport.excludes')}</p>
        <p>{t('admin.familyExport.retention')}</p>
      </div>

      {canManage && (
        <button
          type="button"
          className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50"
          disabled={busy}
          onClick={() => { void requestExport() }}
        >
          {t('admin.familyExport.request')}
        </button>
      )}

      <div className="rounded-xl border border-edge divide-y divide-edge bg-surface-card">
        {(snapshot?.jobs ?? []).length === 0 ? (
          <p className="px-4 py-3 text-sm text-content-muted">{t('admin.familyExport.empty')}</p>
        ) : (
          (snapshot?.jobs ?? []).map(job => (
            <div key={job.id} className="px-4 py-3 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-content">{t(STATUS_KEY[job.status])}</p>
                <p className="text-xs text-content-faint">
                  {t('admin.familyExport.expires')}: {formatExpiry(job.expiresAt, locale)}
                </p>
                {job.errorCode && (
                  <p className="text-xs text-red-500 mt-1">{job.errorCode}</p>
                )}
              </div>
              {canManage && job.status === 'completed' && (
                <button
                  type="button"
                  className="text-sm font-semibold text-slate-700 hover:text-slate-900 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => { void downloadExport(job.id) }}
                >
                  {t('admin.familyExport.download')}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
