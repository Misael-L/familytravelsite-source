import { Buffer } from 'node:buffer';
// Actual index/main/App/bootstrap, installed SDK, and guarded local Auth/Data API.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const output = process.env.FAMILY_ENTRY_OUTPUT ?? process.env.D6_OUTPUT;
if (!output || !path.isAbsolute(output) || !/^\/private\/tmp\/trek-u03d[678]-/.test(output))
  throw Error('Use a fresh /private/tmp/trek-u03d6- output directory');
await mkdir(output, { recursive: true, mode: 0o700 });
const fixturePath = process.env.FAMILY_ENTRY_FIXTURE ?? process.env.D6_FIXTURE;
if (!fixturePath || !/^\/private\/tmp\/trek-u03d[678]-/.test(fixturePath))
  throw Error('Private local fixture required');
const fixtureStat = await stat(fixturePath);
assert.equal(fixtureStat.mode & 0o077, 0, 'Credential fixture must be private');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
assert.equal(fixture.api, 'http://127.0.0.1:55331');
const require = createRequire(path.join(root, 'package.json'));
const { preview } = await import(require.resolve('vite'));
const { chromium } = require('playwright');
const { expect } = require('@playwright/test');
const { BROWSER_PROFILES } = await import(path.join(root, 'tests/browser/productionFixture.mjs'));
const requestedProfile = process.env.FAMILY_ENTRY_PROFILE ?? process.env.D6_PROFILE;
assert.ok(
  !requestedProfile || BROWSER_PROFILES.some((profile) => profile.name === requestedProfile),
  'Unknown browser profile'
);
assert.ok(!fixture.planner || requestedProfile, 'D7 uses a fresh fixture for each explicitly selected profile');

