import Dexie from 'dexie';
import { isCurrentUserDatabase, prepareSourceDatabaseRead } from '../../db/offlineDb';
import { useAuthStore } from '../../store/authStore';
import { logoutInProgress } from '../../sync/logoutCoordinator';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { captureReadSession } from '../../sync/readSession';
import { wasSignedOut } from '../../utils/signedOut';
import { captureFamilyActor } from './actorContext';
import { coherentStayQualificationEnabled } from './coherentStayQualification';
import { parseCompleteTrip } from './completeTripSnapshot';
import { parseCompleteTripV4, type StoredCompleteTrip } from './completeTripV4';
import { FamilyIdentityRegistry } from './identity';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import { offlineTripQualificationEnabled } from './offlineTripQualification';
import { CompleteTripReadRefusal, inspectCompleteTrip } from './plannerCache';
import { guardedPlannerRead } from './plannerReadGuard';
import { plannerScope } from './plannerViewContract';
import { familyAuthStore } from './repository';

class SavedTripReadRefusal extends Error {}

export function offlineTripIdentity(trip: string, source = getSupabaseUrl()) {
  const f = familyAuthStore.getState(),
    n = useAuthStore.getState();
  if (
    !isEffectivelyOffline() ||
    logoutInProgress() ||
    wasSignedOut() ||
    !f.isAuthenticated ||
    !n.isAuthenticated ||
    n.loggingOut ||
    !n.user ||
    !f.authUserId ||
    !f.familyId ||
    !f.personId ||
    (f.authGate !== null && f.authGate !== 'ok')
  )
    throw new Error('A saved Trip needs its original device account and no known access refusal.');
  const scope = plannerScope.parse({
    trip_id: trip,
    user_id: f.authUserId,
    family_id: f.familyId,
    person_id: f.personId,
    layer: 'published',
  });
  const ids = new FamilyIdentityRegistry(scope.user_id),
    nativeUser = ids.register('person', scope.person_id);
  if (n.user.id !== nativeUser || !isCurrentUserDatabase(nativeUser))
    throw new Error('The original saved-work database is unavailable.');
  return { source, scope, nativeUser, key: JSON.stringify([source, scope, nativeUser]) };
}
/** Selection and publication retain the original account, queue and immutable complete head. No cached authentication. */
export function openCompleteTripRead(trip: string) {
  if (!offlineTripQualificationEnabled())
    return Promise.reject(new Error('Cold Trip reading is disabled outside local qualification.'));
  return openSavedTrip(trip, parseCompleteTrip, ['family.offline-trip.v2', 'family.offline-trip.v3']);
}
/** Explicit local v4 reader. No native session, preparation or public route selects it implicitly. */
export function openCoherentTripRead(trip: string) {
  if (!coherentStayQualificationEnabled())
    return Promise.reject(new Error('Coherent saved Trip reading is disabled outside local qualification.'));
  return openSavedTrip(trip, parseCompleteTripV4, ['family.offline-trip.v4']);
}
async function openSavedTrip<T extends StoredCompleteTrip>(
  trip: string,
  parse: (raw: unknown, expected: Parameters<typeof parseCompleteTrip>[1]) => Promise<T>,
  formats: readonly string[]
) {
  await prepareSourceDatabaseRead();
  const identity = offlineTripIdentity(trip),
    actor = captureFamilyActor(),
    read = captureReadSession();
  let ended = false;
  let freshness = () => {};
  const check = () => {
    freshness();
    read.assertCurrent();
    actor.assertCurrent();
    if (ended || offlineTripIdentity(trip).key !== identity.key)
      throw new SavedTripReadRefusal('The original saved Trip read ended.');
  };
  check();
  if (!(await Dexie.exists(read.db.name))) throw new Error('The original saved-work database is missing.');
  check();
  const native = new FamilyIdentityRegistry(identity.scope.user_id).register('trip', trip);
  const observe = async () => {
    check();
    return guardedPlannerRead(
      read,
      { uuid: trip, native, blockImports: true },
      () => new Error('Original local work must be recovered before opening this saved Trip.'),
      async (guard) => guard.commit(() => inspectCompleteTrip(identity.source, identity.scope, check))
    );
  };
  const initial = await observe();
  const serialized = JSON.stringify(initial);
  const ownership = {
    key: initial.head.key,
    ownerKey: initial.owner.key,
    ownerGeneration: initial.owner.generation,
    tripGeneration: initial.trip.generation,
  };
  const envelope = await parse(initial.row.value, { ...identity, ownership, now: Date.now() });
  if (!formats.includes(envelope.format) || !envelope.capabilities.coldRead)
    throw new Error('This saved format does not permit cold reading. Reconnect to capture a current Trip.');
  const deadline = performance.now() + Math.max(0, envelope.expiresAt - Date.now());
  freshness = () => {
    const now = Date.now();
    if (now < envelope.verifiedAt || now > envelope.expiresAt || performance.now() > deadline)
      throw new SavedTripReadRefusal('The saved Trip expired or its clock changed.');
  };
  const publish = async (work: () => void) => {
    try {
      check();
      await guardedPlannerRead(
        read,
        { uuid: trip, native, blockImports: true },
        () => new SavedTripReadRefusal('Original local work needs recovery.'),
        async (guard) => {
          await guard.commit(() =>
            inspectCompleteTrip(identity.source, identity.scope, check, (next) => {
              if (JSON.stringify(next) !== serialized || Date.now() > envelope.expiresAt)
                throw new SavedTripReadRefusal('The saved Trip expired or changed.');
              check();
              work();
              check();
            })
          );
        }
      );
    } catch (error) {
      if (error instanceof SavedTripReadRefusal || error instanceof CompleteTripReadRefusal) ended = true;
      throw error;
    }
  };
  await publish(() => {});
  return {
    envelope,
    check,
    publish,
    close: () => {
      ended = true;
    },
    current: () => {
      try {
        check();
        return Date.now() <= envelope.expiresAt;
      } catch {
        return false;
      }
    },
  };
}
