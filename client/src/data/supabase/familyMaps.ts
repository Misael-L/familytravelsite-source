/**
 * Family-provisioned maps (§47). Postgres RPCs are SoR.
 * Dedicated tables — not portable display preferences. Never call Nest settingsApi.
 */

import { getSupabaseBrowserClient } from './client'
import {
  BUILTIN_MAP_OPTION_ID,
  getFamilyMapOption,
  isFamilyMapOptionId,
  optionIsUsable,
  type FamilyMapOptionId,
  type MapOptionSource,
} from '../../components/Map/mapRegistry'

export type { FamilyMapOptionId, MapOptionSource }

export type FamilyMapSettings = {
  familyId: string
  canManage: boolean
  mapboxPublicToken: string | null
  cartoApiKey: string | null
  mapboxConfigured: boolean
  cartoConfigured: boolean
  enabledOptionIds: FamilyMapOptionId[]
  defaultOptionId: FamilyMapOptionId
  credentialRevision: number
  updatedAt: string | null
}

export type EffectiveMapSettings = {
  familyId: string
  personId: string | null
  enabledOptionIds: FamilyMapOptionId[]
  defaultOptionId: FamilyMapOptionId
  selectedOptionId: FamilyMapOptionId | null
  effectiveOptionId: FamilyMapOptionId
  source: MapOptionSource
  mapboxPublicToken: string | null
  cartoApiKey: string | null
  mapboxConfigured: boolean
  cartoConfigured: boolean
  credentialRevision: number
}

export type FamilyMapSettingsPatch = {
  mapboxPublicToken?: string | null
  cartoApiKey?: string | null
  enabledOptionIds?: FamilyMapOptionId[]
  defaultOptionId?: FamilyMapOptionId
}

function throwIfError(error: { message?: string } | null): void {
  if (error) throw error
}

export function isMissingMapRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const code = error.code ?? ''
  const message = (error.message ?? '').toLowerCase()
  return (
    code === 'PGRST202'
    || code === '42883'
    || message.includes('could not find the function')
    || message.includes('schema cache')
  )
}

export function isPermissionMapError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const code = error.code ?? ''
  const message = (error.message ?? '').toLowerCase()
  return (
    code === '42501'
    || message.includes('not authorized')
    || message.includes('not authenticated')
  )
}

export function isNetworkMapError(error: unknown): boolean {
  if (!error) return false
  const rec = error as { name?: string; message?: string }
  const message = (rec.message ?? '').toLowerCase()
  return (
    rec.name === 'TypeError'
    || rec.name === 'AbortError'
    || message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('timeout')
    || message.includes('could not load family maps')
  )
}

export type FamilyMapErrorKind = 'missing_rpc' | 'permission' | 'network' | 'load' | 'save'

export function classifyFamilyMapError(error: unknown): FamilyMapErrorKind {
  const rec = (error ?? {}) as { code?: string; message?: string }
  if (isMissingMapRpc(rec)) return 'missing_rpc'
  if (isPermissionMapError(rec)) return 'permission'
  if (isNetworkMapError(error)) return 'network'
  return 'load'
}

export function isMissingMapCredentialError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? error ?? '')).toLowerCase()
  return message.includes('missing its credential')
}

function asOptionId(value: unknown, fallback: FamilyMapOptionId = BUILTIN_MAP_OPTION_ID): FamilyMapOptionId {
  return typeof value === 'string' && isFamilyMapOptionId(value) ? value : fallback
}

function asOptionIdOrNull(value: unknown): FamilyMapOptionId | null {
  return typeof value === 'string' && isFamilyMapOptionId(value) ? value : null
}

function asOptionIds(value: unknown): FamilyMapOptionId[] {
  if (!Array.isArray(value)) return [BUILTIN_MAP_OPTION_ID]
  const ids = value
    .filter((item): item is string => typeof item === 'string')
    .filter(isFamilyMapOptionId)
  return ids.length > 0 ? ids : [BUILTIN_MAP_OPTION_ID]
}

function asSource(value: unknown): MapOptionSource {
  return value === 'member' || value === 'family' || value === 'builtin' ? value : 'builtin'
}

function asToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function looksSecret(value: string | null): boolean {
  if (!value) return false
  const lower = value.toLowerCase()
  return (
    lower.startsWith('sk.')
    || value.startsWith('eyJ')
    || lower.includes('service_role')
    || lower.includes('sb_secret')
    || lower.includes('supabase')
  )
}

export function builtinEffectiveMapSettings(familyId: string, personId: string | null = null): EffectiveMapSettings {
  return {
    familyId,
    personId,
    enabledOptionIds: [BUILTIN_MAP_OPTION_ID],
    defaultOptionId: BUILTIN_MAP_OPTION_ID,
    selectedOptionId: null,
    effectiveOptionId: BUILTIN_MAP_OPTION_ID,
    source: 'builtin',
    mapboxPublicToken: null,
    cartoApiKey: null,
    mapboxConfigured: false,
    cartoConfigured: false,
    credentialRevision: 0,
  }
}

