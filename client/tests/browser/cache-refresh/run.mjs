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
const output = process.env.P04AQ_OUTPUT || (await mkdtemp(path.join(os.tmpdir(), 'p04aq-browser-')));
await mkdir(output, { recursive: true });
const before = process.env.P04AQ_BEFORE;
const previousSource = before ? await readFile(path.join(before, 'client/src/sync/mutationQueue.ts'), 'utf8') : null;
const server = await createServer({
  configFile: false,
  root,
  envDir: output,
  cacheDir: path.join(output, 'vite-cache'),
  define: { __TREK_UI_VERSION__: JSON.stringify('5.0.1-local-fixture') },
  optimizeDeps: {
    entries: ['tests/browser/cache-refresh/index.html'],
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
  const base = `http://127.0.0.1:${server.httpServer.address().port}/tests/browser/cache-refresh/index.html`;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.P04AQ_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
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
      await route.fulfill({
        json:
          request.method() === 'GET'
            ? {
                places: [
                  {
                    id: url.pathname.includes('/2/') ? 20 : 10,
                    trip_id: url.pathname.includes('/2/') ? 2 : 1,
                    name: 'Canonical server',
                  },
                ],
              }
            : { ok: true },
      });
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
    assert.equal(await page.evaluate(() => globalThis.fixture.readError), null);
  }
  const local = { id: 10, trip_id: 1, name: 'Local browser edit' };
  await scenario('parked work retains its cache while an unrelated trip refreshes', async ({ a, b, base, calls }) => {
    await open(a, base);
    await open(b, base);
    await a.evaluate((row) => globalThis.fixture.cachePlaces([row]), local);
    const original = await a.evaluate(() => globalThis.fixture.seed({ status: 'conflict' }));
    await b.evaluate(() => globalThis.fixture.read());
    await readDone(b);
    assert.deepEqual(await b.evaluate(() => globalThis.fixture.readValue), { places: [local] });
    assert.equal(calls.length, 0);
    await b.evaluate(() => globalThis.fixture.read(2));
    await readDone(b);
    assert.equal(calls.length, 1);
    assert.equal(await b.evaluate(() => globalThis.fixture.readValue.places[0].trip_id), 2);
    assert.deepEqual((await b.evaluate(() => globalThis.fixture.rows()))[0], original);
  });
  await scenario(
    'an edit in another tab survives an in-flight read and flush waits for its lock',
    async ({ a, b, base, calls, hold, unhold }) => {
      await open(a, base);
      await open(b, base);
      hold();
      await a.evaluate(() => globalThis.fixture.read());
      await expect.poll(() => calls.length).toBe(1);
      await b.evaluate((row) => globalThis.fixture.cachePlaces([row]), local);
      const original = await b.evaluate(() => globalThis.fixture.seed());
      await b.evaluate(() => globalThis.fixture.start());
      await b.waitForFunction(() => globalThis.navigator.locks.query().then((q) => q.pending.length === 1));
      assert.deepEqual((await b.evaluate(() => globalThis.fixture.rows()))[0], original);
      assert.equal(calls.length, 1);
      unhold();
      await readDone(a);
      await done(b);
      assert.deepEqual(await a.evaluate(() => globalThis.fixture.readValue), { places: [local] });
      assert.deepEqual(await b.evaluate(() => globalThis.fixture.places()), [local]);
      assert.equal(calls.filter((c) => c.method === 'POST').length, 1);
      assert.equal(calls[1].key, original.id);
    }
  );
  await scenario(
    'a local deletion before enqueue is not resurrected by the delayed response',
    async ({ a, b, base, calls, hold, unhold }) => {
      await open(a, base);
      await open(b, base);
      await a.evaluate((row) => globalThis.fixture.cachePlaces([row]), local);
      hold();
      await a.evaluate(() => globalThis.fixture.read());
      await expect.poll(() => calls.length).toBe(1);
      await b.evaluate(() => globalThis.fixture.cachePlaces([]));
      unhold();
      await readDone(a);
      assert.deepEqual(await a.evaluate(() => globalThis.fixture.readValue), { places: [] });
      assert.deepEqual(await b.evaluate(() => globalThis.fixture.places()), []);
    }
  );
  await scenario(
    'a queued command without a cache change still holds the stale read',
    async ({ a, b, base, calls, hold, unhold }) => {
      await open(a, base);
      await open(b, base);
      hold();
      await a.evaluate(() => globalThis.fixture.read());
      await expect.poll(() => calls.length).toBe(1);
      const original = await b.evaluate(() => globalThis.fixture.seed({ schemaVersion: 100 }));
      unhold();
      await readDone(a);
      assert.deepEqual(await a.evaluate(() => globalThis.fixture.readValue), { places: [] });
      assert.deepEqual((await b.evaluate(() => globalThis.fixture.rows()))[0], original);
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
