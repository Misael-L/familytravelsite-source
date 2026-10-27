import type { Page, Route } from '@playwright/test'

export const DAYS_TRIP_ID = '11111111-1111-4111-8111-111111111111'
export const DAYS_FAMILY_ID = '99999999-9999-4999-8999-999999999999'
export const DAYS_PERSON_ID = '88888888-8888-4888-8888-888888888888'
export const DAYS_ITEM_A = '44444444-4444-4444-8444-444444444444'
export const DAYS_ITEM_B = '55555555-5555-4555-8555-555555555555'
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DAY_ID = '22222222-2222-4222-8222-222222222222'
const PLACE_ID = '66666666-6666-4666-8666-666666666666'

const SUPABASE_ORIGIN = 'http://127.0.0.1:5199'
const VITE_PORT = '5180'
const FORBIDDEN_PORTS = new Set(['3001', '5173', '54321', '54322'])
const MAP_HOSTS = new Set(['tile.openstreetmap.org'])
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const READ_RPCS = new Set([
  'get_my_auth_bootstrap',
  'can_mutate_trip',
  'can_draft_trip_changes',
  'list_trip_action_outcomes',
  'get_my_effective_features',
  'get_my_effective_map_settings',
  'get_my_effective_preferences',
  'list_my_notifications',
  'count_my_unread_notifications',
  'sync_trip_days',
])

const READ_TABLES = new Set([
  'trips',
  'trip_days',
  'schedule_items',
  'day_notes',
  'trip_places',
  'trip_tracks',
  'trip_track_waypoints',
  'trip_countries',
  'trip_change_drafts',
  'trip_change_draft_ops',
  'trip_change_requests',
  'trip_change_request_ops',
  'people_avatar_refs',
  'profiles',
  'people',
  'trip_reservations',
  'trip_expenses',
  'trip_files',
  'trip_file_links',
  'trip_reservation_endpoints',
  'trip_reservation_legs',
  'trip_travelers',
  'trip_expense_settlements',
])

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

export type DaysMember = 'direct' | 'draft'

export type DaysRpcCall = {
  name: string
  body: unknown
}

export type DaysRequestLog = {
  unexpected: string[]
  writes: string[]
  rpcCalls: DaysRpcCall[]
}

export type DaysVerdict =
  | { action: 'continue' }
  | { action: 'fulfill'; status: number; contentType: string; body: string }
  | { action: 'png' }
  | { action: 'reject'; reason: string }

type DecideInput = {
  method: string
  href: string
  accept?: string
  member: DaysMember
  jsonBody?: unknown
}

function session() {
  const exp = 4_102_444_800
  return {
    access_token: 'family-days-e2e-access',
    refresh_token: 'family-days-e2e-refresh',
    expires_in: 3600,
    expires_at: exp,
    token_type: 'bearer',
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'days-e2e@example.test',
      email_confirmed_at: '2026-01-01T00:00:00.000Z',
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  }
}

function fulfillJson(body: unknown, status = 200): DaysVerdict {
  return { action: 'fulfill', status, contentType: 'application/json', body: JSON.stringify(body) }
}

function tripRow() {
  return {
    id: DAYS_TRIP_ID,
    family_id: DAYS_FAMILY_ID,
    name: 'Mexico',
    primary_country_id: null,
    start_at: '2026-12-01T00:00:00.000Z',
    end_at: '2026-12-02T00:00:00.000Z',
    status: 'planning',
    cover_url: null,
    notes: null,
    occasion: null,
    reminder_days: 0,
    archived_at: null,
    currency_code: 'EUR',
  }
}

function outcomes(member: DaysMember): Record<string, string> {
  const value = member === 'direct' ? 'direct' : 'propose'
  return {
    'trip.places.manage': value,
    'trip.schedule.manage': value,
    'trip.reservations.manage': value,
    'trip.costs.manage': value,
  }
}

