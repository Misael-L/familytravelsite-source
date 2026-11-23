// Read-only inventory of the real application, SDK and generated service worker.
// It proves retirement and remaining coverage gaps; it does not enable cold Trip reads.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
const root = process.env.FAMILY_OFFLINE_INVENTORY_ROOT ?? fileURLToPath(new URL('../../..', import.meta.url));
assert.equal(root.replace(/\/$/, ''), '/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.2/client');
const input = process.env.FAMILY_OFFLINE_INVENTORY_FIXTURE,
  output = process.env.FAMILY_OFFLINE_INVENTORY_OUTPUT,
  dist = process.env.FAMILY_OFFLINE_INVENTORY_DIST,
  proofPath = process.env.FAMILY_OFFLINE_INVENTORY_LOCAL_PROOF;
assert.match(input ?? '', /^\/private\/tmp\/trek-u03d12-[^/]+\/(?:desktop|phone)-fixture\/private-fixture\.json$/);
for (const v of [output, proofPath]) assert.ok(/^\/private\/tmp\/trek-u03d(?:14|15)-/.test(v ?? ''));
assert.match(dist ?? '', /^\/private\/tmp\/trek-u03d(?:12|14|15)-[^/]+\/build(?:-qualified)?\/actual-dist$/);
assert.equal((await stat(input)).mode & 0o077, 0);
const fixture = JSON.parse(await readFile(input, 'utf8')),
  proof = JSON.parse(await readFile(proofPath, 'utf8'));
assert.equal(fixture.api, 'http://127.0.0.1:55331');
assert.equal(proof.api, fixture.api);
assert.equal(proof.marked_local_only, true);
assert.equal(proof.read_only_sql, true);
assert.equal(proof.migrations, 119);
const build = JSON.parse(await readFile(path.join(dist, '..', 'actual-build.json'), 'utf8'));
assert.equal(
  createHash('sha256')
    .update(await readFile(path.join(dist, '..', 'actual-build.json')))
    .digest('hex'),
  proof.build_manifest_sha256
);
for (const [n, hash] of Object.entries(build.artifact_hashes))
  assert.equal(
    createHash('sha256')
      .update(await readFile(path.join(dist, n)))
      .digest('hex'),
    hash
  );
await mkdir(output, { recursive: false, mode: 0o700 });
const { artifactServer } = await import(path.join(root, 'tests/browser/pwa-entry/static-server.mjs')),
  { loopbackProxy } = await import(path.join(root, 'tests/browser/pwa-entry/loopback-proxy.mjs')),
  require = createRequire(path.join(root, 'package.json')),
  { chromium } = require('playwright'),
  { expect } = require('@playwright/test');
const server = await artifactServer(dist),
  origin = server.origin,
  proxy = await loopbackProxy([origin, fixture.api]),
  browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    proxy: { server: proxy.url, bypass: '<-loopback>' },
  }),
  phone = process.env.FAMILY_OFFLINE_INVENTORY_PROFILE === 'phone',
  context = await browser.newContext({
    serviceWorkers: 'allow',
    locale: 'en-US',
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    isMobile: phone,
    hasTouch: phone,
  }),
  page = await context.newPage(),
  checks = [],
  errors = [],
  caught = [],
  events = [],
  responses = [];
