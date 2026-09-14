import { create } from 'zustand'
import {
  compiledFeatureMap,
  getMyEffectiveFeatures,
  type FamilyFeatureKey,
} from '../data/supabase/familyFeatures'
import { isSupabaseDataPlane } from '../data/supabase/auth'
import { FEATURE_HYDRATE_TIMEOUT_MS, withTimeout } from '../startup/timeout'
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
let hydrateGeneration = 0

export const useFamilyFeatureStore = create<FamilyFeatureState>((set, get) => ({
  familyId: null,
  features: initialFeatures,
  hydrated: false,
  error: null,

  hydrate: async (familyId: string) => {
    const gen = ++hydrateGeneration
    const switching = get().familyId !== familyId
    if (switching) {
      set({ familyId, hydrated: false, error: null, features: compiledFeatureMap() })
    } else {
      set({ familyId, error: null })
    }
    try {
      const features = await withTimeout(
        getMyEffectiveFeatures(familyId),
        FEATURE_HYDRATE_TIMEOUT_MS,
        'Could not load family features',
      )
      if (gen !== hydrateGeneration) return
      set({ features, hydrated: true, error: null, familyId })
    } catch (err) {
      if (gen !== hydrateGeneration) return
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
    hydrateGeneration += 1
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
