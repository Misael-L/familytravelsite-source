import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyPrivateSessionEnd } from '../../db/privateSessionEvents';
import { notifyFamilyActorChange } from './actorEvents';
import { installFamilyPrivateCacheRetirement } from './privateWorkerCaches';
let scope: ReturnType<typeof installFamilyPrivateCacheRetirement> | undefined;
afterEach(() => scope?.dispose());
describe('Family private worker cache retirement', () => {
  it('removes only the two old unscoped response caches on startup', async () => {
    const kept = new Map([
      ['api-data', 'former owner'],
      ['user-uploads', 'former owner bytes'],
      ['workbox-precache-v2', 'public shell'],
      ['book-fonts', 'public fonts'],
      ['map-tiles', 'public map'],
    ]);
    const remove = vi.fn(async (name: string) => kept.delete(name));
    scope = installFamilyPrivateCacheRetirement(() => ({ delete: remove }));
    await scope.settled();
    expect([...kept.keys()]).toEqual(['workbox-precache-v2', 'book-fonts', 'map-tiles']);
    expect(remove.mock.calls.flat()).toEqual(['api-data', 'user-uploads']);
  });
  it.each(['epoch', 'actor'] as const)(
    'removes legacy private bytes on an actual %s retirement event',
    async (kind) => {
      const caches = new Set<string>();
      scope = installFamilyPrivateCacheRetirement(() => ({ delete: async (name) => caches.delete(name) }));
      await scope.settled();
      caches.add('api-data');
      caches.add('user-uploads');
      if (kind === 'epoch') notifyPrivateSessionEnd();
      else notifyFamilyActorChange();
      await scope.settled();
      expect(caches.size).toBe(0);
    }
  );
  it('keeps a later retirement independent of an earlier slow deletion', async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const remove = vi.fn(async () => {
      await hold;
      return true;
    });
    scope = installFamilyPrivateCacheRetirement(() => ({ delete: remove }));
    notifyPrivateSessionEnd();
    expect(remove).toHaveBeenCalledTimes(4);
    release();
    await scope.settled();
    expect(scope.failures()).toBe(0);
  });
  it('counts denied storage operations without an unhandled rejection or blocking teardown', async () => {
    scope = installFamilyPrivateCacheRetirement(() => ({
      delete: async () => {
        throw Error('Storage denied');
      },
    }));
    await scope.settled();
    expect(scope.failures()).toBe(2);
    notifyPrivateSessionEnd();
    await scope.settled();
    expect(scope.failures()).toBe(4);
  });
  it('allows browsers without Cache Storage and stops an old installation on dispose', async () => {
    scope = installFamilyPrivateCacheRetirement(() => undefined);
    await scope.settled();
    expect(scope.failures()).toBe(0);
    scope.dispose();
    const remove = vi.fn(async () => true);
    scope = installFamilyPrivateCacheRetirement(() => ({ delete: remove }));
    await scope.settled();
    scope.dispose();
    notifyPrivateSessionEnd();
    notifyFamilyActorChange();
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
