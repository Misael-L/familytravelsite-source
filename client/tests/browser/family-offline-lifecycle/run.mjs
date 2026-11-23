// Read-only inventory of the real application, SDK and generated service worker.
// D16b actual companion tabs and lifecycle acceptance; ordinary/hosted activation stays disabled.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
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
for (const v of [output, proofPath]) assert.ok(/^\/private\/tmp\/trek-u03d(?:16)-/.test(v ?? ''));
assert.match(dist ?? '', /^\/private\/tmp\/trek-u03d(?:16)-[^/]+\/build(?:-qualified)?\/actual-dist$/);
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
const { responseBarrier } = await import(path.join(root, 'tests/browser/pwa-entry/response-barrier.mjs'));
const delayed = process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'private-bodies' ? responseBarrier() : null;
const { installStorageFaults } = await import(
  path.join(root, 'tests/browser/family-offline-lifecycle/storage-faults.mjs')
);
// D16g only: synthetic public WebP at the marked local fixture URL, including worker-owned fetches.
const publicImageFixture =
  process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'public-images'
    ? Buffer.from(
        JSON.parse(
          await readFile(path.join(root, 'tests/browser/family-offline-lifecycle/variant-fixture.json'), 'utf8')
        ).base64,
        'base64'
      )
    : null;
const publicImageResponse = publicImageFixture
  ? {
      intercept(url, upstream, response) {
        if (url.origin !== fixture.api || !url.pathname.startsWith('/storage/v1/object/public/catalog/variants/v1/'))
          return false;
        upstream.resume();
        response.writeHead(200, {
          'content-type': 'image/webp',
          'content-length': String(publicImageFixture.length),
          'access-control-allow-origin': '*',
          'cache-control': 'no-store',
        });
        response.end(publicImageFixture);
        return true;
      },
    }
  : null;
// D16h only: controlled public HTTP outcomes; no SDK or private endpoint substitution.
const preparationControl = { deny: null, hold: null };
const preparationFixture = ['public-image-preparation', 'preparation-status'].includes(
  process.env.FAMILY_OFFLINE_INVENTORY_MODE
)
  ? Buffer.from(
      JSON.parse(await readFile(path.join(root, 'tests/browser/family-offline-lifecycle/variant-fixture.json'), 'utf8'))
        .base64,
      'base64'
    )
  : null;
const preparationResponse = preparationFixture
  ? {
      intercept(url, upstream, response) {
        if (url.origin !== fixture.api || !url.pathname.startsWith('/storage/v1/object/public/catalog/variants/v1/'))
          return false;
        upstream.resume();
        const send = () => {
          if (response.destroyed) return;
          response.writeHead(200, {
            'content-type': 'image/webp',
            'content-length': String(preparationFixture.length),
            'access-control-allow-origin': '*',
            'cache-control': 'no-store',
          });
          response.end(preparationFixture);
        };
        if (preparationControl.deny === url.pathname) {
          response.writeHead(503, { 'access-control-allow-origin': '*' });
          response.end();
          return true;
        }
        if (preparationControl.hold?.path === url.pathname) {
          preparationControl.hold.arrived = true;
          preparationControl.hold.release = send;
          return true;
        }
        send();
        return true;
      },
    }
  : null;
// D16m: negative public HTTP faults only. Actual SDK/private endpoints are never substituted.
const releaseFault = { descriptor: false, entry: null, entryBytes: 0 };
const releaseResponse =
  process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'release-repair'
    ? {
        intercept(url, upstream, response) {
          if (releaseFault.descriptor && url.pathname === '/family-build.json') {
            upstream.resume();
            response.writeHead(503, { 'content-type': 'application/json' });
            response.end('{"error":"deliberate local metadata failure"}');
            return true;
          }
          if (releaseFault.entry === url.pathname && url.searchParams.has('family-build-check')) {
            upstream.resume();
            response.writeHead(200, { 'content-type': 'application/javascript' });
            response.end(Buffer.alloc(releaseFault.entryBytes, 32));
            return true;
          }
          return false;
        },
      }
    : null;

const server = await artifactServer(dist),
  origin = server.origin,
  proxy = await loopbackProxy(
    [
      origin,
      fixture.api,
      ...(process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'source' ? ['http://localhost:55331'] : []),
    ],
    {
      markedLocalhostAlias: process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'source',
      responseBarrier: releaseResponse ?? delayed ?? preparationResponse ?? publicImageResponse,
    }
  ),
  phone = process.env.FAMILY_OFFLINE_INVENTORY_PROFILE === 'phone',
  options = {
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    proxy: { server: proxy.url, bypass: '<-loopback>' },
    serviceWorkers: 'allow',
    locale: 'en-US',
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    isMobile: phone,
    hasTouch: phone,
  },
  checks = [],
  errors = [],
  caught = [],
  events = [],
  responses = [];
let context = await chromium.launchPersistentContext(path.join(output, 'private-browser-profile'), options),
  browser = context.browser(),
  page = await context.newPage();
function observeContext() {
  context.on('request', (r) => {
    const u = new URL(r.url());
    events.push({ origin: u.origin, path: u.pathname, method: r.method(), worker: !!r.serviceWorker() });
  });
  context.on('response', (r) => {
    const u = new URL(r.url());
    responses.push({ origin: u.origin, path: u.pathname, status: r.status() });
  });
  page.on('pageerror', (e) => {
    errors.push(e.message);
    if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'storage')
      process.stdout.write(
        JSON.stringify({
          storagePageErrorAfter: checks.at(-1)?.name,
          name: e.name,
          message: e.message,
          stack: e.stack,
        }) + '\n'
      );
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && m.text().includes('[ErrorBoundary:')) {
      caught.push(m.text().slice(0, 200));
      if (delayed)
        process.stdout.write(JSON.stringify({ diagnosticCaughtAfter: checks.at(-1)?.name, message: m.text() }) + '\n');
    }
  });
}
observeContext();
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
async function login(account, mfa = false, beforeMfa) {
  await expect(page.locator('input[type=email]')).toBeVisible({
    timeout: 30000,
  });
  await page.locator('input[type=email]').fill(account.email);
  await page.locator('input[type=password]').fill(account.password);
  await page.locator('button[type=submit]').click();
  if (mfa) {
    await expect(page.locator('input[autocomplete=one-time-code]')).toBeVisible({ timeout: 20000 });
    if (beforeMfa) await beforeMfa();
    if (Date.now() % 30000 > 27000) await page.waitForTimeout(3100);
    await page.locator('input[autocomplete=one-time-code]').fill(totp(account.secret));
    await page.locator('button[type=submit]').click();
    await expect(page.locator('input[autocomplete=one-time-code]')).toHaveCount(0, { timeout: 30000 });
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
          if (name === 'syncMeta' && entry.name.startsWith('trek-offline-f1-')) stores[name].rows = values;
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
            stores[name].rows = values.map((r) => ({
              key: r.key,
              generation: r.generation,
              ownerGeneration: r.ownerGeneration,
              tripGeneration: r.tripGeneration,
            }));
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
// Only fixture IndexedDB is perturbed; real App/SDK/Auth/handler modules are unchanged.
async function storedGeneration() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = globalThis.indexedDB.open('family-planner-cache-v1');
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
    try {
      const rows = await Promise.all(
        ['completeSnapshots', 'completeHeads'].map(
          (name) =>
            new Promise((resolve, reject) => {
              const tx = db.transaction(name),
                req = tx.objectStore(name).getAll();
              req.onsuccess = () => resolve(req.result[0]);
              req.onerror = reject;
            })
        )
      );
      return { row: rows[0], head: rows[1] };
    } finally {
      db.close();
    }
  });
}
async function replaceGeneration(value) {
  await page.evaluate(async ({ row, head }) => {
    const db = await new Promise((resolve, reject) => {
      const r = globalThis.indexedDB.open('family-planner-cache-v1');
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['completeSnapshots', 'completeHeads'], 'readwrite');
        if (row) tx.objectStore('completeSnapshots').put(row);
        if (head) tx.objectStore('completeHeads').put(head);
        else tx.objectStore('completeHeads').clear();
        tx.oncomplete = resolve;
        tx.onabort = () => reject(Error('Fixture change aborted'));
      });
    } finally {
      db.close();
    }
  }, value);
}
async function expectCold() {
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('status').filter({ hasText: /view only/ })).toBeVisible();
}
async function expectRecovery() {
  await expect(page.getByRole('heading', { name: 'You appear to be offline', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0);
}
async function originalWorkFixture(saved, action) {
  return page.evaluate(
    async ({ saved, action }) => {
      const account = JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id;
      const name = globalThis.localStorage.getItem('family-native-current.v1') ?? 'trek-offline-u' + account;
      if (!(await globalThis.indexedDB.databases()).some((d) => d.name === name))
        throw Error('Original database missing');
      const db = await new Promise((resolve, reject) => {
        const r = globalThis.indexedDB.open(name);
        r.onsuccess = () => resolve(r.result);
        r.onerror = reject;
      });
      const original = {
        id: 'a1600000-0000-4000-8000-000000000088',
        tripId: saved.row.value.bindings.find((b) => b.kind === 'trip').key,
        method: 'POST',
        url: '/trips/' + saved.row.value.scope.trip_id + '/family/future',
        body: { original: 'untouched', operation_id: 'a1600000-0000-4000-8000-000000000088', revision: 3 },
        createdAt: 1,
        status: 'conflict',
        attempts: 4,
        lastError: 'Original failure',
        schemaVersion: 999,
      };
      try {
        if (action === 'read') {
          const get = (store, key) =>
            new Promise((resolve, reject) => {
              const r = db.transaction(store).objectStore(store).get(key);
              r.onsuccess = () => resolve(r.result);
              r.onerror = reject;
            });
          const row = await get('mutationQueue', original.id),
            file = await get('importFiles', ['d16-original-import', 'original.pdf']);
          return { row, fileName: file.fileName, bytes: Array.from(new Uint8Array(await file.blob.arrayBuffer())) };
        }
        await new Promise((resolve, reject) => {
          const tx = db.transaction(['mutationQueue', 'importFiles'], 'readwrite');
          if (action === 'insert') {
            tx.objectStore('mutationQueue').put(original);
            tx.objectStore('importFiles').put({
              jobId: 'd16-original-import',
              fileName: 'original.pdf',
              blob: new globalThis.Blob(['Original source bytes']),
              createdAt: 1,
            });
          } else {
            tx.objectStore('mutationQueue').delete(original.id);
            tx.objectStore('importFiles').delete(['d16-original-import', 'original.pdf']);
          }
          tx.oncomplete = resolve;
          tx.onabort = () => reject(Error('Fixture work change aborted'));
        });
        return original;
      } finally {
        db.close();
      }
    },
    { saved, action }
  );
}

async function companionChecks() {
  const { row } = await storedGeneration(),
    data = row.value.data;
  await page.getByRole('button', { name: 'Bookings', exact: true }).first().click();
  await expect(page.getByText(data.booking.bookings[0].record.title, { exact: true }).first()).toBeVisible();
  record('actual native Bookings renders its canonical saved booking');
  await page.getByRole('button', { name: 'Lists', exact: true }).first().click();
  await expect(page.getByText('D16b shared raincoat', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('D16b peer-only medicine', { exact: true })).toHaveCount(0);
  await page
    .getByRole('button', { name: /^My list/i })
    .first()
    .click();
  await expect(page.getByText('D16b private camera', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('D16b peer-only medicine', { exact: true })).toHaveCount(0);
  record('native Shared and My list packing preserve visible/private ownership without exposing a peer item');
  await page.getByRole('button', { name: /To-do/i }).first().click();
  await expect(page.getByText(data.tasks.tasks[0].name, { exact: true }).first()).toBeVisible();
  record('actual native task list renders its canonical saved task');
  await page.getByRole('button', { name: 'Costs', exact: true }).first().click();
  await expect(page.getByText(data.companions.expenses[0].name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Settlement data unavailable', { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Everyone's square", { exact: true })).toHaveCount(0);
  await expect(page.getByText("You're all settled up", { exact: true })).toHaveCount(0);
  record(
    'native Costs preserves saved expenses and distinguishes unavailable settlement data from a real zero balance'
  );
  if (phone) await page.getByRole('button', { name: 'More', exact: true }).click();
  await page
    .getByRole('button', { name: /^Files(?:\b|$)/ })
    .first()
    .click();
  await expect(page.getByText(data.companions.files[0].original_name, { exact: true }).first()).toBeVisible();
  record('actual native Files renders its canonical saved file metadata');
  const metadata = await page.evaluate(async (trip) => {
    const read = async (suffix) => {
      const r = await globalThis.fetch('/api/trips/' + trip + '/' + suffix);
      if (!r.ok) throw Error('Saved metadata unavailable');
      return r.json();
    };
    return { members: await read('members'), packing: await read('packing'), bags: await read('packing/bags') };
  }, fixture.trip_id);
  assert.equal(metadata.members.members.length, data.companions.members.length);
  assert.equal(metadata.bags.bags[0].total_weight_grams, 2300);
  assert.equal(metadata.packing.items.length, 2);
  assert.ok(!JSON.stringify(metadata.packing).includes('D16b peer-only medicine'));
  snapshots.companion_tabs = await inventory();
  assert.deepEqual(
    completeStores(snapshots.companion_tabs).completeHeads,
    completeStores(snapshots.online).completeHeads
  );
  assert.deepEqual(
    completeStores(snapshots.companion_tabs).completeSnapshots,
    completeStores(snapshots.online).completeSnapshots
  );
  assert.ok(
    nativeRows(snapshots.companion_tabs)
      .filter((r) => ['budgetItems', 'tripMembers', 'tripFiles'].includes(r.name))
      .every((r) => r.count === 0)
  );
  record(
    'roster and bag aggregates stay in the same immutable generation without peer item leakage or legacy native cache writes'
  );
  await page.getByRole('button', { name: 'Plan', exact: true }).first().click();
  await expectCold();
}

async function negativeColdChecks() {
  const saved = await storedGeneration();
  if (phone) await page.getByRole('button', { name: 'Places', exact: true }).click();
  await expect(
    page.getByText(saved.row.value.data.planner.view.state.locations[0].name, { exact: true }).first()
  ).toBeVisible();
  const altered = (kind) => {
    const v = globalThis.structuredClone(saved);
    if (kind === 'head') v.head = null;
    if (kind === 'body') v.row.value.digest = '0'.repeat(64);
    if (kind === 'future') v.head.version = 999;
    return v;
  };
  for (const kind of ['body', 'head', 'future']) {
    const v = altered(kind);
    await replaceGeneration(v);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectRecovery();
    const after = await storedGeneration();
    assert.deepEqual(after.row, v.row);
    assert.equal(after.head?.version, v.head?.version);
    record('real IndexedDB ' + kind + ' change refuses cold reload and preserves retained bytes');
    await replaceGeneration(saved);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectCold();
  }
  const original = await originalWorkFixture(saved, 'insert');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectRecovery();
  const held = await originalWorkFixture(saved, 'read');
  assert.deepEqual(held.row, original);
  assert.equal(held.fileName, 'original.pdf');
  assert.deepEqual(held.bytes, Array.from(Buffer.from('Original source bytes')));
  assert.deepEqual(await storedGeneration(), saved);
  record(
    'cold recovery preserves an actual unknown-format original operation, revision, status, attempts and import Blob bytes without replay'
  );
  await originalWorkFixture(saved, 'remove');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectCold();
  await page.clock.install();
  await page.clock.setSystemTime(saved.row.value.expiresAt + 1);
  await expectRecovery();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectRecovery();
  assert.deepEqual(await storedGeneration(), saved);
  record('actual mounted reader and cold reload refuse expiry without extending the generation lifetime');
  await page.clock.setSystemTime(saved.row.value.verifiedAt - 60000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectRecovery();
  assert.deepEqual(await storedGeneration(), saved);
  record('actual cold entry refuses a clock moved before the original online observation');
  await page.clock.setSystemTime(Date.now());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectCold();
}

/** Actual shared-origin pages/SDK events; raw IDB below only seeds original work, never a notification proof. */
async function crossTabChecks() {
  const first = page;
  const watchPage = (p) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => {
      if (m.type() === 'error' && m.text().includes('[ErrorBoundary:')) caught.push(m.text().slice(0, 200));
    });
  };
  const headsFor = (v, trip) => completeStores(v).completeHeads.rows.filter((h) => JSON.parse(h.key)[5] === trip);
  await first.goto(origin + '/trips/' + fixture.trip_id);
  await expect
    .poll(() => first.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  await login(fixture.owner, true);
  await expect(first.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => headsFor(await inventory(), fixture.trip_id).length, { timeout: 30000 }).toBe(1);
  const second = await context.newPage();
  watchPage(second);
  await second.goto(origin + '/trips/' + fixture.trip_id);
  await expect(second.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  const third = await context.newPage();
  watchPage(third);
  await third.goto(origin + '/trips/' + fixture.rich_packing.other_trip);
  await expect(third.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 }).toBe(2);
  snapshots.cross_tab_online = await inventory();
  assert.equal(headsFor(snapshots.cross_tab_online, fixture.trip_id).length, 1);
  assert.equal(headsFor(snapshots.cross_tab_online, fixture.rich_packing.other_trip).length, 1);
  record('three actual native pages share one account and retain complete generations for two independent Trips');
  const originalDb = await first.evaluate(
    () =>
      globalThis.localStorage.getItem('family-native-current.v1') ??
      'trek-offline-u' + JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id
  );
  const original = {
    id: 'a16b0000-0000-4000-8000-000000000088',
    tripId: 2147483001,
    method: 'POST',
    url: '/trips/a16b0000-0000-4000-8000-000000000089/family/future',
    body: { exact: 'Cross-tab original', operation_id: 'a16b0000-0000-4000-8000-000000000088', revision: 3 },
    createdAt: 1,
    status: 'conflict',
    attempts: 4,
    lastError: 'Original failure',
    schemaVersion: 999,
  };
  const work = async (action) =>
    first.evaluate(
      async ({ dbName, original, action }) => {
        if (!(await globalThis.indexedDB.databases()).some((d) => d.name === dbName))
          throw Error('Original native database disappeared');
        const db = await new Promise((resolve, reject) => {
          const r = globalThis.indexedDB.open(dbName);
          r.onsuccess = () => resolve(r.result);
          r.onerror = reject;
        });
        try {
          if (action === 'seed')
            await new Promise((resolve, reject) => {
              const tx = db.transaction('mutationQueue', 'readwrite');
              tx.objectStore('mutationQueue').put(original);
              tx.oncomplete = resolve;
              tx.onabort = reject;
            });
          return await new Promise((resolve, reject) => {
            const r = db.transaction('mutationQueue').objectStore('mutationQueue').get(original.id);
            r.onsuccess = () => resolve(r.result);
            r.onerror = reject;
          });
        } finally {
          db.close();
        }
      },
      { dbName: originalDb, original, action }
    );
  await first.evaluate(() => globalThis.localStorage.setItem('trek_forced_offline', '1'));
  for (const p of [first, second, third]) {
    page = p;
    await p.reload({ waitUntil: 'domcontentloaded' });
    await expectCold();
  }
  page = first;
  const before = await inventory();
  assert.deepEqual(completeStores(before).completeHeads, completeStores(snapshots.cross_tab_online).completeHeads);
  assert.deepEqual(
    completeStores(before).completeSnapshots,
    completeStores(snapshots.cross_tab_online).completeSnapshots
  );
  snapshots.cross_tab_saved = before;
  record(
    'all three real pages mount native saved reads from the same two immutable generations in persisted forced-offline mode'
  );
  assert.deepEqual(await work('seed'), original);
  for (const p of [first, second, third]) {
    await expect(p.getByRole('status').filter({ hasText: /view only/ })).toBeVisible();
  }
  record('an unrelated future-format original remains exact and does not become a new mutation intent');
  const signout = await second.evaluate(
    async () => (await globalThis.fetch('/api/auth/logout', { method: 'POST' })).status
  );
  assert.equal(signout, 200);
  for (const p of [first, second, third]) {
    await expect(p.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0, { timeout: 15000 });
    await expect(p.getByRole('status').filter({ hasText: /view only/ })).toHaveCount(0);
  }
  page = first;
  await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 15000 }).toBe(0);
  snapshots.cross_tab_signed_out = await inventory();
  assert.equal(completeStores(snapshots.cross_tab_signed_out).completeSnapshots.count, 0);
  assert.deepEqual(await work('read'), original);
  record(
    'actual SDK logout in the second page retires saved display and both Trip generations in every page while preserving original command identity/body/revision/status/attempts'
  );
  await second.evaluate(() => globalThis.localStorage.removeItem('trek_forced_offline'));
  page = second;
  await second.reload({ waitUntil: 'domcontentloaded' });
  await login(fixture.owner, true, async () => {
    for (const p of [first, second, third])
      await expect(p.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0);
    assert.equal(completeStores(await inventory()).completeHeads.count, 0);
    assert.deepEqual(await work('read'), original);
    record(
      'a real password-only SDK sign-in at the MFA challenge cannot publish a saved Trip or resurrect retired generations'
    );
  });
  await expect(second.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => headsFor(await inventory(), fixture.trip_id).length, { timeout: 30000 }).toBe(1);
  snapshots.cross_tab_revalidated = await inventory();
  const old = headsFor(before, fixture.trip_id)[0],
    fresh = headsFor(snapshots.cross_tab_revalidated, fixture.trip_id)[0];
  assert.match(old.ownerGeneration, /^[0-9a-f-]{36}$/);
  assert.match(fresh.ownerGeneration, /^[0-9a-f-]{36}$/);
  assert.notEqual(fresh.ownerGeneration, old.ownerGeneration);
  assert.notEqual(fresh.generation, old.generation);
  assert.ok(
    completeStores(snapshots.cross_tab_revalidated).completeSnapshots.rows.every(
      (r) => !completeStores(before).completeSnapshots.rows.some((v) => v.id === r.id)
    )
  );
  assert.deepEqual(await work('read'), original);
  record(
    'real password/MFA same-account sign-in creates distinct owner/body generations and cannot revive retired A-to-B-to-A observations or alter the retained original'
  );
  const importBytes = [0, 255, 10, 128, 7, 80, 68, 70];
  await second.evaluate(
    async ({ dbName, bytes }) => {
      const db = await new Promise((resolve, reject) => {
        const r = globalThis.indexedDB.open(dbName);
        r.onsuccess = () => resolve(r.result);
        r.onerror = reject;
      });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction('importFiles', 'readwrite');
          tx.objectStore('importFiles').put({
            jobId: 'd16b-cross-tab-original-import',
            fileName: 'original.pdf',
            blob: new globalThis.Blob([new Uint8Array(bytes)]),
            createdAt: 1,
          });
          tx.oncomplete = resolve;
          tx.onabort = reject;
        });
      } finally {
        db.close();
      }
    },
    { dbName: originalDb, bytes: importBytes }
  );
  for (const p of [first, third]) await p.close();
  await second.evaluate(async () => {
    const r = await globalThis.fetch('/api/auth/logout', { method: 'POST' });
    if (!r.ok) throw Error('Final SDK logout failed');
  });
  await expect(second.locator('input[type=email]')).toBeVisible({ timeout: 30000 });
  assert.deepEqual(await workFromRemaining(second, originalDb, original.id), original);
  const imported = await second.evaluate(async (dbName) => {
    if (!(await globalThis.indexedDB.databases()).some((d) => d.name === dbName))
      throw Error('Original database missing');
    const db = await new Promise((resolve, reject) => {
      const r = globalThis.indexedDB.open(dbName);
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
    try {
      const row = await new Promise((resolve, reject) => {
        const r = db
          .transaction('importFiles')
          .objectStore('importFiles')
          .get(['d16b-cross-tab-original-import', 'original.pdf']);
        r.onsuccess = () => resolve(r.result);
        r.onerror = reject;
      });
      return {
        jobId: row.jobId,
        fileName: row.fileName,
        createdAt: row.createdAt,
        bytes: Array.from(new Uint8Array(await row.blob.arrayBuffer())),
      };
    } finally {
      db.close();
    }
  }, originalDb);
  assert.deepEqual(imported, {
    jobId: 'd16b-cross-tab-original-import',
    fileName: 'original.pdf',
    createdAt: 1,
    bytes: importBytes,
  });
  record(
    'a second actual SDK logout preserves exact future command and compound-key imported binary bytes in the original account database'
  );

  assert.ok(!events.some((e) => e.path.includes('/render/image/') || e.path.includes('/execute_family_')));
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  record(
    'all page transitions finish without transformations/domain-command execution, original-work loss or caught/uncaught application errors'
  );
}
async function workFromRemaining(target, dbName, id) {
  return target.evaluate(
    async ({ dbName, id }) => {
      if (!(await globalThis.indexedDB.databases()).some((d) => d.name === dbName))
        throw Error('Original database missing');
      const db = await new Promise((resolve, reject) => {
        const r = globalThis.indexedDB.open(dbName);
        r.onsuccess = () => resolve(r.result);
        r.onerror = reject;
      });
      try {
        return await new Promise((resolve, reject) => {
          const r = db.transaction('mutationQueue').objectStore('mutationQueue').get(id);
          r.onsuccess = () => resolve(r.result);
          r.onerror = reject;
        });
      } finally {
        db.close();
      }
    },
    { dbName, id }
  );
}

/** SQL changes only the new, guarded disposable fixture; observed denial is the real user SDK/RPC result. */
async function membershipChecks() {
  const first = page;
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => {
      if (m.type() === 'error' && m.text().includes('[ErrorBoundary:')) caught.push(m.text().slice(0, 200));
    });
  };
  await first.goto(origin + '/trips/' + fixture.trip_id);
  await expect
    .poll(() => first.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  await login(fixture.owner, true);
  await expect(first.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  const second = await context.newPage(),
    third = await context.newPage();
  watch(second);
  watch(third);
  await second.goto(origin + '/trips/' + fixture.trip_id);
  await third.goto(origin + '/trips/' + fixture.rich_packing.other_trip);
  for (const p of [second, third])
    await expect(p.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 }).toBe(2);
  snapshots.membership_online = await inventory();
  await first.evaluate(() => globalThis.localStorage.setItem('trek_forced_offline', '1'));
  for (const p of [first, second, third]) {
    page = p;
    await p.reload({ waitUntil: 'domcontentloaded' });
    await expectCold();
  }
  page = first;
  snapshots.membership_saved = await inventory();
  assert.deepEqual(
    completeStores(snapshots.membership_saved).completeHeads,
    completeStores(snapshots.membership_online).completeHeads
  );
  record('three actual cold saved readers share two immutable Trip generations before current membership refusal');
  const control = (action) =>
    JSON.parse(
      execFileSync(
        '/Library/Frameworks/Python.framework/Versions/3.14/bin/python3',
        [path.join(root, 'tests/browser/family-offline-lifecycle/membership_fixture.py'), input, action],
        { encoding: 'utf8' }
      )
    );
  const plannerRead = () =>
    second.evaluate(
      async ({ api, anon, trip }) => {
        const storageKey = 'sb-' + new globalThis.URL(api).hostname.split('.')[0] + '-auth-token';
        const session = JSON.parse(globalThis.localStorage.getItem(storageKey));
        if (!session?.access_token) throw Error('The installed SDK session is missing.');
        const digest = Array.from(
          new Uint8Array(
            await globalThis.crypto.subtle.digest('SHA-256', new globalThis.TextEncoder().encode(session.access_token))
          )
        )
          .map((x) => x.toString(16).padStart(2, '0'))
          .join('');
        const r = await globalThis.fetch(api + '/rest/v1/rpc/get_family_trip_planner_state_v1', {
          method: 'POST',
          headers: {
            apikey: anon,
            Authorization: 'Bearer ' + session.access_token,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ p_trip_id: trip }),
        });
        const data = await r.json();
        return { status: r.status, code: typeof data.code === 'string' ? data.code : null, tokenDigest: digest };
      },
      { api: fixture.api, anon: fixture.anon_key, trip: fixture.trip_id }
    );
  const allowed = await plannerRead();
  assert.equal(allowed.status, 200);
  let suspended = false;
  try {
    assert.deepEqual(control('suspend'), { synthetic_only: true, status: 'suspended' });
    suspended = true;
    const observed = second.waitForResponse(
      (r) => r.url() === fixture.api + '/rest/v1/rpc/get_my_auth_bootstrap' && r.status() === 200,
      { timeout: 20000 }
    );
    const validation = second.evaluate(async () => {
      const r = await globalThis.fetch('/api/auth/me');
      return { status: r.status };
    });
    const response = await observed,
      bootstrap = await response.json();
    await validation;
    assert.equal(bootstrap.gate, 'suspended');
    assert.equal(bootstrap.membership_status, 'suspended');
    const denied = await plannerRead();
    assert.equal(denied.status, 403);
    assert.equal(denied.code, '42501');
    assert.equal(denied.tokenDigest, allowed.tokenDigest);
    snapshots.membership_rpc_refusal = {
      allowedStatus: allowed.status,
      deniedStatus: denied.status,
      code: denied.code,
      sameSdkToken: true,
    };
    record(
      'the real read-only planner RPC changes from 200 to 403/42501 for the same installed-SDK access token after membership suspension'
    );

    record(
      'actual SDK membership bootstrap observes a real suspended database member without a JWT/account replacement'
    );
    snapshots.membership_refused = await inventory();
    for (const p of [first, second, third]) {
      await expect(p.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0, { timeout: 15000 });
      await expect(p.getByRole('status').filter({ hasText: /view only/ })).toHaveCount(0);
    }
    await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 15000 }).toBe(0);
    assert.equal(completeStores(await inventory()).completeSnapshots.count, 0);
    record(
      'a known current membership refusal in one cold window retires both complete generations and all other saved displays'
    );
    await first.reload({ waitUntil: 'domcontentloaded' });
    await expect(first.getByRole('heading', { name: 'Family access', exact: true })).toBeVisible();
    await expect(first.getByText(/membership is suspended/)).toBeVisible();
    await expect(first.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0);
    assert.equal(completeStores(await inventory()).completeHeads.count, 0);
    record('cold reload cannot resurrect the retired data while current membership is refused');
  } finally {
    if (suspended) {
      assert.deepEqual(control('restore'), { synthetic_only: true, status: 'active', exact_row_restored: true });
    }
  }
  await second.evaluate(() => globalThis.localStorage.removeItem('trek_forced_offline'));
  page = second;
  await second.reload({ waitUntil: 'domcontentloaded' });
  await expect(second.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect
    .poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 })
    .toBeGreaterThan(0);
  snapshots.membership_restored = await inventory();
  assert.ok(
    completeStores(snapshots.membership_restored).completeHeads.rows.every(
      (h) =>
        !completeStores(snapshots.membership_saved).completeHeads.rows.some((old) => old.generation === h.generation)
    )
  );
  record('restoring the exact synthetic membership requires fresh positive validation and a new complete generation');
  for (const p of [first, third]) await p.close();
  await second.evaluate(async () => {
    const r = await globalThis.fetch('/api/auth/logout', { method: 'POST' });
    if (!r.ok) throw Error('Final SDK signout failed');
  });
  await expect(second.locator('input[type=email]')).toBeVisible({ timeout: 30000 });
  assert.ok(!events.some((e) => e.path.includes('/render/image/') || e.path.includes('/execute_family_')));
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  record(
    'membership acceptance finishes without transformations/domain-command execution or caught/uncaught application errors'
  );
}

