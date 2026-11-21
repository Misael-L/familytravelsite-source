/** Family Catalog identity encoded in Explore pin `osm_id` (`catalog:{kind}:{uuid}`). */

export type CatalogPoiKind = 'food' | 'hotel' | 'experience'

export type CatalogPoiRef = {
  kind: CatalogPoiKind
  id: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Parse iOS WorkspaceCatalogPoiRef shape from a POI osm_id. */
export function parseCatalogPoiRef(osmId: string | null | undefined): CatalogPoiRef | null {
  if (!osmId) return null
  const parts = osmId.split(':')
  if (parts.length !== 3 || parts[0] !== 'catalog') return null
  const kind = parts[1]
  const id = parts[2]
  if (kind !== 'food' && kind !== 'hotel' && kind !== 'experience') return null
  if (!UUID_RE.test(id)) return null
  return { kind, id }
}
