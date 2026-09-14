import { expect, test, type Page, type Request } from '@playwright/test'
import { createHmac } from 'node:crypto'
import {
  FAKE_CARTO,
  FAKE_MAPBOX,
  FAKE_MAPBOX_ROTATED,
  provisionUsableCatalog,
  resetKnownMapRows,
  writeFamilyAMaps,
} from './47r-fixture'
import { loadFta47rEnv } from './load47rEnv'

const env = loadFta47rEnv()
const permittedOrigin = env.FTA47R_PERMITTED_ORIGIN
const hofEmail = env['47R_HOF_EMAIL']
const memberEmail = env['47R_MEMBER_EMAIL']
const reviewerEmail = env['47R_REVIEWER_EMAIL']
const inactiveEmail = env['47R_INACTIVE_EMAIL']
const strangerEmail = env['47R_STRANGER_EMAIL']
const password = env['47R_PASSWORD']
const hofTotp = env['47R_HOF_TOTP']
const reviewerTotp = env['47R_REVIEWER_TOTP']
const strangerTotp = env['47R_STRANGER_TOTP']
const tripId = env['47R_TRIP_ID']
const journeyId = env['47R_JOURNEY_ID']
const listId = env['47R_LIST_ID']

if (!hofEmail || !password || !hofTotp || !permittedOrigin || !tripId || !journeyId || !listId) {
  throw new Error('§47R env file is missing required fixture keys')
}

const PIXEL = Buffer.from(
  'iVBORw0KgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const STUB_STYLE = JSON.stringify({
  version: 8,
  name: 'phase47r-stub',
  glyphs: 'https://api.mapbox.com/fonts/v1/mapbox/{fontstack}/{range}.pbf',
  sources: {},
  layers: [],
})
const MAP_RPC = /get_my_effective_map_settings|get_family_map_settings|update_family_map_settings|update_my_map_preference/
const NEST_ALLOW = /\/api\/(maps|shared|addons\/atlas|public\/journey|frankfurter|map-markers)/i
const FONT_HOST = /^(fonts\.googleapis\.com|fonts\.gstatic\.com)$/i
const FX_HOST = /^api\.frankfurter\.dev$/i
const PROVIDER_HOST = /^(api\.mapbox\.com|events\.mapbox\.com|(?:[a-z0-9-]+\.)?tiles\.mapbox\.com|(?:[a-z0-9-]+\.)?basemaps\.cartocdn\.com|(?:[a-z0-9-]+\.)?tile\.openstreetmap\.org|tile\.openstreetmap\.de|tiles\.openfreemap\.org|cdnjs\.cloudflare\.com)$/i
const PROVIDER_REQ = /mapbox\.com|cartocdn\.com|openstreetmap\.|openfreemap\.org/

function isForbiddenHost(url: string): boolean {
  return url.includes('gdqywxjlkcrsuylqdhmc') || /https:\/\/[a-z0-9-]+\.supabase\.co/i.test(url)
}

function isSupabaseUrl(url: string): boolean {
  return url.includes('/rest/v1/') || url.includes('/auth/v1/') || url.includes('/storage/v1/')
}

function decodeBase32(secret: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const cleaned = secret.toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '')
  let bits = ''
  for (const char of cleaned) bits += alphabet.indexOf(char).toString(2).padStart(5, '0')
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

function totpCode(secret: string, atSeconds = Date.now() / 1000): string {
  const counter = Math.floor(atSeconds / 30)
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  buf.writeUInt32BE(counter >>> 0, 4)
  const hmac = createHmac('sha1', decodeBase32(secret)).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(code).padStart(6, '0')
}

function isExpectedNetwork(url: string): boolean {
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return true
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.origin === permittedOrigin) return true
  if (parsed.hostname === '127.0.0.1' && parsed.port === '5176') return true
  if (NEST_ALLOW.test(url)) return true
  if (FONT_HOST.test(parsed.hostname)) return true
  if (FX_HOST.test(parsed.hostname)) return true
  return PROVIDER_HOST.test(parsed.hostname)
}

