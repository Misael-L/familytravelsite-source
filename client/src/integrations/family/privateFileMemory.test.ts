import { Blob as NativeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completeId, completeTripCaptureFixture } from '../../../tests/helpers/familyCompleteTrip';
import {
  currentPreparedFilePool,
  installPreparedFilePool,
  retireObservedFilePool,
} from '../../repo/preparedFilePreview';
import { serializeCompleteTrip } from './completeTripSnapshot';
import type { acquirePreparationFile } from './privateFileAcquisition';
import { createPrivateFileMemory, PRIVATE_FILE_MEMORY_LIMITS } from './privateFileMemory';
type Value = Awaited<ReturnType<typeof acquirePreparationFile>>;
const stop: (() => void)[] = [];
function held<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function fixture(bytes = 3, count = 1) {
  const input = completeTripCaptureFixture();
  input.source = 'http://127.0.0.1:55331';
  input.ownership.key = JSON.stringify([
    1,
    input.source,
    input.scope.user_id,
    input.scope.family_id,
    input.scope.person_id,
    input.scope.trip_id,
    input.scope.layer,
  ]);
  input.ownership.ownerKey = JSON.stringify([
    1,
    input.source,
    input.scope.user_id,
    input.scope.family_id,
    input.scope.person_id,
  ]);
  input.capturedAt = Date.now();
  input.admitReadOnly = true;
  const data = input.data as ReturnType<typeof completeTripCaptureFixture>['data'] & {
    companions: { files: Array<{ id: string; size_bytes: number }> };
  };
  const original = data.companions.files[0];
  data.companions.files = Array.from({ length: count }, (_, n) => ({
    ...original,
    id: completeId(40 + n),
    size_bytes: bytes,
  }));
  const e = await serializeCompleteTrip(input);
  let owner = true,
    saved = true;
  const check = () => {
    if (!owner) throw Error('Owner retired');
  };
  const read = {
    envelope: e,
    check: () => {
      check();
      if (!saved) throw Error('Saved view retired');
    },
    verify: vi.fn(async () => {}),
  };
  async function value(id = e.data.companions.files[0].id): Promise<Value> {
    const row = e.data.companions.files.find((f) => f.id === id);
    if (!row) throw Error('Missing fixture file');
    const blob = new Blob([new Uint8Array(row.size_bytes)], { type: row.mime_type ?? '' });
    return {
      blob,
      receipt: {
        format: 'family.private-file-acquisition.v1',
        source: e.source,
        scope: { ...e.scope },
        ownership: { ...e.ownership },
        generation: e.generation,
        snapshotDigest: e.digest,
        file: { id, storagePath: row.storage_path, createdAt: row.created_at },
        content: { bytes: blob.size, mime: blob.type, sha256: 'a'.repeat(64) },
        observedAt: Date.now(),
        expiresAt: e.expiresAt,
        serverContentVersion: 'unversioned',
        persisted: false,
      },
    };
  }
  const acquire = vi.fn(async (id: string, _signal: AbortSignal) => value(id)),
    urls = { create: vi.fn((_blob: Blob) => 'blob:memory-' + String(Math.random())), revoke: vi.fn() };
  const pool = createPrivateFileMemory({ envelope: e, check }, acquire, urls);
  stop.push(pool.dispose);
  return {
    e,
    read,
    pool,
    acquire,
    urls,
    value,
    id: e.data.companions.files[0].id,
    retire: () => {
      owner = false;
    },
    closeView: () => {
      saved = false;
    },
  };
}
beforeEach(() => {
  vi.stubGlobal('Blob', NativeBlob);
});
afterEach(() => {
  for (const f of stop.splice(0).reverse()) f();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('generation-owned private file RAM', () => {
  it('is lazy and exposes only the existing bounded budgets', async () => {
    const f = await fixture();
    expect(f.acquire).not.toHaveBeenCalled();
    expect(PRIVATE_FILE_MEMORY_LIMITS).toEqual({ bytes: 67108864, entries: 4 });
    await expect(f.pool.borrow(f.read, f.id)).rejects.toMatchObject({ code: 'missing' });
    expect(f.urls.create).not.toHaveBeenCalled();
  });
  it('prepares once, reuses a valid explicit retry and leases only that exact admitted generation', async () => {
    const f = await fixture(),
      before = JSON.stringify(f.e),
      a = await f.pool.prepare('user-request', f.id),
      b = await f.pool.prepare('user-request', f.id);
    expect(a).toEqual(b);
    expect(f.acquire).toHaveBeenCalledTimes(1);
    const lease = await f.pool.borrow(f.read, f.id);
    expect(lease.current()).toBe(true);
    expect(f.read.verify).toHaveBeenCalled();
    lease.release();
    lease.release();
    expect(lease.current()).toBe(false);
    expect(f.urls.revoke).toHaveBeenCalledExactlyOnceWith(lease.url);
    expect(JSON.stringify(f.e)).toBe(before);
  });
  it('coalesces identical pending requests but refuses another signal or refresh', async () => {
    const f = await fixture(),
      wait = held<Value>();
    f.acquire.mockReturnValueOnce(wait.promise);
    const a = f.pool.prepare('user-request', f.id),
      b = f.pool.prepare('user-request', f.id);
    expect(a).toBe(b);
    expect(() => f.pool.prepare('user-request', f.id, { refresh: true })).toThrow('busy');
    expect(() => f.pool.prepare('user-request', f.id, { signal: new AbortController().signal })).toThrow('busy');
    wait.resolve(await f.value());
    await a;
    expect(f.acquire).toHaveBeenCalledTimes(1);
  });
  it('refuses non-user intent without reserving or acquiring', async () => {
    const f = await fixture();
    expect(() => f.pool.prepare('background' as 'user-request', f.id)).toThrow('intent');
    expect(f.acquire).not.toHaveBeenCalled();
  });
  it('reserves pending file sizes and counts before dispatch and leaves older entries intact on budget refusal', async () => {
    const f = await fixture(20 * 1024 * 1024, 4),
      wait = held<Value>();
    f.acquire.mockReturnValueOnce(wait.promise);
    const first = f.pool.prepare('user-request', f.id);
    await f.pool.prepare('user-request', completeId(41));
    await f.pool.prepare('user-request', completeId(42));
    expect(() => f.pool.prepare('user-request', completeId(43))).toThrow('limit');
    expect(f.acquire).toHaveBeenCalledTimes(3);
    wait.resolve(await f.value());
    await first;
    expect((await f.pool.borrow(f.read, f.id)).current()).toBe(true);
  });
  it('keeps a four-entry bound independently of small byte sizes', async () => {
    const f = await fixture(1, 5);
    for (let n = 0; n < 4; n++) await f.pool.prepare('user-request', completeId(40 + n));
    expect(() => f.pool.prepare('user-request', completeId(44))).toThrow('limit');
    expect(f.acquire).toHaveBeenCalledTimes(4);
  });
  it('revokes old URLs before refreshing and never falls back to good old bytes after HTTP denial', async () => {
    const f = await fixture();
    await f.pool.prepare('user-request', f.id);
    const lease = await f.pool.borrow(f.read, f.id);
    f.acquire.mockRejectedValueOnce(Object.assign(Error('Denied'), { status: 403 }));
    await expect(f.pool.prepare('user-request', f.id, { refresh: true })).rejects.toMatchObject({ status: 403 });
    expect(lease.current()).toBe(false);
    expect(f.urls.revoke).toHaveBeenCalledWith(lease.url);
    await expect(f.pool.borrow(f.read, f.id)).rejects.toMatchObject({ code: 'missing' });
    await f.pool.prepare('user-request', f.id);
    expect((await f.pool.borrow(f.read, f.id)).current()).toBe(true);
  });
  it.each(['generation', 'source', 'scope', 'ownership', 'digest', 'expiry'])(
    'refuses %s from a different saved read',
    async (kind) => {
      const f = await fixture();
      await f.pool.prepare('user-request', f.id);
      const other = structuredClone(f.e);
      if (kind === 'generation') other.generation = completeId(99);
      if (kind === 'source') other.source = 'http://localhost:55331';
      if (kind === 'scope') other.scope.person_id = completeId(99);
      if (kind === 'ownership') other.ownership.tripGeneration = completeId(99);
      if (kind === 'digest') other.digest = 'b'.repeat(64);
      if (kind === 'expiry') other.expiresAt++;
      await expect(f.pool.borrow({ ...f.read, envelope: other }, f.id)).rejects.toThrow();
      expect(f.urls.create).not.toHaveBeenCalled();
    }
  );
  it.each(['source', 'file', 'bytes', 'mime', 'digest', 'generation'])(
    'rejects a wrong acquisition receipt: %s',
    async (kind) => {
      const f = await fixture(),
        bad = await f.value();
      if (kind === 'source') bad.receipt.source = 'http://localhost:55331';
      if (kind === 'file') bad.receipt.file.id = completeId(99);
      if (kind === 'bytes') bad.receipt.content.bytes++;
      if (kind === 'mime') bad.receipt.content.mime = 'text/html';
      if (kind === 'digest') bad.receipt.content.sha256 = 'not-a-digest';
      if (kind === 'generation') bad.receipt.generation = completeId(99);
      f.acquire.mockResolvedValueOnce(bad);
      await expect(f.pool.prepare('user-request', f.id)).rejects.toMatchObject({ code: 'receipt' });
      await expect(f.pool.borrow(f.read, f.id)).rejects.toMatchObject({ code: 'missing' });
    }
  );
  it('does not let old aborted work remove a newer slot', async () => {
    const f = await fixture(),
      wait = held<Value>();
    f.acquire.mockReturnValueOnce(wait.promise);
    const old = f.pool.prepare('user-request', f.id),
      refused = expect(old).rejects.toThrow();
    f.pool.cancelPending();
    await f.pool.prepare('user-request', f.id);
    const newer = await f.pool.borrow(f.read, f.id);
    wait.resolve(await f.value());
    await refused;
    expect(newer.current()).toBe(true);
  });
  it('retires every owned lease and prevents revival on owner replacement', async () => {
    const f = await fixture();
    await f.pool.prepare('user-request', f.id);
    const a = await f.pool.borrow(f.read, f.id),
      b = await f.pool.borrow(f.read, f.id);
    f.retire();
    expect(a.current()).toBe(false);
    expect(b.current()).toBe(false);
    expect(f.urls.revoke).toHaveBeenCalledTimes(2);
    expect(() => f.pool.prepare('user-request', f.id)).toThrow();
  });
  it('does not publish a URL if the actual saved-read verification is refused', async () => {
    const f = await fixture();
    await f.pool.prepare('user-request', f.id);
    f.read.verify.mockRejectedValueOnce(Error('Original import needs recovery'));
    await expect(f.pool.borrow(f.read, f.id)).rejects.toThrow('recovery');
    expect(f.urls.create).not.toHaveBeenCalled();
  });
  it('rechecks after an awaited saved verification and does not mint for a closed view', async () => {
    const f = await fixture();
    await f.pool.prepare('user-request', f.id);
    const wait = held<void>();
    f.read.verify.mockReturnValueOnce(wait.promise);
    const pending = f.pool.borrow(f.read, f.id),
      refused = expect(pending).rejects.toThrow();
    f.closeView();
    wait.resolve();
    await refused;
    expect(f.urls.create).not.toHaveBeenCalled();
  });
  it('expires without renewing its owner or keeping URLs alive', async () => {
    const f = await fixture();
    await f.pool.prepare('user-request', f.id);
    const lease = await f.pool.borrow(f.read, f.id);
    vi.spyOn(Date, 'now').mockReturnValue(f.e.expiresAt);
    expect(lease.current()).toBe(false);
    expect(f.urls.revoke).toHaveBeenCalledWith(lease.url);
    expect(() => f.pool.prepare('user-request', f.id)).toThrow();
  });
  it('cancels explicit caller work and clears a rejected slot for deliberate retry', async () => {
    const f = await fixture(),
      caller = new AbortController();
    f.acquire.mockImplementationOnce(
      async (_id, signal) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true })
        )
    );
    const pending = f.pool.prepare('user-request', f.id, { signal: caller.signal }),
      refused = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    caller.abort();
    await refused;
    await f.pool.prepare('user-request', f.id);
    expect(f.acquire).toHaveBeenCalledTimes(2);
  });
  it('a late request failure can retire only its original global pool', async () => {
    const a = { borrow: vi.fn(), dispose: vi.fn() },
      b = { borrow: vi.fn(), dispose: vi.fn() };
    const stopA = installPreparedFilePool(a),
      stopB = installPreparedFilePool(b);
    expect(a.dispose).toHaveBeenCalledTimes(1);
    stopA();
    retireObservedFilePool(a);
    expect(currentPreparedFilePool()).toBe(b);
    expect(b.dispose).not.toHaveBeenCalled();
    stopB();
    b.dispose();
    expect(currentPreparedFilePool()).toBeNull();
  });
  it('pool retirement settles a stalled saved verification before it can create a URL', async () => {
    const f = await fixture();
    await f.pool.prepare('user-request', f.id);
    const wait = held<void>();
    f.read.verify.mockReturnValueOnce(wait.promise);
    const pending = f.pool.borrow(f.read, f.id),
      refused = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    f.pool.dispose();
    await refused;
    wait.resolve();
    expect(f.urls.create).not.toHaveBeenCalled();
  });
});

