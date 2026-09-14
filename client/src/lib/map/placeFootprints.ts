/**
 * Focused-place footprints — mirror iOS WorkspacePlacePolygons.
 * Features keyed by properties.name + aliases[] (normalized lowercase), not place UUID.
 */

export type PlaceFootprintFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>

export type FootprintBbox = {
  south: number
  west: number
  north: number
  east: number
}

type BoundaryIndex = {
  byKey: Map<string, PlaceFootprintFeature>
  loaded: boolean
  loading: Promise<void> | null
}

const index: BoundaryIndex = {
  byKey: new Map(),
  loaded: false,
  loading: null,
}

function normalizeName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
}

async function ensureLoaded(): Promise<void> {
  if (index.loaded) return
  if (index.loading) return index.loading
  index.loading = (async () => {
    try {
      const res = await fetch('/workspace/workspace-place-boundaries.geojson')
      if (!res.ok) throw new Error(`footprint geojson ${res.status}`)
      const fc = await res.json() as GeoJSON.FeatureCollection
      for (const f of fc.features ?? []) {
        if (!f || (f.geometry?.type !== 'Polygon' && f.geometry?.type !== 'MultiPolygon')) continue
        const props = (f.properties ?? {}) as { name?: string; aliases?: string[] }
        const names = [props.name, ...(props.aliases ?? [])].filter(Boolean) as string[]
        for (const n of names) {
          index.byKey.set(normalizeName(n), f as PlaceFootprintFeature)
        }
      }
      index.loaded = true
    } catch {
      index.loaded = true // don't retry forever on missing asset
    } finally {
      index.loading = null
    }
  })()
  return index.loading
}

/** Lookup footprint for a trip place display name (honest null if no match). */
export async function findPlaceFootprint(placeName: string | null | undefined): Promise<PlaceFootprintFeature | null> {
  if (!placeName?.trim()) return null
  await ensureLoaded()
  return index.byKey.get(normalizeName(placeName)) ?? null
}

function forEachRingCoord(
  feature: PlaceFootprintFeature,
  visit: (lng: number, lat: number) => void,
): void {
  const g = feature.geometry
  if (g.type === 'Polygon') {
    for (const ring of g.coordinates) {
      for (const c of ring) visit(c[0], c[1])
    }
    return
  }
  for (const poly of g.coordinates) {
    for (const ring of poly) {
      for (const c of ring) visit(c[0], c[1])
    }
  }
}

/** Axis-aligned bbox of a place footprint (iOS WorkspacePlacePolygons.boundingBox). */
export function placeFootprintBoundingBox(feature: PlaceFootprintFeature): FootprintBbox | null {
  let south = Infinity
  let west = Infinity
  let north = -Infinity
  let east = -Infinity
  forEachRingCoord(feature, (lng, lat) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    if (lat < south) south = lat
    if (lat > north) north = lat
    if (lng < west) west = lng
    if (lng > east) east = lng
  })
  if (!(north > south && east > west)) return null
  return { south, west, north, east }
}

/** Ray-cast point-in-polygon for exterior ring (holes ignored — iOS Turf contains parity for explore clip). */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect = ((yi > lat) !== (yj > lat))
      && (lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function pointInPolygonCoords(lng: number, lat: number, polygon: number[][][]): boolean {
  if (!polygon[0] || !pointInRing(lng, lat, polygon[0])) return false
  // If inside any hole, treat as outside.
  for (let h = 1; h < polygon.length; h++) {
    if (pointInRing(lng, lat, polygon[h])) return false
  }
  return true
}

/** Point-in-polygon for explore POI clipping while a place is focused. */
export function placeFootprintContains(
  feature: PlaceFootprintFeature,
  lat: number,
  lng: number,
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  const g = feature.geometry
  if (g.type === 'Polygon') return pointInPolygonCoords(lng, lat, g.coordinates)
  return g.coordinates.some(poly => pointInPolygonCoords(lng, lat, poly))
}
