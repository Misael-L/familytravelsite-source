/* global indexedDB, File, createImageBitmap, variantModule, api, current, descriptor, generation, fetchCount, entered, held, release, pending, caches */
// Local primitive acceptance; not an App/SDK/RLS or native map/gallery acceptance.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
assert.equal(root, '/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.2/client');
const out = process.env.PUBLIC_VARIANT_OUTPUT;
assert.match(out ?? '', /^\/private\/tmp\/trek-u03d16f-[^/]+$/);
await mkdir(out, { recursive: false, mode: 0o700 });
const require = createRequire(path.join(root, 'package.json')),
  { chromium } = require('playwright');
const { build } = await import(require.resolve('vite'));
const built = await build({
  configFile: false,
  root,
  envDir: out,
  envPrefix: 'QUALIFICATION_UNUSED_',
  build: {
    outDir: path.join(out, 'consumer'),
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: path.join(root, 'tests/browser/family-offline-lifecycle/variant-byte-driver.mjs'),
      formats: ['es'],
      fileName: () => 'module.js',
    },
  },
});
const chunks = (Array.isArray(built) ? built : [built]).flatMap((value) => value.output ?? []);
const modules = Object.keys(chunks.find((value) => value.type === 'chunk' && value.isEntry).modules);
assert.equal(modules.length, 2);
assert.ok(modules.some((name) => name.endsWith('/publicVariantCache.ts')));
assert.ok(!modules.some((name) => /App|Auth|SDK|dexie|mutationQueue/.test(name)));
const code = await readFile(path.join(out, 'consumer/module.js'));
await writeFile(
  path.join(out, 'consumer-build.json'),
  JSON.stringify(
    {
      modules,
      sha256: createHash('sha256').update(code).digest('hex'),
      source_sha256: createHash('sha256')
        .update(await readFile(path.join(root, 'src/integrations/family/publicVariantCache.ts')))
        .digest('hex'),
      product_entry: false,
    },
    null,
    2
  )
);
const fixture = JSON.parse(
  await readFile(path.join(root, 'tests/browser/family-offline-lifecycle/variant-fixture.json'), 'utf8')
);
const image = Buffer.from(fixture.base64, 'base64'),
  expectedDigest = createHash('sha256').update(image).digest('hex');
