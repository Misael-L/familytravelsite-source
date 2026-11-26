import { useCallback, useEffect, useState } from 'react'
import { listMemberFamilyPlaceCategories, type FamilyPlaceCategory } from '../../data/supabase/familyPlaceCategories'
import { updateTripPlaceCategory, type FamilyTripPlace } from '../../data/supabase/tripPlaces'
import { payloadTripPlaceUpdateCategory, targetTableForModule } from '../../data/supabase/tripChangeRequests'
import type { WorkspaceWriteMode } from './workspaceGovernanceModel'
import type { StageDraftOpInput } from './useFamilyTripWorkspaceGovernance'
import { withFamilyPlaceCategory } from './workspacePlaceCategoryModel'

export type UseFamilyWorkspacePlaceCategoriesResult = {
  palette: FamilyPlaceCategory[]
  pickerPlaceId: string | null
  openPicker: (placeId: string) => void
  closePicker: () => void
  assignCategory: (placeId: string, categoryId: string | null) => Promise<'direct' | 'draft' | 'denied' | 'error'>
}

export function useFamilyWorkspacePlaceCategories(opts: {
  familyId: string | null
  tripId: string | null
  placesMode: WorkspaceWriteMode
  canUsePlaces: boolean
  nextSortOrder: number
  enabled?: boolean
  addDraftOp: (input: StageDraftOpInput) => Promise<boolean>
  onPlacesPatched: (placeId: string, patch: (place: FamilyTripPlace) => FamilyTripPlace) => void
  onDenied: () => void
}): UseFamilyWorkspacePlaceCategoriesResult {
  const {
    familyId, tripId, placesMode, canUsePlaces, nextSortOrder,
    enabled = true,
    addDraftOp, onPlacesPatched, onDenied,
  } = opts
  const [palette, setPalette] = useState<FamilyPlaceCategory[]>([])
  const [pickerPlaceId, setPickerPlaceId] = useState<string | null>(null)

  useEffect(() => {
    if (!familyId || !enabled) {
      setPalette([])
      if (!enabled) setPickerPlaceId(null)
      return
    }
    let cancelled = false
    listMemberFamilyPlaceCategories(familyId)
      .then(rows => { if (!cancelled) setPalette(rows) })
      .catch(() => { if (!cancelled) setPalette([]) })
    return () => { cancelled = true }
  }, [familyId, enabled])

  const openPicker = useCallback((placeId: string) => {
    if (!enabled) return
    if (!canUsePlaces) {
      onDenied()
      return
    }
    setPickerPlaceId(placeId)
  }, [enabled, canUsePlaces, onDenied])

  const closePicker = useCallback(() => setPickerPlaceId(null), [])

  const assignCategory = useCallback(async (
    placeId: string,
    categoryId: string | null,
  ): Promise<'direct' | 'draft' | 'denied' | 'error'> => {
    if (!enabled || !tripId || !canUsePlaces) {
      onDenied()
      return 'denied'
    }
    const category = categoryId ? (palette.find(c => c.id === categoryId) ?? null) : null
    try {
      if (placesMode === 'draft') {
        const ok = await addDraftOp({
          module: 'trip_place',
          op: 'update',
          payload: payloadTripPlaceUpdateCategory(placeId, categoryId),
          targetTable: targetTableForModule('trip_place'),
          targetId: placeId,
          sortOrder: nextSortOrder,
        })
        if (!ok) return 'error'
        setPickerPlaceId(null)
        return 'draft'
      }
      await updateTripPlaceCategory(tripId, placeId, categoryId)
      onPlacesPatched(placeId, place => withFamilyPlaceCategory(place, category))
      setPickerPlaceId(null)
      return 'direct'
    } catch {
      return 'error'
    }
  }, [
    enabled, tripId, canUsePlaces, placesMode, palette, addDraftOp, nextSortOrder,
    onPlacesPatched, onDenied,
  ])

  return { palette, pickerPlaceId, openPicker, closePicker, assignCategory }
}
