// Real index/main/App, installed SDK and generated worker; only marked loopback fixtures.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { loopbackProxy } from '../pwa-entry/loopback-proxy.mjs';
import { artifactServer } from '../pwa-entry/static-server.mjs';
const root = fileURLToPath(new URL('../../..', import.meta.url));
const input = process.env.FAMILY_TASK_RECOVERY_FIXTURE,
  output = process.env.FAMILY_TASK_RECOVERY_OUTPUT,
  dist = process.env.FAMILY_TASK_RECOVERY_DIST;
for (const v of [input, output]) assert.ok(v?.startsWith('/private/tmp/trek-u03d11-'));
assert.match(dist ?? '', /^\/private\/tmp\/trek-u03d(?:10|11)-/);
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
const phone = process.env.FAMILY_TASK_RECOVERY_PROFILE === 'phone',
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
const moduleErrors = [],
  resourceFailures = [];
const safe = (raw) => {
  const u = new URL(raw);
  return { origin: u.origin, path: u.pathname };
};
context.on('request', (r) => events.push({ ...safe(r.url()), method: r.method(), worker: !!r.serviceWorker() }));
context.on('response', (r) => responses.push({ ...safe(r.url()), status: r.status() }));
page.on('requestfailed', (r) => resourceFailures.push({ ...safe(r.url()), reason: r.failure()?.errorText }));
page.on('console', (m) => {
  if (m.type() === 'error' && /module|script|MIME|SyntaxError|ReferenceError/i.test(m.text()))
    moduleErrors.push(
      m
        .text()
        .slice(0, 600)
        .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]')
    );
});
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && m.text().includes('[ErrorBoundary:')) caught.push(m.text().slice(0, 200));
});
const record = (name) => {
  checks.push({ name, passed: true });
  process.stdout.write(profile + ': ' + name + '\n');
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
async function reloadEntry() {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Boolean(
            globalThis.document.getElementById('root')?.childElementCount ||
            globalThis.document.getElementById('trek-shell-recovery')
          )
        ),
      { timeout: 30000 }
    )
    .toBe(true);
  const fallback = page.locator('#trek-shell-recovery');
  if ((await fallback.isVisible()) && (await page.evaluate(() => globalThis.navigator.onLine))) {
    await fallback.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(fallback).toHaveCount(0, { timeout: 30000 });
    record('early shell explicit retry recovers a failed online entry without replaying any task');
  }
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
async function tasksTab() {
  await page.getByRole('button', { name: 'Lists', exact: true }).first().click();
  await page
    .getByRole('button', { name: /^To.do(?!.*Trash)/i })
    .first()
    .click();
  await expect(page.getByText('Original bootstrap task', { exact: true }).first()).toBeVisible();
}
async function retain(name) {
  await page.getByRole('button', { name: phone ? 'New task' : 'Add new task', exact: true }).click();
  await page.getByPlaceholder('Task name').fill(name);
  await offline();
  await page.getByRole('button', { name: /^Create/ }).click();
  await expect.poll(async () => (await queue()).length, { timeout: 20000 }).toBe(1);
  const rows = await queue();
  await reloadEntry();
  await recovered();
  await online();
  await expect(page.getByText(/Planner refresh is held to preserve local work/).first()).toBeVisible({
    timeout: 30000,
  });
  return rows[0];
}
async function rewrite(row) {
  return page.evaluate(async (saved) => {
    for (const { name } of await globalThis.indexedDB.databases()) {
      if (!name?.startsWith('trek-offline-u')) continue;
      const db = await new Promise((resolve, reject) => {
        const r = globalThis.indexedDB.open(name);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        if (!db.objectStoreNames.contains('mutationQueue')) continue;
        const found = await new Promise((resolve, reject) => {
          const r = db.transaction('mutationQueue', 'readonly').objectStore('mutationQueue').get(saved.id);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        if (found)
          await new Promise((resolve, reject) => {
            const tx = db.transaction('mutationQueue', 'readwrite');
            tx.objectStore('mutationQueue').put(saved);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          });
      } finally {
        db.close();
      }
    }
  }, row);
}
const executePath = '/rest/v1/rpc/execute_family_trip_task_v1',
  executions = () => events.filter((e) => e.path === executePath).length;
let first,
  conflicting,
  membershipSuspended = false;
const guardPath = process.env.FAMILY_TASK_RECOVERY_LOCAL_GUARD;
assert.ok(guardPath?.startsWith('/private/tmp/trek-u03d11-'));
function arrange(action) {
  execFileSync('/Library/Frameworks/Python.framework/Versions/3.14/bin/python3', [guardPath, input, action], {
    stdio: 'pipe',
  });
}
try {
  if (process.env.FAMILY_TASK_RECOVERY_BEFORE !== '1') {
    const html = await readFile(path.join(dist, 'index.html'), 'utf8'),
      entry = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
    assert.ok(entry?.startsWith('/assets/'));
    // A transport failure before React exists, never a substitute app/SDK/answer.
    await page.route(origin + entry, (route) => route.abort('failed'), { times: 1 });
    await page.goto(origin + '/trips/' + fixture.trip_id);
    const fallback = page.locator('#trek-shell-recovery');
    await expect(fallback).toBeVisible();
    assert.equal(await page.locator('#root').evaluate((el) => el.childElementCount), 0);
    assert.equal(
      events.some((e) => e.origin === fixture.api),
      false
    );
    await fallback.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(fallback).toHaveCount(0, { timeout: 30000 });
    record('failed entry script has an explicit non-destructive retry before React or SDK startup');
  } else await page.goto(origin + '/trips/' + fixture.trip_id);
  await expect(page.locator('input[type=email]')).toBeVisible({ timeout: 30000 });
  await expect
    .poll(() => page.evaluate(() => !!globalThis.navigator.serviceWorker.controller), { timeout: 90000 })
    .toBe(true);
  await login(fixture.owner, true);
  await tripReady();
  record('actual generated worker, password/MFA and current Family validation open the native Trip');
  await tasksTab();
  first = await retain('D11 original retained native task');
  const initial = original([first]);
  await writeFile(path.join(output, 'original-command.json'), JSON.stringify(initial, null, 2));
  record('native offline Create survives cold reload with its complete original command identity');
  if (process.env.FAMILY_TASK_RECOVERY_BEFORE === '1') {
    await expect(page.getByRole('button', { name: 'Check retained task save' })).toBeVisible({ timeout: 3000 });
    throw Error('Before build unexpectedly exposes startup recovery');
  }
  const check = page.getByRole('button', { name: 'Check retained task save' });
  await expect(check).toBeEnabled({ timeout: 30000 });
  assert.equal(executions(), 0);
  await check.click();
  await expect(page.getByText(/original save is still unresolved/)).toBeVisible();
  assert.equal(executions(), 0);
  assert.deepEqual(original(await queue()), initial);
  record('unknown real SQL receipt does not remove intent, execute a command or publish an unconfirmed Trip');
  let lose = true,
    committedBeforeLoss = false;
  await context.route('**' + executePath, async (route) => {
    assert.equal(new URL(route.request().url()).origin, fixture.api);
    if (!lose) {
      await route.continue();
      return;
    }
    lose = false;
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    committedBeforeLoss = true;
    await route.abort('failed'); // Real server commit, deliberately lost acknowledgement; no response is fabricated.
  });
  await page.getByRole('button', { name: 'Retry original task save' }).click();
  await expect.poll(() => committedBeforeLoss, { timeout: 30000 }).toBe(true);
  await expect(page.getByRole('button', { name: 'Check retained task save' })).toBeEnabled({ timeout: 30000 });
  assert.deepEqual(original(await queue()), initial);
  record('actual server commit with a deliberately lost response retains the original durable intent');
  // An explicit repeat through the real application adapter demonstrates SQL idempotency, not a new task.
  const replay = await page.evaluate(async (row) => {
    const r = await globalThis.fetch('/api' + row.url, {
      method: row.method,
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': row.id },
      body: JSON.stringify(row.body),
    });
    return { status: r.status, operation: (await r.json()).operation_id };
  }, first);
  assert.equal(replay.status, 200);
  assert.equal(replay.operation, first.id);
  assert.deepEqual(original(await queue()), initial);
  record('explicit identical application retry returns the original SQL acknowledgement without another task');
  const beforeReceipt = executions();
  await page.getByRole('button', { name: 'Check retained task save' }).click();
  const staleRead = page.getByText('The trip or itinerary layer changed. Reload before retrying.', { exact: true });
  await expect
    .poll(
      async () =>
        (await page.getByRole('button', { name: 'Plan', exact: true }).count()) > 0 || (await staleRead.isVisible())
    )
    .toBe(true);
  if (await staleRead.isVisible()) {
    assert.equal((await queue()).length, 0); // The matching receipt already confirmed this original save.
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    record(
      'concurrent canonical read is held at the real stale-read guard and explicitly retried without replaying the saved task'
    );
  }
  await tripReady();
  await expect.poll(async () => (await queue()).length).toBe(0);
  assert.equal(executions(), beforeReceipt);
  await tasksTab();
  await expect(page.getByText('D11 original retained native task', { exact: true }).first()).toBeVisible();
  record('matching receipt clears only its original intent and opens a fresh canonical native task list');
  await page.screenshot({ path: path.join(output, 'confirmed-task.png'), fullPage: true });
  // Start the independent conflict/authorization case from a fully loaded entry.
  // The immediate second-form/full-load race is recorded separately, not claimed here.
  await reloadEntry();
  await tripReady();
  await page.waitForLoadState('networkidle');
  await tasksTab();
  record(
    'independent conflict scenario begins after a complete online entry; immediate second-form race remains unqualified'
  );
  conflicting = await retain('D11 original conflicting create');
  const other = globalThis.structuredClone(conflicting.body);
  other.command.operation_id = globalThis.crypto.randomUUID();
  other.command.values.name = 'D11 independent canonical task';
  const concurrent = await page.evaluate(async (p) => {
    const r = await globalThis.fetch('/api/trips/' + p.command.scope.trip_id + '/family/tasks/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': p.command.operation_id },
      body: JSON.stringify(p),
    });
    return r.status;
  }, other);
  assert.equal(concurrent, 200);
  await page.getByRole('button', { name: 'Retry original task save' }).click();
  await expect.poll(async () => (await queue())[0]?.status).toBe('conflict');
  assert.deepEqual(original(await queue()), original([conflicting]));
  record('actual SQL target conflict parks the original operation/body without rebasing or overwriting canonical data');
  await page.getByRole('button', { name: 'Inspect retained work' }).click();
  await expect(page.getByRole('button', { name: 'Check retained task save' })).toBeEnabled();
  arrange('suspend');
  membershipSuspended = true;
  const beforeRefusal = executions();
  await page.getByRole('button', { name: 'Check retained task save' }).click();
  await expect
    .poll(() => responses.some((r) => r.path.endsWith('/get_family_trip_task_receipt_v1') && r.status === 403))
    .toBe(true);
  assert.deepEqual(original(await queue()), original([conflicting]));
  assert.equal(executions(), beforeRefusal);
  record('actual suspended original membership is refused by the receipt RPC with zero execution attempts');
  arrange('restore');
  membershipSuspended = false;
  const future = (await queue())[0];
  future.schemaVersion += 1;
  future.future = { preserve: 'D11 unknown field' };
  await rewrite(future);
  await reloadEntry();
  await expect(page.getByText(/This work cannot be retried here/)).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Retry original task save' })).toHaveCount(0);
  const beforeExport = original(await queue()),
    downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export.*retained/i }).click();
  const download = await downloadPromise,
    exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(exported.format, 'family.retained-work.v1');
  assert.equal(exported.automatic_replay, false);
  assert.deepEqual(exported.rows, [future]);
  assert.deepEqual(original(await queue()), beforeExport);
  record('newer queue format and unknown fields remain losslessly exportable with no retry or deletion');
  await page.screenshot({ path: path.join(output, 'unsupported-export.png'), fullPage: true });
  await logout();
  await login(fixture.outsider);
  await expect(page.getByRole('region', { name: 'Retained task recovery' })).toHaveCount(0);
  assert.deepEqual(original(await queue()), beforeExport);
  record('another real account cannot borrow the original task recovery, export or queue');
  assert.equal(
    events.some((e) => e.path.includes('/render/image/')),
    false
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(caught, []);
  record('no transformations, generic error boundaries or uncaught page errors');
  await writeFile(
    path.join(output, 'operation-proof.json'),
    JSON.stringify(
      {
        original: first.id,
        target: first.body.command.target_id,
        conflicting: conflicting.id,
        conflict_target: conflicting.body.command.target_id,
        concurrent: other.command.operation_id,
        execution_attempts: executions(),
      },
      null,
      2
    )
  );
} catch (e) {
  const diagnostic = await page.evaluate(() => ({
    pathname: globalThis.location.pathname,
    ready: globalThis.document.readyState,
    text: globalThis.document.body.innerText.slice(0, 500),
    rootChildren: globalThis.document.getElementById('root')?.childElementCount,
    online: globalThis.navigator.onLine,
    worker: globalThis.navigator.serviceWorker.controller?.state,
  }));
  await writeFile(
    path.join(output, 'failure-diagnostics.json'),
    JSON.stringify({ ...diagnostic, moduleErrors, resourceFailures }, null, 2)
  );
  await writeFile(path.join(output, 'failure.json'), JSON.stringify({ message: e.message, stack: e.stack }, null, 2));
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
  throw e;
} finally {
  if (membershipSuspended) arrange('restore');
  await writeFile(
    path.join(output, 'recovery-checks.json'),
    JSON.stringify(
      {
        profile,
        checks,
        errors,
        caught,
        events,
        responses,
        proxy: proxy.events,
        build_sha256: createHash('sha256')
          .update(await readFile(path.join(dist, '..', 'actual-build.json')))
          .digest('hex'),
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
