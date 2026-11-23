import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import {
  DAYS_TRIP_ID,
  emptyTransportLog,
  installTransportDetailFixture,
  installWeatherFixture,
} from './fullFrontend.fixture';
test('the native TREK planner loads with the Family backend and native map', async ({ page }) => {
  const log = emptyTransportLog();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await installTransportDetailFixture({ page, member: 'direct', log });
  await installWeatherFixture(page);
  await page.goto(`/trips/${DAYS_TRIP_ID}`);
  await expect(page.locator('.leaflet-container'))
    .toBeVisible({ timeout: 20000 })
    .catch(async (e) => {
      fs.writeFileSync(test.info().outputPath('diagnostics.json'), JSON.stringify({ errors, log }, null, 2));
      throw e;
    });
  await expect(page.getByRole('button', { name: 'Add Place/Activity', exact: true })).toBeVisible();
  for (const name of ['Transports', 'Bookings', 'Lists', 'Costs', 'Files', 'Plan']) {
    await page.getByRole('button', { name, exact: true }).first().click();
    await page.waitForTimeout(300);
  }

  await expect(page.locator('.leaflet-container')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('actual-planner.png'), fullPage: true });
  fs.writeFileSync(test.info().outputPath('tabs-diagnostics.json'), JSON.stringify({ errors, log }, null, 2));
  expect(errors.filter((line) => line.trim() && !/migrate function|DatabaseClosedError|DexieError/.test(line))).toEqual(
    []
  );
  expect(log.unexpected).toEqual([]);
  expect(await page.evaluate(() => (window as any).__adapterErrors)).toEqual([]);
});

test('copied hub, settings, notifications, Collections and Atlas load through Family connections', async ({ page }) => {
  test.setTimeout(180_000);
  const log = emptyTransportLog(),
    errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installTransportDetailFixture({ page, member: 'direct', log });
  await installWeatherFixture(page);
  for (const path of ['/dashboard', '/settings', '/notifications', '/collections', '/atlas']) {
    await page.goto(path);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    await page.waitForTimeout(600);
    const failures = await page.evaluate(() => (window as any).__adapterErrors);
    expect(failures, `Backend connections on ${path}`).toEqual([]);
    if (path === '/atlas') {
      await expect(page.locator('[data-atlas-bound]')).toBeVisible();
      await expect(page.getByText('12', { exact: true }).filter({ visible: true }).first()).toBeVisible();
      await expect
        .poll(
          async () =>
            page.evaluate(() => {
              const el = document.querySelector('[data-atlas-bound]') as
                (HTMLElement & { __atlasMap?: { eachLayer: (fn: (layer: AtlasLayer) => void) => void } }) | null;
              const map =
                el?.__atlasMap ??
                (window as unknown as { __atlasMap?: { eachLayer: (fn: (layer: AtlasLayer) => void) => void } })
                  .__atlasMap;
              type AtlasLayer = {
                feature?: { properties?: Record<string, string>; geometry?: { coordinates?: unknown } };
                options?: { fillColor?: string; fillOpacity?: number };
                eachLayer?: (fn: (layer: AtlasLayer) => void) => void;
              };
              if (!map)
                return {
                  bound: el?.dataset.atlasBound ?? '',
                  features: Number(el?.dataset.atlasFeatures ?? 0),
                  visited: el?.dataset.atlasVisited ?? '',
                  mexicoLarge: false,
                  mexico: null,
                  other: null,
                };
              const found: {
                mexico: { fill: string; opacity: number; size: number } | null;
                other: { fill: string; opacity: number; size: number } | null;
              } = { mexico: null, other: null };
              const take = (layer: AtlasLayer) => {
                layer.eachLayer?.(take);
                const code = layer.feature?.properties?.ISO_A2;
                const coordinates = layer.feature?.geometry?.coordinates;
                if (!code || code === '-99' || !coordinates) return;
                const row = {
                  fill: String(layer.options?.fillColor ?? ''),
                  opacity: Number(layer.options?.fillOpacity),
                  size: JSON.stringify(coordinates).length,
                };
                if (code === 'MX') found.mexico = row;
                else if (!found.other && row.size > 100) found.other = row;
              };
              map.eachLayer(take);
              return {
                bound: el?.dataset.atlasBound ?? '',
                features: Number(el?.dataset.atlasFeatures ?? 0),
                visited: el?.dataset.atlasVisited ?? '',
                mexicoLarge: (found.mexico?.size ?? 0) > 100,
                ...found,
              };
            }),
          { timeout: 30_000 }
        )
        .toEqual(
          expect.objectContaining({
            mexico: expect.objectContaining({ opacity: 0.7 }),
            other: expect.objectContaining({ opacity: 0.3, fill: '#e2e8f0' }),
            mexicoLarge: true,
            visited: expect.stringContaining('MEX'),
          })
        );
    }
  }
  expect(errors.filter((line) => line.trim() && !/migrate function|DatabaseClosedError|DexieError/.test(line))).toEqual(
    []
  );
  expect(log.unexpected).toEqual([]);
});