/** The helper only holds/replays existing captured-owner cleanup; fresh cache data comes from actual SDK/native readers. */
async function delayedCleanupChecks() {
  assert.match(build.qualification_driver ?? '', /^assets\/cache-lifecycle-driver-[^/]+\.js$/);
  const first = page;
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => {
      if (m.type() === 'error' && m.text().includes('[ErrorBoundary:')) caught.push(m.text().slice(0, 200));
    });
  };
  await first.goto(origin + '/trips/' + fixture.trip_id);
  await expect
    .poll(() => first.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  await login(fixture.owner, true);
  await expect(first.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  const other = await context.newPage();
  watch(other);
  await other.goto(origin + '/trips/' + fixture.rich_packing.other_trip);
  await expect(other.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 }).toBe(2);
  snapshots.cleanup_original = await inventory();
  const originalHead = completeStores(snapshots.cleanup_original).completeHeads.rows[0],
    key = JSON.parse(originalHead.key);
  const control = await context.newPage();
  watch(control);
  const setup = origin + '/.well-known/cache-lifecycle-qualification';
  await control.route(setup, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Loopback lifecycle qualification</title>',
    })
  );
  await control.goto(setup);
  const driver = origin + '/' + build.qualification_driver;
  let ticket;
  try {
    ticket = await control.evaluate(
      async ({ driver, source, identity }) => (await import(driver)).holdRetirement(source, identity),
      { driver, source: fixture.api, identity: { user_id: key[2], family_id: key[3], person_id: key[4] } }
    );
    assert.equal(ticket.owner.generation, originalHead.ownerGeneration);
    assert.deepEqual(
      completeStores(await inventory()).completeHeads,
      completeStores(snapshots.cleanup_original).completeHeads
    );
    record(
      'a separate real browser realm holds existing captured-owner cleanup without editing an owner/head/body or creating authentication'
    );
    await first.evaluate(async () => {
      const r = await globalThis.fetch('/api/auth/logout', { method: 'POST' });
      if (!r.ok) throw Error('SDK signout failed');
    });
    for (const p of [first, other])
      await expect(p.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0, { timeout: 15000 });
    await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 15000 }).toBe(0);
    snapshots.cleanup_retired = await inventory();
    record(
      'actual SDK logout retires the old owner while its independent delayed cleanup remains pending without a held database transaction'
    );
    page = first;
    await first.reload({ waitUntil: 'domcontentloaded' });
    await login(fixture.owner, true);
    await expect(first.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
    await expect
      .poll(
        async () =>
          completeStores(await inventory()).completeHeads.rows.filter((h) => JSON.parse(h.key)[5] === fixture.trip_id)
            .length,
        { timeout: 30000 }
      )
      .toBe(1);
    await other.goto(origin + '/trips/' + fixture.rich_packing.other_trip);
    await expect(other.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
    await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 }).toBe(2);
    snapshots.cleanup_fresh = await inventory();
    const fresh = completeStores(snapshots.cleanup_fresh);
    assert.ok(fresh.completeHeads.rows.every((h) => h.ownerGeneration !== ticket.owner.generation));
    assert.ok(
      fresh.completeSnapshots.rows.every(
        (r) => !completeStores(snapshots.cleanup_original).completeSnapshots.rows.some((o) => o.id === r.id)
      )
    );
    record(
      'real password/MFA and native reads publish two fresh complete Trip generations through the unchanged application'
    );
    const dbName = await first.evaluate(
      () =>
        globalThis.localStorage.getItem('family-native-current.v1') ??
        'trek-offline-u' + JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id
    );
    const original = {
      id: 'a16c0000-0000-4000-8000-000000000088',
      tripId: 2147483001,
      method: 'POST',
      url: '/trips/a16c0000-0000-4000-8000-000000000089/family/future',
      body: { operation_id: 'a16c0000-0000-4000-8000-000000000088', revision: 7, exact: 'Delayed cleanup original' },
      status: 'conflict',
      attempts: 5,
      lastError: 'Original failure',
      schemaVersion: 999,
      createdAt: 1,
    };
    const originalBytes = [0, 255, 128, 10, 80, 68, 70];
    const retained = async (action) =>
      control.evaluate(
        async ({ dbName, original, bytes, action }) => {
          if (!(await globalThis.indexedDB.databases()).some((d) => d.name === dbName))
            throw Error('Original native database missing');
          const db = await new Promise((resolve, reject) => {
            const r = globalThis.indexedDB.open(dbName);
            r.onsuccess = () => resolve(r.result);
            r.onerror = reject;
          });
          try {
            if (action === 'seed')
              await new Promise((resolve, reject) => {
                const tx = db.transaction(['mutationQueue', 'importFiles'], 'readwrite');
                tx.objectStore('mutationQueue').put(original);
                tx.objectStore('importFiles').put({
                  jobId: 'd16c-original',
                  fileName: 'original.pdf',
                  blob: new globalThis.Blob([new Uint8Array(bytes)]),
                  createdAt: 1,
                });
                tx.oncomplete = resolve;
                tx.onabort = reject;
              });
            const read = (name, id) =>
              new Promise((resolve, reject) => {
                const r = db.transaction(name).objectStore(name).get(id);
                r.onsuccess = () => resolve(r.result);
                r.onerror = reject;
              });
            const command = await read('mutationQueue', original.id),
              file = await read('importFiles', ['d16c-original', 'original.pdf']);
            return {
              command,
              file: {
                jobId: file.jobId,
                fileName: file.fileName,
                createdAt: file.createdAt,
                bytes: Array.from(new Uint8Array(await file.blob.arrayBuffer())),
              },
            };
          } finally {
            db.close();
          }
        },
        { dbName, original, bytes: originalBytes, action }
      );
    const work = await retained('seed');
    assert.deepEqual(work, {
      command: original,
      file: { jobId: 'd16c-original', fileName: 'original.pdf', createdAt: 1, bytes: originalBytes },
    });
    const released = await control.evaluate(async ({ driver, id }) => (await import(driver)).releaseRetirement(id), {
      driver,
      id: ticket.id,
    });
    assert.deepEqual(released, { completed: true, owner: ticket.owner });
    ticket = null;
    snapshots.cleanup_released = await inventory();
    assert.deepEqual(completeStores(snapshots.cleanup_released).completeHeads, fresh.completeHeads);
    assert.deepEqual(completeStores(snapshots.cleanup_released).completeSnapshots, fresh.completeSnapshots);
    assert.deepEqual(await retained('read'), work);
    record(
      'releasing real delayed old-owner cleanup preserves the newer owner, both complete Trip heads/bodies and exact original operation/revision/status/attempts/import bytes'
    );
    await other.close();
    await first.evaluate(async () => {
      const r = await globalThis.fetch('/api/auth/logout', { method: 'POST' });
      if (!r.ok) throw Error('Final signout failed');
    });
    await expect(first.locator('input[type=email]')).toBeVisible({ timeout: 30000 });
    assert.deepEqual(await retained('read'), work);
    assert.ok(!events.some((e) => e.path.includes('/render/image/') || e.path.includes('/execute_family_')));
    assert.deepEqual(errors, []);
    assert.deepEqual(caught, []);
    record(
      'scoped cleanup acceptance finishes with retained originals intact and zero transformations/domain-command execution or application errors'
    );
  } finally {
    if (ticket)
      await control.evaluate(async ({ driver, id }) => (await import(driver)).releaseRetirement(id), {
        driver,
        id: ticket.id,
      });
    await control.close();
  }
}

// New identity qualification uses the real application/SDK; only synthetic original work is seeded below.
async function mountedIdentityPages() {
  const first = page;
  await first.goto(origin + '/trips/' + fixture.trip_id);
  await expect
    .poll(() => first.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  await login(fixture.owner, true);
  await expect(first.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  const second = await context.newPage(),
    third = await context.newPage();
  for (const p of [second, third]) {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => {
      if (m.type() === 'error' && m.text().includes('[ErrorBoundary:')) caught.push(m.text().slice(0, 200));
    });
  }
  await second.goto(origin + '/trips/' + fixture.trip_id);
  await third.goto(origin + '/trips/' + fixture.rich_packing.other_trip);
  for (const p of [second, third])
    await expect(p.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 }).toBe(2);
  const online = await inventory();
  await first.evaluate(() => globalThis.localStorage.setItem('trek_forced_offline', '1'));
  for (const p of [first, second, third]) {
    page = p;
    await p.reload({ waitUntil: 'domcontentloaded' });
    await expectCold();
  }
  page = first;
  const saved = await inventory();
  assert.deepEqual(completeStores(saved).completeHeads, completeStores(online).completeHeads);
  assert.deepEqual(completeStores(saved).completeSnapshots, completeStores(online).completeSnapshots);
  return { pages: [first, second, third], saved };
}
async function identityOriginals(target) {
  const dbName = await target.evaluate(
    () =>
      globalThis.localStorage.getItem('family-native-current.v1') ??
      'trek-offline-u' + JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id
  );
  const command = {
    id: 'a16d0000-0000-4000-8000-000000000088',
    tripId: 2147483001,
    method: 'POST',
    url: '/trips/a16d0000-0000-4000-8000-000000000089/family/future',
    body: { operation_id: 'a16d0000-0000-4000-8000-000000000088', revision: 7, exact: 'Identity transition original' },
    status: 'conflict',
    attempts: 5,
    lastError: 'Original failure',
    schemaVersion: 999,
    createdAt: 1,
  };
  const bytes = [0, 255, 128, 10, 80, 68, 70];
  const work = (action) =>
    target.evaluate(
      async ({ dbName, command, bytes, action }) => {
        if (!(await globalThis.indexedDB.databases()).some((d) => d.name === dbName))
          throw Error('Original database missing');
        const db = await new Promise((resolve, reject) => {
          const r = globalThis.indexedDB.open(dbName);
          r.onsuccess = () => resolve(r.result);
          r.onerror = reject;
        });
        try {
          if (action !== 'read')
            await new Promise((resolve, reject) => {
              const tx = db.transaction(['mutationQueue', 'importFiles'], 'readwrite');
              if (action === 'seed') {
                tx.objectStore('mutationQueue').put(command);
                tx.objectStore('importFiles').put({
                  jobId: 'd16d-original',
                  fileName: 'original.pdf',
                  blob: new globalThis.Blob([new Uint8Array(bytes)]),
                  createdAt: 1,
                });
              } else {
                tx.objectStore('mutationQueue').delete(command.id);
                tx.objectStore('importFiles').delete(['d16d-original', 'original.pdf']);
              }
              tx.oncomplete = resolve;
              tx.onabort = reject;
            });
          if (action === 'remove') return { syntheticFixtureRemoved: true };
          const read = (name, key) =>
            new Promise((resolve, reject) => {
              const r = db.transaction(name).objectStore(name).get(key);
              r.onsuccess = () => resolve(r.result);
              r.onerror = reject;
            });
          const saved = await read('mutationQueue', command.id),
            file = await read('importFiles', ['d16d-original', 'original.pdf']);
          return {
            command: saved,
            file: {
              jobId: file.jobId,
              fileName: file.fileName,
              createdAt: file.createdAt,
              bytes: Array.from(new Uint8Array(await file.blob.arrayBuffer())),
            },
          };
        } finally {
          db.close();
        }
      },
      { dbName, command, bytes, action }
    );
  const original = await work('seed');
  assert.deepEqual(original, {
    command,
    file: { jobId: 'd16d-original', fileName: 'original.pdf', createdAt: 1, bytes },
  });
  return { dbName, original, work };
}
async function identityBootstrap(target) {
  return target.evaluate(
    async ({ api, anon }) => {
      const storageKey = 'sb-' + new globalThis.URL(api).hostname.split('.')[0] + '-auth-token';
      const session = JSON.parse(globalThis.localStorage.getItem(storageKey));
      if (!session?.access_token) throw Error('Installed SDK session missing');
      const r = await globalThis.fetch(api + '/rest/v1/rpc/get_my_auth_bootstrap', {
        method: 'POST',
        headers: { apikey: anon, Authorization: 'Bearer ' + session.access_token, 'content-type': 'application/json' },
        body: '{}',
      });
      if (!r.ok) throw Error('Real identity bootstrap refused');
      const b = await r.json();
      return { user: b.user_id, person: b.person_id, family: b.family_id, aal: b.aal, gate: b.gate };
    },
    { api: fixture.api, anon: fixture.anon_key }
  );
}
async function assertIdentityRetired(pages) {
  for (const p of pages) {
    await expect(p.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0, { timeout: 20000 });
    await expect(p.getByRole('status').filter({ hasText: /view only/ })).toHaveCount(0);
  }
  await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 20000 }).toBe(0);
  assert.equal(completeStores(await inventory()).completeSnapshots.count, 0);
}
async function actualIdentityLogout(target) {
  await target.evaluate(async () => {
    const r = await globalThis.fetch('/api/auth/logout', { method: 'POST' });
    if (!r.ok) throw Error('Actual SDK logout failed');
  });
  await expect(target.locator('input[type=email]')).toBeVisible({ timeout: 30000 });
}
async function assuranceChecks() {
  const { pages, saved } = await mountedIdentityPages(),
    [first] = pages;
  const before = await identityBootstrap(first);
  assert.equal(before.aal, 'aal2');
  assert.equal(before.gate, 'ok');
  snapshots.assurance_saved = saved;
  record('three actual saved readers mount two complete Trips under a real SDK aal2 session');
  const retained = await identityOriginals(first);
  const result = await first.evaluate(
    async (owner) => {
      const r = await globalThis.fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: owner.email, password: owner.password }),
      });
      const data = await r.json();
      return { status: r.status, mfa_required: data.mfa_required };
    },
    { email: fixture.owner.email, password: fixture.owner.password }
  );
  assert.deepEqual(result, { status: 200, mfa_required: true });
  const down = await identityBootstrap(first);
  assert.deepEqual(down, { ...before, aal: 'aal1', gate: 'mfa_challenge' });
  snapshots.assurance_levels = { before: before.aal, after: down.aal, sameUserFamilyPerson: true, gate: down.gate };
  record(
    'actual same-account password reauthentication changes the real server bootstrap from aal2/ok to aal1/mfa_challenge without logout or fabricated claims'
  );
  await assertIdentityRetired(pages);
  snapshots.assurance_retired = await inventory();
  assert.deepEqual(await retained.work('read'), retained.original);
  record(
    'known assurance downshift retires all mounted saved displays and both complete heads/bodies while exact original command and compound-key binary bytes survive'
  );
  await first.reload({ waitUntil: 'domcontentloaded' });
  await expect(first.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0);
  assert.equal(completeStores(await inventory()).completeHeads.count, 0);
  record('a cold reload cannot promote the password-only session or resurrect its retired Trip generations');
  if (Date.now() % 30000 > 27000) await page.waitForTimeout(3100);
  const verified = await first.evaluate(async (code) => {
    const r = await globalThis.fetch('/api/auth/mfa/verify-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mfa_token: 'supabase-totp', code }),
    });
    return { status: r.status };
  }, totp(fixture.owner.secret));
  assert.equal(verified.status, 200);
  assert.deepEqual(await identityBootstrap(first), before);
  assert.deepEqual(await retained.work('read'), retained.original);
  assert.equal(completeStores(await inventory()).completeHeads.count, 0);
  record(
    'actual TOTP restores current aal2 assurance but retained source work still prevents automatic revival of an old saved generation'
  );
  // Remove only the synthetic harness work after proving it exact; this is not an application export/recovery claim.
  await retained.work('remove');
  await first.evaluate(() => globalThis.localStorage.removeItem('trek_forced_offline'));
  for (const p of pages) await p.reload({ waitUntil: 'domcontentloaded' });
  for (const p of pages)
    await expect(p.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 }).toBe(2);
  snapshots.assurance_fresh = await inventory();
  assert.ok(
    completeStores(snapshots.assurance_fresh).completeHeads.rows.every(
      (h) => !completeStores(saved).completeHeads.rows.some((old) => old.generation === h.generation)
    )
  );
  record(
    'explicit online validation after synthetic fixture recovery publishes new complete generations rather than reusing retired bodies'
  );
  await actualIdentityLogout(first);
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  assert.ok(!events.some((e) => e.path.includes('/render/image/') || e.path.includes('/execute_family_')));
  record('assurance acceptance finishes without application errors, transformations or domain-command execution');
}
async function personChecks() {
  const { pages, saved } = await mountedIdentityPages(),
    [first, second] = pages;
  const before = await identityBootstrap(first),
    retained = await identityOriginals(first);
  assert.equal(before.person, fixture.identity_test.original_person);
  snapshots.person_saved = saved;
  record('three native saved readers and exact original work begin under the authoritative original Person');
  const control = (action) =>
    JSON.parse(
      execFileSync(
        '/Library/Frameworks/Python.framework/Versions/3.14/bin/python3',
        [path.join(root, 'tests/browser/family-offline-lifecycle/identity_fixture.py'), input, action],
        { encoding: 'utf8' }
      )
    );
  let changed = false;
  try {
    assert.deepEqual(control('replace'), { synthetic_only: true, reassigned: true });
    changed = true;
    const freshIdentity = await identityBootstrap(second);
    assert.deepEqual(freshIdentity, { ...before, person: fixture.identity_test.replacement_person });
    const observed = second.waitForResponse(
      (r) => r.url() === fixture.api + '/rest/v1/rpc/get_my_auth_bootstrap' && r.status() === 200,
      { timeout: 20000 }
    );
    const request = second.evaluate(async () => (await globalThis.fetch('/api/auth/me')).status);
    const bootstrap = await (await observed).json();
    await request;
    assert.equal(bootstrap.person_id, fixture.identity_test.replacement_person);
    record(
      'the real current bootstrap changes linked Person within the same account and Family, without altering JWTs, membership or cached identity'
    );
    await assertIdentityRetired(pages);
    snapshots.person_retired = await inventory();
    assert.deepEqual(await retained.work('read'), retained.original);
    record(
      'server-confirmed Person replacement retires both old complete Trip generations and every saved display while preserving the original account database and exact source work'
    );
    // All three old readers were proved retired above. Keep the following one-Trip positive capture bounded.
    for (const target of pages) if (target !== first) await target.close();
    await first.evaluate(() => globalThis.localStorage.removeItem('trek_forced_offline'));
    await first.reload({ waitUntil: 'domcontentloaded' });
    await expect(first.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
    await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 }).toBe(1);
    snapshots.person_replacement = await inventory();
    const head = completeStores(snapshots.person_replacement).completeHeads.rows[0];
    assert.equal(JSON.parse(head.key)[4], fixture.identity_test.replacement_person);
    assert.ok(!completeStores(saved).completeHeads.rows.some((old) => old.generation === head.generation));
    const newDb = await first.evaluate(
      () =>
        globalThis.localStorage.getItem('family-native-current.v1') ??
        'trek-offline-u' + JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id
    );
    assert.notEqual(newDb, retained.dbName);
    assert.deepEqual(await retained.work('read'), retained.original);
    const packing = await first.evaluate(async (trip) => {
      const r = await globalThis.fetch('/api/trips/' + trip + '/packing');
      if (!r.ok) throw Error('Replacement Person packing read failed');
      return r.json();
    }, fixture.trip_id);
    assert.ok(
      !JSON.stringify(packing).includes('D16b private camera') &&
        !JSON.stringify(packing).includes('D16b peer-only medicine')
    );
    record(
      'positive validation creates the replacement Person database/generation without transferring original work or exposing the former Person private packing'
    );
  } finally {
    if (changed) {
      assert.deepEqual(control('restore'), { synthetic_only: true, exact_people_rows_restored: true });
    }
  }
  await retained.work('remove');
  await first.reload({ waitUntil: 'domcontentloaded' });
  await expect(first.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  assert.deepEqual(await identityBootstrap(first), before);
  await expect
    .poll(
      async () =>
        completeStores(await inventory()).completeHeads.rows.every((h) => JSON.parse(h.key)[4] === before.person),
      { timeout: 30000 }
    )
    .toBe(true);
  snapshots.person_restored = await inventory();
  assert.ok(
    completeStores(snapshots.person_restored).completeHeads.rows.every(
      (h) => !completeStores(saved).completeHeads.rows.some((old) => old.generation === h.generation)
    )
  );
  record(
    'exact original Person-link restoration requires current validation and fresh generations rather than reviving the old body'
  );
  await actualIdentityLogout(first);
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  assert.ok(!events.some((e) => e.path.includes('/render/image/') || e.path.includes('/execute_family_')));
  record(
    'Person-transition acceptance finishes with restored exact records and no application errors, transformations or domain-command execution'
  );
}

