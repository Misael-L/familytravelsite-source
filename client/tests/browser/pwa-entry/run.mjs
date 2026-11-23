import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { loopbackProxy } from './loopback-proxy.mjs';
import { artifactServer } from './static-server.mjs';
const root = fileURLToPath(new URL('../../..', import.meta.url));
const fixturePath = process.env.FAMILY_PWA_FIXTURE,
  output = process.env.FAMILY_PWA_OUTPUT,
  dist = process.env.FAMILY_PWA_DIST;
for (const value of [fixturePath, output, dist]) assert.ok(value?.startsWith('/private/tmp/trek-u03d9-'));
assert.equal((await stat(fixturePath)).mode & 0o077, 0);
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
assert.equal(fixture.api, 'http://127.0.0.1:55331');
await mkdir(output, { recursive: false, mode: 0o700 });
const require = createRequire(path.join(root, 'package.json')),
  { chromium } = require('playwright'),
  { expect } = require('@playwright/test');
const server = await artifactServer(dist);
const origin = server.origin;
const proxy = await loopbackProxy([origin, fixture.api]);
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  proxy: { server: proxy.url, bypass: '<-loopback>' },
});
const profile = process.env.FAMILY_PWA_PROFILE ?? 'desktop';
const context = await browser.newContext({
  serviceWorkers: 'allow',
  locale: 'en-US',
  viewport: profile === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
  isMobile: profile === 'phone',
  hasTouch: profile === 'phone',
});
const requests = [],
  errors = [],
  checks = [];
const safe = (raw) => {
  const u = new URL(raw);
  return { origin: u.origin, path: u.pathname };
};
context.on('request', (request) =>
  requests.push({ ...safe(request.url()), method: request.method(), worker: !!request.serviceWorker() })
);
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
const record = (name) => {
  checks.push({ name, passed: true });
  process.stdout.write(profile + ': ' + name + '\n');
};
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.toUpperCase().replace(/=/g, '')) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))),
    counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest(),
    offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