context.on('request', (r) => {
  const u = new URL(r.url());
  events.push({
    origin: u.origin,
    path: u.pathname,
    method: r.method(),
    worker: !!r.serviceWorker(),
  });
});
context.on('response', (r) => {
  const u = new URL(r.url());
  responses.push({ origin: u.origin, path: u.pathname, status: r.status() });
});
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && m.text().includes('[ErrorBoundary:')) caught.push(m.text().slice(0, 200));
});
const record = (name) => {
  checks.push({ name, passed: true });
  process.stdout.write(name + '\n');
};
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
  await expect(page.locator('input[type=email]')).toBeVisible({
    timeout: 30000,
  });
  await page.locator('input[type=email]').fill(account.email);
  await page.locator('input[type=password]').fill(account.password);
  await page.locator('button[type=submit]').click();
  if (mfa) {
    await expect(page.locator('input[autocomplete=one-time-code]')).toBeVisible({ timeout: 20000 });
    if (Date.now() % 30000 > 27000) await page.waitForTimeout(3100);
    await page.locator('input[autocomplete=one-time-code]').fill(totp(account.secret));
    await page.locator('button[type=submit]').click();
  }
  await expect(page.locator('input[type=email]')).toHaveCount(0, {
    timeout: 30000,
  });
}
async function inventory() {
  return page.evaluate(async () => {
    const hash = async (v) =>
      Array.from(
        new Uint8Array(
          await globalThis.crypto.subtle.digest('SHA-256', new globalThis.TextEncoder().encode(JSON.stringify(v)))
        )
      )
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    const databases = [];
    for (const entry of await globalThis.indexedDB.databases()) {
      const db = await new Promise((resolve, reject) => {
        const r = globalThis.indexedDB.open(entry.name);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(Error('Inventory database open failed'));
      });
      try {
        const stores = {};
        for (const name of db.objectStoreNames) {
          const values = await new Promise((resolve, reject) => {
            const t = db.transaction(name, 'readonly'),
              r = t.objectStore(name).getAll();
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(Error('Inventory read failed'));
          });
          stores[name] = { count: values.length };
          if (entry.name === 'family-planner-cache-v1' && name === 'snapshots') {
            stores[name].rows = await Promise.all(
              values.map(async (row) => ({
                key: row.key,
                storedAt: row.storedAt,
                value_sha256: await hash(row.value),
                envelope_fields: Object.keys(row.value).sort(),
                planner_fields: Object.keys(row.value.view).sort(),
                state_fields: Object.keys(row.value.view.state).sort(),
                counts: Object.fromEntries(
                  Object.entries(row.value.view.state)
                    .filter(([, v]) => Array.isArray(v))
                    .map(([k, v]) => [k, v.length])
                ),
                variants: row.value.variants.length,
                components_absent: [
                  'trip',
                  'familyTaskSnapshot',
                  'familyPackingSnapshot',
                  'bookings',
                  'budgetItems',
                  'files',
                  'members',
                  'categories',
                  'tags',
                ].filter((k) => !(k in row.value)),
              }))
            );
          }
          if (entry.name === 'family-planner-cache-v1' && name === 'completeSnapshots') {
            const canonical = (v) =>
              v === null || typeof v !== 'object'
                ? JSON.stringify(v)
                : Array.isArray(v)
                  ? '[' + v.map(canonical).join(',') + ']'
                  : '{' +
                    Object.keys(v)
                      .sort()
                      .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
                      .join(',') +
                    '}';
            const digest = async (v) =>
              Array.from(
                new Uint8Array(
                  await globalThis.crypto.subtle.digest('SHA-256', new globalThis.TextEncoder().encode(canonical(v)))
                )
              )
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');
            stores[name].rows = await Promise.all(
              values.map(async (row) => {
                const { digest: expected, ...body } = row.value;
                return {
                  id: row.id,
                  key: row.cacheKey,
                  format: row.value.format,
                  digest: expected,
                  integrity_valid: (await digest(body)) === expected,
                  components: Object.keys(row.value.data).sort(),
                  manifests: row.value.manifests,
                  capabilities: row.value.capabilities,
                  media_bytes_available: row.value.media.some((m) => m.bytesAvailable),
                  media_count: row.value.media.length,
                  binding_count: row.value.bindings.length,
                };
              })
            );
          }
          if (entry.name === 'family-planner-cache-v1' && name === 'completeHeads')
            stores[name].rows = values.map((r) => ({ key: r.key, generation: r.generation }));
          if (name === 'mutationQueue') stores[name].sha256 = await hash(values);
        }
        databases.push({ name: entry.name, stores });
      } finally {
        db.close();
      }
    }
    return { databases, caches: await globalThis.caches.keys() };
  });
}
const scopedRows = (v) => v.databases.find((d) => d.name === 'family-planner-cache-v1')?.stores.snapshots.rows ?? [];
const nativeRows = (v) =>
  v.databases
    .filter((d) => d.name.startsWith('trek-offline'))
    .flatMap((d) => Object.entries(d.stores).map(([name, s]) => ({ name, ...s })));