export function mapFamilyMapSettings(row: Record<string, unknown> | null, familyId: string): FamilyMapSettings {
  const mapbox = asToken(row?.mapbox_public_token)
  const carto = asToken(row?.carto_api_key)
  return {
    familyId: typeof row?.family_id === 'string' ? row.family_id : familyId,
    canManage: row?.can_manage === true,
    mapboxPublicToken: looksSecret(mapbox) ? null : mapbox,
    cartoApiKey: looksSecret(carto) ? null : carto,
    mapboxConfigured: row?.mapbox_configured === true || (!!mapbox && !looksSecret(mapbox)),
    cartoConfigured: row?.carto_configured === true || (!!carto && !looksSecret(carto)),
    enabledOptionIds: asOptionIds(row?.enabled_option_ids),
    defaultOptionId: asOptionId(row?.default_option_id),
    credentialRevision: Number(row?.credential_revision ?? 0) || 0,
    updatedAt: typeof row?.updated_at === 'string' ? row.updated_at : null,
  }
}

export function mapEffectiveMapSettings(row: Record<string, unknown> | null, familyId: string): EffectiveMapSettings {
  const mapbox = looksSecret(asToken(row?.mapbox_public_token)) ? null : asToken(row?.mapbox_public_token)
  const carto = looksSecret(asToken(row?.carto_api_key)) ? null : asToken(row?.carto_api_key)
  const enabled = asOptionIds(row?.enabled_option_ids)
  const selected = asOptionIdOrNull(row?.selected_option_id)
  const resolved = resolveClientEffectiveOption({
    enabledOptionIds: enabled,
    defaultOptionId: asOptionId(row?.default_option_id),
    selectedOptionId: selected,
    mapbox,
    carto,
    rpcEffective: asOptionIdOrNull(row?.effective_option_id),
    rpcSource: asSource(row?.source),
  })
  return {
    familyId: typeof row?.family_id === 'string' ? row.family_id : familyId,
    personId: typeof row?.person_id === 'string' ? row.person_id : null,
    enabledOptionIds: enabled,
    defaultOptionId: asOptionId(row?.default_option_id),
    selectedOptionId: selected,
    effectiveOptionId: resolved.optionId,
    source: resolved.source,
    mapboxPublicToken: mapbox,
    cartoApiKey: carto,
    mapboxConfigured: row?.mapbox_configured === true || !!mapbox,
    cartoConfigured: row?.carto_configured === true || !!carto,
    credentialRevision: Number(row?.credential_revision ?? 0) || 0,
  }
}

export function resolveClientEffectiveOption(input: {
  enabledOptionIds: FamilyMapOptionId[]
  defaultOptionId: FamilyMapOptionId
  selectedOptionId: FamilyMapOptionId | null
  mapbox: string | null
  carto: string | null
  rpcEffective?: FamilyMapOptionId | null
  rpcSource?: MapOptionSource
}): { optionId: FamilyMapOptionId; source: MapOptionSource } {
  const credentials = { mapbox: input.mapbox, carto: input.carto }
  const enabled = input.enabledOptionIds.filter(id => getFamilyMapOption(id))
  if (
    input.selectedOptionId
    && enabled.includes(input.selectedOptionId)
    && optionIsUsable(input.selectedOptionId, credentials)
  ) {
    return { optionId: input.selectedOptionId, source: 'member' }
  }
  if (
    enabled.includes(input.defaultOptionId)
    && optionIsUsable(input.defaultOptionId, credentials)
  ) {
    return { optionId: input.defaultOptionId, source: 'family' }
  }
  if (input.rpcEffective && optionIsUsable(input.rpcEffective, credentials)) {
    return { optionId: input.rpcEffective, source: input.rpcSource ?? 'builtin' }
  }
  return { optionId: BUILTIN_MAP_OPTION_ID, source: 'builtin' }
}

export function familyMapPatchToRpc(patch: FamilyMapSettingsPatch): Record<string, unknown> {
  const rpc: Record<string, unknown> = {}
  if ('mapboxPublicToken' in patch) rpc.mapbox_public_token = patch.mapboxPublicToken ?? null
  if ('cartoApiKey' in patch) rpc.carto_api_key = patch.cartoApiKey ?? null
  if ('enabledOptionIds' in patch) rpc.enabled_option_ids = patch.enabledOptionIds
  if ('defaultOptionId' in patch) rpc.default_option_id = patch.defaultOptionId
  return rpc
}

export async function getFamilyMapSettings(familyId: string): Promise<FamilyMapSettings> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('get_family_map_settings', { p_family_id: familyId })
  throwIfError(error)
  return mapFamilyMapSettings((data ?? {}) as Record<string, unknown>, familyId)
}

export async function updateFamilyMapSettings(
  familyId: string,
  patch: FamilyMapSettingsPatch,
): Promise<FamilyMapSettings> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('update_family_map_settings', {
      p_family_id: familyId,
      p_patch: familyMapPatchToRpc(patch),
    })
  throwIfError(error)
  return mapFamilyMapSettings((data ?? {}) as Record<string, unknown>, familyId)
}

export async function getMyEffectiveMapSettings(familyId: string): Promise<EffectiveMapSettings> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('get_my_effective_map_settings', { p_family_id: familyId })
  throwIfError(error)
  return mapEffectiveMapSettings((data ?? {}) as Record<string, unknown>, familyId)
}

export async function updateMyMapPreference(
  familyId: string,
  optionId: FamilyMapOptionId | null,
): Promise<EffectiveMapSettings> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('update_my_map_preference', {
      p_family_id: familyId,
      p_option_id: optionId,
    })
  throwIfError(error)
  return mapEffectiveMapSettings((data ?? {}) as Record<string, unknown>, familyId)
}
