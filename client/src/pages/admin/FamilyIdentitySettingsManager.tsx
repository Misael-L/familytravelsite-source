import React, { useState } from 'react'
import { Shield } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useFamilyIdentitySettings } from './useFamilyIdentitySettings'

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} KB`
  return `${n} B`
}

export default function FamilyIdentitySettingsManager(): React.ReactElement {
  const { t } = useTranslation()
  const { identity, files, canManage, loading, error, saving, link } = useFamilyIdentitySettings()
  const [personByUser, setPersonByUser] = useState<Record<string, string>>({})

  if (loading) {
    return <p className="text-sm text-content-muted">{t('common.loading')}</p>
  }
  if (error) {
    return <p className="text-sm text-red-500">{error}</p>
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-content flex items-center gap-2">
          <Shield className="w-5 h-5" />
          {t('admin.familyIdentity.title')}
        </h2>
        <p className="text-sm mt-1 text-content-muted">{t('admin.familyIdentity.subtitle')}</p>
        {!canManage && (
          <p className="text-xs mt-2 text-content-faint">{t('admin.familyIdentity.readOnly')}</p>
        )}
      </div>

      <div className="rounded-xl border border-edge divide-y divide-edge bg-surface-card overflow-x-auto">
        <div className="grid grid-cols-6 gap-2 px-4 py-2 text-xs font-medium text-content-faint">
          <span>{t('admin.familyIdentity.role')}</span>
          <span>{t('admin.familyIdentity.status')}</span>
          <span>{t('admin.familyIdentity.confirmed')}</span>
          <span>{t('admin.familyIdentity.linked')}</span>
          <span>{t('admin.familyIdentity.mfa')}</span>
          <span>{t('admin.familyIdentity.lastSignIn')}</span>
        </div>
        {(identity?.members ?? []).map(row => (
          <div key={row.memberId} className="px-4 py-3 space-y-2">
            <div className="grid grid-cols-6 gap-2 text-sm text-content">
              <span>{row.role}</span>
              <span>{row.status}</span>
              <span>{row.emailConfirmed ? t('admin.familyIdentity.yes') : t('admin.familyIdentity.pending')}</span>
              <span>{row.personLinked ? t('admin.familyIdentity.linked') : t('admin.familyIdentity.unlinked')}</span>
              <span>
                {row.hasVerifiedTotp
                  ? t('admin.familyIdentity.mfaOn')
                  : row.reviewerMfaRequired
                    ? t('admin.familyIdentity.reviewerMfa')
                    : t('admin.familyIdentity.mfaOff')}
              </span>
              <span className="text-content-muted text-xs">
                {row.lastSignInAt ? new Date(row.lastSignInAt).toLocaleString() : '—'}
              </span>
            </div>
            <p className="text-xs text-content-faint">
              {t('admin.familyIdentity.providers')}: {row.providers.length ? row.providers.join(', ') : '—'}
            </p>
            {canManage && !row.personLinked && (identity?.unlinkedPeople.length ?? 0) > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="text-sm border border-edge rounded-lg px-2 py-1 bg-surface-card"
                  value={personByUser[row.userId] ?? ''}
                  onChange={e => setPersonByUser(prev => ({ ...prev, [row.userId]: e.target.value }))}
                >
                  <option value="">{t('admin.familyIdentity.selectPerson')}</option>
                  {identity?.unlinkedPeople.map(person => (
                    <option key={person.personId} value={person.personId}>
                      {person.displayName || person.personId}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={saving || !personByUser[row.userId]}
                  onClick={() => {
                    const personId = personByUser[row.userId]
                    if (!personId) return
                    void link(personId, row.userId)
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 text-white disabled:opacity-50"
                >
                  {t('admin.familyIdentity.link')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-sm text-content-muted">
        {t('admin.familyIdentity.pendingInvites', {
          count: String(identity?.pendingRequests.length ?? 0),
        })}
      </p>

      <div>
        <h3 className="text-base font-semibold text-content">{t('admin.familyFiles.title')}</h3>
        <p className="text-sm mt-1 text-content-muted">{t('admin.familyFiles.subtitle')}</p>
        <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-edge bg-surface-card px-3 py-2">
            <dt className="text-xs text-content-faint">{t('admin.familyFiles.trash')}</dt>
            <dd className="font-medium text-content">{files?.trashCount ?? 0}</dd>
          </div>
          <div className="rounded-lg border border-edge bg-surface-card px-3 py-2">
            <dt className="text-xs text-content-faint">{t('admin.familyFiles.pendingCleanup')}</dt>
            <dd className="font-medium text-content">{files?.pendingCleanup ?? 0}</dd>
          </div>
          <div className="rounded-lg border border-edge bg-surface-card px-3 py-2">
            <dt className="text-xs text-content-faint">{t('admin.familyFiles.deadLetters')}</dt>
            <dd className="font-medium text-content">{files?.deadLetters ?? 0}</dd>
          </div>
          <div className="rounded-lg border border-edge bg-surface-card px-3 py-2">
            <dt className="text-xs text-content-faint">{t('admin.familyFiles.retention')}</dt>
            <dd className="font-medium text-content">{files?.retentionDays ?? 30}</dd>
          </div>
          <div className="rounded-lg border border-edge bg-surface-card px-3 py-2">
            <dt className="text-xs text-content-faint">{t('admin.familyFiles.maxTrip')}</dt>
            <dd className="font-medium text-content">{formatBytes(files?.tripFileMaxBytes ?? 0)}</dd>
          </div>
          <div className="rounded-lg border border-edge bg-surface-card px-3 py-2">
            <dt className="text-xs text-content-faint">{t('admin.familyFiles.maxAvatar')}</dt>
            <dd className="font-medium text-content">{formatBytes(files?.avatarMaxBytes ?? 0)}</dd>
          </div>
        </dl>
        <p className="text-xs mt-3 text-content-faint">{t('admin.familyFiles.mimeFixed')}</p>
      </div>
    </div>
  )
}
