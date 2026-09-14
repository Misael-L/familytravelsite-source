import { expect, test, type Request } from '@playwright/test'

const email = process.env.FAMILY_E2E_EMAIL ?? ''
const password = process.env.FAMILY_E2E_PASSWORD ?? ''
const tripId = process.env.FAMILY_E2E_TRIP_ID ?? ''
const configured = Boolean(email && password && tripId)

function isNestTraffic(url: string): boolean {
  return (
    url.includes('localhost:3001')
    || url.includes('127.0.0.1:3001')
    || /:\/\/[^/]+\/api(?:\/|$|\?)/.test(url)
    || /:\/\/[^/]+\/ws(?:\/|$|\?)/.test(url)
  )
}

test.describe('Family UUID smoke', () => {
  test.skip(!configured, 'Set FAMILY_E2E_EMAIL, FAMILY_E2E_PASSWORD, and FAMILY_E2E_TRIP_ID')

  test('login, dashboard, UUID trip navigation and refresh stay on Supabase', async ({ page }) => {
    const nestHits: string[] = []
    page.on('request', (request: Request) => {
      const url = request.url()
      if (isNestTraffic(url)) nestHits.push(url)
    })

    await page.route('**/rest/v1/rpc/sync_trip_days*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      })
    })

    await page.goto('/login')
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button[type="submit"]').click()

    await page.waitForURL(/\/(dashboard|settings)/, { timeout: 30_000 })
    if (page.url().includes('/settings')) {
      throw new Error('Family e2e member hit MFA/settings instead of dashboard — use an AAL-ok linked member')
    }

    await expect(page).toHaveURL(/\/dashboard/)

    await page.goto(`/trips/${tripId}`)
    await expect(page).toHaveURL(new RegExp(`/trips/${tripId}`))
    expect(page.url()).toMatch(
      /\/trips\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    )

    await page.reload()
    await expect(page).toHaveURL(new RegExp(`/trips/${tripId}`))

    expect(nestHits, `unexpected Nest traffic: ${nestHits.join(', ')}`).toEqual([])
  })

  test('Family Realtime websocket connects after login and stays off Nest', async ({ page }) => {
    const nestHits: string[] = []
    page.on('request', (request: Request) => {
      const url = request.url()
      if (isNestTraffic(url)) nestHits.push(url)
    })

    const realtimeWs = page.waitForEvent('websocket', {
      predicate: ws => /\/realtime\/v1/i.test(ws.url()),
      timeout: 30_000,
    })

    await page.goto('/login')
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button[type="submit"]').click()

    await page.waitForURL(/\/(dashboard|settings)/, { timeout: 30_000 })
    if (page.url().includes('/settings')) {
      throw new Error('Family e2e member hit MFA/settings instead of dashboard — use an AAL-ok linked member')
    }

    const socket = await realtimeWs
    expect(socket.url()).toMatch(/\/realtime\/v1/i)
    expect(nestHits, `unexpected Nest traffic: ${nestHits.join(', ')}`).toEqual([])
  })

  test('Journey list screenshot stays on Supabase and skips cleanly when gated', async ({ page }) => {
    const nestHits: string[] = []
    page.on('request', (request: Request) => {
      const url = request.url()
      if (isNestTraffic(url)) nestHits.push(url)
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/\/(dashboard|settings)/, { timeout: 30_000 })
    if (page.url().includes('/settings')) {
      throw new Error('Family e2e member hit MFA/settings instead of dashboard — use an AAL-ok linked member')
    }

    await page.goto('/journey')
    await page.waitForLoadState('networkidle')
    const gated = await page.getByText(/not enabled|no autorizado|not authorized/i).count()
    test.skip(gated > 0, 'Journey feature is off for this Family e2e member')

    await expect(page.locator('nav').first()).toBeVisible()
    await page.screenshot({ path: 'e2e/family/journey-list-1440.png', fullPage: true })
    expect(nestHits, `unexpected Nest traffic: ${nestHits.join(', ')}`).toEqual([])
  })

  for (const vp of [
    { width: 390, height: 844, file: 'e2e/family/journey-list-390.png', compact: true },
    { width: 768, height: 1024, file: 'e2e/family/journey-list-768.png', compact: false },
  ] as const) {
    test(`Journey list ${vp.width}×${vp.height} stays on Supabase, skips when gated, and keeps chrome`, async ({ page }) => {
      const nestHits: string[] = []
      page.on('request', (request: Request) => {
        const url = request.url()
        if (isNestTraffic(url)) nestHits.push(url)
      })

      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/login')
      await page.locator('input[type="email"]').fill(email)
      await page.locator('input[type="password"]').fill(password)
      await page.locator('button[type="submit"]').click()
      await page.waitForURL(/\/(dashboard|settings)/, { timeout: 30_000 })
      if (page.url().includes('/settings')) {
        throw new Error('Family e2e member hit MFA/settings instead of dashboard — use an AAL-ok linked member')
      }

      await page.goto('/journey')
      await page.waitForLoadState('networkidle')
      const gated = await page.getByText(/not enabled|no autorizado|not authorized/i).count()
      test.skip(gated > 0, 'Journey feature is off for this Family e2e member')

      if (vp.compact) {
        await expect(page.locator('nav.md\\:hidden')).toBeVisible()
        await page.locator('button', { hasText: 'Create Journey' }).first().focus()
        await expect(page.locator('button', { hasText: 'Create Journey' }).first()).toBeFocused()
      } else {
        await expect(page.locator('nav.fixed.top-0')).toBeVisible()
      }

      await page.screenshot({ path: vp.file, fullPage: true })
      expect(nestHits, `unexpected Nest traffic: ${nestHits.join(', ')}`).toEqual([])
    })
  }
})
