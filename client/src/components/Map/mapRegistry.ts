/**
 * §47 Family named map options. Stable IDs match Postgres family_auth.map_option_ids().
 * Stadia is not in this catalog. Templates never include ?key=.
 */

export const FAMILY_MAP_OPTION_IDS = [
  'osm',
  'osm-de',
  'carto-light',
  'carto-dark',
  'mapbox-standard',
  'mapbox-standard-satellite',
  'mapbox-streets',
  'mapbox-outdoors',
  'mapbox-light',
  'mapbox-dark',
  'mapbox-satellite',
  'mapbox-satellite-streets',
  'mapbox-navigation-day',
  'mapbox-navigation-night',
  'openfreemap-liberty',
  'openfreemap-bright',
  'openfreemap-positron',
] as const

export type FamilyMapOptionId = (typeof FAMILY_MAP_OPTION_IDS)[number]
export type MapCredentialKind = 'none' | 'carto' | 'mapbox'
export type MapEngine = 'leaflet' | 'mapbox-gl' | 'maplibre-gl'
export type MapOptionSource = 'member' | 'family' | 'builtin'

export const BUILTIN_MAP_OPTION_ID: FamilyMapOptionId = 'osm'

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
export const MAPBOX_ATTRIBUTION =
  '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
export const OPENFREEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://openfreemap.org/">OpenFreeMap</a>'

export const OSM_TILE_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const OSM_DE_TILE_TEMPLATE = 'https://tile.openstreetmap.de/{z}/{x}/{y}.png'
export const CARTO_LIGHT_TEMPLATE = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
export const CARTO_DARK_TEMPLATE = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
export const CARTO_LIGHT_NOLABELS_TEMPLATE =
  'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'
export const CARTO_DARK_NOLABELS_TEMPLATE =
  'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'

export interface FamilyMapOption {
  id: FamilyMapOptionId
  engine: MapEngine
  credential: MapCredentialKind
  labelKey: string
  familyKey: string
  attribution: string
  /** Leaflet raster template. Null for vector engines. Never contains ?key=. */
  tileTemplate: string | null
  /** Atlas overlay basemap (usually unlabeled). Falls back to tileTemplate. */
  atlasTileTemplate: string | null
  styleUrl: string | null
  tags: string[]
}

const MAPBOX = (
  id: FamilyMapOptionId,
  styleUrl: string,
  labelKey: string,
  tags: string[],
): FamilyMapOption => ({
  id,
  engine: 'mapbox-gl',
  credential: 'mapbox',
  labelKey,
  familyKey: 'Mapbox',
  attribution: MAPBOX_ATTRIBUTION,
  tileTemplate: null,
  atlasTileTemplate: null,
  styleUrl,
  tags,
})

const OPENFREEMAP = (
  id: FamilyMapOptionId,
  styleUrl: string,
  labelKey: string,
  tags: string[],
): FamilyMapOption => ({
  id,
  engine: 'maplibre-gl',
  credential: 'none',
  labelKey,
  familyKey: 'OpenFreeMap',
  attribution: OPENFREEMAP_ATTRIBUTION,
  tileTemplate: null,
  atlasTileTemplate: null,
  styleUrl,
  tags,
})

