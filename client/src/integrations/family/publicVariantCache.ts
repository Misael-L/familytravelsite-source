import {
  packingAggregateQualificationEnabled,
  packingIdentityQualificationEnabled,
  v4PublicImageSource,
} from './offlineTripQualification';
/** Public bytes only. This is not a Trip access grant or a full-preparation receipt. */
export const PUBLIC_VARIANT_LIMITS = Object.freeze({
  imageBytes: 4 * 1024 * 1024,
  totalBytes: 64 * 1024 * 1024,
  entries: 128,
  lifetime: 7 * 86400000,
});
const PREFIX = '/storage/v1/object/public/catalog/variants/v1/';
const HEADER = 'x-family-public-variant';
const FORMAT = 'family.public-variant.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export type PublicVariantDescriptor = {
  source: string;
  mediaAssetId: string;
  recipe: 'v1';
  role: 'thumb' | 'hero';
  url: string;
};
export type PublicVariantContext = { current: () => boolean; signal?: AbortSignal };
export type PublicVariantReceipt = Omit<PublicVariantDescriptor, 'url'> & {
  format: typeof FORMAT;
  path: string;
  mime: 'image/webp';
  bytes: number;
  sha256: string;
  capturedAt: number;
  expiresAt: number;
  writeId: string;
  width: number;
  height: number;
};
export type PublicVariantReady = { status: 'ready'; receipt: PublicVariantReceipt; blob: Blob };
type Result = PublicVariantReady | { status: 'miss' };
type Limits = { [K in keyof typeof PUBLIC_VARIANT_LIMITS]: number };
type Dependencies = {
  source: string;
  storage?: () => CacheStorage | undefined;
  network?: typeof fetch;
  locks?: () => Pick<LockManager, 'request'> | undefined;
  now?: () => number;
  crypto?: Pick<Crypto, 'subtle' | 'randomUUID'>;
  decode?: (blob: Blob) => Promise<{ width: number; height: number }>;
  /** Callers may tighten hard caps, never expand them. */
  limits?: Partial<Limits>;
};
export class PublicVariantCacheError extends Error {
  constructor(
    public readonly code:
      'descriptor' | 'source' | 'cancelled' | 'clock' | 'locks' | 'storage' | 'response' | 'entry' | 'failure'
  ) {
    super('Public variant cache refused: ' + code);
    this.name = 'PublicVariantCacheError';
  }
}
const fail: (code: PublicVariantCacheError['code']) => never = (code) => {
  throw new PublicVariantCacheError(code);
};
const fields = (value: object, names: string[]) => Object.keys(value).sort().join('|') === [...names].sort().join('|');
const descriptorFields = ['source', 'mediaAssetId', 'recipe', 'role', 'url'];
const receiptFields = [
  'source',
  'mediaAssetId',
  'recipe',
  'role',
  'format',
  'path',
  'mime',
  'bytes',
  'sha256',
  'capturedAt',
  'expiresAt',
  'writeId',
  'width',
  'height',
];