function readRpcBody(name: string, member: DaysMember): unknown {
  if (name === 'get_my_auth_bootstrap') {
    return {
      user_id: USER_ID,
      email_confirmed: true,
      aal: 'aal1',
      has_verified_totp: false,
      assurance_ok: true,
      reviewer_mfa_required: false,
      membership_status: 'active',
      membership_role: member === 'direct' ? 'patriarch' : 'child',
      family_id: DAYS_FAMILY_ID,
      person_id: DAYS_PERSON_ID,
      person_linked: true,
      is_super_admin: false,
      pending_access_request: false,
      gate: 'ok',
    }
  }
  if (name === 'can_mutate_trip') return member === 'direct'
  if (name === 'can_draft_trip_changes') return true
  if (name === 'list_trip_action_outcomes') {
    return { trip_id: DAYS_TRIP_ID, family_id: DAYS_FAMILY_ID, outcomes: outcomes(member) }
  }
  if (name === 'get_my_effective_features') {
    return {
      features: {
        vacay: true,
        collections: true,
        'workspace.place_categories': false,
        journey: false,
      },
    }
  }
  if (name === 'get_my_effective_map_settings') {
    return {
      family_id: DAYS_FAMILY_ID,
      person_id: DAYS_PERSON_ID,
      enabled_option_ids: ['osm'],
      default_option_id: 'osm',
      selected_option_id: null,
      effective_option_id: 'osm',
      source: 'builtin',
      mapbox_public_token: null,
      carto_api_key: null,
      mapbox_configured: false,
      carto_configured: false,
      credential_revision: 0,
    }
  }
  if (name === 'get_my_effective_preferences') {
    return {
      family_id: DAYS_FAMILY_ID,
      person_id: DAYS_PERSON_ID,
      family: {},
      overrides: {},
      effective: {},
      sources: {},
    }
  }
  if (name === 'list_my_notifications') return { items: [], next_cursor: null }
  if (name === 'count_my_unread_notifications') return 0
  if (name === 'sync_trip_days') return null
  return null
}

function wantsObject(accept: string | undefined): boolean {
  return (accept ?? '').includes('vnd.pgrst.object')
}

function tableBody(name: string, accept: string | undefined): unknown {
  if (name === 'trips') return wantsObject(accept) ? tripRow() : [tripRow()]
  if (name === 'trip_days') {
    return [{ id: DAY_ID, trip_id: DAYS_TRIP_ID, civil_day: '2026-12-01', day_index: 1, title: 'Harbor morning' }]
  }
  if (name === 'schedule_items') {
    return [
      {
        id: DAYS_ITEM_A, trip_id: DAYS_TRIP_ID, activity: 'Zócalo walk', starts_at: '2026-12-01T16:00:00.000Z',
        ends_at: null, address: null, time_zone: null, place_id: null, sort_order: 0,
        experience_id: null, food_id: null, link_url: null,
      },
      {
        id: DAYS_ITEM_B, trip_id: DAYS_TRIP_ID, activity: 'Museum hour', starts_at: '2026-12-01T18:00:00.000Z',
        ends_at: null, address: null, time_zone: null, place_id: PLACE_ID, sort_order: 1,
        experience_id: null, food_id: null, link_url: null,
      },
    ]
  }
  if (name === 'day_notes') {
    return [{
      id: '77777777-7777-4777-8777-777777777777',
      trip_id: DAYS_TRIP_ID,
      civil_day: '2026-12-01',
      body: 'Land before lunch',
      icon: null,
      sort_order: 0,
    }]
  }
  if (name === 'trip_places') {
    return [{
      place_id: PLACE_ID,
      trip_id: DAYS_TRIP_ID,
      is_primary: false,
      family_place_category_id: null,
      places: {
        id: PLACE_ID,
        name: 'City museum',
        latitude: 19.43,
        longitude: -99.13,
        notes: null,
        time_zone: 'America/Mexico_City',
        country_id: null,
        place_type_id: null,
        cover_media: null,
      },
      family_place_categories: null,
    }]
  }
  if (name === 'trip_reservations') {
    return [
      {
        id: '33333333-3333-4333-8333-333333333333',
        trip_id: DAYS_TRIP_ID,
        type: 'flight',
        status: 'pending',
        title: 'Night flight',
        start_trip_day_id: DAY_ID,
        end_trip_day_id: DAY_ID,
        starts_at: '2026-12-01T17:00:00.000Z',
        ends_at: null,
        confirmation_code: 'AB12',
        notes: null,
        url: null,
        place_id: null,
        hotel_id: null,
        schedule_item_id: null,
        metadata: {},
        sort_order: 0,
        created_at: '2026-08-20T00:00:00.000Z',
      },
      {
        id: '34343434-3434-4434-8434-343434343434',
        trip_id: DAYS_TRIP_ID,
        type: 'hotel',
        status: 'pending',
        title: 'Villa Erba',
        start_trip_day_id: DAY_ID,
        end_trip_day_id: DAY_ID,
        starts_at: '2026-12-01T15:00:00.000Z',
        ends_at: '2026-12-01T15:00:00.000Z',
        confirmation_code: null,
        notes: null,
        url: null,
        place_id: null,
        hotel_id: null,
        schedule_item_id: null,
        metadata: {},
        sort_order: 1,
        created_at: '2026-08-20T00:00:00.000Z',
      },
    ]
  }
  if (name === 'trip_reservation_endpoints') {
    return [
      {
        id: 'aaaaaaaa-1111-4111-8111-111111111111',
        reservation_id: '33333333-3333-4333-8333-333333333333',
        role: 'from',
        sequence: 0,
        name: 'Rome',
        code: null,
        airport_id: null,
        place_id: null,
        latitude: null,
        longitude: null,
        time_zone: 'Europe/Rome',
        local_date: '2026-12-01',
        local_time: '22:00:00',
      },
      {
        id: 'aaaaaaaa-2222-4222-8222-222222222222',
        reservation_id: '33333333-3333-4333-8333-333333333333',
        role: 'to',
        sequence: 1,
        name: 'Zurich',
        code: null,
        airport_id: null,
        place_id: null,
        latitude: null,
        longitude: null,
        time_zone: 'Europe/Zurich',
        local_date: '2026-12-02',
        local_time: '09:30:00',
      },
    ]
  }
  if (name === 'trip_reservation_legs') {
    return [{
      id: 'bbbbbbbb-1111-4111-8111-111111111111',
      reservation_id: '33333333-3333-4333-8333-333333333333',
      sequence: 0,
      from_endpoint_id: 'aaaaaaaa-1111-4111-8111-111111111111',
      to_endpoint_id: 'aaaaaaaa-2222-4222-8222-222222222222',
      carrier_name: 'Flix',
      service_number: 'N12',
      platform: null,
      seat: null,
    }]
  }
  if (name === 'trip_expenses') return []
  if (name === 'trip_travelers' || name === 'trip_expense_settlements') return []
  if (name === 'profiles') {
    return wantsObject(accept)
      ? { id: USER_ID, display_name: 'days-e2e', preferred_time_zone: null }
      : []
  }
  if (name === 'people') {
    return wantsObject(accept)
      ? { id: DAYS_PERSON_ID, display_name: 'days-e2e', accent_hex: null, email: 'days-e2e@example.test' }
      : []
  }
  if (name === 'trip_change_drafts') {
    const draft = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      trip_id: DAYS_TRIP_ID,
      owner_person_id: DAYS_PERSON_ID,
      title: null,
      notes: null,
      updated_at: null,
    }
    return wantsObject(accept) ? draft : [draft]
  }
  return wantsObject(accept) ? null : []
}

