import { expect, test } from '@playwright/test'
import {
  DAYS_TRIP_ID,
  emptyDaysLog,
  installFamilyDaysFixture,
} from './booking-dialog.fixture'

test('details edit and delete return focus to the booking title', async ({ page }) => {
  const log = emptyDaysLog()
  await installFamilyDaysFixture({ page, member: 'direct', log })
  await page.goto(`/trips/${DAYS_TRIP_ID}`)
  await page.getByRole('button', { name: 'Book', exact: true }).click()
  const title = page.getByRole('button', { name: 'Villa Erba', exact: true })
  await title.click()
  const detail = page.getByRole('dialog', { name: 'Villa Erba', exact: true })
  await expect(detail).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(detail).toBeHidden()
  await expect(title).toBeFocused()

  await title.click()
  await detail.getByRole('button', { name: 'Edit', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Edit Reservation', exact: true })
  await expect(editor).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(editor).toBeHidden()
  await expect(title).toBeFocused()

  await title.click()
  await detail.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(detail).toBeHidden()
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true })
  await expect(cancel).toBeFocused()
  await cancel.click()
  await expect(title).toBeFocused()
  expect(log.unexpected).toEqual([])
})
