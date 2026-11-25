import { isEffectivelyOffline } from '../sync/networkMode';
import { captureReadSession, type ReadSession } from '../sync/readSession';
import { isNetworkError } from './withOfflineFallback';
import { hostedRoadtripToursTripId } from '../integrations/family/routePlanningPreview';

/** Preview reads stay online so cached edits cannot replace the published view. */
export async function hostedPlannerRead<T>(load: () => Promise<T>): Promise<T> {
  const trip = hostedRoadtripToursTripId();
  const session = captureReadSession();
  if (!trip) throw new Error('Trip changed.');
  session.assertCurrent();
  const result = await load();
  session.assertCurrent();
  if (hostedRoadtripToursTripId() !== trip) throw new Error('Trip changed.');
  return result;
}
/** Scoped read-through cache. A cancelled request must never fall back to the next account. */
export async function sessionRead<T>(
  online: (session: ReadSession) => Promise<T>,
  cached: (session: ReadSession) => Promise<T>
): Promise<T> {
  const session = captureReadSession();
  const run = async (read: typeof online) => {
    session.assertCurrent();
    const result = await read(session);
    session.assertCurrent();
    return result;
  };
  if (isEffectivelyOffline()) return run(cached);
  try {
    return await run(online);
  } catch (error) {
    session.assertCurrent();
    if (isNetworkError(error)) return run(cached);
    throw error;
  }
}
