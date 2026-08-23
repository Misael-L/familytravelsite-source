import { getSupabaseBrowserClient } from './client'
import type { Poi } from '../../components/Map/poiCategories'
import type { CatalogPoiBbox } from './catalogPois'
import {
  abortError,
  raceTimeout,
  throwIfAborted,
  timeoutAbort,
} from '../../lib/abort'

/** Matches Edge maps-pois MAX_BBOX_SPAN_DEG — do not raise Edge; tile on client. */
export const OSM_MAX_BBOX_SPAN_DEG = 0.5
/** Edge Overpass is 12s; this covers cold start + a hung invoke that ignores abort. */
export const OSM_TILE_TIMEOUT_MS = 20_000
const MAX_TILES = 12
const MERGED_PIN_CAP = 120

type OsmPoiRow = {
  osm_id: string
  name: string
  lat: number
  lng: number
  category: string
  poi_type?: string | null
  address?: string | null
  website?: string | null
  phone?: string | null
  opening_hours?: string | null
  cuisine?: string | null
  source?: string
}

type MapsPoisResponse = {
  pois?: OsmPoiRow[]
  error?: string
  clamped?: boolean
}

export type LatLng = { lat: number; lng: number }

function rowToPoi(row: OsmPoiRow, category: string): Poi | null {
  const lat = Number(row.lat)
  const lng = Number(row.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    osm_id: row.osm_id,
    name: row.name,
    lat,
    lng,
    category: row.category || category,
    poi_type: row.poi_type ?? category,
    address: row.address ?? null,
    website: row.website ?? null,
    phone: row.phone ?? null,
    opening_hours: row.opening_hours ?? null,
    cuisine: row.cuisine ?? null,
    source: 'openstreetmap',
  }
}

/**
 * Ephemeral OSM POIs via Family Edge `maps-pois` (iOS WorkspacePoiService parity).
 * Never Nest `/api/maps/pois`.
 */
export async function listOsmPoisInBbox(opts: {
  category: string
  bbox: CatalogPoiBbox
  limit?: number
  signal?: AbortSignal
}): Promise<Poi[]> {
  const { category, bbox, signal } = opts
  throwIfAborted(signal)
  const limit = opts.limit ?? 60
  const sb = getSupabaseBrowserClient()
  const child = timeoutAbort(signal, OSM_TILE_TIMEOUT_MS)

  try {
    const { data, error } = await raceTimeout(
      sb.functions.invoke<MapsPoisResponse>('maps-pois', {
        body: {
          category,
          south: bbox.south,
          west: bbox.west,
          north: bbox.north,
          east: bbox.east,
          limit,
        },
        signal: child.signal,
      }),
      OSM_TILE_TIMEOUT_MS,
      signal,
    )

    throwIfAborted(signal)
    if (error) throw error
    if (data?.error) throw new Error(data.error)

    return (data?.pois ?? [])
      .map(row => rowToPoi(row, category))
      .filter((p): p is Poi => p != null)
  } finally {
    child.dispose()
  }
}

function bboxSpan(bbox: CatalogPoiBbox): { lat: number; lng: number } {
  return {
    lat: bbox.north - bbox.south,
    lng: bbox.east - bbox.west,
  }
}

function tileContainsPoint(tile: CatalogPoiBbox, p: LatLng): boolean {
  return p.lat >= tile.south && p.lat <= tile.north && p.lng >= tile.west && p.lng <= tile.east
}

function tileScore(tile: CatalogPoiBbox, centroids: LatLng[], viewportCenter?: LatLng): number {
  const cy = (tile.south + tile.north) / 2
  const cx = (tile.west + tile.east) / 2
  if (centroids.length === 0) {
    if (!viewportCenter) return 0
    return (viewportCenter.lat - cy) ** 2 + (viewportCenter.lng - cx) ** 2
  }
  let best = Infinity
  for (const p of centroids) {
    if (tileContainsPoint(tile, p)) return 0
    const d = (p.lat - cy) ** 2 + (p.lng - cx) ** 2
    if (d < best) best = d
  }
  return best
}

/** Build ≤0.5° tiles covering bbox; prefer tiles near trip place centroids. */
export function buildOsmTiles(
  bbox: CatalogPoiBbox,
  placeCentroids: LatLng[] = [],
  maxTiles = MAX_TILES,
): CatalogPoiBbox[] {
  const span = bboxSpan(bbox)
  if (span.lat <= OSM_MAX_BBOX_SPAN_DEG && span.lng <= OSM_MAX_BBOX_SPAN_DEG) {
    return [bbox]
  }

  const step = OSM_MAX_BBOX_SPAN_DEG
  const tiles: CatalogPoiBbox[] = []
  for (let south = bbox.south; south < bbox.north; south += step) {
    for (let west = bbox.west; west < bbox.east; west += step) {
      tiles.push({
        south,
        west,
        north: Math.min(south + step, bbox.north),
        east: Math.min(west + step, bbox.east),
      })
    }
  }

  if (tiles.length <= maxTiles) return tiles

  const midLat = (bbox.south + bbox.north) / 2
  const midLng = (bbox.west + bbox.east) / 2
  const center = { lat: midLat, lng: midLng }
  const scored = tiles
    .map((tile, i) => ({ tile, i, score: tileScore(tile, placeCentroids, center) }))
    .sort((a, b) => a.score - b.score || a.i - b.i)

  const picked: CatalogPoiBbox[] = []
  const seen = new Set<number>()
  const centerIdx = scored.findIndex(s => tileContainsPoint(s.tile, center))
  if (centerIdx >= 0) {
    picked.push(scored[centerIdx].tile)
    seen.add(scored[centerIdx].i)
  }
  for (const s of scored) {
    if (picked.length >= maxTiles) break
    if (seen.has(s.i)) continue
    picked.push(s.tile)
    seen.add(s.i)
  }
  return picked
}

/**
 * Country / Plan-scale OSM fetch: tile when span > 0.5°, bias to trip place centroids.
 * Fails only if every tile request fails.
 */
export async function listOsmPoisInBboxTiled(opts: {
  category: string
  bbox: CatalogPoiBbox
  placeCentroids?: LatLng[]
  signal?: AbortSignal
  limitPerTile?: number
  mergedCap?: number
}): Promise<Poi[]> {
  const tiles = buildOsmTiles(opts.bbox, opts.placeCentroids ?? [])
  if (tiles.length === 1) {
    return listOsmPoisInBbox({
      category: opts.category,
      bbox: tiles[0],
      limit: opts.limitPerTile ?? 60,
      signal: opts.signal,
    })
  }

  const results = await Promise.allSettled(
    tiles.map(tile => listOsmPoisInBbox({
      category: opts.category,
      bbox: tile,
      limit: opts.limitPerTile ?? 60,
      signal: opts.signal,
    })),
  )

  if (opts.signal?.aborted) throw abortError()

  const merged: Poi[] = []
  const seen = new Set<string>()
  let anyOk = false
  let lastErr: unknown = null
  for (const r of results) {
    if (r.status === 'rejected') {
      lastErr = r.reason
      continue
    }
    anyOk = true
    for (const p of r.value) {
      if (seen.has(p.osm_id)) continue
      seen.add(p.osm_id)
      merged.push(p)
      if (merged.length >= (opts.mergedCap ?? MERGED_PIN_CAP)) {
        return merged
      }
    }
  }
  if (!anyOk) throw lastErr instanceof Error ? lastErr : new Error('maps-pois tiled fetch failed')
  return merged
}
