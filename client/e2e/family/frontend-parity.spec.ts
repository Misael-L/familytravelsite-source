import { test, expect } from '@playwright/test'
import { DAYS_TRIP_ID, DAYS_FAMILY_ID, emptyTransportLog, installTransportDetailFixture } from './day-timeline.fixture'

const cases: { name: string; width: number; height: number; count: number; dark: boolean; populated?: boolean }[] = [
  { name: 'desktop-populated-days', width: 1920, height: 960, count: 3, dark: false, populated: true },
  { name: 'phone-populated-days', width: 390, height: 844, count: 3, dark: false, populated: true },
  { name: 'desktop-one-day-light', width: 1920, height: 960, count: 1, dark: false },
  { name: 'desktop-15-days-light', width: 1920, height: 960, count: 15, dark: false },
  { name: 'desktop-15-days-dark', width: 1920, height: 960, count: 15, dark: true },
  { name: 'desktop-30-days-light', width: 1440, height: 900, count: 30, dark: false },
  { name: 'tablet-15-days-light', width: 768, height: 1024, count: 15, dark: false },
  { name: 'phone-15-days-light', width: 390, height: 844, count: 15, dark: false },
  { name: 'phone-15-days-dark', width: 390, height: 844, count: 15, dark: true },
]

for (const scenario of cases) test(scenario.name, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: scenario.width, height: scenario.height })
  const log = emptyTransportLog()
  await installTransportDetailFixture({ page, member: 'direct', log })
  await page.addInitScript(dark => localStorage.setItem('trek_appearance', JSON.stringify({ darkMode: dark ? 'dark' : false })), scenario.dark)
  const days = Array.from({ length: scenario.count }, (_, i) => ({
    id: `22222222-2222-4222-8222-${String(i + 1).padStart(12, '0')}`,
    trip_id: DAYS_TRIP_ID, civil_day: new Date(Date.UTC(2027, 3, i + 1)).toISOString().slice(0, 10),
    day_index: i + 1, title: null,
  }))
  const names = ['Guanajuato', 'Mérida', 'Ciudad De Mexico', 'Puebla', 'Cancún', 'Akumal', 'Guadalajara', 'Acapulco']
  const places = names.map((name, i) => {
    const id = `66666666-6666-4666-8666-${String(i + 1).padStart(12, '0')}`
    return { place_id: id, trip_id: DAYS_TRIP_ID, is_primary: false, family_place_category_id: null, family_place_categories: null,
      places: { id, name, latitude: 19 + i * .1, longitude: -99 - i * .1, notes: 'Fixture destination', time_zone: 'America/Mexico_City', country_id: null, place_type_id: null, cover_media: null } }
  })
  await page.route('http://127.0.0.1:5199/rest/v1/**', async route => {
    const request = route.request()
    const table = new URL(request.url()).pathname.split('/').pop()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    if (table === 'trip_days') return route.fulfill({ json: days })
    if (table === 'schedule_items' && scenario.populated) return route.fulfill({json: Array.from({length: 20}, (_, i) => ({
      id: `44444444-4444-4444-8444-${String(i + 1).padStart(12, '0')}`, trip_id: DAYS_TRIP_ID,
      activity: 'Visit ' + (i + 1), starts_at: days[0].civil_day + 'T' + String(8 + Math.floor(i / 2)).padStart(2, '0') + ':' + (i % 2 ? '30' : '00') + ':00.000Z',
      ends_at: null, address: null, time_zone: null, place_id: null, sort_order: i, experience_id: null, food_id: null, link_url: null,
    }))})
    if (['schedule_items', 'day_notes', 'trip_reservations'].includes(table || '')) return route.fulfill({ json: [] })
    if (table === 'trip_places') return route.fulfill({ json: places })
    if (table === 'trips') {
      const trip = { id: DAYS_TRIP_ID, family_id: DAYS_FAMILY_ID, name: 'Mexico', primary_country_id: null,
        start_at: days[0].civil_day + 'T00:00:00.000Z', end_at: days.at(-1)!.civil_day + 'T00:00:00.000Z',
        status: 'planning', cover_url: null, notes: null, occasion: null, reminder_days: 0, archived_at: null, currency_code: 'EUR' }
      return route.fulfill({ json: (request.headers().accept || '').includes('vnd.pgrst.object') ? trip : [trip] })
    }
    return route.fallback()
  })
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#d4dadc"/></svg>' }))
  await page.goto('/trips/' + DAYS_TRIP_ID)
  await expect(page.getByText('Day 1', { exact: true })).toBeAttached()
  if (scenario.dark) {
    if (scenario.width < 768) await page.setViewportSize({width: 768, height: 1024})
    await page.getByRole('button', {name: 'Dark Mode', exact: true}).click()
    if (scenario.width < 768) await page.setViewportSize({width: scenario.width, height: scenario.height})
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(scenario.dark)
  if (scenario.width < 768) await page.getByRole('button', { name: 'Plan', exact: true }).click()
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined)))
  })
  await page.screenshot({ path: testInfo.outputPath('workspace.png') })
  const metrics = await page.evaluate(() => {
    const box = (element: Element) => {
      const r = element.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }
    }
    const heads = Array.from(document.querySelectorAll('.dp-day-header')).filter(el => el.getBoundingClientRect().width > 0)
    const rows = heads.map(head => {
      const card = head.parentElement!
      const cardBox = box(card)
      const headBox = box(head)
      return { day: head.getAttribute('data-day-id'), card: cardBox, head: headBox,
        flexShrink: getComputedStyle(card).flexShrink, overflow: getComputedStyle(card).overflow,
        cardScrollHeight: card.scrollHeight,
        headClipped: headBox.bottom > cardBox.bottom + 1,
        controls: Array.from(head.querySelectorAll('button')).map(el => ({ label: el.getAttribute('aria-label'), box: box(el), clippedByCard: box(el).bottom > cardBox.bottom + 1 })) }
    })
    const scroll = heads[0]?.parentElement?.parentElement
    return { viewport: { width: innerWidth, height: innerHeight }, theme: document.documentElement.className,
      rows, headClippedCount: rows.filter(row => row.headClipped).length,
      scroll: scroll ? { clientHeight: scroll.clientHeight, scrollHeight: scroll.scrollHeight, flexDirection: getComputedStyle(scroll).flexDirection, display: getComputedStyle(scroll).display } : null,
      tabs: Array.from(document.querySelectorAll('[role=tab]')).map(el => el.textContent?.trim()),
      visibleButtons: Array.from(document.querySelectorAll('button')).filter(el => el.getBoundingClientRect().width > 0).map(el => el.getAttribute('aria-label') || el.textContent?.trim()),
    }
  })
  await testInfo.attach('layout-metrics', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' })
  expect(log.unexpected).toEqual([])
  expect(metrics.rows).toHaveLength(scenario.count)
  if (scenario.populated) expect(metrics.rows[0].card.height).toBeGreaterThanOrEqual(metrics.rows[0].cardScrollHeight)
  expect(metrics.rows.every(row => row.flexShrink === '0')).toBe(true)
  expect(metrics.rows.every(row => row.head.height === 52)).toBe(true)
  expect(metrics.headClippedCount, 'day headers must fit inside their cards').toBe(0)
  if (scenario.count > 1) expect(metrics.scroll!.scrollHeight).toBeGreaterThan(metrics.scroll!.clientHeight)
  const last = page.locator('.dp-day-header:visible').last()
  await last.scrollIntoViewIfNeeded()
  await expect(last).toBeInViewport()
  if (scenario.width >= 768) {
    await expect(page.getByRole('tab', {name: 'Days', exact: true})).toBeVisible()
    await expect(page.getByRole('tab', {name: 'Road trip', exact: true})).toBeDisabled()
    await expect(page.getByRole('tab', {name: 'Places', exact: true})).toBeVisible()
    await expect(page.getByRole('tab', {name: 'Tours', exact: true})).toBeDisabled()
    await expect(page.getByRole('button', {name: 'Export', exact: true})).toBeVisible()
  }
})
