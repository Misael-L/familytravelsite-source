import { isEffectivelyOffline } from '../sync/networkMode';
import { captureReadSession, type ReadSession } from '../sync/readSession';
import { isNetworkError } from './withOfflineFallback';
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
