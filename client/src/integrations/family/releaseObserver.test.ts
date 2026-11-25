import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerVersionStore } from '../../store/serverVersionStore';
import { createFamilyApplicationHandler } from './applicationHandler';
import { createFamilyReleaseObserver, type BuildDescriptor } from './releaseObserver';

const build = (version = 'family-2026.11.11.1'): BuildDescriptor => ({
  format: 'family.build.v1',
  version,
  entry: { path: '/assets/index-one.js', bytes: 1, sha256: '0'.repeat(64) },
});
let stop: (() => void) | undefined, worker: EventTarget;
beforeEach(() => {
  vi.useFakeTimers();
  worker = new EventTarget();
  Object.defineProperty(navigator, 'serviceWorker', { value: worker, configurable: true });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  useServerVersionStore.setState({ first: null, reported: null });
});
afterEach(() => {
  stop?.();
  stop = undefined;
  Reflect.deleteProperty(navigator, 'serviceWorker');
  vi.useRealTimers();
  vi.restoreAllMocks();
});
type ReadBuildDescriptor = NonNullable<typeof globalThis.FamilyBuildContract>['read'];

function holdBuildDescriptor() {
  let finish!: (value: BuildDescriptor) => void;
  const pending = new Promise<BuildDescriptor>((resolve) => {
    finish = resolve;
  });
  return { read: vi.fn<ReadBuildDescriptor>(() => pending), finish };
}

function setup(
  read = vi.fn<ReadBuildDescriptor>(async () => build()),
  options: Parameters<typeof createFamilyReleaseObserver>[2] = {}
) {
  const observer = createFamilyReleaseObserver(vi.fn(), () => 'source-one', {
    offline: () => false,
    contract: () => ({ read }),
    ...options,
  });
  stop = observer.dispose;
  return { observer, read };
}
describe('Family release observer, real native version store and scoped config', () => {
  it('passes a real observed deployment version through the exported handler factory', async () => {
    const { observer } = setup();
    const handler = createFamilyApplicationHandler(undefined, observer.readVersion);
    const ctrl = new AbortController();
    const response = await handler({
      method: 'GET',
      pathname: '/auth/app-config',
      query: new URLSearchParams(),
      body: null,
      signal: ctrl.signal,
    });
    expect(response).toMatchObject({ version: build().version, allow_registration: false, managed: true });
    expect(useServerVersionStore.getState().reported).toBeNull();
  });
  it('falls back to the bundle label when public observation is unavailable', async () => {
    const { observer, read } = setup();
    read.mockResolvedValue(null);
    const handler = createFamilyApplicationHandler(undefined, observer.readVersion);
    expect(
      await handler({ method: 'GET', pathname: '/auth/app-config', query: new URLSearchParams(), body: null })
    ).toMatchObject({ version: __TREK_UI_VERSION__ });
    expect(read).toHaveBeenCalledOnce();
  });
  it('coalesces concurrent config reads and reports real controller changes to native store', async () => {
    const { observer, read } = setup();
    expect(await Promise.all([observer.readVersion(), observer.readVersion()])).toEqual([
      build().version,
      build().version,
    ]);
    expect(read).toHaveBeenCalledTimes(1);
    useServerVersionStore.getState().note(build().version);
    read.mockResolvedValue(build('family-2026.11.11.2'));
    for (let i = 0; i < 8; i++) {
      worker.dispatchEvent(new Event('controllerchange'));
      window.dispatchEvent(new Event('focus'));
    }
    await vi.advanceTimersByTimeAsync(1100);
    expect(read).toHaveBeenCalledTimes(2);
    expect(useServerVersionStore.getState()).toMatchObject({ first: build().version, reported: 'family-2026.11.11.2' });
  });
  it('does not establish a first native report before initial app-config', async () => {
    setup();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(useServerVersionStore.getState().first).toBeNull();
  });
  it('keeps same release stable and polls only visible/online pages', async () => {
    let offline = false;
    const { read } = setup(undefined, { offline: () => offline });
    useServerVersionStore.getState().note(build().version);
    await vi.advanceTimersByTimeAsync(61000);
    expect(read).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await vi.advanceTimersByTimeAsync(61000);
    expect(read).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    offline = true;
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(61000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(useServerVersionStore.getState()).toMatchObject({ first: build().version, reported: build().version });
  });
  it.each(['source', 'dispose', 'offline'])('fences a late response after %s', async (reason) => {
    let source = 'one',
      offline = false;
    const { read, finish } = holdBuildDescriptor();
    const observer = createFamilyReleaseObserver(vi.fn(), () => source, {
      offline: () => offline,
      contract: () => ({ read }),
    });
    stop = observer.dispose;
    const pending = observer.readVersion();
    expect(read).toHaveBeenCalledOnce();
    if (reason === 'source') source = 'two';
    if (reason === 'dispose') observer.dispose();
    if (reason === 'offline') offline = true;
    expect(read.mock.lastCall?.[2]?.signal?.aborted).toBe(reason === 'dispose');
    finish(build());
    await expect(pending).resolves.toBeNull();
  });
  it('caller cancellation does not cancel another coalesced reader', async () => {
    const { read, finish } = holdBuildDescriptor();
    const { observer } = setup(read);
    const ctrl = new AbortController();
    const cancelled = observer.readVersion(ctrl.signal),
      other = observer.readVersion();
    ctrl.abort();
    await expect(cancelled).resolves.toBeNull();
    expect(read).toHaveBeenCalledOnce();
    const sharedAborted = read.mock.lastCall?.[2]?.signal?.aborted;
    finish(build());
    expect(sharedAborted).toBe(false);
    await expect(other).resolves.toBe(build().version);
  });
  it('removes event/timer observers and aborts active public observations on disposal', async () => {
    const { observer, read } = setup();
    observer.dispose();
    window.dispatchEvent(new Event('focus'));
    worker.dispatchEvent(new Event('controllerchange'));
    await vi.advanceTimersByTimeAsync(120000);
    expect(read).not.toHaveBeenCalled();
    await expect(observer.readVersion()).resolves.toBeNull();
  });
});