function isPostLoginUrl(url: URL): boolean {
  const parsed = url instanceof URL ? url : new URL(String(url), 'http://127.0.0.1')
  if (parsed.searchParams.get('mfa') === 'required') return false
  return /\/(dashboard|settings|request-access|admin)(\/|$)/.test(parsed.pathname)
}

async function installProviderStubs(page: Page): Promise<void> {
  await page.route('https://api.mapbox.com/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/styles/') || url.includes('.json')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: STUB_STYLE })
      return
    }
    await route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL })
  })
  await page.route('https://events.mapbox.com/**', (route) => route.fulfill({ status: 204, body: '' }))
  await page.route('https://*.tiles.mapbox.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
  )
  await page.route('https://*.basemaps.cartocdn.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
  )
  await page.route('https://basemaps.cartocdn.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
  )
  await page.route('https://*.tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
  )
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
  )
  await page.route('https://tile.openstreetmap.de/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
  )
  await page.route('https://tiles.openfreemap.org/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/styles/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: STUB_STYLE })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: STUB_STYLE })
  })
  await page.route('**/api/maps/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
  await page.route('**/api/addons/atlas/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/countries/geo') || url.includes('/regions/geo')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'FeatureCollection', features: [] }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        countries: [],
        stats: { totalTrips: 0, totalPlaces: 0, totalCountries: 0, totalDays: 0 },
        items: [],
      }),
    })
  })
  await page.route('**/api/shared/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        trip: { id: 1, title: '47R Shared', start_date: '2026-09-10', end_date: '2026-09-12' },
        days: [],
        assignments: {},
        dayNotes: {},
        places: [{ id: 1, name: 'Florence', lat: 43.77, lng: 11.25 }],
        reservations: [],
        accommodations: [],
        packing: [],
        budget: [],
        categories: [],
        permissions: { share_map: true, share_bookings: false, share_packing: false, share_budget: false, share_collab: false },
        collab: [],
      }),
    }),
  )
  await page.route('**/api/public/journey/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        journey: { id: 1, title: '47R Public Journey' },
        entries: [{
          id: 11,
          title: 'Duomo',
          entry_date: '2026-09-10',
          location_name: 'Florence',
          location_lat: 43.7731,
          location_lng: 11.256,
        }],
        permissions: { share_timeline: true, share_gallery: true, share_map: true },
        gallery: [],
        stats: { entries: 1, photos: 0, places: 1 },
      }),
    }),
  )
  await page.route('**/api/atlas-layers**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"layers":[]}' }),
  )
  await page.route('**/api/frankfurter**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"rates":{}}' }),
  )
  await page.route('**/api/map-markers/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await page.route('https://cdnjs.cloudflare.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
  )
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '/* 47r font stub */' }),
  )
  await page.route('https://fonts.gstatic.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'font/woff2', body: PIXEL }),
  )
  await page.route('https://api.frankfurter.dev/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"rates":{}}' }),
  )
}

function installGuards(page: Page): {
  failures: string[]
  mapRpcs: { path: string; rpc: string }[]
  credentialReqs: string[]
  providerReqs: string[]
} {
  const failures: string[] = []
  const mapRpcs: { path: string; rpc: string }[] = []
  const credentialReqs: string[] = []
  const providerReqs: string[] = []
  page.on('pageerror', (err) => {
    failures.push(`pageerror: ${err.message}`)
  })
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    failures.push(`console: ${msg.text()}`)
  })
  page.on('request', (request: Request) => {
    const url = request.url()
    if (isForbiddenHost(url)) failures.push(`production host: ${url}`)
    if (!isExpectedNetwork(url)) failures.push(`unexpected network: ${url}`)
    if (isSupabaseUrl(url) && !url.startsWith(permittedOrigin)) {
      failures.push(`unexpected supabase origin: ${url}`)
    }
    const match = url.match(MAP_RPC)
    if (match) {
      let path = '/'
      try { path = new URL(page.url()).pathname } catch { /* about:blank */ }
      mapRpcs.push({ path, rpc: match[0] })
    }
    if (PROVIDER_REQ.test(url)) providerReqs.push(url)
    if (/access_token=/.test(url) || /[?&]key=/.test(url)) credentialReqs.push(url)
  })
  page.on('requestfailed', (request) => {
    const url = request.url()
    if (NEST_ALLOW.test(url)) return
    const err = request.failure()?.errorText || ''
    if (err === 'net::ERR_ABORTED' || err === 'NS_BINDING_ABORTED') return
    if (url.startsWith(permittedOrigin)) {
      failures.push(`requestfailed: ${url} ${err}`)
    }
  })
  page.on('response', (res) => {
    const url = res.url()
    if (NEST_ALLOW.test(url)) return
    if (url.startsWith(permittedOrigin) && res.status() >= 400) {
      failures.push(`origin ${res.status()} ${url}`)
    }
  })
  return { failures, mapRpcs, credentialReqs, providerReqs }
}

