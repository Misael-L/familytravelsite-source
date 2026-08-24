/**
 * Family feature availability (§37). Postgres is SoR.
 * Availability is not authorization. Do not call Nest addonStore.
 */

import { getSupabaseBrowserClient } from './client'

export const FAMILY_FEATURE_KEYS = [
  'vacay',
  'collections',
  'workspace.place_categories',
] as const

export type FamilyFeatureKey = (typeof FAMILY_FEATURE_KEYS)[number]
export type FamilyFeatureRolloutState = 'enabled' | 'preview' | 'disabled'
export type FamilyFeatureMode = 'inherit' | 'enabled' | 'disabled'

export const FAMILY_FEATURE_DEFAULTS: Record<FamilyFeatureKey, true> = {
  vacay: true,
  collections: true,
  'workspace.place_categories': true,
}

export function isFamilyFeatureKey(value: string): value is FamilyFeatureKey {
  return (FAMILY_FEATURE_KEYS as readonly string[]).includes(value)
}

export function compiledFeatureMap(): Record<FamilyFeatureKey, boolean> {
  return { ...FAMILY_FEATURE_DEFAULTS }
}

/** Pure precedence: global disabled always off; preview needs explicit family on. */
export function resolveEffectiveFeature(
  catalogDefault: boolean,
  rollout: FamilyFeatureRolloutState | null,
  familyOverride: boolean | null,
): boolean {
  const state = rollout ?? 'enabled'
  if (state === 'disabled') return false
  if (state === 'preview') return familyOverride === true
  if (familyOverride !== null) return familyOverride
  return catalogDefault
}

export function isMissingFeatureRpc(error: { code?: string; message?: string } | null): boolean {
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

export type FamilyFeatureControl = {
  key: FamilyFeatureKey
  group: string
  displayOrder: number
  familyConfigurable: boolean
  catalogDefault: boolean
  platforms: string[]
  rolloutState: FamilyFeatureRolloutState
  familyOverride: boolean | null
  familyMode: FamilyFeatureMode
  effectiveEnabled: boolean
}

export type FamilyFeatureControls = {
  familyId: string
  canManage: boolean
  isSuperAdmin: boolean
  controls: FamilyFeatureControl[]
}

export type FeatureRolloutEvent = {
  id: string
  featureKey: FamilyFeatureKey
  oldState: FamilyFeatureRolloutState | null
  newState: FamilyFeatureRolloutState
  createdAt: string
}

function throwIfError(error: { message?: string } | null): void {
  if (error) throw error
}

function asRollout(value: unknown): FamilyFeatureRolloutState {
  return value === 'preview' || value === 'disabled' || value === 'enabled' ? value : 'enabled'
}

function asMode(value: unknown, override: boolean | null): FamilyFeatureMode {
  if (value === 'inherit' || value === 'enabled' || value === 'disabled') return value
  if (override === true) return 'enabled'
  if (override === false) return 'disabled'
  return 'inherit'
}

function mapControl(raw: Record<string, unknown>): FamilyFeatureControl | null {
  const key = typeof raw.key === 'string' && isFamilyFeatureKey(raw.key) ? raw.key : null
  if (!key) return null
  const familyOverride = typeof raw.family_override === 'boolean' ? raw.family_override : null
  return {
    key,
    group: typeof raw.feature_group === 'string' ? raw.feature_group : 'product',
    displayOrder: Number(raw.display_order ?? 0),
    familyConfigurable: raw.family_configurable !== false,
    catalogDefault: raw.catalog_default !== false,
    platforms: Array.isArray(raw.platforms) ? raw.platforms.filter((p): p is string => typeof p === 'string') : ['web', 'ios'],
    rolloutState: asRollout(raw.rollout_state),
    familyOverride,
    familyMode: asMode(raw.family_mode, familyOverride),
    effectiveEnabled: raw.effective_enabled !== false,
  }
}

function parseFeatureMap(raw: unknown): Record<FamilyFeatureKey, boolean> {
  const out = compiledFeatureMap()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const rec = raw as Record<string, unknown>
  for (const key of FAMILY_FEATURE_KEYS) {
    if (typeof rec[key] === 'boolean') out[key] = rec[key]
  }
  return out
}

export async function getMyEffectiveFeatures(
  familyId: string,
): Promise<Record<FamilyFeatureKey, boolean>> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('get_my_effective_features', { p_family_id: familyId })
  if (isMissingFeatureRpc(error)) return compiledFeatureMap()
  throwIfError(error)
  const row = (data ?? {}) as Record<string, unknown>
  return parseFeatureMap(row.features)
}

export async function listFamilyFeatureControls(familyId: string): Promise<FamilyFeatureControls> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('list_family_feature_controls', { p_family_id: familyId })
  throwIfError(error)
  const row = (data ?? {}) as Record<string, unknown>
  const rawControls = Array.isArray(row.controls) ? row.controls : []
  return {
    familyId: typeof row.family_id === 'string' ? row.family_id : familyId,
    canManage: row.can_manage === true,
    isSuperAdmin: row.is_super_admin === true,
    controls: rawControls
      .map((item) => (item && typeof item === 'object' ? mapControl(item as Record<string, unknown>) : null))
      .filter((item): item is FamilyFeatureControl => item != null),
  }
}

export async function updateFamilyFeatureOverrides(
  familyId: string,
  patch: Partial<Record<FamilyFeatureKey, boolean | null>>,
): Promise<FamilyFeatureControls> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('update_family_feature_overrides', { p_family_id: familyId, p_patch: patch })
  throwIfError(error)
  const row = (data ?? {}) as Record<string, unknown>
  const rawControls = Array.isArray(row.controls) ? row.controls : []
  return {
    familyId: typeof row.family_id === 'string' ? row.family_id : familyId,
    canManage: row.can_manage === true,
    isSuperAdmin: row.is_super_admin === true,
    controls: rawControls
      .map((item) => (item && typeof item === 'object' ? mapControl(item as Record<string, unknown>) : null))
      .filter((item): item is FamilyFeatureControl => item != null),
  }
}

export async function updateFeatureRollout(
  featureKey: FamilyFeatureKey,
  state: FamilyFeatureRolloutState,
): Promise<{ featureKey: FamilyFeatureKey; state: FamilyFeatureRolloutState }> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('update_feature_rollout', { p_feature_key: featureKey, p_state: state })
  throwIfError(error)
  const row = (data ?? {}) as Record<string, unknown>
  return {
    featureKey: isFamilyFeatureKey(String(row.feature_key ?? featureKey))
      ? (row.feature_key as FamilyFeatureKey)
      : featureKey,
    state: asRollout(row.state ?? state),
  }
}

export async function listFeatureRolloutEvents(limit = 50): Promise<FeatureRolloutEvent[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('list_feature_rollout_events', { p_limit: limit })
  throwIfError(error)
  const row = (data ?? {}) as Record<string, unknown>
  const raw = Array.isArray(row.events) ? row.events : []
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const rec = item as Record<string, unknown>
    const key = typeof rec.feature_key === 'string' && isFamilyFeatureKey(rec.feature_key) ? rec.feature_key : null
    if (!key || typeof rec.id !== 'string' || typeof rec.created_at !== 'string') return []
    return [{
      id: rec.id,
      featureKey: key,
      oldState: rec.old_state === 'enabled' || rec.old_state === 'preview' || rec.old_state === 'disabled'
        ? rec.old_state
        : null,
      newState: asRollout(rec.new_state),
      createdAt: rec.created_at,
    }]
  })
}
