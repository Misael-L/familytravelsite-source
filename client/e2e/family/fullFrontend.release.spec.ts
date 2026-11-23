import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import {
  DAYS_TRIP_ID,
  emptyTransportLog,
  installTransportDetailFixture,
  installWeatherFixture,
} from './fullFrontend.fixture';

const SOURCE = 'https://github.com/Misael-L/familytravelsite-source';

test('a recovery session without a token waits, then accepts a new password', async ({ page }) => {
  test.setTimeout(90_000);
  const log = emptyTransportLog();
  await installTransportDetailFixture({ page, member: 'direct', log, holdRecovery: true });
  await page.goto('/reset-password');
  await expect(page.getByTestId('reset-password-pending')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Invalid reset link' })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('family-recovery-release')));
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
  await page.locator('input[type="password"]').nth(0).fill('Longenough1!');
  await page.locator('input[type="password"]').nth(1).fill('Longenough1!');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();
  expect(log.unexpected).toEqual([]);
});

test('a missing recovery session shows the invalid link and does not submit', async ({ page }) => {
  const log = emptyTransportLog();
  await installTransportDetailFixture({ page, member: 'direct', log, session: false });
  await page.goto('/reset-password');
  await expect(page.getByRole('heading', { name: 'Invalid reset link' })).toBeVisible();
  await expect(page.getByLabel('New password')).toHaveCount(0);
});

test('a rejected password update stays on the form', async ({ page }) => {
  const log = emptyTransportLog();
  await installTransportDetailFixture({ page, member: 'direct', log });
  await page.goto('/reset-password');
  await page.locator('input[type="password"]').nth(0).fill('Reject-this-1');
  await page.locator('input[type="password"]').nth(1).fill('Reject-this-1');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByText('Could not update the password.')).toBeVisible();
  await expect(page.getByText('too_short')).toHaveCount(0);
  expect(log.unexpected).toEqual([]);
});

test('Family integrations stay closed and the published plan exports without Nest GPX', async ({ page }) => {
  test.setTimeout(120_000);
  const log = emptyTransportLog();
  await installTransportDetailFixture({ page, member: 'direct', log });
  await installWeatherFixture(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
  await expect(page.getByText('This setting uses the legacy TREK server')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create key' })).toHaveCount(0);
  expect(log.unexpected.join('\n')).not.toContain('/auth/api-tokens');

  await page.goto(`/trips/${DAYS_TRIP_ID}`);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('button', { name: /My plan as PDF/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Whole trip/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Places only/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Days as routes/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Subscribe to calendar' })).toHaveCount(0);

  await page.getByRole('button', { name: /^PDF/ }).click();
  const frame = page.locator('#family-pdf-preview-overlay iframe');
  await expect(frame).toBeVisible();
  await expect.poll(async () => frame.getAttribute('srcdoc')).toContain('City museum');
  await page.locator('#family-pdf-close-btn').click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Download .ics' }).click();
  const download = await downloadPromise;
  const calendar = fs.readFileSync(await download.path(), 'utf8');
  expect(calendar).toContain('BEGIN:VEVENT');
  expect(calendar).toContain('Museum hour');
  expect(calendar).toContain('DTSTART:20261201T180000Z');
  expect(log.unexpected.join('\n')).not.toMatch(/export\.gpx|export\.ics/);
});

test('the dashboard calendar button uses the Family feed', async ({ page }) => {
  const log = emptyTransportLog();
  await installTransportDetailFixture({ page, member: 'direct', log });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Subscribe to all trips' }).click();
  await expect(page.getByRole('dialog', { name: 'Subscribe to all trips' })).toBeVisible();
  await expect.poll(() => log.rpcCalls.map((call) => call.name)).toContain('manage-calendar-feed');
  expect(log.unexpected).toEqual([]);
});

test('a failed schedule read does not export the published plan', async ({ page }) => {
  const log = emptyTransportLog();
  await installTransportDetailFixture({ page, member: 'direct', log, failScheduleItems: true });
  await installWeatherFixture(page);
  await page.goto(`/trips/${DAYS_TRIP_ID}`);
  await expect(page.getByText('Could not load part of this trip').first()).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: /^PDF/ }).click();
  await expect(page.locator('#family-pdf-preview-overlay')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: /^PDF/ })).toBeEnabled();
  await page.getByRole('button', { name: 'Download .ics' }).click();
  await expect(page.locator('#family-pdf-preview-overlay')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download .ics' })).toBeEnabled();
  expect(log.unexpected.join('\n')).not.toMatch(/export\.gpx|export\.ics/);
});

test('the public login page links to the corresponding source', async ({ page }) => {
  const log = emptyTransportLog();
  await installTransportDetailFixture({ page, member: 'direct', log, session: false });
  await page.goto('/login');
  await expect(page.locator(`a[href="${SOURCE}"]`)).toHaveCount(1);
});