async function familyPlannerAccess(target, trip) {
  return target.evaluate(
    async ({ api, anon, trip }) => {
      const key = 'sb-' + new globalThis.URL(api).hostname.split('.')[0] + '-auth-token';
      const session = JSON.parse(globalThis.localStorage.getItem(key));
      if (!session?.access_token) throw Error('Actual SDK session missing');
      const digest = Array.from(
        new Uint8Array(
          await globalThis.crypto.subtle.digest('SHA-256', new globalThis.TextEncoder().encode(session.access_token))
        )
      )
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('');
      const r = await globalThis.fetch(api + '/rest/v1/rpc/get_family_trip_planner_state_v1', {
        method: 'POST',
        headers: { apikey: anon, Authorization: 'Bearer ' + session.access_token, 'content-type': 'application/json' },
        body: JSON.stringify({ p_trip_id: trip }),
      });
      const body = await r.json();
      return { status: r.status, code: typeof body.code === 'string' ? body.code : null, digest };
    },
    { api: fixture.api, anon: fixture.anon_key, trip }
  );
}
async function familyBoundaryChecks() {
  const { pages, saved } = await mountedIdentityPages(),
    [first, second] = pages;
  const before = await identityBootstrap(first),
    retained = await identityOriginals(first);
  const allowed = await familyPlannerAccess(first, fixture.trip_id);
  assert.equal(before.family, fixture.family_id);
  assert.equal(allowed.status, 200);
  snapshots.family_saved = saved;
  record(
    'three actual saved readers and exact original command/import bytes begin under the authoritative original Family'
  );
  const control = (action) =>
    JSON.parse(
      execFileSync(
        '/Library/Frameworks/Python.framework/Versions/3.14/bin/python3',
        [path.join(root, 'tests/browser/family-offline-lifecycle/family_fixture.py'), input, action],
        { encoding: 'utf8' }
      )
    );
  let changed = false;
  try {
    assert.deepEqual(control('switch'), { synthetic_only: true, status: 'suspended' });
    changed = true;
    const replacement = await identityBootstrap(second);
    assert.deepEqual(replacement, {
      ...before,
      family: fixture.family_boundary.family_id,
      person: fixture.family_boundary.person_id,
    });
    const oldTrip = await familyPlannerAccess(second, fixture.trip_id),
      newTrip = await familyPlannerAccess(second, fixture.family_boundary.trip_id);
    assert.equal(oldTrip.status, 403);
    assert.equal(oldTrip.code, '42501');
    assert.equal(newTrip.status, 200);
    assert.equal(allowed.digest, oldTrip.digest);
    assert.equal(allowed.digest, newTrip.digest);
    snapshots.family_rpc = {
      previousTripBefore: 200,
      previousTripAfter: 403,
      refusedCode: '42501',
      nextTrip: 200,
      sameSdkToken: true,
      nextGate: replacement.gate,
    };
    record(
      'the same real SDK token is refused by the former Family Trip RPC and accepted by the second Family Trip RPC while current bootstrap remains ok'
    );
    const observed = second.waitForResponse(
      (r) => r.url() === fixture.api + '/rest/v1/rpc/get_my_auth_bootstrap' && r.status() === 200,
      { timeout: 20000 }
    );
    const validation = second.evaluate(async () => (await globalThis.fetch('/api/auth/me')).status);
    const response = await (await observed).json();
    await validation;
    assert.equal(response.family_id, fixture.family_boundary.family_id);
    await assertIdentityRetired(pages);
    snapshots.family_retired = await inventory();
    assert.deepEqual(await retained.work('read'), retained.original);
    record(
      'a known Family change retires both original complete generations and all mounted saved displays without deleting the old native database or original work'
    );
    await first.evaluate(() => globalThis.localStorage.removeItem('trek_forced_offline'));
    await first.goto(origin + '/trips/' + fixture.family_boundary.trip_id);
    await expect(first.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
    const bundle = await first.evaluate(async (trip) => {
      const r = await globalThis.fetch('/api/trips/' + trip + '/bundle');
      if (!r.ok) throw Error('Native second-Family Trip bundle unavailable');
      return r.json();
    }, fixture.family_boundary.trip_id);
    assert.equal(bundle.trip.family_uuid, fixture.family_boundary.trip_id);
    assert.equal(bundle.trip.family_id, fixture.family_boundary.family_id);
    assert.equal(bundle.trip.title, 'D16e second Family Trip');
    if (phone) await expect(first.getByText('No places planned for this day', { exact: true }).first()).toBeVisible();
    else await expect(first.getByText('D16e second Family Trip', { exact: true }).first()).toBeVisible();
    await expect
      .poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 })
      .toBeGreaterThan(0);
    snapshots.family_replacement = await inventory();
    assert.ok(
      completeStores(snapshots.family_replacement).completeHeads.rows.every(
        (h) => JSON.parse(h.key)[3] === replacement.family && JSON.parse(h.key)[4] === replacement.person
      )
    );
    assert.deepEqual(await retained.work('read'), retained.original);
    assert.notEqual(
      await first.evaluate(
        () =>
          globalThis.localStorage.getItem('family-native-current.v1') ??
          'trek-offline-u' + JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id
      ),
      retained.dbName
    );
    await expect(first.getByText('D16b private camera', { exact: true })).toHaveCount(0);
    record(
      'positive native validation opens the second Family Trip under its own Person/database/generation without transferring the former Family original work'
    );
  } finally {
    if (changed)
      assert.deepEqual(control('restore'), { synthetic_only: true, status: 'active', exact_row_restored: true });
  }
  assert.deepEqual(await retained.work('read'), retained.original);
  // Recover only the harness's synthetic work after exact preservation has been proved.
  await retained.work('remove');
  await first.goto(origin + '/trips/' + fixture.trip_id);
  await expect(first.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  assert.deepEqual(await identityBootstrap(first), before);
  await expect
    .poll(
      async () => {
        const heads = completeStores(await inventory()).completeHeads.rows;
        return heads.length > 0 && heads.every((h) => JSON.parse(h.key)[3] === before.family);
      },
      { timeout: 30000 }
    )
    .toBe(true);
  snapshots.family_restored = await inventory();
  assert.ok(
    completeStores(snapshots.family_restored).completeHeads.rows.every(
      (h) => !completeStores(saved).completeHeads.rows.some((old) => old.generation === h.generation)
    )
  );
  record(
    'exact membership restoration and positive validation retire the second Family generation and publish fresh original-Family data instead of reviving old bodies'
  );
  await actualIdentityLogout(first);
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  assert.ok(!events.some((e) => e.path.includes('/render/image/') || e.path.includes('/execute_family_')));
  record(
    'Family-boundary acceptance finishes with restored exact membership and no application errors, transformations or domain-command execution'
  );
}
async function sourceBoundaryChecks() {
  const { pages, saved } = await mountedIdentityPages(),
    [first, ...others] = pages;
  for (const p of others) await p.close();
  const retained = await identityOriginals(first);
  snapshots.source_saved = saved;
  record(
    'the actual qualified build mounts saved Trips and retains exact original work before a compiled source change'
  );
  const nextDist = process.env.FAMILY_OFFLINE_NEXT_DIST;
  assert.match(nextDist ?? '', /^\/private\/tmp\/trek-u03d16-source-alias-[^/]+\/build-qualified\/actual-dist$/);
  const manifestPath = path.join(nextDist, '..', 'actual-build.json'),
    aliasManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(aliasManifest.source_boundary_alias, true);
  assert.equal(aliasManifest.canonical_fixture_endpoint, fixture.api);
  assert.equal(aliasManifest.supabase_endpoint, 'http://localhost:55331');
  for (const [file, hash] of Object.entries(aliasManifest.artifact_hashes))
    assert.equal(
      createHash('sha256')
        .update(await readFile(path.join(nextDist, file)))
        .digest('hex'),
      hash
    );
  const html = await readFile(path.join(nextDist, 'index.html'), 'utf8'),
    entry = html.match(/src="(\/assets\/index-[^"]+\.js)"/)[1];
  snapshots.source_build = {
    endpoint: aliasManifest.supabase_endpoint,
    canonical: fixture.api,
    manifest_sha256: createHash('sha256')
      .update(await readFile(manifestPath))
      .digest('hex'),
    entry,
  };
  server.switchDirectory(nextDist);
  await first.evaluate(() => {
    globalThis.__d16SourceChanges = 0;
    globalThis.navigator.serviceWorker.addEventListener('controllerchange', () => globalThis.__d16SourceChanges++);
  });
  await first.evaluate(async () => {
    const r = await globalThis.navigator.serviceWorker.getRegistration();
    await r.update();
  });
  await expect.poll(() => first.evaluate(() => globalThis.__d16SourceChanges), { timeout: 90000 }).toBeGreaterThan(0);
  assert.deepEqual(await retained.work('read'), retained.original);
  record(
    'the real second-build service worker activates at the same origin without changing original command or compound-key imported bytes'
  );
  await first.reload({ waitUntil: 'domcontentloaded' });
  await expect
    .poll(
      () =>
        first.evaluate(
          (entry) => [...globalThis.document.scripts].some((s) => new globalThis.URL(s.src).pathname === entry),
          entry
        ),
      { timeout: 30000 }
    )
    .toBe(true);
  await expect(first.locator('input[type=email]')).toBeVisible({ timeout: 30000 });
  await expect(first.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0);
  await expect(first.getByRole('status').filter({ hasText: /view only/ })).toHaveCount(0);
  snapshots.source_refused = await inventory();
  assert.deepEqual(completeStores(snapshots.source_refused).completeHeads, completeStores(saved).completeHeads);
  assert.deepEqual(completeStores(snapshots.source_refused).completeSnapshots, completeStores(saved).completeSnapshots);
  assert.deepEqual(await retained.work('read'), retained.original);
  const namespace = await first.evaluate(() => ({
    oldPresent: globalThis.localStorage.getItem('sb-127-auth-token') !== null,
    aliasPresent: globalThis.localStorage.getItem('sb-localhost-auth-token') !== null,
  }));
  assert.deepEqual(namespace, { oldPresent: true, aliasPresent: false });
  record(
    'the changed compiled source refuses cold admission and does not borrow the previous SDK namespace or reinterpret its stored complete generation'
  );
  await first.evaluate(() => globalThis.localStorage.removeItem('trek_forced_offline'));
  await first.reload({ waitUntil: 'domcontentloaded' });
  await expect(first.locator('input[type=email]')).toBeVisible({ timeout: 30000 });
  const validated = first.waitForResponse(
    (r) => r.url() === 'http://localhost:55331/rest/v1/rpc/get_my_auth_bootstrap' && r.status() === 200,
    { timeout: 30000 }
  );
  await login(fixture.owner, true);
  const bootstrap = await (await validated).json();
  assert.equal(bootstrap.user_id, fixture.owner.id);
  assert.equal(bootstrap.family_id, fixture.family_id);
  await expect(first.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  const namespaceAfter = await first.evaluate(
    () => globalThis.localStorage.getItem('sb-localhost-auth-token') !== null
  );
  assert.equal(namespaceAfter, true);
  const aliasIdentity = await first.evaluate(async (anon) => {
    const session = JSON.parse(globalThis.localStorage.getItem('sb-localhost-auth-token'));
    const r = await globalThis.fetch('http://localhost:55331/rest/v1/rpc/get_my_auth_bootstrap', {
      method: 'POST',
      headers: { apikey: anon, Authorization: 'Bearer ' + session.access_token, 'content-type': 'application/json' },
      body: '{}',
    });
    if (!r.ok) throw Error('Alias current validation refused');
    const b = await r.json();
    return { user: b.user_id, family: b.family_id, aal: b.aal, gate: b.gate };
  }, fixture.anon_key);
  assert.deepEqual(aliasIdentity, { user: fixture.owner.id, family: fixture.family_id, aal: 'aal2', gate: 'ok' });
  snapshots.source_alias_validation = {
    actualSdkNamespace: true,
    aal: aliasIdentity.aal,
    gate: aliasIdentity.gate,
    sameSyntheticProjectAccount: true,
  };

  assert.deepEqual(await retained.work('read'), retained.original);
  const aliasName = await first.evaluate(() => globalThis.localStorage.getItem('family-native-current.v1'));
  assert.match(aliasName, /^trek-offline-f1-[a-f0-9]{64}-u[1-9][0-9]*$/);
  const aliasWork = await first.evaluate(async (name) => {
    const db = await new Promise((resolve, reject) => {
      const q = globalThis.indexedDB.open(name);
      q.onsuccess = () => resolve(q.result);
      q.onerror = reject;
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(['mutationQueue', 'importFiles', 'syncMeta']);
        const queue = tx.objectStore('mutationQueue').getAll(),
          imports = tx.objectStore('importFiles').getAll(),
          marker = tx.objectStore('syncMeta').get(0);
        tx.oncomplete = () => resolve({ queue: queue.result, imports: imports.result, marker: marker.result });
        tx.onabort = reject;
      });
    } finally {
      db.close();
    }
  }, aliasName);
  assert.deepEqual(aliasWork.queue, []);
  assert.deepEqual(aliasWork.imports, []);
  assert.equal(aliasWork.marker.sourceOwner.source, 'http://localhost:55331');
  assert.equal(aliasWork.marker.sourceOwner.user_id, fixture.owner.id);
  assert.equal(aliasWork.marker.sourceOwner.family_id, fixture.family_id);
  assert.deepEqual(await retained.work('read'), retained.original);
  snapshots.owned_alias = {
    database: aliasName,
    source: aliasWork.marker.sourceOwner.source,
    same_account: true,
    queue: 0,
    imports: 0,
    foreign_work_adopted: false,
  };
  record(
    'source B validates its own immutable owner and has no A commands or import bytes despite identical Auth and Family identifiers'
  );
  assert.equal(aliasWork.marker.sourceOwner.person_id, bootstrap.person_id);
  assert.equal(aliasWork.marker.sourceOwner.native_user, Number(retained.dbName.match(/-u([0-9]+)$/)[1]));
  await first.goto(origin + '/settings?tab=offline');
  await expect(first.getByRole('button', { name: 'Clear cache', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(first.getByRole('button', { name: 'Export retained work', exact: true })).toHaveCount(0);
  record('source B native Offline settings cannot expose or export A retained originals');
  await first.goto(origin + '/trips/' + fixture.trip_id);
  await expect(first.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  const canonicalEntry = (await readFile(path.join(dist, 'index.html'), 'utf8')).match(
    /src="(\/assets\/index-[^"]+\.js)"/
  )[1];
  // Finish the just-loaded B document's registration/update job while B is still served.
  // Otherwise the immediate A update can join that in-flight job and never fetch A's worker.
  await first.evaluate(async () => {
    const registration = await globalThis.navigator.serviceWorker.ready;
    await registration.update();
    const worker = registration.installing;
    if (worker && !['activated', 'redundant'].includes(worker.state))
      await new Promise((resolve) => {
        worker.addEventListener('statechange', () => {
          if (['activated', 'redundant'].includes(worker.state)) resolve();
        });
      });
  });
  server.switchDirectory(dist);
  await first.evaluate(() => {
    globalThis.__d16ReturnControllerChanged = false;
    globalThis.navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        globalThis.__d16ReturnControllerChanged = true;
      },
      { once: true }
    );
  });
  await first.evaluate(async () => {
    const registration = await globalThis.navigator.serviceWorker.getRegistration();
    await registration.update();
  });
  await expect
    .poll(
      () =>
        first.evaluate(
          (entry) =>
            globalThis.__d16ReturnControllerChanged ||
            [...globalThis.document.scripts].some((s) => new globalThis.URL(s.src).pathname === entry),
          canonicalEntry
        ),
      { timeout: 90000 }
    )
    .toBe(true);
  // The real App can reload on controller replacement. One explicit navigation may be
  // interrupted by that reload; require the actual canonical entry rather than retrying navigation in a poll.
  let returnNavigationInterrupted = false;
  try {
    await first.reload({ waitUntil: 'domcontentloaded' });
  } catch (error) {
    if (!String(error).includes('net::ERR_ABORTED')) throw error;
    returnNavigationInterrupted = true;
  }
  await first.waitForFunction(
    (entry) => [...globalThis.document.scripts].some((s) => new globalThis.URL(s.src).pathname === entry),
    canonicalEntry,
    { timeout: 90000 }
  );
  if (await first.locator('input[type=email]').isVisible()) await login(fixture.owner, true);
  await expect(first.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  const returnedName = await first.evaluate(() => globalThis.localStorage.getItem('family-native-current.v1'));
  assert.notEqual(returnedName, aliasName);
  assert.deepEqual(await retained.work('read'), retained.original);
  snapshots.source_return = {
    database: returnedName,
    exact_original_commands_and_bytes: true,
    distinct_alias_namespace: true,
    worker_interrupted_navigation: returnNavigationInterrupted,
  };
  record(
    'actual A->B->A worker/source return restores the original A namespace and exact original command/import bytes without replay'
  );
  await first.goto(origin + '/settings?tab=offline');
  const exportButton = first.getByRole('button', { name: 'Export retained work', exact: true });
  await expect(exportButton).toBeVisible({ timeout: 30000 });
  const downloading = first.waitForEvent('download');
  await exportButton.click();
  const download = await downloading;
  assert.equal(await download.failure(), null);
  assert.equal(download.suggestedFilename(), 'family-original-work-v3.json');
  const archivePath = path.join(output, 'private-source-return-v3.json');
  await download.saveAs(archivePath);
  const { readOriginalWorkArchive } = await import('./original-work-reader.mjs');
  const restored = readOriginalWorkArchive(await readFile(archivePath));
  assert.deepEqual(
    restored.data.queue.map((v) => v.row),
    [retained.original.command]
  );
  assert.equal(restored.data.imports.length, 1);
  assert.deepEqual(
    Array.from(new Uint8Array(await restored.data.imports[0].row.blob.arrayBuffer())),
    retained.original.file.bytes
  );
  assert.deepEqual(restored.payload.source_owner, { ...aliasWork.marker.sourceOwner, source: fixture.api });
  assert.equal(restored.payload.database, retained.dbName);
  assert.deepEqual(await retained.work('read'), retained.original);
  snapshots.source_return.explicit_v3_download_exact = true;
  record(
    'returning to A permits an explicit native v3 download with exact original fields, binary bytes and A provenance; export does not acknowledge or replay work'
  );
  snapshots.source_online = await inventory();
  record(
    'the alias requires its own actual SDK password/TOTP validation before native online access and keeps previous-source original work exact'
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  assert.ok(!events.some((e) => e.path.includes('/render/image/') || e.path.includes('/execute_family_')));
  record(
    'compiled-source boundary acceptance finishes without application errors, transformations, domain-command execution or fabricated authentication'
  );
}

async function startDelayedRead(target, url, binary = false) {
  await target.evaluate(
    ({ url, binary }) => {
      const controller = new globalThis.AbortController();
      const state = { controller, done: false, result: null };
      globalThis.__d16Response = state;
      state.promise = globalThis
        .fetch(url, { signal: controller.signal })
        .then(async (r) => {
          if (binary && r.ok) {
            const bytes = await r.arrayBuffer();
            return {
              status: r.status,
              bytes: bytes.byteLength,
              sha256: Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)))
                .map((n) => n.toString(16).padStart(2, '0'))
                .join(''),
            };
          }
          const body = await r.json();
          return {
            status: r.status,
            code: body.code ?? null,
            keys: Object.keys(body).sort(),
            layer: body.scope?.layer ?? null,
          };
        })
        .catch((e) => ({ error: e.name }))
        .then((result) => {
          state.result = result;
          state.done = true;
          return result;
        });
    },
    { url, binary }
  );
}
async function finishDelayedRead(target) {
  await expect.poll(() => target.evaluate(() => globalThis.__d16Response?.done), { timeout: 20000 }).toBe(true);
  return target.evaluate(() => globalThis.__d16Response.result);
}
async function privateLayerOriginals(saved) {
  const original = {
    id: 'a16f0000-0000-4000-8000-000000000088',
    tripId: saved.row.value.bindings.find((b) => b.kind === 'trip').key,
    method: 'POST',
    url: '/trips/' + fixture.trip_id + '/family/future',
    body: {
      operation_id: 'a16f0000-0000-4000-8000-000000000088',
      expected_revision: 9,
      scope: { ...saved.row.value.scope, layer: 'myDraft', source: fixture.api },
      patch: { notes: 'Retain this exact private draft' },
    },
    createdAt: 1,
    status: 'conflict',
    attempts: 6,
    lastError: 'Private original conflict',
    schemaVersion: 999,
  };
  const dbName = await page.evaluate(
    () =>
      globalThis.localStorage.getItem('family-native-current.v1') ??
      'trek-offline-u' + JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id
  );
  const work = (action) =>
    page.evaluate(
      async ({ dbName, original, action }) => {
        if (!(await globalThis.indexedDB.databases()).some((d) => d.name === dbName))
          throw Error('Original native database missing');
        const db = await new Promise((resolve, reject) => {
          const r = globalThis.indexedDB.open(dbName);
          r.onsuccess = () => resolve(r.result);
          r.onerror = reject;
        });
        try {
          if (action !== 'read')
            await new Promise((resolve, reject) => {
              const tx = db.transaction(['mutationQueue', 'importFiles'], 'readwrite');
              if (action === 'seed') {
                tx.objectStore('mutationQueue').put(original);
                tx.objectStore('importFiles').put({
                  jobId: 'd16f-private',
                  fileName: 'private.pdf',
                  blob: new globalThis.Blob([new Uint8Array([0, 255, 16, 128, 13, 10])]),
                  createdAt: 1,
                });
              } else {
                tx.objectStore('mutationQueue').delete(original.id);
                tx.objectStore('importFiles').delete(['d16f-private', 'private.pdf']);
              }
              tx.oncomplete = resolve;
              tx.onabort = reject;
            });
          if (action === 'remove') return null;
          const get = (store, key) =>
            new Promise((resolve, reject) => {
              const r = db.transaction(store).objectStore(store).get(key);
              r.onsuccess = () => resolve(r.result);
              r.onerror = reject;
            });
          const command = await get('mutationQueue', original.id),
            file = await get('importFiles', ['d16f-private', 'private.pdf']);
          return {
            command,
            file: {
              jobId: file.jobId,
              fileName: file.fileName,
              createdAt: file.createdAt,
              bytes: Array.from(new Uint8Array(await file.blob.arrayBuffer())),
            },
          };
        } finally {
          db.close();
        }
      },
      { dbName, original, action }
    );
  const expected = await work('seed');
  assert.deepEqual(expected.command, original);
  assert.deepEqual(expected.file.bytes, [0, 255, 16, 128, 13, 10]);
  return { expected, work };
}
async function privateBodyChecks() {
  assert.ok(delayed);
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await login(fixture.owner, true);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect
    .poll(async () => completeStores(await inventory())?.completeHeads.count ?? 0, { timeout: 30000 })
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  snapshots.delayed_initial = await inventory();
  const planner = '/api/trips/' + fixture.trip_id + '/family/planner-view',
    file = '/api/family/files/' + fixture.graph.file + '/open';
  const read = async (url) => {
    await startDelayedRead(page, url);
    return finishDelayedRead(page);
  };
  const draft = await read(planner + '?layer=myDraft');
  assert.equal(draft.status, 200);
  assert.equal(draft.layer, 'myDraft');
  const privateSaved = await inventory();
  assert.ok(scopedRows(privateSaved).some((r) => JSON.parse(r.key)[6] === 'myDraft'));
  assert.ok(completeStores(privateSaved).completeHeads.rows.every((r) => JSON.parse(r.key)[6] === 'published'));
  assert.deepEqual(completeStores(privateSaved).completeHeads, completeStores(snapshots.delayed_initial).completeHeads);
  record(
    'real My draft API reads stay in their private partial scope and cannot replace a published complete generation'
  );
  for (const kind of ['planner', 'media']) {
    const hold = delayed.hold(kind, 'headers');
    await startDelayedRead(page, kind === 'planner' ? planner : file, kind === 'media');
    assert.deepEqual(await hold.reached, { status: 200, headersDelivered: false });
    assert.equal(await page.evaluate(() => globalThis.__d16Response.done), false);
    await page.evaluate(() => globalThis.__d16Response.controller.abort());
    hold.release();
    assert.deepEqual(await finishDelayedRead(page), { error: 'AbortError' });
    record('cancelled actual ' + kind + ' request refuses delayed genuine headers before returning any data');
  }
  const tab = await context.newPage();
  tab.on('pageerror', (e) => errors.push(e.message));
  await tab.goto(origin + '/trips/' + fixture.trip_id);
  await expect(tab.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  const beforeClose = await inventory(),
    closeHold = delayed.hold('planner', 'body');
  await startDelayedRead(tab, planner);
  assert.deepEqual(await closeHold.reached, { status: 200, headersDelivered: true });
  await tab.close();
  closeHold.release();
  // An independent current read proves the cache stays available; no response was replaced with test data.
  assert.equal((await read(planner)).status, 200);
  assert.deepEqual(completeStores(await inventory()).completeHeads, completeStores(beforeClose).completeHeads);
  record(
    'closing the actual requesting tab while a planner body is held cannot replace the published complete generation'
  );
  for (const kind of ['planner', 'media']) {
    const old = completeStores(await inventory()).completeHeads.rows.map((h) => h.generation);
    const hold = delayed.hold(kind, 'body');
    await startDelayedRead(page, kind === 'planner' ? planner : file, kind === 'media');
    assert.deepEqual(await hold.reached, { status: 200, headersDelivered: true });
    assert.equal(await page.evaluate(() => globalThis.__d16Response.done), false);
    await actualIdentityLogout(page);
    await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 20000 }).toBe(0);
    assert.equal(completeStores(await inventory()).completeSnapshots.count, 0);
    record('actual SDK logout retires cached bodies while the genuine ' + kind + ' response body is still incomplete');
    if (kind === 'media') {
      await page.evaluate(() => globalThis.localStorage.setItem('trek_forced_offline', '1'));
      const offline = await context.newPage();
      await offline.goto(origin + '/trips/' + fixture.trip_id);
      await expect(offline.getByRole('button', { name: 'Plan', exact: true })).toHaveCount(0);
      await expect(offline.locator('input[type=email]')).toBeVisible({ timeout: 20000 });
      await offline.close();
      await page.evaluate(() => globalThis.localStorage.removeItem('trek_forced_offline'));
      record('a separate actual offline entry cannot use a logged-out media request as saved Trip or Auth authority');
    }
    await login(fixture.owner, true);
    hold.release();
    const refused = await finishDelayedRead(page);
    assert.ok(refused.status >= 400, JSON.stringify(refused));
    assert.deepEqual(refused.keys, ['code', 'error']);
    assert.equal(refused.layer, null);
    assert.ok(!('bytes' in refused));
    snapshots[kind + '_aba_refusal'] = refused;
    await page.goto(origin + '/trips/' + fixture.trip_id);
    await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
    await expect
      .poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 })
      .toBeGreaterThan(0);
    const fresh = await inventory();
    assert.ok(completeStores(fresh).completeHeads.rows.every((h) => !old.includes(h.generation)));
    snapshots[kind + '_fresh'] = fresh;
    record(
      'same-account real password and TOTP reconnect creates fresh generations before releasing an old ' +
        kind +
        ' body'
    );
  }
  // Keep this realm alive across logout and reauthentication to verify the actor fence itself, not only navigation cancellation.
  for (const kind of ['planner', 'media']) {
    const hold = delayed.hold(kind, 'body');
    await startDelayedRead(page, kind === 'planner' ? planner : file, kind === 'media');
    assert.equal((await hold.reached).status, 200);
    await actualIdentityLogout(page);
    hold.release();
    const refused = await finishDelayedRead(page);
    assert.ok(refused.status >= 400, JSON.stringify(refused));
    assert.deepEqual(refused.keys, ['code', 'error']);
    assert.equal(refused.layer, null);
    assert.ok(!('bytes' in refused));
    snapshots[kind + '_late_refusal'] = refused;
    record('the actual handler refuses a late ' + kind + ' body after logout without returning state or private bytes');
    await login(fixture.owner, true);
    await page.goto(origin + '/trips/' + fixture.trip_id);
    await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  }
  await startDelayedRead(page, file, true);
  const current = await finishDelayedRead(page);
  assert.equal(current.status, 200);
  assert.equal(current.sha256, fixture.file_sha256);
  assert.equal(current.bytes, 34);
  record(
    'fresh current authorization still returns exactly the original 34 private Storage bytes after delayed-response refusals'
  );
  await expect
    .poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 })
    .toBeGreaterThan(0);
  const saved = await storedGeneration(),
    work = await privateLayerOriginals(saved),
    beforeWork = await inventory();
  for (const layer of ['published', 'myDraft']) {
    const refused = await read(planner + '?layer=' + layer);
    assert.equal(refused.status, 409);
    assert.equal(refused.code, 'planner_local_work');
  }
  assert.deepEqual(await work.work('read'), work.expected);
  assert.deepEqual(completeStores(await inventory()).completeHeads, completeStores(beforeWork).completeHeads);
  record(
    'trip-matching private-layer originals block both planner refreshes without replacing pointers or rewriting the original command and import'
  );
  await page.evaluate(() => globalThis.localStorage.setItem('trek_forced_offline', '1'));
  await context.close();
  context = await chromium.launchPersistentContext(path.join(output, 'private-browser-profile'), options);
  browser = context.browser();
  page = await context.newPage();
  observeContext();
  await page.goto(origin + '/trips/' + fixture.trip_id, { waitUntil: 'domcontentloaded' });
  await expectRecovery();
  assert.deepEqual(await work.work('read'), work.expected);
  record(
    'real browser close and offline restart refuse published cold admission with private originals while retaining every original field and binary byte'
  );
  await page.evaluate(() => globalThis.localStorage.removeItem('trek_forced_offline'));
  await actualIdentityLogout(page);
  assert.deepEqual(await work.work('read'), work.expected);
  snapshots.private_logged_out = await inventory();
  assert.equal(completeStores(snapshots.private_logged_out).completeHeads.count, 0);
  assert.equal(scopedRows(snapshots.private_logged_out).length, 0);
  record(
    'real logout erases private and published read snapshots but retains original private-layer work in its original native database'
  );
  await login(fixture.outsider);
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await expect(page.getByRole('heading', { name: 'Family access', exact: true })).toBeVisible({ timeout: 30000 });
  assert.deepEqual(await work.work('read'), work.expected);
  record(
    'another real account cannot display the previous private work or open its Trip, and does not delete the original bytes'
  );
  await actualIdentityLogout(page);
  await login(fixture.owner, true);
  assert.deepEqual(await work.work('read'), work.expected);
  assert.equal((await read(planner)).code, 'planner_local_work');
  record(
    'the original account reconnect still requires explicit private-work recovery and never replays an unknown command'
  );
  // Only after exact preservation is proved, remove this harness-owned synthetic work; this is not product recovery/export.
  await work.work('remove');
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  snapshots.private_final = await inventory();
  assert.ok(delayed.observations.every((r) => r.arrived && r.released && !r.timedOut && r.status === 200));
  assert.ok(!events.some((e) => e.path.includes('/render/image/') || e.path.includes('/execute_family_')));
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  record(
    'all genuine response barriers released without timeouts; zero transformations, command execution, caught or uncaught application errors'
  );
}

