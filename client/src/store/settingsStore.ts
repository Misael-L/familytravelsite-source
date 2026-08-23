import { create } from 'zustand'
import { settingsApi } from '../api/client'
import type { Settings } from '../types'
import { DEFAULT_APPEARANCE } from '@trek/shared'
import { getApiErrorMessage } from '../types'
import { SUPPORTED_LANGUAGE_CODES } from '../i18n/supportedLanguages'
import { getDataPlane, getMapboxAccessToken } from '../data/supabase/env'
import { useAuthStore } from './authStore'
import {
  getMyEffectivePreferences,
  isPortableSettingKey,
  memberCurrencyPatch,
  storeCurrencyFromEffective,
  updateMyFamilyPreferences,
  type EffectivePreferences,
  type PreferenceFields,
  type PreferencePatch,
  type PreferenceSource,
  type PortableSettingKey,
} from '../data/supabase/familyPreferences'

interface SettingsState {
  settings: Settings
  isLoaded: boolean
  preferenceSources: Record<PortableSettingKey, PreferenceSource>
  preferenceFamily: PreferenceFields
  preferenceOverrides: PreferenceFields
  preferenceError: string | null

  loadSettings: () => Promise<void>
  /** Seed Mapbox-default settings for supabase plane (no Nest). */
  hydrateSupabasePlaneSettings: () => void
  hydrateFamilyPreferences: (familyId: string) => Promise<void>
  updateSetting: (key: keyof Settings, value: Settings[keyof Settings]) => Promise<void>
  resetFamilyPreference: (key: PortableSettingKey) => Promise<void>
  setLanguageLocal: (lang: string) => void
  setLanguageTransient: (lang: string) => void
  updateSettings: (settingsObj: Partial<Settings>) => Promise<void>
}

// Returns true when the user has explicitly chosen a language (persisted in localStorage).
// Use this instead of reading localStorage directly so the key stays encapsulated here.
export const hasStoredLanguage = (): boolean =>
  typeof localStorage !== 'undefined' && !!localStorage.getItem('app_language')

const LOCAL_MAP_PROVIDER_KEY = 'fta_map_provider'
const LOCAL_MAPBOX_TOKEN_KEY = 'fta_mapbox_access_token'

function readLocalMapProvider(): Settings['map_provider'] | null {
  const raw = localStorage.getItem(LOCAL_MAP_PROVIDER_KEY)
  if (raw === 'leaflet' || raw === 'mapbox-gl' || raw === 'maplibre-gl') return raw
  return null
}

// The effective client-side defaults for a fresh instance. The server sends no value for
// a setting an admin hasn't defaulted (see settingsService.getAdminUserDefaults), so these
// are what a brand-new user actually sees. Keep them internally consistent — one
// measurement system, not °F alongside kilometres — and note that DisplaySettingsTab
// imports these same values for its fallbacks, so the store default and the UI fallback
// can't drift apart again.
export const DEFAULT_SETTINGS: Settings = {
  map_tile_url: '',
  dark_mode: false,
  // Empty = no personal display currency, so Costs falls back to the trip's own.
  default_currency: '',
  language: localStorage.getItem('app_language') || 'en',
  temperature_unit: 'celsius',
  distance_unit: 'metric',
  time_format: '24h',
  show_place_description: false,
  optimize_from_accommodation: true,
  map_provider: 'leaflet',
  map_poi_pill_enabled: true,
  mapbox_access_token: '',
  mapbox_style: 'mapbox://styles/mapbox/standard',
  maplibre_style: '',
  mapbox_3d_enabled: true,
  mapbox_quality_mode: false,
  dashboard_fx_from: 'EUR',
  dashboard_fx_to: 'USD',
  appearance: DEFAULT_APPEARANCE,
  // dashboard_timezones is intentionally left unset so the widget can tell "never
  // chosen" (fall back to home + defaults) from an explicitly emptied list.
}

export const EMPTY_PREFERENCE_FIELDS: PreferenceFields = {
  temperatureUnit: null,
  distanceUnit: null,
  timeFormat: null,
  displayCurrency: null,
}

export const DEFAULT_PREFERENCE_SOURCES: Record<PortableSettingKey, PreferenceSource> = {
  temperature_unit: 'builtin',
  distance_unit: 'builtin',
  time_format: 'builtin',
  default_currency: 'builtin',
}