function tableName(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean)
  const rest = parts.indexOf('rest')
  if (rest >= 0 && parts[rest + 1] === 'v1') return decodeURIComponent(parts[rest + 2] ?? '')
  return ''
}

function rpcName(pathname: string): string {
  const marker = '/rpc/'
  const at = pathname.indexOf(marker)
  return at >= 0 ? decodeURIComponent(pathname.slice(at + marker.length).split('/')[0] ?? '') : ''
}

export function isDraftRemovePayload(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const row = body as Record<string, unknown>
  const payload = row.p_payload
  const targetId = row.p_target_id
  return row.p_trip_id === DAYS_TRIP_ID
    && row.p_module === 'plan_item'
    && row.p_op === 'remove'
    && row.p_target_table === 'schedule_items'
    && (targetId === DAYS_ITEM_A || targetId === DAYS_ITEM_B)
    && !!payload
    && typeof payload === 'object'
    && (payload as Record<string, unknown>).schema_version === 1
}

function legacyApiVerdict(method: string, pathname: string): DaysVerdict {
  if (method === 'GET' && /^\/api\/map-markers\/[0-9a-f-]{36}$/i.test(pathname)) {
    return fulfillJson({ markers: [] })
  }
  if (method === 'GET' && pathname.startsWith('/api/maps/place-photo/')) {
    return fulfillJson({ photoUrl: null, attribution: null })
  }
  return { action: 'reject', reason: `${method} ${pathname}` }
}

function supabaseVerdict(input: DecideInput, url: URL): DaysVerdict {
  const method = input.method
  const rpc = rpcName(url.pathname)
  if (rpc) {
    if (method !== 'POST' && method !== 'OPTIONS') {
      return { action: 'reject', reason: `${method} /rpc/${rpc}` }
    }
    if (READ_RPCS.has(rpc)) return fulfillJson(readRpcBody(rpc, input.member))
    if (rpc === 'upsert_trip_change_draft_op' && isDraftRemovePayload(input.jsonBody)) {
      return fulfillJson({
        draft_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        op_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      })
    }
    return { action: 'reject', reason: `${method} /rpc/${rpc}` }
  }
  if (url.pathname.startsWith('/auth/v1/token') && method === 'POST') return fulfillJson(session())
  if (url.pathname.startsWith('/auth/v1/user') && method === 'GET') return fulfillJson(session().user)
  if (url.pathname.startsWith('/auth/v1/health') && method === 'GET') {
    return fulfillJson({ name: 'GoTrue', version: 'family-days-e2e', description: 'fixture' })
  }
  if (url.pathname.includes('/rest/v1/')) {
    const table = tableName(url.pathname)
    if (!READ_TABLES.has(table)) return { action: 'reject', reason: `${method} /rest/v1/${table || url.pathname}` }
    if (method !== 'GET' && method !== 'HEAD') {
      const transportWrite = table === 'trip_reservations'
        || table === 'trip_reservation_endpoints'
        || table === 'trip_reservation_legs'
      if (transportWrite && (method === 'POST' || method === 'PATCH' || method === 'DELETE')) {
        return fulfillJson([])
      }
      return { action: 'reject', reason: `${method} /rest/v1/${table}` }
    }
    return fulfillJson(tableBody(table, input.accept))
  }
  return { action: 'reject', reason: `${method} ${url.pathname}` }
}

