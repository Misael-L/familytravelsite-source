// Real index/main/App, installed SDK and generated worker; only marked loopback fixtures.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { loopbackProxy } from '../pwa-entry/loopback-proxy.mjs';
import { artifactServer } from '../pwa-entry/static-server.mjs';
const root = fileURLToPath(new URL('../../..', import.meta.url));
const input = process.env.FAMILY_STARTUP_FIXTURE,
  output = process.env.FAMILY_STARTUP_OUTPUT,
  dist = process.env.FAMILY_STARTUP_DIST;
for (const v of [input, output]) assert.ok(v?.startsWith('/private/tmp/trek-u03d10-'));
assert.match(dist ?? '', /^\/private\/tmp\/trek-u03d(?:9|10)-/);
assert.equal((await stat(input)).mode & 0o077, 0);
const fixture = JSON.parse(await readFile(input, 'utf8'));
assert.equal(fixture.api, 'http://127.0.0.1:55331');
await mkdir(output, { recursive: false, mode: 0o700 });
const require = createRequire(path.join(root, 'package.json')),
  { chromium } = require('playwright'),
  { expect } = require('@playwright/test');
const server = await artifactServer(dist),
  origin = server.origin,
  proxy = await loopbackProxy([origin, fixture.api]);
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  proxy: { server: proxy.url, bypass: '<-loopback>' },
});
const phone = process.env.FAMILY_STARTUP_PROFILE === 'phone',
  profile = phone ? 'phone' : 'desktop';
const context = await browser.newContext({
  serviceWorkers: 'allow',
  locale: 'en-US',
  viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
  isMobile: phone,
  hasTouch: phone,
});
const page = await context.newPage(),
  events = [],
  responses = [],
  checks = [],
  errors = [],
  caught = [];
const safe = (raw) => {
  const u = new URL(raw);
  return { origin: u.origin, path: u.pathname };
};
context.on('request', (r) => events.push({ ...safe(r.url()), method: r.method(), worker: !!r.serviceWorker() }));
context.on('response', (r) => responses.push({ ...safe(r.url()), status: r.status() }));
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && m.text().includes('[ErrorBoundary:')) caught.push(m.text().slice(0, 200));
});
const record = (name) => {
  checks.push({ name, passed: true });
  process.stdout.write(profile + ': ' + name + '\n');
};
const privateTrip = (r) =>
  /^\/rest\/v1\/rpc\/(?:get_family_trip_(?:planner_view|tasks|packing|booking_view)_v1|execute_family_trip_)/.test(
    r.path
  );
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.toUpperCase().replace(/=/g, '')) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((x) => parseInt(x, 2))),
    counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac('sha1', key).update(counter).digest(),
    offset = hash[19] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
