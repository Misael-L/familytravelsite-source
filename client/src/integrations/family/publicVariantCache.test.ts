import { Blob as NativeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../tests/browser/family-offline-lifecycle/variant-fixture.json';
import { createPublicVariantCache, PUBLIC_VARIANT_LIMITS, type PublicVariantDescriptor } from './publicVariantCache';

const source = 'http://127.0.0.1:55331',
  base = source + '/storage/v1/object/public/catalog/variants/v1/';
const bytes = Uint8Array.from(atob(fixture.base64), (ch) => ch.charCodeAt(0));
const context = { current: () => true };
const desc = (name = 'thumb-a.webp'): PublicVariantDescriptor => ({
  source,
  mediaAssetId: 'a16f1100-0000-4000-8000-000000000001',
  recipe: 'v1',
  role: 'thumb',
  url: base + name,
});
const response = (value: BodyInit = bytes, headers: HeadersInit = { 'content-type': 'image/webp' }) =>
  new Response(value, { headers });
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function required<T>(value: T | null | undefined): T {
  if (value == null) throw Error('Expected test fixture value');
  return value;
}
function setup(options: Partial<Parameters<typeof createPublicVariantCache>[0]> = {}) {
  const namespaces = new Map<string, Map<string, Response>>();
  const rows = (name: string) => {
    if (!namespaces.has(name)) namespaces.set(name, new Map());
    return required(namespaces.get(name));
  };
  const cacheFor = (name: string) => ({
    match: vi.fn(async (key: RequestInfo) =>
      rows(name)
        .get(typeof key === 'string' ? key : key instanceof URL ? key.href : key.url)
        ?.clone()
    ),
    put: vi.fn(async (key: RequestInfo, value: Response) => {
      rows(name).set(typeof key === 'string' ? key : key instanceof URL ? key.href : key.url, value.clone());
    }),
    delete: vi.fn(async (key: RequestInfo) =>
      rows(name).delete(typeof key === 'string' ? key : key instanceof URL ? key.href : key.url)
    ),
    keys: vi.fn(async () => [...rows(name).keys()].map((url) => new Request(url))),
  });
  const caches = new Map<string, ReturnType<typeof cacheFor>>();
  const storage = {
    has: vi.fn(async (name: string) => namespaces.has(name)),
    open: vi.fn(async (name: string) => {
      rows(name);
      if (!caches.has(name)) caches.set(name, cacheFor(name));
      return required(caches.get(name));
    }),
    delete: vi.fn(async (name: string) => namespaces.delete(name)),
  };
  let clock = 1000;
  const network = vi.fn<typeof fetch>(async () => response());
  const decode = vi.fn(async () => ({ width: fixture.width, height: fixture.height }));
  const deps = {
    source,
    storage: () => storage as unknown as CacheStorage,
    network,
    crypto: webcrypto as unknown as Crypto,
    now: () => clock,
    decode,
    ...options,
  };
  const api = createPublicVariantCache(deps);
  const name = 'family-public-variants.v1:' + encodeURIComponent(source);
  return {
    api,
    network,
    deps,
    decode,
    storage,
    namespaces,
    get cache() {
      return required(caches.get(name));
    },
    get rows() {
      return rows(name);
    },
    time(value: number) {
      clock = value;
    },
  };
}
beforeEach(() => vi.stubGlobal('Blob', NativeBlob));
afterEach(() => vi.unstubAllGlobals());

describe('bounded public variant bytes, without private Trip readiness', () => {
  it('persists exact bytes/digest and reopens without fetch or renewed expiry', async () => {
    const f = setup(),
      ready = await f.api.capture(desc(), context);
    expect(ready.receipt).toMatchObject({
      source,
      mediaAssetId: desc().mediaAssetId,
      format: 'family.public-variant.v1',
      mime: 'image/webp',
      bytes: bytes.length,
      width: 2,
      height: 3,
      capturedAt: 1000,
      expiresAt: 1000 + PUBLIC_VARIANT_LIMITS.lifetime,
    });
    expect([...new Uint8Array(await ready.blob.arrayBuffer())]).toEqual([...bytes]);
    f.time(2000);
    const reopened = createPublicVariantCache(f.deps);
    expect(await reopened.read(desc(), context)).toEqual(ready);
    expect(await reopened.capture(desc(), context)).toEqual(ready);
    expect(f.network).toHaveBeenCalledTimes(1);
    expect(f.network).toHaveBeenCalledWith(
      desc().url,
      expect.objectContaining({ credentials: 'omit', redirect: 'error', cache: 'no-store' })
    );
    expect(f.network.mock.calls[0][1]).not.toHaveProperty('headers');
  });
  it('keeps roles, new object paths and exact source aliases distinct', async () => {
    const f = setup();
    await f.api.capture(desc(), context);
    await f.api.capture({ ...desc('hero-a.webp'), role: 'hero' }, context);
    await f.api.capture(desc('thumb-b.webp'), context);
    const alias = createPublicVariantCache({ ...f.deps, source: 'http://localhost:55331' });
    expect(
      await alias.read(
        { ...desc(), source: 'http://localhost:55331', url: desc().url.replace(source, 'http://localhost:55331') },
        context
      )
    ).toEqual({ status: 'miss' });
    expect(f.rows.size).toBe(3);
    expect(await f.api.read({ ...desc(), role: 'hero' }, context)).toEqual({ status: 'miss' });
    await expect(f.api.capture({ ...desc(), role: 'hero' }, context)).rejects.toMatchObject({ code: 'entry' });
    expect(f.rows.size).toBe(3);
  });
  it.each([
    'https://example.invalid/storage/v1/object/public/catalog/variants/v1/x.webp',
    source + '/storage/v1/render/image/public/catalog/x.webp',
    source + '/storage/v1/object/sign/catalog/x.webp',
    source + '/storage/v1/object/public/catalog/original.webp',
    source + '/storage/v1/object/public/avatars/x.webp',
    base + 'x.webp?download=1',
    base + 'x.webp#fragment',
    base + 'x%2f.webp',
    base + '%2e%2e/x.webp',
    base + 'a/../x.webp',
    base + './x.webp',
    base + '/x.webp',
    base + 'x\\x.webp',
    base + 'x.png',
    source + '/other/../storage/v1/object/public/catalog/variants/v1/x.webp',
    base.replace('55331', '55332') + 'x.webp',
    base.replace('127.0.0.1', 'user@127.0.0.1') + 'x.webp',
  ])('refuses forbidden raw URL %s before storage/network', async (url) => {
    const f = setup();
    await expect(f.api.capture({ ...desc(), url }, context)).rejects.toMatchObject({ code: 'descriptor' });
    await expect(f.api.read({ ...desc(), url }, context)).rejects.toMatchObject({ code: 'descriptor' });
    expect(f.network).not.toHaveBeenCalled();
    expect(f.storage.open).not.toHaveBeenCalled();
  });
  it.each([
    { recipe: 'v2' },
    { mediaAssetId: '1' },
    { role: 'original' },
    { familyId: 'private' },
    { source: 'http://localhost:55331' },
  ])('rejects incompatible descriptor %j', async (extra) => {
    const f = setup();
    await expect(f.api.capture({ ...desc(), ...extra } as PublicVariantDescriptor, context)).rejects.toMatchObject({
      code: 'descriptor',
    });
    expect(f.network).not.toHaveBeenCalled();
  });
  it('refuses unqualified sources and expanded hard caps; a miss creates no namespace', async () => {
    expect(() => setup({ source: 'https://example.supabase.invalid' })).toThrow();
    expect(() => setup({ limits: { imageBytes: PUBLIC_VARIANT_LIMITS.imageBytes + 1 } })).toThrow();
    const f = setup();
    expect(await f.api.read(desc(), context)).toEqual({ status: 'miss' });
    expect(f.namespaces.size).toBe(0);
  });
  it.each([
    'http',
    'opaque',
    'redirect',
    'wrong-url',
    'html',
    'empty',
    'length',
    'truncated',
    'signature',
    'dimensions',
  ])('refuses unusable response %s without a receipt', async (mode) => {
    const f = setup();
    let r: Response;
    if (mode === 'http') r = new Response(null, { status: 404 });
    else if (mode === 'html') r = response('<html>error</html>', { 'content-type': 'text/html' });
    else if (mode === 'empty') r = response(new Uint8Array());
    else if (mode === 'length') r = response(bytes, { 'content-type': 'image/webp', 'content-length': '1' });
    else if (mode === 'truncated') r = response(bytes.subarray(0, bytes.length - 1));
    else if (mode === 'signature') r = response(new Uint8Array(bytes.length));
    else {
      r = response();
      if (mode === 'opaque') Object.defineProperty(r, 'type', { value: 'opaque' });
      if (mode === 'redirect') Object.defineProperty(r, 'redirected', { value: true });
      if (mode === 'wrong-url') Object.defineProperty(r, 'url', { value: base + 'other.webp' });
      if (mode === 'dimensions') f.decode.mockResolvedValueOnce({ width: 4000, height: 4000 });
    }
    f.network.mockResolvedValueOnce(r);
    await expect(f.api.capture(desc(), context)).rejects.toMatchObject({ code: 'response' });
    expect(f.rows.size).toBe(0);
  });
  it('uses the checked response stream without reading a nullable body twice', async () => {
    const f = setup();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const r = response(stream);
    let reads = 0;
    const readBody = vi.fn((): ReadableStream<Uint8Array> | null => (++reads === 1 ? stream : null));
    Object.defineProperty(r, 'body', { get: readBody });
    const getReader = vi.spyOn(stream, 'getReader');
    f.network.mockResolvedValueOnce(r);

    const saved = await f.api.capture(desc(), context);
    expect(saved.status).toBe('ready');
    expect(readBody).toHaveBeenCalledTimes(1);
    expect(getReader).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
    expect(f.rows.size).toBe(1);
  });
  it.each(['non-numeric-length', 'oversized-length', 'non-webp'])(
    'rejects %s before acquiring a response reader',
    async (mode) => {
      const f = setup();
      const headers = new Headers({ 'content-type': 'image/webp' });
      if (mode === 'non-webp') headers.set('content-type', 'text/html');
      else
        headers.set(
          'content-length',
          mode === 'non-numeric-length' ? 'invalid' : String(PUBLIC_VARIANT_LIMITS.imageBytes + 1)
        );
      const r = response(bytes, headers);
      const stream = r.body;
      if (!stream) throw new Error('Expected the response stream fixture');
      const getReader = vi.spyOn(stream, 'getReader');
      f.network.mockResolvedValueOnce(r);

      await expect(f.api.capture(desc(), context)).rejects.toMatchObject({ code: 'response' });
      expect(getReader).not.toHaveBeenCalled();
      expect(stream.locked).toBe(false);
      expect(f.rows.size).toBe(0);
    }
  );
  it('bounds the streamed body even without Content-Length and cancels the reader', async () => {
    const cancel = vi.fn(),
      f = setup({ limits: { imageBytes: bytes.length - 1 } });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
      },
      cancel,
    });
    f.network.mockResolvedValueOnce(response(stream));
    await expect(f.api.capture(desc(), context)).rejects.toMatchObject({ code: 'response' });
    expect(cancel).toHaveBeenCalled();
    expect(f.rows.size).toBe(0);
  });
  it('aborts an in-progress body without waiting for an uncooperative stream', async () => {
    const f = setup(),
      controller = new AbortController(),
      entered = deferred<void>(),
      cancel = vi.fn();
    f.network.mockResolvedValueOnce(
      response(
        new ReadableStream(
          {
            pull() {
              entered.resolve();
              return new Promise(() => {});
            },
            cancel,
          },
          { highWaterMark: 0 }
        )
      )
    );
    const pending = f.api.capture(desc(), { current: () => true, signal: controller.signal });
    const rejection = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    await entered.promise;
    controller.abort();
    await rejection;
    expect(cancel).toHaveBeenCalled();
    expect(f.rows.size).toBe(0);
  });
  it.each(['fetch', 'decode', 'hash', 'put', 'reread'])(
    'refuses a retired operation during %s and preserves originals',
    async (boundary) => {
      const f = setup(),
        held = deferred<void>(),
        entered = deferred<void>();
      let active = true;
      const wait = async () => {
        entered.resolve();
        await held.promise;
      };
      if (boundary === 'fetch')
        f.network.mockImplementationOnce(async () => {
          await wait();
          return response();
        });
      if (boundary === 'decode')
        f.decode.mockImplementationOnce(async () => {
          await wait();
          return { width: 2, height: 3 };
        });
      if (boundary === 'hash')
        f.deps.crypto = {
          ...f.deps.crypto,
          subtle: {
            digest: async (...args: Parameters<SubtleCrypto['digest']>) => {
              await wait();
              return webcrypto.subtle.digest(...(args as Parameters<typeof webcrypto.subtle.digest>));
            },
          },
        } as Crypto;
      const api = createPublicVariantCache(f.deps);
      if (boundary === 'put' || boundary === 'reread') {
        await f.storage.open('family-public-variants.v1:' + encodeURIComponent(source));
        if (boundary === 'put') {
          const original = f.cache.put;
          f.cache.put = vi.fn(async (...args) => {
            await wait();
            await original(...args);
          });
        } else {
          const original = f.cache.match;
          f.cache.match = vi.fn(async (...args) => {
            const result = await original(...args);
            if (result) await wait();
            return result;
          });
        }
      }
      const pending = api.capture(desc(), { current: () => active });
      const rejection = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
      await entered.promise;
      active = false;
      held.resolve();
      await rejection;
      expect(f.rows.size).toBe(0);
    }
  );
  it('serializes duplicate writers across instances and does not revive A after A→B→A', async () => {
    const f = setup(),
      held = deferred<void>(),
      entered = deferred<void>();
    let epoch = 1;
    f.network.mockImplementationOnce(async () => {
      entered.resolve();
      await held.promise;
      return response();
    });
    const first = f.api.capture(desc(), { current: () => epoch === 1 });
    const refused = expect(first).rejects.toMatchObject({ code: 'cancelled' });
    await entered.promise;
    epoch = 2;
    const second = createPublicVariantCache(f.deps).capture(desc(), { current: () => epoch === 2 });
    held.resolve();
    await refused;
    const saved = await second;
    expect(saved.status).toBe('ready');
    expect(f.rows.size).toBe(1);
    expect(f.network).toHaveBeenCalledTimes(2);
    expect(await f.api.read(desc(), context)).toEqual(saved);
  });
  it('requires locks only for mutations; storage/crypto errors never fabricate success', async () => {
    const f = setup();
    await f.api.capture(desc(), context);
    const unlocked = createPublicVariantCache({ ...f.deps, locks: () => undefined });
    expect((await unlocked.read(desc(), context)).status).toBe('ready');
    for (const action of [
      () => unlocked.capture(desc(), context),
      () => unlocked.remove(desc(), context),
      () => unlocked.clearSource(context),
    ])
      await expect(action()).rejects.toMatchObject({ code: 'locks' });
    await expect(
      createPublicVariantCache({ ...f.deps, storage: () => undefined }).read(desc(), context)
    ).rejects.toMatchObject({ code: 'storage' });
    await expect(
      createPublicVariantCache({
        ...f.deps,
        crypto: {
          subtle: {
            digest: async () => {
              throw Error('denied');
            },
          },
        } as unknown as Crypto,
      }).capture(desc('other.webp'), context)
    ).rejects.toMatchObject({ code: 'failure' });
    expect(f.rows.size).toBe(1);
  });
  it('expires without a sliding deadline, refuses rollback and refreshes only on explicit capture', async () => {
    const f = setup(),
      first = await f.api.capture(desc(), context);
    f.time(first.receipt.expiresAt);
    expect(await f.api.read(desc(), context)).toEqual({ status: 'miss' });
    expect(f.rows.size).toBe(1);
    const later = await f.api.capture(desc(), context);
    expect(later.receipt.capturedAt).toBe(first.receipt.expiresAt);
    f.time(999);
    expect(await f.api.read(desc(), context)).toEqual({ status: 'miss' });
    f.network.mockImplementationOnce(async () => {
      f.time(998);
      return response();
    });
    await expect(f.api.capture(desc('rollback.webp'), context)).rejects.toMatchObject({ code: 'clock' });
    expect(f.rows.size).toBe(1);
  });
  it.each(['future', 'extra', 'digest', 'bytes', 'private', 'corrupt'])(
    'keeps unknown/corrupt %s entries unchanged and reports a miss',
    async (kind) => {
      const f = setup();
      await f.api.capture(desc(), context);
      const raw = required(f.rows.get(desc().url)),
        headers = new Headers(raw.headers),
        meta = JSON.parse(required(headers.get('x-family-public-variant')));
      if (kind === 'future') meta.format = 'family.public-variant.v2';
      if (kind === 'extra') meta.extra = true;
      if (kind === 'digest') meta.sha256 = '0'.repeat(64);
      if (kind === 'bytes') meta.bytes++;
      if (kind === 'private') meta.familyId = 'private';
      headers.set('x-family-public-variant', JSON.stringify(meta));
      f.rows.set(desc().url, new Response(kind === 'corrupt' ? bytes.slice().fill(0) : bytes, { headers }));
      const original = await required(f.rows.get(desc().url)).clone().text();
      expect(await f.api.read(desc(), context)).toEqual({ status: 'miss' });
      await expect(f.api.capture(desc(), context)).rejects.toMatchObject({ code: 'entry' });
      expect(await required(f.rows.get(desc().url)).clone().text()).toEqual(original);
      if (['future', 'extra', 'private'].includes(kind))
        await expect(f.api.clearSource(context)).rejects.toMatchObject({ code: 'entry' });
    }
  );
  it('enforces byte/count caps in insertion order without deleting unrelated namespaces', async () => {
    const f = setup({ limits: { totalBytes: bytes.length * 2, entries: 2 } });
    f.namespaces.set('api-data', new Map([['private', response()]]));
    f.namespaces.set('workbox-precache', new Map());
    await f.api.capture(desc('first.webp'), context);
    await f.api.capture(desc('second.webp'), context);
    await f.api.capture(desc('third.webp'), context);
    expect([...f.rows.keys()]).toEqual([desc('second.webp').url, desc('third.webp').url]);
    expect((await f.api.read(desc('first.webp'), context)).status).toBe('miss');
    expect(await f.api.remove(desc('second.webp'), context)).toBe(true);
    expect(await f.api.clearSource(context)).toBe(true);
    expect([...f.namespaces.keys()]).toEqual(['api-data', 'workbox-precache']);
  });
  it('preserves a previous good entry after failed refresh/quota and supports retry', async () => {
    const f = setup(),
      first = await f.api.capture(desc(), context);
    f.cache.put.mockRejectedValueOnce(new DOMException('Quota', 'QuotaExceededError'));
    await expect(f.api.capture(desc(), context, { refresh: true })).rejects.toMatchObject({ code: 'failure' });
    expect(await f.api.read(desc(), context)).toEqual(first);
    f.network.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(f.api.capture(desc(), context, { refresh: true })).rejects.toMatchObject({ code: 'response' });
    expect(await f.api.read(desc(), context)).toEqual(first);
    expect((await f.api.capture(desc(), context, { refresh: true })).receipt.writeId).not.toBe(first.receipt.writeId);
  });
  it('rejects a decompression-sized header before invoking the decoder', async () => {
    const f = setup(),
      huge = bytes.slice();
    huge[24] = 0;
    huge[25] = 16;
    f.network.mockResolvedValueOnce(response(huge));
    await expect(f.api.capture(desc(), context)).rejects.toMatchObject({ code: 'response' });
    expect(f.decode).not.toHaveBeenCalled();
    expect(f.rows.size).toBe(0);
  });
  it('refuses a genuine decoder failure without storing a ready-looking signature', async () => {
    const f = setup();
    f.decode.mockRejectedValueOnce(Error('undecodable'));
    await expect(f.api.capture(desc(), context)).rejects.toMatchObject({ code: 'failure' });
    expect(f.rows.size).toBe(0);
  });
  it('restores a previous valid image if cancellation occurs during a refresh put', async () => {
    const f = setup(),
      original = await f.api.capture(desc(), context),
      controller = new AbortController();
    const put = f.cache.put;
    f.cache.put = vi.fn(async (...args) => {
      await put(...args);
      controller.abort();
    });
    await expect(
      f.api.capture(desc(), { current: () => true, signal: controller.signal }, { refresh: true })
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(await f.api.read(desc(), context)).toEqual(original);
  });
  it('never cleans up a replacement with a different operation receipt', async () => {
    const f = setup();
    await f.storage.open('family-public-variants.v1:' + encodeURIComponent(source));
    const put = f.cache.put;
    let active = true;
    f.cache.put = vi.fn(async (url, value) => {
      await put(url, value);
      const headers = new Headers(value.headers),
        meta = JSON.parse(required(headers.get('x-family-public-variant')));
      meta.writeId = 'a16f1100-0000-4000-8000-000000000099';
      headers.set('x-family-public-variant', JSON.stringify(meta));
      f.rows.set(desc().url, new Response(bytes, { headers }));
      active = false;
    });
    await expect(f.api.capture(desc(), { current: () => active })).rejects.toMatchObject({ code: 'cancelled' });
    const current = await f.api.read(desc(), context);
    expect(current.status).toBe('ready');
    if (current.status === 'ready') expect(current.receipt.writeId).toBe('a16f1100-0000-4000-8000-000000000099');
    expect(f.cache.delete).not.toHaveBeenCalled();
  });
  it('does not return an image that expires during asynchronous validation', async () => {
    const f = setup(),
      original = await f.api.capture(desc(), context);
    f.decode.mockImplementationOnce(async () => {
      f.time(original.receipt.expiresAt);
      return { width: 2, height: 3 };
    });
    expect(await f.api.read(desc(), context)).toEqual({ status: 'miss' });
    expect(f.rows.size).toBe(1);
  });
  it('enforces the byte cap independently of the entry cap', async () => {
    const f = setup({ limits: { entries: 3, totalBytes: bytes.length } });
    await f.api.capture(desc('one.webp'), context);
    await f.api.capture(desc('two.webp'), context);
    expect([...f.rows.keys()]).toEqual([desc('two.webp').url]);
  });
  it('a failed new write after eviction never becomes ready or touches private originals', async () => {
    const f = setup({ limits: { entries: 1 } });
    f.namespaces.set('user-uploads', new Map([['private', response()]]));
    await f.api.capture(desc('one.webp'), context);
    f.cache.put.mockRejectedValueOnce(new DOMException('quota', 'QuotaExceededError'));
    await expect(f.api.capture(desc('two.webp'), context)).rejects.toMatchObject({ code: 'failure' });
    expect(await f.api.read(desc('two.webp'), context)).toEqual({ status: 'miss' });
    expect(f.namespaces.get('user-uploads')?.size).toBe(1);
    expect((await f.api.capture(desc('two.webp'), context)).status).toBe('ready');
  });
  it('rejects a frame larger than the extended canvas before decoding', async () => {
    const f = setup(),
      inconsistent = bytes.slice();
    const at = inconsistent.findIndex(
      (value, index) =>
        value === 0x56 &&
        inconsistent[index + 1] === 0x50 &&
        inconsistent[index + 2] === 0x38 &&
        inconsistent[index + 3] === 0x20
    );
    expect(at).toBeGreaterThan(0);
    inconsistent[at + 14] = 1;
    inconsistent[at + 15] = 16;
    f.network.mockResolvedValueOnce(response(inconsistent));
    await expect(f.api.capture(desc(), context)).rejects.toMatchObject({ code: 'response' });
    expect(f.decode).not.toHaveBeenCalled();
    expect(f.rows.size).toBe(0);
  });
});
