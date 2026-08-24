import React from 'react'
import CustomSelect from '../../components/shared/CustomSelect'
import { useTranslation } from '../../i18n'
import { FAMILY_CAPABILITY_KEYS } from '../../data/supabase/familyPermissions'
import { summarizeAuditContext } from './familyPermissionsModel'
import { useFamilyProductAudit } from './useFamilyProductAudit'

export default function FamilyProductAuditPanel(): React.ReactElement {
  const { t, locale } = useTranslation()
  const {
    events, loading, loadingMore, error, nextCursor,
    capabilityKey, setCapabilityKey, outcome, setOutcome,
    actorPersonId, setActorPersonId, reload, loadMore,
  } = useFamilyProductAudit()

  const capabilityOptions = [
    { value: '', label: t('admin.familyAudit.filterAll') },
    ...FAMILY_CAPABILITY_KEYS.map(key => {
      const labelKey = `admin.permissions.key.${key}`
      const label = t(labelKey)
      return { value: key, label: label === labelKey ? key : label }
    }),
  ]

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-100">
        <h2 className="font-semibold text-slate-900">{t('admin.familyAudit.title')}</h2>
        <p className="text-xs text-slate-400 mt-1">{t('admin.familyAudit.subtitle')}</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <CustomSelect
            size="sm"
            value={capabilityKey}
            onChange={v => setCapabilityKey(String(v))}
            options={capabilityOptions}
          />
          <CustomSelect
            size="sm"
            value={outcome}
            onChange={v => setOutcome((String(v) || '') as typeof outcome)}
            options={[
              { value: '', label: t('admin.familyAudit.filterAllOutcomes') },
              { value: 'direct', label: t('admin.familyAudit.outcome.direct') },
              { value: 'propose', label: t('admin.familyAudit.outcome.propose') },
              { value: 'deny', label: t('admin.familyAudit.outcome.deny') },
            ]}
          />
          <input
            value={actorPersonId}
            onChange={e => setActorPersonId(e.target.value.trim())}
            placeholder={t('admin.familyAudit.actorPlaceholder')}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
          />
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin mx-auto" />
        </div>
      ) : error ? (
        <div className="p-6 text-sm text-red-600">
          {error}
          <button type="button" className="ml-3 underline" onClick={reload}>{t('dashboard.retry')}</button>
        </div>
      ) : events.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">{t('admin.familyAudit.empty')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3">{t('admin.familyAudit.when')}</th>
                <th className="px-5 py-3">{t('admin.familyAudit.actor')}</th>
                <th className="px-5 py-3">{t('admin.familyAudit.action')}</th>
                <th className="px-5 py-3">{t('admin.familyAudit.resource')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map(event => {
                const capKey = event.capabilityKey ? `admin.permissions.key.${event.capabilityKey}` : ''
                const capLabel = event.capabilityKey
                  ? (t(capKey) === capKey ? event.capabilityKey : t(capKey))
                  : t('admin.familyAudit.unmapped')
                const summary = summarizeAuditContext(event.context)
                return (
                  <tr key={event.id} className="text-sm">
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">
                      {new Date(event.createdAt).toLocaleString(locale)}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {event.actorDisplayName || event.actorPersonId || '—'}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-slate-900">{capLabel}</p>
                      <p className="text-xs text-slate-400">
                        {event.operation}
                        {event.outcome ? ` · ${t(`admin.familyAudit.outcome.${event.outcome}`)}` : ''}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      <p>{event.resourceType}{event.resourceId ? ` · ${event.resourceId.slice(0, 8)}` : ''}</p>
                      {summary && <p className="text-xs text-slate-400">{summary}</p>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {nextCursor && (
            <div className="p-4 text-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={loadMore}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                {t('admin.audit.loadMore')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
