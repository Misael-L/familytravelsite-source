import { captureReadSession } from '../../sync/readSession';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyHandler } from './transport';

function tripSelector(path: string) {
  return (
    path.match(/^\/trips\/([^/]+)(?:\/|$)/)?.[1] ??
    path.match(/^\/(?:day-schedule|day-tints|map-markers|map-layers|trip-warnings)\/([^/]+)$/)?.[1] ??
    path.match(/^\/view-contributions\/[^/]+\/([^/]+)$/)?.[1]
  );
}
/** Real ancillary handlers retain their original session/source/Trip through every await.
 * No queue lease is acquired here: the bundle may already hold one. No cache is published. */
export function createPlannerApplicationReads(
  repo: FamilyFrontendRepository,
  app: FamilyHandler,
  disposed: () => boolean,
  source: () => string
): FamilyHandler {
  return async (request) => {
    if (request.method !== 'GET') return app(request);
    const privateSession = captureReadSession(),
      origin = source(),
      actor = repo.captureContext(undefined, { revision: false });
    const check = () => {
      privateSession.assertCurrent();
      actor.assertCurrent();
      if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (disposed() || source() !== origin)
        throw new FamilyApiError(409, 'planner_application_changed', 'The original planner session ended.');
    };
    check();
    const session = await repo.session();
    check();
    const selector = tripSelector(request.pathname),
      trip = selector ? await repo.tripUuid(selector) : undefined,
      context = repo.captureContext(trip),
      ids = (await repo.views()).ids;
    const fence = async () => {
      check();
      context.assertCurrent();
      const current = await repo.session();
      check();
      context.assertCurrent();
      if (
        current.userId !== session.userId ||
        current.personId !== session.personId ||
        current.familyId !== session.familyId ||
        repo.knownViews()?.ids !== ids
      )
        throw new FamilyApiError(409, 'planner_application_changed', 'The original planner context changed.');
    };
    await fence();
    try {
      // Startup cannot borrow a UI publication: the bundle has not committed yet.
      if (trip) await repo.tripHeader(trip);
      await fence();
      const result = await app(request);
      await fence();
      return result;
    } catch (error) {
      await fence();
      throw error;
    }
  };
}
