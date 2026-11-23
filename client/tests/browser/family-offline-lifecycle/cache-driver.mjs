// This entry is emitted only by the explicit loopback qualification build.
// It observes a captured owner and delays existing cleanup; it never creates an owner, snapshot or auth grant.
import { offlineTripQualificationEnabled } from '../../../src/integrations/family/offlineTripQualification';
import {
  captureStoredPlannerCacheOwner,
  retirePlannerCacheOwners,
} from '../../../src/integrations/family/plannerCache';
const pending = new Map();
function allowed(source) {
  if (
    import.meta.env.VITE_FAMILY_CACHE_LIFECYCLE_DRIVER !== 'local-driver-v1' ||
    !offlineTripQualificationEnabled() ||
    globalThis.location.hostname !== '127.0.0.1' ||
    globalThis.location.protocol !== 'http:' ||
    source !== 'http://127.0.0.1:55331'
  )
    throw Error('Cache lifecycle driver is available only in guarded loopback qualification.');
}
export async function holdRetirement(source, identity) {
  allowed(source);
  const owner = await captureStoredPlannerCacheOwner(source, identity);
  if (!owner) throw Error('The original stored owner is missing.');
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const id = globalThis.crypto.randomUUID();
  const result = retirePlannerCacheOwners(wait.then(() => [owner]));
  // Observe rejection immediately; releaseRetirement still reports the original error.
  void result.catch(() => {});
  pending.set(id, { source, owner, release, result });
  return { id, owner };
}
export async function releaseRetirement(id) {
  const held = pending.get(id);
  if (!held) throw Error('Unknown retirement ticket.');
  allowed(held.source);
  held.release();
  try {
    await held.result;
    return { completed: true, owner: held.owner };
  } finally {
    pending.delete(id);
  }
}
