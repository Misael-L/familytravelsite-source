import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompleteTripEnvelope } from './completeTripSnapshot';
import { createPublicImagePreparation, type PublicImagePreparationRead } from './publicImagePreparation';
import {
  PublicVariantCacheError,
  type PublicVariantContext,
  type PublicVariantDescriptor,
  type PublicVariantReady,
} from './publicVariantCache';
const source = 'http://127.0.0.1:55331';
const id = (n: number) => 'a16a1100-0000-4000-8000-' + String(n).padStart(12, '0');
const scopes: ReturnType<typeof createPublicImagePreparation>[] = [];
function ready(d: PublicVariantDescriptor): PublicVariantReady {
  return {
    status: 'ready',
    blob: new Blob(['bytes'], { type: 'image/webp' }),
    receipt: {
      format: 'family.public-variant.v1',
      source: d.source,
      mediaAssetId: d.mediaAssetId,
      recipe: d.recipe,
      role: d.role,
      path: new URL(d.url).pathname,
      mime: 'image/webp',
      bytes: 5,
      sha256: 'a'.repeat(64),
      capturedAt: Date.now(),
      expiresAt: Date.now() + 604800000,
      writeId: id(80),
      width: 2,
      height: 3,
    },
  };
}
function setup(count = 1) {
  let active = true;
  const variants = Array.from({ length: count }, (_, n) => ({
    mediaAssetId: id(n + 1),
    recipeVersion: 'v1',
    thumbUrl: source + '/storage/v1/object/public/catalog/variants/v1/a/thumb-' + n + '.webp',
    heroUrl: source + '/storage/v1/object/public/catalog/variants/v1/a/hero-' + n + '.webp',
  }));
  const envelope = {
    format: 'family.offline-trip.v2',
    generation: id(90),
    digest: 'b'.repeat(64),
    source,
    verifiedAt: Date.now(),
    expiresAt: Date.now() + 900000,
    scope: { trip_id: id(91), layer: 'published' },
    ownership: { ownerGeneration: id(92) },
    capabilities: { mediaBytes: false },
    data: {
      planner: { variants, view: { state: { locations: variants.map((v) => ({ cover_media_id: v.mediaAssetId })) } } },
    },
  } as unknown as CompleteTripEnvelope;
  const read: PublicImagePreparationRead = {
    envelope,
    check: () => {
      if (!active) throw Error('Original scope ended');
    },
    current: () => active,
    verify: vi.fn(async () => {
      read.check();
    }),
  };
  const cache = {
    capture: vi.fn<
      (
        d: PublicVariantDescriptor,
        context: PublicVariantContext,
        options?: { refresh?: boolean }
      ) => Promise<PublicVariantReady>
    >(async (d) => ready(d)),
    read: vi.fn(async (d: PublicVariantDescriptor): Promise<PublicVariantReady | { status: 'miss' }> => ready(d)),
  };
  const open = () => {
    const component = createPublicImagePreparation(read, cache);
    scopes.push(component);
    return component;
  };
  return {
    envelope,
    read,
    cache,
    open,
    retire: () => {
      active = false;
    },
  };
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
});
afterEach(() => {
  for (const s of scopes) s.dispose();
  scopes.length = 0;
  vi.useRealTimers();
});
describe('explicit public-image component', () => {
  it('does nothing until an explicit action and returns an image-only observation without editing the generation', async () => {
    const f = setup(),
      before = JSON.stringify(f.envelope),
      component = f.open();
    expect(f.cache.capture).not.toHaveBeenCalled();
    expect(f.cache.read).not.toHaveBeenCalled();
    await expect(component.prepare('background' as 'user-request')).rejects.toMatchObject({ code: 'intent' });
    const receipt = await component.prepare('user-request');
    expect(receipt).toMatchObject({
      format: 'family.public-image-preparation.v1',
      component: 'public-location-images',
      status: 'complete',
      generation: id(90),
      snapshotDigest: 'b'.repeat(64),
      counts: { eligible: 2, ready: 2, deferred: 0, failed: 0, missing: 0 },
    });
    expect(f.cache.capture.mock.calls.map((c) => c[0].role)).toEqual(['thumb', 'hero']);
    expect(f.cache.read).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(f.envelope)).toBe(before);
    expect(receipt).not.toHaveProperty('mediaBytes');
    expect(receipt).not.toHaveProperty('trips');
    expect(receipt.items[0]).not.toHaveProperty('blob');
  });
  it('deduplicates cover assets across repeated locations and never captures unrelated gallery assets', async () => {
    const f = setup();
    f.envelope.data.planner.view.state.locations.push(f.envelope.data.planner.view.state.locations[0]);
    f.envelope.data.planner.variants.push({ ...f.envelope.data.planner.variants[0], mediaAssetId: id(99) });
    expect((await f.open().prepare('user-request')).counts.assets).toBe(1);
    expect(f.cache.capture).toHaveBeenCalledTimes(2);
  });
  it('reports a missing role as unavailable without substituting the original', async () => {
    const f = setup();
    f.envelope.data.planner.variants[0].heroUrl = null;
    expect(await f.open().prepare('user-request')).toMatchObject({
      status: 'partial',
      counts: { ready: 1, unavailable: 1 },
    });
    expect(f.cache.capture).toHaveBeenCalledTimes(1);
  });
  it('keeps unknown recipes unavailable instead of upgrading or falling back', async () => {
    const f = setup();
    f.envelope.data.planner.variants[0].recipeVersion = 'v2';
    expect(await f.open().prepare('user-request')).toMatchObject({
      status: 'partial',
      counts: { eligible: 0, unavailable: 2 },
    });
    expect(f.cache.capture).not.toHaveBeenCalled();
  });
  it('reports no-cover content as empty, not a completed download', async () => {
    const f = setup(0);
    expect(await f.open().prepare('user-request')).toMatchObject({ status: 'empty', counts: { ready: 0 } });
    expect(f.cache.capture).not.toHaveBeenCalled();
  });
  it('bounds each batch and allows a later explicit offset without claiming earlier residency', async () => {
    const f = setup(20),
      component = f.open();
    expect(await component.prepare('user-request')).toMatchObject({
      status: 'partial',
      counts: { selected: 32, deferred: 8 },
      selection: { offset: 0, nextOffset: 32 },
    });
    f.cache.capture.mockClear();
    expect(await component.prepare('user-request', { offset: 32 })).toMatchObject({
      status: 'partial',
      counts: { selected: 8, deferred: 32 },
      selection: { offset: 32, nextOffset: null },
    });
    expect(f.cache.capture).toHaveBeenCalledTimes(8);
  });
  it.each([-1, 0.5, 99, NaN])('refuses invalid batch offset %s before capture', async (offset) => {
    const f = setup();
    await expect(f.open().prepare('user-request', { offset })).rejects.toMatchObject({ code: 'intent' });
    expect(f.cache.capture).not.toHaveBeenCalled();
  });
  it.each(['family.offline-trip.v1', 'future'])('refuses unsupported complete format %s', (format) => {
    const f = setup();
    Object.assign(f.envelope, { format });
    expect(f.open).toThrow();
  });
  it('refuses a draft or hosted source before capture', () => {
    for (const change of [{ source: 'https://project.supabase.invalid' }, { scope: { layer: 'myDraft' } }]) {
      const f = setup();
      Object.assign(f.envelope, change);
      expect(f.open).toThrow();
      expect(f.cache.capture).not.toHaveBeenCalled();
    }
  });
  it('reports bounded cache failure reasons without replacing an unknown entry', async () => {
    const f = setup();
    f.cache.capture.mockRejectedValueOnce(new PublicVariantCacheError('entry'));
    expect(await f.open().prepare('user-request')).toMatchObject({
      status: 'partial',
      counts: { failed: 1, ready: 1 },
      items: [{ status: 'failed', reason: 'entry' }, { status: 'ready' }],
    });
    expect(f.cache).not.toHaveProperty('remove');
  });
  it('does not count a mismatched receipt as ready', async () => {
    const f = setup();
    f.cache.capture.mockImplementationOnce(async (d) => ({
      ...ready(d),
      receipt: { ...ready(d).receipt, mediaAssetId: id(99) },
    }));
    expect(await f.open().prepare('user-request')).toMatchObject({
      status: 'partial',
      counts: { failed: 1, ready: 1 },
    });
  });
  it('detects eviction after capture rather than trusting its earlier success', async () => {
    const f = setup();
    f.cache.read.mockResolvedValueOnce({ status: 'miss' });
    expect(await f.open().prepare('user-request')).toMatchObject({
      status: 'partial',
      counts: { missing: 1, ready: 1 },
    });
  });
  it('reports failed final validation as partial', async () => {
    const f = setup();
    f.cache.read.mockRejectedValueOnce(new PublicVariantCacheError('storage'));
    expect(await f.open().prepare('user-request')).toMatchObject({
      status: 'partial',
      counts: { failed: 1, ready: 1 },
    });
  });
  it('passes explicit refresh through and leaves the original private expiry unchanged across retry', async () => {
    const f = setup(),
      component = f.open(),
      expires = f.envelope.expiresAt;
    await component.prepare('user-request');
    await component.prepare('user-request', { refresh: true });
    expect(f.cache.capture.mock.calls[f.cache.capture.mock.calls.length - 1]?.[2]).toEqual({ refresh: true });
    expect(f.envelope.expiresAt).toBe(expires);
  });
  it('refuses overlapping runs instead of sharing an old action callback', async () => {
    const f = setup(),
      barrier = deferred<PublicVariantReady>(),
      component = f.open();
    f.cache.capture.mockImplementationOnce(() => barrier.promise);
    const run = component.prepare('user-request');
    await vi.waitFor(() => expect(f.cache.capture).toHaveBeenCalled());
    await expect(component.prepare('user-request')).rejects.toMatchObject({ code: 'busy' });
    barrier.resolve(ready(f.cache.capture.mock.calls[0][0]));
    await run;
  });
  it.each(['dispose', 'abort', 'expiry', 'actor'])('returns no late result after %s', async (reason) => {
    const f = setup(),
      barrier = deferred<PublicVariantReady>(),
      component = f.open(),
      abort = new AbortController();
    f.cache.capture.mockImplementationOnce(() => barrier.promise);
    const run = component.prepare('user-request', { signal: abort.signal });
    const rejected = expect(run).rejects.toThrow();
    await vi.waitFor(() => expect(f.cache.capture).toHaveBeenCalled());
    if (reason === 'dispose') {
      component.dispose();
      component.dispose();
    }
    if (reason === 'abort') abort.abort();
    if (reason === 'expiry') vi.advanceTimersByTime(900001);
    if (reason === 'actor') f.retire();
    barrier.resolve(ready(f.cache.capture.mock.calls[0][0]));
    await rejected;
    expect(f.cache.read).not.toHaveBeenCalled();
  });
  it.each(['generation', 'source', 'ownership', 'scope', 'expiry'])(
    'rejects a changed %s binding across an await',
    async (key) => {
      const f = setup();
      f.cache.capture.mockImplementationOnce(async (d) => {
        if (key === 'generation') f.envelope.generation = id(77);
        if (key === 'source') f.envelope.source = 'http://localhost:55331';
        if (key === 'ownership') f.envelope.ownership.ownerGeneration = id(76);
        if (key === 'scope') f.envelope.scope.trip_id = id(75);
        if (key === 'expiry') f.envelope.expiresAt++;
        return ready(d);
      });
      await expect(f.open().prepare('user-request')).rejects.toThrow();
      expect(f.cache.read).not.toHaveBeenCalled();
    }
  );
  it('never turns a failed generation verification into a partial success', async () => {
    const f = setup();
    f.cache.capture.mockImplementationOnce(async (d) => {
      f.read.verify = vi.fn(async () => {
        throw Error('Original generation changed');
      });
      return ready(d);
    });
    await expect(f.open().prepare('user-request')).rejects.toThrow('Original generation changed');
    expect(f.cache.capture).toHaveBeenCalledTimes(1);
  });
});
