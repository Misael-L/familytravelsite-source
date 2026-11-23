import { Blob as NativeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completeId, completeTripCaptureFixture } from '../../../tests/helpers/familyCompleteTrip';
import type { PreparedFilePool } from '../../repo/preparedFilePreview';
import { serializeCompleteTrip } from './completeTripSnapshot';
import { FamilyIdentityRegistry } from './identity';
import { plannerCacheKey, plannerCacheOwnerKey } from './plannerCache';
import { createPreparationReadiness } from './preparationReadiness';
import type { PublicVariantDescriptor, PublicVariantReady } from './publicVariantCache';
const close: (() => void)[] = [];
function held<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function fixture() {
  const input = completeTripCaptureFixture();
  input.source = 'http://127.0.0.1:55331';
  input.capturedAt = Date.now();
  input.admitReadOnly = true;
  input.ownership.key = plannerCacheKey(input.source, input.scope);
  input.ownership.ownerKey = plannerCacheOwnerKey(input.source, {
    user_id: input.scope.user_id,
    family_id: input.scope.family_id,
    person_id: input.scope.person_id,
  });
  const e = await serializeCompleteTrip(input);
  for (const v of e.data.planner.variants) {
    v.thumbUrl = e.source + '/storage/v1/object/public/catalog/variants/v1/thumb.webp';
    v.heroUrl = e.source + '/storage/v1/object/public/catalog/variants/v1/hero.webp';
  }
  let active = true;
  const read = {
    envelope: e,
    check: () => {
      if (!active) throw Error('Original owner ended');
    },
    verify: vi.fn(async () => {}),
  };
  const ready = (d: PublicVariantDescriptor): PublicVariantReady => ({
    status: 'ready',
    blob: new Blob(['bytes']),
    receipt: {
      format: 'family.public-variant.v1',
      source: d.source,
      mediaAssetId: d.mediaAssetId,
      role: d.role,
      recipe: d.recipe,
      path: new URL(d.url).pathname,
      mime: 'image/webp',
      bytes: 5,
      sha256: 'a'.repeat(64),
      capturedAt: Date.now(),
      expiresAt: Date.now() + 100000,
      writeId: completeId(99),
      width: 2,
      height: 3,
    },
  });
  const cache = {
    read: vi.fn(async (d: PublicVariantDescriptor): Promise<PublicVariantReady | { status: 'miss' }> => ready(d)),
    capture: vi.fn(),
  };
  const inspect = vi.fn<NonNullable<PreparedFilePool['inspect']>>(async (_r, files) =>
    files.map((fileId) => ({ fileId, status: 'ready' }))
  );
  let pool: PreparedFilePool | null = { inspect, borrow: vi.fn(), dispose: vi.fn() };
  const getPool = () => pool;
  const open = () => {
    const controller = createPreparationReadiness(read, { cache, privatePool: getPool });
    close.push(controller.dispose);
    return controller;
  };
  return {
    e,
    read,
    cache,
    inspect,
    ready,
    open,
    getPool,
    replace: (next: PreparedFilePool | null) => {
      pool = next;
    },
    retire: () => {
      active = false;
    },
    revive: () => {
      active = true;
    },
  };
}
beforeEach(() => vi.stubGlobal('Blob', NativeBlob));
afterEach(() => {
  for (const stop of close.splice(0)) stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('truthful preparation status', () => {
  it('is lazy and reports component observations without download, URLs, private data or whole-Trip success', async () => {
    const f = await fixture(),
      before = JSON.stringify(f.e),
      controller = f.open();
    expect(f.cache.read).not.toHaveBeenCalled();
    expect(f.inspect).not.toHaveBeenCalled();
    const value = await controller.inspect();
    expect(value).toMatchObject({
      format: 'family.preparation-readiness.v1',
      generation: f.e.generation,
      snapshotDigest: f.e.digest,
      expiresAt: f.e.expiresAt,
      wholeTripReady: false,
      metadata: { status: 'available', persistence: 'indexeddb' },
      publicImages: { status: 'complete', counts: { ready: 2 } },
      privateFiles: {
        status: 'complete',
        persistence: 'document-memory',
        afterRestart: 'unavailable',
        counts: { ready: 1 },
      },
      mapSearch: { status: 'unsupported' },
      nativeOutcome: { status: 'skipped', reason: 'planner-scope' },
    });
    expect(f.cache.capture).not.toHaveBeenCalled();
    expect(f.getPool()?.borrow).not.toHaveBeenCalled();
    expect(JSON.stringify(value)).not.toMatch(/blob:|original\.pdf|storage_path|token|trip-files|\/storage\//);
    expect(JSON.stringify(f.e)).toBe(before);
  });
  it('rechecks actual residency on each request instead of accepting an earlier successful receipt', async () => {
    const f = await fixture(),
      controller = f.open();
    expect((await controller.inspect()).publicImages.counts.ready).toBe(2);
    f.cache.read.mockResolvedValue({ status: 'miss' });
    f.replace(null);
    expect(await controller.inspect()).toMatchObject({
      publicImages: { status: 'partial', counts: { missing: 2, ready: 0 } },
      privateFiles: { status: 'partial', counts: { missing: 1, ready: 0 } },
    });
  });
  it('keeps empty image/file components distinct from a prepared Trip', async () => {
    const f = await fixture();
    f.e.data.planner.view.state.locations.forEach((v) => {
      v.cover_media_id = null;
    });
    f.e.data.companions.files = [];
    expect(await f.open().inspect()).toMatchObject({
      publicImages: { status: 'empty', counts: { inspected: 0 } },
      privateFiles: { status: 'empty', afterRestart: 'not-needed' },
      wholeTripReady: false,
    });
    expect(f.cache.read).not.toHaveBeenCalled();
  });
  it('reports failed public reads without turning them into cache misses or false completion', async () => {
    const f = await fixture();
    f.cache.read.mockRejectedValue(Error('Storage denied'));
    expect((await f.open().inspect()).publicImages).toMatchObject({
      status: 'partial',
      counts: { failed: 2, missing: 0 },
    });
  });
  it('refuses a mismatched public source/role receipt', async () => {
    const f = await fixture();
    f.cache.read.mockImplementation(async (d) => ({
      ...f.ready(d),
      receipt: { ...f.ready(d).receipt, source: 'https://wrong.invalid' },
    }));
    expect((await f.open().inspect()).publicImages.counts.failed).toBe(2);
  });
  it('keeps missing roles and unknown recipes unavailable without using originals', async () => {
    const f = await fixture();
    f.e.data.planner.variants[0].heroUrl = null;
    expect((await f.open().inspect()).publicImages).toMatchObject({
      status: 'partial',
      counts: { ready: 1, unavailable: 1 },
    });
    f.e.data.planner.variants[0].recipeVersion = 'v2';
    expect((await f.open().inspect()).publicImages.counts.unavailable).toBe(2);
  });
  it('deduplicates repeated covers and ignores unrelated gallery variants', async () => {
    const f = await fixture();
    f.e.data.planner.view.state.locations.push({ ...f.e.data.planner.view.state.locations[0] });
    f.e.data.planner.variants.push({ ...f.e.data.planner.variants[0], mediaAssetId: completeId(99) });
    expect((await f.open().inspect()).publicImages.counts.inspected).toBe(2);
    expect(f.cache.read).toHaveBeenCalledTimes(2);
  });
  it('bounds image inspections and reports uninspected entries as deferred', async () => {
    const f = await fixture(),
      base = f.e.data.planner.variants[0],
      location = f.e.data.planner.view.state.locations[0];
    for (let n = 1; n < 20; n++) {
      const id = completeId(100 + n);
      f.e.data.planner.variants.push({ ...base, mediaAssetId: id });
      f.e.data.planner.view.state.locations.push({ ...location, id: completeId(200 + n), cover_media_id: id });
    }
    expect((await f.open().inspect()).publicImages).toMatchObject({
      status: 'partial',
      counts: { eligible: 40, inspected: 32, deferred: 8, ready: 32 },
    });
    expect(f.cache.capture).not.toHaveBeenCalled();
  });
  it('bounds private inspections and never increases the preparation pool budget', async () => {
    const f = await fixture(),
      base = f.e.data.companions.files[0];
    f.e.data.companions.files = Array.from({ length: 40 }, (_, n) => ({ ...base, id: completeId(300 + n) }));
    f.e.bindings.push(
      ...f.e.data.companions.files.map((v) => ({
        kind: 'file' as const,
        uuid: v.id,
        key: new FamilyIdentityRegistry(f.e.scope.user_id).register('file', v.id),
      }))
    );
    f.e.media.push(
      ...f.e.data.companions.files.map((v) => ({
        kind: 'file' as const,
        id: v.id,
        reference: v.storage_path,
        bytesAvailable: false as const,
      }))
    );
    expect((await f.open().inspect()).privateFiles).toMatchObject({
      status: 'partial',
      counts: { total: 40, inspected: 32, deferred: 8, ready: 32 },
    });
    expect(f.inspect.mock.calls[0][1]).toHaveLength(32);
  });
  it('marks oversized/unsupported metadata instead of trying a private download', async () => {
    const f = await fixture();
    f.e.data.companions.files[0].size_bytes = 52428801;
    expect((await f.open().inspect()).privateFiles).toMatchObject({
      status: 'partial',
      counts: { unsupported: 1, ready: 0, inspected: 0 },
    });
    expect(f.inspect).not.toHaveBeenCalled();
  });
  it('keeps in-flight private bytes pending and current-document-only', async () => {
    const f = await fixture();
    f.inspect.mockImplementation(async (_r, files) => files.map((fileId) => ({ fileId, status: 'pending' })));
    expect((await f.open().inspect()).privateFiles).toMatchObject({
      status: 'partial',
      afterRestart: 'unavailable',
      counts: { pending: 1, ready: 0 },
    });
  });
  it('does not fall back to older pool providers without an inspection contract', async () => {
    const f = await fixture(),
      borrow = vi.fn();
    f.replace({ borrow, dispose: vi.fn() });
    expect((await f.open().inspect()).privateFiles.counts.missing).toBe(1);
    expect(borrow).not.toHaveBeenCalled();
  });
  it.each(['foreign', 'duplicate', 'empty', 'unknown-status'])(
    'rejects a malformed private residency response: %s',
    async (reason) => {
      const f = await fixture(),
        fileId = f.e.data.companions.files[0].id;
      f.inspect.mockResolvedValue(
        reason === 'empty'
          ? []
          : reason === 'duplicate'
            ? [
                { fileId, status: 'ready' },
                { fileId, status: 'ready' },
              ]
            : [
                {
                  fileId: reason === 'foreign' ? completeId(99) : fileId,
                  status: reason === 'unknown-status' ? ('invalid' as 'ready') : 'ready',
                },
              ]
      );
      expect((await f.open().inspect()).privateFiles).toMatchObject({
        status: 'partial',
        counts: { failed: 1, ready: 0 },
      });
    }
  );
  it('refuses private results from a pool that was replaced while inspecting', async () => {
    const f = await fixture();
    f.inspect.mockImplementation(async (_r, files) => {
      f.replace(null);
      return files.map((fileId) => ({ fileId, status: 'ready' }));
    });
    expect((await f.open().inspect()).privateFiles.counts.failed).toBe(1);
  });
  it('keeps private access errors explicit without retiring unrelated public bytes', async () => {
    const f = await fixture();
    f.inspect.mockRejectedValue(Error('Owner expired'));
    expect(await f.open().inspect()).toMatchObject({
      publicImages: { status: 'complete' },
      privateFiles: { status: 'partial', counts: { failed: 1 } },
    });
    expect(f.getPool()?.dispose).not.toHaveBeenCalled();
  });
  it.each(['source', 'trip', 'person', 'generation', 'digest', 'ownership'])(
    'cannot rebind an original observer after %s replacement',
    async (key) => {
      const f = await fixture(),
        controller = f.open();
      if (key === 'source') f.e.source = 'http://localhost:55331';
      if (key === 'trip') f.e.scope.trip_id = completeId(99);
      if (key === 'person') f.e.scope.person_id = completeId(99);
      if (key === 'generation') f.e.generation = completeId(99);
      if (key === 'digest') f.e.digest = 'e'.repeat(64);
      if (key === 'ownership') f.e.ownership.ownerGeneration = completeId(99);
      await expect(controller.inspect()).rejects.toMatchObject({ code: 'scope' });
      expect(f.cache.read).not.toHaveBeenCalled();
    }
  );
  it('preserves the original expiry and refuses a backward calendar clock', async () => {
    const f = await fixture(),
      controller = f.open();
    vi.spyOn(Date, 'now').mockReturnValue(f.e.verifiedAt - 1);
    await expect(controller.inspect()).rejects.toMatchObject({ code: 'scope' });
    vi.mocked(Date.now).mockReturnValue(f.e.expiresAt);
    await expect(controller.inspect()).rejects.toMatchObject({ code: 'scope' });
  });
  it('enforces the monotonic deadline even if wall time is moved back into the valid interval', async () => {
    const f = await fixture(),
      clock = vi.spyOn(performance, 'now').mockReturnValue(1),
      controller = f.open();
    clock.mockReturnValue(900002);
    await expect(controller.inspect()).rejects.toMatchObject({ code: 'scope' });
  });
  it('caller cancellation settles a stalled verification without publishing or leaving busy state stuck', async () => {
    const f = await fixture(),
      wait = held<void>(),
      controller = f.open(),
      abort = new AbortController();
    f.read.verify.mockReturnValueOnce(wait.promise);
    const result = controller.inspect({ signal: abort.signal });
    abort.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    wait.resolve();
    await expect(controller.inspect()).resolves.toMatchObject({ wholeTripReady: false });
  });
  it('disposal settles a stalled cache read and late bytes cannot publish', async () => {
    const f = await fixture(),
      wait = held<PublicVariantReady>(),
      controller = f.open();
    f.cache.read.mockReturnValueOnce(wait.promise);
    const result = controller.inspect();
    await vi.waitFor(() => expect(f.cache.read).toHaveBeenCalled());
    controller.dispose();
    await expect(result).rejects.toThrow();
    wait.resolve(
      f.ready({
        source: f.e.source,
        role: 'thumb',
        recipe: 'v1',
        mediaAssetId: completeId(9),
        url: String(f.e.data.planner.variants[0].thumbUrl),
      })
    );
    await expect(controller.inspect()).rejects.toThrow();
  });
  it('refuses overlapping observations rather than merging their results', async () => {
    const f = await fixture(),
      wait = held<void>(),
      controller = f.open();
    f.read.verify.mockReturnValueOnce(wait.promise);
    const first = controller.inspect();
    await expect(controller.inspect()).rejects.toMatchObject({ code: 'busy' });
    wait.resolve();
    await first;
  });
  it('a final original-generation verification failure cannot be reported as component success', async () => {
    const f = await fixture();
    f.inspect.mockImplementation(async (_r, files) => {
      f.read.verify.mockRejectedValueOnce(Error('Generation replaced'));
      return files.map((fileId) => ({ fileId, status: 'ready' }));
    });
    await expect(f.open().inspect()).rejects.toThrow('Generation replaced');
  });
  it('an owner retirement during a private read is not downgraded to partial readiness', async () => {
    const f = await fixture();
    f.inspect.mockImplementation(async () => {
      f.retire();
      throw Error('Retired');
    });
    await expect(f.open().inspect()).rejects.toThrow('Original owner ended');
  });
  it('one disposed observer does not erase another observer or any shared public/private bytes', async () => {
    const f = await fixture(),
      a = f.open(),
      b = f.open();
    a.dispose();
    await expect(a.inspect()).rejects.toThrow();
    await expect(b.inspect()).resolves.toMatchObject({ publicImages: { status: 'complete' } });
    expect(f.getPool()?.dispose).not.toHaveBeenCalled();
  });
});
