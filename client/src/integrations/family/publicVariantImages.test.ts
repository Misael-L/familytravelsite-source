import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completeId, completeSource, completeTripCaptureFixture } from '../../../tests/helpers/familyCompleteTrip';
import { notifyPrivateSessionEnd } from '../../db/privateSessionEvents';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { notifyFamilyActorChange } from './actorEvents';
import { serializeCompleteTrip, type CompleteTripEnvelope } from './completeTripSnapshot';
import type { PublicVariantContext, PublicVariantDescriptor, PublicVariantReady } from './publicVariantCache';
import { createPublicVariantImages, type PublicVariantDisplay } from './publicVariantImages';

const source = completeSource,
  id = completeId(9);
const hero = source + '/storage/v1/object/public/catalog/variants/v1/hero.webp';
const thumb = hero.replace('hero.webp', 'thumb.webp');
const descriptor = (role: 'hero' | 'thumb' = 'hero'): PublicVariantDisplay => ({
  mediaAssetId: id,
  recipe: 'v1',
  role,
  url: role === 'hero' ? hero : thumb,
});
let envelope: CompleteTripEnvelope;
let scopes: ReturnType<typeof createPublicVariantImages>[] = [];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
function setup() {
  let active = true;
  const check = vi.fn(() => {
    if (!active) throw Error('Original Trip ended');
  });
  const read = vi.fn<
    (value: PublicVariantDescriptor, context: PublicVariantContext) => Promise<PublicVariantReady | { status: 'miss' }>
  >(async (value: PublicVariantDescriptor): Promise<PublicVariantReady | { status: 'miss' }> => ({
    status: 'ready',
    blob: new Blob(['synthetic checked bytes'], { type: 'image/webp' }),
    receipt: {
      source: value.source,
      mediaAssetId: value.mediaAssetId,
      role: value.role,
      recipe: value.recipe,
      format: 'family.public-variant.v1',
      path: new URL(value.url).pathname,
      mime: 'image/webp',
      bytes: 23,
      sha256: 'a'.repeat(64),
      capturedAt: Date.now(),
      expiresAt: Date.now() + 604800000,
      writeId: id,
      width: 2,
      height: 3,
    },
  }));
  let number = 0;
  const createURL = vi.fn(() => 'blob:display-' + ++number),
    revokeURL = vi.fn();
  const lease = { envelope, check, current: () => active };
  const open = () => {
    const scope = createPublicVariantImages(lease, { reader: { read }, createURL, revokeURL });
    scopes.push(scope);
    return scope;
  };
  return {
    lease,
    read,
    createURL,
    revokeURL,
    open,
    retire: () => {
      active = false;
    },
  };
}
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
  _resetNetworkMode();
  setForcedOffline(true);
  envelope = await serializeCompleteTrip({
    ...completeTripCaptureFixture(),
    capturedAt: Date.now(),
    admitReadOnly: true,
  });
});
afterEach(() => {
  for (const scope of scopes) scope.dispose();
  scopes = [];
  _resetNetworkMode();
  vi.useRealTimers();
});