describe('private RAM residency inspection', () => {
  it('checks its independently verified generation without acquiring bytes or minting a URL', async () => {
    const f = await fixture();
    expect(await f.pool.inspect(f.read, [f.id])).toEqual([{ fileId: f.id, status: 'missing' }]);
    await f.pool.prepare('user-request', f.id);
    expect(await f.pool.inspect(f.read, [f.id])).toEqual([{ fileId: f.id, status: 'ready' }]);
    expect(f.acquire).toHaveBeenCalledTimes(1);
    expect(f.urls.create).not.toHaveBeenCalled();
    expect(f.read.verify).toHaveBeenCalledTimes(2);
  });
  it('reports a pending reservation, completion and failed refresh without old-byte fallback', async () => {
    const f = await fixture(),
      wait = held<Value>();
    f.acquire.mockReturnValueOnce(wait.promise);
    const work = f.pool.prepare('user-request', f.id);
    expect(await f.pool.inspect(f.read, [f.id])).toEqual([{ fileId: f.id, status: 'pending' }]);
    wait.resolve(await f.value());
    await work;
    f.acquire.mockRejectedValueOnce(Error('HTTP 403'));
    await expect(f.pool.prepare('user-request', f.id, { refresh: true })).rejects.toThrow();
    expect(await f.pool.inspect(f.read, [f.id])).toEqual([{ fileId: f.id, status: 'missing' }]);
  });
  it('refuses another generation before returning residency', async () => {
    const f = await fixture();
    await f.pool.prepare('user-request', f.id);
    await expect(
      f.pool.inspect({ ...f.read, envelope: { ...f.e, generation: completeId(99) } }, [f.id])
    ).rejects.toMatchObject({ code: 'scope' });
    expect(f.urls.create).not.toHaveBeenCalled();
  });
  it('caller abort settles an inspector whose independent verification never settles', async () => {
    const f = await fixture(),
      controller = new AbortController();
    f.read.verify.mockReturnValue(new Promise(() => {}));
    const check = f.pool.inspect(f.read, [f.id], controller.signal);
    controller.abort();
    await expect(check).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('pool disposal settles a stalled inspector even when no slot exists', async () => {
    const f = await fixture();
    f.read.verify.mockReturnValue(new Promise(() => {}));
    const check = f.pool.inspect(f.read, [f.id]);
    f.pool.dispose();
    await expect(check).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('rejects duplicate and oversized inspection batches before verification or allocation', async () => {
    const f = await fixture();
    await expect(f.pool.inspect(f.read, [f.id, f.id])).rejects.toMatchObject({ code: 'limit' });
    await expect(
      f.pool.inspect(
        f.read,
        Array.from({ length: 33 }, (_, n) => completeId(100 + n))
      )
    ).rejects.toMatchObject({ code: 'limit' });
    expect(f.read.verify).not.toHaveBeenCalled();
    expect(f.acquire).not.toHaveBeenCalled();
  });
  it('a retired saved owner cannot inspect even a completed slot', async () => {
    const f = await fixture();
    await f.pool.prepare('user-request', f.id);
    f.closeView();
    await expect(f.pool.inspect(f.read, [f.id])).rejects.toThrow('Saved view retired');
  });
  it('a slot aborted before its acquisition settles is missing, not pending or ready', async () => {
    const f = await fixture(),
      wait = held<Value>(),
      controller = new AbortController();
    f.acquire.mockReturnValue(wait.promise);
    const work = f.pool.prepare('user-request', f.id, { signal: controller.signal });
    controller.abort();
    expect(await f.pool.inspect(f.read, [f.id])).toEqual([{ fileId: f.id, status: 'missing' }]);
    wait.resolve(await f.value());
    await expect(work).rejects.toThrow();
  });
});
