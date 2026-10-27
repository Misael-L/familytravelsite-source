import { expect, test } from '@playwright/test'
import {
  DAYS_TRIP_ID,
  emptyDaysLog,
  installFamilyDaysFixture,
} from './booking-dialog.fixture'

test('booking editor keeps focus, pickers, and the discard question inside the dialog', async ({ page }) => {
  const log = emptyDaysLog()
  await installFamilyDaysFixture({ page, member: 'direct', log })
  await page.goto(`/trips/${DAYS_TRIP_ID}`)
  await page.getByRole('button', { name: 'Book', exact: true }).click()
  await page.getByRole('button', { name: 'Manual Booking' }).click()

  const dialog = page.getByRole('dialog', { name: 'New Reservation' })
  await expect(dialog).toBeVisible()
  const title = dialog.getByRole('textbox', { name: /title/i })
  await title.fill('Harbor stay')
  const close = dialog.getByRole('button', { name: 'Close' })
  const add = dialog.getByRole('button', { name: 'Add' })
  await close.focus()
  await page.keyboard.press('Shift+Tab')
  await expect(add).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null)).toBe(true)

  await dialog.getByRole('button', { name: 'Restaurant' }).click()
  const dateTrigger = dialog.getByRole('button', { name: 'Date' }).first()
  await dateTrigger.click()
  const picker = page.getByRole('dialog', { name: 'Date picker' })
  await expect(picker).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(picker).toBeHidden()
  await expect(dateTrigger).toBeFocused()
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Escape')
  const question = page.getByRole('alertdialog', { name: 'Discard Changes' })
  await expect(question).toBeVisible()
  await expect(question.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(question.getByRole('button', { name: 'Discard' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(question.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await question.getByRole('button', { name: 'Cancel' }).click()
  await expect(question).toBeHidden()
  await expect(title).toHaveValue('Harbor stay')

  await dateTrigger.click()
  await expect(picker).toBeVisible()
  const backdrop = dialog.locator('xpath=..')
  await backdrop.click({ position: { x: 8, y: 8 } })
  await expect(picker).toBeHidden()
  await expect(dialog).toBeVisible()
  await expect(title).toHaveValue('Harbor stay')

  expect(log.unexpected).toEqual([])
})

test('manual date entry cancels on Escape and survives Close', async ({ page }) => {
  const log = emptyDaysLog()
  await installFamilyDaysFixture({ page, member: 'direct', log })
  await page.route('**/rest/v1/trip_reservations*', async route => {
    if (route.request().method() !== 'GET') {
      await route.abort()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: '33333333-3333-4333-8333-333333333333',
        trip_id: DAYS_TRIP_ID,
        type: 'restaurant',
        status: 'pending',
        title: 'Harbor lunch',
        start_trip_day_id: null,
        end_trip_day_id: null,
        starts_at: null,
        ends_at: null,
        confirmation_code: null,
        notes: null,
        url: null,
        place_id: null,
        hotel_id: null,
        schedule_item_id: null,
        metadata: {},
        sort_order: 0,
        created_at: '2026-08-20T00:00:00.000Z',
      }]),
    })
  })
  await page.goto(`/trips/${DAYS_TRIP_ID}`)
  await page.getByRole('button', { name: 'Book', exact: true }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Edit Reservation' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'Enter date manually', exact: true }).first().click()
  const manual = dialog.getByRole('textbox', { name: 'Enter date manually' })
  await manual.fill('12.12.2026')
  await manual.press('Escape')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(manual).toBeHidden()
  await expect(dialog.getByRole('button', { name: 'Date', exact: true })).toHaveCount(2)
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'Enter date manually', exact: true }).first().click()
  await dialog.getByRole('textbox', { name: 'Enter date manually' }).fill('12.')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  const question = page.getByRole('alertdialog', { name: 'Discard Changes' })
  await expect(question).toBeVisible()
  await question.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog.getByRole('textbox', { name: 'Enter date manually' })).toHaveValue('12.')
  await expect(dialog).toBeVisible()

  await dialog.locator('xpath=..').click({ position: { x: 12, y: 12 } })
  const backdropQuestion = page.getByRole('alertdialog', { name: 'Discard Changes' })
  await expect(backdropQuestion).toBeVisible()
  await backdropQuestion.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog.getByRole('textbox', { name: 'Enter date manually' })).toHaveValue('12.')

  await dialog.getByRole('textbox', { name: 'Enter date manually' }).press('Escape')
  await dialog.getByRole('button', { name: 'Enter date manually', exact: true }).first().click()
  await dialog.getByRole('textbox', { name: 'Enter date manually' }).fill('2026-12-12')
  await dialog.getByRole('textbox', { name: /title/i }).click()
  await expect(dialog.getByRole('textbox', { name: 'Enter date manually' })).toBeHidden()
  await expect(dialog.getByRole('button', { name: 'Date', exact: true })).toHaveCount(1)
  expect(log.unexpected).toEqual([])
})
