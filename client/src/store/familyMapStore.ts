import { create } from 'zustand'
import {
  builtinEffectiveMapSettings,
  classifyFamilyMapError,
  getMyEffectiveMapSettings,
  updateMyMapPreference,
  type EffectiveMapSettings,
  type FamilyMapErrorKind,
  type FamilyMapOptionId,
} from '../data/supabase/familyMaps'
import {
  clearFamilyMapSnapshot,
  readFamilyMapSnapshot,
  writeFamilyMapSnapshot,
} from '../data/supabase/familyMapSnapshot'
import { legacyProviderToOptionId, optionIsUsable } from '../components/Map/mapRegistry'
import { FEATURE_HYDRATE_TIMEOUT_MS, withTimeout } from '../startup/timeout'
import { readLocal, removeLocal } from '../startup/safeStorage'
import { clearTileCache } from '../sync/tilePrefetcher'
import { useAuthStore } from './authStore'
import { isPublicMapIsolatedPath } from '../utils/publicMapRoutes'

const LOCAL_MAP_PROVIDER_KEY = 'fta_map_provider'
const LOCAL_MAPBOX_TOKEN_KEY = 'fta_mapbox_access_token'
const LAST_REVISION_PREFIX = 'fta_map_cred_rev:'

type FamilyMapState = {
  familyId: string | null
  personId: string | null
  settings: EffectiveMapSettings | null
  hydrated: boolean
  error: string | null
  errorKind: FamilyMapErrorKind | null
  saving: boolean
  hydrate: (familyId: string) => Promise<void>
  selectOption: (optionId: FamilyMapOptionId | null) => Promise<void>
  applyAdminResult: (next: EffectiveMapSettings) => void
  reset: () => void
}

let hydrateGeneration = 0
const migratedFamilies = new Set<string>()

function lastRevisionKey(familyId: string): string {
  return `${LAST_REVISION_PREFIX}${familyId}`
}

function rememberRevision(familyId: string, revision: number): void {
  const previousRaw = readLocal(lastRevisionKey(familyId))
  const previous = previousRaw ? Number(previousRaw) : 0
  if (revision > previous && previous > 0) {
    void clearTileCache()
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(lastRevisionKey(familyId), String(revision))
    }
  } catch {
    /* private mode */
  }
}

function applySettings(familyId: string, personId: string | null, settings: EffectiveMapSettings) {
  writeFamilyMapSnapshot(settings)
  rememberRevision(familyId, settings.credentialRevision)
  return {
    familyId,
    personId,
    settings,
    hydrated: true,
    error: null,
    errorKind: null,
  }
}

async function maybeMigrateLegacyProvider(familyId: string, settings: EffectiveMapSettings): Promise<EffectiveMapSettings> {
  if (isPublicMapIsolatedPath(typeof window !== 'undefined' ? window.location.pathname : '')) {
    return settings
  }
  if (migratedFamilies.has(familyId)) return settings
  if (settings.selectedOptionId) {
    migratedFamilies.add(familyId)
    removeLocal(LOCAL_MAPBOX_TOKEN_KEY)
    return settings
  }
  const mapped = legacyProviderToOptionId(readLocal(LOCAL_MAP_PROVIDER_KEY))
  if (
    !mapped
    || !settings.enabledOptionIds.includes(mapped)
    || !optionIsUsable(mapped, { mapbox: settings.mapboxPublicToken, carto: settings.cartoApiKey })
  ) {
    migratedFamilies.add(familyId)
    removeLocal(LOCAL_MAPBOX_TOKEN_KEY)
    return settings
  }
  try {
    const next = await updateMyMapPreference(familyId, mapped)
    removeLocal(LOCAL_MAP_PROVIDER_KEY)
    removeLocal(LOCAL_MAPBOX_TOKEN_KEY)
    migratedFamilies.add(familyId)
    return next
  } catch {
    return settings
  }
}

export function resetFamilyMapStoreForTests(): void {
  migratedFamilies.clear()
  useFamilyMapStore.getState().reset()
}

export const useFamilyMapStore = create<FamilyMapState>((set, get) => ({
  familyId: null,
  personId: null,
  settings: null,
  hydrated: false,
  error: null,
  errorKind: null,
  saving: false,

  hydrate: async (familyId: string) => {
    if (isPublicMapIsolatedPath(typeof window !== 'undefined' ? window.location.pathname : '')) {
      return
    }
    const gen = ++hydrateGeneration
    const personId = useAuthStore.getState().personId ?? null
    const switching = get().familyId !== familyId || get().personId !== personId
    const snapshot = readFamilyMapSnapshot(familyId, personId)
    if (switching) {
      set({
        familyId,
        personId,
        hydrated: false,
        error: null,
        errorKind: null,
        settings: snapshot,
      })
    } else {
      set({ familyId, personId, error: null, errorKind: null, settings: get().settings ?? snapshot })
    }
    try {
      let result = await withTimeout(
        getMyEffectiveMapSettings(familyId),
        FEATURE_HYDRATE_TIMEOUT_MS,
        'Could not load family maps',
      )
      if (gen !== hydrateGeneration) return
      if (useAuthStore.getState().familyId !== familyId) return
      result = await maybeMigrateLegacyProvider(familyId, result)
      if (gen !== hydrateGeneration) return
      if (useAuthStore.getState().familyId !== familyId) return
      set(applySettings(familyId, result.personId ?? personId, result))
    } catch (err) {
      if (gen !== hydrateGeneration) return
      if (useAuthStore.getState().familyId !== familyId) return
      const fallback = snapshot ?? builtinEffectiveMapSettings(familyId, personId)
      set({
        familyId,
        personId,
        settings: fallback,
        hydrated: true,
        errorKind: classifyFamilyMapError(err),
        error: err instanceof Error ? err.message : 'Could not load family maps',
      })
    }
  },

  selectOption: async (optionId: FamilyMapOptionId | null) => {
    const familyId = get().familyId
    if (!familyId) throw new Error('Family membership is required to save this setting')
    const previous = get().settings
    set({ saving: true, error: null, errorKind: null })
    try {
      const next = await updateMyMapPreference(familyId, optionId)
      if (get().familyId !== familyId) return
      set({
        ...applySettings(familyId, next.personId ?? get().personId, next),
        saving: false,
      })
    } catch (err) {
      set({
        settings: previous,
        saving: false,
        errorKind: 'save',
        error: err instanceof Error ? err.message : 'Could not save map preference',
      })
      throw err
    }
  },

  applyAdminResult: (next: EffectiveMapSettings) => {
    const familyId = get().familyId
    if (!familyId || next.familyId !== familyId) return
    set(applySettings(familyId, next.personId ?? get().personId, next))
  },

  reset: () => {
    hydrateGeneration += 1
    const familyId = get().familyId
    const personId = get().personId
    if (familyId) clearFamilyMapSnapshot(familyId, personId)
    set({
      familyId: null,
      personId: null,
      settings: null,
      hydrated: false,
      error: null,
      errorKind: null,
      saving: false,
    })
  },
}))
