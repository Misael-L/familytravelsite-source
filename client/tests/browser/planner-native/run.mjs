// Actual native desktop/phone screens; SDK and raster bytes are synthetic and local.
import assert from 'node:assert/strict';
import { log } from 'node:console';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
const require = createRequire(new URL('../../../package.json', import.meta.url));
const { chromium } = require('playwright');
const { expect } = require('@playwright/test');
const { serveProductionFixture, BROWSER_PROFILES, syntheticImage } = await import('../productionFixture.mjs');
const root = fileURLToPath(new URL('../../..', import.meta.url));
const output = process.env.P04AS_OUTPUT;
if (!output) throw new Error('Set P04AS_OUTPUT to a local evidence folder');
await mkdir(output, { recursive: true });
const server = await serveProductionFixture({ root, output });
const results = [],
  outside = [],
  transforms = [],
  errors = [],
  assets = [],
  syntheticProviders = [];
let browser;
try {
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  for (const profile of BROWSER_PROFILES) {
    const phone = profile.phone;
    const context = await browser.newContext({
      viewport: profile.viewport,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      serviceWorkers: 'block',
    });
    const page = await context.newPage(),
      pageErrors = [],
      failed = [],
      consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('requestfailed', (r) => failed.push({ url: r.url(), reason: r.failure()?.errorText }));
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/render/image/')) {
        transforms.push(url.href);
        await route.abort();
        return;
      }
      if (url.hostname === 'routing.openstreetmap.de' && url.pathname.startsWith('/routed-car/route/v1/driving/')) {
        syntheticProviders.push(url.href);
        const points = url.pathname
          .split('/')
          .pop()
          .split(';')
          .map((p) => p.split(',').map(Number));
        await route.fulfill({
          headers: { 'access-control-allow-origin': '*' },
          json: {
            code: 'Ok',
            routes: [
              {
                distance: 1000,
                duration: 600,
                geometry: { type: 'LineString', coordinates: points },
                legs: points.slice(1).map(() => ({ distance: 500, duration: 300, steps: [] })),
              },
            ],
            waypoints: points.map((p) => ({ location: p, name: 'Local synthetic route' })),
          },
        });
        return;
      }
      if (url.origin !== origin) {
        outside.push(url.href);
        await route.abort();
        return;
      }
      if (url.pathname.startsWith('/p04as-tiles/') || url.pathname.startsWith('/storage/v1/object/public/catalog/')) {
        assets.push(url.pathname);
        await route.fulfill(await syntheticImage(url.pathname));
        return;
      }
      await route.continue();
    });
    try {
      await page.goto(`${origin}/tests/browser/planner-native/index.html${phone ? '?phone' : ''}`);
      await page.waitForFunction(() => globalThis.fixture?.ready, { timeout: 45000 });
      await expect
        .poll(() => page.evaluate(() => globalThis.fixture.model().places.length), { timeout: 15000 })
        .toBe(8);
      await expect(page.getByText('Barceloneta Beach', { exact: true }).first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('El Born & Tapas', { exact: true }).first()).toBeVisible();
      assert.equal(await page.getByRole('button', { name: /^Road trip$/i }).count(), 0);
      assert.equal(await page.getByRole('button', { name: /^Tours$/i }).count(), 0);
      const model = await page.evaluate(() => globalThis.fixture.model());
      assert.equal(model.days.length, 4);
      assert.equal(Object.values(model.assignments).flat().length, 10);
      const repeated = Object.values(model.assignments)
        .flat()
        .filter((a) => a.place.name === 'El Born & Tapas');
      assert.equal(new Set(repeated.map((a) => a.id)).size, 2);
      assert.notEqual(repeated[0].day_id, repeated[1].day_id);
      assert.deepEqual(repeated.map((a) => a.notes).sort(), ['Dinner notes for day 1', 'Dinner notes for day 4']);
      const pictures = await page.locator('img').evaluateAll((imgs) =>
        imgs
          .filter((i) => i.currentSrc.includes('/catalog/variants/v1/'))
          .map((i) => ({
            url: i.currentSrc,
            decoded: i.complete && i.naturalWidth > 0,
            width: i.naturalWidth,
            height: i.naturalHeight,
          }))
      );
      assert.ok(pictures.length > 0 && pictures.every((p) => p.decoded));
      await page.screenshot({ path: path.join(output, `${profile.name}-timeline.png`), fullPage: true });
      await page.getByText('El Born & Tapas', { exact: true }).last().click();
      if (phone) await expect(page.getByText('Assigned Days', { exact: true })).toBeVisible();
      else await expect(page.getByRole('heading', { name: 'El Born & Tapas', exact: true })).toBeVisible();
      await expect(page.getByText('Restaurant', { exact: true })).toBeVisible();
      await page.screenshot({
        path: path.join(output, `${profile.name}-inspector.png`),
        fullPage: true,
      });
      await page.getByRole('button', { name: 'Show photos', exact: true }).click();
      const gallery = page.getByRole('dialog', { name: 'Show photos' });
      await expect(gallery).toBeVisible();
      await expect
        .poll(() =>
          gallery
            .locator('img')
            .evaluateAll((imgs) =>
              imgs.some(
                (i) =>
                  i.complete &&
                  i.naturalWidth === 1200 &&
                  i.naturalHeight === 800 &&
                  i.currentSrc.includes('/hero-fixture.webp')
              )
            )
        )
        .toBe(true);
      const galleryImages = await gallery.locator('img').evaluateAll((images) =>
        images.map((i) => ({
          url: i.currentSrc,
          width: i.naturalWidth,
          height: i.naturalHeight,
          decoded: i.complete,
        }))
      );
      const report = await page.evaluate(() => ({
        requests: globalThis.fixture.requests,
        rpc: globalThis.fixture.rpc,
        unexpected: globalThis.fixture.unexpected,
        errors: globalThis.fixture.errors,
      }));
      await writeFile(
        path.join(output, `${profile.name}-model.json`),
        JSON.stringify({ model, report, pageErrors, failed, consoleErrors, pictures, galleryImages }, null, 2)
      );
      await page.screenshot({ path: path.join(output, `${profile.name}.png`), fullPage: true });
      await writeFile(path.join(output, `${profile.name}-text.txt`), await page.locator('body').innerText());
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(failed, []);
      assert.deepEqual(report.unexpected, []);
      assert.deepEqual(report.errors, []);
      assert.ok(
        consoleErrors.every((msg) => msg.startsWith('Failed to load reservations: WriteSessionChanged:')),
        consoleErrors.join('\n')
      );
      assert.deepEqual(await page.evaluate(() => globalThis.fixture.queue()), []);
      results.push({
        name: phone ? 'native phone shell' : 'native desktop planner',
        passed: true,
        report,
        consoleErrors,
      });
    } catch (error) {
      errors.push({ phone, error: String(error), pageErrors, failed });
      await writeFile(
        path.join(output, `${profile.name}-diagnostics.json`),
        JSON.stringify(
          await page.evaluate(async () => ({
            ready: globalThis.fixture?.ready,
            requests: globalThis.fixture?.requests,
            rpc: globalThis.fixture?.rpc,
            unexpected: globalThis.fixture?.unexpected,
            errors: globalThis.fixture?.errors,
            model: globalThis.fixture?.model?.(),
            queue: await globalThis.fixture?.queue?.(),
          })),
          null,
          2
        )
      );
      await page.screenshot({ path: path.join(output, `${profile.name}-failure.png`), fullPage: true });
      await writeFile(path.join(output, `${profile.name}-failure.txt`), await page.locator('body').innerText());
    } finally {
      await context.close();
    }
  }
  await writeFile(
    path.join(output, 'browser-checks.json'),
    JSON.stringify(
      {
        passed: !errors.length && !outside.length && !transforms.length,
        cases: results,
        errors,
        external_requests: outside,
        transformation_attempts: transforms,
        synthetic_provider_requests: syntheticProviders,
        assets,
        browser: await browser.version(),
      },
      null,
      2
    )
  );
  log(JSON.stringify({ cases: results.length, errors, outside, transforms, output }));
  if (errors.length || outside.length || transforms.length) process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