async function login(page: Page, email: string, pwd: string, totpSecret?: string): Promise<void> {
  await page.goto('/login')
  await page.getByPlaceholder(/your@email/i).fill(email)
  await page.locator('input[type="password"]').fill(pwd)
  await page.getByRole('button', { name: 'Sign In' }).click()
  if (totpSecret) {
    const codeInput = page.getByPlaceholder(/000000/i)
    await expect(codeInput).toBeVisible({ timeout: 20_000 })
    await codeInput.fill(totpCode(totpSecret))
    await page.getByRole('button', { name: 'Verify' }).click()
  }
  await page.waitForURL(isPostLoginUrl, { timeout: 30_000 })
  await expect(page.locator('.takeoff-overlay')).toHaveCount(0)
}

function needsHamburger(projectName: string): boolean {
  return projectName === 'phone' || projectName === 'tablet'
}

async function openAdminMaps(page: Page, projectName: string): Promise<void> {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible({ timeout: 20_000 })
  if (needsHamburger(projectName)) {
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await expect(page.getByRole('button', { name: 'Maps', exact: true })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Maps', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Family maps' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveCount(0)
  await expect(page.locator('.nomad-toast')).toHaveCount(0, { timeout: 8_000 })
}

/** Controlled checkboxes do not flip `.checked` until save+hydrate; Playwright `check()`/`uncheck()` do not wait. */
async function toggleAdminMapOption(page: Page, name: string, wantChecked: boolean): Promise<void> {
  const box = page.getByRole('checkbox', { name, exact: true })
  const row = page.locator('label').filter({ has: box })
  await row.scrollIntoViewIfNeeded()
  await expect(box).toBeEnabled()
  const already = await box.isChecked()
  if (already === wantChecked) {
    throw new Error(`${name} already ${wantChecked ? 'checked' : 'unchecked'}; fixture must start in the opposite state`)
  }
  await row.click()
  if (wantChecked) await expect(box).toBeChecked()
  else await expect(box).not.toBeChecked()
  await expect(page.getByText('Family maps saved')).toBeVisible()
  await expect(page.locator('.nomad-toast')).toHaveCount(0)
}

async function waitForFamilyMapHydrate(page: Page, optionName: string): Promise<void> {
  await page.goto('/settings?tab=map')
  await expect(page.getByRole('button', { name: optionName, exact: true })).toBeVisible()
}

async function expectRenderer(
  page: Page,
  kind: 'mapbox' | 'maplibre' | 'carto' | 'osm',
  navigate: () => Promise<void>,
): Promise<void> {
  const pending = page.waitForRequest((req) => {
    const u = req.url()
    if (kind === 'mapbox') return /api\.mapbox\.com/.test(u)
    if (kind === 'maplibre') return /tiles\.openfreemap\.org/.test(u)
    if (kind === 'carto') return /basemaps\.cartocdn\.com/.test(u)
    return /tile\.openstreetmap\.(org|de)/.test(u)
  }, { timeout: 45_000 })
  await navigate()
  await pending
}

test.describe('§47R.11 Family maps', () => {
  test.beforeEach(async ({ page }) => {
    await installProviderStubs(page)
  })

  test('admin adds CARTO and Mapbox credentials', async ({ page }, testInfo) => {
    const g = installGuards(page)
    await writeFamilyAMaps({ enabled: ['osm'], defaultOption: 'osm' })
    await login(page, hofEmail, password, hofTotp)
    await openAdminMaps(page, testInfo.project.name)
    await page.getByRole('button', { name: 'Add' }).first().click()
    await page.locator('input[type="password"]').fill(FAKE_MAPBOX)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Family maps saved')).toBeVisible()
    await page.getByRole('button', { name: 'Add' }).click()
    await page.locator('input[type="password"]').fill(FAKE_CARTO)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Family maps saved')).toBeVisible()
    await expect(page.getByText('Configured')).toHaveCount(2)
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('enable disable named options and set family default', async ({ page }, testInfo) => {
    const g = installGuards(page)
    await provisionUsableCatalog({ enabled: ['osm', 'mapbox-standard'], defaultOption: 'osm' })
    await login(page, hofEmail, password, hofTotp)
    await openAdminMaps(page, testInfo.project.name)
    await toggleAdminMapOption(page, 'OpenStreetMap DE', true)
    await toggleAdminMapOption(page, 'Mapbox Standard', false)
    await page.locator('select').selectOption({ label: 'OpenStreetMap DE' })
    await expect(page.getByText('Family maps saved')).toBeVisible()
    await expect(page.locator('.nomad-toast')).toHaveCount(0)
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('member inherits family default', async ({ page }) => {
    const g = installGuards(page)
    await provisionUsableCatalog({ defaultOption: 'osm-de' })
    await login(page, memberEmail, password)
    await page.goto('/settings?tab=map')
    const osmDe = page.getByRole('button', { name: 'OpenStreetMap DE', exact: true })
    await expect(osmDe).toBeVisible()
    await expect(osmDe).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Currently using: Family default')).toBeVisible()
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('member selects CARTO Light', async ({ page }) => {
    const g = installGuards(page)
    await provisionUsableCatalog({ memberOption: null, defaultOption: 'osm' })
    await login(page, memberEmail, password)
    await page.goto('/settings?tab=map')
    await page.getByRole('button', { name: 'CARTO Light', exact: true }).click()
    await expect(page.getByText('Map settings saved')).toBeVisible()
    await expect(page.getByRole('button', { name: 'CARTO Light', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('member selects a Mapbox option', async ({ page }) => {
    const g = installGuards(page)
    await provisionUsableCatalog({ memberOption: null, defaultOption: 'osm' })
    await login(page, memberEmail, password)
    await page.goto('/settings?tab=map')
    await page.getByRole('button', { name: 'Mapbox Standard', exact: true }).click()
    await expect(page.getByText('Map settings saved')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mapbox Standard', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('member selects an OpenFreeMap option', async ({ page }) => {
    const g = installGuards(page)
    await provisionUsableCatalog({ memberOption: null, defaultOption: 'osm' })
    await login(page, memberEmail, password)
    await page.goto('/settings?tab=map')
    await page.getByRole('button', { name: 'OpenFreeMap Liberty', exact: true }).click()
    await expect(page.getByText('Map settings saved')).toBeVisible()
    await expect(page.getByRole('button', { name: 'OpenFreeMap Liberty', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('reload persistence of a member pick saved in this test', async ({ page }) => {
    const g = installGuards(page)
    await provisionUsableCatalog({ memberOption: null, defaultOption: 'osm' })
    await login(page, memberEmail, password)
    await page.goto('/settings?tab=map')
    await page.getByRole('button', { name: 'OpenStreetMap DE', exact: true }).click()
    await expect(page.getByText('Map settings saved')).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'OpenStreetMap DE', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('reset to inherit', async ({ page }) => {
    const g = installGuards(page)
    await provisionUsableCatalog({ memberOption: 'carto-light', defaultOption: 'osm' })
    await login(page, memberEmail, password)
    await page.goto('/settings?tab=map')
    await page.getByRole('button', { name: 'Reset to family default' }).click()
    await expect(page.getByText('Map settings saved')).toBeVisible()
    await expect(page.getByRole('button', { name: 'OpenStreetMap', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('admin rotates Mapbox token', async ({ page }, testInfo) => {
    const g = installGuards(page)
    await provisionUsableCatalog()
    await login(page, hofEmail, password, hofTotp)
    await openAdminMaps(page, testInfo.project.name)
    await page.getByRole('button', { name: 'Replace' }).first().click()
    await page.locator('input[type="password"]').fill(FAKE_MAPBOX_ROTATED)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Family maps saved')).toBeVisible()
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('admin clears a credential and dependent options drop', async ({ page }, testInfo) => {
    const g = installGuards(page)
    page.on('dialog', (dialog) => void dialog.accept())
    await provisionUsableCatalog({ enabled: ['osm', 'mapbox-standard'], defaultOption: 'mapbox-standard' })
    await login(page, hofEmail, password, hofTotp)
    await openAdminMaps(page, testInfo.project.name)
    await page.getByRole('button', { name: 'Clear' }).first().click()
    await expect(page.getByText('Family maps saved')).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Mapbox Standard', exact: true })).toBeDisabled()
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('credential_revision clears all Workbox map caches', async ({ page }) => {
    const g = installGuards(page)
    await provisionUsableCatalog({ revision: 1 })
    await login(page, hofEmail, password, hofTotp)
    await page.goto('/settings?tab=map')
    await expect(page.getByRole('button', { name: 'OpenStreetMap', exact: true })).toBeVisible()
    await page.evaluate(async () => {
      await caches.open('map-tiles')
      await caches.open('mapbox-tiles')
      await caches.open('openfreemap-tiles')
    })
    await writeFamilyAMaps({
      mapbox: FAKE_MAPBOX_ROTATED,
      carto: FAKE_CARTO,
      enabled: ['osm', 'carto-light', 'mapbox-standard', 'openfreemap-liberty'],
      defaultOption: 'osm',
      revision: 2,
    })
    await page.reload()
    await expect(page.getByRole('button', { name: 'OpenStreetMap', exact: true })).toBeVisible()
    await expect.poll(async () => page.evaluate(async () => ({
      raster: await caches.has('map-tiles'),
      mapbox: await caches.has('mapbox-tiles'),
      ofm: await caches.has('openfreemap-tiles'),
    }))).toEqual({ raster: false, mapbox: false, ofm: false })
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('session isolation HOF family A then stranger family B', async ({ page }) => {
    const g = installGuards(page)
    await provisionUsableCatalog()
    await login(page, hofEmail, password, hofTotp)
    await page.goto('/settings?tab=map')
    await expect(page.getByRole('button', { name: 'OpenStreetMap', exact: true })).toBeVisible()
    await page.context().clearCookies()
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.goto('/login')
    g.mapRpcs.length = 0
    await login(page, strangerEmail, password, strangerTotp)
    await page.goto('/settings?tab=map')
    const updates = g.mapRpcs.filter((h) => h.rpc.startsWith('update_'))
    expect(updates).toEqual([])
    const settingsForA = g.mapRpcs.filter((h) => h.rpc === 'get_family_map_settings')
    expect(settingsForA).toEqual([])
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('planner mounts renderer for effective engine', async ({ page }) => {
    const g = installGuards(page)
    await provisionUsableCatalog({ defaultOption: 'mapbox-standard', memberOption: null })
    await login(page, hofEmail, password, hofTotp)
    await waitForFamilyMapHydrate(page, 'Mapbox Standard')
    await expectRenderer(page, 'mapbox', async () => {
      await page.goto(`/trips/${tripId}`)
      await expect(page).toHaveURL(new RegExp(`/trips/${tripId}`))
      // Phone navbar uses `hidden sm:inline` for the trip title; it is in the DOM on every viewport.
      await expect(page.getByText('47R Planner Fixture', { exact: true })).toBeAttached({ timeout: 45_000 })
    })
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('journey detail mounts renderer for effective engine', async ({ page }) => {
    const g = installGuards(page)
    await provisionUsableCatalog({ defaultOption: 'mapbox-standard', memberOption: null })
    await login(page, hofEmail, password, hofTotp)
    await waitForFamilyMapHydrate(page, 'Mapbox Standard')
    await expectRenderer(page, 'mapbox', () => page.goto(`/journey/${journeyId}`))
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('atlas mounts renderer for effective engine', async ({ page }) => {
    const g = installGuards(page)
    await provisionUsableCatalog({ defaultOption: 'openfreemap-liberty', memberOption: null })
    await login(page, hofEmail, password, hofTotp)
    await waitForFamilyMapHydrate(page, 'OpenFreeMap Liberty')
    await expectRenderer(page, 'maplibre', () => page.goto('/atlas'))
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('collections mounts renderer for effective engine', async ({ page }, testInfo) => {
    const g = installGuards(page)
    await provisionUsableCatalog({ defaultOption: 'carto-light', memberOption: null })
    await login(page, hofEmail, password, hofTotp)
    await waitForFamilyMapHydrate(page, 'CARTO Light')
    await expectRenderer(page, 'carto', async () => {
      await page.goto(`/collections/${listId}`)
      await expect(page.getByRole('heading', { name: '47R Collection Fixture' })).toBeVisible({ timeout: 45_000 })
      if (testInfo.project.name === 'phone' || testInfo.project.name === 'tablet') {
        await page.locator('.col-viewseg').getByRole('button', { name: 'Map', exact: true }).click()
      }
    })
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('reviewer admin maps is read-only', async ({ page }, testInfo) => {
    const g = installGuards(page)
    await provisionUsableCatalog()
    await login(page, reviewerEmail, password, reviewerTotp)
    await openAdminMaps(page, testInfo.project.name)
    await expect(page.getByText(/view only/i)).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'OpenStreetMap', exact: true })).toBeDisabled()
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('inactive member is sent to request-access', async ({ page }) => {
    const g = installGuards(page)
    await resetKnownMapRows()
    await login(page, inactiveEmail, password)
    await expect(page).toHaveURL(/request-access/)
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })

  test('authenticated public routes issue zero map RPCs and zero credential-bearing provider requests', async ({ page }) => {
    const g = installGuards(page)
    await provisionUsableCatalog()
    await login(page, hofEmail, password, hofTotp)
    g.mapRpcs.length = 0
    g.credentialReqs.length = 0
    await expectRenderer(page, 'osm', () => page.goto('/shared/phase47r-public-token'))
    await expect(page).toHaveURL(/\/shared\//)
    await expect(page.getByText('47R Shared')).toBeVisible()
    expect(g.mapRpcs, JSON.stringify(g.mapRpcs)).toEqual([])
    expect(g.credentialReqs, g.credentialReqs.join('\n')).toEqual([])
    // Family-plane useJourneyPublic fail-closes without Nest. This is denial
    // coverage (Not Found + zero map RPCs/provider requests), not Journey
    // renderer coverage. OSM renderer proof for public surfaces is /shared.
    // Do not remove that product guard.
    g.mapRpcs.length = 0
    g.credentialReqs.length = 0
    g.providerReqs.length = 0
    await page.goto('/public/journey/phase47r-public-token')
    await expect(page).toHaveURL(/\/public\/journey\//)
    await expect(page.getByRole('heading', { name: 'Not Found' })).toBeVisible()
    expect(g.mapRpcs, JSON.stringify(g.mapRpcs)).toEqual([])
    expect(g.credentialReqs, g.credentialReqs.join('\n')).toEqual([])
    expect(g.providerReqs, g.providerReqs.join('\n')).toEqual([])
    expect(g.failures, g.failures.join('\n')).toEqual([])
  })
})