const snapshots = {};
const expectComplete = process.env.FAMILY_OFFLINE_INVENTORY_COMPLETE === '1';
const completeStores = (v) => v.databases.find((d) => d.name === 'family-planner-cache-v1')?.stores;
try {
  let legacyKey;
  if (process.env.FAMILY_OFFLINE_INVENTORY_SEED_LEGACY === '1') {
    // Storage-only setup document; the tested Trip still uses unchanged real main/App/SDK/worker.
    await page.route(origin + '/__fixture_cache_setup__', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>Local storage setup</title>',
      })
    );
    await page.goto(origin + '/__fixture_cache_setup__');
    legacyKey = await page.evaluate(
      async ({ api, user, family, trip }) => {
        const scope = {
          user_id: user,
          family_id: family,
          person_id: 'a1400000-0000-4000-8000-000000000903',
          trip_id: trip,
          layer: 'published',
        };
        const key = JSON.stringify([1, api, user, family, scope.person_id, trip, 'published']);
        const db = await new Promise((resolve, reject) => {
          const request = globalThis.indexedDB.open('family-planner-cache-v1', 10);
          request.onupgradeneeded = () => request.result.createObjectStore('snapshots', { keyPath: 'key' });
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(new Error('Legacy cache setup failed'));
        });
        try {
          await new Promise((resolve, reject) => {
            const transaction = db.transaction('snapshots', 'readwrite');
            transaction.objectStore('snapshots').put({
              key,
              storedAt: Date.now(),
              value: {
                variants: [],
                view: {
                  version: 1,
                  scope,
                  state: {
                    version: 1,
                    trip_id: trip,
                    family_id: family,
                    trip_revision: 1,
                    locations: [],
                    visits: [],
                    days: [],
                    notes: [],
                    destinations: [],
                  },
                  operations: [],
                  bindings: [],
                  draft_token: null,
                  readiness: { ready: true, blockers: [] },
                },
              },
            });
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(new Error('Legacy cache setup refused'));
          });
        } finally {
          db.close();
        }
        return key;
      },
      { api: fixture.api, user: fixture.owner.id, family: fixture.family_id, trip: fixture.trip_id }
    );
    snapshots.legacy_before_bootstrap = await inventory();
    assert.equal(scopedRows(snapshots.legacy_before_bootstrap).length, 1);
    assert.equal(
      snapshots.legacy_before_bootstrap.databases.find((d) => d.name === 'family-planner-cache-v1').stores.owners,
      undefined
    );
  }
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), {
      timeout: 90000,
    })
    .toBe(true);
  await login(fixture.owner, true);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  record('real worker and SDK password/MFA open the current authorized Trip');
  if (expectComplete)
    await expect
      .poll(async () => completeStores(await inventory())?.completeHeads.count ?? 0, { timeout: 30000 })
      .toBeGreaterThan(0);
  snapshots.online = await inventory();
  if (legacyKey) {
    assert.ok(scopedRows(snapshots.online).every((r) => r.key !== legacyKey));
    assert.ok(snapshots.online.databases.find((d) => d.name === 'family-planner-cache-v1').stores.owners);
    record('ordinary bootstrap upgrades an actual v1 IndexedDB database and retires known unqualified legacy rows');
  }
  const rows = scopedRows(snapshots.online);
  assert.ok(rows.length > 0);
  for (const row of rows) {
    const scope = JSON.parse(row.key);
    assert.equal(scope[0], 1);
    assert.equal(scope[1], fixture.api);
    assert.equal(scope[2], fixture.owner.id);
    assert.equal(scope[3], fixture.family_id);
    assert.equal(scope[5], fixture.trip_id);
    assert.equal(scope[6], 'published');
    assert.deepEqual(row.envelope_fields, ['variants', 'view']);
    assert.equal(row.components_absent.length, 9);
  }
  assert.ok(
    nativeRows(snapshots.online)
      .filter((s) =>
        ['trips', 'days', 'places', 'todoItems', 'packingItems', 'reservations', 'tripFiles'].includes(s.name)
      )
      .every((s) => s.count === 0)
  );
  record(
    'actual scoped cache contains only checked planner view and variant descriptors; native companion tables stay empty'
  );
  if (expectComplete) {
    const stores = completeStores(snapshots.online),
      complete = stores.completeSnapshots.rows;
    assert.ok(complete.length > 0);
    for (const row of complete) {
      assert.equal(row.format, 'family.offline-trip.v1');
      assert.equal(row.integrity_valid, true);
      assert.deepEqual(row.components, ['booking', 'companions', 'header', 'packing', 'planner', 'tasks']);
      assert.deepEqual(row.capabilities, { coldRead: false, writes: false, tags: false, mediaBytes: false });
      assert.equal(row.media_bytes_available, false);
      assert.ok(row.binding_count > 0);
    }
    for (const head of stores.completeHeads.rows)
      assert.ok(complete.some((r) => r.id === head.generation && r.key === head.key));
    record(
      'ordinary online handler captures complete canonical components with valid SHA-256 and one matching generation pointer'
    );
    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const r = globalThis.indexedDB.open('family-planner-cache-v1');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        const read = db.transaction(['completeSnapshots', 'completeHeads'], 'readonly');
        const original = await new Promise((resolve) => {
          const r = read.objectStore('completeSnapshots').getAll();
          r.onsuccess = () => resolve(r.result[0]);
        });
        await new Promise((resolve, reject) => {
          const tx = db.transaction(['completeSnapshots', 'completeHeads'], 'readwrite'),
            id = globalThis.crypto.randomUUID();
          tx.objectStore('completeSnapshots').add({ ...original, id });
          const r = tx.objectStore('completeHeads').put({ key: original.cacheKey, generation: id });
          r.onsuccess = () => tx.abort();
          tx.onabort = resolve;
          tx.oncomplete = () => reject(Error('Expected atomic transaction abort'));
        });
      } finally {
        db.close();
      }
    });
    assert.deepEqual(completeStores(await inventory()).completeSnapshots, stores.completeSnapshots);
    assert.deepEqual(completeStores(await inventory()).completeHeads, stores.completeHeads);
    record('actual browser IndexedDB abort preserves both the previous complete envelope and active pointer');
  }
  proxy.setOffline(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('You appear to be offline', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0);
  snapshots.cold_offline = await inventory();
  assert.deepEqual(scopedRows(snapshots.cold_offline), rows);
  if (expectComplete)
    assert.deepEqual(
      completeStores(snapshots.cold_offline).completeHeads,
      completeStores(snapshots.online).completeHeads
    );
  record('cold offline entry remains gated and preserves current scoped cache generations');
  proxy.setOffline(false);
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  snapshots.reconnected = await inventory();
  record('real reconnect revalidates current access before returning to native planner');
  await page.evaluate(async () => {
    const r = await globalThis.fetch('/api/auth/logout', { method: 'POST' });
    if (!r.ok) throw Error('Actual SDK signout failed');
  });
  await expect(page.locator('input[type=email]')).toBeVisible({
    timeout: 30000,
  });
  snapshots.logged_out = await inventory();
  const after = scopedRows(snapshots.logged_out);
  assert.equal(after.length, 0);
  if (expectComplete) {
    assert.equal(completeStores(snapshots.logged_out).completeHeads.count, 0);
    assert.equal(completeStores(snapshots.logged_out).completeSnapshots.count, 0);
    record('actual SDK logout retires complete envelopes and pointers with the existing partial cache');
  }
  record('completed actual logout removes the retired planner snapshots');
  assert.ok(!snapshots.logged_out.caches.some((n) => ['api-data', 'user-uploads'].includes(n)));
  assert.ok(nativeRows(snapshots.logged_out).every((s) => s.count === 0));
  record('native read tables and legacy HTTP caches retire while the static worker cache survives');
  await login(fixture.outsider);
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await expect(page.getByRole('heading', { name: 'Family access', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/you are not an active member of a family yet/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0);
  snapshots.other_account = await inventory();
  assert.deepEqual(
    scopedRows(snapshots.other_account).map((r) => [r.key, r.value_sha256]),
    after.map((r) => [r.key, r.value_sha256])
  );
  record('second account cannot open the original Trip or recover a retired planner snapshot');
  assert.ok(!events.some((e) => e.path.includes('/render/image/')));
  assert.ok(!events.some((e) => e.path.includes('/execute_family_')));
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  record('zero transformation attempts, domain-command execution attempts or generic/uncaught errors');
  await page.screenshot({
    path: path.join(output, 'other-account.png'),
    fullPage: true,
  });
} catch (e) {
  await writeFile(path.join(output, 'failure.json'), JSON.stringify({ message: e.message, stack: e.stack }, null, 2));
  await page.screenshot({
    path: path.join(output, 'failure.png'),
    fullPage: true,
  });
  throw e;
} finally {
  // Scope keys are synthetic fixture identifiers; no row content, token or password is exported.
  await writeFile(
    path.join(output, 'inventory.json'),
    JSON.stringify(
      {
        profile: phone ? 'phone' : 'desktop',
        checks,
        snapshots,
        errors,
        caught,
        events,
        responses,
        proxy: proxy.events,
        proxyTransportErrors: proxy.transportErrors,
        build_manifest_sha256: proof.build_manifest_sha256,
      },
      null,
      2
    )
  );
  await context.close();
  await browser.close();
  await proxy.close();
  await server.close();
}
