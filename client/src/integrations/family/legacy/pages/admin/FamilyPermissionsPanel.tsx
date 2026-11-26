import React from 'react';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import CustomSelect from '../../components/shared/CustomSelect';
import { type FamilyCapabilityPolicy } from '../../data/supabase/familyPermissions';
import { useTranslation } from '../../i18n';
import { parseScopeSelect, scopeSelectValue } from './familyPermissionsModel';
import { useFamilyPermissions } from './useFamilyPermissions';

export default function FamilyPermissionsPanel(): React.ReactElement {
  const { t } = useTranslation();
  const {
    loading,
    error,
    saving,
    canManage,
    groups,
    customizedCount,
    saveRow,
    resetAll,
    confirmReset,
    setConfirmReset,
    reload,
  } = useFamilyPermissions();

  const scopeLabel = (scope: string | null) => {
    if (!scope) return t('admin.permissions.scope.none');
    const key = `admin.permissions.scope.${scope}`;
    const label = t(key);
    return label === key ? scope : label;
  };

  const renderRow = (policy: FamilyCapabilityPolicy) => {
    const readOnly = !canManage || !policy.configurable || saving;
    const directOptions = [
      { value: '', label: t('admin.permissions.scope.none') },
      ...policy.allowedDirectScopes.map((scope) => ({ value: scope, label: scopeLabel(scope) })),
    ];
    const proposeOptions = [
      { value: '', label: t('admin.permissions.scope.none') },
      ...policy.allowedProposeScopes.map((scope) => ({ value: scope, label: scopeLabel(scope) })),
    ];
    const titleKey = `admin.permissions.key.${policy.key}`;
    const title = t(titleKey);
    return (
      <div
        key={policy.key}
        className="grid grid-cols-1 gap-3 border-b border-edge py-3 last:border-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]"
      >
        <div>
          <p className="text-body font-medium text-content">
            {title === titleKey ? policy.key : title}
            {policy.isCustom && (
              <span className="ms-2 rounded bg-warning-soft px-1.5 py-0.5 text-caption uppercase tracking-wider text-warning">
                {t('admin.permissions.custom')}
              </span>
            )}
          </p>
          <p className="mt-0.5 font-mono text-caption text-content-muted">{policy.key}</p>
        </div>
        <div>
          <label className="mb-1 block text-caption font-semibold uppercase tracking-wider text-content-muted">
            {t('admin.permissions.direct')}
          </label>
          {readOnly || policy.allowedDirectScopes.length === 0 ? (
            <p className="py-2 text-body text-content">{scopeLabel(policy.effectiveDirectScope)}</p>
          ) : (
            <CustomSelect
              size="sm"
              disabled={readOnly}
              value={scopeSelectValue(policy.effectiveDirectScope)}
              onChange={(value) => {
                void saveRow(policy.key, parseScopeSelect(value), policy.effectiveProposeScope);
              }}
              options={directOptions}
            />
          )}
        </div>
        <div>
          <label className="mb-1 block text-caption font-semibold uppercase tracking-wider text-content-muted">
            {t('admin.permissions.propose')}
          </label>
          {readOnly || policy.allowedProposeScopes.length === 0 ? (
            <p className="py-2 text-body text-content">{scopeLabel(policy.effectiveProposeScope)}</p>
          ) : (
            <CustomSelect
              size="sm"
              disabled={readOnly}
              value={scopeSelectValue(policy.effectiveProposeScope)}
              onChange={(value) => {
                void saveRow(policy.key, policy.effectiveDirectScope, parseScopeSelect(value));
              }}
              options={proposeOptions}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-surface-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge p-5">
        <div>
          <h2 className="font-semibold text-content">{t('admin.permissions.title')}</h2>
          <p className="mt-1 text-caption text-content-muted">{t('admin.permissions.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {customizedCount > 0 && (
            <span className="text-caption text-content-muted">
              {t('admin.permissions.customCount', { count: customizedCount })}
            </span>
          )}
          {canManage && (
            <button
              type="button"
              disabled={saving || customizedCount === 0}
              onClick={() => setConfirmReset(true)}
              className="rounded-lg border border-edge px-3 py-1.5 text-body text-content-muted hover:bg-surface-secondary disabled:opacity-40"
            >
              {t('admin.permissions.reset')}
            </button>
          )}
          {!canManage && <span className="text-caption text-content-muted">{t('admin.permissions.readOnly')}</span>}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-edge border-t-edge" />
        </div>
      ) : error ? (
        <div className="p-6 text-body text-danger">
          {error}
          <button
            type="button"
            className="ms-3 underline"
            onClick={() => {
              void reload();
            }}
          >
            {t('dashboard.retry')}
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div className="p-8 text-center text-body text-content-muted">{t('admin.permissions.empty')}</div>
      ) : (
        <div className="space-y-6 p-5">
          {groups.map(({ group, policies }) => {
            const groupKey = `admin.permissions.group.${group}`;
            const groupLabel = t(groupKey);
            return (
              <section key={group}>
                <h3 className="mb-2 text-caption font-semibold uppercase tracking-wider text-content-muted">
                  {groupLabel === groupKey ? group : groupLabel}
                </h3>
                <div className="rounded-lg border border-edge px-3">{policies.map(renderRow)}</div>
              </section>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          void resetAll();
        }}
        title={t('admin.permissions.resetTitle')}
        message={t('admin.permissions.resetBody')}
        confirmLabel={t('admin.permissions.reset')}
      />
    </div>
  );
}
