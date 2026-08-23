import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'

let browserClient: SupabaseClient | null = null

/**
 * Singleton browser Supabase client (anon key + user JWT via auth session).
 * Callers must not use the service-role key. Domain adapters land in W1+.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient
  browserClient = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  return browserClient
}
