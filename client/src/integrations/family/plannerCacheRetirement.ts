import { onPrivateSessionEnd } from '../../db/privateSessionEvents';
import { onFamilyActorChange } from './actorEvents';
import {
  captureStoredPlannerCacheOwner,
  onPlannerCacheOwner,
  plannerCacheOwnerKey,
  retireLegacyPlannerCache,
  retirePlannerCacheOwners,
  type PlannerCacheOwnerIdentity,
  type PlannerCacheOwnerReference,
} from './plannerCache';

type Owner = PlannerCacheOwnerIdentity & { source: string };
let failedCleanups = 0;
export const plannerCacheCleanupFailures = () => failedCleanups;
/** Cache cleanup is independent of the native queue and never holds logout on a network/storage wait. */
export function installPlannerCacheRetirement(
  source: () => string,
  currentOwner: () => Owner | null = () => null,
  observeOwner: (changed: () => void) => () => void = () => () => {},
  rememberedOwner: { identity: Owner; isStale: () => boolean } | null = null
) {
  let disposed = false,
    sequence = 0,
    lastOwner: string | null = null,
    failures = 0;
  const known = new Map<string, PlannerCacheOwnerReference>(),
    captures = new Set<Promise<PlannerCacheOwnerReference | null>>(),
    pending = new Set<Promise<unknown>>();
  const watch = <T>(task: Promise<T>) => {
    const safe = task.catch(() => {
      failures++;
      failedCleanups++;
    });
    pending.add(safe);
    void safe.then(() => pending.delete(safe));
    return safe;
  };
  const remember = (owner: Owner, ticket: number) => {
    const capture = captureStoredPlannerCacheOwner(owner.source, {
      user_id: owner.user_id,
      family_id: owner.family_id,
      person_id: owner.person_id,
    });
    captures.add(capture);
    void watch(
      capture
        .then((value) => {
          if (value && !disposed && ticket === sequence) known.set(JSON.stringify(value), value);
        })
        .finally(() => captures.delete(capture))
    );
  };
  const track = () => {
    if (disposed) return;
    let owner: Owner | null, key: string | null;
    try {
      owner = currentOwner();
      key = owner
        ? plannerCacheOwnerKey(owner.source, {
            user_id: owner.user_id,
            family_id: owner.family_id,
            person_id: owner.person_id,
          })
        : null;
    } catch {
      failures++;
      failedCleanups++;
      return; // Malformed local identity cannot break logout or establish cache ownership.
    }
    if (key === lastOwner) return;
    lastOwner = key;
    const ticket = ++sequence;
    if (!owner) return;
    remember(owner, ticket);
  };
  // Keep startup's stored observation separate from authenticated/read-session owners.
  // Initial offline session setup may end a private session without changing this device identity.
  const rememberedCapture = rememberedOwner
    ? captureStoredPlannerCacheOwner(rememberedOwner.identity.source, {
        user_id: rememberedOwner.identity.user_id,
        family_id: rememberedOwner.identity.family_id,
        person_id: rememberedOwner.identity.person_id,
      })
    : null;
  if (rememberedCapture !== null) void watch(rememberedCapture);
  const retire = () => {
    if (disposed) return;
    sequence++;
    lastOwner = null;
    const owned = [...known.values()],
      waiting = [...captures, ...(rememberedCapture !== null && rememberedOwner?.isStale() ? [rememberedCapture] : [])];
    known.clear();
    captures.clear();
    // Generation invalidation happens synchronously inside retirePlannerCacheOwners.
    void watch(
      retirePlannerCacheOwners(
        Promise.all(
          waiting.map((p) =>
            p.catch(() => {
              return null; /* capture failure is already recorded by watch */
            })
          )
        ).then((values) => [...owned, ...values.filter((v): v is PlannerCacheOwnerReference => v !== null)])
      )
    );
  };
  const stopLease = onPlannerCacheOwner((owner) => known.set(JSON.stringify(owner), owner)),
    stopSession = onPrivateSessionEnd(retire),
    stopActor = onFamilyActorChange(retire),
    stopOwner = observeOwner(track);
  void watch(retireLegacyPlannerCache(source()));
  track();
  return {
    settled: async () => {
      while (pending.size) await Promise.all([...pending]);
    },
    failures: () => failures,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      sequence++;
      stopLease();
      stopSession();
      stopActor();
      stopOwner();
    },
  };
}
