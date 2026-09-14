import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadFta47rEnv, type Fta47rEnv } from './load47rEnv'

export const FAM_A = 'dddddddd-4700-4000-8000-000000000047'
export const FAM_B = 'dddddddd-4700-4000-8000-000000000048'

const ALL_ENABLED = [
  'osm',
  'osm-de',
  'carto-light',
  'carto-dark',
  'mapbox-standard',
  'mapbox-streets',
  'openfreemap-liberty',
] as const

export const FAKE_MAPBOX = 'pk.phase47rfixturemapboxxxxxxxxx'
export const FAKE_MAPBOX_ROTATED = 'pk.phase47rfixturemapboxrotatedxxx'
export const FAKE_CARTO = 'phase47rfixturecartokeyxxxx'

let cached: SupabaseClient | null = null
let cachedEnv: Fta47rEnv | null = null

function env(): Fta47rEnv {
  if (!cachedEnv) cachedEnv = loadFta47rEnv()
  return cachedEnv
}

function serviceClient(): SupabaseClient {
  const e = env()
  const key = e.SERVICE_ROLE_KEY
  if (!key) throw new Error('SERVICE_ROLE_KEY is required on FTA47R_E2E_ENV_FILE for map fixtures')
  if (!cached) {
    cached = createClient(e.VITE_SUPABASE_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return cached
}

async function throwIf(error: { message?: string } | null, label: string): Promise<void> {
  if (error) throw new Error(`${label}: ${error.message}`)
}

export async function resetKnownMapRows(): Promise<void> {
  const sb = serviceClient()
  const prefs = await sb.from('family_member_map_preferences').delete().in('family_id', [FAM_A, FAM_B])
  await throwIf(prefs.error, 'reset member map prefs')
  const settings = await sb.from('family_map_settings').delete().in('family_id', [FAM_A, FAM_B])
  await throwIf(settings.error, 'reset family map settings')
}

export type MapFixture = {
  mapbox?: string | null
  carto?: string | null
  enabled?: readonly string[]
  defaultOption?: string
  revision?: number
  memberOption?: string | null
}

export async function writeFamilyAMaps(fixture: MapFixture): Promise<void> {
  await resetKnownMapRows()
  const sb = serviceClient()
  const enabled = [...(fixture.enabled ?? ['osm'])]
  const defaultOption = fixture.defaultOption ?? enabled[0] ?? 'osm'
  const row = {
    family_id: FAM_A,
    mapbox_public_token: fixture.mapbox === undefined ? null : fixture.mapbox,
    carto_api_key: fixture.carto === undefined ? null : fixture.carto,
    enabled_option_ids: enabled,
    default_option_id: defaultOption,
    credential_revision: fixture.revision ?? 0,
  }
  const ins = await sb.from('family_map_settings').insert(row)
  await throwIf(ins.error, 'insert family_map_settings')
  if (fixture.memberOption !== undefined) {
    const personId = env()['47R_MEMBER_PERSON_ID']
    if (!personId) throw new Error('47R_MEMBER_PERSON_ID missing from env file')
    const pref = await sb.from('family_member_map_preferences').insert({
      family_id: FAM_A,
      person_id: personId,
      selected_option_id: fixture.memberOption,
    })
    await throwIf(pref.error, 'insert member map preference')
  }
}

export async function provisionUsableCatalog(extra?: Partial<MapFixture>): Promise<void> {
  await writeFamilyAMaps({
    mapbox: extra?.mapbox ?? FAKE_MAPBOX,
    carto: extra?.carto ?? FAKE_CARTO,
    enabled: extra?.enabled ?? ALL_ENABLED,
    defaultOption: extra?.defaultOption ?? 'osm',
    revision: extra?.revision ?? 1,
    memberOption: extra?.memberOption,
  })
}
