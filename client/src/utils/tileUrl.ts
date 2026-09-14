/**
 * TREK v4.2 tile helpers, adapted to named Family map options.
 * CARTO ?key= is injected only at resolve time. Templates must never persist it.
 */

const OSM_SHARD = /^((?:https?:)?\/\/)(?:\{s\}|[a-d])\.tile\.openstreetmap\.org(?=[/:]|$)/i
const CARTO_HOST = /^(?:\{s\}|[a-d])?\.?basemaps\.cartocdn\.com$/i
const TRUSTED_RASTER_HOSTS = new Set([
  'tile.openstreetmap.org',
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
  'tile.openstreetmap.de',
  'basemaps.cartocdn.com',
  'a.basemaps.cartocdn.com',
  'b.basemaps.cartocdn.com',
  'c.basemaps.cartocdn.com',
  'd.basemaps.cartocdn.com',
])

function templateHost(url: string): string {
  return url.replace(/^\w*:?\/\//, '').split(/[/?#]/)[0].toLowerCase()
}

export function normalizeTileUrl(url: string): string {
  if (!url) return url
  return url.replace(OSM_SHARD, '$1tile.openstreetmap.org')
}

export function withTileApiKey(url: string, key?: string | null): string {
  if (!url || !key) return url
  if (!CARTO_HOST.test(templateHost(url))) return url
  if (/[?&]key=/.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`
}

export function stripTileApiKey(url: string): string {
  if (!url || !/[?&]key=/.test(url)) return url
  return url.replace(/([?&])key=[^&]*&?/, '$1').replace(/[?&]$/, '')
}

function isKeylessCarto(url: string): boolean {
  return CARTO_HOST.test(templateHost(url)) && !/[?&]key=/.test(url)
}

export function isTrustedRasterTemplate(url: string | null | undefined): boolean {
  if (!url) return false
  const trimmed = url.trim()
  if (!trimmed) return false
  if (/[?&]key=/.test(trimmed)) return false
  if (/\s/.test(trimmed)) return false
  if (!/^https:\/\//i.test(trimmed)) return false
  if (/@|:\/\//.test(trimmed.slice('https://'.length)) && trimmed.includes('@')) return false
  const host = templateHost(trimmed)
  if (CARTO_HOST.test(host)) return TRUSTED_RASTER_HOSTS.has(host) || host === '{s}.basemaps.cartocdn.com'
  return TRUSTED_RASTER_HOSTS.has(host)
}

export function resolveTileUrl(
  template: string | null | undefined,
  fallback: string,
  cartoKey?: string | null,
): string {
  const chosen = withTileApiKey(normalizeTileUrl(template?.trim() || fallback), cartoKey)
  return isKeylessCarto(chosen) ? fallback : chosen
}

export type Basemap =
  | { kind: 'raster'; url: string }
  | { kind: 'vector'; style: string }

export function isVectorStyle(url: string | null | undefined): boolean {
  if (!url) return false
  const u = url.trim()
  if (!u) return false
  if (/\{[zxy]\}/i.test(u)) return false
  return /^https?:\/\//i.test(u) || u.startsWith('mapbox://')
}

export function resolveBasemap(
  template: string | null | undefined,
  fallback: string,
  cartoKey?: string | null,
): Basemap {
  const chosen = resolveTileUrl(template, fallback, cartoKey)
  if (isVectorStyle(chosen)) return { kind: 'vector', style: chosen }
  return { kind: 'raster', url: chosen }
}
