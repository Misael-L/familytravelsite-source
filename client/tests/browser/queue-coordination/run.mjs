// Explicit local-only browser proof. No production tokens, account session or app server are used.
import assert from 'node:assert/strict';
import { log } from 'node:console';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const { chromium } = require('playwright');
const { expect } = require('@playwright/test');
const { createServer } = await import(require.resolve('vite'));
const root = fileURLToPath(new URL('../../..', import.meta.url));
const output = process.env.P04AP_OUTPUT || (await mkdtemp(path.join(os.tmpdir(), 'p04ap-browser-')));
await mkdir(output, { recursive: true });
const before = process.env.P04AP_BEFORE;
const previousSource = before ? await readFile(path.join(before, 'client/src/sync/mutationQueue.ts'), 'utf8') : null;
const server = await createServer({
  configFile: false,
  root,
  envDir: output,
  cacheDir: path.join(output, 'vite-cache'),
  define: { __TREK_UI_VERSION__: JSON.stringify('5.0.1-local-fixture') },
  optimizeDeps: {
    entries: ['tests/browser/queue-coordination/index.html'],
    noDiscovery: true,
    include: ['dexie', 'axios', 'zod', 'zustand', 'react'],
  },
  plugins: [
    {
      name: 'previous-queue-module-fixture',
      enforce: 'pre',
      load(id) {
        if (id.endsWith('mutationQueue.ts?p04ap-previous')) return previousSource;
      },
    },
  ],
  server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [path.resolve(root, '..')] } },
});
let browser;
const results = [],
  blocked = [];
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}/tests/browser/queue-coordination/index.html`;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.P04AP_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  async function scenario(name, run) {
    const context = await browser.newContext();
    const calls = [],
      errors = [];
    let release = () => {},
      holdRequest = false;
    await context.route('**/*', async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.hostname !== '127.0.0.1') {
        blocked.push(request.url());
        await route.abort();
        return;
      }
      if (!url.pathname.startsWith('/api/')) {
        await route.continue();
        return;
      }
      calls.push({
        body: request.postDataJSON(),
        key: request.headers()['x-idempotency-key'],
        base: request.headers()['x-base-updated-at'],
      });
      if (holdRequest)
        await new Promise((done) => {
          release = done;
        });
      await route.fulfill({ json: { ok: true } });
    });
    const a = await context.newPage(),
      b = await context.newPage();
    for (const page of [a, b]) page.on('pageerror', (error) => errors.push(error.message));
    try {
      await run({
        a,
        b,
        calls,
        base,
        release: () => release(),
        hold: () => {
          holdRequest = true;
        },
        unhold: () => {
          holdRequest = false;
          release();
        },
      });
      assert.deepEqual(errors, []);
      results.push({ name, passed: true });
    } finally {
      release();
      await context.close();
    }
  }
  async function open(page, url) {
    await page.goto(url);
    await page.waitForFunction(() => globalThis.fixture?.ready);
  }
  async function done(page) {
    await page.waitForFunction(() => globalThis.fixture.done);
    assert.equal(await page.evaluate(() => globalThis.fixture.error), null);
  }
  async function serialize({ a, b, calls, base, hold, unhold }, previous = false) {
    await open(a, base + (previous ? '?previous' : ''));
    await open(b, base);
    const row = await a.evaluate(() => globalThis.fixture.seed());
    hold();
    await a.evaluate(() => globalThis.fixture.start());
    await b.waitForFunction(() => globalThis.navigator.locks.query().then((q) => q.held.length === 1));
    await b.evaluate(() => globalThis.fixture.start());
    await b.waitForFunction(() => globalThis.navigator.locks.query().then((q) => q.pending.length === 1));
    await expect.poll(() => calls.length).toBe(1);
    unhold();
    await done(a);
    await done(b);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { body: row.body, key: row.id, base: row.baseUpdatedAt });
    await b.waitForFunction(() => globalThis.fixture.status?.pending === 0);
    assert.deepEqual(await b.evaluate(() => globalThis.fixture.rows()), []);
  }
  await scenario('two current tabs serialize one original command', serialize);
  if (previousSource)
    await scenario('immediately previous queue module cooperates with current lock name', (args) =>
      serialize(args, true)
    );
  await scenario('a cancelled lock wait cannot block another account database', async ({ a, b, calls, base }) => {
    await open(a, base);
    await open(b, base);
    const original = await a.evaluate(() => globalThis.fixture.seed());
    await a.evaluate(() => globalThis.fixture.hold());
    await b.evaluate(() => globalThis.fixture.start());
    await b.waitForFunction(() => globalThis.navigator.locks.query().then((q) => q.pending.length === 1));
    await b.evaluate(() => globalThis.fixture.select('p04ap-browser-B'));
    await done(b);
    await b.evaluate(() => globalThis.fixture.seed());
    await b.evaluate(() => globalThis.fixture.start());
    await done(b);
    assert.equal(calls.length, 1);
    assert.deepEqual((await a.evaluate(() => globalThis.fixture.rows()))[0], original);
    await a.evaluate(() => globalThis.fixture.release());
  });
  await scenario('another tab’s offline switch cancels the waiting replay', async ({ a, b, calls, base }) => {
    await open(a, base);
    await open(b, base);
    const original = await a.evaluate(() => globalThis.fixture.seed());
    await a.evaluate(() => globalThis.fixture.hold());
    await b.evaluate(() => globalThis.fixture.start());
    await b.waitForFunction(() => globalThis.navigator.locks.query().then((q) => q.pending.length === 1));
    await a.evaluate(() => globalThis.fixture.force(true));
    await b.waitForFunction(() => globalThis.fixture.forced() && globalThis.fixture.done);
    assert.equal(calls.length, 0);
    assert.deepEqual((await b.evaluate(() => globalThis.fixture.rows()))[0], original);
    await a.evaluate(() => {
      globalThis.fixture.release();
      globalThis.fixture.force(false);
    });
    await b.waitForFunction(() => !globalThis.fixture.forced());
    await b.evaluate(() => globalThis.fixture.start());
    await done(b);
    assert.equal(calls.length, 1);
  });
  await scenario(
    'parked work appears in the other tab’s live status without refresh',
    async ({ a, b, base, calls }) => {
      await open(a, base);
      await open(b, base);
      await a.evaluate(() =>
        globalThis.fixture.seed({ url: '/trips/1/places/42', body: { name: 'Raw original from another tab' } })
      );
      await a.evaluate(() => globalThis.fixture.start());
      await done(a);
      await b.waitForFunction(
        () => globalThis.fixture.status?.conflicts[0]?.body.name === 'Raw original from another tab'
      );
      assert.equal(calls.length, 0);
    }
  );
  await scenario('reload and both queue modules preserve a future record exactly', async ({ a, b, base, calls }) => {
    await open(a, base);
    await open(b, base + (previousSource ? '?previous' : ''));
    const original = await a.evaluate(() =>
      globalThis.fixture.seed({
        schemaVersion: 999,
        status: 'syncing',
        syncingSince: 1,
        future: { preserve: ['opaque'] },
      })
    );
    await a.reload();
    await a.waitForFunction(() => globalThis.fixture?.ready);
    await a.evaluate(() => globalThis.fixture.start());
    await done(a);
    await b.evaluate(() => globalThis.fixture.start());
    await done(b);
    assert.equal(calls.length, 0);
    assert.deepEqual((await a.evaluate(() => globalThis.fixture.rows()))[0], original);
  });
  assert.deepEqual(blocked, []);
  await writeFile(
    path.join(output, 'browser-checks.json'),
    JSON.stringify(
      {
        passed: true,
        browser: await browser.version(),
        cases: results,
        external_requests: blocked,
        production_changed: false,
        previous_module: Boolean(previousSource),
      },
      null,
      2
    )
  );
  log(JSON.stringify({ passed: true, cases: results.length, receipt: path.join(output, 'browser-checks.json') }));
} finally {
  await browser?.close();
  await server.close();
}