/** Deliberately qualification-only; future hosted policy needs separate activation. */
function trustedSource(source: string) {
  if (
    !['http://127.0.0.1:55331', 'http://localhost:55331', 'http://127.0.0.1:55431'].includes(source) &&
    !(source === 'http://127.0.0.1:55631' && packingIdentityQualificationEnabled()) &&
    !(source === 'http://127.0.0.1:55731' && packingAggregateQualificationEnabled()) &&
    !v4PublicImageSource(source)
  )
    fail('source');
  return source;
}
function descriptor(value: PublicVariantDescriptor, source: string): PublicVariantDescriptor {
  if (
    !value ||
    !fields(value, descriptorFields) ||
    value.source !== source ||
    !UUID.test(value.mediaAssetId) ||
    value.recipe !== 'v1' ||
    !['thumb', 'hero'].includes(value.role) ||
    typeof value.url !== 'string'
  )
    fail('descriptor');
  const start = source + PREFIX;
  if (!value.url.startsWith(start)) fail('descriptor');
  const object = value.url.slice(start.length);
  if (
    !object.endsWith('.webp') ||
    object.split('/').some((part) => !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part) || part === '.' || part === '..')
  )
    fail('descriptor');
  const parsed = new URL(value.url);
  if (
    parsed.origin !== source ||
    parsed.href !== value.url ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== PREFIX + object
  )
    fail('descriptor');
  return { ...value };
}
function webpDimensions(bytes: Uint8Array, body: number, kind: string, size: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));
  let width = 0,
    height = 0;
  if (kind === 'VP8 ' && size >= 10 && text(body + 3, 3) === '\x9d\x01\x2a') {
    width = view.getUint16(body + 6, true) & 0x3fff;
    height = view.getUint16(body + 8, true) & 0x3fff;
  } else if (kind === 'VP8L' && size >= 5 && bytes[body] === 0x2f) {
    const bits = view.getUint32(body + 1, true);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (kind === 'VP8X' && size === 10 && !(bytes[body] & 2)) {
    const u24 = (i: number) => bytes[i] + bytes[i + 1] * 256 + bytes[i + 2] * 65536;
    width = u24(body + 4) + 1;
    height = u24(body + 7) + 1;
  } else fail('response');

  return { width, height };
}
function webp(bytes: Uint8Array) {
  const text = (at: number, size: number) => String.fromCharCode(...bytes.subarray(at, at + size));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < 26 ||
    text(0, 4) !== 'RIFF' ||
    text(8, 4) !== 'WEBP' ||
    view.getUint32(4, true) + 8 !== bytes.length
  )
    fail('response');
  let width = 0,
    height = 0,
    frames = 0;
  for (let at = 12; at < bytes.length;) {
    if (at + 8 > bytes.length) fail('response');
    const kind = text(at, 4),
      size = view.getUint32(at + 4, true),
      body = at + 8,
      end = body + size;
    if (end + (size % 2) > bytes.length) fail('response');
    if (at === 12) {
      ({ width, height } = webpDimensions(bytes, body, kind, size));
    }
    if (kind === 'ANIM' || kind === 'ANMF') fail('response');
    if (kind === 'VP8 ' || kind === 'VP8L') {
      const frame = webpDimensions(bytes, body, kind, size);
      if (frame.width !== width || frame.height !== height) fail('response');
      frames++;
    }
    at = end + (size % 2);
  }
  if (!width || !height || width > 4096 || height > 4096 || frames !== 1) fail('response');
  return { width, height };
}

