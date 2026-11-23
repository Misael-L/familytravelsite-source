import { getSupabaseBrowserClient } from './client'
import { mapEffectivePreferences, preferencePatchToRpc, type PreferencePatch } from './familyPreferences'

export async function getMyProfileDisplayPreferences(): Promise<unknown> {
  const { data, error } = await getSupabaseBrowserClient().rpc('get_my_profile_display_preferences')
  // During a schema-first rollout, an older API can still serve all other settings.
  if (error?.code === 'PGRST202') return undefined
  if (error) throw error
  return data
}

export async function updateMyProfileDisplayPreferences(
  patch: { date_format?: string; week_start?: string },
  family?: { id: string; patch: PreferencePatch },
) {
  const { data, error } = await getSupabaseBrowserClient().rpc('update_my_profile_display_preferences', {
    p_patch: patch,
    ...(family && { p_family_id: family.id, p_family_patch: preferencePatchToRpc(family.patch) }),
  })
  if (error?.code === 'PGRST202') throw new Error('Date display preferences are unavailable on this server.')
  if (error) throw error
  const result = data as { display?: unknown; family?: unknown } | null
  return {
    display: result?.display,
    family: family ? mapEffectivePreferences(result?.family, family.id, 'family preference save failed') : null,
  }
}