const dist = process.env.FAMILY_ENTRY_DIST ?? process.env.D6_DIST;
if (!dist || !/^\/private\/tmp\/trek-u03d[678]-/.test(dist)) throw Error('Local actual-entrypoint artifact required');
const server = await preview({
  configFile: false,
  root,
  envDir: output,
  build: { outDir: dist },
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
});
const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
const tripPath = '/trips/' + fixture.trip_id;
const results = [],
  diagnostics = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.toUpperCase().replace(/=/g, '')) {
    const v = alphabet.indexOf(c);
    assert.ok(v >= 0);
    bits += v.toString(2).padStart(5, '0');
  }
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))),
    counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const d = createHmac('sha1', key).update(counter).digest(),
    offset = d[19] & 15;
  return String((d.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
const safePath = (raw) => {
  const u = new URL(raw);
  return u.origin + u.pathname;
};
const tripRead = (event) =>
  /^(?:\/rest\/v1\/rpc\/get_family_trip_(?:planner_view|tasks|packing|booking_view)_v1$)/.test(event.path) ||
  /^\/rest\/v1\/(trips|trip_days|trip_places|schedule_items|trip_reservations)(\/|$)/.test(event.path);
try {
  for (const profile of BROWSER_PROFILES.filter((p) => !requestedProfile || p.name === requestedProfile)) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      locale: 'en-US',
      serviceWorkers: 'block',
    });
    const events = [],
      requestStarts = [],
      deniedProviders = [],
      browserInternal = [],
      outside = [],
      transforms = [],
      errors = [],
      consoleErrors = [];
    await context.route('**/*', async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname.includes('/render/image/')) {
        transforms.push(safePath(u.href));
        return route.abort();
      }
      if ([origin, fixture.api].includes(u.origin)) return route.continue();
      // Chrome's built-in PDF viewer owns these packaged extension resources; no remote provider is allowed.
      if (
        (u.protocol === 'chrome-extension:' && u.hostname === 'mhjfbmdgcfjbbpaeojofohoefgiehjai') ||
        (u.protocol === 'chrome:' && u.hostname === 'resources')
      ) {
        browserInternal.push(u.protocol + '//' + u.hostname + u.pathname);
        return route.continue();
      }
      // These providers are unrelated to Auth acceptance. They are explicitly denied, never mocked as successful.
      if (
        [
          'https://api.frankfurter.dev',
          'https://tiles.openfreemap.org',
          'https://tile.openstreetmap.org',
          'https://archive-api.open-meteo.com',
          'https://api.open-meteo.com',
          'https://routing.openstreetmap.de',
        ].includes(u.origin)
      )
        deniedProviders.push(safePath(u.href));
      else outside.push(u.origin === 'null' ? u.protocol + '//' + u.hostname + u.pathname : safePath(u.href));
      return route.abort();
    });
    await context.routeWebSocket('**/*', (ws) => {
      const u = new URL(ws.url());
      if (u.origin === 'ws://127.0.0.1:55331') ws.connectToServer();
      else {
        outside.push(safePath(u.href));
        ws.close();
      }
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('net::ERR_FAILED'))
        consoleErrors.push(msg.text().replaceAll(fixture.anon_key, '[local public key]').slice(0, 4000));
    });
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.origin === fixture.api) requestStarts.push({ path: u.pathname, method: r.method() });
    });
    page.on('response', (r) => {
      const u = new URL(r.url());
      if (u.origin === fixture.api) events.push({ path: u.pathname, method: r.request().method(), status: r.status() });
    });
    const record = (name) => {
      results.push({ profile: profile.name, name, passed: true });
      process.stdout.write(profile.name + ': ' + name + '\n');
    };
    let privatePreviewUrls = [];
    const tripVisible = async () => {
      await expect(page).toHaveURL(origin + tripPath, { timeout: 30000 });
      if (fixture.native_files_bookings) {
        const plan = page.getByRole('button', { name: 'Plan', exact: true }).first();
        await expect(plan).toBeVisible({ timeout: 30000 });
        await plan.click();
        if (profile.phone) await page.getByRole('button', { name: 'Places', exact: true }).click();
      }
      if (!profile.phone)
        await expect(page.getByText('Observed task fixture', { exact: true }).first()).toBeVisible({ timeout: 30000 });
      else
        await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
      await expect(
        page
          .getByText(
            fixture.planner && profile.phone && !fixture.native_files_bookings
              ? 'Fixture restaurant'
              : 'Fixture city ' + fixture.trip_id,
            {
              exact: true,
            }
          )
          .first()
      ).toBeVisible({
        timeout: 30000,
      });
      await expect(page.getByText(/HITTING THE ROAD/i)).toHaveCount(0);
      await expect(page.getByText(/Couldn't reach the server\. Your trips are safe/)).toHaveCount(0);
    };
    const password = async (account) => {
      await page.locator('input[type="email"]').fill(account.email);
      await page.locator('input[type="password"]').fill(account.password);
      await page.locator('button[type="submit"]').click();
    };
    const verify = async () => {
      await expect(page.locator('input[autocomplete="one-time-code"]')).toBeVisible({ timeout: 15000 });
      if (Date.now() % 30000 > 27000) await page.waitForTimeout(3100);
      await page.locator('input[autocomplete="one-time-code"]').fill(totp(fixture.owner.secret));
      await page.locator('button[type="submit"]').click();
    };
    try {
      await page.goto(origin + tripPath);
      await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 30000 });
      assert.equal(new URL(page.url()).pathname, '/login');
      assert.equal(new URL(page.url()).searchParams.get('redirect'), tripPath);
      assert.equal(events.filter(tripRead).length, 0);
      record('signed-out deep link preserves destination and does not read trip');
      await password(fixture.owner);
      await expect(page.locator('input[autocomplete="one-time-code"]')).toBeVisible({ timeout: 15000 });
      assert.equal(events.filter(tripRead).length, 0);
      record('real password session is held behind MFA before trip reads');
      const beforeInvalid = events.length;
      const invalid = String((Number(totp(fixture.owner.secret)) + 1) % 1000000).padStart(6, '0');
      await page.locator('input[autocomplete="one-time-code"]').fill(invalid);
      await page.locator('button[type="submit"]').click();
      await expect
        .poll(() => events.slice(beforeInvalid).some((e) => e.path.endsWith('/verify') && e.status >= 400))
        .toBe(true);
      await expect(page.locator('input[autocomplete="one-time-code"]')).toBeVisible();
      assert.equal(events.filter(tripRead).length, 0);
      record('invalid real MFA code is refused without trip disclosure');
      await verify();
      await tripVisible();
      assert.ok(events.some((e) => e.path.endsWith('/verify') && e.status === 200));
      assert.ok(events.some((e) => e.path === '/rest/v1/trips' && e.status === 200));
      assert.equal(await page.getByRole('button', { name: /^Road trip$/i }).count(), 0);
      assert.equal(await page.getByRole('button', { name: /^Tours$/i }).count(), 0);
      await page.screenshot({ path: path.join(output, profile.name + '-trip.png'), fullPage: true });
      record('real MFA opens synthetic existing trip through default controller');
      await page.reload();
      await tripVisible();
      record('reload restores authenticated trip through actual bootstrap');
      if (fixture.planner) {
        assert.ok(
          events.some((event) => event.path === '/rest/v1/rpc/get_family_trip_planner_view_v1' && event.status === 200),
          'Ordinary bootstrap must use the canonical planner RPC'
        );
        record('ordinary bootstrap loads canonical normalized planner');
        if (fixture.native_files_bookings) {
          const { checkFilesAndBookings } = await import('./native-file-booking-checks.mjs');
          privatePreviewUrls = await checkFilesAndBookings({ page, fixture, profile, output, record, expect, context });
        } else {
          const { checkPlanner } = await import('./planner-checks.mjs');
          await checkPlanner({ page, fixture, profile, output, record, expect });
        }
      }
      if (profile.phone) {
        await page.goto(origin + '/dashboard');
        await page.getByRole('button', { name: 'Profile', exact: true }).click({ timeout: 20000 });
        await expect(page.getByText(/Couldn't reach the server\. Your trips are safe/)).toHaveCount(0);
      } else await page.getByRole('button', { name: new RegExp(fixture.owner.email.split('@')[0]) }).click();
      await page.getByRole('button', { name: /^(Log ?out|Sign out)$/i }).click();
      await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 20000 });
      await expect.poll(() => events.some((e) => e.path === '/auth/v1/logout' && e.status === 204)).toBe(true);
      await page.goto(origin + tripPath);
      await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 20000 });
      assert.equal(new URL(page.url()).pathname, '/login');
      record('native logout revokes real local session and denies trip reload');
      if (fixture.native_files_bookings) {
        assert.ok(privatePreviewUrls.length > 0);
        assert.ok(
          await page.evaluate(async (urls) => {
            const denied = await Promise.all(
              urls.map(async (url) => {
                try {
                  await globalThis.fetch(url);
                  return false;
                } catch {
                  return true;
                }
              })
            );
            return denied.every(Boolean);
          }, privatePreviewUrls)
        );
        record(
          profile.phone
            ? 'native phone logout cannot reactivate a closed private preview URL'
            : 'native logout retires active inline private-file image URLs'
        );
      }
      const beforeOutsider = events.length;
      await password(fixture.outsider);
      await expect(page.getByRole('heading', { name: 'Family access' })).toBeVisible({ timeout: 25000 });
      assert.equal(events.slice(beforeOutsider).filter(tripRead).length, 0);
      await expect(page.getByText('Observed task fixture', { exact: true })).toHaveCount(0);
      await page.screenshot({ path: path.join(output, profile.name + '-membership-gate.png'), fullPage: true });
      record('second account without Family membership sees access gate, not previous trip');
      if (fixture.native_files_bookings) {
        const refusal = await page.evaluate(async (id) => {
          const response = await globalThis.fetch('/api/family/files/' + id + '/open');
          return { status: response.status, mime: response.headers.get('content-type') };
        }, fixture.native_files_bookings.assets[0].id);
        assert.ok(refusal.status >= 400 && refusal.status < 500);
        assert.notEqual(refusal.mime, 'image/png');
        record('actual second-account SDK session cannot reopen the prior private file');
      }
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Family access' })).toBeVisible({ timeout: 20000 });
      record('blocked account remains gated after full document reload');
      await page.getByRole('button', { name: /^(Log ?out|Sign out)$/i }).click();
      await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 20000 });
      await page.goto(origin + tripPath);
      const ownerReturnStart = events.length;
      await password(fixture.owner);
      await verify();
      // Native deliberate logout is a fresh start and may choose the dashboard.
      await expect(page).toHaveURL((url) => url.origin === origin && [tripPath, '/dashboard'].includes(url.pathname), {
        timeout: 30000,
      });
      await expect
        .poll(() =>
          events.slice(ownerReturnStart).some((event) => event.path.endsWith('/verify') && event.status === 200)
        )
        .toBe(true);
      if (new URL(page.url()).pathname === '/dashboard') {
        await expect(page.getByText('Observed task fixture', { exact: true }).first()).toBeVisible({ timeout: 20000 });
        await expect(page.getByText(/Couldn't reach the server\. Your trips are safe/)).toHaveCount(0);
        await page.goto(origin + tripPath);
      }
      await tripVisible();
      record('owner can sign in again after blocked-account logout');
      // Settle the preceding valid session's in-flight responses before measuring the new document.
      await page.waitForLoadState('networkidle');
      let beforeMissingSession = events.length;
      let beforeMissingRequest = requestStarts.length;
      const removed = await page.evaluate(() => {
        const snapshot = JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot') || 'null');
        const keys = Object.keys(globalThis.localStorage).filter((key) => /^sb-.*-auth-token$/.test(key));
        for (const key of keys) globalThis.localStorage.removeItem(key);
        return { cachedIdentity: snapshot?.state?.isAuthenticated === true, count: keys.length };
      });
      assert.ok(removed.cachedIdentity && removed.count > 0);
      if (fixture.native_files_bookings) {
        // Unload the old valid SDK owner before measuring the new cold document.
        // Old-owner HTTP responses arriving late are not new sessionless requests.
        await page.goto('about:blank');
        beforeMissingSession = events.length;
        beforeMissingRequest = requestStarts.length;
        await page.goto(origin + tripPath);
      } else await page.reload();
      await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 20000 });
      assert.equal(new URL(page.url()).pathname, '/login');
      assert.equal(
        (fixture.native_files_bookings
          ? requestStarts.slice(beforeMissingRequest)
          : events.slice(beforeMissingSession)
        ).filter(tripRead).length,
        0
      );
      record('display cache without an SDK session returns to sign-in without trip reads');

      assert.deepEqual(errors, []);
      assert.deepEqual(outside, []);
      assert.deepEqual(transforms, []);
    } catch (error) {
      if (await page.getByText('Details', { exact: true }).count())
        await page.getByText('Details', { exact: true }).click();
      await page.screenshot({ path: path.join(output, profile.name + '-failure.png'), fullPage: true });
      await writeFile(
        path.join(output, profile.name + '-failure.json'),
        JSON.stringify(
          {
            message: error.message,
            path: new URL(page.url()).pathname,
            text: (await page.locator('body').innerText()).slice(-6000),
            buttons: await page.getByRole('button').allTextContents(),
            consoleErrors,
          },
          null,
          2
        )
      );
      throw error;
    } finally {
      diagnostics.push({
        profile: profile.name,
        events,
        deniedProviders,
        browserInternal,
        outside,
        transforms,
        errors,
      });
      await writeFile(
        path.join(output, 'application-checks.json'),
        JSON.stringify(
          {
            entrypoint: 'actual index/main/App/bootstrap',
            real_local_sdk: true,
            service_workers: 'blocked; PWA lifecycle not claimed',
            cohort_installed: Boolean(fixture.planner),
            results,
            diagnostics,
          },
          null,
          2
        )
      );
      await context.close();
    }
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
