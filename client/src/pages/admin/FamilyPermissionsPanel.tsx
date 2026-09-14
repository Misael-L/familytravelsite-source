import React from 'react'
import CustomSelect from '../../components/shared/CustomSelect'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import { useTranslation } from '../../i18n'
import {
  type FamilyCapabilityPolicy,
} from '../../data/supabase/familyPermissions'
import { parseScopeSelect, scopeSelectValue } from './familyPermissionsModel'
import { useFamilyPermissions } from './useFamilyPermissions'

export default function FamilyPermissionsPanel(): React.ReactElement {
  const { t } = useTranslation()
  const {
    loading, error, saving, canManage, groups, customizedCount,
    saveRow, resetAll, confirmReset, setConfirmReset, reload,
  } = useFamilyPermissions()

  const scopeLabel = (scope: string | null) => {
    if (!scope) return t('admin.permissions.scope.none')
    const key = `admin.permissions.scope.${scope}`
    const label = t(key)
    return label === key ? scope : label
  }

  const renderRow = (policy: FamilyCapabilityPolicy) => {
    const readOnly = !canManage || !policy.configurable || saving
    const directOptions = [
      { value: '', label: t('admin.permissions.scope.none') },
      ...policy.allowedDirectScopes.map(scope => ({ value: scope, label: scopeLabel(scope) })),
    ]
    const proposeOptions = [
      { value: '', label: t('admin.permissions.scope.none') },
      ...policy.allowedProposeScopes.map(scope => ({ value: scope, label: scopeLabel(scope) })),
    ]
    const titleKey = `admin.permissions.key.${policy.key}`
    const title = t(titleKey)
    return (
      <div
        key={policy.key}
        className="grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 py-3 border-b border-slate-100 last:border-0"
      >
        <div>
          <p className="text-sm font-medium text-slate-900">
            {title === titleKey ? policy.key : title}
            {policy.isCustom && (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                {t('admin.permissions.custom')}
              </span>
            )}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 font-mono">{policy.key}</p>
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            {t('admin.permissions.direct')}
          </label>
          {readOnly || policy.allowedDirectScopes.length === 0 ? (
            <p className="text-sm text-slate-700 py-2">{scopeLabel(policy.effectiveDirectScope)}</p>
          ) : (
            <CustomSelect
              size="sm"
              disabled={readOnly}
              value={scopeSelectValue(policy.effectiveDirectScope)}
              onChange={value => {
                void saveRow(
                  policy.key,
                  parseScopeSelect(value),
                  policy.effectiveProposeScope,
                )
              }}
              options={directOptions}
            />
          )}
        </div>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            {t('admin.permissions.propose')}
          </label>
          {readOnly || policy.allowedProposeScopes.length === 0 ? (
            <p className="text-sm text-slate-700 py-2">{scopeLabel(policy.effectiveProposeScope)}</p>
          ) : (
            <CustomSelect
              size="sm"
              disabled={readOnly}
              value={scopeSelectValue(policy.effectiveProposeScope)}
              onChange={value => {
                void saveRow(
                  policy.key,
                  policy.effectiveDirectScope,
                  parseScopeSelect(value),
                )
              }}
              options={proposeOptions}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{t('admin.permissions.title')}</h2>
          <p className="text-xs text-slate-400 mt-1">{t('admin.permissions.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {customizedCount > 0 && (
            <span className="text-xs text-slate-500">{t('admin.permissions.customCount', { count: customizedCount })}</span>
          )}
          {canManage && (
            <button
              type="button"
              disabled={saving || customizedCount === 0}
              onClick={() => setConfirmReset(true)}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              {t('admin.permissions.reset')}
            </button>
          )}
          {!canManage && (
            <span className="text-xs text-slate-500">{t('admin.permissions.readOnly')}</span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin mx-auto" />
        </div>
      ) : error ? (
        <div className="p-6 text-sm text-red-600">
          {error}
          <button type="button" className="ml-3 underline" onClick={() => { void reload() }}>
            {t('dashboard.retry')}
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">{t('admin.permissions.empty')}</div>
      ) : (
        <div className="p-5 space-y-6">
          {groups.map(({ group, policies }) => {
            const groupKey = `admin.permissions.group.${group}`
            const groupLabel = t(groupKey)
            return (
              <section key={group}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  {groupLabel === groupKey ? group : groupLabel}
                </h3>
                <div className="rounded-lg border border-slate-100 px-3">
                  {policies.map(renderRow)}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => { void resetAll() }}
        title={t('admin.permissions.resetTitle')}
        message={t('admin.permissions.resetBody')}
        confirmLabel={t('admin.permissions.reset')}
      />
    </div>
  )
}