/** Pure allowlist used by the Playwright route and the fixture regression tests. */
export function decideDaysRequest(input: DecideInput): DaysVerdict {
  let url: URL
  try {
    url = new URL(input.href)
  } catch {
    return { action: 'reject', reason: `${input.method} ${input.href}` }
  }
  const method = input.method.toUpperCase()
  if (FORBIDDEN_PORTS.has(url.port) || /supabase\.co$/i.test(url.hostname) || url.hostname.includes('gdqywxjlkcrsuylqdhmc')) {
    return { action: 'reject', reason: `${method} ${url.href}` }
  }
  if (method === 'OPTIONS' && url.origin === SUPABASE_ORIGIN) {
    const rpc = rpcName(url.pathname)
    const table = tableName(url.pathname)
    const allowed = READ_RPCS.has(rpc)
      || rpc === 'upsert_trip_change_draft_op'
      || READ_TABLES.has(table)
      || url.pathname.startsWith('/auth/v1/token')
      || url.pathname.startsWith('/auth/v1/user')
      || url.pathname.startsWith('/auth/v1/health')
    if (allowed) return { action: 'fulfill', status: 204, contentType: 'text/plain', body: '' }
    return { action: 'reject', reason: `OPTIONS ${url.pathname}` }
  }
  if (url.hostname === '127.0.0.1' && url.port === VITE_PORT) {
    if (url.pathname.startsWith('/api/')) return legacyApiVerdict(method, url.pathname)
    if (method === 'GET' || method === 'HEAD') return { action: 'continue' }
    return { action: 'reject', reason: `${method} ${url.pathname}` }
  }
  if (url.origin === SUPABASE_ORIGIN) return supabaseVerdict({ ...input, method }, url)
  if (MAP_HOSTS.has(url.hostname) && method === 'GET') return { action: 'png' }
  if (url.hostname === 'api.frankfurter.dev' && method === 'GET') {
    return fulfillJson([{ quote: 'USD', rate: 1.08 }])
  }
  if (FONT_HOSTS.has(url.hostname) && method === 'GET') {
    const css = url.pathname.endsWith('.css')
    return { action: 'fulfill', status: 200, contentType: css ? 'text/css' : 'font/woff2', body: css ? '/* family-days stub */' : '' }
  }
  return { action: 'reject', reason: `${method} ${url.href}` }
}

export function emptyTransportLog(): DaysRequestLog {
  return { unexpected: [], writes: [], rpcCalls: [] }
}

function noteVerdict(log: DaysRequestLog, method: string, url: URL, body: unknown, verdict: DaysVerdict) {
  if (verdict.action === 'reject') {
    log.unexpected.push(verdict.reason)
    if (url.pathname.includes('/trip_days') || url.pathname.includes('/schedule_items') || url.pathname.includes('/day_notes')) {
      log.writes.push(`${method} ${url.pathname}`)
    }
    return
  }
  const rpc = rpcName(url.pathname)
  if (method === 'POST' && rpc) log.rpcCalls.push({ name: rpc, body })
}

export async function installTransportDetailFixture(opts: {
  page: Page
  member: DaysMember
  log: DaysRequestLog
}): Promise<void> {
  const { page, member, log } = opts
  await page.addInitScript((sessionJson) => {
    localStorage.setItem('sb-127-auth-token', sessionJson)
  }, JSON.stringify(session()))

  await page.route('**/*', async (route: Route) => {
    const request = route.request()
    const method = request.method().toUpperCase()
    let jsonBody: unknown
    if (method !== 'GET' && method !== 'HEAD') {
      try { jsonBody = request.postDataJSON() } catch { jsonBody = undefined }
    }
    const verdict = decideDaysRequest({
      method,
      href: request.url(),
      accept: request.headers().accept,
      member,
      jsonBody,
    })
    noteVerdict(log, method, new URL(request.url()), jsonBody, verdict)
    if (verdict.action === 'reject') {
      await route.abort('failed')
      return
    }
    if (verdict.action === 'continue') {
      await route.continue()
      return
    }
    if (verdict.action === 'png') {
      await route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL })
      return
    }
    await route.fulfill({ status: verdict.status, contentType: verdict.contentType, body: verdict.body })
  })
}

export const DAYS_UUID = UUID
