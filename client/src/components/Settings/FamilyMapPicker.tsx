import React, { useEffect, useMemo, useState } from 'react'
import { Map } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useSettingsStore } from '../../store/settingsStore'
import { useToast } from '../shared/Toast'
import { FAMILY_MAP_OPTIONS, optionIsUsable, type FamilyMapOptionId } from '../Map/mapRegistry'
import { useEffectiveMapConfig } from '../Map/useEffectiveMapConfig'
import { useFamilyMapStore } from '../../store/familyMapStore'
import { MapView } from '../Map/MapView'
import GlMapPreview from './MapboxPreview'
import Section from './Section'
import ToggleSwitch from './ToggleSwitch'
import type { Place } from '../../types'
import type { FamilyMapErrorKind } from '../../data/supabase/familyMaps'

const PREVIEW_CENTER: [number, number] = [48.8566, 2.3522]
const PREVIEW_ZOOM = 16

function errorCopy(kind: FamilyMapErrorKind | null, fallback: string | null, t: (key: string) => string): string | null {
  if (kind === 'missing_rpc') return t('settings.mapFamilyMissingBackend')
  if (kind === 'permission') return t('settings.mapFamilyPermissionError')
  if (kind === 'network') return t('settings.mapFamilyNetworkError')
  if (kind === 'save' || kind === 'load') return fallback || t('settings.mapFamilyLoadError')
  return fallback
}

export default function FamilyMapPicker(): React.ReactElement {
  const { t } = useTranslation()
  const toast = useToast()
  const { settings, updateSettings } = useSettingsStore()
  const map = useEffectiveMapConfig()
  const family = useFamilyMapStore(s => s.settings)
  const saving = useFamilyMapStore(s => s.saving)
  const error = useFamilyMapStore(s => s.error)
  const errorKind = useFamilyMapStore(s => s.errorKind)
  const selectOption = useFamilyMapStore(s => s.selectOption)
  const [mapbox3d, setMapbox3d] = useState(settings.mapbox_3d_enabled !== false)
  const [mapboxQuality, setMapboxQuality] = useState(settings.mapbox_quality_mode === true)

  useEffect(() => {
    setMapbox3d(settings.mapbox_3d_enabled !== false)
    setMapboxQuality(settings.mapbox_quality_mode === true)
  }, [settings.mapbox_3d_enabled, settings.mapbox_quality_mode])

  const credentials = useMemo(() => ({
    mapbox: family?.mapboxPublicToken ?? null,
    carto: family?.cartoApiKey ?? null,
  }), [family?.mapboxPublicToken, family?.cartoApiKey])
  const enabled = family?.enabledOptionIds ?? ['osm']
  const usableOptions = FAMILY_MAP_OPTIONS.filter(option =>
    enabled.includes(option.id) && optionIsUsable(option.id, credentials),
  )
  const sourceLabel =
    map.source === 'member' ? t('settings.mapSource.member')
      : map.source === 'family' ? t('settings.mapSource.family')
        : t('settings.mapSource.builtin')
  const statusMessage = errorCopy(errorKind, error, t)

  const pick = async (id: FamilyMapOptionId | null) => {
    try {
      await selectOption(id)
      toast.success(t('settings.toast.mapSaved'))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    }
  }

  const saveDeviceToggles = async (next3d: boolean, nextQuality: boolean) => {
    setMapbox3d(next3d)
    setMapboxQuality(nextQuality)
    try {
      await updateSettings({ mapbox_3d_enabled: next3d, mapbox_quality_mode: nextQuality })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'))
    }
  }

  const previewPlaces = useMemo((): Place[] => [{
    id: 1,
    trip_id: 1,
    name: 'Preview',
    description: '',
    lat: PREVIEW_CENTER[0],
    lng: PREVIEW_CENTER[1],
    address: '',
    category_id: 0,
    price: null,
    image_url: null,
    google_place_id: null,
    osm_id: null,
    route_geometry: null,
    place_time: null,
    end_time: null,
    created_at: Date(),
  }], [])

  return (
    <Section title={t('settings.map')} icon={Map}>
      <p className="text-xs text-slate-500">{t('settings.mapFamilyHint')}</p>
      <p className="text-xs text-slate-400">{t('settings.mapSource.label')}: {sourceLabel}</p>
      {statusMessage && <p className="text-sm text-danger" role="status">{statusMessage}</p>}
      <div className="grid gap-2">
        {usableOptions.map(option => {
          const active = map.optionId === option.id
          const isFamilyDefault = family?.defaultOptionId === option.id
          return (
            <button
              key={option.id}
              type="button"
              disabled={saving}
              onClick={() => void pick(option.id)}
              aria-label={t(option.labelKey)}
              aria-pressed={active}
              className={`flex items-start gap-3 p-3 rounded-lg border text-left ${
                active ? 'border-slate-900 bg-slate-50 dark:bg-slate-800 dark:border-slate-200' : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-white">{t(option.labelKey)}</div>
                <div className="text-xs text-slate-500">
                  {option.familyKey}
                  {isFamilyDefault ? ` · ${t('settings.mapFamilyDefaultOption')}` : ''}
                </div>
              </div>
            </button>
          )
        })}
      </div>
      {family?.selectedOptionId && (
        <button
          type="button"
          disabled={saving}
          onClick={() => void pick(null)}
          className="text-xs underline text-slate-500 bg-transparent border-none cursor-pointer"
        >
          {t('settings.mapResetToFamily')}
        </button>
      )}
      {map.engine === 'mapbox-gl' && (
        <>
          <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-900 dark:text-white">{t('settings.map3dBuildings')}</div>
              <div className="text-xs text-slate-500 mt-0.5">{t('settings.mapDeviceLocalHint')}</div>
            </div>
            <ToggleSwitch on={mapbox3d} onToggle={() => void saveDeviceToggles(!mapbox3d, mapboxQuality)} />
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-900 dark:text-white">{t('settings.mapHighQuality')}</div>
              <div className="text-xs text-slate-500 mt-0.5">{t('settings.mapDeviceLocalHint')}</div>
            </div>
            <ToggleSwitch on={mapboxQuality} onToggle={() => void saveDeviceToggles(mapbox3d, !mapboxQuality)} />
          </div>
        </>
      )}
      <div style={{ position: 'relative', inset: 0, height: '200px', width: '100%' }}>
        {map.engine !== 'leaflet' ? (
          <GlMapPreview
            provider={map.engine === 'maplibre-gl' ? 'maplibre-gl' : 'mapbox-gl'}
            token={map.mapboxToken || ''}
            style={map.styleUrl || ''}
            lat={PREVIEW_CENTER[0]}
            lng={PREVIEW_CENTER[1]}
            zoom={PREVIEW_ZOOM}
            enable3d={map.engine === 'mapbox-gl' && mapbox3d}
            quality={map.engine === 'mapbox-gl' && mapboxQuality}
          />
        ) : (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          React.createElement(MapView as any, {
            places: previewPlaces,
            dayPlaces: [],
            route: null,
            routeSegments: null,
            selectedPlaceId: null,
            onMarkerClick: null,
            onMapClick: null,
            onMapContextMenu: null,
            tileUrl: map.rasterUrl,
            tileAttribution: map.attribution,
            fitKey: null,
            dayOrderMap: [],
            leftWidth: 0,
            rightWidth: 0,
            hasInspector: false,
          })
        )}
      </div>
    </Section>
  )
}