async function cacheAudit() {
  return page.evaluate(async () => {
    const rows = [];
    for (const name of await globalThis.caches.keys()) {
      const cache = await globalThis.caches.open(name),
        keys = await cache.keys();
      rows.push({
        name,
        keys: keys.map((r) => {
          const u = new URL(r.url);
          return { origin: u.origin, path: u.pathname, authorized: r.headers.has('authorization') };
        }),
      });
    }
    return rows;
  });
}
async function login(account, mfa) {
  await expect(page.locator('input[type=email]')).toBeVisible({ timeout: 20000 });
  await page.locator('input[type=email]').fill(account.email);
  await page.locator('input[type=password]').fill(account.password);
  await page.locator('button[type=submit]').click();
  if (mfa) {
    await expect(page.locator('input[autocomplete=one-time-code]')).toBeVisible({ timeout: 15000 });
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
async function queueRows() {
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
              const tx = db.transaction('mutationQueue', 'readonly'),
                r = tx.objectStore('mutationQueue').getAll();
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
function queueSummary(rows) {
  return rows.map((r) => ({
    id: r.id,
    tripId: r.tripId,
    body_sha256: createHash('sha256').update(JSON.stringify(r.body)).digest('hex'),
    context_sha256: createHash('sha256')
      .update(
        JSON.stringify({
          ...r,
          status: undefined,
          attempts: undefined,
          lastError: undefined,
          retryAfter: undefined,
          recoveryHold: undefined,
        })
      )
      .digest('hex'),
  }));
}
try {
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await expect(page.locator('input[type=email]')).toBeVisible({ timeout: 30000 });
  await expect.poll(() => context.serviceWorkers().length, { timeout: 60000 }).toBe(1);
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  const audit = await cacheAudit();
  assert.ok(audit.some((c) => c.name.includes('precache') && c.keys.some((k) => k.path === '/index.html')));
  assert.ok(requests.some((r) => r.worker));
  assert.ok(proxy.events.some((r) => r.kind === 'http' && r.origin === origin && r.path.startsWith('/assets/')));
  record(
    'actual generated service worker installs, precaches and controls the native app through the loopback-only proxy'
  );
  await page.locator('input[type=email]').fill(fixture.owner.email);
  await page.locator('input[type=password]').fill(fixture.owner.password);
  await page.locator('button[type=submit]').click();
  await expect(page.locator('input[autocomplete=one-time-code]')).toBeVisible({ timeout: 15000 });
  if (Date.now() % 30000 > 27000) await page.waitForTimeout(3100);
  await page.locator('input[autocomplete=one-time-code]').fill(totp(fixture.owner.secret));
  await page.locator('button[type=submit]').click();
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  record('real password and MFA open the normalized Trip while the actual worker controls the page');
  const file = await page.evaluate(async (id) => {
    const r = await globalThis.fetch('/api/family/files/' + id + '/open');
    const bytes = await r.arrayBuffer(),
      hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return { status: r.status, sha256: [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, '0')).join('') };
  }, fixture.graph.file);
  assert.equal(file.status, 200);
  assert.equal(file.sha256, fixture.file_sha256);
  const cached = await cacheAudit();
  assert.ok(cached.every((c) => c.keys.every((k) => !k.authorized && !/^\/(?:api|rest|auth|storage)\//.test(k.path))));
  record(
    'authorized original private file bytes pass through real SDK/worker networking without entering shared Cache Storage'
  );
  await page.evaluate(async () => {
    for (const name of ['api-data', 'user-uploads']) {
      const c = await globalThis.caches.open(name);
      await c.put(
        '/api/family/legacy-private-fixture',
        new globalThis.Response('synthetic former-owner private bytes')
      );
    }
  });
  await page.evaluate(async () => {
    const r = await globalThis.fetch('/api/auth/logout', { method: 'POST' });
    if (!r.ok) throw Error('Real SDK signout refused');
  });
  await expect(page.locator('input[type=email]')).toBeVisible({ timeout: 20000 });
  await expect
    .poll(async () => (await cacheAudit()).some((c) => ['api-data', 'user-uploads'].includes(c.name)), {
      timeout: 15000,
    })
    .toBe(false);
  const after = await cacheAudit();
  await writeFile(path.join(output, 'cache-audit-after-signout.json'), JSON.stringify(after, null, 2));
  assert.ok(
    !after.some((c) => ['api-data', 'user-uploads'].includes(c.name)),
    'Raw actual SDK signout must retire old unscoped private caches'
  );
  record('actual SDK signout clears former unscoped private worker caches');
  assert.ok(after.some((c) => c.name.includes('precache') && c.keys.some((k) => k.path === '/index.html')));
  record('session retirement preserves the actual static app precache');
  await login(fixture.outsider, false);
  const refused = await page.evaluate(async (id) => {
    const r = await globalThis.fetch('/api/family/files/' + id + '/open');
    return { status: r.status, text: (await r.text()).slice(0, 100) };
  }, fixture.graph.file);
  assert.notEqual(refused.status, 200);
  assert.ok(!refused.text.includes('Local planner entry original file'));
  record('a real second-account SDK session cannot receive the former private original');
  await logout();
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await login(fixture.owner, true);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  const worker = context.serviceWorkers().at(-1);
  await worker.evaluate(async () => {
    try {
      await globalThis.fetch('https://pwa-egress-probe.invalid/worker-proof');
    } catch {
      /* expected network refusal */
    }
  });
  assert.ok(proxy.events.some((e) => e.authority === 'pwa-egress-probe.invalid:443' && e.denied));
  await worker.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const ws = new globalThis.WebSocket('wss://pwa-ws-probe.invalid/worker-proof');
      const t = globalThis.setTimeout(() => {
        ws.close();
        reject(Error('Worker WS probe timed out'));
      }, 10000);
      ws.onerror = () => {
        globalThis.clearTimeout(t);
        resolve();
      };
      ws.onopen = () => {
        globalThis.clearTimeout(t);
        ws.close();
        reject(Error('Outside worker WS escaped the guard'));
      };
    });
  });
  assert.ok(proxy.events.some((e) => e.authority === 'pwa-ws-probe.invalid:443' && e.denied));
  record('browser proxy refuses explicit worker-owned HTTP and WebSocket outside-origin probes before forwarding');
  proxy.setOffline(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 15000 })
    .toBe(true);
  await expect(page.getByText('Fixture city ' + fixture.trip_id, { exact: true })).toHaveCount(0);
  assert.ok((await cacheAudit()).every((c) => c.keys.every((k) => !/^\/(?:api|rest|auth|storage)\//.test(k.path))));
  record(
    'offline shell remains controlled but private Trip startup reaches the existing error boundary without cached private API data'
  );
  await expect(page.getByText('Something went wrong', { exact: true })).toBeVisible();
  const offlineState = {
    trip_startup_qualified: false,
    visible_text: await page.locator('body').innerText(),
    details: await page.locator('details').allTextContents(),
  };
  await writeFile(path.join(output, 'offline-startup-blocker.json'), JSON.stringify(offlineState, null, 2));
  await page.screenshot({ path: path.join(output, 'offline-refusal.png'), fullPage: true });
  await context.setOffline(false);
  proxy.setOffline(false);
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  record('reconnect opens the current authorized normalized Trip through actual SDK reads');
  if (profile === 'phone' && (await page.getByRole('button', { name: 'Lists', exact: true }).count()) === 0) {
    const more = page.getByRole('button', { name: 'More', exact: true });
    if (await more.isVisible()) await more.click();
  }
  await page.getByRole('button', { name: 'Lists', exact: true }).first().click();
  await page
    .getByRole('button', { name: /^To.do\b/i })
    .first()
    .click();
  await expect(page.getByText('Original bootstrap task', { exact: true }).first()).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: profile === 'phone' ? 'New task' : 'Add new task', exact: true }).click();
  const title = page.getByPlaceholder('Task name');
  await title.fill('D9 original retained native task');
  const attempts = [];
  await page.route('**/rest/v1/rpc/execute_family_trip_task_v1', (route) => {
    const body = route.request().postData() ?? '',
      payload = JSON.parse(body);
    attempts.push({
      operation_id: payload.p_operation_id,
      body_sha256: createHash('sha256').update(body).digest('hex'),
    });
    return route.abort('failed');
  });
  await page.getByRole('button', { name: /^Create/ }).click();
  await expect.poll(() => attempts.length, { timeout: 15000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await queueRows()).length, { timeout: 15000 }).toBe(1);
  await expect(page.getByRole('button', { name: /^Create/ })).toBeEnabled();
  await page.getByRole('button', { name: /^Create/ }).click();
  await expect.poll(() => attempts.length, { timeout: 15000 }).toBe(2);
  assert.deepEqual(attempts[1], attempts[0]);
  const original = await queueRows();
  const originalBody = original[0].body;
  assert.ok(originalBody);
  await expect(title).toHaveValue('D9 original retained native task');
  await writeFile(
    path.join(output, 'original-command.json'),
    JSON.stringify({ attempts, queue: queueSummary(original) }, null, 2)
  );
  record(
    'native same-form retry preserves one original command, identical operation/body and typed values after two failed real RPC attempts'
  );
  const second = process.env.FAMILY_PWA_NEXT_DIST;
  assert.ok(second?.startsWith('/private/tmp/trek-u03d9-'));
  server.switchDirectory(second);
  const changesBefore = await page.evaluate(() => {
    globalThis.__d9ControllerChanges = 0;
    globalThis.navigator.serviceWorker.addEventListener('controllerchange', () => globalThis.__d9ControllerChanges++);
    return globalThis.__d9ControllerChanges;
  });
  assert.equal(changesBefore, 0);
  await page.evaluate(async () => {
    const r = await globalThis.navigator.serviceWorker.getRegistration();
    await r.update();
  });
  await expect.poll(() => page.evaluate(() => globalThis.__d9ControllerChanges), { timeout: 90000 }).toBeGreaterThan(0);
  await expect(title).toHaveValue('D9 original retained native task');
  assert.deepEqual(queueSummary(await queueRows()), queueSummary(original));
  const expectedIndex = await readFile(path.join(second, 'index.html'), 'utf8');
  const nextEntry = expectedIndex.match(/src="(\/assets\/index-[^"]+\.js)"/)[1];
  await expect
    .poll(async () => (await cacheAudit()).some((c) => c.keys.some((k) => k.path === nextEntry)), { timeout: 30000 })
    .toBe(true);
  record(
    'actual second-build worker activates and precaches its new entry without replacing typed work or command identity'
  );
  await page.screenshot({ path: path.join(output, 'updated-worker-retained-form.png'), fullPage: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect
    .poll(
      () =>
        page.evaluate(
          (entry) => [...globalThis.document.scripts].some((s) => new URL(s.src).pathname === entry),
          nextEntry
        ),
      { timeout: 20000 }
    )
    .toBe(true);
  assert.deepEqual(queueSummary(await queueRows()), queueSummary(original));
  record(
    'explicit new-build reload preserves original queued source, actor, Trip, layer, revisions, operation and body'
  );
  await logout();
  assert.deepEqual(queueSummary(await queueRows()), queueSummary(original));
  record('SDK logout after worker replacement preserves the unresolved original account command');
  await writeFile(path.join(output, 'cache-audit-final.json'), JSON.stringify(await cacheAudit(), null, 2));
  const providers = new Set([
    'https://api.frankfurter.dev',
    'https://tiles.openfreemap.org',
    'https://tile.openstreetmap.org',
    'https://archive-api.open-meteo.com',
    'https://api.open-meteo.com',
    'https://routing.openstreetmap.de',
    'https://pwa-egress-probe.invalid',
    'wss://pwa-ws-probe.invalid',
  ]);
  const unknown = requests.filter(
    (r) => ![origin, fixture.api, 'ws://127.0.0.1:55331'].includes(r.origin) && !providers.has(r.origin)
  );
  assert.deepEqual(unknown, []);
  assert.equal(requests.filter((r) => r.path.includes('/render/image/')).length, 0);
  assert.deepEqual(errors, []);
  record(
    'page and worker observations contain no unknown application origin, transformation attempt or page exception'
  );
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
  await writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ message: error.message, text: (await page.locator('body').innerText()).slice(-3500) }, null, 2)
  );
  throw error;
} finally {
  await writeFile(
    path.join(output, 'pwa-checks.json'),
    JSON.stringify({ profile, checks, errors, requests, proxy: proxy.events }, null, 2)
  );
  await context.close();
  await browser.close();
  await proxy.close();
  await server.close();
}
