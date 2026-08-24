import { create } from 'zustand'
import {
  compiledFeatureMap,
  getMyEffectiveFeatures,
  type FamilyFeatureKey,
} from '../data/supabase/familyFeatures'
import { isSupabaseDataPlane } from '../data/supabase/auth'
import { useAddonStore } from './addonStore'

type FamilyFeatureState = {
  familyId: string | null
  features: Record<FamilyFeatureKey, boolean>
  hydrated: boolean
  error: string | null
  hydrate: (familyId: string) => Promise<void>
  refresh: () => Promise<void>
  reset: () => void
  isEnabled: (key: FamilyFeatureKey) => boolean
}

const initialFeatures = compiledFeatureMap()

export const useFamilyFeatureStore = create<FamilyFeatureState>((set, get) => ({
  familyId: null,
  features: initialFeatures,
  hydrated: false,
  error: null,

  hydrate: async (familyId: string) => {
    set({ familyId })
    try {
      const features = await getMyEffectiveFeatures(familyId)
      set({ features, hydrated: true, error: null, familyId })
    } catch (err) {
      set({
        features: compiledFeatureMap(),
        hydrated: true,
        error: err instanceof Error ? err.message : 'Could not load family features',
        familyId,
      })
    }
  },

  refresh: async () => {
    const familyId = get().familyId
    if (!familyId) return
    await get().hydrate(familyId)
  },

  reset: () => {
    set({
      familyId: null,
      features: compiledFeatureMap(),
      hydrated: false,
      error: null,
    })
  },

  isEnabled: (key: FamilyFeatureKey) => get().features[key] !== false,
}))

export function useCollectionsEnabled(): boolean {
  const supabasePlane = isSupabaseDataPlane()
  const addonOn = useAddonStore(s => s.isEnabled('collections'))
  const featureOn = useFamilyFeatureStore(s => s.isEnabled('collections'))
  return supabasePlane ? featureOn : addonOn
}
