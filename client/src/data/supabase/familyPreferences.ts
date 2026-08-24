/**
 * Family portable display preferences (Phase 1E).
 * Postgres RPCs are SoR. Do not call Nest settingsApi / adminApi.
 * Appearance, language, timezone, accent, and map tokens stay on their current stores.
 */

import { getSupabaseBrowserClient } from './client'

export type TemperatureUnit = 'celsius' | 'fahrenheit'
export type DistanceUnitPref = 'metric' | 'imperial'
export type TimeFormatPref = '24h' | '12h'
export type PreferenceSource = 'member' | 'family' | 'builtin'

export type PreferenceFields = {
  temperatureUnit: TemperatureUnit | null
  distanceUnit: DistanceUnitPref | null
  timeFormat: TimeFormatPref | null
  displayCurrency: string | null
}

export type PreferencePatch = {
  temperatureUnit?: TemperatureUnit | null
  distanceUnit?: DistanceUnitPref | null
  timeFormat?: TimeFormatPref | null
  displayCurrency?: string | null
}

export type FamilyPreferenceDefaults = {
  familyId: string
  canManage: boolean
  defaults: PreferenceFields
}

export type EffectivePreferences = {
  familyId: string
  personId: string | null
  family: PreferenceFields
  overrides: PreferenceFields
  effective: PreferenceFields
  sources: {
    temperatureUnit: PreferenceSource
    distanceUnit: PreferenceSource
    timeFormat: PreferenceSource
    displayCurrency: PreferenceSource
  }
}

type RpcFields = {
  temperature_unit?: string | null
  distance_unit?: string | null
  time_format?: string | null
  display_currency?: string | null
}

type RpcSources = {
  temperature_unit?: string | null
  distance_unit?: string | null
  time_format?: string | null
  display_currency?: string | null
}

function asSource(value: string | null | undefined): PreferenceSource {
  if (value === 'member' || value === 'family' || value === 'builtin') return value
  return 'builtin'
}

function asTemp(value: string | null | undefined): TemperatureUnit | null {
  return value === 'celsius' || value === 'fahrenheit' ? value : null
}

function asDistance(value: string | null | undefined): DistanceUnitPref | null {
  return value === 'metric' || value === 'imperial' ? value : null
}

function asTime(value: string | null | undefined): TimeFormatPref | null {
  return value === '24h' || value === '12h' ? value : null
}

export function mapPreferenceFields(row: RpcFields | null | undefined): PreferenceFields {
  return {
    temperatureUnit: asTemp(row?.temperature_unit),
    distanceUnit: asDistance(row?.distance_unit),
    timeFormat: asTime(row?.time_format),
    displayCurrency: row?.display_currency ? String(row.display_currency) : null,
  }
}

export const PORTABLE_SETTING_KEYS = [
  'temperature_unit',
  'distance_unit',
  'time_format',
  'default_currency',
] as const

export type PortableSettingKey = (typeof PORTABLE_SETTING_KEYS)[number]

export function isPortableSettingKey(key: string): key is PortableSettingKey {
  return (PORTABLE_SETTING_KEYS as readonly string[]).includes(key)
}

export function storeCurrencyFromEffective(displayCurrency: string | null): string {
  return displayCurrency && displayCurrency !== 'trip' ? displayCurrency : ''
}

export function memberCurrencyPatch(value: string | null): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === 'trip') return 'trip'
  return trimmed.toUpperCase()
}

export function preferencePatchToRpc(patch: PreferencePatch): RpcFields {
  const rpc: RpcFields = {}
  if ('temperatureUnit' in patch) rpc.temperature_unit = patch.temperatureUnit ?? null
  if ('distanceUnit' in patch) rpc.distance_unit = patch.distanceUnit ?? null
  if ('timeFormat' in patch) rpc.time_format = patch.timeFormat ?? null
  if ('displayCurrency' in patch) rpc.display_currency = patch.displayCurrency ?? null
  return rpc
}

export async function getFamilyPreferenceDefaults(familyId: string): Promise<FamilyPreferenceDefaults> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('get_family_preference_defaults', { p_family_id: familyId })
  if (error) throw error
  const row = data as {
    family_id?: string
    can_manage?: boolean
    defaults?: RpcFields
  } | null
  if (!row) throw new Error('family preference defaults missing')
  return {
    familyId: row.family_id ?? familyId,
    canManage: !!row.can_manage,
    defaults: mapPreferenceFields(row.defaults),
  }
}

export async function updateFamilyPreferenceDefaults(
  familyId: string,
  patch: PreferencePatch,
): Promise<FamilyPreferenceDefaults> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('update_family_preference_defaults', {
      p_family_id: familyId,
      p_patch: preferencePatchToRpc(patch),
    })
  if (error) throw error
  const row = data as {
    family_id?: string
    can_manage?: boolean
    defaults?: RpcFields
  } | null
  if (!row) throw new Error('family preference defaults save failed')
  return {
    familyId: row.family_id ?? familyId,
    canManage: !!row.can_manage,
    defaults: mapPreferenceFields(row.defaults),
  }
}

export async function getMyEffectivePreferences(familyId: string): Promise<EffectivePreferences> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('get_my_effective_preferences', { p_family_id: familyId })
  if (error) throw error
  const row = data as {
    family_id?: string
    person_id?: string | null
    family?: RpcFields
    overrides?: RpcFields
    effective?: RpcFields
    sources?: RpcSources
  } | null
  if (!row) throw new Error('effective preferences missing')
  return {
    familyId: row.family_id ?? familyId,
    personId: row.person_id ?? null,
    family: mapPreferenceFields(row.family),
    overrides: mapPreferenceFields(row.overrides),
    effective: mapPreferenceFields(row.effective),
    sources: {
      temperatureUnit: asSource(row.sources?.temperature_unit),
      distanceUnit: asSource(row.sources?.distance_unit),
      timeFormat: asSource(row.sources?.time_format),
      displayCurrency: asSource(row.sources?.display_currency),
    },
  }
}

export async function updateMyFamilyPreferences(
  familyId: string,
  patch: PreferencePatch,
): Promise<EffectivePreferences> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('update_my_family_preferences', {
      p_family_id: familyId,
      p_patch: preferencePatchToRpc(patch),
    })
  if (error) throw error
  const row = data as {
    family_id?: string
    person_id?: string | null
    family?: RpcFields
    overrides?: RpcFields
    effective?: RpcFields
    sources?: RpcSources
  } | null
  if (!row) throw new Error('family preference save failed')
  return {
    familyId: row.family_id ?? familyId,
    personId: row.person_id ?? null,
    family: mapPreferenceFields(row.family),
    overrides: mapPreferenceFields(row.overrides),
    effective: mapPreferenceFields(row.effective),
    sources: {
      temperatureUnit: asSource(row.sources?.temperature_unit),
      distanceUnit: asSource(row.sources?.distance_unit),
      timeFormat: asSource(row.sources?.time_format),
      displayCurrency: asSource(row.sources?.display_currency),
    },
  }
}
