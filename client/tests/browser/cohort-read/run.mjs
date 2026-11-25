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
const output = process.env.P04AR_OUTPUT || (await mkdtemp(path.join(os.tmpdir(), 'p04ar-browser-')));
await mkdir(output, { recursive: true });
const before = process.env.P04AR_BEFORE;
const previousSource = before ? await readFile(path.join(before, 'client/src/sync/mutationQueue.ts'), 'utf8') : null;
const server = await createServer({
  configFile: false,
  root,
  envDir: output,
  cacheDir: path.join(output, 'vite-cache'),
  define: { __TREK_UI_VERSION__: JSON.stringify('5.0.1-local-fixture') },
  optimizeDeps: {
    entries: ['tests/browser/cohort-read/index.html'],
    noDiscovery: true,
    include: [
      'dexie',
      'axios',
      'zod',
      'zustand',
      'react',
      'use-sync-external-store/shim/with-selector.js',
      'zustand/traditional',
    ],
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
  const base = `http://127.0.0.1:${server.httpServer.address().port}/tests/browser/cohort-read/index.html`;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.P04AR_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
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
        method: request.method(),
        body: request.postDataJSON(),
        key: request.headers()['x-idempotency-key'],
        base: request.headers()['x-base-updated-at'],
      });
      if (holdRequest && request.method() === 'GET')
        await new Promise((done) => {
          release = done;
        });
      await route.fulfill({ json: { revision: 2, ok: true } });
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
  async function readDone(page) {
    await page.waitForFunction(() => globalThis.fixture.readDone);
  }
  await scenario(
    'parked work refuses a scoped read before HTTP or cache replacement',
    async ({ a, b, base, calls }) => {
      await open(a, base);
      await open(b, base);
      await a.evaluate(() => globalThis.fixture.seedCache());
      const before = await a.evaluate(() => globalThis.fixture.cacheRows()),
        row = await b.evaluate(() => globalThis.fixture.seed({ status: 'conflict' }));
      await a.evaluate(() => globalThis.fixture.startRead());
      await readDone(a);
      assert.equal(await a.evaluate(() => globalThis.fixture.readError), 'Local work held');
      assert.equal(calls.length, 0);
      assert.deepEqual(await a.evaluate(() => globalThis.fixture.cacheRows()), before);
      assert.deepEqual((await b.evaluate(() => globalThis.fixture.rows()))[0], row);
    }
  );
  await scenario(
    'another tab’s enqueue during HTTP preserves the original scoped snapshot and visible view',
    async ({ a, b, base, calls, hold, unhold }) => {
      await open(a, base);
      await open(b, base);
      await a.evaluate(() => globalThis.fixture.seedCache());
      const before = await a.evaluate(() => globalThis.fixture.cacheRows());
      hold();
      await a.evaluate(() => globalThis.fixture.startRead());
      await expect.poll(() => calls.length).toBe(1);
      const row = await b.evaluate(() => globalThis.fixture.seed());
      unhold();
      await readDone(a);
      assert.equal(await a.evaluate(() => globalThis.fixture.readError), 'Local work held');
      assert.equal(await a.evaluate(() => globalThis.fixture.visible), 1);
      assert.deepEqual(await a.evaluate(() => globalThis.fixture.cacheRows()), before);
      assert.deepEqual((await b.evaluate(() => globalThis.fixture.rows()))[0], row);
    }
  );
  await scenario(
    'a newer scoped snapshot in another tab is not overwritten',
    async ({ a, b, base, calls, hold, unhold }) => {
      await open(a, base);
      await open(b, base);
      await a.evaluate(() => globalThis.fixture.seedCache());
      hold();
      await a.evaluate(() => globalThis.fixture.startRead());
      await expect.poll(() => calls.length).toBe(1);
      await b.evaluate(() => globalThis.fixture.seedCache(3));
      const newer = await b.evaluate(() => globalThis.fixture.cacheRows());
      unhold();
      await readDone(a);
      assert.equal(await a.evaluate(() => globalThis.fixture.readError), 'Local work held');
      assert.deepEqual(await a.evaluate(() => globalThis.fixture.cacheRows()), newer);
    }
  );
  await scenario(
    'the native queue writer waits until the short separate-database cache commit completes',
    async ({ a, b, base }) => {
      await open(a, base);
      await open(b, base);
      await a.evaluate(() => {
        globalThis.fixture.holdCache();
        globalThis.fixture.startRead();
      });
      await a.waitForFunction(() => globalThis.fixture.cacheEntered);
      await b.evaluate(() => globalThis.fixture.queueAsync());
      await b.waitForTimeout(35);
      assert.equal(await b.evaluate(() => globalThis.fixture.queueDone), false);
      await a.evaluate(() => globalThis.fixture.releaseCache());
      await b.waitForFunction(() => globalThis.fixture.queueDone);
      await readDone(a);
      const rows = await b.evaluate(() => globalThis.fixture.rows()),
        original = await b.evaluate(() => globalThis.fixture.queuedOriginal);
      assert.deepEqual(rows, [original]);
      assert.equal((await a.evaluate(() => globalThis.fixture.cacheRows()))[0].value.view.state.trip_revision, 2);
    }
  );
  await scenario(
    'a nested read lease does not deadlock behind a waiting exclusive replay',
    async ({ a, b, base, calls, hold, unhold }) => {
      await open(a, base);
      await open(b, base);
      hold();
      await a.evaluate(() => globalThis.fixture.startRead());
      await expect.poll(() => calls.length).toBe(1);
      await b.evaluate(() => globalThis.fixture.start());
      await b.waitForFunction(() => globalThis.navigator.locks.query().then((q) => q.pending.length === 1));
      unhold();
      await readDone(a);
      await done(b);
      assert.equal(await a.evaluate(() => globalThis.fixture.readError), null);
      assert.equal(await a.evaluate(() => globalThis.fixture.visible), 2);
    }
  );
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
