import { Map } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import Section from '../../../../../components/Settings/Section';
import ToggleSwitch from '../../../../../components/Settings/ToggleSwitch';
import { useToast } from '../../../../../components/shared/Toast';
import { useTranslation } from '../../../../../i18n';
import { MSetCard } from '../../../../../mobile/screens/settings/MSettingsUi';
import { useSettingsStore } from '../../../../../store/settingsStore';
import { captureFamilyActor } from '../../../actorContext';
import type { FamilyMapErrorKind } from '../../data/supabase/familyMaps';
import { useFamilyMapStore } from '../../store/familyMapStore';
import { FAMILY_MAP_OPTIONS, optionIsUsable, type FamilyMapOptionId } from '../Map/mapRegistry';
import { useEffectiveMapConfig } from '../Map/useEffectiveMapConfig';
import FamilyMapPreview from './FamilyMapPreview';

function errorCopy(
  kind: FamilyMapErrorKind | null,
  fallback: string | null,
  t: (key: string) => string
): string | null {
  if (kind === 'missing_rpc') return t('settings.mapFamilyMissingBackend');
  if (kind === 'permission') return t('settings.mapFamilyPermissionError');
  if (kind === 'network') return t('settings.mapFamilyNetworkError');
  if (kind === 'save' || kind === 'load') return fallback || t('settings.mapFamilyLoadError');
  return fallback;
}

export default function FamilyMapPicker({ phone = false }: { phone?: boolean }): React.ReactElement {
  const { t } = useTranslation();
  const toast = useToast();
  const { settings, updateSettings } = useSettingsStore();
  const map = useEffectiveMapConfig();
  const Card = phone ? MSetCard : Section;
  const hydrated = useFamilyMapStore((s) => s.hydrated);
  const family = useFamilyMapStore((s) => s.settings);
  const saving = useFamilyMapStore((s) => s.saving);
  const error = useFamilyMapStore((s) => s.error);
  const errorKind = useFamilyMapStore((s) => s.errorKind);
  const selectOption = useFamilyMapStore((s) => s.selectOption);
  const [mapbox3d, setMapbox3d] = useState(settings.mapbox_3d_enabled !== false);
  const [mapboxQuality, setMapboxQuality] = useState(settings.mapbox_quality_mode === true);

  useEffect(() => {
    setMapbox3d(settings.mapbox_3d_enabled !== false);
    setMapboxQuality(settings.mapbox_quality_mode === true);
  }, [settings.mapbox_3d_enabled, settings.mapbox_quality_mode]);

  const credentials = useMemo(
    () => ({
      mapbox: family?.mapboxPublicToken ?? null,
      carto: family?.cartoApiKey ?? null,
    }),
    [family?.mapboxPublicToken, family?.cartoApiKey]
  );
  const enabled = family?.enabledOptionIds ?? ['osm'];
  const usableOptions = FAMILY_MAP_OPTIONS.filter(
    (option) => enabled.includes(option.id) && optionIsUsable(option.id, credentials)
  );
  const sourceLabel =
    map.source === 'member'
      ? t('settings.mapSource.member')
      : map.source === 'family'
        ? t('settings.mapSource.family')
        : t('settings.mapSource.builtin');
  const statusMessage = errorCopy(errorKind, error, t);

  const pick = async (id: FamilyMapOptionId | null) => {
    const actor = captureFamilyActor();
    try {
      await selectOption(id);
      if (actor.current()) toast.success(t('settings.toast.mapSaved'));
    } catch (err: unknown) {
      if (actor.current()) toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const saveDeviceToggles = async (next3d: boolean, nextQuality: boolean) => {
    setMapbox3d(next3d);
    setMapboxQuality(nextQuality);
    try {
      await updateSettings({ mapbox_3d_enabled: next3d, mapbox_quality_mode: nextQuality });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <Card title={t('settings.map')} icon={Map}>
      <p className="text-caption text-content-muted">{t('settings.mapFamilyHint')}</p>
      <p className="text-caption text-content-muted">
        {t('settings.mapSource.label')}: {sourceLabel}
      </p>
      {statusMessage && (
        <p className="text-body text-danger" role="status">
          {statusMessage}
        </p>
      )}
      <div className="grid gap-2">
        {usableOptions.map((option) => {
          const active = map.optionId === option.id;
          const isFamilyDefault = family?.defaultOptionId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={!hydrated || saving}
              onClick={() => void pick(option.id)}
              aria-label={t(option.labelKey)}
              aria-pressed={active}
              className={`flex items-start gap-3 rounded-lg border p-3 text-start ${
                active
                  ? 'border-edge bg-surface-secondary dark:border-edge dark:bg-inverse'
                  : 'border-edge dark:border-edge'
              }`}
            >
              <div>
                <div className="text-body font-medium text-content dark:text-inverse-text">{t(option.labelKey)}</div>
                <div className="text-caption text-content-muted">
                  {option.familyKey}
                  {isFamilyDefault ? ` · ${t('settings.mapFamilyDefaultOption')}` : ''}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {family?.selectedOptionId && (
        <button
          type="button"
          disabled={!hydrated || saving}
          onClick={() => void pick(null)}
          className="cursor-pointer border-none bg-transparent text-caption text-content-muted underline"
        >
          {t('settings.mapResetToFamily')}
        </button>
      )}
      {map.engine === 'mapbox-gl' && (
        <>
          <div className="flex items-start gap-3 rounded-lg border border-edge p-3 dark:border-edge">
            <div className="flex-1">
              <div className="text-body font-medium text-content dark:text-inverse-text">
                {t('settings.map3dBuildings')}
              </div>
              <div className="mt-0.5 text-caption text-content-muted">{t('settings.mapDeviceLocalHint')}</div>
            </div>
            <ToggleSwitch
              label={t('settings.map3dBuildings')}
              on={mapbox3d}
              onToggle={() => void saveDeviceToggles(!mapbox3d, mapboxQuality)}
            />
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-edge p-3 dark:border-edge">
            <div className="flex-1">
              <div className="text-body font-medium text-content dark:text-inverse-text">
                {t('settings.mapHighQuality')}
              </div>
              <div className="mt-0.5 text-caption text-content-muted">{t('settings.mapDeviceLocalHint')}</div>
            </div>
            <ToggleSwitch
              label={t('settings.mapHighQuality')}
              on={mapboxQuality}
              onToggle={() => void saveDeviceToggles(mapbox3d, !mapboxQuality)}
            />
          </div>
        </>
      )}
      <div style={{ position: 'relative', inset: 0, height: '200px', width: '100%' }}>
        <FamilyMapPreview map={map} enable3d={mapbox3d} quality={mapboxQuality} />
      </div>
    </Card>
  );
}