export const FAMILY_MAP_OPTIONS: readonly FamilyMapOption[] = [
  {
    id: 'osm',
    engine: 'leaflet',
    credential: 'none',
    labelKey: 'maps.option.osm',
    familyKey: 'OpenStreetMap',
    attribution: OSM_ATTRIBUTION,
    tileTemplate: OSM_TILE_TEMPLATE,
    atlasTileTemplate: OSM_TILE_TEMPLATE,
    styleUrl: null,
    tags: ['2D'],
  },
  {
    id: 'osm-de',
    engine: 'leaflet',
    credential: 'none',
    labelKey: 'maps.option.osmDe',
    familyKey: 'OpenStreetMap',
    attribution: OSM_ATTRIBUTION,
    tileTemplate: OSM_DE_TILE_TEMPLATE,
    atlasTileTemplate: OSM_DE_TILE_TEMPLATE,
    styleUrl: null,
    tags: ['2D'],
  },
  {
    id: 'carto-light',
    engine: 'leaflet',
    credential: 'carto',
    labelKey: 'maps.option.cartoLight',
    familyKey: 'CARTO',
    attribution: CARTO_ATTRIBUTION,
    tileTemplate: CARTO_LIGHT_TEMPLATE,
    atlasTileTemplate: CARTO_LIGHT_NOLABELS_TEMPLATE,
    styleUrl: null,
    tags: ['2D', 'Minimal'],
  },
  {
    id: 'carto-dark',
    engine: 'leaflet',
    credential: 'carto',
    labelKey: 'maps.option.cartoDark',
    familyKey: 'CARTO',
    attribution: CARTO_ATTRIBUTION,
    tileTemplate: CARTO_DARK_TEMPLATE,
    atlasTileTemplate: CARTO_DARK_NOLABELS_TEMPLATE,
    styleUrl: null,
    tags: ['2D', 'Dark'],
  },
  MAPBOX('mapbox-standard', 'mapbox://styles/mapbox/standard', 'maps.option.mapboxStandard', ['3D', 'Apple-like']),
  MAPBOX('mapbox-standard-satellite', 'mapbox://styles/mapbox/standard-satellite', 'maps.option.mapboxStandardSatellite', ['3D', 'Satellite']),
  MAPBOX('mapbox-streets', 'mapbox://styles/mapbox/streets-v12', 'maps.option.mapboxStreets', ['3D', 'Classic']),
  MAPBOX('mapbox-outdoors', 'mapbox://styles/mapbox/outdoors-v12', 'maps.option.mapboxOutdoors', ['3D', 'Terrain']),
  MAPBOX('mapbox-light', 'mapbox://styles/mapbox/light-v11', 'maps.option.mapboxLight', ['3D', 'Minimal']),
  MAPBOX('mapbox-dark', 'mapbox://styles/mapbox/dark-v11', 'maps.option.mapboxDark', ['3D', 'Dark']),
  MAPBOX('mapbox-satellite', 'mapbox://styles/mapbox/satellite-v9', 'maps.option.mapboxSatellite', ['3D', 'Satellite']),
  MAPBOX('mapbox-satellite-streets', 'mapbox://styles/mapbox/satellite-streets-v12', 'maps.option.mapboxSatelliteStreets', ['3D', 'Satellite']),
  MAPBOX('mapbox-navigation-day', 'mapbox://styles/mapbox/navigation-day-v1', 'maps.option.mapboxNavigationDay', ['3D', 'Apple-like']),
  MAPBOX('mapbox-navigation-night', 'mapbox://styles/mapbox/navigation-night-v1', 'maps.option.mapboxNavigationNight', ['3D', 'Dark']),
  OPENFREEMAP('openfreemap-liberty', 'https://tiles.openfreemap.org/styles/liberty', 'maps.option.openfreemapLiberty', ['OpenFreeMap', '2D']),
  OPENFREEMAP('openfreemap-bright', 'https://tiles.openfreemap.org/styles/bright', 'maps.option.openfreemapBright', ['OpenFreeMap', 'Classic']),
  OPENFREEMAP('openfreemap-positron', 'https://tiles.openfreemap.org/styles/positron', 'maps.option.openfreemapPositron', ['OpenFreeMap', 'Minimal']),
]

const OPTION_BY_ID = new Map<FamilyMapOptionId, FamilyMapOption>(
  FAMILY_MAP_OPTIONS.map(option => [option.id, option]),
)

export function isFamilyMapOptionId(value: string | null | undefined): value is FamilyMapOptionId {
  return !!value && (FAMILY_MAP_OPTION_IDS as readonly string[]).includes(value)
}

export function getFamilyMapOption(id: string | null | undefined): FamilyMapOption | null {
  if (!isFamilyMapOptionId(id)) return null
  return OPTION_BY_ID.get(id) ?? null
}

export function builtinMapOption(): FamilyMapOption {
  return OPTION_BY_ID.get(BUILTIN_MAP_OPTION_ID)!
}

export function optionNeedsCredential(id: string, kind: MapCredentialKind): boolean {
  const option = getFamilyMapOption(id)
  return option?.credential === kind
}

export function optionIsUsable(
  id: string | null | undefined,
  credentials: { mapbox: string | null; carto: string | null },
): boolean {
  const option = getFamilyMapOption(id)
  if (!option) return false
  if (option.credential === 'mapbox') return !!credentials.mapbox
  if (option.credential === 'carto') return !!credentials.carto
  return true
}

export function templatesContainQueryKey(option: FamilyMapOption): boolean {
  return [option.tileTemplate, option.atlasTileTemplate, option.styleUrl]
    .filter((value): value is string => !!value)
    .some(value => /[?&]key=/.test(value))
}

/** One-time localStorage map_provider → named option. Never maps a stored token. */
export function legacyProviderToOptionId(provider: string | null | undefined): FamilyMapOptionId | null {
  if (provider === 'leaflet') return 'osm'
  if (provider === 'mapbox-gl') return 'mapbox-standard'
  if (provider === 'maplibre-gl') return 'openfreemap-liberty'
  return null
}
