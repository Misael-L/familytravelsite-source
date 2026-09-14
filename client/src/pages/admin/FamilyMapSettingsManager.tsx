import React, { useMemo, useState } from 'react'
import { Map, Eye, EyeOff } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { FAMILY_MAP_OPTIONS, optionIsUsable, type FamilyMapOptionId } from '../../components/Map/mapRegistry'
import { renderFromOption } from '../../components/Map/resolveMapRender'
import { MapView } from '../../components/Map/MapView'
import GlMapPreview from '../../components/Settings/MapboxPreview'
import type { Place } from '../../types'
import { useFamilyMapSettings } from './useFamilyMapSettings'

const PREVIEW_CENTER: [number, number] = [48.8566, 2.3522]
const PREVIEW_ZOOM = 16

function previewPlaces(): Place[] {
  return [{
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
  }]
}

function CredentialField({
  label,
  hint,
  configured,
  canManage,
  disabled,
  onReplace,
  onClear,
}: {
  label: string
  hint: React.ReactNode
  configured: boolean
  canManage: boolean
  disabled: boolean
  onReplace: (value: string) => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    const trimmed = draft.trim()
    if (!trimmed) return
    onReplace(trimmed)
    setDraft('')
    setEditing(false)
    setReveal(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-content-secondary">{label}</label>
        <span className="text-xs text-content-faint">
          {configured ? t('admin.familyMaps.configured') : t('admin.familyMaps.notConfigured')}
        </span>
      </div>
      <p className="text-xs text-content-faint">{hint}</p>
      {canManage && !editing && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 text-sm rounded-lg border border-edge bg-surface-card text-content disabled:opacity-40"
          >
            {configured ? t('admin.familyMaps.replace') : t('admin.familyMaps.add')}
          </button>
          {configured && (
            <button
              type="button"
              disabled={disabled}
              onClick={onClear}
              className="px-3 py-1.5 text-sm rounded-lg border border-edge text-danger disabled:opacity-40"
            >
              {t('admin.familyMaps.clear')}
            </button>
          )}
        </div>
      )}
      {canManage && editing && (
        <div className="flex gap-2 items-center">
          <input
            type={reveal ? 'text' : 'password'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 px-3 py-2 border border-edge rounded-lg text-sm font-mono bg-surface-card text-content"
          />
          <button
            type="button"
            onClick={() => setReveal(v => !v)}
            className="p-2 border border-edge rounded-lg text-content-muted"
            aria-label={reveal ? t('admin.familyMaps.hideCredential') : t('admin.familyMaps.revealCredential')}
          >
            {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            type="button"
            disabled={disabled || !draft.trim()}
            onClick={commit}
            className="px-3 py-1.5 text-sm rounded-lg bg-slate-900 text-white disabled:opacity-40"
          >
            {t('common.save')}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setDraft(''); setReveal(false) }}
            className="px-3 py-1.5 text-sm rounded-lg border border-edge"
          >
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}

export default function FamilyMapSettingsManager(): React.ReactElement {
  const { t } = useTranslation()
  const { snapshot, canManage, loading, error, saving, reload, save } = useFamilyMapSettings()
  const readOnly = !canManage || saving

  const credentials = useMemo(() => ({
    mapbox: snapshot.mapboxPublicToken,
    carto: snapshot.cartoApiKey,
  }), [snapshot.mapboxPublicToken, snapshot.cartoApiKey])

  const preview = useMemo(() => {
    const option = FAMILY_MAP_OPTIONS.find(o => o.id === snapshot.defaultOptionId)
    if (!option) return null
    return renderFromOption(option, credentials, 'family', snapshot.credentialRevision)
  }, [snapshot.defaultOptionId, credentials, snapshot.credentialRevision])

  if (loading) {
    return <p className="text-content-faint italic p-4 text-sm">{t('common.loading')}</p>
  }

  if (error) {
    return (
      <div className="bg-surface-card rounded-xl border border-edge p-5">
        <p className="text-sm text-danger">{error}</p>
        <button type="button" className="mt-3 text-sm underline text-content" onClick={() => void reload()}>
          {t('dashboard.retry')}
        </button>
      </div>
    )
  }

  const enabled = new Set(snapshot.enabledOptionIds)

  const clearCredential = (kind: 'mapbox' | 'carto') => {
    if (readOnly) return
    const drop = new Set(
      FAMILY_MAP_OPTIONS.filter(option => option.credential === kind).map(option => option.id),
    )
    const remaining = snapshot.enabledOptionIds.filter(id => !drop.has(id))
    const enabledOptionIds = remaining.length > 0 ? remaining : (['osm'] as FamilyMapOptionId[])
    const defaultOptionId = enabledOptionIds.includes(snapshot.defaultOptionId)
      ? snapshot.defaultOptionId
      : enabledOptionIds[0]
    if (!window.confirm(t('admin.familyMaps.clearCredentialConfirm'))) return
    if (kind === 'mapbox') {
      void save({ mapboxPublicToken: null, enabledOptionIds, defaultOptionId })
      return
    }
    void save({ cartoApiKey: null, enabledOptionIds, defaultOptionId })
  }

  const toggleOption = (id: FamilyMapOptionId, next: boolean) => {
    if (readOnly) return
    const ids = next
      ? Array.from(new Set([...snapshot.enabledOptionIds, id]))
      : snapshot.enabledOptionIds.filter(item => item !== id)
    if (ids.length < 1) return
    const defaultOptionId = ids.includes(snapshot.defaultOptionId) ? snapshot.defaultOptionId : ids[0]
    void save({ enabledOptionIds: ids, defaultOptionId })
  }

  return (
    <div className="bg-surface-card rounded-xl border border-edge overflow-hidden">
      <div className="p-5 border-b border-edge flex items-start gap-3">
        <Map size={18} className="text-content-muted mt-0.5" />
        <div>
          <h2 className="font-semibold text-content">{t('admin.familyMaps.title')}</h2>
          <p className="text-xs text-content-muted mt-0.5">{t('admin.familyMaps.subtitle')}</p>
          {!canManage && (
            <p className="text-xs text-content-faint mt-2">{t('admin.familyMaps.readOnly')}</p>
          )}
        </div>
      </div>

      <div className="p-5 space-y-6">
        <p className="text-xs text-content-faint">{t('admin.familyMaps.browserPublicWarning')}</p>
        <p className="text-xs text-content-faint">{t('admin.familyMaps.domainHint')}</p>

        <CredentialField
          label={t('admin.familyMaps.mapboxToken')}
          hint={(
            <>
              {t('admin.familyMaps.mapboxHint')}{' '}
              <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noreferrer" className="underline">
                {t('settings.mapMapboxTokenLink')}
              </a>
            </>
          )}
          configured={snapshot.mapboxConfigured}
          canManage={canManage}
          disabled={readOnly}
          onReplace={value => void save({ mapboxPublicToken: value })}
          onClear={() => clearCredential('mapbox')}
        />

        <CredentialField
          label={t('admin.familyMaps.cartoKey')}
          hint={(
            <>
              {t('admin.familyMaps.cartoHint')}{' '}
              <a href="https://carto.com/" target="_blank" rel="noreferrer" className="underline">
                CARTO
              </a>
            </>
          )}
          configured={snapshot.cartoConfigured}
          canManage={canManage}
          disabled={readOnly}
          onReplace={value => void save({ cartoApiKey: value })}
          onClear={() => clearCredential('carto')}
        />

        <div>
          <p className="text-sm font-medium text-content-secondary mb-2">{t('admin.familyMaps.enabledOptions')}</p>
          <div className="grid gap-2">
            {FAMILY_MAP_OPTIONS.map(option => {
              const usable = optionIsUsable(option.id, {
                mapbox: snapshot.mapboxConfigured ? 'configured' : null,
                carto: snapshot.cartoConfigured ? 'configured' : null,
              })
              const checked = enabled.has(option.id)
              return (
                <label
                  key={option.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border border-edge ${!usable ? 'opacity-60' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={readOnly || (!usable && !checked)}
                    onChange={e => toggleOption(option.id, e.target.checked)}
                    className="mt-1"
                    aria-label={t(option.labelKey)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-content">{t(option.labelKey)}</span>
                    <span className="block text-xs text-content-faint">
                      {option.familyKey}
                      {!usable ? ` · ${t('admin.familyMaps.needsCredential')}` : ''}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-content-secondary mb-2">
            {t('admin.familyMaps.familyDefault')}
          </label>
          <select
            value={snapshot.defaultOptionId}
            disabled={readOnly}
            onChange={e => void save({ defaultOptionId: e.target.value as FamilyMapOptionId })}
            className="w-full max-w-sm px-3 py-2 border border-edge rounded-lg text-sm bg-surface-card text-content"
          >
            {snapshot.enabledOptionIds.map(id => (
              <option key={id} value={id}>{t(FAMILY_MAP_OPTIONS.find(o => o.id === id)?.labelKey || id)}</option>
            ))}
          </select>
        </div>

        {preview && (
          <div style={{ position: 'relative', height: 200, width: '100%' }}>
            {preview.engine === 'leaflet' ? (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              React.createElement(MapView as any, {
                places: previewPlaces(),
                dayPlaces: [],
                route: null,
                routeSegments: null,
                selectedPlaceId: null,
                onMarkerClick: null,
                onMapClick: null,
                onMapContextMenu: null,
                tileUrl: preview.rasterUrl,
                tileAttribution: preview.attribution,
                fitKey: null,
                dayOrderMap: [],
                leftWidth: 0,
                rightWidth: 0,
                hasInspector: false,
              })
            ) : (
              <GlMapPreview
                provider={preview.engine === 'maplibre-gl' ? 'maplibre-gl' : 'mapbox-gl'}
                token={preview.mapboxToken || ''}
                style={preview.styleUrl || ''}
                lat={PREVIEW_CENTER[0]}
                lng={PREVIEW_CENTER[1]}
                zoom={PREVIEW_ZOOM}
                enable3d={preview.engine === 'mapbox-gl'}
                quality={false}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
