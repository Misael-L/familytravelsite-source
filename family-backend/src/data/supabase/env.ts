/**
 * Family Travel Site — browser env for Supabase (W0).
 * Never put the service-role key in Vite env.
 */

export type DataPlane = 'nest' | 'supabase'

function readEnv(name: string): string | undefined {
  const value = import.meta.env[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** Active data plane. Unset defaults to supabase; Nest only when VITE_DATA_PLANE=nest. */
export function getDataPlane(): DataPlane {
  const raw = (readEnv('VITE_DATA_PLANE') ?? 'supabase').toLowerCase()
  return raw === 'nest' ? 'nest' : 'supabase'
}

export function getSupabaseUrl(): string {
  const url = readEnv('VITE_SUPABASE_URL')
  if (!url) {
    throw new Error(
      'Missing VITE_SUPABASE_URL. Copy client/.env.example to client/.env.local and set your Family Travel Supabase project URL.',
    )
  }
  return url
}

export function getSupabaseAnonKey(): string {
  const key = readEnv('VITE_SUPABASE_ANON_KEY')
  if (!key) {
    throw new Error(
      'Missing VITE_SUPABASE_ANON_KEY. Copy client/.env.example to client/.env.local and set the anon (public) key only.',
    )
  }
  return key
}

/** True when URL + anon key are present (does not imply data plane is supabase). */
export function hasSupabaseEnv(): boolean {
  return Boolean(readEnv('VITE_SUPABASE_URL') && readEnv('VITE_SUPABASE_ANON_KEY'))
}

/** Optional Mapbox token for W3+ (supabase plane default map). */
export function getMapboxAccessToken(): string | undefined {
  return readEnv('VITE_MAPBOX_ACCESS_TOKEN')
}
