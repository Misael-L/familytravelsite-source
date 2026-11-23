import { currentPlannerReadPort } from '../../repo/plannerReadPort';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { captureReadSession } from '../../sync/readSession';
import { captureFamilyActor } from './actorContext';
import { currentPlannerBoundaryOwner } from './plannerBoundaryOwner';
import { familyAuthStore } from './repository';

/** Capture before repository retirement; re-read authority rather than reviving its old publication. */
export function capturePlannerAuthRefresh(current: () => boolean) {
  const owner = currentPlannerBoundaryOwner(),
    publication = owner?.get(),
    port = currentPlannerReadPort(),
    trip = useTripStore.getState().trip,
    actor = captureFamilyActor(),
    session = captureReadSession(),
    path = window.location.pathname,
    selector = path.match(/^\/trips\/([1-9][0-9]*)\/?$/)?.[1];
  if (!selector || !owner || !port || (publication && publication.layer !== 'published')) return null;
  const hydrate = port.hydrateTrip?.bind(port),
    load = port.loadTrip?.bind(port);
  const read = publication && trip && hydrate ? () => hydrate(publication.trip) : load ? () => load(selector) : null;
  if (!read) return null;
  return async () => {
    const native = useAuthStore.getState(),
      family = familyAuthStore.getState();
    if (
      !current() ||
      !actor.current() ||
      (publication !== null && publication !== undefined && !session.current()) ||
      currentPlannerBoundaryOwner() !== owner ||
      currentPlannerReadPort() !== port ||
      useTripStore.getState().trip !== trip ||
      window.location.pathname !== path ||
      !native.isAuthenticated ||
      native.authCheckFailed ||
      !family.isAuthenticated ||
      family.authCheckFailed ||
      family.authGate !== 'ok'
    )
      return;
    // The complete cohort reader keeps queue/import/actor/source/layer and publication fences.
    // It reports retained work through its existing recovery surface; no replay is performed here.
    await read();
  };
}

/** Run SDK-dependent work after its Auth callback, and keep unreported failures closed. */
export function continuePlannerAuthRefresh(
  refresh: ReturnType<typeof capturePlannerAuthRefresh>,
  current: () => boolean
) {
  const actor = captureFamilyActor();
  queueMicrotask(() => {
    void useAuthStore
      .getState()
      .loadUser({ silent: true })
      .then(() => refresh?.())
      .catch(() => {
        if (!current() || !actor.current()) return;
        // Complete-reader failures already expose retained-work recovery; unreported Auth failures stay gated.
        if (!currentPlannerBoundaryOwner()?.getProblem()) useAuthStore.setState({ authCheckFailed: true });
      });
  });
}