async function startupAcceptanceChecks() {
  const trace = { requestFailures: [], chromiumFailures: [], consoleFailures: [], phases: [] };
  snapshots.startup = trace;
  let phase = 'initial';
  context.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (![origin, fixture.api].includes(url.origin)) return;
    trace.requestFailures.push({
      phase,
      path: url.pathname,
      resource: request.resourceType(),
      code: request.failure()?.errorText.match(/ERR_[A-Z0-9_]+/)?.[0] ?? 'other',
    });
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const code = message.text().match(/ERR_[A-Z0-9_]+/)?.[0];
    if (code) trace.consoleFailures.push({ phase, code });
  });
  await page.addInitScript(() => {
    globalThis.__d16StartupResources = [];
    globalThis.document.addEventListener(
      'error',
      (event) => {
        const target = event.target;
        if (target instanceof globalThis.HTMLScriptElement && target.type === 'module')
          globalThis.__d16StartupResources.push({
            kind: 'module-error',
            path: new globalThis.URL(target.src).pathname,
          });
      },
      true
    );
  });
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await login(fixture.owner, true);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  await expect
    .poll(async () => completeStores(await inventory())?.completeHeads.count ?? 0, { timeout: 30000 })
    .toBe(1);
  const saved = await storedGeneration();
  const name = await page.evaluate(
    () =>
      globalThis.localStorage.getItem('family-native-current.v1') ??
      'trek-offline-u' + JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id
  );
  const tripId = saved.row.value.bindings.find((b) => b.kind === 'trip').key;
  const originals = await exportWorkFixture(name, tripId, 'insert');
  const button = page.getByRole('button', { name: 'Export retained work', exact: true });
  record(
    'startup diagnostics use the real application, SDK password/TOTP, generated worker and preserved synthetic original command/import bytes'
  );
  for (let cycle = 0; cycle < 6; cycle++) {
    phase = 'cold-settings-' + (cycle + 1);
    await page.goto(origin + '/settings?tab=offline');
    await expect(button).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#trek-shell-recovery')).toHaveCount(0);
    const resourceErrors = await page.evaluate(() => globalThis.__d16StartupResources);
    assert.deepEqual(resourceErrors, []);
    assert.deepEqual(await exportWorkFixture(name, tripId, 'read'), originals);
    assert.deepEqual(await storedGeneration(), saved);
    trace.phases.push({ phase, native_action_visible: true, module_errors: 0, originals_and_generation_exact: true });
    record(
      'cold native Settings navigation ' +
        (cycle + 1) +
        ' loads without shell fallback and preserves exact original work and saved generation'
    );
  }
  const entry = new URL(await page.locator('script[type="module"][src]').first().getAttribute('src'), origin).pathname;
  const beforeFault = await inventory();
  const cdp = await context.newCDPSession(page);
  const requestPaths = new Map();
  cdp.on('Network.requestWillBeSent', (event) => {
    const url = new URL(event.request.url);
    if (url.origin === origin) requestPaths.set(event.requestId, url.pathname);
  });
  cdp.on('Network.loadingFailed', (event) => {
    const path = requestPaths.get(event.requestId);
    if (path)
      trace.chromiumFailures.push({
        phase,
        path,
        blocked: event.blockedReason ?? null,
        cancelled: event.canceled,
        code: event.errorText.match(/ERR_[A-Z0-9_]+/)?.[0] ?? 'other',
      });
  });
  try {
    await cdp.send('Network.enable');
    await cdp.send('Network.setBypassServiceWorker', { bypass: true });
    await cdp.send('Network.setBlockedURLs', { urls: [origin + entry] });
    phase = 'intentional-module-denial';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#trek-shell-recovery')).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('heading', { name: 'Could not start the app', exact: true })).toBeVisible();
    assert.ok((await page.evaluate(() => globalThis.__d16StartupResources)).some((r) => r.path === entry));
    assert.ok(trace.chromiumFailures.some((r) => r.phase === phase && r.path === entry && r.blocked === 'inspector'));
    const afterFault = await inventory();
    assert.deepEqual(afterFault.databases, beforeFault.databases);
    assert.deepEqual(await exportWorkFixture(name, tripId, 'read'), originals);
    assert.deepEqual(await storedGeneration(), saved);
    record(
      'actual browser denial of the entry module shows the native retry screen without changing any account database, original command/import byte or saved generation'
    );
    await cdp.send('Network.setBlockedURLs', { urls: [] });
    phase = 'actual-user-retry';
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(button).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#trek-shell-recovery')).toHaveCount(0);
    assert.deepEqual(await exportWorkFixture(name, tripId, 'read'), originals);
    assert.deepEqual(await storedGeneration(), saved);
    trace.phases.push({ phase, actual_retry_restored_native_settings: true, originals_and_generation_exact: true });
    record(
      'unblocking transport and clicking the existing Try again action restores actual signed-in Settings with exact original work and saved generation'
    );
  } finally {
    await cdp.send('Network.setBlockedURLs', { urls: [] });
    await cdp.send('Network.setBypassServiceWorker', { bypass: false });
    await cdp.detach();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  assert.ok(!events.some((e) => e.path.includes('/render/image/') || e.path.includes('/execute_family_')));
  assert.ok(!trace.requestFailures.some((r) => r.phase.startsWith('cold-settings-') && r.path === entry));
  trace.original_diagnostic_cause_established = false;
  trace.controlled_fault_is_original_reproduction = false;
  trace.controlled_fault = { entry, browser_transport_denial: true, retry_succeeded: true, originals_exact: true };
  record(
    'startup acceptance retains original data with zero transformations, domain commands or application exceptions; the old uninstrumented failure cause remains unproved'
  );
}

async function exportWorkFixture(name, tripId, action) {
  return page.evaluate(
    async ({ name, tripId, action }) => {
      if (!(await globalThis.indexedDB.databases()).some((d) => d.name === name))
        throw Error('Original database absent');
      const db = await new Promise((resolve, reject) => {
        const r = globalThis.indexedDB.open(name);
        r.onsuccess = () => resolve(r.result);
        r.onerror = reject;
      });
      try {
        const id = 'a1600000-0000-4000-8000-000000000089';
        if (action === 'insert' || action === 'restore-queue')
          await new Promise((resolve, reject) => {
            const tx = db.transaction(['mutationQueue', 'importFiles'], 'readwrite');
            tx.objectStore('mutationQueue').put({
              id,
              tripId,
              method: 'POST',
              url: '/trips/' + tripId + '/family/future',
              body: {
                operation_id: id,
                observation: { revision: 'Original precise token' },
                future: { unknown: [1, 'keep'] },
                file: new globalThis.File(['queue file bytes'], 'queue-original.txt', {
                  type: 'text/plain',
                  lastModified: 123,
                }),
              },
              createdAt: 1,
              status: 'conflict',
              attempts: 4,
              lastError: 'Original refusal',
              schemaVersion: 999,
              baseUpdatedAt: 'Original opaque revision',
            });
            if (action === 'insert') {
              tx.objectStore('importFiles').put({
                jobId: 'd16-export-job',
                fileName: 'original.pdf',
                createdAt: 1,
                future: { keep: true },
                blob: new globalThis.Blob([new Uint8Array([0, 255, 128, 13, 10])], { type: 'application/pdf' }),
              });
              tx.objectStore('importFiles').put({
                jobId: 'd16-export-job',
                fileName: 'second.pdf',
                createdAt: 2,
                blob: new globalThis.Blob(['Second original bytes'], { type: 'application/pdf' }),
              });
            }
            tx.oncomplete = resolve;
            tx.onabort = () => reject(Error('Export fixture transaction failed'));
          });
        if (action === 'orphan-queue')
          await new Promise((resolve, reject) => {
            const tx = db.transaction(['mutationQueue'], 'readwrite');
            tx.objectStore('mutationQueue').delete(id);
            tx.oncomplete = resolve;
            tx.onabort = () => reject(Error('Synthetic queue removal failed'));
          });
        const all = await new Promise((resolve, reject) => {
          const tx = db.transaction(['mutationQueue', 'importFiles']);
          const a = tx.objectStore('mutationQueue').getAll(),
            b = tx.objectStore('importFiles').getAll();
          tx.oncomplete = () => resolve({ queue: a.result, imports: b.result });
          tx.onabort = reject;
        });
        const serialized = async (v) => {
          if (v instanceof globalThis.Blob)
            return {
              blob: Array.from(new Uint8Array(await v.arrayBuffer())),
              type: v.type,
              ...(v instanceof globalThis.File ? { name: v.name, lastModified: v.lastModified } : {}),
            };
          if (v === null || typeof v !== 'object') return v;
          if (Array.isArray(v)) return Promise.all(v.map(serialized));
          return Object.fromEntries(
            await Promise.all(Object.entries(v).map(async ([k, x]) => [k, await serialized(x)]))
          );
        };
        return serialized(all);
      } finally {
        db.close();
      }
    },
    { name, tripId, action }
  );
}
async function recoveryExportChecks() {
  const boundary = process.env.FAMILY_RECOVERY_EXPORT_BOUNDARY ?? 'aba';
  assert.ok(['aba', 'account', 'source'].includes(boundary));
  const { readOriginalWorkArchive } = await import('./original-work-reader.mjs');
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await login(fixture.owner, true);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  await expect
    .poll(async () => completeStores(await inventory())?.completeHeads.count ?? 0, { timeout: 30000 })
    .toBe(1);
  const saved = await storedGeneration();
  const name = await page.evaluate(
    () =>
      globalThis.localStorage.getItem('family-native-current.v1') ??
      'trek-offline-u' + JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id
  );
  const tripId = saved.row.value.bindings.find((b) => b.kind === 'trip').key;
  const original = await exportWorkFixture(name, tripId, 'insert');
  await page.goto(origin + '/settings?tab=offline');
  const button = page.getByRole('button', { name: 'Export retained work', exact: true });
  await expect(button).toBeVisible({ timeout: 30000 });
  record(
    'actual native desktop/phone Offline settings expose the existing explicit action for retained future-format original work'
  );
  await page.evaluate(() => globalThis.localStorage.setItem('trek_forced_offline', '1'));
  proxy.setOffline(true);
  await context.setOffline(true);
  const pendingDownload = page.waitForEvent('download');
  await button.click();
  const download = await pendingDownload;
  assert.equal(await download.failure(), null);
  assert.equal(download.suggestedFilename(), 'family-original-work-v3.json');
  const destination = path.join(output, 'private-original-work-v2.json');
  await download.saveAs(destination);
  const bytes = await readFile(destination),
    archive = readOriginalWorkArchive(bytes);
  assert.equal(archive.payload.database, name);
  assert.equal(archive.data.queue.length, 1);
  assert.equal(archive.data.imports.length, 2);
  const row = archive.data.queue[0].row;
  const { file, ...body } = row.body;
  assert.deepEqual(
    {
      ...row,
      body: {
        ...body,
        file: {
          blob: Array.from(new Uint8Array(await file.arrayBuffer())),
          type: file.type,
          name: file.name,
          lastModified: file.lastModified,
        },
      },
    },
    original.queue[0]
  );
  assert.equal(file.name, 'queue-original.txt');
  assert.equal(file.lastModified, 123);
  assert.deepEqual(
    archive.data.imports.map((v) => v.key),
    [
      ['d16-export-job', 'original.pdf'],
      ['d16-export-job', 'second.pdf'],
    ]
  );
  assert.deepEqual(
    Array.from(new Uint8Array(await archive.data.imports[0].row.blob.arrayBuffer())),
    [0, 255, 128, 13, 10]
  );
  assert.equal(await archive.data.imports[1].row.blob.text(), 'Second original bytes');
  assert.deepEqual(archive.data.imports[0].row.future, { keep: true });
  assert.deepEqual(await exportWorkFixture(name, tripId, 'read'), original);
  record(
    'an actual user-triggered offline browser download independently decodes every operation/revision/status/attempt, queue File and both compound-key original byte sources'
  );
  snapshots.original_export = {
    format: 'family.original-work.v3',
    archive_sha256: createHash('sha256').update(bytes).digest('hex'),
    payload_sha256: archive.sha256,
    queue: 1,
    imports: 2,
    all_original_fields_and_file_metadata_exact: true,
    all_original_binary_bytes_exact: true,
    automatic_replay: archive.payload.automatic_replay,
  };
  assert.deepEqual(await storedGeneration(), saved);
  record(
    'successful export retains the same immutable saved generation and never acknowledges, deletes, modifies or replays original work'
  );
  // Harness-only fixture transition; product export never deletes/acknowledges work.
  const orphaned = await exportWorkFixture(name, tripId, 'orphan-queue');
  assert.deepEqual(orphaned, { queue: [], imports: original.imports });
  proxy.setOffline(false);
  await context.setOffline(false);
  await page.evaluate(() => globalThis.localStorage.removeItem('trek_forced_offline'));
  await page.goto(origin + '/settings?tab=offline');
  await expect(button).toBeVisible({ timeout: 30000 });
  await page.evaluate(() => globalThis.localStorage.setItem('trek_forced_offline', '1'));
  proxy.setOffline(true);
  await context.setOffline(true);
  const orphanPending = page.waitForEvent('download');
  await button.click();
  const orphanDownload = await orphanPending;
  assert.equal(await orphanDownload.failure(), null);
  const orphanDestination = path.join(output, 'private-orphan-work-v2.json');
  await orphanDownload.saveAs(orphanDestination);
  const orphanBytes = await readFile(orphanDestination),
    orphanArchive = readOriginalWorkArchive(orphanBytes);
  assert.deepEqual(orphanArchive.data.queue, []);
  assert.deepEqual(
    orphanArchive.data.imports.map((v) => v.key),
    archive.data.imports.map((v) => v.key)
  );
  for (let i = 0; i < orphanArchive.data.imports.length; i++) {
    const { blob, ...metadata } = orphanArchive.data.imports[i].row;
    const { blob: originalBlob, ...originalMetadata } = original.imports[i];
    assert.deepEqual(metadata, originalMetadata);
    assert.deepEqual(Array.from(new Uint8Array(await blob.arrayBuffer())), originalBlob.blob);
    assert.equal(blob.type, originalBlob.type);
  }
  assert.deepEqual(await exportWorkFixture(name, tripId, 'read'), orphaned);
  assert.deepEqual(await storedGeneration(), saved);
  snapshots.orphan_export = {
    archive_sha256: createHash('sha256').update(orphanBytes).digest('hex'),
    queue: 0,
    imports: 2,
    native_action_visible: true,
    original_sources_and_generation_exact: true,
  };
  record(
    'import-only originals expose the actual qualified native export action and download exact compound keys, metadata and bytes without a queue command'
  );
  assert.deepEqual(await exportWorkFixture(name, tripId, 'restore-queue'), original);
  await page.evaluate(() => {
    const read = globalThis.Blob.prototype.arrayBuffer;
    let release;
    globalThis.__d16ExportBarrier = {
      arrived: false,
      release: () => release(),
      restore: () => {
        globalThis.Blob.prototype.arrayBuffer = read;
      },
    };
    const wait = new Promise((resolve) => {
      release = resolve;
    });
    globalThis.Blob.prototype.arrayBuffer = async function () {
      const bytes = await read.call(this);
      if (this.type === 'application/pdf') {
        globalThis.__d16ExportBarrier.arrived = true;
        await wait;
      }
      return bytes;
    };
    globalThis.__d16ExportUnexpectedDownloads = [];
  });
  const lateDownloads = [];
  page.on('download', (d) => lateDownloads.push(d.suggestedFilename()));
  await button.click();
  await expect.poll(() => page.evaluate(() => globalThis.__d16ExportBarrier.arrived)).toBe(true);
  record(
    'a genuine Blob byte read is held after the explicit native export action without replacing App, SDK, permissions or original bytes'
  );
  proxy.setOffline(false);
  await context.setOffline(false);
  await page.evaluate(() => globalThis.localStorage.removeItem('trek_forced_offline'));
  if (boundary === 'source') {
    const nextDist = process.env.FAMILY_OFFLINE_NEXT_DIST;
    assert.match(nextDist ?? '', /^\/private\/tmp\/trek-u03d16-export-alias-[^/]+\/build-qualified\/actual-dist$/);
    const manifest = JSON.parse(await readFile(path.join(nextDist, '..', 'actual-build.json'), 'utf8'));
    assert.equal(manifest.source_boundary_alias, true);
    assert.equal(manifest.supabase_endpoint, 'http://localhost:55331');
    assert.equal(manifest.canonical_fixture_endpoint, fixture.api);
    for (const [file, hash] of Object.entries(manifest.artifact_hashes))
      assert.equal(
        createHash('sha256')
          .update(await readFile(path.join(nextDist, file)))
          .digest('hex'),
        hash
      );
    server.switchDirectory(nextDist);
    await page.evaluate(() => {
      globalThis.__d16ExportSourceChanges = 0;
      globalThis.navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => globalThis.__d16ExportSourceChanges++
      );
    });
    await page.evaluate(async () => {
      await (await globalThis.navigator.serviceWorker.getRegistration()).update();
    });
    await expect
      .poll(() => page.evaluate(() => globalThis.__d16ExportSourceChanges), { timeout: 90000 })
      .toBeGreaterThan(0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('input[type=email]')).toBeVisible({ timeout: 30000 });
    assert.equal(await page.evaluate(() => typeof globalThis.__d16ExportBarrier), 'undefined');
    await login(fixture.owner, true);
    await expect(page.getByRole('button', { name: 'Export retained work', exact: true })).toBeVisible({
      timeout: 30000,
    });
    assert.equal(await page.evaluate(() => globalThis.localStorage.getItem('sb-localhost-auth-token') !== null), true);
    assert.deepEqual(lateDownloads, []);
    assert.deepEqual(await exportWorkFixture(name, tripId, 'read'), original);
    snapshots.export_source = {
      compiled_alias_verified: true,
      actual_worker_changed: true,
      original_realm_destroyed: true,
      independent_sdk_namespace_validated: true,
      manifest_sha256: createHash('sha256')
        .update(await readFile(path.join(nextDist, '..', 'actual-build.json')))
        .digest('hex'),
    };
    record(
      'actual compiled-source/worker replacement destroys the held old export realm, requires fresh SDK password/TOTP and preserves all original bytes with no late download'
    );
  } else {
    await actualIdentityLogout(page);
    await login(boundary === 'account' ? fixture.outsider : fixture.owner, boundary !== 'account');
    await page.evaluate(() => {
      globalThis.__d16ExportBarrier.release();
      globalThis.__d16ExportBarrier.restore();
    });
    await expect(
      page.getByText('The original recovery context changed. Nothing was exported or removed.', { exact: true })
    ).toBeVisible({ timeout: 10000 });
    assert.deepEqual(lateDownloads, []);
    assert.deepEqual(await exportWorkFixture(name, tripId, 'read'), original);
    record(
      boundary === 'account'
        ? 'actual SDK logout and another account reject the delayed export without a late download or changes to the original account bytes'
        : 'actual SDK logout and same-account password/TOTP return reject the delayed export, with zero late download and exact original data'
    );
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  assert.ok(!events.some((e) => e.path.includes('/render/image/') || e.path.includes('/execute_family_')));
  record(
    'export acceptance ends with zero transformations, command execution or caught/uncaught application errors; synthetic originals remain retained'
  );
}

