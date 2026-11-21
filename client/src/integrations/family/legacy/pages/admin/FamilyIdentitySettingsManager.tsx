import { Shield } from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from '../../i18n';
import { useFamilyIdentitySettings } from './useFamilyIdentitySettings';

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export default function FamilyIdentitySettingsManager(): React.ReactElement {
  const { t } = useTranslation();
  const { scope, identity, files, canManage, loading, error, saving, link } = useFamilyIdentitySettings();
  const [selection, setSelection] = useState<{ scope: number; byUser: Record<string, string> }>({ scope, byUser: {} });
  const personByUser = selection.scope === scope ? selection.byUser : {};

  if (loading) {
    return <p className="text-body text-content-muted">{t('common.loading')}</p>;
  }
  if (error) {
    return <p className="text-body text-danger">{error}</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="flex items-center gap-2 text-subtitle font-semibold text-content">
          <Shield className="h-5 w-5" />
          {t('admin.familyIdentity.title')}
        </h2>
        <p className="mt-1 text-body text-content-muted">{t('admin.familyIdentity.subtitle')}</p>
        {!canManage && <p className="mt-2 text-caption text-content-faint">{t('admin.familyIdentity.readOnly')}</p>}
      </div>

      <div className="divide-y divide-edge overflow-x-auto rounded-xl border border-edge bg-surface-card">
        <div className="grid grid-cols-6 gap-2 px-4 py-2 text-caption font-medium text-content-faint">
          <span>{t('admin.familyIdentity.role')}</span>
          <span>{t('admin.familyIdentity.status')}</span>
          <span>{t('admin.familyIdentity.confirmed')}</span>
          <span>{t('admin.familyIdentity.linked')}</span>
          <span>{t('admin.familyIdentity.mfa')}</span>
          <span>{t('admin.familyIdentity.lastSignIn')}</span>
        </div>
        {(identity?.members ?? []).map((row) => (
          <div key={row.memberId} className="space-y-2 px-4 py-3">
            <div className="grid grid-cols-6 gap-2 text-body text-content">
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
              <span className="text-caption text-content-muted">
                {row.lastSignInAt ? new Date(row.lastSignInAt).toLocaleString() : '—'}
              </span>
            </div>
            <p className="text-caption text-content-faint">
              {t('admin.familyIdentity.providers')}: {row.providers.length ? row.providers.join(', ') : '—'}
            </p>
            {canManage && !row.personLinked && (identity?.unlinkedPeople.length ?? 0) > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="rounded-lg border border-edge bg-surface-card px-2 py-1 text-body"
                  value={personByUser[row.userId] ?? ''}
                  onChange={(e) => {
                    const personId = e.target.value;
                    setSelection((prev) => ({
                      scope,
                      byUser: { ...(prev.scope === scope ? prev.byUser : {}), [row.userId]: personId },
                    }));
                  }}
                >
                  <option value="">{t('admin.familyIdentity.selectPerson')}</option>
                  {identity?.unlinkedPeople.map((person) => (
                    <option key={person.personId} value={person.personId}>
                      {person.displayName || person.personId}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={saving || !personByUser[row.userId]}
                  onClick={() => {
                    const personId = personByUser[row.userId];
                    if (!personId) return;
                    void link(personId, row.userId);
                  }}
                  className="rounded-lg bg-inverse px-3 py-1.5 text-caption font-medium text-inverse-text disabled:opacity-50"
                >
                  {t('admin.familyIdentity.link')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-body text-content-muted">
        {t('admin.familyIdentity.pendingInvites', {
          count: String(identity?.pendingRequests.length ?? 0),
        })}
      </p>

      <div>
        <h3 className="text-body font-semibold text-content">{t('admin.familyFiles.title')}</h3>
        <p className="mt-1 text-body text-content-muted">{t('admin.familyFiles.subtitle')}</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-body sm:grid-cols-3">
          <div className="rounded-lg border border-edge bg-surface-card px-3 py-2">
            <dt className="text-caption text-content-faint">{t('admin.familyFiles.trash')}</dt>
            <dd className="font-medium text-content">{files?.trashCount ?? 0}</dd>
          </div>
          <div className="rounded-lg border border-edge bg-surface-card px-3 py-2">
            <dt className="text-caption text-content-faint">{t('admin.familyFiles.pendingCleanup')}</dt>
            <dd className="font-medium text-content">{files?.pendingCleanup ?? 0}</dd>
          </div>
          <div className="rounded-lg border border-edge bg-surface-card px-3 py-2">
            <dt className="text-caption text-content-faint">{t('admin.familyFiles.deadLetters')}</dt>
            <dd className="font-medium text-content">{files?.deadLetters ?? 0}</dd>
          </div>
          <div className="rounded-lg border border-edge bg-surface-card px-3 py-2">
            <dt className="text-caption text-content-faint">{t('admin.familyFiles.retention')}</dt>
            <dd className="font-medium text-content">{files?.retentionDays ?? 30}</dd>
          </div>
          <div className="rounded-lg border border-edge bg-surface-card px-3 py-2">
            <dt className="text-caption text-content-faint">{t('admin.familyFiles.maxTrip')}</dt>
            <dd className="font-medium text-content">{formatBytes(files?.tripFileMaxBytes ?? 0)}</dd>
          </div>
          <div className="rounded-lg border border-edge bg-surface-card px-3 py-2">
            <dt className="text-caption text-content-faint">{t('admin.familyFiles.maxAvatar')}</dt>
            <dd className="font-medium text-content">{formatBytes(files?.avatarMaxBytes ?? 0)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-caption text-content-faint">{t('admin.familyFiles.mimeFixed')}</p>
      </div>
    </div>
  );
}
