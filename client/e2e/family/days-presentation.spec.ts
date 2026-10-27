import { expect, test, type Page } from '@playwright/test'
import {
  DAYS_ITEM_A,
  DAYS_ITEM_B,
  DAYS_TRIP_ID,
  emptyDaysLog,
  installFamilyDaysFixture,
  isDraftRemovePayload,
  type DaysRequestLog,
} from './days-presentation.fixture'

async function renderedTheme(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('trek_appearance')
    const snap = raw ? JSON.parse(raw) as { darkMode?: unknown } : {}
    return {
      dark: document.documentElement.classList.contains('dark'),
      className: document.documentElement.className,
      darkMode: snap.darkMode ?? null,
    }
  })
}

async function settleAnimations(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('trek-theme-transitioning'))).toBe(false)
  await page.evaluate(async () => {
    const pending = document.getAnimations().filter(animation => animation.playState !== 'finished')
    await Promise.all(pending.map(animation => animation.finished.catch(() => undefined)))
  })
}

async function chooseDark(page: Page, projectName: string) {
  const navToggle = page.getByRole('button', { name: 'Dark Mode' })
  if (!(await navToggle.isVisible())) {
    await page.setViewportSize({ width: 768, height: 1024 })
    await expect(navToggle).toBeVisible()
  }
  await navToggle.click()
  if (projectName.startsWith('phone')) {
    await page.setViewportSize({ width: 390, height: 844 })
  }
}

async function openTrip(log: DaysRequestLog, page: Page, projectName: string, member: 'direct' | 'draft') {
  await installFamilyDaysFixture({ page, member, log })
  await page.goto(`/trips/${DAYS_TRIP_ID}`)
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).filter({ visible: true }).first()).toBeVisible()
  const wantDark = projectName.endsWith('-dark')
  if (wantDark) await chooseDark(page, projectName)
  await expect.poll(() => renderedTheme(page)).toMatchObject(
    wantDark
      ? { dark: true, darkMode: 'dark' }
      : { dark: false, darkMode: false },
  )
  if (projectName.startsWith('phone')) {
    await page.getByRole('button', { name: 'Plan', exact: true }).click()
  }
  await expect(page.getByText('Harbor morning').filter({ visible: true })).toBeVisible()
  await settleAnimations(page)
}

test('shows the Family day on the Supabase planner', async ({ page }, testInfo) => {
  const log = emptyDaysLog()
  await openTrip(log, page, testInfo.project.name, 'direct')
  await expect(page.getByText('Published').filter({ visible: true })).toBeVisible()
  await expect(page.getByText('My draft').filter({ visible: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('days-rail.png') })
  expect(log.unexpected, log.unexpected.join('\n')).toEqual([])
  expect(log.writes, log.writes.join('\n')).toEqual([])
  expect(log.rpcCalls.filter(call => call.name === 'upsert_trip_change_draft_op')).toEqual([])
})

test('a draft title and remove do not write published rows', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'one draft interaction is enough')
  const log = emptyDaysLog()
  await openTrip(log, page, testInfo.project.name, 'draft')
  await page.getByRole('button', { name: 'My draft' }).click()
  await page.getByRole('button', { name: 'Edit' }).click()
  const title = page.getByRole('textbox', { name: 'Edit' })
  await title.fill('Draft title')
  await title.press('Enter')
  await expect(page.getByText(/Only the family head/i)).toBeVisible()
  await page.getByRole('button', { name: 'Delete' }).first().click()
  await page.getByRole('button', { name: 'Delete' }).filter({ hasText: 'Delete' }).click()
  await expect(page.getByText(/Staged removal/i)).toBeVisible()
  expect(log.unexpected, log.unexpected.join('\n')).toEqual([])
  expect(log.writes, log.writes.join('\n')).toEqual([])
  const removals = log.rpcCalls.filter(call => call.name === 'upsert_trip_change_draft_op')
  expect(removals).toHaveLength(1)
  expect(isDraftRemovePayload(removals[0].body)).toBe(true)
  const body = removals[0].body as { p_target_id: string }
  expect([DAYS_ITEM_A, DAYS_ITEM_B]).toContain(body.p_target_id)
})
