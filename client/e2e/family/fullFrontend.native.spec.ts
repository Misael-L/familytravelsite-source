import { expect, test } from '@playwright/test';
import {
  DAYS_TRIP_ID,
  emptyTransportLog,
  installTransportDetailFixture,
  installWeatherFixture,
} from './fullFrontend.fixture';

for (const phone of [false, true]) {
  test(`native TREK ${phone ? 'phone' : 'desktop'} planner stays native with the Family backend`, async ({ page }) => {
    await page.setViewportSize(phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    const log = emptyTransportLog();
    const errors: string[] = [];
    const transforms: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.includes('/render/image/')) transforms.push(request.url());
    });
    await installTransportDetailFixture({ page, member: 'direct', log });
    await installWeatherFixture(page);
    await page.goto(`/trips/${DAYS_TRIP_ID}`);
    if (phone) {
      await expect(page.getByRole('button', { name: 'Map view' })).toBeVisible({ timeout: 20000 });
      await page.getByRole('button', { name: 'Map view' }).click();
    }
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Published', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'My draft', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open map actions', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Show Family Catalog picks', exact: true })).toHaveCount(0);
    // This Family backend advertises no Roadtrip or Tours capability. Native
    // add-on gates apply; restoring presentation must not invent a backend.
    await expect(page.getByRole('tab', { name: 'Road trip', exact: true })).toHaveCount(0);
    if (phone) {
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Itinerary layer', exact: true })).toHaveCount(0);
      await page.keyboard.press('Escape');
    } else {
      await expect(page.getByRole('button', { name: 'Add Place/Activity', exact: true })).toBeVisible();
    }
    expect(errors.filter((line) => !/migrate function|DexieError|DatabaseClosedError/.test(line))).toEqual([]);
    expect(transforms).toEqual([]);
    expect(log.unexpected).toEqual([]);
    expect(log.writes).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __adapterErrors: unknown[] }).__adapterErrors)).toEqual(
      []
    );
    await page.screenshot({ path: test.info().outputPath('native-family-planner.png'), fullPage: true });
  });
}
