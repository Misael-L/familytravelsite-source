import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { offlineSessionEpoch } from '../../db/offlineDb';
import { useAuthStore } from '../../store/authStore';
import { onPrivateSessionEnd } from '../../sync/privateSessionEvents';
import { emptyQueueStatus, readQueueStatus, watchQueueStatus, type QueueStatus } from '../../sync/queueStatus';
import { captureReadSession } from '../../sync/readSession';

export function useOfflineQueueStatus(includeImportSources = false) {
  const [queue, setQueue] = useState(emptyQueueStatus);
  const [queueFailed, setQueueFailed] = useState(false);
  const [reads] = useState(() => {
    let token = 0,
      mounted = true;
    return {
      capture: () => {
        const started = ++token;
        return () => mounted && started === token;
      },
      retire: () => {
        token++;
      },
      mount: () => {
        mounted = true;
        return () => {
          mounted = false;
          token++;
        };
      },
    };
  });
  const user = useAuthStore((s) => s.user);
  const epoch = useSyncExternalStore(onPrivateSessionEnd, offlineSessionEpoch);
  const loadQueue = useCallback(async () => {
    const current = reads.capture(),
      session = captureReadSession();
    const snapshot = await readQueueStatus(session, includeImportSources);
    if (current() && session.current()) setQueue(snapshot);
  }, [reads, includeImportSources]);
  useEffect(() => {
    const unmount = reads.mount();
    const publish = (value: QueueStatus) => {
      reads.retire();
      setQueueFailed(false);
      setQueue(value);
    };
    const stop = watchQueueStatus(
      publish,
      () => setQueueFailed(true),
      () => publish(emptyQueueStatus()),
      includeImportSources
    );
    return () => {
      unmount();
      stop();
    };
  }, [user, epoch, reads, includeImportSources]);
  return { queue, loadQueue, queueFailed };
}
