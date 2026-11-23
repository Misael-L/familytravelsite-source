import { isFamilyFrontendActive } from '../integrations/family/runtime';
import { isEffectivelyOffline, onNetworkModeChange } from './networkMode';
import { onPrivateSessionEnd } from './privateSessionEvents';
import type { ReadSession } from './readSession';
import { isProtectedQueueWork, RetainedCommandError } from './retainedCommand';

type Session = Pick<ReadSession, 'db' | 'current'>;
export class QueueLockUnavailable extends RetainedCommandError {
  constructor() {
    super('Offline work is preserved. A cross-tab queue lock is required before Family work can be sent.');
    this.name = 'QueueLockUnavailable';
  }
}
/** Keep the existing lock name so the immediately previous queue module cooperates. */
export async function acquireQueueLock(
  session: Session,
  mode: LockMode = 'exclusive',
  required = false
): Promise<(() => void) | null> {
  const current = () => session.current() && !isEffectivelyOffline();
  const fallback = async () => {
    if (!current()) return null;
    const rows = await session.db.mutationQueue.toArray();
    if (!current()) return null;
    if (required || isFamilyFrontendActive() || rows.some(isProtectedQueueWork)) throw new QueueLockUnavailable();
    return () => {};
  };
  if (!current()) return null;
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks || typeof locks.request !== 'function') return fallback();
  const name = `trek-mutation-flush:${session.db.name}`;
  return new Promise((resolve, reject) => {
    const abort = new AbortController();
    let waiting = true;
    let unwatchSession = () => {},
      unwatchMode = () => {};
    const cleanup = () => {
      unwatchSession();
      unwatchMode();
    };
    const cancel = () => {
      if (!waiting || current()) return;
      waiting = false;
      cleanup();
      abort.abort();
      resolve(null);
    };
    const failed = () => {
      if (!waiting) return;
      waiting = false;
      cleanup();
      void fallback().then(resolve, reject);
    };
    unwatchSession = onPrivateSessionEnd(cancel);
    unwatchMode = onNetworkModeChange(cancel);
    cancel();
    if (!waiting) return;
    try {
      void locks
        .request(name, { signal: abort.signal, mode }, () => {
          if (!waiting) return;
          waiting = false;
          cleanup();
          if (!current()) {
            resolve(null);
            return;
          }
          return new Promise<void>((release) => resolve(release));
        })
        .catch(failed);
    } catch {
      failed();
    }
  });
}
