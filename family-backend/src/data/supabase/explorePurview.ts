import type { ExploreCatalogKind } from './catalogExploreLists'

/**
 * Place whose id is on the trip; exp/food/hotel whose parent place is on the trip.
 * Null parent = no destination expansion → in-purview enrichment.
 */
export function isCatalogInPurview(
  placeId: string | null | undefined,
  tripPlaceIds: ReadonlySet<string>,
): boolean {
  if (!placeId) return true
  return tripPlaceIds.has(placeId)
}

/** Destination id used for purview: the place itself, or the parent of exp/food/hotel. */
export function purviewPlaceIdFor(
  kind: ExploreCatalogKind,
  entityId: string,
  parentPlaceId: string | null,
): string | null {
  if (kind === 'place') return entityId
  return parentPlaceId
}
