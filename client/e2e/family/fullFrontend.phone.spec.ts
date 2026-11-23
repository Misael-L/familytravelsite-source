import { expect, test } from '@playwright/test';
import {
  DAYS_TRIP_ID,
  emptyTransportLog,
  installTransportDetailFixture,
  installWeatherFixture,
} from './fullFrontend.fixture';

test.use({ viewport: { width: 390, height: 844 } });

test('phone native trip route keeps retry and Costs without legacy Family controls', async ({ page }) => {
  const log = emptyTransportLog();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installTransportDetailFixture({ page, member: 'direct', log, failBookingReads: 2 });
  await installWeatherFixture(page);
  await page.goto(`/trips/${DAYS_TRIP_ID}`);

  const back = page.getByRole('button', { name: /back/i }).first();
  const more = page.getByRole('button', { name: 'More' });
  await expect(back).toBeVisible({ timeout: 20000 });
  await expect(more).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Days', exact: true })).toHaveCount(0);

  const retry = page.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.getByRole('button', { name: 'Map view' }).click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open map actions' })).toHaveCount(0);
  await more.click();
  await expect(page.getByRole('button', { name: 'Itinerary layer' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  const expensesBefore = log.reads.filter((row) => row.includes('/trip_expenses')).length;
  await page.getByRole('button', { name: 'Costs' }).click();
  await expect
    .poll(() => log.reads.filter((row) => row.includes('/trip_expenses')).length)
    .toBeGreaterThan(expensesBefore);
  await page.getByRole('button', { name: 'Plan' }).click();
  await expect(page.getByRole('button', { name: 'List view' })).toBeVisible();
  await expect(back).toBeVisible();

  expect(errors.filter((line) => !/DexieError|DatabaseClosedError/.test(line))).toEqual([]);
  expect(log.unexpected).toEqual([]);
});
