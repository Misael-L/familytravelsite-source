import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { log } from 'node:console';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { loopbackProxy } from '../pwa-entry/loopback-proxy.mjs';
import { artifactServer } from './server.mjs';
const stage = process.env.FAMILY_PACKING_EXPORT_STAGE;
assert.equal(stage, '/private/tmp/trek-u04f1-packing-exports-20261112');
execFileSync('python3', [
  '-c',
  "import sys;sys.path.insert(0,'/Users/Misael/Desktop/FamilyTravelApp/supabase/tests');import packing_bag_cancellation_guard as g;g.validate()",
]);
const f = JSON.parse(await readFile(stage + '/fixture-private.json', 'utf8'));
assert.equal(f.api, 'http://127.0.0.1:56041');
const require = createRequire(fileURLToPath(new URL('../../../package.json', import.meta.url)));
const { createClient } = require('@supabase/supabase-js'),
  { chromium } = require('playwright'),
  { expect } = require('@playwright/test');
const sdk = createClient(f.api, f.anon_key, {
  global: { headers: { Authorization: 'Bearer ' + f.access_token } },
  auth: { persistSession: false, autoRefreshToken: false },
});
const rpc = async (name, args) => {
  const { data, error } = await sdk.rpc(name, args);
  assert.equal(error, null, 'Local fixture RPC refused ' + name + ' ' + error?.code);
  return data;
};
// Only this packet's fresh roots can receive these fixtures; existing trips are never used.
async function arrange(trip, profile) {
  assert.ok(f.browser_trips.includes(trip));
  const state = await rpc('get_family_trip_packing_v1', { p_trip_id: trip });
  assert.equal(state.scope.family_id, f.family_id);
  if (state.items.length) {
    assert.equal(state.items.length, 2);
    assert.ok(state.items.some((i) => i.name === 'Coat ' + profile + ' <&>'));
    assert.ok(state.items.some((i) => i.name === 'Private diary ' + profile));
    return;
  }
  const bag = await rpc('execute_family_trip_packing_bag_v1', {
    p_trip_id: trip,
    p_operation_id: randomUUID(),
    p_scope: state.scope,
    p_action: 'bag-create',
    p_target_id: randomUUID(),
    p_expected_revision: null,
    p_expected_collection_revision: state.collection_revision,
    p_observed: null,
    p_values: { name: 'Cabin ' + profile + ' <&>', color: '#336699' },
  });
  for (const personal of [false, true])
    await rpc('execute_family_trip_packing_v1', {
      p_trip_id: trip,
      p_operation_id: randomUUID(),
      p_scope: state.scope,
      p_action: 'create',
      p_target_id: randomUUID(),
      p_expected_revision: null,
      p_expected_collection_revision: null,
      p_values: {
        name: personal ? 'Private diary ' + profile : 'Coat ' + profile + ' <&>',
        category: 'Gear ' + profile,
        quantity: personal ? 1 : 3,
        weight_grams: 350,
        bag_id: bag.bag.id,
        visibility: personal ? 'personal' : 'common',
      },
    });
}
const apiRoutes = new Set([
  ...[
    'day_notes',
    'family_country_visited',
    'family_members',
    'family_place_categories',
    'family_travel_stats',
    'lists',
    'people_avatar_refs',
    'schedule_items',
    'trip_days',
    'trip_expenses',
    'trip_file_links',
    'trip_files',
    'trip_places',
    'trip_reservations',
    'trip_travelers',
    'trips',
  ].map((x) => 'GET /rest/v1/' + x),
  'GET /auth/v1/health',
  'GET /auth/v1/user',
  'POST /auth/v1/logout',
  'POST /auth/v1/token',
  'GET /auth/v1/factors',
  ...[
    'count_my_unread_notifications',
    'get_family_plan_governance_v1',
    'get_family_trip_booking_view_v1',
    'get_family_trip_packing_bags_v1',
    'get_family_trip_packing_bag_v1',
    'list_family_trip_packing_trash_v1',
    'list_family_trip_packing_bag_trash_v1',
    'list_family_trip_packing_category_batches_v3',
    'get_family_trip_packing_category_aggregate_v3',
    'get_family_trip_packing_with_categories_v2',
    'get_family_trip_planner_view_v1',
    'get_family_trip_tasks_v1',
    'get_my_auth_bootstrap',
    'get_my_effective_features',
    'get_my_effective_map_settings',
    'get_my_effective_preferences',
    'get_family_trip_packing_bag_command_cancellation_v1',
    'get_family_trip_packing_restore_cancellation_v1',
    'get_family_trip_packing_bag_receipt_v1',
    'get_family_trip_packing_receipt_v1',
    'get_family_trip_packing_category_aggregate_receipt_v3',
    'get_family_trip_packing_category_lane_v3',
    'get_family_trip_packing_v1',
  ].map((x) => 'POST /rest/v1/rpc/' + x),
]);
const server = await artifactServer(stage + '/dist'),
  proxy = await loopbackProxy([server.origin, f.api]);
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  proxy: { server: proxy.url, bypass: '<-loopback>' },
});
const results = [];
try {
  for (const [index, profile] of ['desktop', 'phone'].entries()) {
    await arrange(f.browser_trips[index], profile);
    const out = stage + '/browser-' + profile;
    await mkdir(out, { recursive: true, mode: 0o700 });
    const context = await browser.newContext({
      viewport: profile === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: profile === 'phone',
      hasTouch: profile === 'phone',
      locale: 'en-US',
      serviceWorkers: 'block',
      acceptDownloads: true,
    });
    const events = [],
      errors = [],
      transforms = [],
      checks = [];
    await context.route('**/*', async (route) => {
      const request = route.request(),
        u = new URL(request.url()),
        event = { origin: u.origin, path: u.pathname, method: request.method() };
      events.push(event);
      if (u.pathname.includes('/render/image/')) {
        transforms.push(u.pathname);
        await route.abort();
        return;
      }
      if (request.url() === f.cover_url) {
        await route.fulfill({
          contentType: 'image/png',
          body: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6pS8AAAAASUVORK5CYII=',
            'base64'
          ),
        });
        return;
      }
      if (u.origin === 'https://api.frankfurter.dev' && u.pathname === '/v2/rates') {
        await route.fulfill({ contentType: 'application/json', body: '[]' });
        return;
      }
      if (u.origin === f.api && !apiRoutes.has(event.method + ' ' + u.pathname)) {
        errors.push('Unapproved local request ' + event.method + ' ' + u.pathname);
        await route.abort();
        return;
      }
      if ([server.origin, f.api].includes(u.origin)) {
        await route.continue();
        return;
      }
      if (/tile|fonts\.(?:googleapis|gstatic)\.com/.test(u.hostname)) {
        await route.abort();
        return;
      }
      errors.push('Unapproved external request ' + u.origin + u.pathname);
      await route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', (e) => errors.push(e.message));
    const check = (name) => checks.push({ name, passed: true });
    const lists = async () => {
      const b = page.getByRole('button', { name: /^Lists$/i });
      if (await b.count()) await b.first().click();
      else
        await page
          .getByRole('link', { name: /^Lists$/i })
          .first()
          .click();
      const p = page.getByRole('button', { name: /^Packing$/i });
      if (await p.count()) await p.first().click();
    };
    const choose = async (label) => {
      if (profile === 'phone') {
        await page.getByRole('button', { name: 'Actions', exact: true }).click();
        await page.getByRole('button', { name: label, exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Export', exact: true }).last().click();
        await page.getByRole('menuitem', { name: label, exact: true }).click();
      }
    };
    const file = async (label, extension, suffix = '') => {
      const [d] = await Promise.all([page.waitForEvent('download'), choose(label)]);
      assert.ok(d.suggestedFilename().endsWith(extension));
      const path = out + '/packing' + suffix + extension;
      await d.saveAs(path);
      return readFile(path, 'utf8');
    };
    try {
      await page.goto(server.origin + '/manifest.webmanifest');
      await page.evaluate(
        (session) => globalThis.localStorage.setItem('sb-127-auth-token', JSON.stringify(session)),
        f.session
      );
      await page.goto(server.origin + '/dashboard');
      await expect
        .poll(
          () =>
            page
              .locator('img')
              .evaluateAll(
                (images, url) => images.some((i) => i.currentSrc === url && i.complete && i.naturalWidth > 0),
                f.cover_url
              ),
          { timeout: 30000 }
        )
        .toBe(true);
      check('synthetic-stored-variant-cover-decoded');
      await page.goto(server.origin + '/trips/' + f.browser_trips[index]);
      await expect(page.getByRole('button', { name: /^Lists$/i }).first()).toBeVisible();
      await lists();
      await expect(page.getByText('Coat ' + profile + ' <&>', { exact: true }).first()).toBeVisible();
      const csv = await file('CSV for import (.csv)', '.csv');
      assert.ok(csv.includes('Cabin ' + profile + ' <&>'));
      assert.ok(csv.includes('3 × Coat ' + profile));
      assert.ok(!csv.includes('Private diary'));
      check('common-CSV-native-download-with-owned-bag');
      const md = await file('Markdown checklist (.md)', '.md');
      assert.ok(md.includes('3 × Coat ' + profile));
      assert.ok(!md.includes('Private diary'));
      check('common-Markdown-native-download');
      await choose('Print or save as PDF');
      const frame = page.locator('iframe[title^="Packing List"]');
      await expect(frame).toBeVisible();
      const html = await frame.getAttribute('srcdoc');
      assert.ok(html.includes('Cabin ' + profile + ' &lt;&amp;&gt;'));
      assert.ok(!html.includes('Private diary'));
      await writeFile(out + '/packing-print.html', html);
      check('common-native-print-owned-bag-and-escaping');
      await page.screenshot({ path: out + '/print.png' });
      await page.getByRole('button', { name: 'Close', exact: true }).last().click();
      await expect(frame).toHaveCount(0);
      check('native-print-close');
      const personal = page.getByRole('button', { name: /^My list/i });
      await personal.first().click();
      await expect(page.getByText('Private diary ' + profile, { exact: true }).first()).toBeVisible();
      const own = await file('CSV for import (.csv)', '.csv', '-personal');
      assert.ok(own.includes('Private diary'));
      assert.ok(!own.includes('Coat ' + profile));
      check('personal-CSV-native-filter');
      await choose('Print or save as PDF');
      await expect(frame).toBeVisible();
      // Actual SPA navigation while the native frame is open, without a test-only hook/store.
      if (profile === 'phone')
        await page
          .locator('button[aria-label="Back"]')
          .first()
          .evaluate((button) => button.click());
      else
        await page.evaluate((url) => {
          globalThis.history.pushState({}, '', url);
          globalThis.dispatchEvent(new globalThis.PopStateEvent('popstate'));
        }, '/dashboard');
      await expect(frame).toHaveCount(0);
      check('navigation-retires-open-print');
      assert.equal(
        events.filter((e) => e.path.startsWith('/rest/v1/rpc/execute_') || e.path.startsWith('/rest/v1/rpc/cancel_'))
          .length,
        0
      );
      assert.equal(transforms.length, 0);
      assert.deepEqual(errors, []);
      check('zero-transform-attempts-and-no-unapproved-requests');
      await writeFile(out + '/checks.json', JSON.stringify(checks, null, 2) + '\n');
      results.push({ profile, checks: checks.length, transform_attempts: transforms.length, errors });
    } catch (error) {
      await page.screenshot({ path: out + '/failure.png' });
      await writeFile(out + '/failure.txt', String(error) + '\n' + (await page.locator('body').innerText()));
      throw error;
    } finally {
      await writeFile(out + '/network.json', JSON.stringify(events, null, 2) + '\n');
      await writeFile(out + '/errors.json', JSON.stringify(errors, null, 2) + '\n');
      await context.close();
    }
  }
  const allowed = new Set([server.origin, f.api]);
  assert.ok(proxy.events.filter((e) => !e.denied && e.origin).every((e) => allowed.has(e.origin)));
  await writeFile(stage + '/browser-proxy.json', JSON.stringify(proxy.events, null, 2) + '\n');
  await writeFile(
    stage + '/browser-receipt.json',
    JSON.stringify(
      {
        actual_App: true,
        profiles: results,
        observations: results.reduce((n, r) => n + r.checks, 0),
        synthetic_cover_bytes: true,
        service_worker_offline_claim: false,
        denied_browser_background_requests: proxy.events.filter((e) => e.denied).length,
        application_unapproved_requests: 0,
      },
      null,
      2
    ) + '\n'
  );
  log(JSON.stringify(results));
} finally {
  await browser.close();
  await proxy.close();
  await server.close();
}
