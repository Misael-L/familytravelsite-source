import { expect, test } from '@playwright/test';
import {
  DAYS_TRIP_ID,
  emptyTransportLog,
  installTransportDetailFixture,
  installWeatherFixture,
} from './fullFrontend.fixture';

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('physical placement', () => {
  test.describe.configure({ timeout: 90_000 });

  for (const dir of ['ltr', 'rtl'] as const) {
    test(`sliding indicator tracks the active tab after scroll in ${dir}`, async ({ page }) => {
      const log = emptyTransportLog();
      await installTransportDetailFixture({ page, member: 'direct', log });
      await installWeatherFixture(page);
      await page.goto(`/trips/${DAYS_TRIP_ID}`);
      const tab = page.getByRole('button', { name: 'Transports', exact: true }).first();
      await expect(tab).toBeVisible({ timeout: 15000 });
      await page.evaluate((next) => {
        document.documentElement.dir = next;
      }, dir);
      const strip = tab.locator('..');
      await strip.evaluate((node) => {
        const el = node as HTMLElement;
        el.style.maxWidth = '200px';
        el.style.overflowX = 'auto';
        el.scrollLeft = getComputedStyle(el).direction === 'rtl' ? -120 : 120;
      });
      await tab.click();
      await expect.poll(() => indicatorAligned(page, 'Transports')).toBe(true);
      await page.getByRole('button', { name: 'Plan', exact: true }).first().click();
      await expect.poll(() => indicatorAligned(page, 'Plan')).toBe(true);
      expect(log.unexpected).toEqual([]);
    });

    test(`context menu stays inside the viewport in ${dir}`, async ({ page }) => {
      const log = emptyTransportLog();
      await installTransportDetailFixture({ page, member: 'direct', log });
      await installWeatherFixture(page);
      await page.goto(`/trips/${DAYS_TRIP_ID}`);
      const place = page.getByText('City museum', { exact: true }).first();
      await expect(place).toBeVisible({ timeout: 15000 });
      await page.evaluate((next) => {
        document.documentElement.dir = next;
      }, dir);
      await place.evaluate((node) => {
        node.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: window.innerWidth - 2,
            clientY: window.innerHeight - 4,
            view: window,
          })
        );
      });
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      const fit = await menu.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: window.innerWidth,
          height: window.innerHeight,
        };
      });
      expect(fit.left).toBeGreaterThanOrEqual(0);
      expect(fit.top).toBeGreaterThanOrEqual(0);
      expect(fit.right).toBeLessThanOrEqual(fit.width + 1);
      expect(fit.bottom).toBeLessThanOrEqual(fit.height + 1);
      expect(fit.right).toBeGreaterThanOrEqual(fit.width - 16);
      expect(fit.bottom).toBeGreaterThanOrEqual(fit.height - 16);
      expect(log.unexpected).toEqual([]);
    });
  }
});

async function indicatorAligned(page: import('@playwright/test').Page, name: string): Promise<boolean> {
  const tab = page.getByRole('button', { name, exact: true }).first();
  const indicator = await tab.locator('..').locator(':scope > div[aria-hidden]').boundingBox();
  const target = await tab.boundingBox();
  return (
    !!indicator && !!target && Math.abs(indicator.x - target.x) < 3 && Math.abs(indicator.width - target.width) < 3
  );
}