async function nativeControlsChecks() {
  page.setDefaultTimeout(20000);
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await login(fixture.owner, true);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect
    .poll(async () => completeStores(await inventory())?.completeHeads.count ?? 0, { timeout: 30000 })
    .toBe(1);
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  assert.equal((await storageRead()).status, 200);
  const saved = await storedGeneration(),
    before = await inventory();
  const observed = (snapshots.native_controls = { same_generation: true, downloads: [], popups: [] });
  page.on('download', () => observed.downloads.push('unexpected private byte download'));
  page.on('popup', () => observed.popups.push('unexpected private byte popup'));
  const reset = async () => {
    await page.goto(origin + '/trips/' + fixture.trip_id, { waitUntil: 'domcontentloaded' });
    await expectCold();
    assert.deepEqual(await storedGeneration(), saved);
  };
  const noButtons = async (names, scope = page) => {
    for (const name of names) await expect(scope.getByRole('button', { name, exact: true })).toHaveCount(0);
  };
  const refused = async () => {
    await expect(
      page
        .getByText('This saved Trip is read only. Reconnect and validate access before making changes.', {
          exact: true,
        })
        .last()
    ).toBeVisible();
  };
  // Observe the real button through the event/microtask turn, including transient optimistic toggles.
  const unchangedPress = async (button) => {
    const initial = await button.getAttribute('aria-pressed');
    assert.notEqual(initial, null);
    await button.evaluate((el) => {
      const values = [el.getAttribute('aria-pressed')];
      const observer = new globalThis.MutationObserver((changes) => {
        for (const change of changes) values.push(change.oldValue);
        values.push(el.getAttribute('aria-pressed'));
      });
      observer.observe(el, { attributes: true, attributeOldValue: true, attributeFilter: ['aria-pressed'] });
      el.__d16ControlObservation = { observer, values };
    });
    await button.click();
    await refused();
    const values = await button.evaluate((el) => {
      const { observer, values } = el.__d16ControlObservation;
      values.push(el.getAttribute('aria-pressed'));
      observer.disconnect();
      delete el.__d16ControlObservation;
      return values;
    });
    assert.ok(values.every((value) => value === initial));
    return { initial, all_observed_states_unchanged: true };
  };
  await page.evaluate(() => globalThis.localStorage.setItem('trek_forced_offline', '1'));
  proxy.setOffline(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectCold();
  const offlineEventStart = events.length;
  record('actual main/SDK/MFA/worker captures one complete generation and cold-opens the native saved Plan');
  if (phone) await page.getByRole('button', { name: 'Places', exact: true }).click();
  await page.getByText(saved.row.value.data.planner.view.state.locations[0].name, { exact: true }).first().click();
  if (phone) await page.getByRole('button', { name: 'View details', exact: true }).click();
  const stars = page.getByRole('radio');
  await expect(stars).toHaveCount(5);
  for (const text of ['Cafe street 7', 'Catalog restaurant description', 'Dinner one', 'Dinner two', 'D16b peer'])
    await expect(page.getByText(text, { exact: true }).last()).toBeVisible();
  await noButtons(['Edit', 'Delete', 'Upload']);
  record(
    'native Place details retain canonical description/address, repeated-visit bookings and saved participants; edit/delete/upload are absent'
  );
  const ratings = await stars.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-checked')));
  await page.getByRole('radio', { name: '4', exact: true }).click();
  await refused();
  assert.deepEqual(await stars.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-checked'))), ratings);
  record('native rating callback reports read-only refusal without changing the saved rating');
  await page
    .getByRole('button', { name: /D16b peer/ })
    .last()
    .click();
  await refused();
  await expect(page.getByRole('button', { name: /D16b peer/ }).last()).toBeVisible();
  if (phone) await noButtons(['Remove from Day', 'Add to Day']);
  else {
    await page.getByRole('button', { name: 'Remove from Day', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Remove from Day', exact: true })).toBeVisible();
  }
  assert.deepEqual(await storedGeneration(), saved);
  record(
    'participant and day-assignment controls preserve their original membership/visit; phone day mutations remain hidden'
  );
  await reset();
  await page.getByRole('button', { name: 'Bookings', exact: true }).first().click();
  const bookingTitle = saved.row.value.data.booking.bookings[0].record.title;
  await page.getByText(bookingTitle, { exact: true }).first().click();
  const booking = page.getByRole('dialog', { name: bookingTitle, exact: true });
  await expect(booking).toBeVisible();
  await expect(booking.getByText('Keep confirmation', { exact: true })).toBeVisible();
  await expect(booking.getByText('kept.txt', { exact: true })).toBeVisible();
  await noButtons(['Edit', 'Delete', 'Save'], booking);
  if (!phone) await expect(booking.getByText('Hotel expense', { exact: true })).toBeVisible();
  record('actual native Booking detail loads confirmation and file relationship without a writable editor');
  await reset();
  await page.getByRole('button', { name: 'Lists', exact: true }).first().click();
  await expect(page.getByText('D16b shared raincoat', { exact: true }).first()).toBeVisible();
  const packingBox = phone
    ? page.getByRole('button', { name: 'D16b shared raincoat', exact: true })
    : page.locator('button.packing-check').first();
  observed.shared_packing = await unchangedPress(packingBox);
  await expect(page.getByText('D16b peer-only medicine', { exact: true })).toHaveCount(0);
  record(
    'actual shared packing checkbox reports refusal with no transient optimistic toggle or private-peer disclosure'
  );
  if (!phone) {
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByRole('textbox', { name: /Import/i }).fill('D16 read-only import must not save');
    await page.getByRole('button', { name: /^Import 1/ }).click();
    await expect(
      page.getByText('This needs a connection. Try again once TREK is back online.', { exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
  } else {
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    await noButtons(['Import', 'Add item', 'Apply template', 'Save as template']);
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
  }
  await expect(page.getByText('D16 read-only import must not save', { exact: true })).toHaveCount(0);
  record(
    'packing import refuses without adding an item; phone authoring actions are absent from the native actions sheet'
  );
  await page
    .getByRole('button', { name: /^My list/i })
    .first()
    .click();
  await expect(page.getByText('D16b private camera', { exact: true }).first()).toBeVisible();
  const personalBox = phone
    ? page.getByRole('button', { name: 'D16b private camera', exact: true })
    : page.locator('button.packing-check').first();
  observed.personal_packing = await unchangedPress(personalBox);
  await expect(page.getByText('D16b peer-only medicine', { exact: true })).toHaveCount(0);
  record('current-person private packing also refuses without optimistic state or another person’s packing');
  await page.getByRole('button', { name: /To-do/i }).first().click();
  const taskName = saved.row.value.data.tasks.tasks[0].name;
  await page.getByText(taskName, { exact: true }).first().click();
  const priority = page.getByRole('button', { name: 'P1', exact: true });
  await expect(priority).toBeVisible();
  await expect(page.getByText('Native writer acceptance', { exact: true }).last()).toBeVisible();
  if (phone) await expect(priority).toBeDisabled();
  else {
    const value = await priority.getAttribute('aria-pressed');
    await priority.click();
    await expect(priority).toHaveAttribute('aria-pressed', value);
    await expect(page.getByPlaceholder('Task name')).toBeDisabled();
  }
  await noButtons(['Save', 'Delete']);
  record('actual Task detail retains saved text and refuses priority editing; save/delete remain absent');
  await reset();
  await page.getByRole('button', { name: 'Costs', exact: true }).first().click();
  await expect(page.getByText(saved.row.value.data.companions.expenses[0].name, { exact: true }).first()).toBeVisible();
  await page.getByText(saved.row.value.data.companions.expenses[0].name, { exact: true }).first().click();
  await expect(page.getByText('Preserve ledger', { exact: true }).last()).toBeVisible();
  await noButtons(['Save', 'Delete']);
  if (phone) {
    await page.getByRole('button', { name: 'Add expense', exact: true }).click();
    const draft = page.getByRole('dialog', { name: 'Add expense', exact: true });
    await expect(draft).toBeVisible();
    await draft.getByPlaceholder('e.g. Dinner, souvenirs, gas…').fill('D16 read-only expense must not save');
    await draft.locator('input[inputmode="decimal"]').first().fill('1.00');
    const errorsBefore = await page.getByText('Unknown error', { exact: true }).count();
    await draft.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Unknown error', { exact: true })).toHaveCount(errorsBefore + 1);
    await expect(draft).toBeVisible();
    await draft.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(draft).toHaveCount(0);
    await expect(page.getByText('D16 read-only expense must not save', { exact: true })).toHaveCount(0);
  } else await noButtons(['Add expense']);
  record(
    'actual expense retains ledger details; desktop has no create control and phone draft save refuses without adding an expense'
  );
  await reset();
  if (phone) await page.getByRole('button', { name: 'More', exact: true }).click();
  await page
    .getByRole('button', { name: /^Files(?:\b|$)/ })
    .first()
    .click();
  const filename = saved.row.value.data.companions.files[0].original_name;
  await expect(page.getByText(filename, { exact: true }).first()).toBeVisible();
  await noButtons(['Delete']);
  if (phone) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload', exact: true }).click();
    await (
      await chooser
    ).setFiles({
      name: 'd16-read-only-must-not-upload.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('synthetic read-only refusal'),
    });
    await expect(page.getByText('Upload failed', { exact: true })).toBeVisible();
    await expect(page.getByText('d16-read-only-must-not-upload.txt', { exact: true })).toHaveCount(0);
    await page.getByText(filename, { exact: true }).first().click();
    await expect(page.getByText('Could not open file', { exact: true })).toBeVisible();
  } else {
    await noButtons(['Upload']);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    const preview = page.getByRole('dialog', { name: filename, exact: true });
    await expect(preview).toBeVisible();
    await expect(preview.locator('object')).not.toHaveAttribute('data', /.+/);
    await preview.getByRole('button', { name: 'Download', exact: true }).click();
    await preview.getByRole('button', { name: /Open in/ }).click();
    await expect(page.getByText('Could not open file', { exact: true })).toBeVisible();
  }
  assert.deepEqual(observed.downloads, []);
  assert.deepEqual(observed.popups, []);
  record('native file metadata opens without downloaded bytes, signing, private-file popup or fabricated download');
  const final = await inventory();
  assert.deepEqual(await storedGeneration(), saved);
  assert.deepEqual(completeStores(final), completeStores(before));
  const native = (value) =>
    value.databases.filter((d) => d.name.startsWith('trek-offline-u') || d.name.startsWith('trek-offline-f1-'));
  assert.deepEqual(native(final), native(before));
  snapshots.controls_before = before;
  snapshots.controls_after = final;
  observed.native_stores_unchanged = true;
  record('all detail/authoring attempts retain exact complete generation, native queue and native cache stores');
  const offlineEvents = events.slice(offlineEventStart);
  assert.ok(
    !offlineEvents.some((e) =>
      /\/storage\/v1\/(?:object\/authenticated|object\/sign)|\/api\/family\/files\/.+\/open|\/sign\//.test(e.path)
    )
  );
  assert.ok(!events.some((e) => e.path.includes('/render/image/') || e.path.includes('/execute_family_')));
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  record(
    'zero catalog transformations, domain commands, unavailable-byte requests, caught or uncaught application errors'
  );
}

function integrityDigest(value) {
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
  return createHash('sha256').update(canonical(value)).digest('hex');
}
async function futureDatabaseRead(name) {
  return page.evaluate(async (name) => {
    if (!(await globalThis.indexedDB.databases()).some((d) => d.name === name)) throw Error('Future fixture missing');
    const db = await new Promise((resolve, reject) => {
      const r = globalThis.indexedDB.open(name);
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
    try {
      const row = await new Promise((resolve, reject) => {
        const r = db.transaction('d16FutureOpaque').objectStore('d16FutureOpaque').get('opaque');
        r.onsuccess = () => resolve(r.result);
        r.onerror = reject;
      });
      return {
        version: db.version,
        stores: Array.from(db.objectStoreNames),
        row: { ...row, blob: Array.from(new Uint8Array(await row.blob.arrayBuffer())) },
      };
    } finally {
      db.close();
    }
  }, name);
}
async function futureNativeDatabaseChecks(saved) {
  const name = await page.evaluate(
    () =>
      globalThis.localStorage.getItem('family-native-current.v1') ??
      'trek-offline-u' + JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id
  );
  const opener = page,
    popup = opener.waitForEvent('popup');
  await opener.evaluate(() => globalThis.open('about:blank', 'd16-future-control'));
  page = await popup;
  for (const other of context.pages()) if (other !== page) await other.close();
  assert.equal(await page.locator('script').count(), 0);
  const beforeVersion = await page.evaluate(async (name) => {
    const open = (version) =>
      new Promise((resolve, reject) => {
        const r = version === undefined ? globalThis.indexedDB.open(name) : globalThis.indexedDB.open(name, version);
        r.onupgradeneeded = () => {
          if (version === undefined) throw Error('Existing fixture database required');
          const store = r.result.createObjectStore('d16FutureOpaque', { keyPath: 'id' });
          store.put({
            id: 'opaque',
            format: 999,
            revision: 17,
            unknown: { keep: ['all', 0, false] },
            blob: new globalThis.Blob([new Uint8Array([0, 255, 128, 13, 10])]),
          });
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = reject;
        r.onblocked = () => reject(Error('Future fixture upgrade blocked'));
      });
    const original = await open();
    const before = original.version;
    try {
      if (before !== 140) throw Error('Expected qualified native version140');
      for (const store of original.objectStoreNames) {
        const n = await new Promise((resolve, reject) => {
          const r = original.transaction(store).objectStore(store).count();
          r.onsuccess = () => resolve(r.result);
          r.onerror = reject;
        });
        if (n !== 0) throw Error('Expected clean native fixture before future-version control');
      }
    } finally {
      original.close();
    }
    const future = await open(before + 10);
    future.close();
    return before;
  }, name);
  assert.equal(beforeVersion, 140);
  const future = await futureDatabaseRead(name);
  assert.equal(future.version, 150);
  assert.deepEqual(future.row.blob, [0, 255, 128, 13, 10]);
  assert.deepEqual(await storedGeneration(), saved);
  await context.close();
  context = await chromium.launchPersistentContext(path.join(output, 'private-browser-profile'), options);
  browser = context.browser();
  page = await context.newPage();
  observeContext();
  await page.goto(origin + '/trips/' + fixture.trip_id, { waitUntil: 'domcontentloaded' });
  await expectRecovery();
  assert.deepEqual(await futureDatabaseRead(name), future);
  assert.deepEqual(await storedGeneration(), saved);
  record(
    'an actual future native database version refuses cold admission even with no queued command or import, and preserves its unknown store and binary bytes'
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectRecovery();
  assert.deepEqual(await futureDatabaseRead(name), future);
  assert.deepEqual(await storedGeneration(), saved);
  record(
    'repeated future-database startup preserves the native schema, unknown fields and saved generation without a downgrade or replacement'
  );
  const command = await originalWorkFixture(saved, 'insert'),
    original = await originalWorkFixture(saved, 'read');
  assert.deepEqual(original.row, command);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectRecovery();
  assert.deepEqual(await originalWorkFixture(saved, 'read'), original);
  assert.deepEqual(await futureDatabaseRead(name), future);
  assert.deepEqual(await storedGeneration(), saved);
  snapshots.future_database = {
    beforeVersion,
    after: future,
    originalCommandAndImportExact: true,
    cleanRefusalProvedBeforeWorkSeed: true,
  };
  record(
    'the refused future database also retains exact original command metadata and compound-key binary imports without replay or cleanup'
  );
}
async function storageIntegrityChecks() {
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await login(fixture.owner, true);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect
    .poll(async () => completeStores(await inventory())?.completeHeads.count ?? 0, { timeout: 30000 })
    .toBe(1);
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  assert.equal((await storageRead()).status, 200);
  const saved = await storedGeneration();
  await page.evaluate(() => globalThis.localStorage.setItem('trek_forced_offline', '1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectCold();
  const owners = (await inventory()).databases.find((d) => d.name === 'family-planner-cache-v1').stores.owners;
  record(
    'the real SDK and worker capture a complete generation that opens offline under its original account and native database'
  );
  if (process.env.FAMILY_OFFLINE_INTEGRITY_FUTURE_ONLY !== '1') {
    for (const kind of [
      'future-body',
      'future-row',
      'future-head',
      'dangling-pointer',
      'owner-mismatch',
      'malformed-tasks',
      'duplicate-binding',
      'write-capability',
    ]) {
      const altered = globalThis.structuredClone(saved);
      if (kind === 'future-body') altered.row.value.format = 'family.offline-trip.v99';
      if (kind === 'future-row') altered.row.version = 999;
      if (kind === 'future-head') altered.head.version = 999;
      if (kind === 'dangling-pointer') altered.head.generation = 'a1700000-0000-4000-8000-000000000099';
      if (kind === 'owner-mismatch') altered.head.ownerGeneration = 'a1700000-0000-4000-8000-000000000098';
      if (kind === 'malformed-tasks') altered.row.value.data.tasks.tasks = 'invalid-array';
      if (kind === 'duplicate-binding') altered.row.value.bindings.push(altered.row.value.bindings[0]);
      if (kind === 'write-capability') altered.row.value.capabilities.writes = true;
      const body = { ...altered.row.value };
      delete body.digest;
      altered.row.value.digest = integrityDigest(body);
      await replaceGeneration(altered);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expectRecovery();
      assert.deepEqual(await storedGeneration(), altered);
      assert.deepEqual(
        (await inventory()).databases.find((d) => d.name === 'family-planner-cache-v1').stores.owners,
        owners
      );
      record(
        'actual IndexedDB ' +
          kind +
          ' refuses admission without changing retained bytes or creating replacement ownership'
      );
      await replaceGeneration(saved);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expectCold();
      assert.deepEqual(await storedGeneration(), saved);
    }
    record(
      'explicit restoration of every supported fixture reopens the same unrenewed generation after all format and semantic refusals'
    );
    const dangling = globalThis.structuredClone(saved);
    dangling.head.generation = 'a1700000-0000-4000-8000-000000000097';
    await replaceGeneration(dangling);
    const refused = await storageRead();
    assert.ok(refused.status >= 400);
    assert.equal(refused.trip, null);
    assert.deepEqual(refused.keys, ['code', 'error']);
    assert.deepEqual(await storedGeneration(), dangling);
    record('a mounted saved reader refuses a changed pointer before returning new Trip or companion data');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectRecovery();
    assert.deepEqual(await storedGeneration(), dangling);
    record(
      'explicit cold reload after a mounted pointer change shows recovery and preserves both the old body and changed pointer'
    );
    await replaceGeneration(saved);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectCold();
    assert.deepEqual(await storedGeneration(), saved);
    record('explicit restoration after pointer refusal reopens the original generation without renewing its lifetime');
  }
  await futureNativeDatabaseChecks(saved);
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  assert.ok(!events.some((e) => e.path.includes('/render/image/') || e.path.includes('/execute_family_')));
  record(
    'integrity acceptance finishes with zero transformations, command execution or caught/uncaught application errors'
  );
}

async function storageRead(suffix = 'bundle') {
  return page.evaluate(
    async ({ trip, suffix }) => {
      const response = await globalThis.fetch('/api/trips/' + trip + '/' + suffix),
        body = await response.json();
      return {
        status: response.status,
        keys: Object.keys(body).sort(),
        trip: body.trip?.family_uuid ?? null,
        code: body.code ?? null,
      };
    },
    { trip: fixture.trip_id, suffix }
  );
}
async function storageMissingDatabase() {
  const saved = await storedGeneration();
  await page.evaluate(() => globalThis.localStorage.setItem('trek_forced_offline', '1'));
  // A blank popup inherits the real opener's origin without navigating through
  // its worker. Close every App realm before inspecting/removing the empty DB.
  const opener = page,
    popup = opener.waitForEvent('popup');
  await opener.evaluate(() => globalThis.open('about:blank', 'd16-storage-control'));
  const control = await popup;
  for (const other of context.pages()) if (other !== control) await other.close();
  page = control;
  await page.evaluate(() => {
    globalThis.document.title = 'Storage fixture control';
  });
  await expect(page).toHaveTitle('Storage fixture control');
  assert.equal(await page.locator('script').count(), 0);
  const removed = await page.evaluate(async () => {
    const name =
      globalThis.localStorage.getItem('family-native-current.v1') ??
      'trek-offline-u' + JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id;
    if (!(await globalThis.indexedDB.databases()).some((d) => d.name === name))
      throw Error('Expected existing fixture database');
    const db = await new Promise((resolve, reject) => {
      const r = globalThis.indexedDB.open(name);
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
    try {
      for (const store of db.objectStoreNames) {
        const count = await new Promise((resolve, reject) => {
          const r = db.transaction(store).objectStore(store).count();
          r.onsuccess = () => resolve(r.result);
          r.onerror = reject;
        });
        if (count !== 0) throw Error('Refusing to remove a fixture database containing any rows');
      }
    } finally {
      db.close();
    }
    await new Promise((resolve, reject) => {
      const r = globalThis.indexedDB.deleteDatabase(name);
      r.onsuccess = resolve;
      r.onerror = reject;
      r.onblocked = () => reject(Error('Fixture database still open'));
    });
    return { allStoresEmpty: true, absent: !(await globalThis.indexedDB.databases()).some((d) => d.name === name) };
  });
  assert.deepEqual(removed, { allStoresEmpty: true, absent: true });
  assert.deepEqual(await storedGeneration(), saved);
  await context.close();
  context = await chromium.launchPersistentContext(path.join(output, 'private-browser-profile'), options);
  browser = context.browser();
  page = await context.newPage();
  observeContext();
  await context.addInitScript(installStorageFaults);
  await page.goto(origin + '/trips/' + fixture.trip_id, { waitUntil: 'domcontentloaded' });
  await expectRecovery();
  assert.deepEqual(await storedGeneration(), saved);
  snapshots.missing_database = await inventory();
  record(
    'actual absence of the empty original native database refuses cold admission without renewing cached Trip ownership or data'
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectRecovery();
  assert.deepEqual(await storedGeneration(), saved);
  record(
    'repeated offline startup still refuses the missing database without creating a replacement or renewing the saved generation'
  );
  await page.evaluate(() => globalThis.localStorage.removeItem('trek_forced_offline'));
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  assert.equal((await storageRead()).status, 200);
  const fresh = await storedGeneration();
  assert.notEqual(fresh.head.generation, saved.head.generation);
  record('current online validation recreates the empty local database and captures a fresh complete generation');
  await page.evaluate(() => globalThis.localStorage.setItem('trek_forced_offline', '1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectCold();
  assert.deepEqual(await storedGeneration(), fresh);
  record('only the newly captured generation reopens offline after genuine database recovery');
}
async function storageFailureChecks() {
  await context.addInitScript(installStorageFaults);
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await login(fixture.owner, true);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect
    .poll(async () => completeStores(await inventory())?.completeHeads.count ?? 0, { timeout: 30000 })
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  assert.equal((await storageRead()).status, 200);
  record(
    'actual SDK password/TOTP, worker and online native bundle capture a complete Trip before storage fault injection'
  );
  if (process.env.FAMILY_OFFLINE_STORAGE_MISSING_ONLY === '1') {
    await storageMissingDatabase();
    return;
  }
  for (const kind of ['write-quota', 'write-abort']) {
    const before = await storedGeneration(),
      inventoryBefore = await inventory();
    await page.evaluate((kind) => globalThis.__d16StorageFaults.arm(kind), kind);
    const response = await storageRead();
    assert.equal(response.status, 200);
    assert.equal(response.trip, fixture.trip_id);
    await expect
      .poll(() => page.evaluate(() => globalThis.__d16StorageFaults.summary().hits.at(-1)?.abortObserved))
      .toBe(true);
    const hit = await page.evaluate(() => globalThis.__d16StorageFaults.summary().hits.at(-1));
    assert.equal(hit.kind, kind);
    await page.evaluate(() => globalThis.__d16StorageFaults.disarm());
    assert.deepEqual(await storedGeneration(), before);
    assert.deepEqual(
      completeStores(await inventory()).completeSnapshots,
      completeStores(inventoryBefore).completeSnapshots
    );
    await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible();
    record(
      'actual complete capture ' +
        kind +
        ' abort preserves the previous immutable body/head and keeps the validated online native UI available'
    );
  }
  const previous = await storedGeneration();
  assert.equal((await storageRead()).status, 200);
  const current = await storedGeneration();
  assert.notEqual(current.head.generation, previous.head.generation);
  record('a subsequent genuine successful capture advances the pointer only after the entire transaction succeeds');
  await page.evaluate(() => globalThis.localStorage.setItem('trek_forced_offline', '1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectCold();
  assert.deepEqual(await storedGeneration(), current);
  record('cold offline admission reads that same complete generation without renewing its lifetime');
  await page.evaluate(
    () => new Promise((resolve) => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)))
  );
  await page.evaluate(() => globalThis.__d16StorageFaults.arm('read-abort'));
  const refused = await storageRead();
  assert.ok(refused.status >= 400, JSON.stringify(refused));
  assert.equal(refused.trip, null);
  assert.deepEqual(refused.keys, ['code', 'error']);
  await expect
    .poll(() => page.evaluate(() => globalThis.__d16StorageFaults.summary().hits.at(-1)?.abortObserved))
    .toBe(true);
  const mountedFault = await page.evaluate(() => globalThis.__d16StorageFaults.summary());
  await page.evaluate(() => globalThis.__d16StorageFaults.disarm());
  assert.deepEqual(await storedGeneration(), current);
  snapshots.mounted_fault = mountedFault;
  record(
    'an actual mounted saved-reader transaction abort returns no Trip or companion payload and preserves its complete body/head'
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectCold();
  assert.deepEqual(await storedGeneration(), current);
  record('explicit reload recovers from a transient mounted read abort using the same unrenewed generation');
  await page.evaluate(() => globalThis.__d16StorageFaults.arm('read-abort', true));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectRecovery();
  const admissionFault = await page.evaluate(() => globalThis.__d16StorageFaults.summary());
  assert.equal(admissionFault.hits.length, 1);
  assert.equal(admissionFault.hits[0].kind, 'read-abort');
  await expect
    .poll(() => page.evaluate(() => globalThis.__d16StorageFaults.summary().hits[0]?.abortObserved))
    .toBe(true);
  await page.evaluate(() => globalThis.__d16StorageFaults.disarm());
  assert.deepEqual(await storedGeneration(), current);
  snapshots.admission_fault = admissionFault;
  record(
    'an actual admission read abort shows recovery rather than native Trip data and retains the original immutable generation'
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectCold();
  assert.deepEqual(await storedGeneration(), current);
  record(
    'removing a transient admission fault restores the same recent read without creating or renewing cached authority'
  );
  await page.evaluate(() => globalThis.__d16StorageFaults.arm('cache-open', true));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectRecovery();
  const openFault = await page.evaluate(() => globalThis.__d16StorageFaults.summary());
  assert.ok(openFault.hits.length > 0);
  await page.evaluate(() => globalThis.__d16StorageFaults.disarm());
  assert.deepEqual(await storedGeneration(), current);
  snapshots.open_fault = openFault;
  record(
    'inaccessible scoped cache storage refuses admission and preserves retained bytes rather than replacing them with empty data'
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectCold();
  assert.deepEqual(await storedGeneration(), current);
  record('explicit reload after cache storage becomes accessible reuses the same complete generation');
  await page.evaluate(() => globalThis.localStorage.removeItem('trek_forced_offline'));
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await storageMissingDatabase();
  assert.ok(!events.some((e) => e.path.includes('/render/image/') || e.path.includes('/execute_family_')));
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  record(
    'storage failure acceptance makes zero transformation, domain-command, caught or uncaught application error attempts'
  );
}

const snapshots = {};
const expectComplete = process.env.FAMILY_OFFLINE_INVENTORY_COMPLETE === '1';
const completeStores = (v) => v.databases.find((d) => d.name === 'family-planner-cache-v1')?.stores;
async function companionLifecycle() {
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
      assert.equal(row.format, 'family.offline-trip.v2');
      assert.equal(row.integrity_valid, true);
      assert.deepEqual(row.components, ['booking', 'companions', 'header', 'packing', 'planner', 'tasks']);
      assert.deepEqual(row.capabilities, { coldRead: true, writes: false, tags: false, mediaBytes: false });
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
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 45000 });
  await expect(page.getByRole('status').filter({ hasText: /view only/ })).toBeVisible();
  snapshots.cold_offline = await inventory();
  assert.deepEqual(
    completeStores(snapshots.cold_offline).completeHeads,
    completeStores(snapshots.online).completeHeads
  );
  record('cold offline entry displays the actual native Trip from one recent complete generation in read-only mode');
  const refused = await page.evaluate(async (trip) => {
    const command = await globalThis.fetch('/api/trips/' + trip + '/family/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ attempted: true }),
    });
    const file = await globalThis.fetch('/api/family/files/1/open');
    return { command: command.status, file: file.status };
  }, fixture.trip_id);
  assert.equal(refused.command, 503);
  assert.equal(refused.file, 503);
  assert.ok(
    nativeRows(await inventory())
      .filter((r) => r.name === 'mutationQueue')
      .every((r) => r.count === 0)
  );
  record(
    'actual adapter refuses a write and unavailable private media without creating queued intent or requesting a signature'
  );
  await browser.close();
  context = await chromium.launchPersistentContext(path.join(output, 'private-browser-profile'), options);
  browser = context.browser();
  await context.setOffline(true);
  page = await context.newPage();
  observeContext();
  await page.goto(origin + '/trips/' + fixture.trip_id, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 45000 });
  await expect(page.getByRole('status').filter({ hasText: /view only/ })).toBeVisible();
  snapshots.restarted_offline = await inventory();
  assert.deepEqual(
    completeStores(snapshots.restarted_offline).completeHeads,
    completeStores(snapshots.online).completeHeads
  );
  record(
    'a real browser restart retains only the original account complete generation and reopens native read-only Trip data'
  );
  await companionChecks();
  await negativeColdChecks();
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
  for (const database of snapshots.logged_out.databases.filter((d) => d.name.startsWith('trek-offline'))) {
    if (!database.name.startsWith('trek-offline-f1-')) {
      assert.ok(Object.values(database.stores).every((s) => s.count === 0));
      continue;
    }
    assert.ok(
      Object.entries(database.stores)
        .filter(([name]) => name !== 'syncMeta')
        .every(([, s]) => s.count === 0)
    );
    const originalOwner = snapshots.online.databases
      .find((d) => d.name === database.name)
      .stores.syncMeta.rows.find((row) => row.tripId === 0);
    assert.deepEqual(database.stores.syncMeta.rows, [
      { tripId: -1, lastSyncedAt: null, status: 'idle', tilesBbox: null, filesCachedCount: 0, sourcePaused: [] },
      originalOwner,
    ]);
    assert.equal(originalOwner.sourceOwner.source, fixture.api);
    assert.equal(originalOwner.sourceOwner.user_id, fixture.owner.id);
    assert.equal(originalOwner.sourceOwner.family_id, fixture.family_id);
  }
  snapshots.logout_owner_preserved_with_all_private_caches_empty = true;
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
}
/** Review probe only: actual App/SDK/worker; synthetic legacy originals never enter an application selector. */
async function activationReviewOriginals(name, action, initial) {
  return page.evaluate(
    async ({ name, action, initial }) => {
      const serialize = async (value) => {
        if (value instanceof globalThis.Blob)
          return {
            bytes: Array.from(new Uint8Array(await value.arrayBuffer())),
            type: value.type,
            size: value.size,
            ...(value instanceof globalThis.File ? { name: value.name, lastModified: value.lastModified } : {}),
          };
        if (value === undefined) return { undefined: true };
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) return Promise.all(value.map(serialize));
        return Object.fromEntries(
          await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await serialize(item)]))
        );
      };
      const existing = await globalThis.indexedDB.databases();
      if (action === 'create-legacy') {
        if (existing.some((d) => d.name === name)) throw Error('Synthetic legacy destination already exists');
        const source = await new Promise((resolve, reject) => {
          const q = globalThis.indexedDB.open(initial.source);
          q.onupgradeneeded = () => {
            q.transaction.abort();
            reject(Error('Missing original schema source'));
          };
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => reject(q.error);
        });
        let schema;
        try {
          if (source.version !== 140) throw Error('Unexpected native schema');
          const tx = source.transaction(Array.from(source.objectStoreNames));
          schema = Array.from(source.objectStoreNames, (storeName) => {
            const store = tx.objectStore(storeName);
            return {
              name: storeName,
              keyPath: store.keyPath,
              autoIncrement: store.autoIncrement,
              indexes: Array.from(store.indexNames, (indexName) => {
                const index = store.index(indexName);
                return { name: indexName, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
              }),
            };
          });
        } finally {
          source.close();
        }
        const db = await new Promise((resolve, reject) => {
          const q = globalThis.indexedDB.open(name, 140);
          q.onupgradeneeded = () => {
            for (const descriptor of schema) {
              const store = q.result.createObjectStore(descriptor.name, {
                keyPath: descriptor.keyPath,
                autoIncrement: descriptor.autoIncrement,
              });
              for (const index of descriptor.indexes)
                store.createIndex(index.name, index.keyPath, { unique: index.unique, multiEntry: index.multiEntry });
            }
            q.transaction.objectStore('mutationQueue').add(initial.command);
            q.transaction.objectStore('importFiles').add({
              jobId: 'd16c-unattributed',
              fileName: 'original.pdf',
              createdAt: 1,
              blob: new globalThis.File([new Uint8Array([0, 255, 128, 13, 10])], 'original.pdf', {
                type: 'application/pdf',
                lastModified: 123,
              }),
            });
          };
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => reject(q.error);
        });
        db.close();
      }
      if (!(await globalThis.indexedDB.databases()).some((d) => d.name === name))
        throw Error('Expected original database is missing');
      const db = await new Promise((resolve, reject) => {
        const q = globalThis.indexedDB.open(name);
        q.onupgradeneeded = () => {
          q.transaction.abort();
          reject(Error('Refused unexpected creation'));
        };
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => reject(q.error);
      });
      try {
        if (action === 'seed-current')
          await new Promise((resolve, reject) => {
            const tx = db.transaction(['syncMeta', 'importFiles'], 'readwrite'),
              marker = tx.objectStore('syncMeta').get(0);
            marker.onsuccess = () => {
              if (marker.result?.sourceOwner?.format !== 'family.native-owner.v1') {
                tx.abort();
                return;
              }
              tx.objectStore('importFiles').add({
                jobId: 'd16c-unattributed',
                fileName: 'original.pdf',
                createdAt: 2,
                blob: new globalThis.File([new Uint8Array([9, 8, 7, 6])], 'original.pdf', {
                  type: 'application/pdf',
                  lastModified: 456,
                }),
              });
            };
            tx.oncomplete = resolve;
            tx.onabort = () => reject(Error('Current original fixture refused'));
          });
        const tables =
          action === 'all-legacy' ? Array.from(db.objectStoreNames) : ['mutationQueue', 'importFiles', 'syncMeta'];
        const rows = await new Promise((resolve, reject) => {
          const tx = db.transaction(tables),
            result = {};
          for (const table of tables) {
            const q = tx.objectStore(table).getAll();
            q.onsuccess = () => {
              result[table] = q.result;
            };
          }
          tx.oncomplete = () => resolve(result);
          tx.onabort = () => reject(Error('Original readonly capture aborted'));
        });
        return { name, version: db.version, stores: Array.from(db.objectStoreNames), rows: await serialize(rows) };
      } finally {
        db.close();
      }
    },
    { name, action, initial }
  );
}
async function activationReviewChecks() {
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await login(fixture.owner, true);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 }).toBe(1);
  const saved = await storedGeneration();
  const current = await page.evaluate(() => ({
    name: globalThis.localStorage.getItem('family-native-current.v1'),
    user: JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id,
  }));
  assert.match(current.name, /^trek-offline-f1-[a-f0-9]{64}-u[1-9][0-9]*$/);
  const ownedBefore = await activationReviewOriginals(current.name, 'read');
  const marker = ownedBefore.rows.syncMeta.find((row) => row.tripId === 0);
  assert.equal(marker.sourceOwner.user_id, fixture.owner.id);
  assert.equal(marker.sourceOwner.family_id, fixture.family_id);
  assert.equal(marker.sourceOwner.source, fixture.api);
  assert.deepEqual(ownedBefore.rows.mutationQueue, []);
  assert.deepEqual(ownedBefore.rows.importFiles, []);
  record(
    'actual qualified App, SDK password/TOTP and worker select a verified source-owned namespace before the legacy recovery review'
  );
  const legacyName = 'trek-offline-u' + current.user;
  const command = {
    id: 'a16c1100-0000-4000-8000-000000000088',
    tripId: saved.row.value.bindings.find((v) => v.kind === 'trip').key,
    method: 'POST',
    url: '/trips/' + fixture.trip_id + '/family/future',
    body: {
      operation_id: 'a16c1100-0000-4000-8000-000000000088',
      revision: 'legacy-observation',
      extra: { original: [false, 7] },
    },
    createdAt: 1,
    status: 'pending',
    attempts: 7,
    lastError: 'Original legacy observation',
    schemaVersion: 1,
  };
  await activationReviewOriginals(legacyName, 'create-legacy', { source: current.name, command });
  const legacyBefore = await activationReviewOriginals(legacyName, 'all-legacy');
  assert.deepEqual(legacyBefore.rows.mutationQueue, [command]);
  assert.equal(legacyBefore.rows.importFiles.length, 1);
  assert.deepEqual(legacyBefore.rows.syncMeta, []);
  assert.deepEqual(legacyBefore.rows.importFiles[0].blob, {
    bytes: [0, 255, 128, 13, 10],
    type: 'application/pdf',
    size: 5,
    name: 'original.pdf',
    lastModified: 123,
  });
  record(
    'a compatible unmarked native database with the identical native person key contains exact synthetic original command and File bytes, without a source assertion'
  );
  await page.goto(origin + '/settings?tab=offline');
  await expect(page.getByRole('button', { name: 'Clear cache', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Export retained work', exact: true })).toHaveCount(0);
  assert.deepEqual(await activationReviewOriginals(legacyName, 'all-legacy'), legacyBefore);
  snapshots.activation_review = {
    activation_permitted: false,
    legacy_recovery_complete: false,
    legacy_database: legacyName,
    legacy_queue: 1,
    legacy_imports: 1,
    selected_database: current.name,
    unattributed_export_action_available: false,
    legacy_originals_exact: true,
  };
  record(
    'observed activation blocker: selected-source Settings offers no export for the unmarked originals, while preserving rather than adopting them'
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Clear cache', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Export retained work', exact: true })).toHaveCount(0);
  assert.deepEqual(await activationReviewOriginals(legacyName, 'all-legacy'), legacyBefore);
  assert.equal(await page.evaluate(() => globalThis.localStorage.getItem('family-native-current.v1')), current.name);
  record(
    'an actual application restart leaves every unmarked store and original byte exact and does not turn a matching numeric key into ownership'
  );
  await activationReviewOriginals(current.name, 'seed-current');
  await page.reload({ waitUntil: 'domcontentloaded' });
  const button = page.getByRole('button', { name: 'Export retained work', exact: true });
  await expect(button).toBeVisible({ timeout: 30000 });
  const ownedOriginal = await activationReviewOriginals(current.name, 'read');
  assert.deepEqual(ownedOriginal.rows.mutationQueue, []);
  assert.equal(ownedOriginal.rows.importFiles.length, 1);
  assert.deepEqual(ownedOriginal.rows.importFiles[0].blob, {
    bytes: [9, 8, 7, 6],
    type: 'application/pdf',
    size: 4,
    name: 'original.pdf',
    lastModified: 456,
  });
  record(
    'the same compound import key in the verified current namespace enables the actual native export action, independently of the legacy store'
  );
  const downloading = page.waitForEvent('download');
  await button.click();
  const download = await downloading;
  assert.equal(await download.failure(), null);
  assert.equal(download.suggestedFilename(), 'family-original-work-v3.json');
  const archivePath = path.join(output, 'private-review-owned-v3.json');
  await download.saveAs(archivePath);
  const { readOriginalWorkArchive } = await import('./original-work-reader.mjs');
  const decoded = readOriginalWorkArchive(await readFile(archivePath));
  assert.equal(decoded.payload.database, current.name);
  assert.deepEqual(decoded.payload.source_owner, marker.sourceOwner);
  assert.equal(decoded.payload.automatic_replay, false);
  assert.deepEqual(decoded.data.queue, []);
  assert.equal(decoded.data.imports.length, 1);
  assert.deepEqual(decoded.data.imports[0].key, ['d16c-unattributed', 'original.pdf']);
  assert.deepEqual(Array.from(new Uint8Array(await decoded.data.imports[0].row.blob.arrayBuffer())), [9, 8, 7, 6]);
  assert.equal(decoded.data.imports[0].row.blob.lastModified, 456);
  assert.deepEqual(await activationReviewOriginals(legacyName, 'all-legacy'), legacyBefore);
  assert.deepEqual(await activationReviewOriginals(current.name, 'read'), ownedOriginal);
  record(
    'an independently decoded native v3 download contains only verified current-source originals and cannot be counted as legacy recovery'
  );
  const loggedOut = await page.evaluate(async () => {
    const r = await globalThis.fetch('/api/auth/logout', { method: 'POST' });
    return r.status;
  });
  assert.equal(loggedOut, 200);
  await expect(page.locator('input[type=email]')).toBeVisible({ timeout: 30000 });
  assert.deepEqual(await activationReviewOriginals(legacyName, 'all-legacy'), legacyBefore);
  const after = await activationReviewOriginals(current.name, 'read');
  assert.deepEqual(after.rows.mutationQueue, ownedOriginal.rows.mutationQueue);
  assert.deepEqual(after.rows.importFiles, ownedOriginal.rows.importFiles);
  assert.deepEqual(
    after.rows.syncMeta.find((row) => row.tripId === 0),
    marker
  );
  snapshots.activation_review.logout_legacy_and_owned_bytes_exact = true;
  snapshots.activation_review.current_owned_export_exact = true;
  record(
    'actual SDK logout retains both legacy and owned original bytes without stamping the legacy database or acknowledging the export'
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  assert.ok(!events.some((v) => v.path.includes('/render/image/') || v.path.includes('/execute_family_')));
  record(
    'review observation completes with zero transformation or domain-command attempts and no generic or uncaught application errors; broad activation stays refused'
  );
}

/** Device recovery acceptance: actual entry, visible consent and independent byte decoding. */
function deviceRecoveryInstrumentation() {
  if (globalThis.location.pathname !== '/device-work-recovery.html') return;
  globalThis.__deviceEnumerationCalls = 0;
  globalThis.__deviceRegisterCalls = 0;
  const list = globalThis.IDBFactory.prototype.databases;
  globalThis.IDBFactory.prototype.databases = function (...args) {
    globalThis.__deviceEnumerationCalls++;
    return Reflect.apply(list, this, args);
  };
  const sw = globalThis.navigator.serviceWorker;
  if (sw) {
    const register = sw.register;
    sw.register = function (...args) {
      globalThis.__deviceRegisterCalls++;
      return Reflect.apply(register, this, args);
    };
  }
}
async function unattributedRecoveryChecks() {
  await context.addInitScript(deviceRecoveryInstrumentation);
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await login(fixture.owner, true);
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 }).toBe(1);
  const current = await page.evaluate(() => ({
    name: globalThis.localStorage.getItem('family-native-current.v1'),
    user: JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id,
  }));
  const legacy = 'trek-offline-u' + current.user;
  const command = {
    id: 'a16d1100-0000-4000-8000-000000000001',
    schemaVersion: 999,
    status: 'future',
    attempts: 7,
    createdAt: 1,
    body: { operation_id: 'a16d1100-0000-4000-8000-000000000001', revision: 'original-device', extra: [false, 7] },
  };
  await activationReviewOriginals(legacy, 'create-legacy', { source: current.name, command });
  await activationReviewOriginals(current.name, 'seed-current');
  const legacyBefore = await activationReviewOriginals(legacy, 'all-legacy'),
    ownedBefore = await activationReviewOriginals(current.name, 'read');
  await page.goto(origin + '/settings?tab=offline');
  const link = page.getByRole('link', { name: 'Recover unattributed work on this device', exact: true });
  await expect(link).toBeVisible({ timeout: 30000 });
  await expect(link).toHaveAttribute('href', '/device-work-recovery.html');
  const utilityRequests = [];
  page.on('request', (request) => {
    const u = new URL(request.url());
    let document = 'worker';
    try {
      document = new URL(request.frame().url()).pathname;
    } catch {
      /* Worker requests have no frame. */
    }
    utilityRequests.push({ origin: u.origin, path: u.pathname, document });
  });
  await link.click();
  await expect(page.getByRole('heading', { name: 'Unattributed device recovery', exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => globalThis.__deviceEnumerationCalls), 0);
  assert.equal(await page.evaluate(() => globalThis.__deviceRegisterCalls), 0);
  await expect(page.locator('#recovery-scan')).toBeDisabled();
  await page.locator('#recovery-consent').check();
  assert.equal(await page.evaluate(() => globalThis.__deviceEnumerationCalls), 0);
  record(
    'actual native desktop/phone Settings opens the standalone utility; neither entry nor checking device consent scans databases, bootstraps App or registers a worker'
  );
  await page.getByRole('button', { name: 'Scan this device', exact: true }).click();
  await expect(page.locator('#recovery-database option')).toHaveCount(2);
  assert.equal(await page.evaluate(() => globalThis.__deviceEnumerationCalls), 1);
  assert.equal(await page.locator('#recovery-database').textContent(), 'Choose one database' + legacy);
  await page.locator('#recovery-database').selectOption(legacy);
  await page.getByRole('button', { name: 'Inspect selected database', exact: true }).click();
  const download = page.getByRole('button', { name: 'Download unattributed copy', exact: true });
  await expect(download).toBeEnabled();
  await expect(page.locator('#recovery-summary')).toContainText('1 commands, 1 imports');
  record(
    'explicit discovery excludes the source-owned namespace with the same numeric identity; one selected legacy database reaches the bounded ready state'
  );
  const decodeDownload = async (suffix, expectedQueue) => {
    const pending = page.waitForEvent('download');
    await download.click();
    const result = await pending;
    assert.equal(await result.failure(), null);
    assert.equal(result.suggestedFilename(), 'family-unattributed-work-v1.json');
    const target = path.join(output, 'private-unattributed-' + suffix + '.json');
    await result.saveAs(target);
    const { readUnattributedWorkArchive } = await import('./unattributed-work-reader.mjs');
    const decoded = readUnattributedWorkArchive(await readFile(target));
    assert.deepEqual(decoded.payload.attribution, { kind: 'unattributed' });
    assert.equal(decoded.payload.source_owner, undefined);
    assert.equal(decoded.payload.database.name, legacy);
    assert.equal(decoded.payload.device_origin, origin);
    assert.deepEqual(decoded.data.queue, expectedQueue);
    assert.deepEqual(decoded.data.imports[0].key, ['d16c-unattributed', 'original.pdf']);
    const file = decoded.data.imports[0].row.blob;
    assert.deepEqual(Array.from(new Uint8Array(await file.arrayBuffer())), [0, 255, 128, 13, 10]);
    assert.equal(file.lastModified, 123);
    assert.equal(file.name, 'original.pdf');
    assert.equal(file.type, 'application/pdf');
    return decoded;
  };
  await decodeDownload('original', [{ key: command.id, row: command }]);
  assert.deepEqual(await activationReviewOriginals(legacy, 'all-legacy'), legacyBefore);
  assert.deepEqual(await activationReviewOriginals(current.name, 'read'), ownedBefore);
  record(
    'actual explicit browser download independently reconstructs every legacy command field, compound key and original File byte without source attribution, mutation or current-owned byte mixing'
  );
  await page.reload();
  await expect(page.locator('#recovery-consent')).not.toBeChecked();
  assert.equal(await page.evaluate(() => globalThis.__deviceEnumerationCalls), 0);
  await expect(download).toBeDisabled();
  await page.locator('#recovery-consent').check();
  await page.locator('#recovery-scan').click();
  await page.locator('#recovery-database').selectOption(legacy);
  await page.evaluate(() => {
    const original = globalThis.Blob.prototype.arrayBuffer;
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    globalThis.__releaseDeviceBytes = release;
    globalThis.__deviceBytesEntered = false;
    globalThis.Blob.prototype.arrayBuffer = async function () {
      globalThis.__deviceBytesEntered = true;
      await held;
      return original.call(this);
    };
  });
  await page.locator('#recovery-inspect').click();
  await expect.poll(() => page.evaluate(() => globalThis.__deviceBytesEntered)).toBe(true);
  let lateDownloads = 0;
  const late = () => {
    lateDownloads++;
  };
  page.on('download', late);
  await page.getByRole('button', { name: 'Cancel recovery', exact: true }).click();
  await page.evaluate(() => globalThis.__releaseDeviceBytes());
  await expect(download).toBeDisabled();
  await page.waitForTimeout(250);
  assert.equal(lateDownloads, 0);
  page.off('download', late);
  assert.deepEqual(await activationReviewOriginals(legacy, 'all-legacy'), legacyBefore);
  record(
    'reload requires fresh device consent; cancelling a genuine held Blob read produces no ready state or late download and leaves every original store exact'
  );
  await page.reload();
  proxy.setOffline(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Unattributed device recovery', exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => globalThis.__deviceEnumerationCalls), 0);
  await page.locator('#recovery-consent').check();
  await page.locator('#recovery-scan').click();
  await page.locator('#recovery-database').selectOption(legacy);
  await page.locator('#recovery-inspect').click();
  await expect(download).toBeEnabled();
  await decodeDownload('offline', [{ key: command.id, row: command }]);
  record(
    'the actual already-controlled worker serves the separate recovery document offline without SPA fallback, automatic discovery, Auth/API access or its own worker registration'
  );
  proxy.setOffline(false);
  await context.setOffline(false);
  await page.evaluate(async (name) => {
    const db = await new Promise((resolve, reject) => {
      const q = globalThis.indexedDB.open(name);
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('mutationQueue', 'readwrite');
      tx.objectStore('mutationQueue').clear();
      tx.oncomplete = resolve;
      tx.onabort = reject;
    });
    db.close();
  }, legacy);
  const importOnly = await activationReviewOriginals(legacy, 'all-legacy');
  await page.reload();
  await page.locator('#recovery-consent').check();
  await page.locator('#recovery-scan').click();
  await page.locator('#recovery-database').selectOption(legacy);
  await page.locator('#recovery-inspect').click();
  await expect(download).toBeEnabled();
  const sibling = await context.newPage();
  sibling.on('pageerror', (e) => errors.push(e.message));
  await sibling.goto(origin + '/settings?tab=offline');
  await expect(sibling.getByRole('button', { name: 'Clear cache', exact: true })).toBeVisible({ timeout: 30000 });
  assert.equal(
    await sibling.evaluate(async () => (await globalThis.fetch('/api/auth/logout', { method: 'POST' })).status),
    200
  );
  await expect(sibling.locator('input[type=email]')).toBeVisible({ timeout: 30000 });
  await decodeDownload('import-only-signed-out', []);
  assert.deepEqual(await activationReviewOriginals(legacy, 'all-legacy'), importOnly);
  await sibling.close();
  record(
    'real SDK logout in a sibling App does not convert independent device consent into Family authority; import-only export stays unattributed and exact, with no account assertion'
  );
  await page.reload();
  await expect(page.locator('#recovery-consent')).not.toBeChecked();
  assert.equal(await page.evaluate(() => globalThis.__deviceEnumerationCalls), 0);
  await page.evaluate(async (name) => {
    const q = globalThis.indexedDB.open(name, 150);
    q.onupgradeneeded = () => q.result.createObjectStore('future');
    await new Promise((resolve, reject) => {
      q.onsuccess = () => {
        q.result.close();
        resolve();
      };
      q.onerror = () => reject(q.error);
    });
  }, legacy);
  const future = await activationReviewOriginals(legacy, 'all-legacy');
  await page.locator('#recovery-consent').check();
  await page.locator('#recovery-scan').click();
  await page.locator('#recovery-database').selectOption(legacy);
  await page.locator('#recovery-inspect').click();
  await expect(page.locator('#recovery-status')).toContainText('Recovery was refused');
  await expect(download).toBeDisabled();
  assert.deepEqual(await activationReviewOriginals(legacy, 'all-legacy'), future);
  assert.deepEqual(
    (await activationReviewOriginals(current.name, 'read')).rows.importFiles,
    ownedBefore.rows.importFiles
  );
  record(
    'signed-out manual reload has no automatic discovery; a future native schema is explicitly refused without downgrade, clearing or changing any unknown store/original byte'
  );
  snapshots.device_recovery_departing_requests = utilityRequests.filter(
    (v) => v.document !== '/device-work-recovery.html'
  );
  const standaloneRequests = utilityRequests.filter((v) => v.document === '/device-work-recovery.html');
  snapshots.device_recovery_transport = standaloneRequests.filter(
    (v) => v.origin !== origin || /^\/(?:api|auth|rest|storage)\//.test(v.path)
  );
  assert.ok(
    !standaloneRequests.some(
      (v) => v.origin !== origin || /^\/(?:api|auth|rest|storage)\//.test(v.path) || v.path.includes('/render/image/')
    )
  );
  assert.equal(await page.evaluate(() => globalThis.__deviceRegisterCalls), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  assert.ok(!events.some((v) => v.path.includes('/render/image/') || v.path.includes('/execute_family_')));
  const clean = await chromium.launchPersistentContext(path.join(output, 'private-clean-device-profile'), options);
  try {
    await clean.addInitScript(deviceRecoveryInstrumentation);
    const isolated = await clean.newPage(),
      requests = [];
    isolated.on('request', (request) => {
      const u = new URL(request.url());
      requests.push({ origin: u.origin, path: u.pathname });
    });
    await isolated.goto(origin + '/device-work-recovery.html');
    await expect(isolated.getByRole('heading', { name: 'Unattributed device recovery', exact: true })).toBeVisible();
    assert.equal(await isolated.evaluate(() => !!globalThis.navigator.serviceWorker.controller), false);
    assert.equal(await isolated.evaluate(() => globalThis.__deviceEnumerationCalls), 0);
    await expect(isolated.locator('#recovery-scan')).toBeDisabled();
    assert.ok(!requests.some((v) => v.origin !== origin || /^\/(?:api|auth|rest|storage)\//.test(v.path)));
    record(
      'fresh signed-out standalone entry without an installed worker makes no account request, registration or automatic scan and requires explicit device consent'
    );
  } finally {
    await clean.close();
  }
  snapshots.device_recovery = {
    activation_permitted: false,
    unattributed_export_tested: true,
    legacy_originals_preserved: true,
    owned_originals_preserved: true,
    standalone_network_attempts: 0,
    own_worker_registrations: 0,
    format: 'family.unattributed-work.v1',
  };
  record(
    'standalone capture/export makes zero external or App/Auth/API/Storage/transform/command requests and no worker registration; broad activation remains off'
  );
}

/** D16e review only: native preparation refusal is not a downloaded-media receipt. */
async function preparationReviewChecks() {
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await login(fixture.owner, true);
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 }).toBe(1);
  const saved = await storedGeneration(),
    envelope = saved.row.value;
  assert.equal(envelope.format, 'family.offline-trip.v2');
  assert.equal(envelope.capabilities.mediaBytes, false);
  assert.equal(envelope.capabilities.writes, false);
  assert.equal(envelope.expiresAt - envelope.capturedAt, 900000);
  assert.ok(envelope.media.every((value) => value.bytesAvailable === false));
  assert.ok(envelope.media.some((value) => value.kind === 'file'));
  assert.ok(!JSON.stringify(envelope).includes('/object/sign/'));
  const current = await page.evaluate(() => ({
    name: globalThis.localStorage.getItem('family-native-current.v1'),
    user: JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id,
  }));
  const assertNoPrivateBytes = async () => {
    const db = (await inventory()).databases.find((value) => value.name === current.name);
    assert.equal(db.stores.blobCache.count, 0);
    assert.equal(db.stores.tripFiles.count, 0);
    assert.equal(db.stores.trips.count, 0);
    assert.deepEqual(await storedGeneration(), saved);
  };
  await assertNoPrivateBytes();
  snapshots.preparation_review = {
    activation_permitted: false,
    complete_media_bytes: false,
    explicit_byte_receipt: false,
    recent_read_lifetime_ms: 900000,
    file_descriptors: envelope.media.filter((value) => value.kind === 'file').length,
    variant_descriptors: envelope.media.filter((value) => value.kind === 'variant').length,
  };
  record(
    'actual App/SDK/worker captures a fifteen-minute published read with file references only; no private native blob, generic Trip cache or byte-ready claim exists'
  );
  await page.goto(origin + '/settings?tab=offline');
  const prepare = page.getByRole('button', { name: 'Download for offline use', exact: true });
  await expect(prepare).toBeVisible({ timeout: 30000 });
  const notice = page.getByText(
    'Full offline preparation is not connected for this planner. Scoped planner views remain separate from the shared trip cache.',
    { exact: true }
  );
  const at = events.length;
  await prepare.click();
  await expect(notice).toBeVisible();
  await expect(prepare).toBeEnabled();
  await assertNoPrivateBytes();
  record(
    'the actual native desktop/phone Download action reports planner-scope refusal and preserves the original generation without downloading private bytes or claiming preparation completed'
  );
  const force = page.getByRole(phone ? 'switch' : 'button', { name: 'Force offline mode', exact: true });
  await force.click();
  await expect(force).toHaveAttribute(phone ? 'aria-checked' : 'aria-pressed', 'true');
  assert.equal(await page.evaluate(() => globalThis.localStorage.getItem('trek_forced_offline')), '1');
  await expect(notice).toBeVisible();
  await assertNoPrivateBytes();
  record(
    'the native manual Force offline preference can turn on after the refused preparation; it is a network preference, not proof that trip media or documents were downloaded'
  );
  await force.click();
  await expect(force).toHaveAttribute(phone ? 'aria-checked' : 'aria-pressed', 'false');
  const legacy = 'trek-offline-u' + current.user;
  const command = {
    id: 'a16e1100-0000-4000-8000-000000000001',
    createdAt: 1,
    tripId: 1,
    method: 'POST',
    url: '/trips/' + fixture.trip_id + '/family/future',
    body: { revision: 'original-review' },
    status: 'pending',
    attempts: 7,
    schemaVersion: 1,
  };
  await activationReviewOriginals(legacy, 'create-legacy', { source: current.name, command });
  await activationReviewOriginals(current.name, 'seed-current');
  const old = await activationReviewOriginals(legacy, 'all-legacy'),
    owned = await activationReviewOriginals(current.name, 'read');
  await prepare.click();
  await expect(notice).toBeVisible();
  await expect(prepare).toBeEnabled();
  assert.deepEqual(await activationReviewOriginals(legacy, 'all-legacy'), old);
  assert.deepEqual(await activationReviewOriginals(current.name, 'read'), owned);
  await assertNoPrivateBytes();
  record(
    'repeat native preparation refusal preserves every unmarked command/import and current-owned import despite matching numeric identity and compound keys; it neither adopts nor replays originals'
  );
  const during = events.slice(at);
  assert.ok(!during.some((value) => /\/storage\/v1\/|\/api\/family\/files\/.+\/open|basemaps\./.test(value.path)));
  assert.ok(!events.some((value) => value.path.includes('/render/image/') || value.path.includes('/execute_family_')));
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  snapshots.preparation_review.native_prepare_refused = true;
  snapshots.preparation_review.manual_offline_is_not_prepared = true;
  snapshots.preparation_review.originals_exact = true;
  snapshots.preparation_review.private_blob_count = 0;
  record(
    'review finishes with no Storage download/signing, transformation, domain command, original mutation or caught/uncaught application error; wider activation remains off'
  );
}

// D16h: component observations through the actual compiled App/SDK/cache implementation.
async function preparationAction(options = {}) {
  return page.evaluate(async (options) => globalThis.__imagePreparation.prepare('user-request', options), options);
}
async function openPreparation() {
  await page.evaluate(
    async ({ driver, trip }) => {
      const module = await import(driver);
      globalThis.__imagePreparation?.dispose();
      globalThis.__imagePreparation = await module.openPublicImagePreparation(trip);
    },
    { driver: '/' + build.public_image_preparation_driver, trip: fixture.trip_id }
  );
}
async function preparationOnline() {
  proxy.setOffline(false);
  await context.setOffline(false);
  // A fresh online document avoids racing the automatic reconnect against a transient Retry button.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect
    .poll(() =>
      page
        .getByRole('status')
        .filter({ hasText: /view only/ })
        .count()
    )
    .toBe(0);
}

async function preparationCache(method, descriptor) {
  return page.evaluate(
    async ({ driver, descriptor, method }) => {
      const module = await import(driver),
        cache = module.createPublicVariantCache({ source: descriptor.source });
      const result = await cache[method](descriptor, { current: () => true });
      return method === 'read' ? (result.status === 'ready' ? result.receipt : null) : result;
    },
    { driver: '/' + build.public_image_preparation_driver, descriptor, method }
  );
}
async function preparationCaptureChecks() {
  assert.ok(build.public_image_preparation_driver);
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await login(fixture.owner, true);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 }).toBe(1);
  const saved = await storedGeneration();
  const before = (await inventory()).caches.filter((n) => n.startsWith('family-public-variants.v1:'));
  await openPreparation();
  assert.deepEqual(
    (await inventory()).caches.filter((n) => n.startsWith('family-public-variants.v1:')),
    before
  );
  assert.deepEqual(await storedGeneration(), saved);
  record(
    'opening the real qualified component validates SDK/Trip ownership without downloading bytes or publishing whole-Trip readiness'
  );
  const result = await preparationAction();
  assert.equal(result.format, 'family.public-image-preparation.v1');
  assert.equal(result.component, 'public-location-images');
  assert.equal(result.status, 'complete');
  assert.equal(result.generation, saved.row.value.generation);
  assert.deepEqual(result.counts, {
    assets: 1,
    locationsWithoutCover: 1,
    eligible: 2,
    selected: 2,
    deferred: 0,
    unavailable: 0,
    ready: 2,
    failed: 0,
    missing: 0,
  });
  const image = JSON.parse(
    await readFile(path.join(root, 'tests/browser/family-offline-lifecycle/variant-fixture.json'), 'utf8')
  );
  const digest = createHash('sha256').update(Buffer.from(image.base64, 'base64')).digest('hex');
  assert.ok(
    result.items.every(
      (v) => v.status === 'ready' && v.receipt.sha256 === digest && v.receipt.width === 2 && v.receipt.height === 3
    )
  );
  assert.equal(saved.row.value.capabilities.mediaBytes, false);
  assert.deepEqual(await storedGeneration(), saved);
  snapshots.image_preparation = { first: result, fixture_http_not_bucket_rls: true, full_trip_prepared: false };
  record(
    'the explicit component captures and independently rereads real synthetic public WebP streams; its two-role receipt is bound to the unchanged actual complete generation'
  );
  const at = events.length,
    again = await preparationAction();
  assert.deepEqual(
    again.items.map((v) => v.receipt.writeId),
    result.items.map((v) => v.receipt.writeId)
  );
  assert.ok(!events.slice(at).some((v) => v.path.startsWith('/storage/v1/')));
  record('explicit retry reuses verified public bytes with zero Storage fetches and no renewal of private metadata');
  return { saved, result };
}
async function preparationSavedChecks({ saved, result }) {
  await page.evaluate(() => globalThis.__imagePreparation.dispose());
  proxy.setOffline(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectCold();
  const name = saved.row.value.data.planner.view.state.locations[0].name;
  if (phone) await page.getByRole('button', { name: 'Places', exact: true }).click();
  const avatar = page.getByRole('img', { name, exact: true }).first();
  await expect(avatar).toBeVisible();
  await expect
    .poll(() => avatar.evaluate((i) => ({ width: i.naturalWidth, height: i.naturalHeight })))
    .toEqual({ width: 2, height: 3 });
  assert.ok((await avatar.getAttribute('src')).startsWith('blob:'));
  assert.deepEqual(await storedGeneration(), saved);
  record('the real native saved Places avatar decodes bytes captured by the new component while disconnected');
  const hero = result.items.find((v) => v.descriptor.role === 'hero').descriptor;
  await preparationCache('remove', hero);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectCold();
  assert.equal(await page.locator('img[src^="blob:"]').count(), 0);
  assert.deepEqual(await storedGeneration(), saved);
  record(
    'later public-cache eviction causes the existing native saved placeholder; an earlier component receipt is never used as a residency or access grant'
  );
  await preparationOnline();
  await expect
    .poll(async () => (await storedGeneration()).row.value.capturedAt, { timeout: 30000 })
    .toBeGreaterThan(saved.row.value.capturedAt);
  saved = await storedGeneration();
  await openPreparation();
  preparationControl.deny = new URL(hero.url).pathname;
  const partial = await preparationAction();
  assert.equal(partial.status, 'partial');
  assert.equal(partial.counts.ready, 1);
  assert.equal(partial.counts.failed, 1);
  assert.deepEqual(await storedGeneration(), saved);
  preparationControl.deny = null;
  const retried = await preparationAction();
  assert.equal(retried.status, 'complete');
  assert.equal(retried.counts.ready, 2);
  snapshots.image_preparation.partial = partial;
  record(
    'a real public HTTP failure yields a partial image result; explicit retry fills only the missing role without transformations, originals, private files or false whole-Trip success'
  );
  return { saved, result: retried };
}
async function preparationCancellationChecks({ saved, result }) {
  const thumb = result.items.find((v) => v.descriptor.role === 'thumb').descriptor;
  const before = await preparationCache('read', thumb);
  preparationControl.hold = { path: new URL(thumb.url).pathname, arrived: false, release: null };
  await page.evaluate(() => {
    globalThis.__preparationOutcome = null;
    void globalThis.__imagePreparation.prepare('user-request', { refresh: true }).then(
      (value) => {
        globalThis.__preparationOutcome = { value };
      },
      (error) => {
        globalThis.__preparationOutcome = { error: error.name };
      }
    );
  });
  await expect.poll(() => preparationControl.hold.arrived).toBe(true);
  const status = await page.evaluate(
    async (trip) => (await globalThis.fetch('/api/trips/' + trip + '/bundle')).status,
    fixture.trip_id
  );
  assert.equal(status, 200);
  await expect
    .poll(async () => (await storedGeneration()).row.value.generation, { timeout: 30000 })
    .not.toBe(saved.row.value.generation);
  await expect.poll(() => page.evaluate(() => globalThis.__preparationOutcome?.error), { timeout: 15000 }).toBeTruthy();
  assert.equal(await page.evaluate(() => !!globalThis.__preparationOutcome?.value), false);
  preparationControl.hold.release();
  preparationControl.hold = null;
  assert.equal((await preparationCache('read', thumb)).writeId, before.writeId);
  record(
    'a genuine online bundle recapture cancels a held real public refresh; no stale component result or late cache replacement is published'
  );
  await openPreparation();
  const current = await page.evaluate(() => ({
    name: globalThis.localStorage.getItem('family-native-current.v1'),
    user: JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id,
  }));
  const legacy = 'trek-offline-u' + current.user;
  const command = {
    id: 'a16a1100-0000-4000-8000-000000000098',
    createdAt: 1,
    tripId: 1,
    method: 'POST',
    url: '/trips/' + fixture.trip_id + '/family/future',
    body: { originalRevision: 'preserved' },
    status: 'pending',
    attempts: 7,
    schemaVersion: 999,
  };
  await activationReviewOriginals(legacy, 'create-legacy', { source: current.name, command });
  await activationReviewOriginals(current.name, 'seed-current');
  const originalLegacy = await activationReviewOriginals(legacy, 'all-legacy'),
    originalOwned = await activationReviewOriginals(current.name, 'read');
  const at = events.length;
  const refused = await page.evaluate(async () => {
    try {
      await globalThis.__imagePreparation.prepare('user-request');
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(refused, true);
  assert.ok(!events.slice(at).some((v) => v.path.startsWith('/storage/v1/')));
  assert.deepEqual(await activationReviewOriginals(legacy, 'all-legacy'), originalLegacy);
  assert.deepEqual(await activationReviewOriginals(current.name, 'read'), originalOwned);
  record(
    'new original work refuses preparation before Storage access, preserving legacy commands and current-owned compound-key File metadata/bytes exactly'
  );
  await actualIdentityLogout(page);
  assert.deepEqual(await activationReviewOriginals(legacy, 'all-legacy'), originalLegacy);
  assert.deepEqual(await activationReviewOriginals(current.name, 'read'), originalOwned);
  assert.equal(completeStores(await inventory()).completeHeads.count, 0);
  assert.ok((await inventory()).caches.some((n) => n.startsWith('family-public-variants.v1:')));
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  assert.ok(
    !events.some(
      (v) =>
        v.path.includes('/render/image/') ||
        v.path.includes('/object/sign/') ||
        v.path.includes('/execute_family_') ||
        /\/api\/family\/files\/.+\/open/.test(v.path)
    )
  );
  snapshots.image_preparation.originals_exact = true;
  snapshots.image_preparation.cancelled_refresh = true;
  snapshots.image_preparation.eviction_placeholder = true;
  record(
    'real SDK logout retains originals/public bytes and retires private heads; the component has made zero transformation/signing/private-file/domain-command attempts or caught/uncaught application errors'
  );
}
async function publicImagePreparationChecks() {
  await preparationCancellationChecks(await preparationSavedChecks(await preparationCaptureChecks()));
}

// D16k: read-only component residency through real App/SDK/admission/cache/RAM adapters.
async function readinessChecks() {
  assert.ok(build.preparation_readiness_driver);
  const driver = '/' + build.preparation_readiness_driver;
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await login(fixture.owner, true);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 }).toBe(1);
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  await page.waitForLoadState('networkidle');
  const open = () =>
    page.evaluate(
      async ({ driver, trip }) => {
        globalThis.__readinessApi = await import(driver);
        globalThis.__readinessOwner?.dispose();
        globalThis.__readinessOwner = await globalThis.__readinessApi.openPreparationReadiness(trip);
      },
      { driver, trip: fixture.trip_id }
    );
  const status = () => page.evaluate(() => globalThis.__readinessOwner.inspect());
  const refused = () =>
    page.evaluate(async () => {
      try {
        await globalThis.__readinessOwner.inspect();
        return false;
      } catch {
        return true;
      }
    });
  const privatePrepare = () =>
    page.evaluate(
      async ({ trip, file }) => {
        globalThis.__privateStatusOwner?.dispose();
        globalThis.__privateStatusOwner = await globalThis.__readinessApi.openPrivateFilePreparation(trip);
        return globalThis.__privateStatusOwner.prepare('user-request', file);
      },
      { trip: fixture.trip_id, file: fixture.prepared_file.id }
    );
  const storageRequests = () => events.filter((v) => v.path.startsWith('/storage/v1/')).length;
  const saved = await storedGeneration(),
    before = storageRequests();
  await open();
  const empty = await status();
  assert.equal(empty.format, 'family.preparation-readiness.v1');
  assert.equal(empty.generation, saved.row.value.generation);
  assert.equal(empty.publicImages.counts.ready, 0);
  assert.equal(empty.publicImages.counts.missing, 2);
  assert.equal(empty.privateFiles.counts.ready, 0);
  assert.equal(empty.privateFiles.counts.missing, 1);
  assert.equal(empty.privateFiles.counts.unsupported, 1);
  assert.equal(storageRequests(), before);
  assert.deepEqual(await storedGeneration(), saved);
  record(
    'actual App/SDK/TOTP/worker admits a status observer; inspection reports missing bytes without any Storage download, private signing or generation write'
  );
  const native = await page.evaluate(() => globalThis.__readinessApi.tripSyncManager.prepareForOffline());
  assert.deepEqual(native, { status: 'skipped', reason: 'planner-scope' });
  assert.deepEqual(empty.nativeOutcome, native);
  assert.equal(empty.wholeTripReady, false);
  assert.equal(empty.mapSearch.status, 'unsupported');
  record(
    'the actual native preparation API and observed status agree on planner-scope refusal; map/search coverage is unsupported and no done/trips success is fabricated'
  );
  const images = await page.evaluate(async (trip) => {
    globalThis.__statusImages = await globalThis.__readinessApi.openPublicImagePreparation(trip);
    return globalThis.__statusImages.prepare('user-request');
  }, fixture.trip_id);
  assert.equal(images.status, 'complete');
  const imageBytes = storageRequests(),
    imageReady = await status();
  assert.equal(imageReady.publicImages.counts.ready, 2);
  assert.equal(imageReady.privateFiles.counts.ready, 0);
  assert.equal(imageReady.wholeTripReady, false);
  assert.equal(storageRequests(), imageBytes);
  assert.deepEqual(await storedGeneration(), saved);
  record(
    'explicit existing image preparation fills real synthetic public WebP cache entries; a fresh status rereads them without fetching, extending metadata or claiming private/whole-trip readiness'
  );
  const hero = images.items.find((v) => v.descriptor.role === 'hero').descriptor;
  await page.evaluate(async (descriptor) => {
    await globalThis.__readinessApi
      .createPublicVariantCache({ source: descriptor.source })
      .remove(descriptor, { current: () => true });
  }, hero);
  const evicted = await status();
  assert.equal(evicted.publicImages.status, 'partial');
  assert.equal(evicted.publicImages.counts.ready, 1);
  assert.equal(evicted.publicImages.counts.missing, 1);
  assert.equal(storageRequests(), imageBytes);
  await page.evaluate(() => globalThis.__statusImages.prepare('user-request'));
  assert.equal((await status()).publicImages.counts.ready, 2);
  record(
    'later eviction is observed as a missing role despite an earlier successful receipt; only a separate explicit preparation fills it again'
  );
  const file = await privatePrepare();
  assert.equal(file.content.sha256, fixture.prepared_file.sha256);
  const privateBytes = storageRequests(),
    privateReady = await status();
  assert.equal(privateReady.privateFiles.counts.ready, 1);
  assert.equal(privateReady.privateFiles.counts.missing, 0);
  assert.equal(privateReady.privateFiles.counts.unsupported, 1);
  assert.equal(privateReady.privateFiles.afterRestart, 'unavailable');
  assert.equal(privateReady.privateFiles.persistence, 'document-memory');
  assert.equal(privateReady.wholeTripReady, false);
  assert.equal(storageRequests(), privateBytes);
  assert.ok(
    !JSON.stringify(privateReady).includes('token=') &&
      !JSON.stringify(privateReady).includes('blob:') &&
      !JSON.stringify(privateReady).includes(fixture.prepared_file.path)
  );
  record(
    'genuine RLS/Storage private preparation is observed as one RAM-resident file and one unsupported original file, with no private URL/bytes in the status and no restart survival claim'
  );
  const negative = await page.evaluate(async (file) => {
    try {
      await globalThis.__privateStatusOwner.prepare('user-request', file);
      return false;
    } catch {
      return true;
    }
  }, fixture.graph.file);
  assert.equal(negative, true);
  assert.equal((await status()).privateFiles.counts.ready, 1);
  await page.evaluate(() => globalThis.__privateStatusOwner.dispose());
  assert.equal((await status()).privateFiles.counts.missing, 1);
  assert.deepEqual(await storedGeneration(), saved);
  record(
    'strict refusal of the original mismatched file and subsequent pool disposal cannot become a ready claim or repair/adopt native metadata or blobs'
  );
  await privatePrepare();
  const response = await page.evaluate(
    async (trip) => (await globalThis.fetch('/api/trips/' + trip + '/bundle')).status,
    fixture.trip_id
  );
  assert.equal(response, 200);
  await expect
    .poll(async () => (await storedGeneration()).row.value.generation, { timeout: 30000 })
    .not.toBe(saved.row.value.generation);
  assert.equal(await refused(), true);
  await open();
  const newer = await status();
  assert.equal(newer.privateFiles.counts.ready, 0);
  assert.equal(newer.publicImages.counts.ready, 2);
  record(
    'an actual online bundle-generation replacement retires the original observer and private pool; a separately admitted observer rereads public residency without accepting old private receipts'
  );
  await privatePrepare();
  const epoch = await page.evaluate(() => globalThis.__readinessApi.filePreviewRouteEpoch());
  await page.evaluate(() => globalThis.__readinessApi.setForcedOffline(true));
  assert.equal(await refused(), true);
  await expect
    .poll(() => page.evaluate(() => globalThis.__readinessApi.filePreviewRouteEpoch()))
    .toBeGreaterThan(epoch);
  if (phone) await page.getByRole('button', { name: 'More', exact: true }).click();
  await page
    .getByRole('button', { name: /^Files(?:\b|$)/ })
    .first()
    .click();
  await expect(page.getByText('Prepared native preview.webp', { exact: true }).first()).toBeVisible();
  if (phone) await page.getByText('Prepared native preview.webp', { exact: true }).first().click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          [...globalThis.document.images].filter(
            (i) => i.src.startsWith('blob:') && i.complete && i.naturalWidth === 2 && i.naturalHeight === 3
          ).length
      )
    )
    .toBeGreaterThan(0);
  await page.evaluate(() => globalThis.__privateStatusOwner.dispose());
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          [...globalThis.document.images].filter((i) => i.src.startsWith('blob:') && i.complete && i.naturalWidth === 2)
            .length
      )
    )
    .toBe(0);
  record(
    'the status observer retires when offline while the independently qualified native desktop/phone file preview still decodes prepared bytes and revokes them on pool disposal'
  );
  await page.evaluate(() => globalThis.__readinessApi.setForcedOffline(false));
  assert.equal(await refused(), true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 }).toBe(1);
  await open();
  const restarted = await status();
  assert.equal(restarted.privateFiles.counts.ready, 0);
  assert.equal(restarted.privateFiles.counts.missing, 1);
  assert.equal(restarted.privateFiles.counts.unsupported, 1);
  assert.equal(restarted.publicImages.counts.ready, 2);
  assert.equal(restarted.wholeTripReady, false);
  record(
    'reconnect cannot revive the retired observer; a fresh actual document independently sees surviving public cache bytes and no private RAM bytes'
  );
  const current = await page.evaluate(() => ({
    name: globalThis.localStorage.getItem('family-native-current.v1'),
    user: JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id,
  }));
  const legacy = 'trek-offline-u' + current.user;
  const command = {
    id: 'a16a1100-0000-4000-8000-000000000097',
    createdAt: 1,
    tripId: 1,
    method: 'POST',
    url: '/trips/' + fixture.trip_id + '/family/future',
    body: { originalRevision: 'status-preserved' },
    status: 'pending',
    attempts: 7,
    schemaVersion: 999,
  };
  await activationReviewOriginals(legacy, 'create-legacy', { source: current.name, command });
  await activationReviewOriginals(current.name, 'seed-current');
  const old = await activationReviewOriginals(legacy, 'all-legacy'),
    owned = await activationReviewOriginals(current.name, 'read'),
    heldAt = storageRequests();
  assert.equal(await refused(), true);
  assert.equal(storageRequests(), heldAt);
  assert.deepEqual(await activationReviewOriginals(legacy, 'all-legacy'), old);
  assert.deepEqual(await activationReviewOriginals(current.name, 'read'), owned);
  record(
    'new original command/import/File blockers refuse status publication before any Storage access while preserving exact original fields, compound keys and bytes'
  );
  await actualIdentityLogout(page);
  assert.deepEqual(await activationReviewOriginals(legacy, 'all-legacy'), old);
  assert.deepEqual(await activationReviewOriginals(current.name, 'read'), owned);
  assert.equal(completeStores(await inventory()).completeHeads.count, 0);
  assert.ok((await inventory()).caches.some((n) => n.startsWith('family-public-variants.v1:')));
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  assert.ok(!events.some((e) => e.path.includes('/render/image/') || e.path.includes('/execute_family_')));
  const nativeDB = (await inventory()).databases.filter((d) => d.name.startsWith('trek-offline'));
  assert.ok(nativeDB.every((d) => (d.stores.blobCache?.count ?? 0) === 0 && (d.stores.tripFiles?.count ?? 0) === 0));
  snapshots.preparation_readiness = {
    status_only: true,
    whole_trip_ready: false,
    metadata_expiry_unchanged: true,
    private_restart_unavailable: true,
    old_originals_exact: true,
    private_bytes_persisted: false,
  };
  record(
    'actual SDK logout preserves original work and public bytes while retiring private metadata; status observation made zero transformations/domain writes, native blob/file adoption or caught/uncaught app errors'
  );
}

// D16j: actual same-document private RAM preparation and native saved preview.
async function privateMemoryChecks() {
  const driver = '/' + build.private_file_memory_driver;
  assert.ok(build.private_file_memory_driver);
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await login(fixture.owner, true);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 }).toBe(1);
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  const saved = await storedGeneration();
  const open = async () =>
    page.evaluate(
      async ({ driver, trip }) => {
        const api = await import(driver);
        globalThis.__privateMemoryApi = api;
        globalThis.__privateMemoryOwner = await api.openPrivateFilePreparation(trip);
      },
      { driver, trip: fixture.trip_id }
    );
  const prepare = async (file, refresh = false) =>
    page.evaluate(
      async ({ file, refresh }) => {
        try {
          const receipt = await globalThis.__privateMemoryOwner.prepare('user-request', file, { refresh });
          return { receipt };
        } catch (error) {
          return { refused: true, code: error.code ?? null };
        }
      },
      { file, refresh }
    );
  await open();
  record(
    'actual App/password/TOTP/worker and original complete generation admit explicit private preparation without native cache adoption'
  );
  const negative = await prepare(fixture.graph.file);
  assert.equal(negative.refused, true);
  assert.deepEqual(await storedGeneration(), saved);
  record(
    'strict acquisition refuses the older declared-size/MIME mismatch without repairing original metadata or bytes'
  );
  const positive = await prepare(fixture.prepared_file.id);
  assert.equal(positive.receipt.content.sha256, fixture.prepared_file.sha256);
  assert.equal(positive.receipt.persisted, false);
  assert.equal(positive.receipt.generation, saved.row.value.generation);
  const count = events.filter((e) => e.path.startsWith('/storage/v1/object/sign/trip-files/')).length;
  const retry = await prepare(fixture.prepared_file.id);
  assert.deepEqual(retry.receipt, positive.receipt);
  assert.equal(events.filter((e) => e.path.startsWith('/storage/v1/object/sign/trip-files/')).length, count);
  record(
    'explicit prepare receives exactly the genuine private WebP; identical retry reuses RAM with no repeated Storage byte request'
  );
  // This is the native network preference, not a substitute saved controller.
  const route = await page.evaluate(() => globalThis.__privateMemoryApi.filePreviewRouteEpoch());
  await page.evaluate(() => globalThis.__privateMemoryApi.setForcedOffline(true));
  await expect
    .poll(() => page.evaluate(() => globalThis.__privateMemoryApi.filePreviewRouteEpoch()))
    .toBeGreaterThan(route);
  const before = events.length;
  if (phone) await page.getByRole('button', { name: 'More', exact: true }).click();
  await page
    .getByRole('button', { name: /^Files(?:\b|$)/ })
    .first()
    .click();
  await expect(page.getByText('Prepared native preview.webp', { exact: true }).first()).toBeVisible({ timeout: 20000 });
  if (phone) await page.getByText('Prepared native preview.webp', { exact: true }).first().click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            [...globalThis.document.images].filter(
              (i) => i.src.startsWith('blob:') && i.complete && i.naturalWidth === 2 && i.naturalHeight === 3
            ).length
        ),
      { timeout: 20000 }
    )
    .toBeGreaterThan(0);
  assert.ok(
    !events.slice(before).some((e) => e.path.startsWith('/storage/') || /\/api\/family\/files\/.+\/open/.test(e.path))
  );
  assert.deepEqual(await storedGeneration(), saved);
  record(
    'actual warm native Files image under an independently admitted saved read decodes the original 2×3 private bytes without a Storage/signing/private-file request or native blob row write'
  );
  const lease = await page.evaluate(async (file) => {
    const lease = await globalThis.__privateMemoryApi.acquireFilePreview('/api/family/files/' + file + '/open');
    globalThis.__privateMemoryLease = lease;
    const body = await (await globalThis.fetch(lease.url)).arrayBuffer();
    return {
      url: lease.url,
      current: lease.current(),
      sha256: [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', body))]
        .map((n) => n.toString(16).padStart(2, '0'))
        .join(''),
    };
  }, fixture.prepared_file.id);
  assert.equal(lease.current, true);
  assert.equal(lease.sha256, fixture.prepared_file.sha256);
  await page.evaluate(() => globalThis.__privateMemoryOwner.dispose());
  await expect.poll(() => page.evaluate(() => globalThis.__privateMemoryLease.current())).toBe(false);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          [...globalThis.document.images].filter((i) => i.src.startsWith('blob:') && i.complete && i.naturalWidth === 2)
            .length
      )
    )
    .toBe(0);
  const refused = await page.evaluate(async (file) => {
    try {
      await globalThis.__privateMemoryApi.acquireFilePreview('/api/family/files/' + file + '/open');
      return false;
    } catch {
      return true;
    }
  }, fixture.prepared_file.id);
  assert.equal(refused, true);
  record(
    'original pool disposal revokes native URLs immediately; the same saved metadata cannot fall back to old native blobs or redownload private bytes'
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectCold();
  if (phone) await page.getByRole('button', { name: 'More', exact: true }).click();
  await page
    .getByRole('button', { name: /^Files(?:\b|$)/ })
    .first()
    .click();
  await expect(page.getByText('Prepared native preview.webp', { exact: true }).first()).toBeVisible();
  if (phone) await page.getByText('Prepared native preview.webp', { exact: true }).first().click();
  assert.equal(
    await page.evaluate(
      () =>
        [...globalThis.document.images].filter((i) => i.src.startsWith('blob:') && i.complete && i.naturalWidth === 2)
          .length
    ),
    0
  );
  record(
    'a fresh saved document has the metadata but no private RAM bytes and truthfully keeps the preview unavailable'
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  assert.ok(!events.some((e) => e.path.includes('/render/image/') || e.path.includes('/execute_family_')));
  const db = (await inventory()).databases.filter((d) => d.name.startsWith('trek-offline'));
  assert.ok(db.every((d) => (d.stores.blobCache?.count ?? 0) === 0 && (d.stores.tripFiles?.count ?? 0) === 0));
  const privateCacheKeys = await page.evaluate(async () => {
    const keys = [];
    for (const name of await globalThis.caches.keys()) {
      const cache = await globalThis.caches.open(name);
      for (const request of await cache.keys()) {
        const url = new globalThis.URL(request.url);
        if (url.pathname.includes('/storage/v1/object/sign/') || /\/api\/family\/files\/.+\/open/.test(url.pathname))
          keys.push({ cache: name, path: url.pathname });
      }
    }
    return keys;
  });
  assert.deepEqual(privateCacheKeys, []);
  snapshots.private_memory = {
    original_generation_preserved: true,
    native_private_image_decoded: true,
    scope_owned_urls_revoked: true,
    private_bytes_persisted: false,
    original_negative_preserved: true,
    fresh_document_unavailable: true,
  };
  record(
    'private RAM acceptance makes zero transformations/domain commands, adds no persistent private/native file/blob rows and reports no caught or uncaught app error'
  );
}

/** D16g: actual native consumers of checked public bytes; no renderer/SDK replacement. */
async function publicImageConsumerChecks() {
  assert.ok(build.public_variant_driver, 'Explicit qualified byte driver required');
  const driver = '/' + build.public_variant_driver;
  const fixtureImage = JSON.parse(
    await readFile(path.join(root, 'tests/browser/family-offline-lifecycle/variant-fixture.json'), 'utf8')
  );
  const digest = createHash('sha256').update(Buffer.from(fixtureImage.base64, 'base64')).digest('hex');
  await page.addInitScript(() => {
    const create = globalThis.URL.createObjectURL.bind(globalThis.URL),
      revoke = globalThis.URL.revokeObjectURL.bind(globalThis.URL);
    globalThis.__savedImageLeases = { created: [], revoked: [] };
    globalThis.URL.createObjectURL = (blob) => {
      const url = create(blob);
      globalThis.__savedImageLeases.created.push({ url, type: blob.type, bytes: blob.size });
      return url;
    };
    globalThis.URL.revokeObjectURL = (url) => {
      globalThis.__savedImageLeases.revoked.push(url);
      return revoke(url);
    };
  });
  const imageURLs = () =>
    page.evaluate(() =>
      globalThis.__savedImageLeases.created.filter((value) => value.type === 'image/webp').map((value) => value.url)
    );
  const released = async (urls) =>
    expect
      .poll(() =>
        page.evaluate((urls) => urls.every((url) => globalThis.__savedImageLeases.revoked.includes(url)), urls)
      )
      .toBe(true);
  const cold = async () => {
    proxy.setOffline(true);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectCold();
  };
  const online = async () => {
    // Exercise genuine browser disconnection/reconnection, without mutating force-mode storage.
    proxy.setOffline(false);
    await context.setOffline(false);
    const plan = page.getByRole('button', { name: 'Plan', exact: true }).first();
    const retry = page.getByRole('button', { name: 'Try again', exact: true });
    await expect(plan.or(retry).first()).toBeVisible({ timeout: 30000 });
    if (await retry.isVisible()) await retry.click();
    await expect(plan).toBeVisible({ timeout: 30000 });
    await expect
      .poll(() =>
        page
          .getByRole('status')
          .filter({ hasText: /view only/ })
          .count()
      )
      .toBe(0);
  };
  const capture = async (saved) =>
    page.evaluate(
      async ({ driver, source, variants }) => {
        const module = await import(driver),
          cache = module.createPublicVariantCache({ source }),
          receipts = [];
        for (const variant of variants) {
          if (variant.recipeVersion !== 'v1') throw Error('Unexpected fixture recipe');
          for (const role of ['thumb', 'hero']) {
            const url = role === 'hero' ? variant.heroUrl : variant.thumbUrl;
            if (url) {
              const value = await cache.capture(
                { source, mediaAssetId: variant.mediaAssetId, recipe: 'v1', role, url },
                { current: () => true }
              );
              receipts.push(value.receipt);
            }
          }
        }
        return receipts;
      },
      { driver, source: fixture.api, variants: saved.row.value.data.planner.variants }
    );
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await login(fixture.owner, true);
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 }).toBe(1);
  let saved = await storedGeneration();
  const firstCapture = saved.row.value.capturedAt;
  assert.equal(saved.row.value.capabilities.mediaBytes, false);
  await cold();
  assert.deepEqual(await imageURLs(), []);
  assert.equal(await page.locator('img[src^="blob:"]').count(), 0);
  assert.deepEqual(await storedGeneration(), saved);
  record(
    'actual saved native Plan uses placeholders with no public cache bytes and leaves the original generation/media flags unchanged'
  );

  await online();
  await expect
    .poll(async () => (await storedGeneration()).row.value.capturedAt, { timeout: 30000 })
    .toBeGreaterThan(firstCapture);
  saved = await storedGeneration();
  const receipts = await capture(saved);
  assert.equal(receipts.length, 2);
  assert.ok(receipts.every((value) => value.sha256 === digest && value.width === 2 && value.height === 3));
  assert.deepEqual(await storedGeneration(), saved);
  snapshots.public_images = { fixture_http_override_not_bucket_rls: true, receipts, complete_media_bytes: false };
  record(
    'real SDK online recapture supplies the exact accepted descriptors; the qualified driver stores real checked synthetic WebP bytes without editing the complete snapshot'
  );

  await cold();
  const offlineStart = events.length;
  const name = saved.row.value.data.planner.view.state.locations[0].name;
  const avatars = page.getByRole('img', { name, exact: true });
  if (phone) await page.getByRole('button', { name: 'Places', exact: true }).click();
  await expect(avatars.first()).toBeVisible({ timeout: 30000 });
  await expect
    .poll(() =>
      avatars
        .first()
        .evaluate((image) => ({ src: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight }))
    )
    .toMatchObject({ width: 2, height: 3 });
  assert.ok((await avatars.first().getAttribute('src')).startsWith('blob:'));
  record(
    'the actual native Places list/avatar decodes the cached 2×3 hero offline through a temporary display URL, without changing the layout'
  );
  const map = page.locator('.leaflet-marker-icon img[src^="blob:"], .maplibregl-marker img[src^="blob:"]');
  await expect.poll(() => map.count(), { timeout: 30000 }).toBeGreaterThan(0);
  await expect.poll(() => map.first().evaluate((image) => image.naturalWidth)).toBe(2);
  record('the actual native map marker consumes the same checked display bytes while disconnected');
  await page.getByText(name, { exact: true }).first().click();
  if (phone) await page.getByRole('button', { name: 'View details', exact: true }).click();
  await expect(page.getByRole('radio')).toHaveCount(5);
  const detail = await page.evaluate(() => {
    const images = [...globalThis.document.querySelectorAll('img[src^="blob:"]')].map((image) => ({
      src: image.currentSrc,
      width: image.naturalWidth,
      height: image.naturalHeight,
    }));
    const backgrounds = [...globalThis.document.querySelectorAll('[style*="blob:"]')].map(
      (node) => globalThis.getComputedStyle(node).backgroundImage
    );
    return { images, backgrounds };
  });
  assert.ok(detail.images.some((image) => image.width === 2 && image.height === 3));
  if (phone) assert.ok(detail.backgrounds.some((value) => value.includes('blob:')));
  assert.deepEqual(await storedGeneration(), saved);
  record(
    'the actual native Place details keep the same image, source identity and untouched immutable generation; no automatic original or private-file download occurs'
  );
  const urls = await imageURLs();
  assert.ok(urls.length > 0);
  if (phone) {
    await page.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(page.getByRole('radio')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back', exact: true }).first().click();
  } else {
    await page.evaluate(() => {
      globalThis.history.pushState({}, '', '/dashboard');
      globalThis.dispatchEvent(new globalThis.PopStateEvent('popstate'));
    });
  }
  await released(urls);
  record(
    'actual router Trip closure revokes that view’s object URLs while leaving public cached bytes and complete metadata intact'
  );
  if (phone) {
    await expect(page.getByRole('heading', { name: 'You appear to be offline', exact: true })).toBeVisible();
    await page.goBack();
  } else {
    await page.evaluate((trip) => {
      globalThis.history.pushState({}, '', '/trips/' + trip);
      globalThis.dispatchEvent(new globalThis.PopStateEvent('popstate'));
    }, fixture.trip_id);
  }
  await expectCold();
  await expect.poll(async () => (await imageURLs()).filter((url) => !urls.includes(url)).length).toBeGreaterThan(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectCold();
  await expect.poll(async () => (await imageURLs()).length).toBeGreaterThan(0);
  assert.deepEqual(await storedGeneration(), saved);
  record(
    'native warm router return and fresh-document re-entry obtain new image leases without changing the saved generation'
  );
  const all = await imageURLs();
  await page.evaluate((expires) => {
    const original = globalThis.Date.now;
    globalThis.__restoreImageClock = () => {
      globalThis.Date.now = original;
    };
    globalThis.Date.now = () => expires + 1;
  }, saved.row.value.expiresAt);
  await released(all);
  await expectRecovery();
  assert.deepEqual(await storedGeneration(), saved);
  record(
    'a returning saved view gets new leases; original private-view expiry revokes them without extending the seven-day public cache into private Trip authority'
  );

  await page.evaluate(() => globalThis.__restoreImageClock());
  await online();
  await expect
    .poll(async () => (await storedGeneration()).row.value.capturedAt, { timeout: 30000 })
    .toBeGreaterThan(saved.row.value.capturedAt);
  await cold();
  await expect.poll(async () => (await imageURLs()).length).toBeGreaterThan(0);
  const last = await imageURLs(),
    before = await inventory();
  const current = await page.evaluate(() => ({
    name: globalThis.localStorage.getItem('family-native-current.v1'),
    user: JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id,
  }));
  const legacy = 'trek-offline-u' + current.user;
  const command = {
    id: 'a16a1100-0000-4000-8000-000000000099',
    createdAt: 1,
    tripId: 1,
    method: 'POST',
    url: '/trips/' + fixture.trip_id + '/family/future',
    body: { originalRevision: 'preserved' },
    status: 'pending',
    attempts: 7,
    schemaVersion: 999,
  };
  await activationReviewOriginals(legacy, 'create-legacy', { source: current.name, command });
  await activationReviewOriginals(current.name, 'seed-current');
  const legacyBefore = await activationReviewOriginals(legacy, 'all-legacy'),
    ownedBefore = await activationReviewOriginals(current.name, 'read');
  const refused = await page.evaluate(
    async (trip) => (await globalThis.fetch('/api/trips/' + trip + '/bundle')).status,
    fixture.trip_id
  );
  assert.equal(refused, 503);
  await released(last);
  assert.deepEqual(await activationReviewOriginals(legacy, 'all-legacy'), legacyBefore);
  assert.deepEqual(await activationReviewOriginals(current.name, 'read'), ownedBefore);
  record(
    'a real saved-bundle read refuses new original work and retires the saved image view; legacy commands and current-owned compound-key File bytes remain exact with no replay or adoption'
  );
  await actualIdentityLogout(page);
  assert.deepEqual(await activationReviewOriginals(legacy, 'all-legacy'), legacyBefore);
  assert.deepEqual(await activationReviewOriginals(current.name, 'read'), ownedBefore);
  const after = await inventory();
  assert.ok(after.caches.some((value) => value.startsWith('family-public-variants.v1:')));
  assert.equal(completeStores(after).completeHeads.count, 0);
  snapshots.public_images.originals_exact = true;
  snapshots.public_images.placeholder_and_native_images = true;
  snapshots.public_images.view_leases_revoked = true;
  snapshots.public_images.native_before = before.databases
    .filter((value) => value.name.startsWith('trek-offline'))
    .map((value) => ({ name: value.name, stores: Object.keys(value.stores) }));
  record(
    'real SDK logout preserves original work and public bytes while retiring private complete generations; display leases are already revoked'
  );
  assert.ok(
    !events
      .slice(offlineStart)
      .some(
        (value) =>
          value.path.includes('/render/image/') ||
          value.path.includes('/object/sign/') ||
          value.path.includes('/execute_family_') ||
          /\/api\/family\/files\/.+\/open/.test(value.path)
      )
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  record(
    'native image acceptance finishes with no catalog transformation, private signing/file open, domain command or caught/uncaught app error; full preparation and hosted activation remain disabled'
  );
}

// Diagnostic acceptance review: these observations reproduce gaps, not passing feature acceptance.
async function releaseReviewChecks() {
  const next = process.env.FAMILY_PWA_NEXT_DIST;
  assert.match(next ?? '', /^\/private\/tmp\/trek-u03d16-release-review-next-[^/]+\/build-qualified\/actual-dist$/);
  const second = JSON.parse(await readFile(path.join(next, '..', 'actual-build.json'), 'utf8'));
  for (const [name, digest] of Object.entries(second.artifact_hashes))
    assert.equal(
      createHash('sha256')
        .update(await readFile(path.join(next, name)))
        .digest('hex'),
      digest
    );
  const entryOf = async (directory) =>
    (await readFile(path.join(directory, 'index.html'), 'utf8')).match(/src="(\/assets\/index-[^"]+\.js)"/)[1];
  const firstEntry = await entryOf(dist),
    nextEntry = await entryOf(next);
  assert.notEqual(firstEntry, nextEntry);
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await login(fixture.owner, true);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 }).toBe(1);
  const configVersion = () =>
    page.evaluate(async () => (await (await globalThis.fetch('/api/auth/app-config')).json()).version);
  assert.equal(await configVersion(), '5.1.2');
  const current = await page.evaluate(() => ({
    name: globalThis.localStorage.getItem('family-native-current.v1'),
    user: JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id,
  }));
  if (phone) await page.getByRole('button', { name: 'Places', exact: true }).click();
  const title = page.getByPlaceholder(/^Search/).first();
  await title.fill('D16l retained native search text');
  const saved = await storedGeneration(),
    legacy = 'trek-offline-u' + current.user;
  const command = {
    id: 'a16c1100-0000-4000-8000-000000000089',
    tripId: saved.row.value.bindings.find((v) => v.kind === 'trip').key,
    method: 'POST',
    url: '/trips/' + fixture.trip_id + '/family/future',
    body: {
      operation_id: 'a16c1100-0000-4000-8000-000000000089',
      revision: 'release-review',
      extra: { original: [false, 7] },
    },
    createdAt: 1,
    status: 'pending',
    attempts: 7,
    lastError: 'Original local release review',
    schemaVersion: 1,
  };
  await activationReviewOriginals(legacy, 'create-legacy', { source: current.name, command });
  await activationReviewOriginals(current.name, 'seed-current');
  const legacyBefore = await activationReviewOriginals(legacy, 'all-legacy'),
    ownedBefore = await activationReviewOriginals(current.name, 'read');
  const originalsExact = async () => {
    assert.deepEqual(await activationReviewOriginals(legacy, 'all-legacy'), legacyBefore);
    assert.deepEqual(await activationReviewOriginals(current.name, 'read'), ownedBefore);
  };
  record('real signed-in A bundle and generated worker boot; synthetic original command and file bytes captured');
  await page.evaluate(() => {
    globalThis.__releaseReviewChanges = 0;
    globalThis.navigator.serviceWorker.addEventListener('controllerchange', () => globalThis.__releaseReviewChanges++);
  });
  server.switchDirectory(next);
  await page.evaluate(async () => {
    const r = await globalThis.navigator.serviceWorker.getRegistration();
    await r.update();
  });
  await expect
    .poll(() => page.evaluate(() => globalThis.__releaseReviewChanges), { timeout: 90000 })
    .toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        page.evaluate(async (entry) => {
          for (const name of await globalThis.caches.keys()) {
            if (!name.includes('-precache-')) continue;
            if ((await (await globalThis.caches.open(name)).keys()).some((key) => new URL(key.url).pathname === entry))
              return true;
          }
          return false;
        }, nextEntry),
      { timeout: 30000 }
    )
    .toBe(true);
  await expect(title).toHaveValue('D16l retained native search text');
  await originalsExact();
  record('actual B worker activates and precaches B while A native search text and all original work remain intact');
  // Observe the real bounded handover; do not inject socket welcome/version-store events.
  await page.waitForTimeout(2500);
  assert.equal(await configVersion(), '5.1.2');
  await expect(page.getByText('A new version is available', { exact: true })).toHaveCount(0);
  assert.equal(
    await page.evaluate(
      (entry) => [...globalThis.document.scripts].some((s) => new URL(s.src).pathname === entry),
      firstEntry
    ),
    true
  );
  snapshots.release_metadata_gap = {
    observed: true,
    running_app_config: '5.1.2',
    deployed_build: '5.1.2-d16l-next',
    worker_changed: true,
    native_update_notice: false,
    observation_ms_after_activation: 2500,
    feature_acceptance: false,
  };
  record('GAP REPRODUCED: A app-config still reports A after actual B activation and native update notice is absent');
  await page.screenshot({ path: path.join(output, 'new-worker-no-notice.png'), fullPage: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(configVersion, { timeout: 30000 }).toBe('5.1.2-d16l-next');
  await originalsExact();
  record('explicit page reload boots B app-config and preserves original command, revision, attempts and file bytes');
  // Let normal startup inspection finish before deliberately damaging one public cached entry.
  await page.waitForTimeout(2500);
  const damaged = await page.evaluate(async (entry) => {
    for (const name of await globalThis.caches.keys()) {
      if (!name.includes('-precache-')) continue;
      const cache = await globalThis.caches.open(name);
      const key = (await cache.keys()).find((request) => new URL(request.url).pathname === entry);
      if (!key) continue;
      const original = await cache.match(key);
      const bytes = Array.from(new Uint8Array(await original.arrayBuffer()));
      const headers = [...original.headers.entries()];
      await cache.put(
        key,
        new globalThis.Response('<!doctype html><title>Local corrupt cached entry</title>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
      );
      return { cache: name, key: key.url, status: original.status, headers, bytes };
    }
    throw Error('Current generated precache entry absent');
  }, nextEntry);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#trek-shell-recovery')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#root')).toBeEmpty();
    await originalsExact();
    const health = await page.evaluate(async () => {
      const r = await globalThis.fetch('/api/health', { cache: 'no-store' });
      return { status: r.status, type: r.headers.get('content-type') };
    });
    assert.ok(health.status !== 200 || !health.type?.includes('application/json'));
    await Promise.all([
      page.waitForEvent('domcontentloaded'),
      page.getByRole('button', { name: 'Try again', exact: true }).click(),
    ]);
    await expect(page.locator('#trek-shell-recovery')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#root')).toBeEmpty();
    const stillBad = await page.evaluate(
      async ({ cache, key }) => (await (await globalThis.caches.open(cache)).match(key)).headers.get('content-type'),
      damaged
    );
    assert.equal(stillBad, 'text/html');
    await originalsExact();
    snapshots.corrupt_entry_gap = {
      observed: true,
      health,
      cached_entry_content_type_after_explicit_retry: stillBad,
      retry_still_fails_before_bootstrap: true,
      original_work_exact: true,
      feature_acceptance: false,
    };
    record(
      'GAP REPRODUCED: static-host wrong-MIME precache survives explicit Try again; preboot fallback repeats with original work intact'
    );
    await page.screenshot({ path: path.join(output, 'persistent-corrupt-entry.png'), fullPage: true });
  } finally {
    // Test-fixture cleanup, not product recovery. Restore the exact captured public response.
    await page.evaluate(
      async ({ cache, key, bytes, status, headers }) =>
        (await globalThis.caches.open(cache)).put(
          key,
          new globalThis.Response(new Uint8Array(bytes), { status, headers })
        ),
      damaged
    );
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(configVersion, { timeout: 30000 }).toBe('5.1.2-d16l-next');
  await expect(page.locator('#trek-shell-recovery')).toHaveCount(0);
  await originalsExact();
  record(
    'test-only restoration of exact public entry bytes recovers B; original private work remains exact throughout'
  );
  const outside = proxy.events.filter(
    (event) =>
      !event.denied &&
      !(
        [origin, fixture.api].includes(event.origin) ||
        [new URL(origin).host, new URL(fixture.api).host].includes(event.authority)
      )
  );
  assert.deepEqual(outside, []);
  assert.equal(
    events.some((event) => event.path.includes('/render/image/')),
    false
  );
  record(
    'proxy permits loopback application/local SDK only; no image-transformation attempts or hosted traffic forwarded'
  );
}

// D16m: positive acceptance against actual finalized builds; prior D16l reproducer remains separate.
async function releaseRepairChecks() {
  const next = process.env.FAMILY_PWA_NEXT_DIST;
  assert.match(next ?? '', /^\/private\/tmp\/trek-u03d16-release-repair-B-[^/]+\/build-qualified\/actual-dist$/);
  const second = JSON.parse(await readFile(path.join(next, '..', 'actual-build.json'), 'utf8'));
  for (const [name, digest] of Object.entries(second.artifact_hashes))
    assert.equal(
      createHash('sha256')
        .update(await readFile(path.join(next, name)))
        .digest('hex'),
      digest
    );
  const entryOf = async (directory) =>
    (await readFile(path.join(directory, 'index.html'), 'utf8')).match(/src="(\/assets\/index-[^"]+\.js)"/)[1];
  const firstEntry = await entryOf(dist),
    nextEntry = await entryOf(next);
  assert.notEqual(firstEntry, nextEntry);
  await page.goto(origin + '/trips/' + fixture.trip_id);
  await login(fixture.owner, true);
  await expect(page.getByRole('button', { name: 'Plan', exact: true }).first()).toBeVisible({ timeout: 30000 });
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  await expect.poll(async () => completeStores(await inventory()).completeHeads.count, { timeout: 30000 }).toBe(1);
  const configVersion = () =>
    page.evaluate(async () => {
      try {
        return (await (await globalThis.fetch('/api/auth/app-config')).json()).version;
      } catch {
        return null;
      }
    });
  assert.equal(await configVersion(), 'family-2026.11.11.1-rc.1');
  const current = await page.evaluate(() => ({
    name: globalThis.localStorage.getItem('family-native-current.v1'),
    user: JSON.parse(globalThis.localStorage.getItem('trek_native_auth_snapshot')).state.user.id,
  }));
  if (phone) await page.getByRole('button', { name: 'Places', exact: true }).click();
  const title = page.getByPlaceholder(/^Search/).first();
  await title.fill('D16m retained native search text');
  const saved = await storedGeneration(),
    legacy = 'trek-offline-u' + current.user;
  const command = {
    id: 'a16c1100-0000-4000-8000-000000000089',
    tripId: saved.row.value.bindings.find((v) => v.kind === 'trip').key,
    method: 'POST',
    url: '/trips/' + fixture.trip_id + '/family/future',
    body: {
      operation_id: 'a16c1100-0000-4000-8000-000000000089',
      revision: 'release-review',
      extra: { original: [false, 7] },
    },
    createdAt: 1,
    status: 'pending',
    attempts: 7,
    lastError: 'Original local release review',
    schemaVersion: 1,
  };
  await activationReviewOriginals(legacy, 'create-legacy', { source: current.name, command });
  await activationReviewOriginals(current.name, 'seed-current');
  const legacyBefore = await activationReviewOriginals(legacy, 'all-legacy'),
    ownedBefore = await activationReviewOriginals(current.name, 'read');
  const originalsExact = async () => {
    assert.deepEqual(await activationReviewOriginals(legacy, 'all-legacy'), legacyBefore);
    assert.deepEqual(await activationReviewOriginals(current.name, 'read'), ownedBefore);
  };
  record('real signed-in A bundle and generated worker boot; synthetic original command and file bytes captured');
  await page.evaluate(() => {
    globalThis.__releaseReviewChanges = 0;
    globalThis.navigator.serviceWorker.addEventListener('controllerchange', () => globalThis.__releaseReviewChanges++);
  });
  server.switchDirectory(next);
  await page.evaluate(async () => {
    const r = await globalThis.navigator.serviceWorker.getRegistration();
    await r.update();
  });
  await expect
    .poll(() => page.evaluate(() => globalThis.__releaseReviewChanges), { timeout: 90000 })
    .toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        page.evaluate(async (entry) => {
          for (const name of await globalThis.caches.keys()) {
            if (!name.includes('-precache-')) continue;
            if ((await (await globalThis.caches.open(name)).keys()).some((key) => new URL(key.url).pathname === entry))
              return true;
          }
          return false;
        }, nextEntry),
      { timeout: 30000 }
    )
    .toBe(true);
  await expect(title).toHaveValue('D16m retained native search text');
  await originalsExact();
  record('actual B worker activates and precaches B while A native search text and all original work remain intact');
  const notice = page.getByRole('status').filter({ hasText: 'A new version is available' });
  await expect(notice).toHaveCount(1, { timeout: 30000 });
  await expect(notice).toBeVisible();
  assert.equal(await configVersion(), 'family-2026.11.11.1-rc.2');
  assert.equal(
    await page.evaluate(
      (entry) => [...globalThis.document.scripts].some((s) => new URL(s.src).pathname === entry),
      firstEntry
    ),
    true
  );
  await expect(title).toHaveValue('D16m retained native search text');
  await originalsExact();
  snapshots.release_metadata_repair = {
    native_notice: true,
    observed_deployed_version: 'family-2026.11.11.1-rc.2',
    old_bundle_not_forcibly_reloaded: true,
    feature_acceptance: true,
  };
  record(
    'native update notice appears exactly once from real B deployment metadata; A remains mounted with typed text and originals intact'
  );
  await page.screenshot({ path: path.join(output, 'native-release-notice.png'), fullPage: true });
  await Promise.all([
    page.waitForEvent('domcontentloaded'),
    notice.getByRole('button', { name: 'Reload page', exact: true }).click(),
  ]);
  await expect.poll(configVersion, { timeout: 30000 }).toBe('family-2026.11.11.1-rc.2');
  await expect(page.getByText('A new version is available', { exact: true })).toHaveCount(0);
  await originalsExact();
  record(
    'actual native Reload page action boots B and preserves original command, revision, attempts and binary imports'
  );
  // Let normal startup inspection finish before deliberately damaging one public cached entry.
  await page.waitForTimeout(2500);
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  const poison = async (entry) =>
    page.evaluate(async (entry) => {
      const scope = (await globalThis.navigator.serviceWorker.getRegistration()).scope;
      const cacheName = 'workbox-precache-v2-' + scope;
      const cache = await globalThis.caches.open(cacheName);
      const key = (await cache.keys()).find((k) => new URL(k.url).pathname === entry);
      if (!key) throw Error('Actual build precache entry absent');
      await cache.put(
        key,
        new globalThis.Response('<!doctype html><title>Deliberate corrupt cached module</title>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
      );
      return { cache: cacheName, key: key.url };
    }, entry);
  const retry = () =>
    Promise.all([
      page.waitForEvent('domcontentloaded'),
      page.getByRole('button', { name: 'Try again', exact: true }).click(),
    ]);
  const fallback = async () => {
    await expect(page.locator('#trek-shell-recovery')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#root')).toBeEmpty();
    await originalsExact();
  };
  const bad = await poison(nextEntry);
  await page.evaluate(async () => {
    for (const name of ['map-tiles', 'workbox-precache-v2-' + globalThis.location.origin + '/other-app/'])
      await (
        await globalThis.caches.open(name)
      ).put('/sentinel-public-retained', new globalThis.Response('original sentinel'));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await fallback();
  const health = await page.evaluate(async () => {
    const r = await globalThis.fetch('/api/health', { cache: 'no-store' });
    return { status: r.status, type: r.headers.get('content-type') };
  });
  assert.ok(health.status !== 200 || !health.type?.includes('application/json'));
  releaseFault.descriptor = true;
  await retry();
  await fallback();
  assert.equal(
    await page.evaluate(
      async ({ cache, key }) => (await (await globalThis.caches.open(cache)).match(key)).headers.get('content-type'),
      bad
    ),
    'text/html'
  );
  record('actual failed descriptor HTTP observation keeps corrupt shell, other caches and all original private work');
  releaseFault.descriptor = false;
  releaseFault.entry = nextEntry;
  releaseFault.entryBytes = (await stat(path.join(next, nextEntry.slice(1)))).size;
  await retry();
  await fallback();
  assert.equal(
    await page.evaluate(
      async ({ cache, key }) => (await (await globalThis.caches.open(cache)).match(key)).headers.get('content-type'),
      bad
    ),
    'text/html'
  );
  record('uncached remote entry with wrong digest refuses cache removal and preserves original work');
  releaseFault.entry = null;
  await retry();
  await expect.poll(configVersion, { timeout: 30000 }).toBe('family-2026.11.11.1-rc.2');
  await expect(page.locator('#trek-shell-recovery')).toHaveCount(0);
  await originalsExact();
  assert.deepEqual(
    await page.evaluate(async () => {
      const out = [];
      for (const name of ['map-tiles', 'workbox-precache-v2-' + globalThis.location.origin + '/other-app/'])
        out.push(await (await (await globalThis.caches.open(name)).match('/sentinel-public-retained')).text());
      return out;
    }),
    ['original sentinel', 'original sentinel']
  );
  snapshots.static_entry_repair = {
    verified_remote_bytes: true,
    manual_test_response_restore: false,
    native_retry_recovers_app: true,
    unrelated_caches_preserved: true,
    health,
    feature_acceptance: true,
  };
  record(
    'actual Try again verifies live B bytes, retires only its shell and boots B; no manual cache restoration, originals and unrelated caches exact'
  );
  await page.screenshot({ path: path.join(output, 'static-entry-recovered.png'), fullPage: true });
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  const entrySource = await readFile(path.join(next, nextEntry.slice(1)), 'utf8');
  const imported = entrySource.match(/from["']\.\/([^"'?#]+\.js)["']/)?.[1];
  assert.ok(imported && second.artifact_hashes['assets/' + imported]);
  await poison('/assets/' + imported);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await fallback();
  await retry();
  await expect.poll(configVersion, { timeout: 30000 }).toBe('family-2026.11.11.1-rc.2');
  await expect(page.locator('#trek-shell-recovery')).toHaveCount(0);
  await originalsExact();
  record('the same verified explicit recovery repairs a persistent corrupt static dependency before App can import');
  assert.equal(
    await page.evaluate(async () => {
      for (const name of await globalThis.caches.keys())
        for (const key of await (await globalThis.caches.open(name)).keys())
          if (new URL(key.url).pathname === '/family-build.json') return true;
      return false;
    }),
    false
  );
  const outside = proxy.events.filter(
    (event) =>
      !event.denied &&
      !(
        [origin, fixture.api].includes(event.origin) ||
        [new URL(origin).host, new URL(fixture.api).host].includes(event.authority)
      )
  );
  assert.deepEqual(outside, []);
  assert.equal(
    events.some((event) => event.path.includes('/render/image/')),
    false
  );
  record(
    'loopback-only proxy preserves local SDK/RLS boundary and zero transformation attempts; build descriptor is not a private cache'
  );
}

try {
  if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'release-repair') await releaseRepairChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'release-review') await releaseReviewChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'preparation-status') await readinessChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'private-memory') await privateMemoryChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'public-image-preparation')
    await publicImagePreparationChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'public-images') await publicImageConsumerChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'preparation-review') await preparationReviewChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'unattributed-recovery') await unattributedRecoveryChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'activation-review') await activationReviewChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'startup') await startupAcceptanceChecks();
  else if (
    process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'recovery-export' ||
    (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'source' && process.env.FAMILY_RECOVERY_EXPORT_BOUNDARY === 'source')
  )
    await recoveryExportChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'controls') await nativeControlsChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'integrity') await storageIntegrityChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'storage') await storageFailureChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'private-bodies') await privateBodyChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'family') await familyBoundaryChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'source') await sourceBoundaryChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'assurance') await assuranceChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'person') await personChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'cleanup') await delayedCleanupChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'membership') await membershipChecks();
  else if (process.env.FAMILY_OFFLINE_INVENTORY_MODE === 'cross-tab') await crossTabChecks();
  else await companionLifecycle();
} catch (e) {
  snapshots.failure_inventory = await inventory().catch(() => null);
  await writeFile(path.join(output, 'failure.json'), JSON.stringify({ message: e.message, stack: e.stack }, null, 2));
  await writeFile(path.join(output, 'failure-body.txt'), await page.locator('body').innerText());
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
        ...(delayed ? { responseBarriers: delayed.observations } : {}),
        build_manifest_sha256: proof.build_manifest_sha256,
      },
      null,
      2
    )
  );
  await context.close();
  await browser.close();
  delayed?.close();
  await proxy.close();
  await server.close();
}
