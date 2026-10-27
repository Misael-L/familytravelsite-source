import { expect, test } from '@playwright/test'
import {
  DAYS_TRIP_ID,
  emptyTransportLog,
  installTransportDetailFixture,
} from './transport-detail.fixture'

test('transport details keep edit, delete, picker, and costs focus', async ({ page }) => {
  const log = emptyTransportLog()
  await installTransportDetailFixture({ page, member: 'direct', log })
  await page.goto(`/trips/${DAYS_TRIP_ID}`)
  await page.getByRole('button', { name: 'Transports', exact: true }).click()
  const title = page.getByRole('button', { name: 'Night bus', exact: true })
  await title.click()
  const detail = page.getByRole('dialog', { name: 'Night bus', exact: true })
  await expect(detail).toBeVisible()
  await detail.getByRole('button', { name: 'Edit', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Edit transport', exact: true })
  await expect(editor).toBeVisible()

  const status = editor.getByRole('button', { name: 'Pending', exact: true })
  await status.click()
  await expect(page.getByRole('button', { name: 'Confirmed', exact: true })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect.poll(() => page.evaluate(() => {
    const active = document.activeElement
    const dialog = document.querySelector('[role="dialog"]')
    return !!active && !!dialog && !dialog.contains(active)
  })).toBe(true)
  await page.keyboard.press('Shift+Tab')
  await expect.poll(() => page.evaluate(() => {
    const active = document.activeElement
    const dialog = document.querySelector('[role="dialog"]')
    return !!active && !!dialog && !dialog.contains(active)
  })).toBe(true)
  await page.keyboard.press('Escape')
  await expect(editor).toBeVisible()
  await expect(status).toBeFocused()
  await expect(status).toHaveAttribute('aria-expanded', 'false')

  await status.click()
  await page.locator('.trek-modal-backdrop').click({ position: { x: 8, y: 8 } })
  await expect(editor).toBeVisible()
  await expect(status).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('Escape')
  await expect(editor).toBeHidden()
  await expect(title).toBeFocused()

  await title.click()
  await detail.getByRole('button', { name: 'Delete', exact: true }).click()
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true })
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(title).toBeFocused()

  await title.click()
  await detail.getByRole('button', { name: 'Edit', exact: true }).click()
  await editor.getByRole('button', { name: 'Create expense', exact: true }).click()
  await expect(editor).toBeHidden()
  await expect(page.getByRole('button', { name: 'Night bus', exact: true })).toHaveCount(0)
  await expect(page.getByPlaceholder('e.g. Dinner, souvenirs, gas…')).toHaveValue('Night bus')
  expect(log.unexpected).toEqual([])
})