async function login(account, mfa = false) {
  await expect(page.locator('input[type=email]')).toBeVisible({ timeout: 30000 });
  await page.locator('input[type=email]').fill(account.email);
  await page.locator('input[type=password]').fill(account.password);
  await page.locator('button[type=submit]').click();
  if (mfa) {
    await expect(page.locator('input[autocomplete=one-time-code]')).toBeVisible({ timeout: 20000 });
    if (Date.now() % 30000 > 27000) await page.waitForTimeout(3100);
    await page.locator('input[autocomplete=one-time-code]').fill(totp(account.secret));
    await page.locator('button[type=submit]').click();
  }
  await expect(page.locator('input[type=email]')).toHaveCount(0, { timeout: 30000 });
}
async function logout() {
  await page.evaluate(async () => {
    const r = await globalThis.fetch('/api/auth/logout', { method: 'POST' });
    if (!r.ok) throw Error('Actual SDK signout refused');
  });
  await expect(page.locator('input[type=email]')).toBeVisible({ timeout: 30000 });
}
async function tripReady() {
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
}
async function offline() {
  proxy.setOffline(true);
  await context.setOffline(true);
}
async function online() {
  proxy.setOffline(false);
  await context.setOffline(false);
}
async function recovered() {
  await expect(page.getByText('You appear to be offline', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0);
}
async function queue() {
  return page.evaluate(async () => {
    const rows = [];
    for (const { name } of await globalThis.indexedDB.databases()) {
      if (!name?.startsWith('trek-offline-u')) continue;
      const db = await new Promise((resolve, reject) => {
        const r = globalThis.indexedDB.open(name);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        if (db.objectStoreNames.contains('mutationQueue'))
          rows.push(
            ...(await new Promise((resolve, reject) => {
              const r = db.transaction('mutationQueue', 'readonly').objectStore('mutationQueue').getAll();
              r.onsuccess = () => resolve(r.result);
              r.onerror = () => reject(r.error);
            }))
          );
      } finally {
        db.close();
      }
    }
    return rows;
  });
}
function original(rows) {
  return rows.map((r) => ({
    id: r.id,
    tripId: r.tripId,
    method: r.method,
    url: r.url,
    createdAt: r.createdAt,
    schemaVersion: r.schemaVersion,
    baseUpdatedAt: r.baseUpdatedAt,
    retentionPolicy: r.retentionPolicy,
    body_sha256: createHash('sha256').update(JSON.stringify(r.body)).digest('hex'),
  }));
}
let heldRelease = () => {};
async function reconnectHeld() {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  heldRelease = release;
  let started = 0;
  const handler = async (route) => {
    started++;
    await gate;
    await route.continue();
  };
  await page.route('**/rest/v1/rpc/get_my_auth_bootstrap', handler);
  const before = events.length;
  await online();
  await expect.poll(() => started, { timeout: 20000 }).toBeGreaterThan(0);
  assert.equal(events.slice(before).filter(privateTrip).length, 0);
  await expect(page.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0);
  record('reconnect holds protected planner/command requests until actual Family bootstrap answers');
  release();
  // Keep the released pass-through installed; removing it can double-handle an in-flight route.
}
try {
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await expect(page.locator('input[type=email]')).toBeVisible({ timeout: 30000 });
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  assert.equal(events.filter(privateTrip).length, 0);
  record(
    'actual worker-controlled sessionless startup preserves the Trip redirect and issues no private planner request'
  );
  await login(fixture.owner, true);
  await tripReady();
  record('real password, MFA and current Family validation open the normalized Trip');
  const file = await page.evaluate(async (id) => {
    const r = await globalThis.fetch('/api/family/files/' + id + '/open');
    const hash = await globalThis.crypto.subtle.digest('SHA-256', await r.arrayBuffer());
    return { status: r.status, sha: [...new Uint8Array(hash)].map((x) => x.toString(16).padStart(2, '0')).join('') };
  }, fixture.graph.file);
  assert.equal(file.status, 200);
  assert.equal(file.sha, fixture.file_sha256);
  record('current authorized original private bytes remain readable through the real SDK');
  const cold = events.length;
  await offline();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await recovered();
  assert.equal(events.slice(cold).filter(privateTrip).length, 0);
  record(
    'cold offline reload reaches owned Family recovery without mounting a private controller or generic error boundary'
  );
  await page.screenshot({ path: path.join(output, 'cold-offline-recovery.png'), fullPage: true });
  if (process.env.FAMILY_STARTUP_BEFORE === '1')
    throw Error('Before build unexpectedly passed the repaired offline contract');
  await reconnectHeld();
  await tripReady();
  record('an ordinary online event revalidates access and opens the current Trip without a page reload');
  await page.getByRole('button', { name: 'Lists', exact: true }).first().click();
  await page
    .getByRole('button', { name: /^To.do\b/i })
    .first()
    .click();
  await expect(page.getByText('Original bootstrap task', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: phone ? 'New task' : 'Add new task', exact: true }).click();
  const title = page.getByPlaceholder('Task name');
  await title.fill('D10 original retained native task');
  await offline();
  await expect(title).toHaveValue('D10 original retained native task');
  record('a warm native task form keeps its exact typed text across a real connection loss');
  await page.getByRole('button', { name: /^Create/ }).click();
  await expect.poll(async () => (await queue()).length, { timeout: 20000 }).toBe(1);
  const initial = original(await queue());
  await writeFile(path.join(output, 'original-command.json'), JSON.stringify(initial, null, 2));
  record('offline native save retains one original operation and body without claiming a server save');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await recovered();
  assert.deepEqual(original(await queue()), initial);
  record('cold recovery preserves original queued source, actor, Trip, layer, revision and operation identity');
  await reconnectHeld();
  await expect(page.getByText(/Planner refresh is held to preserve local work/).first()).toBeVisible({
    timeout: 30000,
  });
  assert.deepEqual(original(await queue()), initial);
  await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);
  record('fresh access validation leaves unresolved original work at its owned planner recovery guard');
  const snapshots = await page.evaluate(() => ({
    native: globalThis.localStorage.getItem('trek_native_auth_snapshot'),
    family: globalThis.localStorage.getItem('trek_auth_snapshot'),
  }));
  await logout();
  assert.deepEqual(original(await queue()), initial);
  await login(fixture.outsider);
  const denied = await page.evaluate(
    async (id) => (await globalThis.fetch('/api/family/files/' + id + '/open')).status,
    fixture.graph.file
  );
  assert.notEqual(denied, 200);
  await expect(page.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0);
  assert.deepEqual(original(await queue()), initial);
  record('real second-account access cannot open the former private file or borrow its retained command');
  await logout();
  if (fixture.suspended) {
    await login(fixture.suspended);
    await expect(page.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0);
    const status = await page.evaluate(
      async (id) => (await globalThis.fetch('/api/family/files/' + id + '/open')).status,
      fixture.graph.file
    );
    assert.notEqual(status, 200);
    record('an actual suspended membership remains at its current Family access gate');
    await logout();
  }
  await page.evaluate((s) => {
    for (const [k, v] of [
      ['trek_native_auth_snapshot', s.native],
      ['trek_auth_snapshot', s.family],
    ])
      if (v) globalThis.localStorage.setItem(k, v);
  }, snapshots);
  const signedOut = events.length;
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await expect(page.locator('input[type=email]')).toBeVisible({ timeout: 30000 });
  assert.equal(events.slice(signedOut).filter(privateTrip).length, 0);
  record('authoritative SDK signout overrides deliberately restored display snapshots on a cold reload');
  await login(fixture.owner, true);
  await expect(page.getByText(/Planner refresh is held to preserve local work/).first()).toBeVisible({
    timeout: 30000,
  });
  await page.evaluate(() => {
    globalThis.localStorage.removeItem('trek_native_auth_snapshot');
    globalThis.localStorage.removeItem('trek_auth_snapshot');
  });
  await offline();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await recovered();
  assert.deepEqual(original(await queue()), initial);
  record(
    'incomplete display evidence with a real cached SDK session produces recoverable validation, preserving the original account command'
  );
  await reconnectHeld();
  await expect(page.getByText(/Planner refresh is held to preserve local work/).first()).toBeVisible({
    timeout: 30000,
  });
  assert.deepEqual(original(await queue()), initial);
  record('reconnect from missing display evidence reopens the actual owner and keeps pending original work intact');
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  const known = new Set([
    origin,
    fixture.api,
    'ws://127.0.0.1:55331',
    'https://api.frankfurter.dev',
    'https://tiles.openfreemap.org',
    'https://tile.openstreetmap.org',
    'https://archive-api.open-meteo.com',
    'https://api.open-meteo.com',
    'https://routing.openstreetmap.de',
  ]);
  assert.deepEqual(
    events.filter((e) => !known.has(e.origin)),
    []
  );
  assert.equal(events.filter((e) => e.path.includes('/render/image/')).length, 0);
  record(
    'actual page/worker observations have no generic error boundary, unknown application origin or transformation attempt'
  );
  await page.screenshot({ path: path.join(output, 'owned-retained-recovery.png'), fullPage: true });
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
  await writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ message: error.message, text: (await page.locator('body').innerText()).slice(-3500) }, null, 2)
  );
  throw error;
} finally {
  heldRelease();
  await writeFile(
    path.join(output, 'startup-checks.json'),
    JSON.stringify({ profile, checks, errors, caught, events, responses, proxy: proxy.events }, null, 2)
  );
  await context.close();
  await browser.close();
  await proxy.close();
  await server.close();
}
