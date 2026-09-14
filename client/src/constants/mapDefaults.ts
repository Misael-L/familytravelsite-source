export const DEFAULT_MAP_LAT = 0
export const DEFAULT_MAP_LNG = 0
export const DEFAULT_MAP_ZOOM = 2
export const DEFAULT_MAP_CENTER: [number, number] = [DEFAULT_MAP_LAT, DEFAULT_MAP_LNG]

/**
 * Zoom ceiling for a Leaflet map, set on the map rather than only on its base
 * layer. MarkerClusterGroup refuses an infinite ceiling. Matches the raster
 * tile maxZoom already used in MapView. Do not adopt OpenFreeMap/CARTO here.
 */
export const MAP_MAX_ZOOM = 19

