import React from 'react';
import CustomSelect from '../../components/shared/CustomSelect';
import { FAMILY_CAPABILITY_KEYS } from '../../data/supabase/familyPermissions';
import { useTranslation } from '../../i18n';
import { summarizeAuditContext } from './familyPermissionsModel';
import { useFamilyProductAudit } from './useFamilyProductAudit';

export default function FamilyProductAuditPanel(): React.ReactElement {
  const { t, locale } = useTranslation();
  const {
    events,
    loading,
    loadingMore,
    error,
    nextCursor,
    capabilityKey,
    setCapabilityKey,
    outcome,
    setOutcome,
    actorPersonId,
    setActorPersonId,
    reload,
    loadMore,
  } = useFamilyProductAudit();

  const capabilityOptions = [
    { value: '', label: t('admin.familyAudit.filterAll') },
    ...FAMILY_CAPABILITY_KEYS.map((key) => {
      const labelKey = `admin.permissions.key.${key}`;
      const label = t(labelKey);
      return { value: key, label: label === labelKey ? key : label };
    }),
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-surface-card">
      <div className="border-b border-edge p-5">
        <h2 className="font-semibold text-content">{t('admin.familyAudit.title')}</h2>
        <p className="mt-1 text-caption text-content-muted">{t('admin.familyAudit.subtitle')}</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <CustomSelect
            size="sm"
            value={capabilityKey}
            onChange={(v) => setCapabilityKey(String(v))}
            options={capabilityOptions}
          />
          <CustomSelect
            size="sm"
            value={outcome}
            onChange={(v) => setOutcome((String(v) || '') as typeof outcome)}
            options={[
              { value: '', label: t('admin.familyAudit.filterAllOutcomes') },
              { value: 'direct', label: t('admin.familyAudit.outcome.direct') },
              { value: 'propose', label: t('admin.familyAudit.outcome.propose') },
              { value: 'deny', label: t('admin.familyAudit.outcome.deny') },
            ]}
          />
          <input
            value={actorPersonId}
            onChange={(e) => setActorPersonId(e.target.value.trim())}
            placeholder={t('admin.familyAudit.actorPlaceholder')}
            className="rounded-lg border border-edge px-3 py-2 text-body"
          />
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-edge border-t-edge" />
        </div>
      ) : error ? (
        <div className="p-6 text-body text-danger">
          {error}
          <button type="button" className="ms-3 underline" onClick={reload}>
            {t('dashboard.retry')}
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="p-8 text-center text-body text-content-muted">{t('admin.familyAudit.empty')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-edge bg-surface-secondary text-start text-caption font-medium uppercase tracking-wider text-content-muted">
                <th className="px-5 py-3">{t('admin.familyAudit.when')}</th>
                <th className="px-5 py-3">{t('admin.familyAudit.actor')}</th>
                <th className="px-5 py-3">{t('admin.familyAudit.action')}</th>
                <th className="px-5 py-3">{t('admin.familyAudit.resource')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {events.map((event) => {
                const capKey = event.capabilityKey ? `admin.permissions.key.${event.capabilityKey}` : '';
                const capLabel = event.capabilityKey
                  ? t(capKey) === capKey
                    ? event.capabilityKey
                    : t(capKey)
                  : t('admin.familyAudit.unmapped');
                const summary = summarizeAuditContext(event.context);
                return (
                  <tr key={event.id} className="text-body">
                    <td className="whitespace-nowrap px-5 py-3 text-content-muted">
                      {new Date(event.createdAt).toLocaleString(locale)}
                    </td>
                    <td className="px-5 py-3 text-content">{event.actorDisplayName || event.actorPersonId || '—'}</td>
                    <td className="px-5 py-3">
                      <p className="text-content">{capLabel}</p>
                      <p className="text-caption text-content-muted">
                        {event.operation}
                        {event.outcome ? ` · ${t(`admin.familyAudit.outcome.${event.outcome}`)}` : ''}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-content-muted">
                      <p>
                        {event.resourceType}
                        {event.resourceId ? ` · ${event.resourceId.slice(0, 8)}` : ''}
                      </p>
                      {summary && <p className="text-caption text-content-muted">{summary}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {nextCursor && (
            <div className="p-4 text-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={loadMore}
                className="rounded-lg border border-edge px-4 py-2 text-body text-content hover:bg-surface-secondary disabled:opacity-40"
              >
                {t('admin.audit.loadMore')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