function settingsFromEffective(settings: Settings, effective: PreferenceFields): Settings {
  return {
    ...settings,
    temperature_unit: effective.temperatureUnit || DEFAULT_SETTINGS.temperature_unit,
    distance_unit: effective.distanceUnit || DEFAULT_SETTINGS.distance_unit,
    time_format: effective.timeFormat || DEFAULT_SETTINGS.time_format,
    default_currency: storeCurrencyFromEffective(effective.displayCurrency),
  }
}

function metaFromEffective(result: EffectivePreferences) {
  return {
    preferenceSources: {
      temperature_unit: result.sources.temperatureUnit,
      distance_unit: result.sources.distanceUnit,
      time_format: result.sources.timeFormat,
      default_currency: result.sources.displayCurrency,
    } as Record<PortableSettingKey, PreferenceSource>,
    preferenceFamily: result.family,
    preferenceOverrides: result.overrides,
    preferenceError: null as string | null,
  }
}

function patchFromPortableKey(key: PortableSettingKey, value: Settings[keyof Settings] | null): PreferencePatch {
  if (key === 'temperature_unit') {
    return { temperatureUnit: value == null ? null : (String(value) as PreferencePatch['temperatureUnit']) }
  }
  if (key === 'distance_unit') {
    return { distanceUnit: value == null ? null : (String(value) as PreferencePatch['distanceUnit']) }
  }
  if (key === 'time_format') {
    return { timeFormat: value == null ? null : (String(value) as PreferencePatch['timeFormat']) }
  }
  return { displayCurrency: value == null ? null : memberCurrencyPatch(String(value)) }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  isLoaded: false,
  preferenceSources: { ...DEFAULT_PREFERENCE_SOURCES },
  preferenceFamily: { ...EMPTY_PREFERENCE_FIELDS },
  preferenceOverrides: { ...EMPTY_PREFERENCE_FIELDS },
  preferenceError: null,

  loadSettings: async () => {
    try {
      const data = await settingsApi.get()
      set((state) => ({
        settings: { ...state.settings, ...data.settings },
        isLoaded: true,
      }))
    } catch (err: unknown) {
      set({ isLoaded: true })
      console.error('Failed to load settings:', err)
    }
  },

  hydrateSupabasePlaneSettings: () => {
    const storedProvider = readLocalMapProvider()
    const envToken = getMapboxAccessToken() ?? ''
    const storedToken = localStorage.getItem(LOCAL_MAPBOX_TOKEN_KEY) || ''
    const token = storedToken || envToken
    const provider = storedProvider ?? (token ? 'mapbox-gl' : 'leaflet')
    set((state) => ({
      settings: {
        ...state.settings,
        map_provider: provider,
        mapbox_access_token: token || state.settings.mapbox_access_token,
      },
      isLoaded: true,
    }))
  },

  hydrateFamilyPreferences: async (familyId: string) => {
    try {
      const result = await getMyEffectivePreferences(familyId)
      set((state) => ({
        settings: settingsFromEffective(state.settings, result.effective),
        ...metaFromEffective(result),
      }))
    } catch (err: unknown) {
      set({
        preferenceError: err instanceof Error ? err.message : 'Failed to load family preferences',
      })
    }
  },

  updateSetting: async (key: keyof Settings, value: Settings[keyof Settings]) => {
    const previous = get().settings[key]
    const previousMeta = {
      preferenceSources: get().preferenceSources,
      preferenceFamily: get().preferenceFamily,
      preferenceOverrides: get().preferenceOverrides,
    }
    set((state) => ({
      settings: { ...state.settings, [key]: value },
    }))
    if (key === 'language') localStorage.setItem('app_language', value as string)
    if (getDataPlane() === 'supabase') {
      if (key === 'map_provider') localStorage.setItem(LOCAL_MAP_PROVIDER_KEY, String(value))
      if (key === 'mapbox_access_token') localStorage.setItem(LOCAL_MAPBOX_TOKEN_KEY, String(value ?? ''))
      if (isPortableSettingKey(key)) {
        const familyId = useAuthStore.getState().familyId
        if (!familyId) {
          set((state) => ({ settings: { ...state.settings, [key]: previous } }))
          throw new Error('Family membership is required to save this setting')
        }
        try {
          const result = await updateMyFamilyPreferences(familyId, patchFromPortableKey(key, value))
          set((state) => ({
            settings: settingsFromEffective(state.settings, result.effective),
            ...metaFromEffective(result),
          }))
        } catch (err: unknown) {
          set((state) => ({
            settings: { ...state.settings, [key]: previous },
            ...previousMeta,
          }))
          throw new Error(getApiErrorMessage(err, 'Error saving setting'))
        }
      }
      return
    }
    try {
      await settingsApi.set(key, value)
    } catch (err: unknown) {
      console.error('Failed to save setting:', err)
      throw new Error(getApiErrorMessage(err, 'Error saving setting'))
    }
  },

  resetFamilyPreference: async (key: PortableSettingKey) => {
    const previous = get().settings[key]
    const previousMeta = {
      preferenceSources: get().preferenceSources,
      preferenceFamily: get().preferenceFamily,
      preferenceOverrides: get().preferenceOverrides,
    }
    const familyId = useAuthStore.getState().familyId
    if (!familyId) throw new Error('Family membership is required to save this setting')
    try {
      const result = await updateMyFamilyPreferences(familyId, patchFromPortableKey(key, null))
      set((state) => ({
        settings: settingsFromEffective(state.settings, result.effective),
        ...metaFromEffective(result),
      }))
    } catch (err: unknown) {
      set((state) => ({
        settings: { ...state.settings, [key]: previous },
        ...previousMeta,
      }))
      throw new Error(getApiErrorMessage(err, 'Error saving setting'))
    }
  },

  setLanguageLocal: (lang: string) => {
    localStorage.setItem('app_language', lang)
    set((state) => ({ settings: { ...state.settings, language: lang } }))
  },

  // Applies a language for the current session without persisting to localStorage.
  // Used for automatic detection (browser/server default) — only explicit user
  // choices via the UI should be persisted.
  setLanguageTransient: (lang: string) => {
    if (!SUPPORTED_LANGUAGE_CODES.includes(lang)) return
    set((state) => ({ settings: { ...state.settings, language: lang } }))
  },

  updateSettings: async (settingsObj: Partial<Settings>) => {
    const previous = get().settings
    const previousMeta = {
      preferenceSources: get().preferenceSources,
      preferenceFamily: get().preferenceFamily,
      preferenceOverrides: get().preferenceOverrides,
    }
    set((state) => ({
      settings: { ...state.settings, ...settingsObj },
    }))
    if (getDataPlane() === 'supabase') {
      if (settingsObj.map_provider) localStorage.setItem(LOCAL_MAP_PROVIDER_KEY, settingsObj.map_provider)
      if (settingsObj.mapbox_access_token != null) {
        localStorage.setItem(LOCAL_MAPBOX_TOKEN_KEY, String(settingsObj.mapbox_access_token))
      }
      const portablePatch: PreferencePatch = {}
      if (settingsObj.temperature_unit !== undefined) {
        portablePatch.temperatureUnit = String(settingsObj.temperature_unit) as PreferencePatch['temperatureUnit']
      }
      if (settingsObj.distance_unit !== undefined) {
        portablePatch.distanceUnit = String(settingsObj.distance_unit) as PreferencePatch['distanceUnit']
      }
      if (settingsObj.time_format !== undefined) {
        portablePatch.timeFormat = String(settingsObj.time_format) as PreferencePatch['timeFormat']
      }
      if (settingsObj.default_currency !== undefined) {
        portablePatch.displayCurrency = memberCurrencyPatch(String(settingsObj.default_currency ?? ''))
      }
      if (Object.keys(portablePatch).length > 0) {
        const familyId = useAuthStore.getState().familyId
        if (!familyId) {
          set({ settings: previous, ...previousMeta })
          throw new Error('Family membership is required to save this setting')
        }
        try {
          const result = await updateMyFamilyPreferences(familyId, portablePatch)
          set((state) => ({
            settings: settingsFromEffective(state.settings, result.effective),
            ...metaFromEffective(result),
          }))
        } catch (err: unknown) {
          set({ settings: previous, ...previousMeta })
          throw new Error(getApiErrorMessage(err, 'Error saving settings'))
        }
      }
      return
    }
    try {
      await settingsApi.setBulk(settingsObj)
    } catch (err: unknown) {
      console.error('Failed to save settings:', err)
      throw new Error(getApiErrorMessage(err, 'Error saving settings'))
    }
  },
}))
