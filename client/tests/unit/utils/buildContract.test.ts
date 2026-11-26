import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { familyBuildDescriptor } from '../../../buildDescriptorPlugin.mjs';

const SOURCE = readFileSync(resolve(process.cwd(), 'public/family-build-contract.js'), 'utf8');
const body = 'export default 7;',
  digest = createHash('sha256').update(body).digest('hex');
const descriptor = () => ({
  format: 'family.build.v1',
  version: 'family-2026.11.11.1',
  entry: { path: '/assets/index-abc123.js', bytes: body.length, sha256: digest },
});
type Contract = {
  validate: (value: unknown) => unknown;
  read: (
    fetcher: typeof fetch,
    origin: string,
    options?: { verifyEntry?: boolean; signal?: AbortSignal }
  ) => Promise<unknown>;
};
let contract: Contract;
const origin = 'http://localhost:3000';
const json = (value: unknown = descriptor()) =>
  new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  new Function(SOURCE)();
  contract = globalThis.FamilyBuildContract as unknown as Contract;
});
afterEach(() => {
  Reflect.deleteProperty(globalThis, 'FamilyBuildContract');
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('actual classic public build contract', () => {
  it('accepts only immutable bounded public build identity', () => {
    const value = contract.validate(descriptor());
    expect(value).toEqual(descriptor());
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen((value as ReturnType<typeof descriptor>).entry)).toBe(true);
  });
  it.each([
    null,
    [],
    {},
    'build',
    { ...descriptor(), format: 'family.build.v2' },
    { ...descriptor(), secret: 'extra' },
    ...['', 'x'.repeat(65), '../evil', 'x\ny'].map((version) => ({ ...descriptor(), version })),
    ...[
      'https://other.invalid/assets/index-ab.js',
      '/assets/../index-ab.js',
      '/assets/index-ab.js?q=1',
      '/other/index-ab.js',
      '/assets/chunk-ab.js',
    ].map((path) => ({ ...descriptor(), entry: { ...descriptor().entry, path } })),
    ...[0, -1, 1.1, 8388609, NaN].map((bytes) => ({ ...descriptor(), entry: { ...descriptor().entry, bytes } })),
    { ...descriptor(), entry: { ...descriptor().entry, sha256: 'G'.repeat(64) } },
    { ...descriptor(), entry: { ...descriptor().entry, url: 'private' } },
  ])('rejects invalid, future or nonpublic descriptor %#', (value) => expect(contract.validate(value)).toBeNull());
  it('fetches uncached anonymous same-origin metadata and verifies actual entry bytes', async () => {
    const fetcher = vi.fn(async (url: string) =>
      new URL(url).pathname === '/family-build.json'
        ? json()
        : new Response(body, { headers: { 'content-type': 'application/javascript' } })
    );
    await expect(contract.read(fetcher as typeof fetch, origin, { verifyEntry: true })).resolves.toEqual(descriptor());
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const call of fetcher.mock.calls) expect(new URL(call[0]).searchParams.get('family-build-check')).toBeTruthy();
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      })
    );
  });
  it.each([
    () => new Response('login', { headers: { 'content-type': 'text/html' } }),
    () => new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } }),
    () => json({ ...descriptor(), entry: { ...descriptor().entry, sha256: '0'.repeat(64) } }),
    () => new Response('x'.repeat(8193), { headers: { 'content-type': 'application/json' } }),
    () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '8193' } }),
  ])('refuses bad metadata before touching any entry or local state %#', async (make) => {
    const fetcher = vi.fn(async () => make());
    const result = await contract.read(fetcher, origin, { verifyEntry: true });
    expect(result).toBeNull();
  });
  it.each([
    () => new Response(body, { headers: { 'content-type': 'text/html' } }),
    () => new Response(body + 'x', { headers: { 'content-type': 'text/javascript' } }),
    () => new Response(body.slice(1), { headers: { 'content-type': 'text/javascript' } }),
    () => new Response(body.replace('7', '8'), { headers: { 'content-type': 'text/javascript' } }),
    () => new Response(body, { headers: { 'content-type': 'text/javascript', 'content-length': '99999999' } }),
  ])('refuses wrong-MIME, oversized, truncated or corrupt entry %#', async (make) => {
    const fetcher = vi.fn(async (url: string) => (new URL(url).pathname === '/family-build.json' ? json() : make()));
    await expect(contract.read(fetcher as typeof fetch, origin, { verifyEntry: true })).resolves.toBeNull();
  });
  it('checks decoded bytes rather than compressed Content-Length', async () => {
    const fetcher = vi.fn(async (url: string) =>
      new URL(url).pathname === '/family-build.json'
        ? json()
        : new Response(body, {
            headers: { 'content-type': 'text/javascript', 'content-encoding': 'br', 'content-length': '5' },
          })
    );
    await expect(contract.read(fetcher as typeof fetch, origin, { verifyEntry: true })).resolves.toEqual(descriptor());
  });
  it('refuses redirects and moved response URLs', async () => {
    const response = json();
    Object.defineProperty(response, 'redirected', { value: true });
    await expect(
      contract.read(
        vi.fn(async () => response),
        origin
      )
    ).resolves.toBeNull();
    const moved = json();
    Object.defineProperty(moved, 'url', { value: 'https://foreign.invalid/family-build.json' });
    await expect(
      contract.read(
        vi.fn(async () => moved),
        origin
      )
    ).resolves.toBeNull();
  });
  it('bounds even a noncooperative fetch by the deadline', async () => {
    vi.useFakeTimers();
    const pending = contract.read(
      vi.fn(() => new Promise<Response>(() => {})),
      origin
    );
    await vi.advanceTimersByTimeAsync(3000);
    await expect(pending).resolves.toBeNull();
  });
  it('cancels a stalled body and rejects late caller-aborted observations', async () => {
    const cancel = vi.fn(),
      stream = new ReadableStream({ cancel });
    const ctrl = new AbortController();
    const pending = contract.read(
      vi.fn(async () => new Response(stream, { headers: { 'content-type': 'application/json' } })),
      origin,
      { signal: ctrl.signal }
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    ctrl.abort();
    await expect(pending).resolves.toBeNull();
    expect(cancel).toHaveBeenCalled();
  });
  it('refuses unbounded/invalid origin and missing digest capability', async () => {
    const fetcher = vi.fn(async () => json());
    await expect(contract.read(fetcher, origin + '/wrong')).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubGlobal('crypto', {});
    await expect(contract.read(fetcher, origin, { verifyEntry: true })).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('finalized build descriptor emission', () => {
  it('names the finalized entry digest and omits private data', () => {
    const emitFile = vi.fn();
    const plugin = familyBuildDescriptor(descriptor().version, true);
    plugin.generateBundle.handler.call(
      { emitFile },
      {},
      { main: { type: 'chunk', isEntry: true, name: 'index', fileName: 'assets/index-abc123.js', code: body } }
    );
    expect(emitFile).toHaveBeenCalledTimes(1);
    const asset = emitFile.mock.calls[0][0];
    expect(asset.fileName).toBe('family-build.json');
    expect(contract.validate(JSON.parse(asset.source))).toEqual(descriptor());
  });
  it.each(['5.1.2', 'dev', '', 'family-2026.11.11.1 bad'])(
    'refuses invalid/missing production release version %s',
    (value) => expect(() => familyBuildDescriptor(value, true)).toThrow()
  );
  it('refuses missing or ambiguous actual entry chunks', () => {
    const plugin = familyBuildDescriptor('5.1.2');
    expect(() => plugin.generateBundle.handler.call({ emitFile: vi.fn() }, {}, {})).toThrow();
  });
});
