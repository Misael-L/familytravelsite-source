import { describe, expect, it } from 'vitest'
import type { FamilyPlaceCategory } from '../../data/supabase/familyPlaceCategories'
import type { FamilyTripPlace } from '../../data/supabase/tripPlaces'
import {
  pinToMarker,
  placeMatchesCategoryFilter,
  presentPlaceForCategories,
  UNCATEGORIZED_FILTER,
  withFamilyPlaceCategory,
} from './workspacePlaceCategoryModel'

const place: FamilyTripPlace = {
  id: 'p1',
  name: 'Cernobbio',
  lat: 45.84,
  lng: 9.08,
  notes: null,
  timeZone: null,
  countryId: null,
  placeTypeId: 'city',
  isPrimary: true,
  imageUrl: null,
  familyPlaceCategoryId: null,
  familyPlaceCategoryName: null,
  familyPlaceCategoryColor: null,
  familyPlaceCategoryIcon: null,
}

const food: FamilyPlaceCategory = {
  id: 'cat-1',
  familyId: 'fam-1',
  name: 'Food',
  colorHex: '#10b981',
  iconKey: 'Utensils',
  sortOrder: 0,
}

describe('workspacePlaceCategoryModel', () => {
  it('keeps uncategorized primary pins ink and does not use place_type_id', () => {
    const marker = pinToMarker(place)
    expect(marker?.category_color).toBe('#111827')
    expect(marker?.category_icon).toBeNull()
    expect(marker?.category_name).toBeNull()
  })

  it('paints categorized pins from the Family palette, including primary', () => {
    const categorized = withFamilyPlaceCategory(place, food)
    const marker = pinToMarker(categorized)
    expect(marker?.category_color).toBe('#10b981')
    expect(marker?.category_icon).toBe('Utensils')
    expect(marker?.category_name).toBe('Food')
    expect(categorized.placeTypeId).toBe('city')
  })

  it('filters uncategorized independently of catalog type', () => {
    const filters = new Set([UNCATEGORIZED_FILTER])
    expect(placeMatchesCategoryFilter(place, filters)).toBe(true)
    expect(placeMatchesCategoryFilter(withFamilyPlaceCategory(place, food), filters)).toBe(false)
    expect(placeMatchesCategoryFilter(withFamilyPlaceCategory(place, food), new Set(['cat-1']))).toBe(true)
  })

  it('suppresses category chrome without mutating stored assignment', () => {
    const categorized = withFamilyPlaceCategory(place, food)
    const presented = presentPlaceForCategories(categorized, false)
    expect(presented.familyPlaceCategoryId).toBe('cat-1')
    expect(presented.familyPlaceCategoryName).toBeNull()
    const marker = pinToMarker(categorized, { categoriesEnabled: false })
    expect(marker?.category_color).toBe('#111827')
    expect(marker?.category_icon).toBeNull()
    expect(categorized.familyPlaceCategoryId).toBe('cat-1')
  })
})