const server = http.createServer((req, res) => {
  if (req.url === '/module.js') {
    res.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' });
    res.end(code);
  } else if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(
      '<!doctype html><title>Local public byte proof</title><script type="module">import * as module from "/module.js";globalThis.variantModule=module;</script>'
    );
  } else {
    res.writeHead(204);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const source = 'http://127.0.0.1:55331',
  alias = 'http://localhost:55331';
const all = [];
try {
  for (const profile of ['desktop', 'phone']) {
    const events = [],
      errors = [],
      denied = [],
      checks = [];
    const record = (name) => {
      checks.push({ name, passed: true });
      process.stdout.write(profile + ': ' + name + '\n');
    };
    const options = {
      headless: true,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      serviceWorkers: 'block',
      viewport: profile === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      isMobile: profile === 'phone',
      hasTouch: profile === 'phone',
    };
    const directory = path.join(out, profile + '-private-profile');
    let context = await chromium.launchPersistentContext(directory, options);
    const configure = async () => {
      context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
      await context.route('**/*', async (route) => {
        const u = new URL(route.request().url());
        events.push({ origin: u.origin, path: u.pathname, method: route.request().method() });
        if (u.pathname.includes('/render/image/')) {
          denied.push('transformation');
          return route.abort();
        }
        if (u.origin === origin) return route.continue();
        if (
          [source, alias].includes(u.origin) &&
          u.pathname.startsWith('/storage/v1/object/public/catalog/variants/v1/')
        ) {
          const bad = u.pathname.endsWith('/bad.webp');
          return route.fulfill({
            status: 200,
            headers: {
              'content-type': bad ? 'text/html' : 'image/webp',
              'access-control-allow-origin': '*',
              'cache-control': 'no-store',
            },
            body: bad ? Buffer.from('<html>not an image</html>') : image,
          });
        }
        denied.push(u.origin + u.pathname);
        return route.abort();
      });
    };
    const open = async () => {
      const page = await context.newPage();
      await page.goto(origin);
      await page.waitForFunction(() => !!globalThis.variantModule);
      return page;
    };
    await configure();
    let page = await open();
    try {
      const originals = await page.evaluate(async () => {
        const owner = {
          format: 'family.native-owner.v1',
          source: 'http://127.0.0.1:55331',
          user_id: 'a16f1100-0000-4000-8000-000000000001',
          family_id: 'a16f1100-0000-4000-8000-000000000002',
          person_id: 'a16f1100-0000-4000-8000-000000000003',
          native_user: 777,
        };
        const hash = Array.from(
          new Uint8Array(
            await globalThis.crypto.subtle.digest('SHA-256', new globalThis.TextEncoder().encode(JSON.stringify(owner)))
          ),
          (byte) => byte.toString(16).padStart(2, '0')
        ).join('');
        const names = ['trek-offline-u777', 'trek-offline-f1-' + hash + '-u777'];
        for (const name of names)
          await new Promise((resolve, reject) => {
            const request = indexedDB.open(name, 140);
            request.onupgradeneeded = () => {
              const db = request.result;
              db.createObjectStore('mutationQueue', { keyPath: 'id' }).put({
                id: 'opaque',
                method: 'POST',
                status: 'pending',
                schemaVersion: 999,
                attempts: 7,
                body: { originalRevision: 'unchanged' },
              });
              db.createObjectStore('importFiles', { keyPath: ['jobId', 'name'] }).put({
                jobId: 'original',
                name: 'same.bin',
                blob: new File([new Uint8Array([0, 255, 1, 2])], 'kept.bin', {
                  type: 'application/octet-stream',
                  lastModified: 17,
                }),
              });
              const sync = db.createObjectStore('syncMeta', { keyPath: 'tripId' });
              if (name !== names[0])
                sync.put({
                  tripId: 0,
                  lastSyncedAt: null,
                  status: 'idle',
                  tilesBbox: null,
                  filesCachedCount: 0,
                  sourceOwner: owner,
                });
              db.createObjectStore('completeHeads', { keyPath: 'id' }).put({
                id: 'published',
                generation: 'original',
                expiresAt: 900001,
              });
              db.createObjectStore('completeSnapshots', { keyPath: 'id' }).put({
                id: 'original',
                capabilities: { mediaBytes: false },
                media: [{ bytesAvailable: false }],
              });
              db.createObjectStore('tripFiles', { keyPath: 'id' }).put({ id: 3, url: '/api/family/files/3/open' });
            };
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              request.result.close();
              resolve();
            };
          });
        globalThis.originalNames = names;
        return names;
      });
      const snapshot = async () =>
        page.evaluate(async (names) => {
          const encode = async (value) => {
            if (value instanceof globalThis.Blob)
              return {
                bytes: [...new Uint8Array(await value.arrayBuffer())],
                type: value.type,
                size: value.size,
                ...(value instanceof File ? { name: value.name, lastModified: value.lastModified } : {}),
              };
            if (Array.isArray(value)) return Promise.all(value.map(encode));
            if (value && typeof value === 'object')
              return Object.fromEntries(
                await Promise.all(Object.entries(value).map(async ([key, entry]) => [key, await encode(entry)]))
              );
            return value;
          };
          const result = {};
          for (const name of names) {
            const db = await new Promise((resolve, reject) => {
              const request = indexedDB.open(name);
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            const stores = [...db.objectStoreNames],
              tx = db.transaction(stores, 'readonly');
            const read = (request) =>
              new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              });
            result[name] = {
              version: db.version,
              stores: Object.fromEntries(
                await Promise.all(
                  stores.map(async (key) => [
                    key,
                    {
                      keys: await read(tx.objectStore(key).getAllKeys()),
                      values: await read(tx.objectStore(key).getAll()),
                    },
                  ])
                )
              ),
            };
            db.close();
          }
          return encode(result);
        }, originals);
      const before = await snapshot();
      const init = async (target = page) =>
        target.evaluate(
          ({ source }) => {
            globalThis.generation = 1;
            globalThis.fetchCount = 0;
            globalThis.descriptor = (name) => ({
              source,
              mediaAssetId: 'a16f1100-0000-4000-8000-000000000004',
              recipe: 'v1',
              role: 'thumb',
              url: source + '/storage/v1/object/public/catalog/variants/v1/' + name,
            });
            globalThis.api = variantModule.createPublicVariantCache({
              source,
              network: (...args) => {
                globalThis.fetchCount++;
                return globalThis.fetch(...args);
              },
            });
            globalThis.current = () => true;
          },
          { source }
        );
      await init();
      const ready = await page.evaluate(async () => {
        const value = await api.capture(descriptor('thumb.webp'), { current });
        globalThis.originalReceipt = value.receipt;
        const decoded = await createImageBitmap(value.blob);
        const result = { receipt: value.receipt, width: decoded.width, height: decoded.height, fetches: fetchCount };
        decoded.close();
        return result;
      });
      assert.equal(ready.receipt.sha256, expectedDigest);
      assert.equal(ready.receipt.bytes, image.length);
      assert.deepEqual([ready.width, ready.height], [2, 3]);
      assert.equal(ready.fetches, 1);
      record('real CacheStorage capture persists exact synthetic WebP bytes with digest and actual 2×3 decode');
      await page.close();
      await context.close();
      context = await chromium.launchPersistentContext(directory, options);
      await configure();
      page = await open();
      await init();
      await context.setOffline(true);
      const offline = await page.evaluate(async () => {
        const value = await api.read(descriptor('thumb.webp'), { current });
        if (value.status !== 'ready') throw Error('missing persisted byte');
        const bitmap = await createImageBitmap(value.blob),
          dimensions = [bitmap.width, bitmap.height];
        bitmap.close();
        const hit = await api.capture(descriptor('thumb.webp'), { current });
        return {
          receipt: value.receipt,
          dimensions,
          fetches: fetchCount,
          same: hit.receipt.writeId === value.receipt.writeId,
        };
      });
      assert.deepEqual(offline.receipt, ready.receipt);
      assert.deepEqual(offline.dimensions, [2, 3]);
      assert.equal(offline.fetches, 0);
      assert.equal(offline.same, true);
      record(
        'browser-profile restart plus disconnected network reopens the same verified bytes without fetch, renewal or fabricated Trip readiness'
      );
      await context.setOffline(false);
      const negatives = await page.evaluate(
        async ({ alias }) => {
          const results = [];
          for (const url of [
            descriptor('thumb.webp').url + '?token=forbidden',
            descriptor('../escape.webp').url,
            descriptor('x.webp').url.replace('/object/public/', '/render/image/public/'),
            'https://example.invalid/x.webp',
          ]) {
            try {
              await api.capture({ ...descriptor('thumb.webp'), url }, { current });
              results.push('bad');
            } catch (error) {
              results.push(error.code);
            }
          }
          const alternate = variantModule.createPublicVariantCache({ source: alias });
          const absent = await alternate.read(
            {
              ...descriptor('thumb.webp'),
              source: alias,
              url: descriptor('thumb.webp').url.replace('http://127.0.0.1:55331', alias),
            },
            { current }
          );
          try {
            await api.capture(descriptor('bad.webp'), { current });
            results.push('bad');
          } catch (error) {
            results.push(error.code);
          }
          return { results, absent, fetches: fetchCount };
        },
        { alias }
      );
      assert.deepEqual(negatives.results, ['descriptor', 'descriptor', 'descriptor', 'descriptor', 'response']);
      assert.equal(negatives.absent.status, 'miss');
      assert.equal(negatives.fetches, 1);
      record(
        'invalid URLs refuse before fetch; source alias misses; a genuine HTML response cannot become a ready image'
      );
      const other = await open();
      await init(other);
      await page.evaluate(() => {
        globalThis.held = new Promise((resolve) => {
          globalThis.release = resolve;
        });
        globalThis.entered = false;
        const epoch = generation;
        const old = variantModule.createPublicVariantCache({
          source: descriptor('x.webp').source,
          network: async (...args) => {
            const response = await globalThis.fetch(...args);
            globalThis.entered = true;
            await held;
            return response;
          },
        });
        globalThis.pending = old.capture(descriptor('race.webp'), { current: () => generation === epoch }).then(
          () => 'bad',
          (error) => error.code
        );
      });
      await page.waitForFunction(() => entered);
      await other.evaluate(() => {
        globalThis.pending = api
          .capture(descriptor('race.webp'), { current })
          .then((value) => ({ status: value.status, digest: value.receipt.sha256 }));
      });
      await page.evaluate(() => {
        globalThis.generation++;
        globalThis.generation++;
        release();
      });
      assert.equal(await page.evaluate(() => pending), 'cancelled');
      assert.deepEqual(await other.evaluate(() => pending), { status: 'ready', digest: expectedDigest });
      await other.close();
      record(
        'real cross-tab Web Lock serializes writers; a retired A→B→A operation cannot overwrite or remove its replacement'
      );
      const quota = await page.evaluate(async () => {
        const source = descriptor('x.webp').source;
        const storage = {
          open: async (name) => {
            const cache = await caches.open(name);
            return {
              match: cache.match.bind(cache),
              keys: cache.keys.bind(cache),
              delete: cache.delete.bind(cache),
              put: async () => {
                throw new globalThis.DOMException('test storage quota', 'QuotaExceededError');
              },
            };
          },
          has: caches.has.bind(caches),
          delete: caches.delete.bind(caches),
        };
        const limited = variantModule.createPublicVariantCache({ source, storage: () => storage });
        let code;
        try {
          await limited.capture(descriptor('quota.webp'), { current });
        } catch (error) {
          code = error.code;
        }
        const absent = await api.read(descriptor('quota.webp'), { current });
        const retained = await api.read(descriptor('thumb.webp'), { current });
        return { code, absent: absent.status, retained: retained.status };
      });
      assert.deepEqual(quota, { code: 'failure', absent: 'miss', retained: 'ready' });
      record(
        'injected put quota failure over real storage returns no ready receipt and preserves the earlier valid image'
      );
      assert.deepEqual(await snapshot(), before);
      const serialized = await page.evaluate(async () => {
        const result = [];
        for (const name of (await caches.keys()).filter((name) => name.startsWith('family-public-variants.v1:'))) {
          const cache = await caches.open(name);
          for (const request of await cache.keys()) {
            const response = await cache.match(request);
            result.push(response.headers.get('x-family-public-variant'));
          }
        }
        return result.join('\n');
      });
      assert.ok(!/family_id|user_id|person_id|native_user|tripId|object\/sign|\/api\/family\/files/.test(serialized));
      assert.deepEqual(errors, []);
      assert.deepEqual(denied, []);
      assert.ok(
        !events.some((event) => /render\/image|object\/sign|execute_family_|\/api\/family\/files/.test(event.path))
      );
      record(
        'all synthetic original keys/opaque commands/File metadata/bytes/owner/complete/private-file fixtures remain exact; no private identity or signing/transform/domain request enters the public cache'
      );
      const receipt = {
        profile,
        checks,
        actual_exit: 0,
        errors,
        denied,
        requests: events,
        digest: expectedDigest,
        bytes: image.length,
        primitive_only: true,
        synthetic_server_response_not_bucket_rls: true,
        native_fixtures_are_preservation_only_not_bootstrap_authority: true,
        physical_quota_exhaustion: false,
      };
      await writeFile(path.join(out, profile + '.json'), JSON.stringify(receipt, null, 2));
      all.push(receipt);
    } finally {
      await context.close();
    }
  }
  await writeFile(
    path.join(out, 'result.json'),
    JSON.stringify(
      {
        profiles: all.map((value) => ({ profile: value.profile, checks: value.checks.length })),
        checks: all.reduce((count, value) => count + value.checks.length, 0),
        actual_exit: 0,
        product_integrated: false,
      },
      null,
      2
    )
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
