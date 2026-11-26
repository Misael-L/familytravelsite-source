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
const { serveProductionFixture, BROWSER_PROFILES } = await import('../productionFixture.mjs');
const root = fileURLToPath(new URL('../../..', import.meta.url));
// Tailwind's content globs are relative to the client, even when invoked from the repo root.
process.chdir(root);
const output = process.env.P04AV_OUTPUT;
if (!output) throw new Error('Set P04AV_OUTPUT to a local evidence folder');
await mkdir(output, { recursive: true });
const server = await serveProductionFixture({ root, output });

const cases = [],
  external = [],
  transforms = [],
  failures = [],
  syntheticProviders = [];
let browser;
try {
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  for (const profile of BROWSER_PROFILES)
    for (const scenario of ['reservations-first', 'fail-task', 'pending']) {
      const phone = profile.phone;
      const context = await browser.newContext({
        viewport: profile.viewport,
        isMobile: profile.isMobile,
        hasTouch: profile.hasTouch,
        serviceWorkers: 'block',
      });
      const page = await context.newPage(),
        errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
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
          external.push(url.href);
          await route.abort();
          return;
        }
        if (url.pathname.startsWith('/p04as-tiles/') || url.pathname.startsWith('/storage/v1/object/public/catalog/')) {
          await route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1Z8AAAAASUVORK5CYII=',
              'base64'
            ),
          });
          return;
        }
        await route.continue();
      });
      const name = `${profile.name}-${scenario}`;
      try {
        await page.goto(
          `${origin}/tests/browser/planner-availability/index.html?${phone ? 'phone&' : ''}startup=${scenario}`
        );
        await page.waitForFunction(() => globalThis.fixture?.ready, { timeout: 45000 });
        if (scenario === 'reservations-first') {
          await page.waitForFunction(() => globalThis.fixture.taskHeld && globalThis.fixture.reservationStarts > 0);
          const before = await page.evaluate(() => ({
            model: globalThis.fixture.model(),
            ends: globalThis.fixture.reservationFinishes,
            bookings: globalThis.fixture.rpc.filter((r) => r.name === 'get_family_trip_booking_view_v1').length,
          }));
          assert.equal(before.model.trip, null);
          assert.equal(before.model.error, null);
          assert.equal(before.ends, 0);
          assert.equal(before.bookings, 1);
          await page.evaluate(() => globalThis.fixture.releaseTasks());
          await expect.poll(() => page.evaluate(() => globalThis.fixture.model().places.length)).toBe(8);
          await expect(page.getByText('Barceloneta Beach', { exact: true }).first()).toBeVisible({ timeout: 15000 });
          const calls = await page.evaluate(() => ({
            tasks: globalThis.fixture.rpc.filter((r) => r.name === 'get_family_trip_tasks_v1').length,
            starts: globalThis.fixture.reservationStarts,
          }));
          await page.evaluate(() => globalThis.fixture.reconnect());
          await page.waitForFunction(
            (n) => globalThis.fixture.taskHeld && globalThis.fixture.reservationStarts > n,
            calls.starts
          );
          assert.equal(
            await page.evaluate(
              () => globalThis.fixture.rpc.filter((r) => r.name === 'get_family_trip_tasks_v1').length
            ),
            calls.tasks + 1
          );
          assert.equal(await page.evaluate(() => globalThis.fixture.model().places.length), 8);
          await page.evaluate(() => globalThis.fixture.releaseTasks());
          await expect.poll(() => page.evaluate(() => globalThis.fixture.permission().allowed)).toBe(true);
          await expect(page.getByText('Barceloneta Beach', { exact: true }).first()).toBeVisible();
          assert.equal(await page.getByRole('alert').count(), 0);
          assert.deepEqual(await page.evaluate(() => globalThis.fixture.queue()), []);
        } else {
          const alert = page.getByRole('alert');
          await expect(alert).toBeVisible();
          const before = await page.evaluate(() => globalThis.fixture.queue());
          await page.screenshot({ path: path.join(output, name + '-error.png'), fullPage: true });
          await page.getByRole('button', { name: 'Try again', exact: true }).click();
          if (scenario === 'fail-task') {
            await expect.poll(() => page.evaluate(() => globalThis.fixture.model().places.length)).toBe(8);
            await expect(alert).toHaveCount(0);
            await expect(page.getByText('Barceloneta Beach', { exact: true }).first()).toBeVisible({ timeout: 15000 });
          } else {
            await expect(alert).toBeVisible();
            assert.deepEqual(await page.evaluate(() => globalThis.fixture.queue()), before);
            assert.equal(await page.evaluate(() => globalThis.fixture.rpc.length), 0);
            assert.equal(await page.evaluate(() => globalThis.fixture.model().trip), null);
          }
        }
        const report = await page.evaluate(() => ({
          model: globalThis.fixture.model(),
          rpc: globalThis.fixture.rpc,
          queries: globalThis.fixture.queries,
          transitions: globalThis.fixture.transitions,
          unexpected: globalThis.fixture.unexpected,
          errors: globalThis.fixture.errors,
          queue: [],
        }));
        report.queue = await page.evaluate(() => globalThis.fixture.queue());
        assert.deepEqual(errors, []);
        assert.deepEqual(report.errors, []);
        assert.deepEqual(report.unexpected, []);
        assert.equal(report.queries.filter((q) => q.table === 'todo_items').length, 0);
        await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
        await writeFile(path.join(output, name + '.json'), JSON.stringify(report, null, 2));
        cases.push({ name, passed: true });
      } catch (error) {
        failures.push({
          name,
          error: String(error),
          state: await page.evaluate(() => ({ ...globalThis.fixture, model: globalThis.fixture?.model?.() })),
        });
        await page.screenshot({ path: path.join(output, name + '-failure.png'), fullPage: true });
      } finally {
        await context.close();
      }
    }
  const receipt = {
    passed: !failures.length && !external.length && !transforms.length,
    cases,
    failures,
    external_requests: external,
    transformation_attempts: transforms,
    synthetic_provider_requests: syntheticProviders,
    browser: await browser.version(),
  };
  await writeFile(path.join(output, 'startup-browser-checks.json'), JSON.stringify(receipt, null, 2));
  log(JSON.stringify(receipt));
  if (!receipt.passed) process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
