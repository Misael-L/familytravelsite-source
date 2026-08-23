import React from 'react'
import { ToggleLeft } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useFamilyFeatureControls } from './useFamilyFeatureControls'
import type { FamilyFeatureKey, FamilyFeatureMode, FamilyFeatureRolloutState } from '../../data/supabase/familyFeatures'

const FEATURE_NAME_KEY: Record<FamilyFeatureKey, string> = {
  vacay: 'admin.familyFeatures.key.vacay',
  collections: 'admin.familyFeatures.key.collections',
  'workspace.place_categories': 'admin.familyFeatures.key.workspacePlaceCategories',
}

export default function FamilyFeatureControlsManager(): React.ReactElement {
  const { t } = useTranslation()
  const {
    snapshot, events, canManage, isSuperAdmin, loading, error, saving,
    saveFamilyMode, saveRollout,
  } = useFamilyFeatureControls()

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
          <ToggleLeft className="w-5 h-5" />
          {t('admin.familyFeatures.title')}
        </h2>
        <p className="text-sm mt-1 text-content-muted">{t('admin.familyFeatures.subtitle')}</p>
        {!canManage && (
          <p className="text-xs mt-2 text-content-faint">{t('admin.familyFeatures.readOnly')}</p>
        )}
      </div>

      <div className="rounded-xl border border-edge divide-y divide-edge bg-surface-card">
        {(snapshot?.controls ?? []).map(row => (
          <div key={row.key} className="px-4 py-3 space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-content">{t(FEATURE_NAME_KEY[row.key])}</p>
                <p className="text-xs text-content-faint">
                  {row.effectiveEnabled
                    ? t('admin.familyFeatures.effectiveOn')
                    : t('admin.familyFeatures.effectiveOff')}
                </p>
              </div>
              <label className="text-xs text-content-muted">
                <span className="sr-only">{t('admin.familyFeatures.familyMode')}</span>
                <select
                  className="text-sm rounded-lg border border-edge bg-surface-card px-2 py-1"
                  value={row.familyMode}
                  disabled={!canManage || saving || !row.familyConfigurable}
                  onChange={e => {
                    void saveFamilyMode(row.key, e.target.value as FamilyFeatureMode)
                  }}
                >
                  <option value="inherit">{t('admin.familyFeatures.mode.inherit')}</option>
                  <option value="enabled">{t('admin.familyFeatures.mode.enabled')}</option>
                  <option value="disabled">{t('admin.familyFeatures.mode.disabled')}</option>
                </select>
              </label>
            </div>
            {isSuperAdmin && (
              <label className="flex items-center justify-between gap-3 text-xs text-content-muted">
                <span>{t('admin.familyFeatures.productRollout')}</span>
                <select
                  className="text-sm rounded-lg border border-edge bg-surface-card px-2 py-1"
                  value={row.rolloutState}
                  disabled={saving}
                  onChange={e => {
                    void saveRollout(row.key, e.target.value as FamilyFeatureRolloutState)
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
          <h3 className="text-sm font-semibold text-content mb-2">{t('admin.familyFeatures.historyTitle')}</h3>
          {events.length === 0 ? (
            <p className="text-sm text-content-muted">{t('admin.familyFeatures.historyEmpty')}</p>
          ) : (
            <ul className="rounded-xl border border-edge divide-y divide-edge bg-surface-card">
              {events.map(event => (
                <li key={event.id} className="px-4 py-2 text-sm text-content">
                  <span className="font-medium">{t(FEATURE_NAME_KEY[event.featureKey])}</span>
                  {' · '}
                  {event.oldState ?? t('admin.familyFeatures.mode.inherit')}
                  {' → '}
                  {event.newState}
                  <span className="block text-xs text-content-faint">{event.createdAt}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
