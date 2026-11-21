import { onPrivateSessionEnd } from '../../db/privateSessionEvents';
import { onFamilyActorChange } from './actorEvents';

// Legacy shared-response caches have no actor/Trip/layer identity. They must
// never outlive a Family session. Static shell/fonts/map caches are not private
// records; retained commands live in their original account database instead.
const PRIVATE_CACHES = ['api-data', 'user-uploads'] as const;
export function installFamilyPrivateCacheRetirement(
  storage: () => Pick<CacheStorage, 'delete'> | undefined = () => globalThis.caches
) {
  let disposed = false,
    failures = 0;
  const pending = new Set<Promise<void>>();
  const retire = () => {
    if (disposed) return;
    let cache: ReturnType<typeof storage>;
    try {
      cache = storage();
    } catch {
      failures++;
      return;
    }
    if (!cache) return;
    const task = Promise.all(
      PRIVATE_CACHES.map(async (name) => {
        try {
          await cache.delete(name);
        } catch {
          failures++;
        }
      })
    ).then(() => {});
    pending.add(task);
    void task.then(() => pending.delete(task));
  };
  const stopSession = onPrivateSessionEnd(retire);
  const stopActor = onFamilyActorChange(retire);
  retire(); // Also retire older-version entries before the first Family login.
  return {
    settled: async () => {
      await Promise.all([...pending]);
    },
    failures: () => failures,
    dispose: () => {
      disposed = true;
      stopSession();
      stopActor();
    },
  };
}
