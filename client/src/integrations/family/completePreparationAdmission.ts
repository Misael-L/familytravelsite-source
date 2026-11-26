import { isCurrentUserDatabase } from '../../db/offlineDb';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { isAuthed } from '../../sync/authGate';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { captureReadSession } from '../../sync/readSession';
import { captureFamilyActor } from './actorContext';
import { offlineTripIdentity } from './completeTripRead';
import { parseCompleteTrip } from './completeTripSnapshot';
import { parseCompleteTripV4, type StoredCompleteTrip } from './completeTripV4';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import { offlineTripQualificationEnabled, v4PrivateFileSource, v4PublicImageSource } from './offlineTripQualification';
import { inspectCompleteTrip } from './plannerCache';
import { guardedPlannerRead } from './plannerReadGuard';
import { plannerScope } from './plannerViewContract';
import { familyAuthStore, familyFrontend, type FamilyFrontendRepository } from './repository';

/** Legacy private-file/readiness admission retains its exact parser and contract. */
export function admitCompletePreparation(
  value: number | string,
  repo: FamilyFrontendRepository = familyFrontend,
  refused: () => Error = () => new Error('The original preparation read ended.')
) {
  return admitPreparation(value, repo, refused, parseCompleteTrip);
}
/** Public-image admission alone may recognize the explicitly qualified coherent envelope. */
export function admitPublicImagePreparation(
  value: number | string,
  repo: FamilyFrontendRepository,
  refused: () => Error
) {
  return admitPreparation<StoredCompleteTrip>(value, repo, refused, (raw, expected) =>
    v4PublicImageSource(expected.source) ? parseCompleteTripV4(raw, expected) : parseCompleteTrip(raw, expected)
  );
}
/** Separately marked private-file admission; generic whole-readiness keeps the legacy parser. */
export function admitPrivateFilePreparation(value: number | string, repo: FamilyFrontendRepository) {
  return admitPreparation<StoredCompleteTrip>(
    value,
    repo,
    () => new Error('The original file preparation read ended.'),
    (raw, expected) =>
      v4PrivateFileSource(expected.source) ? parseCompleteTripV4(raw, expected) : parseCompleteTrip(raw, expected)
  );
}
async function admitPreparation<E extends StoredCompleteTrip>(
  value: number | string,
  repo: FamilyFrontendRepository,
  refused: () => Error,
  parse: (raw: unknown, expected: Parameters<typeof parseCompleteTrip>[1]) => Promise<E>
) {
  if (!offlineTripQualificationEnabled() || isEffectivelyOffline() || !isAuthed()) throw refused();
  const actor = captureFamilyActor(),
    source = getSupabaseUrl();
  actor.assertCurrent();
  const read = captureReadSession(),
    session = await repo.session();
  actor.assertCurrent();
  read.assertCurrent();
  const trip = await repo.tripUuid(value),
    ids = (await repo.views()).ids;
  const native = ids.register('trip', trip),
    context = repo.captureContext(trip);
  const scope = plannerScope.parse({
    trip_id: trip,
    user_id: session.userId,
    family_id: session.familyId,
    person_id: session.personId,
    layer: 'published',
  });
  const state = { ended: false };
  function familyCurrent() {
    const f = familyAuthStore.getState();
    return (
      !f.isLoading &&
      f.isAuthenticated &&
      !f.authCheckFailed &&
      f.authGate === 'ok' &&
      f.authUserId === session.userId &&
      f.personId === session.personId &&
      f.familyId === session.familyId
    );
  }
  function nativeCurrent() {
    const n = useAuthStore.getState();
    return (
      !n.isLoading &&
      n.isAuthenticated &&
      !n.authCheckFailed &&
      !n.loggingOut &&
      n.user?.id === ids.register('person', session.personId) &&
      isCurrentUserDatabase(n.user.id)
    );
  }
  function checkOwner() {
    actor.assertCurrent();
    read.assertCurrent();
    context.assertCurrent();
    if (
      state.ended ||
      !offlineTripQualificationEnabled() ||
      source !== getSupabaseUrl() ||
      !['/trips/' + trip, '/trips/' + native].includes(window.location.pathname) ||
      repo.getLayer(trip) !== 'published' ||
      repo.knownViews()?.ids !== ids ||
      !familyCurrent() ||
      !nativeCurrent() ||
      (useTripStore.getState().trip !== null && useTripStore.getState().trip?.id !== native)
    )
      throw refused();
    if (isEffectivelyOffline()) {
      const saved = offlineTripIdentity(trip, source);
      if (JSON.stringify(saved.scope) !== JSON.stringify(scope)) throw refused();
    } else if (!isAuthed()) throw refused();
  }
  function check() {
    checkOwner();
    if (isEffectivelyOffline() || !isAuthed() || useTripStore.getState().trip?.id !== native) throw refused();
  }

  check();
  // This is a real RLS-protected header read, not cached membership inferred from the public bytes.
  const header = await repo.readers.trips.fetchTripById(trip);
  check();
  if (header?.id !== trip || header.family_id !== session.familyId) throw refused();
  const observeOwner = () =>
    guardedPlannerRead(
      read,
      { uuid: trip, native, blockImports: true },
      () => refused(),
      async (guard) => guard.commit(() => inspectCompleteTrip(source, scope, checkOwner))
    );
  const observe = async () => {
    check();
    const value = await observeOwner();
    check();
    return value;
  };
  const original = await observe(),
    serialized = JSON.stringify(original);
  const envelope = await parse(original.row.value, {
    source,
    scope,
    now: Date.now(),
    ownership: {
      key: original.head.key,
      ownerKey: original.owner.key,
      ownerGeneration: original.owner.generation,
      tripGeneration: original.trip.generation,
    },
  });
  check();
  return { envelope, read, check, checkOwner, observe, observeOwner, serialized, repo, trip, native, state };
}
