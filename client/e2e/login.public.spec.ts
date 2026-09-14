import { test, expect } from '@playwright/test'

// Infra smoke + first unauthenticated flow: the app boots, the backend is
// reachable through the Vite proxy, and the login screen renders its form.
test('login screen renders with a password field', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('input[type="password"]')).toBeVisible()
})

test('login world is same-origin and honors reduced motion', async ({ page }) => {
  const remote = [] as string[]
  page.on('request', (request) => {
    const url = request.url()
    if (/atlas|admin0|geojson/i.test(url)) remote.push(url)
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/login')
  await expect(page.locator('input[type="password"]')).toBeVisible()
  await expect(page.locator('.login-star')).toHaveCount(16)
  await expect(page.locator('canvas').first()).toBeAttached()
  expect(remote).toEqual([])
})