function cacheState(deps: Dependencies) {
  const source = trustedSource(deps.source),
    limits = { ...PUBLIC_VARIANT_LIMITS, ...deps.limits };
  for (const key of Object.keys(PUBLIC_VARIANT_LIMITS) as (keyof Limits)[])
    if (!Number.isSafeInteger(limits[key]) || limits[key] <= 0 || limits[key] > PUBLIC_VARIANT_LIMITS[key])
      fail('descriptor');
  const storage = deps.storage ?? (() => globalThis.caches),
    network = deps.network ?? globalThis.fetch;
  const locks = deps.locks ?? (() => globalThis.navigator?.locks),
    now = deps.now ?? Date.now,
    crypto = deps.crypto ?? globalThis.crypto;
  const decode =
    deps.decode ??
    (async (blob: Blob) => {
      const image = await createImageBitmap(blob);
      try {
        return { width: image.width, height: image.height };
      } finally {
        image.close();
      }
    });
  // Exact, reversible public-source identity. No actor/Trip identity is ever persisted here.
  const name = 'family-public-variants.v1:' + encodeURIComponent(source);
  return { source, limits, storage, network, locks, now, crypto, decode, name };
}
type CacheState = ReturnType<typeof cacheState>;
function guard(state: CacheState, context: PublicVariantContext) {
  const { now } = state;
  let last = -1;
  return () => {
    if (!context || context.signal?.aborted || !context.current()) fail('cancelled');
    const value = now();
    if (!Number.isSafeInteger(value) || value <= 0 || value < last) fail('clock');
    last = value;
    return value;
  };
}
async function execute<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof PublicVariantCacheError) throw error;
    if (error instanceof Error && error.name === 'AbortError') fail('cancelled');
    fail('failure');
  }
}
function cacheStorage(state: CacheState) {
  const { storage } = state;
  const value = storage();
  if (!value) fail('storage');
  return value;
}
async function withLock<T>(
  state: CacheState,
  context: PublicVariantContext,
  work: (check: () => number) => Promise<T>
) {
  const { locks, name } = state;
  const check = guard(state, context);
  check();
  const lock = locks();
  if (!lock) fail('locks');
  const result = await lock.request(name, { mode: 'exclusive', signal: context.signal }, async () => {
    check();
    return work(check);
  });
  check();
  return result;
}
async function finishReader(reader: ReadableStreamDefaultReader<Uint8Array>, failure: () => unknown) {
  try {
    await reader.cancel();
    const error = failure();
    if (error) throw error;
  } finally {
    reader.releaseLock();
  }
}
function checkedResponse(response: Response, limits: Limits) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limits.imageBytes)) fail('response');
  if (
    !response.ok ||
    response.redirected ||
    ['opaque', 'opaqueredirect'].includes(response.type) ||
    response.status !== 200 ||
    response.headers.get('content-type')?.trim().toLowerCase() !== 'image/webp'
  )
    fail('response');
  const stream = response.body;
  if (!stream) fail('response');
  return { length, stream };
}
async function body(state: CacheState, response: Response, context: PublicVariantContext, check: () => number) {
  const { limits, decode, crypto } = state;
  check();
  const { length, stream } = checkedResponse(response, limits);
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  let cancellationFailure: unknown;
  const abort = () => {
    void reader.cancel().catch((error) => {
      cancellationFailure = error;
    });
  };
  context.signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      check();
      const chunk = await reader.read();
      check();
      if (chunk.done) break;
      if (
        !ArrayBuffer.isView(chunk.value) ||
        Object.prototype.toString.call(chunk.value) !== '[object Uint8Array]' ||
        size + chunk.value.byteLength > limits.imageBytes
      )
        fail('response');
      size += chunk.value.byteLength;
      chunks.push(new Uint8Array(chunk.value));
    }
    if (!size || (length !== null && Number(length) !== size)) fail('response');
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.byteLength;
    }
    const dimensions = webp(bytes),
      blob = new Blob([bytes], { type: 'image/webp' });
    check();
    const decoded = await decode(blob);
    check();
    if (decoded.width !== dimensions.width || decoded.height !== dimensions.height) fail('response');
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    check();
    return {
      bytes,
      blob,
      sha256: Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join(''),
      ...dimensions,
    };
  } finally {
    context.signal?.removeEventListener('abort', abort);
    await finishReader(reader, () => cancellationFailure);
  }
}
function validReceiptBounds(row: PublicVariantReceipt, limits: Limits) {
  if (row.mime !== 'image/webp' || !/^[a-f0-9]{64}$/.test(row.sha256) || !UUID.test(row.writeId)) return false;
  if (
    ![row.bytes, row.capturedAt, row.expiresAt, row.width, row.height].every(
      (value) => Number.isSafeInteger(value) && value > 0
    ) ||
    row.bytes > limits.imageBytes ||
    row.width > 4096 ||
    row.height > 4096 ||
    row.expiresAt !== row.capturedAt + limits.lifetime
  )
    return false;
  return true;
}
function metadata(state: CacheState, raw: Response, expected?: PublicVariantDescriptor): PublicVariantReceipt | null {
  const { source, limits } = state;
  try {
    const header = raw.headers.get(HEADER);
    if (!header || header.length > 2048) return null;
    const row = JSON.parse(header) as PublicVariantReceipt;
    if (
      !row ||
      !fields(row, receiptFields) ||
      row.format !== FORMAT ||
      row.source !== source ||
      typeof row.path !== 'string'
    )
      return null;
    descriptor(
      { source, mediaAssetId: row.mediaAssetId, recipe: row.recipe, role: row.role, url: source + row.path },
      source
    );
    if (!validReceiptBounds(row, limits)) return null;
    if (
      expected &&
      (row.path !== new URL(expected.url).pathname ||
        row.mediaAssetId !== expected.mediaAssetId ||
        row.role !== expected.role ||
        row.recipe !== expected.recipe)
    )
      return null;
    return row;
  } catch {
    return null;
  }
}
async function inspect(
  state: CacheState,
  raw: Response,
  expected: PublicVariantDescriptor,
  job: { context: PublicVariantContext; check: () => number },
  expired = false
): Promise<PublicVariantReady | null> {
  const { context, check } = job;
  const receipt = metadata(state, raw, expected),
    time = check();
  if (!receipt || receipt.capturedAt > time || (!expired && receipt.expiresAt <= time)) return null;
  let value: Awaited<ReturnType<typeof body>>;
  try {
    value = await body(state, raw.clone(), context, check);
  } catch (error) {
    if (error instanceof PublicVariantCacheError && error.code === 'response') return null;
    throw error;
  }
  if (
    value.bytes.length !== receipt.bytes ||
    value.sha256 !== receipt.sha256 ||
    value.width !== receipt.width ||
    value.height !== receipt.height ||
    (!expired && receipt.expiresAt <= check())
  )
    return null;
  check();
  return { status: 'ready', receipt, blob: value.blob };
}
async function read(state: CacheState, value: PublicVariantDescriptor, context: PublicVariantContext): Promise<Result> {
  const { source, name } = state;
  return execute(async () => {
    const expected = descriptor(value, source),
      check = guard(state, context);
    check();
    const store = cacheStorage(state);
    const exists = await store.has(name);
    check();
    if (!exists) return { status: 'miss' };
    const cache = await store.open(name);
    check();
    const raw = await cache.match(expected.url);
    check();
    if (!raw) return { status: 'miss' };
    return (await inspect(state, raw, expected, { context, check })) ?? { status: 'miss' };
  });
}
async function makeRoom(
  state: CacheState,
  cache: Cache,
  expected: PublicVariantDescriptor,
  receipt: PublicVariantReceipt,
  job: { context: PublicVariantContext; check: () => number }
) {
  const { context, check } = job;
  const { source, limits } = state;
  const keys = await cache.keys();
  check();
  if (keys.length > limits.entries) fail('entry');
  const entries: { key: Request; bytes: number }[] = [];
  let total = 0;
  for (const key of keys) {
    if (key.url === expected.url) continue;
    const raw = await cache.match(key);
    check();
    if (!raw) fail('entry');
    const meta = metadata(state, raw);
    if (!meta || key.method !== 'GET' || key.url !== source + meta.path) fail('entry');
    const item = await inspect(
      state,
      raw,
      { source, mediaAssetId: meta.mediaAssetId, recipe: meta.recipe, role: meta.role, url: key.url },
      { context, check },
      true
    );
    if (!item) fail('entry');
    entries.push({ key, bytes: item.receipt.bytes });
    total += item.receipt.bytes;
  }
  if (receipt.bytes > limits.totalBytes) fail('response');
  while (entries.length + 1 > limits.entries || total + receipt.bytes > limits.totalBytes) {
    const first = entries.shift();
    if (!first) fail('entry');
    check();
    const deleted = await cache.delete(first.key);
    check();
    if (!deleted) fail('storage');
    total -= first.bytes;
  }
}
async function capture(
  state: CacheState,
  value: PublicVariantDescriptor,
  context: PublicVariantContext,
  options: { refresh?: boolean } = {}
): Promise<PublicVariantReady> {
  const { source, name, network, limits, crypto } = state;
  return execute(async () => {
    const expected = descriptor(value, source);
    return withLock(state, context, async (check) => {
      const cache = await cacheStorage(state).open(name);
      check();
      const previous = await cache.match(expected.url);
      check();
      const old = previous ? await inspect(state, previous, expected, { context, check }, true) : null;
      if (previous && !old) fail('entry');
      if (old && old.receipt.expiresAt > check() && !options.refresh) return old;
      const response = await network(expected.url, {
        signal: context.signal,
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
      });
      check();
      if (response.url && response.url !== expected.url) fail('response');
      const value = await body(state, response, context, check),
        capturedAt = check();
      const receipt: PublicVariantReceipt = {
        source,
        mediaAssetId: expected.mediaAssetId,
        role: expected.role,
        recipe: expected.recipe,
        format: FORMAT,
        path: new URL(expected.url).pathname,
        mime: 'image/webp',
        bytes: value.bytes.length,
        sha256: value.sha256,
        capturedAt,
        expiresAt: capturedAt + limits.lifetime,
        writeId: crypto.randomUUID(),
        width: value.width,
        height: value.height,
      };
      await makeRoom(state, cache, expected, receipt, { context, check });
      const stored = new Response(value.bytes, {
        headers: {
          'content-type': 'image/webp',
          'content-length': String(receipt.bytes),
          [HEADER]: JSON.stringify(receipt),
        },
      });
      check();
      try {
        await cache.put(expected.url, stored);
        check();
        const raw = await cache.match(expected.url);
        check();
        const ready = raw ? await inspect(state, raw, expected, { context, check }) : null;
        if (!ready || ready.receipt.writeId !== receipt.writeId) fail('storage');
        check();
        return ready;
      } catch (error) {
        // Keep the source lock during cleanup. Never remove an unrelated/newer write.
        const current = await cache.match(expected.url);
        if (current?.headers.get(HEADER) === JSON.stringify(receipt)) {
          if (previous) await cache.put(expected.url, previous);
          else await cache.delete(expected.url);
        }
        throw error;
      }
    });
  });
}
async function remove(state: CacheState, value: PublicVariantDescriptor, context: PublicVariantContext) {
  const { source, name } = state;
  return execute(async () => {
    const expected = descriptor(value, source);
    return withLock(state, context, async (check) => {
      const store = cacheStorage(state),
        exists = await store.has(name);
      check();
      if (!exists) return false;
      const cache = await store.open(name);
      check();
      const raw = await cache.match(expected.url);
      check();
      if (!raw) return false;
      if (!metadata(state, raw, expected)) fail('entry');
      const deleted = await cache.delete(expected.url);
      check();
      return deleted;
    });
  });
}
async function clearSource(state: CacheState, context: PublicVariantContext) {
  const { source, name, limits } = state;
  return execute(() =>
    withLock(state, context, async (check) => {
      const store = cacheStorage(state),
        exists = await store.has(name);
      check();
      if (!exists) return false;
      const cache = await store.open(name);
      check();
      const keys = await cache.keys();
      check();
      if (keys.length > limits.entries) fail('entry');
      for (const key of keys) {
        const raw = await cache.match(key);
        check();
        const meta = raw && metadata(state, raw);
        if (!meta || key.url !== source + meta.path) fail('entry');
      }
      check();
      const deleted = await store.delete(name);
      check();
      return deleted;
    })
  );
}

export function createPublicVariantCache(deps: Dependencies) {
  const state = cacheState(deps);
  return {
    read: (value: PublicVariantDescriptor, context: PublicVariantContext) => read(state, value, context),
    capture: (value: PublicVariantDescriptor, context: PublicVariantContext, options?: { refresh?: boolean }) =>
      capture(state, value, context, options),
    remove: (value: PublicVariantDescriptor, context: PublicVariantContext) => remove(state, value, context),
    clearSource: (context: PublicVariantContext) => clearSource(state, context),
  };
}
