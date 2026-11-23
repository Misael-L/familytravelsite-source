// Actual native desktop/phone screens; SDK and raster bytes are synthetic and local.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { log } from 'node:console';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
const require = createRequire(new URL('../../../package.json', import.meta.url));
const { chromium } = require('playwright');
const { expect } = require('@playwright/test');
const { createServer } = await import(require.resolve('vite'));
const root = fileURLToPath(new URL('../../..', import.meta.url));
const output = process.env.P04AT_OUTPUT;
if (!output) throw new Error('Set P04AT_OUTPUT to a local evidence folder');
await mkdir(output, { recursive: true });
const { rtlTextAlias, plyrSpriteAlias } = await import('../../../rtlTextAlias.js');
const server = await createServer({
  configFile: false,
  root,
  envDir: output,
  cacheDir: path.join(output, 'vite-cache'),
  define: { __TREK_UI_VERSION__: JSON.stringify('5.0.1-local-rehearsal') },
  esbuild: { jsx: 'automatic' },
  resolve: { alias: [rtlTextAlias, plyrSpriteAlias] },
  optimizeDeps: {
    entries: ['tests/browser/planner-boundary/index.html'],
    noDiscovery: false,
    include: [
      'dexie',
      'axios',
      'zod',
      'zustand',
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      'react-router',
      'use-sync-external-store/shim/with-selector.js',
      'zustand/traditional',
    ],
  },
  plugins: [
    {
      name: 'synthetic-sdk-only',
      enforce: 'pre',
      load(id) {
        if (/\/(?:legacy\/data\/supabase|family-backend\/(?:src|dist)\/data\/supabase)\/client\.(?:ts|js)$/.test(id))
          return 'export const getSupabaseBrowserClient = () => globalThis.p04asSdk;';
        if (/\/legacy\/data\/supabase\/env\.ts$/.test(id))
          return 'export const getSupabaseUrl = () => location.origin; export const getSupabaseAnonKey = () => "synthetic-not-a-key"; export const hasSupabaseEnv = () => true; export const getDataPlane = () => "supabase"; export const getMapboxAccessToken = () => undefined;';
      },
    },
  ],
  server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [path.resolve(root, '..')] } },
});
const results = [],
  outside = [],
  transforms = [],
  errors = [],
  assets = [],
  syntheticProviders = [];
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  for (const phone of [false, true]) {
    const context = await browser.newContext({
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: phone,
      hasTouch: phone,
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
        // A generated solid raster is sufficient to prove decoding. Not a production photo.
        const body = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1Z8AAAAASUVORK5CYII=',
          'base64'
        );
        await route.fulfill({ status: 200, contentType: 'image/png', body });
        return;
      }
      await route.continue();
    });
    try {
      await page.goto(`${origin}/tests/browser/planner-boundary/index.html${phone ? '?phone' : ''}`);
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
      const pictures = await page
        .locator('img')
        .evaluateAll((imgs) =>
          imgs
            .filter((i) => i.currentSrc.includes('/catalog/variants/v1/'))
            .map((i) => ({ url: i.currentSrc, decoded: i.complete && i.naturalWidth > 0 }))
        );
      assert.ok(pictures.length > 0 && pictures.every((p) => p.decoded));
      await page.screenshot({ path: path.join(output, `${phone ? 'phone' : 'desktop'}-timeline.png`), fullPage: true });
      if (phone) {
        await page.getByText('Fri 22', { exact: true }).click();
        await page.getByRole('button', { name: 'Places', exact: true }).click();
      }
      await page.getByText('El Born & Tapas', { exact: true }).last().click();
      if (phone) {
        await page.getByRole('button', { name: 'View details', exact: true }).click();
        await expect(page.getByText('Assigned Days', { exact: true })).toBeVisible();
      } else await expect(page.getByRole('heading', { name: 'El Born & Tapas', exact: true })).toBeVisible();
      await expect(page.getByText('Restaurant', { exact: true })).toBeVisible();
      await page.screenshot({
        path: path.join(output, `${phone ? 'phone' : 'desktop'}-inspector.png`),
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
              imgs.some((i) => i.complete && i.naturalWidth > 0 && i.currentSrc.includes('/hero-fixture.webp'))
            )
        )
        .toBe(true);
      await gallery.getByRole('button', { name: 'Close', exact: true }).click();
      if (phone) await page.locator('button[aria-label="Edit"]').click();
      else await page.getByRole('button', { name: 'Edit', exact: true }).click();
      const name = phone
        ? page.getByPlaceholder('e.g. Eiffel Tower', { exact: true })
        : page.getByRole('textbox', { name: 'Name *', exact: true });
      await expect(name).toBeVisible();
      await name.fill('P04at edited location');
      await page.getByRole('button', { name: phone ? 'Save' : 'Update', exact: true }).click();
      await expect.poll(() => page.evaluate(() => globalThis.fixture.saves.length)).toBe(1);
      await expect
        .poll(() =>
          page.evaluate(() => globalThis.fixture.model().places.some((p) => p.name === 'P04at edited location'))
        )
        .toBe(true);
      const saved = await page.evaluate(() => globalThis.fixture.saves[0]);
      assert.equal(saved.p_observation.revision, 1);
      assert.equal(saved.p_observation.layer, 'published');
      assert.equal(saved.p_form.name, 'P04at edited location');
      assert.match(saved.p_location_id, /^a0450000-/);
      await expect.poll(() => page.evaluate(() => globalThis.fixture.permission().allowed)).toBe(true);
      await page.evaluate(() => globalThis.fixture.draft());
      await expect.poll(() => page.evaluate(() => globalThis.fixture.permission().layer)).toBe('myDraft');
      await expect
        .poll(() =>
          page.evaluate(() => globalThis.fixture.model().places.some((p) => p.name === 'P04at edited location'))
        )
        .toBe(true);
      await expect.poll(() => page.evaluate(() => globalThis.fixture.permission().allowed)).toBe(true);

      const report = await page.evaluate(() => ({
        requests: globalThis.fixture.requests,
        rpc: globalThis.fixture.rpc,
        snapshots: globalThis.fixture.snapshots,
        unexpected: globalThis.fixture.unexpected,
        errors: globalThis.fixture.errors,
      }));
      await writeFile(
        path.join(output, `${phone ? 'phone' : 'desktop'}-model.json`),
        JSON.stringify(
          {
            initialModel: model,
            model: await page.evaluate(() => globalThis.fixture.model()),
            permission: await page.evaluate(() => globalThis.fixture.permission()),
            report,
            pageErrors,
            failed,
            consoleErrors,
          },
          null,
          2
        )
      );
      await page.screenshot({ path: path.join(output, `${phone ? 'phone' : 'desktop'}.png`), fullPage: true });
      await writeFile(
        path.join(output, `${phone ? 'phone' : 'desktop'}-text.txt`),
        await page.locator('body').innerText()
      );
      assert.deepEqual(pageErrors, []);
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
      await page.screenshot({ path: path.join(output, `${phone ? 'phone' : 'desktop'}-failure.png`), fullPage: true });
      await writeFile(
        path.join(output, `${phone ? 'phone' : 'desktop'}-failure.txt`),
        await page.locator('body').innerText()
      );
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
