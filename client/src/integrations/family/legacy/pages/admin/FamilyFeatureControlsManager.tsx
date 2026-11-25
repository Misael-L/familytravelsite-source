import { ToggleLeft } from 'lucide-react';
import React from 'react';
import type {
  FamilyFeatureKey,
  FamilyFeatureMode,
  FamilyFeatureRolloutState,
} from '../../data/supabase/familyFeatures';
import { useTranslation } from '../../i18n';
import { useFamilyFeatureControls } from './useFamilyFeatureControls';

const FEATURE_NAME_KEY: Record<FamilyFeatureKey, string> = {
  vacay: 'admin.familyFeatures.key.vacay',
  collections: 'admin.familyFeatures.key.collections',
  'workspace.place_categories': 'admin.familyFeatures.key.workspacePlaceCategories',
  journey: 'admin.familyFeatures.key.journey',
};

export default function FamilyFeatureControlsManager(): React.ReactElement {
  const { t } = useTranslation();
  const { snapshot, events, canManage, isSuperAdmin, loading, error, saving, saveFamilyMode, saveRollout } =
    useFamilyFeatureControls();

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
          <ToggleLeft className="h-5 w-5" />
          {t('admin.familyFeatures.title')}
        </h2>
        <p className="mt-1 text-body text-content-muted">{t('admin.familyFeatures.subtitle')}</p>
        {!canManage && <p className="mt-2 text-caption text-content-faint">{t('admin.familyFeatures.readOnly')}</p>}
      </div>

      <div className="divide-y divide-edge rounded-xl border border-edge bg-surface-card">
        {(snapshot?.controls ?? []).map((row) => (
          <div key={row.key} className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-body font-medium text-content">{t(FEATURE_NAME_KEY[row.key])}</p>
                <p className="text-caption text-content-faint">
                  {row.effectiveEnabled
                    ? t('admin.familyFeatures.effectiveOn')
                    : t('admin.familyFeatures.effectiveOff')}
                </p>
              </div>
              <label className="text-caption text-content-muted">
                <span className="sr-only">{t('admin.familyFeatures.familyMode')}</span>
                <select
                  className="rounded-lg border border-edge bg-surface-card px-2 py-1 text-body"
                  value={row.familyMode}
                  disabled={!canManage || saving || !row.familyConfigurable}
                  onChange={(e) => {
                    void saveFamilyMode(row.key, e.target.value as FamilyFeatureMode);
                  }}
                >
                  <option value="inherit">{t('admin.familyFeatures.mode.inherit')}</option>
                  <option value="enabled">{t('admin.familyFeatures.mode.enabled')}</option>
                  <option value="disabled">{t('admin.familyFeatures.mode.disabled')}</option>
                </select>
              </label>
            </div>
            {isSuperAdmin && (
              <label className="flex items-center justify-between gap-3 text-caption text-content-muted">
                <span>{t('admin.familyFeatures.productRollout')}</span>
                <select
                  className="rounded-lg border border-edge bg-surface-card px-2 py-1 text-body"
                  value={row.rolloutState}
                  disabled={saving}
                  onChange={(e) => {
                    void saveRollout(row.key, e.target.value as FamilyFeatureRolloutState);
                  }}
                >
                  <option value="enabled">{t('admin.familyFeatures.rollout.enabled')}</option>
                  <option value="preview">{t('admin.familyFeatures.rollout.preview')}</option>
                  <option value="disabled">{t('admin.familyFeatures.rollout.disabled')}</option>
                </select>
              </label>
            )}
          </div>
        ))}
      </div>

      {isSuperAdmin && (
        <div>
          <h3 className="mb-2 text-body font-semibold text-content">{t('admin.familyFeatures.historyTitle')}</h3>
          {events.length === 0 ? (
            <p className="text-body text-content-muted">{t('admin.familyFeatures.historyEmpty')}</p>
          ) : (
            <ul className="divide-y divide-edge rounded-xl border border-edge bg-surface-card">
              {events.map((event) => (
                <li key={event.id} className="px-4 py-2 text-body text-content">
                  <span className="font-medium">{t(FEATURE_NAME_KEY[event.featureKey])}</span>
                  {' · '}
                  {event.oldState ?? t('admin.familyFeatures.mode.inherit')}
                  {' → '}
                  {event.newState}
                  <span className="block text-caption text-content-faint">{event.createdAt}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
