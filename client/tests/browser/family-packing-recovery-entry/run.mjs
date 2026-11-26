import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { log } from 'node:console';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { loopbackProxy } from '../pwa-entry/loopback-proxy.mjs';
import { artifactServer } from './server.mjs';
const stage = process.env.FAMILY_PACKING_RECOVERY_STAGE;
assert.equal(stage, '/private/tmp/trek-u04d2c3b-native-recovery-20261112');
const f = JSON.parse(await readFile(stage + '/fixture-private.json', 'utf8'));
assert.equal(f.api, 'http://127.0.0.1:56041');
const require = createRequire(fileURLToPath(new URL('../../../package.json', import.meta.url)));
const { createClient } = require('@supabase/supabase-js');
let sdk = createClient(f.api, f.anon_key, {
  global: { headers: { Authorization: 'Bearer ' + f.access_token } },
  auth: { persistSession: false, autoRefreshToken: false },
});
const rpc = async (name, args) => {
  const { data, error } = await sdk.rpc(name, args);
  assert.equal(error, null, 'Local fixture RPC refused: ' + name + ' ' + error?.code);
  return data;
};
const { chromium } = require('playwright'),
  { expect } = require('@playwright/test');
const server = await artifactServer(stage + '/dist'),
  proxy = await loopbackProxy([server.origin, f.api]);
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  proxy: { server: proxy.url, bypass: '<-loopback>' },
});
async function arrangeDependent(trip, domain) {
  const state = await rpc('get_family_trip_packing_v1', { p_trip_id: trip });
  const bag = await rpc('execute_family_trip_packing_bag_v1', {
    p_trip_id: trip,
    p_operation_id: randomUUID(),
    p_scope: state.scope,
    p_action: 'bag-create',
    p_target_id: randomUUID(),
    p_expected_revision: null,
    p_expected_collection_revision: state.collection_revision,
    p_observed: null,
    p_values: { name: 'Parent ' + domain + ' bag' },
  });
  const item = await rpc('execute_family_trip_packing_v1', {
    p_trip_id: trip,
    p_operation_id: randomUUID(),
    p_scope: state.scope,
    p_action: 'create',
    p_target_id: randomUUID(),
    p_expected_revision: null,
    p_expected_collection_revision: null,
    p_values: { name: 'Dependent browser ' + domain, category: 'Browser recovery ' + domain, bag_id: bag.bag.id },
  });
  if (domain === 'item')
    await rpc('execute_family_trip_packing_v1', {
      p_trip_id: trip,
      p_operation_id: randomUUID(),
      p_scope: state.scope,
      p_action: 'trash',
      p_target_id: item.item.id,
      p_expected_revision: item.item.revision,
      p_expected_collection_revision: null,
      p_values: {},
    });
  else {
    const categories = await rpc('get_family_trip_packing_with_categories_v2', { p_trip_id: trip });
    const category = categories.categories.find((c) => c.name === 'Browser recovery ' + domain);
    assert.ok(category);
    const observed = await rpc('get_family_trip_packing_category_aggregate_v3', {
      p_trip_id: trip,
      p_category_id: category.id,
      p_include_deleted: false,
    });
    await rpc('execute_family_trip_packing_category_aggregate_v3', {
      p_trip_id: trip,
      p_operation_id: randomUUID(),
      p_scope: observed.scope,
      p_action: 'category-trash-batch',
      p_target_id: category.id,
      p_expected_collection_revision: observed.collection_revision,
      p_observed: observed,
      p_values: {},
    });
  }
  const observed = await rpc('get_family_trip_packing_bag_v1', {
    p_trip_id: trip,
    p_bag_id: bag.bag.id,
    p_include_deleted: false,
  });
  await rpc('execute_family_trip_packing_bag_v1', {
    p_trip_id: trip,
    p_operation_id: randomUUID(),
    p_scope: observed.scope,
    p_action: 'bag-trash-empty',
    p_target_id: bag.bag.id,
    p_expected_revision: observed.bag.revision,
    p_expected_collection_revision: observed.collection_revision,
    p_observed: observed,
    p_values: {},
  });
}
async function localState(page) {
  return page.evaluate(async () => {
    const queues = [],
      archives = [];
    for (const meta of (await globalThis.indexedDB.databases()).filter((d) => d.name?.startsWith('trek-offline'))) {
      const db = await new Promise((resolve, reject) => {
        const r = globalThis.indexedDB.open(meta.name);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.onupgradeneeded = () => reject(Error('Unexpected new test database'));
      });
      const read = (table) =>
        new Promise((resolve, reject) => {
          const r = db.transaction(table, 'readonly').objectStore(table).getAll();
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
      if (db.objectStoreNames.contains('mutationQueue')) queues.push(...(await read('mutationQueue')));
      if (db.objectStoreNames.contains('syncMeta'))
        for (const row of await read('syncMeta')) archives.push(...(row.familyPackingTerminalArchive?.entries ?? []));
      db.close();
    }
    return { queues, archives };
  });
}
function localSql(sql) {
  execFileSync('python3', [
    '-c',
    "import sys;sys.path.insert(0,'/Users/Misael/Desktop/FamilyTravelApp/supabase/tests');import packing_bag_cancellation_guard as g;g.validate()",
  ]);
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_family-modernization-20261112-d2c3',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-Atq',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input: sql, encoding: 'utf8' }
  ).trim();
}
function totp(secret) {
  let bits = '';
  for (const char of secret.toUpperCase().replaceAll('=', ''))
    bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const tick = Buffer.alloc(8);
  tick.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const mac = createHmac('sha1', Buffer.from(bytes)).update(tick).digest();
  const n = mac.readUInt32BE(mac[19] & 15) & 0x7fffffff;
  return String(n % 1000000).padStart(6, '0');
}
async function packingHistory(page) {
  const lists = page.getByRole('button', { name: 'Lists', exact: true });
  if (await lists.count()) await lists.first().click();
  await page.getByRole('button', { name: 'Packing List · Trash', exact: true }).click();
  return page
    .getByRole('presentation')
    .filter({ has: page.getByRole('heading', { name: 'Packing List · Trash', exact: true }) })
    .last();
}
async function logoutLogin(page, profile) {
  await page.goto(server.origin + '/dashboard');
  await page.waitForTimeout(1000);
  if (profile === 'phone') await page.getByRole('button', { name: 'Profile', exact: true }).click();
  else await page.getByRole('button').filter({ hasText: 'p01-' }).first().click();
  await page.getByRole('button', { name: /^(Log out|Logout)$/ }).click();
  await page.locator('input[type=email]').fill(f.email);
  await page.locator('input[type=password]').fill('local-only');
  await page.locator('button[type=submit]').click();
  const code = page.locator('input[autocomplete="one-time-code"]');
  await expect(code).toBeVisible({ timeout: 15000 });
  // Avoid crossing a TOTP tick while the real UI submits a fresh code.
  if (Date.now() % 30000 > 27000) await page.waitForTimeout(3100);
  await code.fill(totp(f.totp_secret));
  await page.locator('button[type=submit]').click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const s = JSON.parse(globalThis.localStorage.getItem('sb-127-auth-token') ?? 'null');
          return s?.access_token
            ? JSON.parse(globalThis.atob(s.access_token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))).aal
            : null;
        }),
      { timeout: 20000 }
    )
    .toBe('aal2');
  await page.waitForURL((u) => u.pathname !== '/login', { timeout: 20000 });
  await expect(page.locator('input[type=email]')).toHaveCount(0, { timeout: 15000 });
  const session = await page.evaluate(() => JSON.parse(globalThis.localStorage.getItem('sb-127-auth-token')));
  assert.ok(session?.access_token);
  f.session = session;
  f.access_token = session.access_token;
  await writeFile(stage + '/fixture-private.json', JSON.stringify(f), { mode: 0o600 });
  sdk = createClient(f.api, f.anon_key, {
    global: { headers: { Authorization: 'Bearer ' + session.access_token } },
    auth: { persistSession: false, autoRefreshToken: false },
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
    'execute_family_trip_packing_bag_v1',
    'execute_family_trip_packing_v1',
    'execute_family_trip_packing_category_aggregate_v3',
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
    'cancel_family_trip_packing_bag_command_v1',
    'get_family_trip_packing_bag_command_cancellation_v1',
    'cancel_family_trip_packing_restore_v1',
    'get_family_trip_packing_restore_cancellation_v1',
    'get_family_trip_packing_bag_receipt_v1',
    'get_family_trip_packing_receipt_v1',
    'get_family_trip_packing_category_aggregate_receipt_v3',
    'get_family_trip_packing_category_lane_v3',
    'get_family_trip_packing_v1',
  ].map((x) => 'POST /rest/v1/rpc/' + x),
]);
const results = [];
try {
  for (const [index, profile] of ['desktop', 'phone'].entries()) {
    if (process.env.FAMILY_PACKING_RECOVERY_PROFILE && process.env.FAMILY_PACKING_RECOVERY_PROFILE !== profile)
      continue;
    const out = stage + '/browser-' + profile;
    await mkdir(out, { recursive: true, mode: 0o700 });
    const context = await browser.newContext({
      viewport: profile === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: profile === 'phone',
      hasTouch: profile === 'phone',
      locale: 'en-US',
      serviceWorkers: 'block',
    });
    const events = [],
      errors = [],
      blocked = [],
      checks = [];
    await context.route('**/*', async (route) => {
      const u = new URL(route.request().url());
      const event = { origin: u.origin, path: u.pathname, method: route.request().method() };
      if (u.pathname.startsWith('/rest/v1/rpc/') && /(?:execute|cancel).*packing/.test(u.pathname)) {
        const body = route.request().postDataJSON();
        event.action = body.p_action;
        event.operation_id = body.p_operation_id;
        event.target_id = body.p_target_id;
        event.body_sha256 = createHash('sha256').update(JSON.stringify(body)).digest('hex');
      }
      events.push(event);
      if (u.pathname.includes('/render/image/')) {
        blocked.push(u.pathname);
        await route.abort();
        return;
      }
      if (route.request().url() === f.cover_url) {
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
      if (
        u.origin === f.api &&
        !apiRoutes.has(event.method + ' ' + u.pathname) &&
        !(event.method === 'POST' && /^\/auth\/v1\/factors\/[a-f0-9-]{36}\/(challenge|verify)$/.test(u.pathname))
      ) {
        errors.push('Unapproved local API request ' + event.method + ' ' + u.pathname);
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
    page.on('response', (r) => {
      const u = new URL(r.url());
      if (u.origin === f.api)
        events.push({ origin: u.origin, path: u.pathname, method: r.request().method(), status: r.status() });
    });
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(server.origin + '/manifest.webmanifest');
      await page.evaluate(
        (session) => globalThis.localStorage.setItem('sb-127-auth-token', JSON.stringify(session)),
        f.session
      );
      await page.goto(server.origin + '/dashboard');
      await page.waitForTimeout(1800);
      await expect
        .poll(() =>
          page
            .locator('img')
            .evaluateAll(
              (images, url) => images.some((i) => i.currentSrc === url && i.complete && i.naturalWidth > 0),
              f.cover_url
            )
        )
        .toBe(true);
      checks.push({ name: 'decoded-synthetic-stored-variant-cover', passed: true });
      await writeFile(out + '/dashboard.txt', await page.locator('body').innerText());
      await page.screenshot({ path: out + '/dashboard.png' });
      await page.goto(server.origin + '/trips/' + f.browser_trips[index]);
      await page.waitForTimeout(4000);
      await page.screenshot({ path: out + '/startup.png' });
      const text = await page.locator('body').innerText();
      await writeFile(out + '/startup.txt', text);
      log(profile + ': startup ' + text.slice(0, 220).replaceAll('\n', ' '));
      const lists = page.getByRole('button', { name: /^Lists$/i });
      if (await lists.count()) await lists.first().click();
      else {
        const link = page.getByRole('link', { name: /^Lists$/i });
        if (await link.count()) await link.first().click();
      }
      await page.waitForTimeout(800);
      await page.screenshot({ path: out + '/lists.png' });
      await writeFile(out + '/lists.txt', await page.locator('body').innerText());
      // The controls are discovered from the actual native accessible UI; no test-only App entry is injected.
      const packing = page.getByRole('button', { name: /^Packing$/i });
      if (await packing.count()) await packing.first().click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: out + '/packing.png' });
      await writeFile(out + '/packing.txt', await page.locator('body').innerText());
      if (profile === 'desktop') {
        await expect(page.getByRole('button', { name: /^Add bag$/i })).toBeVisible();
        await page.getByRole('button', { name: /^Add bag$/i }).click();
      } else {
        await page.getByRole('button', { name: /^Bags$/i }).click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: /^Add bag$/i })
          .click();
      }
      await page.screenshot({ path: out + '/create-form.png' });
      const input = page.getByPlaceholder(/Bag name/i);
      await expect(input).toBeVisible();
      await input.fill('Browser ' + profile + ' cabin');
      await input.press('Enter');
      await expect(page.getByRole('button', { name: 'Browser ' + profile + ' cabin', exact: true })).toBeVisible({
        timeout: 15000,
      });
      checks.push({ name: 'native-bag-create-real-SDK', passed: true });
      await page.getByRole('button', { name: 'Browser ' + profile + ' cabin', exact: true }).click();
      const editor = page.getByRole('textbox').last();
      await expect(editor).toHaveValue('Browser ' + profile + ' cabin');
      await editor.fill('Renamed ' + profile + ' cabin');
      await editor.press('Enter');
      await expect(page.getByRole('button', { name: 'Renamed ' + profile + ' cabin', exact: true })).toBeVisible({
        timeout: 15000,
      });
      checks.push({ name: 'native-bag-rename-real-SDK', passed: true });
      await page.screenshot({ path: out + '/saved.png' });
      await page.getByRole('button', { name: 'Set limit', exact: true }).click();
      const limit = page.getByRole('textbox', { name: 'Weight limit', exact: true });
      await limit.fill('8');
      await limit.press('Enter');
      await expect(page.getByText(/8(?:\.0)? kg/).first()).toBeVisible({ timeout: 15000 });
      checks.push({ name: 'native-limit-save-real-SDK', passed: true });
      const carrierButtons =
        profile === 'phone'
          ? page.getByRole('dialog').getByRole('button', { name: 'Add', exact: true })
          : page.getByRole('button', { name: 'Assign members', exact: true });
      await carrierButtons.click();
      await page.getByRole('button').filter({ hasText: f.carrier_name }).first().click();
      await expect
        .poll(async () => {
          const state = await rpc('get_family_trip_packing_bags_v1', { p_trip_id: f.browser_trips[index] });
          return state.bags.find((o) => o.bag.name === 'Renamed ' + profile + ' cabin')?.member_person_ids.length;
        })
        .toBe(1);
      await expect
        .poll(() => events.filter((e) => e.path === '/rest/v1/rpc/execute_family_trip_packing_bag_v1').length)
        .toBeGreaterThanOrEqual(4);
      checks.push({ name: 'native-carrier-save-real-SDK', passed: true });
      log(profile + ': create, rename, weight limit and carrier saved');
      const remove =
        profile === 'phone'
          ? page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true })
          : page.getByRole('button', { name: 'Delete', exact: true });
      const occupied = (await rpc('get_family_trip_packing_bags_v1', { p_trip_id: f.browser_trips[index] })).bags.find(
        (o) => o.bag.name === 'Renamed ' + profile + ' cabin'
      );
      assert.ok(occupied);
      const hidden = localSql(
        "insert into public.packing_items(trip_id,name,bag_id,is_private,owner_person_id,weight_grams)values('" +
          f.browser_trips[index] +
          "','Private native refusal fixture','" +
          occupied.bag.id +
          "',true,'" +
          f.editor_person_id +
          "',0)returning id;"
      );
      await page.reload();
      await page.waitForTimeout(1200);
      await page.getByRole('button', { name: 'Lists', exact: true }).first().click();
      if (profile === 'phone') await page.getByRole('button', { name: 'Bags', exact: true }).last().click();
      await page.getByRole('button', { name: 'Renamed ' + profile + ' cabin', exact: true }).click();
      await remove.click();
      await expect.poll(async () => (await localState(page)).queues.length).toBe(1);
      const refused = (await localState(page)).queues[0];
      assert.equal(refused.body.command.action, 'bag-trash-empty');
      if (profile === 'phone')
        await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
      let refusedHistory = await packingHistory(page);
      await expect(refusedHistory.getByRole('button', { name: 'Cancel saved bag change', exact: true })).toBeVisible();
      await refusedHistory.getByRole('button', { name: 'Cancel saved bag change', exact: true }).click();
      await refusedHistory.getByRole('alertdialog').getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect.poll(async () => (await localState(page)).queues.length).toBe(0);
      const cancelled = (await localState(page)).archives.find((e) => e.row.id === refused.id);
      assert.deepEqual(cancelled.row, refused);
      assert.equal(cancelled.proof.status, 'cancelled');
      assert.equal(localSql("select bag_id from public.packing_items where id='" + hidden + "';"), occupied.bag.id);
      assert.equal(
        (await rpc('get_family_trip_packing_bag_v1', { p_trip_id: f.browser_trips[index], p_bag_id: occupied.bag.id }))
          .bag.deleted_at,
        null
      );
      const exportButton = refusedHistory.getByRole('button').filter({ hasText: /Export/i });
      const download = page.waitForEvent('download');
      await exportButton.click();
      const file = await download;
      const exported = JSON.parse(await readFile(await file.path(), 'utf8'));
      assert.ok(JSON.stringify(exported).includes(refused.id));
      await refusedHistory.getByRole('button', { name: 'Close', exact: true }).click();
      checks.push({ name: 'native-hidden-zero-weight-refusal-export-and-confirmed-cancellation', passed: true });
      // Fixture-only detachment of its own newly created hidden item permits the existing empty-only native path.
      localSql(
        "update public.packing_items set bag_id=null where id='" +
          hidden +
          "' and trip_id='" +
          f.browser_trips[index] +
          "';"
      );
      await page.reload();
      await page.waitForTimeout(1200);
      await page.getByRole('button', { name: 'Lists', exact: true }).first().click();
      if (profile === 'phone') await page.getByRole('button', { name: 'Bags', exact: true }).last().click();
      await page.getByRole('button', { name: 'Renamed ' + profile + ' cabin', exact: true }).click();
      await (profile === 'phone' ? page.getByRole('dialog') : page)
        .getByRole('button', { name: 'Delete', exact: true })
        .click();
      await expect(page.getByRole('button', { name: 'Renamed ' + profile + ' cabin', exact: true })).toHaveCount(0, {
        timeout: 15000,
      });
      if (profile === 'phone')
        await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
      await page.getByRole('button', { name: 'Packing List · Trash', exact: true }).click();
      const history = page
        .getByRole('presentation')
        .filter({ has: page.getByRole('heading', { name: 'Packing List · Trash', exact: true }) })
        .last();
      await expect(history.getByText('Bag · Renamed ' + profile + ' cabin', { exact: true })).toBeVisible();
      await history.getByRole('button', { name: 'Restore', exact: true }).click();
      await expect(history.getByText('Bag · Renamed ' + profile + ' cabin', { exact: true })).toHaveCount(0, {
        timeout: 15000,
      });
      await history.getByRole('button', { name: 'Close', exact: true }).click();
      checks.push({ name: 'native-empty-Trash-and-exact-restore-real-SDK', passed: true });
      const identity = await rpc('get_family_trip_packing_v1', { p_trip_id: f.browser_trips[index] });
      const itemId = randomUUID();
      await rpc('execute_family_trip_packing_v1', {
        p_trip_id: f.browser_trips[index],
        p_operation_id: randomUUID(),
        p_scope: identity.scope,
        p_action: 'create',
        p_target_id: itemId,
        p_expected_revision: null,
        p_expected_collection_revision: null,
        p_values: { name: 'Assign browser item', category: 'Browser assignment' },
      });
      await page.reload();
      await page.waitForTimeout(1200);
      await page.getByRole('button', { name: 'Lists', exact: true }).first().click();
      await page.getByRole('button', { name: 'Bags', exact: true }).last().click();
      await page
        .getByRole('button', { name: 'Renamed ' + profile + ' cabin', exact: true })
        .last()
        .click();
      await expect
        .poll(async () => {
          const state = await rpc('get_family_trip_packing_v1', { p_trip_id: f.browser_trips[index] });
          const item = state.items.find((i) => i.id === itemId);
          const bag = state.bags.find((b) => b.name === 'Renamed ' + profile + ' cabin');
          return item?.bag_id === bag?.id;
        })
        .toBe(true);
      checks.push({ name: 'native-original-item-bag-assignment', passed: true });
      for (const domain of ['item', 'batch']) {
        const beforeCommands = events.length;
        await arrangeDependent(f.browser_trips[index], domain);
        await page.reload();
        await page.waitForTimeout(1200);
        const lists = page.getByRole('button', { name: 'Lists', exact: true });
        if (await lists.count()) await lists.first().click();
        await page.getByRole('button', { name: 'Packing List · Trash', exact: true }).click();
        const history = page
          .getByRole('presentation')
          .filter({ has: page.getByRole('heading', { name: 'Packing List · Trash', exact: true }) })
          .last();
        const text = domain === 'item' ? 'Dependent browser item' : 'Browser recovery batch';
        const row = history.getByRole('listitem').filter({ hasText: text });
        await row.getByRole('button', { name: 'Restore', exact: true }).click();
        await history.getByRole('button', { name: 'Find parent bag', exact: true }).click();
        await history
          .getByRole('button', { name: 'Restore parent bag · Parent ' + domain + ' bag', exact: true })
          .click();
        await history.getByRole('alertdialog').getByRole('button', { name: 'Confirm', exact: true }).click();
        if (domain === 'item') {
          await history.getByRole('button', { name: 'Retry original packing save', exact: true }).click();
          await expect(history.getByText('Dependent browser item', { exact: true })).toHaveCount(0, { timeout: 15000 });
        } else {
          await history.getByRole('button', { name: 'Cancel saved list restore', exact: true }).click();
          await history.getByRole('alertdialog').getByRole('button', { name: 'Confirm', exact: true }).click();
          await expect
            .poll(
              async () =>
                (await localState(page)).archives.find((e) => e.row.body.command.action === 'category-restore-batch')
                  ?.state
            )
            .toBe('cancelled');
          const originalArchive = (await localState(page)).archives;
          await history.getByRole('button', { name: 'Close', exact: true }).click();
          let reopened = await packingHistory(page);
          await expect(reopened.getByRole('button', { name: 'Prepare new restore · list', exact: true })).toBeVisible();
          await reopened.getByRole('button', { name: 'Close', exact: true }).click();
          await page.reload();
          await page.waitForTimeout(1200);
          reopened = await packingHistory(page);
          await expect(reopened.getByRole('button', { name: 'Prepare new restore · list', exact: true })).toBeVisible();
          await reopened.getByRole('button', { name: 'Close', exact: true }).click();
          await logoutLogin(page, profile);
          await page.goto(server.origin + '/trips/' + f.browser_trips[index]);
          await page.waitForTimeout(1800);
          reopened = await packingHistory(page);
          assert.deepEqual((await localState(page)).archives, originalArchive);
          await expect(reopened.getByRole('button', { name: 'Prepare new restore · list', exact: true })).toBeVisible();
          checks.push({ name: 'durable-cancelled-list-discovery-after-close-reload-real-logout-login', passed: true });
          await reopened.getByRole('button', { name: 'Prepare new restore · list', exact: true }).click();
          await history.getByRole('alertdialog').getByRole('button', { name: 'Confirm', exact: true }).click();
          await expect(row).toHaveCount(0, { timeout: 15000 });
        }
        await expect
          .poll(
            () =>
              events
                .slice(beforeCommands)
                .filter((e) => e.action === 'restore' || e.action === 'category-restore-batch').length
          )
          .toBeGreaterThanOrEqual(2);
        const commands = events
          .slice(beforeCommands)
          .filter((e) => e.action === 'restore' || e.action === 'category-restore-batch');
        assert.ok(commands.length >= 2, 'Both initial and recovery requests must be observed');
        if (domain === 'item') {
          assert.equal(commands[0].operation_id, commands.at(-1).operation_id);
          assert.equal(commands[0].body_sha256, commands.at(-1).body_sha256);
        } else {
          assert.notEqual(commands[0].operation_id, commands.at(-1).operation_id);
          assert.equal(commands[0].target_id, commands.at(-1).target_id);
        }
        await history.getByRole('button', { name: 'Close', exact: true }).click();
        checks.push({ name: 'native-' + domain + '-parent-recovery-real-SDK', passed: true });
      }

      const local = await page.evaluate(async () => {
        const all = await globalThis.indexedDB.databases(),
          rows = [],
          entries = [];
        for (const meta of all.filter((d) => d.name?.startsWith('trek-offline'))) {
          const db = await new Promise((resolve, reject) => {
            const r = globalThis.indexedDB.open(meta.name);
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
            r.onupgradeneeded = () => reject(Error('Unexpected new test database'));
          });
          const read = (table) =>
            new Promise((resolve, reject) => {
              const r = db.transaction(table, 'readonly').objectStore(table).getAll();
              r.onsuccess = () => resolve(r.result);
              r.onerror = () => reject(r.error);
            });
          if (db.objectStoreNames.contains('mutationQueue')) rows.push(...(await read('mutationQueue')));
          if (db.objectStoreNames.contains('syncMeta'))
            for (const m of await read('syncMeta')) entries.push(...(m.familyPackingTerminalArchive?.entries ?? []));
          db.close();
        }
        return {
          pending: rows.length,
          settled: entries.map((e) => ({
            state: e.state,
            operation_id: e.row?.body?.command?.operation_id,
            action: e.row?.body?.command?.action,
          })),
        };
      });
      assert.equal(local.pending, 0, 'All executable originals must be truthfully settled');
      assert.equal(local.settled.length, 2);
      assert.ok(local.settled.every((e) => e.state === 'cancelled'));
      assert.deepEqual(local.settled.map((e) => e.action).sort(), ['bag-trash-empty', 'category-restore-batch']);
      await page.reload();
      await page.waitForTimeout(1200);
      const finished = await packingHistory(page);
      await expect(finished.getByRole('button', { name: /Prepare new restore/ })).toHaveCount(0);
      await finished.getByRole('button', { name: 'Close', exact: true }).click();
      checks.push({ name: 'finished-replacement-not-offered-on-remount', passed: true });
      await writeFile(out + '/local-settlement.json', JSON.stringify(local, null, 2) + '\n');
      checks.push({ name: 'original-preserved-and-queue-empty', passed: true });
      assert.equal(errors.length, 0, JSON.stringify(errors));
      checks.push({ name: 'actual-App-started', passed: !(await page.locator('input[type=email]').count()) });
      assert.equal(await page.locator('input[type=email]').count(), 0, 'Real AAL2 session must reach the Trip');
      assert.equal(blocked.length, 0, 'No transformation may be attempted');
    } finally {
      await page.screenshot({ path: out + '/final.png' });
      await writeFile(out + '/final.txt', await page.locator('body').innerText());
      await writeFile(
        out + '/network.json',
        JSON.stringify({ events, errors, transformation_attempts: blocked }, null, 2) + '\n'
      );
      results.push({ profile, checks, errors, transformation_attempts: blocked.length });
      await context.close();
    }
  }
} finally {
  await writeFile(stage + '/browser-results.json', JSON.stringify(results, null, 2) + '\n');
  await browser.close();
  await proxy.close();
  await server.close();
}
