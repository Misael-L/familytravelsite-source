/**
 * Map marker place shape — Nest Place or Family Travel UUID destination pin.
 * Used by MapView / MapViewGL so W3 can pass string ids without Nest Place SoR.
 */
export type MapMarkerPlace = {
  id: string | number
  name: string
  lat: number | null | undefined
  lng: number | null | undefined
  image_url?: string | null
  google_place_id?: string | null
  osm_id?: string | null
  category_color?: string | null
  category_icon?: string | null
  category_id?: number | null
  category_name?: string | null
  address?: string | null
  route_geometry?: string | null
  [key: string]: unknown
}