describe('saved Trip public-image display leases', () => {
  it('deduplicates one hero across repeated consumers and keeps roles distinct', async () => {
    const f = setup(),
      scope = f.open();
    const before = JSON.stringify(f.lease.envelope);
    const urls = await Promise.all([
      scope.resolve(descriptor()),
      scope.resolve(descriptor()),
      scope.resolve(descriptor('thumb')),
    ]);
    expect(urls).toEqual(['blob:display-1', 'blob:display-1', 'blob:display-2']);
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(f.read.mock.calls[0][0]).toEqual({ source, ...descriptor() });
    expect(JSON.stringify(f.lease.envelope)).toBe(before);
    scope.dispose();
    scope.dispose();
    expect(f.revokeURL.mock.calls.flat()).toEqual(['blob:display-1', 'blob:display-2']);
  });
  it.each([
    { url: hero + '?token=forbidden' },
    { url: hero.replace('/object/public/', '/render/image/public/') },
    { url: hero.replace(source, 'http://localhost:55331') },
    { url: source + '/storage/v1/object/public/catalog/original.jpg' },
    { mediaAssetId: completeId(99) },
    { recipe: 'v2' },
  ])('does not resolve anything outside this exact accepted manifest %j', async (extra) => {
    const f = setup(),
      scope = f.open();
    expect(await scope.resolve({ ...descriptor(), ...extra } as PublicVariantDisplay)).toBeNull();
    expect(f.read).not.toHaveBeenCalled();
    expect(f.createURL).not.toHaveBeenCalled();
  });
  it.each(['miss', 'corrupt', 'storage', 'cancelled'])(
    'shows a placeholder for unavailable %s bytes while keeping the Trip fence',
    async (mode) => {
      const f = setup(),
        scope = f.open();
      if (mode === 'miss' || mode === 'corrupt') f.read.mockResolvedValueOnce({ status: 'miss' });
      else f.read.mockRejectedValueOnce(Error(mode));
      expect(await scope.resolve(descriptor())).toBeNull();
      expect(f.createURL).not.toHaveBeenCalled();
      expect(scope.current()).toBe(true);
    }
  );
  it.each(['source', 'mediaAssetId', 'role', 'recipe', 'path'])(
    'refuses a returned receipt with mismatched %s identity',
    async (field) => {
      const f = setup(),
        scope = f.open(),
        ready = await f.read({ source, ...descriptor() }, { current: () => true });
      if (ready.status !== 'ready') throw Error('test receipt');
      f.read.mockResolvedValueOnce({ ...ready, receipt: { ...ready.receipt, [field]: 'different' } });
      expect(await scope.resolve(descriptor())).toBeNull();
      expect(f.createURL).not.toHaveBeenCalled();
    }
  );
  it.each(['actor', 'SDK', 'network', 'expiry', 'scope'])(
    'releases minted URLs on %s retirement and refuses reuse',
    async (event) => {
      const f = setup(),
        scope = f.open();
      await scope.resolve(descriptor());
      if (event === 'actor') notifyFamilyActorChange();
      if (event === 'SDK') notifyPrivateSessionEnd();
      if (event === 'network') setForcedOffline(false);
      if (event === 'expiry') await vi.advanceTimersByTimeAsync(900000);
      if (event === 'scope') {
        f.retire();
        await vi.advanceTimersByTimeAsync(1000);
      }
      expect(scope.current()).toBe(false);
      expect(f.revokeURL).toHaveBeenCalledExactlyOnceWith('blob:display-1');
      await expect(scope.resolve(descriptor())).rejects.toThrow();
    }
  );
  it('cancels a delayed read without minting after the original generation ends', async () => {
    const f = setup(),
      scope = f.open(),
      wait = deferred<PublicVariantReady | { status: 'miss' }>();
    f.read.mockReturnValueOnce(wait.promise);
    const pending = scope.resolve(descriptor()),
      rejection = expect(pending).rejects.toThrow();
    const original = await setup().read({ source, ...descriptor() }, { current: () => true });
    const signal = f.read.mock.calls[0]?.[1].signal;
    expect(signal?.aborted).toBe(false);
    scope.dispose();
    expect(signal?.aborted).toBe(true);
    wait.resolve(original);
    await rejection;
    expect(f.createURL).not.toHaveBeenCalled();
  });
  it('does not mint after an actual Trip fence failure even if the cache returns ready', async () => {
    const f = setup(),
      scope = f.open(),
      wait = deferred<PublicVariantReady | { status: 'miss' }>();
    const ready = await f.read({ source, ...descriptor() }, { current: () => true });
    f.read.mockReturnValueOnce(wait.promise);
    const pending = scope.resolve(descriptor()),
      rejection = expect(pending).rejects.toThrow('Original Trip ended');
    const signal = f.read.mock.lastCall?.[1].signal;
    expect(signal?.aborted).toBe(false);
    f.retire();
    await vi.advanceTimersByTimeAsync(1000);
    const abortedBeforeCompletion = signal?.aborted;
    wait.resolve(ready);
    await rejection;
    expect(abortedBeforeCompletion).toBe(true);
    expect(f.createURL).not.toHaveBeenCalled();
  });
  it('releases the newly minted URL when retirement occurs inside URL creation', async () => {
    const f = setup(),
      scope = f.open();
    f.createURL.mockImplementationOnce(() => {
      scope.dispose();
      return 'blob:late';
    });
    await expect(scope.resolve(descriptor())).rejects.toThrow();
    expect(f.revokeURL).toHaveBeenCalledExactlyOnceWith('blob:late');
  });
  it('older delayed cleanup never revokes a newer view URL', async () => {
    const f = setup(),
      old = f.open(),
      wait = deferred<PublicVariantReady | { status: 'miss' }>(),
      ready = await f.read({ source, ...descriptor() }, { current: () => true });
    f.read.mockReturnValueOnce(wait.promise);
    const pending = old.resolve(descriptor()),
      rejection = expect(pending).rejects.toThrow();
    old.dispose();
    const next = f.open();
    const live = await next.resolve(descriptor());
    wait.resolve(ready);
    await rejection;
    expect(f.revokeURL).not.toHaveBeenCalledWith(live);
    expect(next.current()).toBe(true);
    next.dispose();
    expect(f.revokeURL).toHaveBeenCalledExactlyOnceWith(live);
  });
});
