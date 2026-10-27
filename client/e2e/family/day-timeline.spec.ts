import { expect, test } from '@playwright/test'
import {
  DAYS_TRIP_ID,
  emptyTransportLog,
  installTransportDetailFixture,
} from './day-timeline.fixture'

test('days timeline keeps mixed order and detail focus', async ({ page }) => {
  const log = emptyTransportLog()
  await installTransportDetailFixture({ page, member: 'direct', log })
  await page.goto(`/trips/${DAYS_TRIP_ID}`)
  await expect(page.getByText('Zócalo walk', { exact: true })).toBeVisible()
  const flight = page.getByRole('button', { name: /Night flight/ })
  await expect(flight).toBeVisible()
  const moveUp = page.getByText('Zócalo walk', { exact: true }).locator('xpath=..').getByRole('button', { name: 'Move up' })
  await expect(moveUp).toBeDisabled()
  await flight.click()
  const detail = page.getByRole('dialog', { name: /Night flight/ })
  await detail.getByRole('button', { name: 'Edit', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Edit transport' })
  await expect(editor).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(flight).toBeFocused()

  const hotel = page.getByRole('button', { name: /Villa Erba/ })
  await hotel.click()
  const hotelDetail = page.getByRole('dialog', { name: 'Villa Erba' })
  await hotelDetail.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(hotel).toBeFocused()

  await flight.click()
  await detail.getByRole('button', { name: 'Edit', exact: true }).click()
  await editor.getByRole('button', { name: 'Create expense', exact: true }).click()
  await expect(editor).toBeHidden()
  await expect(page.getByText('What was it for?')).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const active = document.activeElement
    return active instanceof HTMLButtonElement && active.innerText.includes('Night flight')
  })).toBe(false)
  expect(log.unexpected).toEqual([])
})
