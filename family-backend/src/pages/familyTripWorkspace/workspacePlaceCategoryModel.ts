import type { FamilyPlaceCategory } from '../../data/supabase/familyPlaceCategories'
import type { FamilyTripPlace } from '../../data/supabase/tripPlaces'
import type { MapMarkerPlace } from '../../components/Map/mapMarkerPlace'

export const UNCATEGORIZED_FILTER = 'uncategorized'

export function withFamilyPlaceCategory(
  place: FamilyTripPlace,
  category: FamilyPlaceCategory | null,
): FamilyTripPlace {
  return {
    ...place,
    familyPlaceCategoryId: category?.id ?? null,
    familyPlaceCategoryName: category?.name ?? null,
    familyPlaceCategoryColor: category?.colorHex ?? null,
    familyPlaceCategoryIcon: category?.iconKey ?? null,
  }
}

/** Presentation-only: keep stored `family_place_category_id` on the source row. */
export function presentPlaceForCategories(
  place: FamilyTripPlace,
  categoriesEnabled: boolean,
): FamilyTripPlace {
  if (categoriesEnabled) return place
  return {
    ...place,
    familyPlaceCategoryName: null,
    familyPlaceCategoryColor: null,
    familyPlaceCategoryIcon: null,
  }
}

/** TREK map pin: palette when set; uncategorized primary stays ink; others use map default. */
export function pinToMarker(
  place: FamilyTripPlace,
  opts: { categoriesEnabled?: boolean } = {},
): MapMarkerPlace | null {
  if (place.lat == null || place.lng == null) return null
  const categoriesEnabled = opts.categoriesEnabled !== false
  const categorized = categoriesEnabled && Boolean(place.familyPlaceCategoryId && place.familyPlaceCategoryColor)
  return {
    id: place.id,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    image_url: place.imageUrl,
    google_place_id: null,
    osm_id: null,
    category_color: categorized
      ? place.familyPlaceCategoryColor
      : (place.isPrimary ? '#111827' : null),
    category_icon: categorized ? place.familyPlaceCategoryIcon : null,
    category_name: categorized ? place.familyPlaceCategoryName : null,
  }
}

export function placeMatchesCategoryFilter(
  place: FamilyTripPlace,
  filters: Set<string>,
): boolean {
  if (filters.size === 0) return true
  if (place.familyPlaceCategoryId == null) return filters.has(UNCATEGORIZED_FILTER)
  return filters.has(place.familyPlaceCategoryId)
}
