/**
 * Copy named-list catalog places onto a trip via W8.5 upserts.
 * Not Nest collectionsApi.copyToTrip. Not hearts. Not schedule/hotel stays.
 */
import { addCatalogPlaceToTrip } from './exploreAddToTrip'

export type FamilyCopyListItem = {
  id: string | number
  name: string
  catalog_kind?: string | null
  catalog_entity_id?: string | null
}

export type FamilyCopyToTripResult = {
  copied: number
  skipped: { id: string; name: string }[]
}

export function isFamilyCopyPlaceItem(item: FamilyCopyListItem): item is FamilyCopyListItem & { catalog_entity_id: string } {
  const id = item.catalog_entity_id?.trim()
  return item.catalog_kind === 'place' && Boolean(id)
}

export async function copyFamilyListPlacesToTrip(opts: {
  tripId: string
  items: FamilyCopyListItem[]
  canMutate: boolean
  tripPlaceIds: ReadonlySet<string>
}): Promise<FamilyCopyToTripResult> {
  if (!opts.canMutate) {
    const err = new Error('hofOnly')
    ;(err as { code?: string }).code = 'hofOnly'
    throw err
  }

  const skipped: { id: string; name: string }[] = []
  let copied = 0
  const tripPlaceIds = new Set(opts.tripPlaceIds)
  const seen = new Set<string>()

  for (const item of opts.items) {
    const entityId = item.catalog_entity_id?.trim() ?? ''
    if (!isFamilyCopyPlaceItem(item) || !entityId) {
      skipped.push({ id: String(item.id), name: item.name })
      continue
    }
    if (seen.has(entityId)) {
      skipped.push({ id: String(item.id), name: item.name })
      continue
    }
    seen.add(entityId)

    const result = await addCatalogPlaceToTrip({
      tripId: opts.tripId,
      placeId: entityId,
      tripPlaceIds,
      canMutate: true,
      confirmedOutOfPurview: true,
    })
    if (result.ok && result.outcome === 'added') {
      copied += 1
      tripPlaceIds.add(entityId)
      continue
    }
    if (result.ok && result.outcome === 'already') {
      skipped.push({ id: String(item.id), name: item.name })
      continue
    }
    if ('reason' in result) {
      throw new Error(result.message ?? 'Could not copy to trip')
    }
    throw new Error('Could not copy to trip')
  }

  return { copied, skipped }
}
