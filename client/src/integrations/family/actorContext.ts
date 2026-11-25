import { notifyFamilyActorChange } from './actorEvents';
import { FamilyApiError } from './errors';
import { familySourceEnvironment } from './familySourceEnvironment';
import { useAuthStore } from './legacy/store/authStore';
export { onFamilyActorChange } from './actorEvents';

let epoch = 0,
  identityEpoch = 0,
  accessEpoch = 0;
let previous = '',
  previousIdentity = '',
  previousGate: string | null = null,
  observing = false;
const mfaGates = new Set(['ok', 'mfa_enroll', 'mfa_challenge']);
function sourceKey() {
  return JSON.stringify([
    String(familySourceEnvironment('VITE_DATA_PLANE') ?? 'supabase'),
    String(familySourceEnvironment('VITE_SUPABASE_URL') ?? '')
      .trim()
      .replace(/\/+$/, ''),
  ]);
}
function identityKey() {
  const s = useAuthStore.getState();
  return JSON.stringify([sourceKey(), s.isAuthenticated, s.authUserId, s.personId, s.familyId]);
}
function observe() {
  const identity = identityKey(),
    gate = useAuthStore.getState().authGate,
    next = JSON.stringify([identity, gate]);
  const changed = Boolean(previous && previous !== next);
  if (changed) {
    epoch++;
    if (identity !== previousIdentity) identityEpoch++;
    if (!mfaGates.has(previousGate ?? '') || !mfaGates.has(gate ?? '')) accessEpoch++;
  }
  previous = next;
  previousIdentity = identity;
  previousGate = gate;
  if (changed) notifyFamilyActorChange();
  return next;
}
export function observeFamilyActor() {
  if (!observing) {
    observing = true;
    observe();
    useAuthStore.subscribe(observe);
  }
  return observe();
}
export function captureFamilyActor(options: { allowMfaTransition?: boolean } = {}) {
  const source = sourceKey(),
    original = observeFamilyActor(),
    generation = epoch;
  const identity = identityKey(),
    ownerGeneration = identityEpoch,
    accessGeneration = accessEpoch;
  const current = () => {
    const next = observe();
    if (!options.allowMfaTransition) return next === original && epoch === generation;
    return (
      identity === identityKey() &&
      ownerGeneration === identityEpoch &&
      accessGeneration === accessEpoch &&
      mfaGates.has(useAuthStore.getState().authGate ?? '')
    );
  };
  const assertCurrent = () => {
    if (!current())
      throw new FamilyApiError(
        409,
        'stale_family_actor',
        'The Family account or access context changed. Reload before retrying; an issued request may have completed.'
      );
  };
  return {
    key: original,
    current,
    assertCurrent,
    assertSourceCurrent() {
      if (source !== sourceKey())
        throw new FamilyApiError(
          409,
          'stale_family_source',
          'The Family data source changed during sign-in. Reload before continuing.'
        );
    },
    async perform<T>(operation: () => Promise<T>) {
      assertCurrent();
      try {
        const result = await operation();
        assertCurrent();
        return result;
      } catch (error) {
        assertCurrent();
        throw error;
      }
    },
  };
}
