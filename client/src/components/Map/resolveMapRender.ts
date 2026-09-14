import type { Settings } from '../../types'
import {
  BUILTIN_MAP_OPTION_ID,
  builtinMapOption,
  getFamilyMapOption,
  OSM_TILE_TEMPLATE,
  type FamilyMapOption,
  type FamilyMapOptionId,
  type MapEngine,
  type MapOptionSource,
} from './mapRegistry'
import type { EffectiveMapSettings } from '../../data/supabase/familyMaps'
import { resolveTileUrl } from '../../utils/tileUrl'
import { MAPBOX_DEFAULT_STYLE, OPENFREEMAP_DEFAULT_STYLE } from './glProviders'

export type MapRenderVariant = 'default' | 'atlas'

export type EffectiveMapRender = {
  optionId: FamilyMapOptionId
  source: MapOptionSource
  engine: MapEngine
  rasterUrl: string
  atlasRasterUrl: string
  styleUrl: string | null
  mapboxToken: string | null
  attribution: string
  credentialRevision: number
  option: FamilyMapOption
}

function rasterFor(option: FamilyMapOption, cartoKey: string | null, variant: MapRenderVariant): string {
  const template = variant === 'atlas'
    ? (option.atlasTileTemplate || option.tileTemplate)
    : option.tileTemplate
  return resolveTileUrl(template, OSM_TILE_TEMPLATE, cartoKey)
}

export function renderFromOption(
  option: FamilyMapOption,
  credentials: { mapbox: string | null; carto: string | null },
  source: MapOptionSource,
  credentialRevision = 0,
  variant: MapRenderVariant = 'default',
): EffectiveMapRender {
  const rasterUrl = option.engine === 'leaflet'
    ? rasterFor(option, credentials.carto, 'default')
    : ''
  const atlasRasterUrl = option.engine === 'leaflet'
    ? rasterFor(option, credentials.carto, 'atlas')
    : ''
  return {
    optionId: option.id,
    source,
    engine: option.engine,
    rasterUrl: variant === 'atlas' ? atlasRasterUrl : rasterUrl,
    atlasRasterUrl,
    styleUrl: option.styleUrl,
    mapboxToken: option.credential === 'mapbox' ? credentials.mapbox : null,
    attribution: option.attribution,
    credentialRevision,
    option,
  }
}

export function publicMapRender(): EffectiveMapRender {
  return renderFromOption(builtinMapOption(), { mapbox: null, carto: null }, 'builtin')
}

export function renderFromEffective(
  settings: EffectiveMapSettings | null | undefined,
  variant: MapRenderVariant = 'default',
): EffectiveMapRender {
  if (!settings) return publicMapRender()
  const option = getFamilyMapOption(settings.effectiveOptionId) ?? builtinMapOption()
  const credentials = {
    mapbox: settings.mapboxPublicToken,
    carto: settings.cartoApiKey,
  }
  if (option.engine === 'mapbox-gl' && !credentials.mapbox) {
    return renderFromOption(builtinMapOption(), credentials, 'builtin', settings.credentialRevision, variant)
  }
  if (option.engine === 'leaflet' && option.credential === 'carto' && !credentials.carto) {
    return renderFromOption(builtinMapOption(), credentials, 'builtin', settings.credentialRevision, variant)
  }
  return renderFromOption(option, credentials, settings.source, settings.credentialRevision, variant)
}

export function renderFromNestSettings(
  settings: Pick<Settings, 'map_provider' | 'map_tile_url' | 'mapbox_access_token' | 'mapbox_style' | 'maplibre_style'>,
  _variant: MapRenderVariant = 'default',
): EffectiveMapRender {
  const provider = settings.map_provider
  if (provider === 'mapbox-gl' && settings.mapbox_access_token) {
    const option = getFamilyMapOption('mapbox-standard')!
    return {
      ...renderFromOption(option, { mapbox: settings.mapbox_access_token, carto: null }, 'member'),
      styleUrl: settings.mapbox_style || MAPBOX_DEFAULT_STYLE,
    }
  }
  if (provider === 'maplibre-gl') {
    const option = getFamilyMapOption('openfreemap-liberty')!
    return {
      ...renderFromOption(option, { mapbox: null, carto: null }, 'member'),
      styleUrl: settings.maplibre_style || OPENFREEMAP_DEFAULT_STYLE,
    }
  }
  const raster = resolveTileUrl(settings.map_tile_url, OSM_TILE_TEMPLATE, null)
  const osm = builtinMapOption()
  const option = getFamilyMapOption(BUILTIN_MAP_OPTION_ID)!
  return {
    optionId: option.id,
    source: 'member',
    engine: 'leaflet',
    rasterUrl: raster,
    atlasRasterUrl: raster,
    styleUrl: null,
    mapboxToken: null,
    attribution: osm.attribution,
    credentialRevision: 0,
    option,
  }
}

export function prefetchTemplateFor(render: EffectiveMapRender): string | undefined {
  if (render.engine !== 'leaflet') return undefined
  return render.rasterUrl
}
