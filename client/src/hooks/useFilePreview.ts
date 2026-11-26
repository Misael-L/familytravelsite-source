import { useEffect, useState, useSyncExternalStore } from 'react';
import { offlineSessionEpoch } from '../db/offlineDb';
import {
  acquireFilePreview,
  currentFilePreviewPort,
  filePreviewRevision,
  filePreviewRouteEpoch,
  onFilePreviewChange,
  type FilePreviewLease,
} from '../repo/filePreview';
import { useAuthStore } from '../store/authStore';
import { captureTripLoad } from '../store/tripReadScope';
import { useTripStore } from '../store/tripStore';
import { onPrivateSessionEnd } from '../sync/privateSessionEvents';

interface PreviewOptions {
  enabled?: boolean;
  observation?: unknown;
  nativeRaw?: boolean;
  nativeResolve?: (url: string) => Promise<string>;
}
function selection(url: string, observation: unknown, options: PreviewOptions) {
  const session = captureTripLoad(),
    driver = currentFilePreviewPort();
  const user = useAuthStore.getState().user?.id,
    trip = useTripStore.getState().trip?.id;
  const routeEpoch = filePreviewRouteEpoch();
  const ownerCurrent = () =>
    session.current() &&
    driver === currentFilePreviewPort() &&
    user === useAuthStore.getState().user?.id &&
    trip === useTripStore.getState().trip?.id;
  return {
    routeEpoch,
    url,
    observation,
    nativeRaw: options.nativeRaw,
    nativeResolve: options.nativeResolve,
    driver,
    ownerCurrent,
    current: () => ownerCurrent() && routeEpoch === filePreviewRouteEpoch(),
  };
}
/** A selection owns its preview; retirement cannot silently rebind old props to a new owner. */
export function useFilePreview(value: string | undefined, options: PreviewOptions = {}) {
  const url = value ?? '',
    enabled = options.enabled ?? true,
    observation = options.observation ?? url;
  useAuthStore((state) => state.user?.id);
  useTripStore((state) => state.trip?.id);
  useSyncExternalStore(onPrivateSessionEnd, offlineSessionEpoch);
  useSyncExternalStore(onFilePreviewChange, filePreviewRevision);
  const [request, setRequest] = useState(() => selection(url, observation, options));
  if (
    (request.routeEpoch !== filePreviewRouteEpoch() && request.ownerCurrent()) ||
    request.url !== url ||
    request.observation !== observation ||
    request.nativeRaw !== options.nativeRaw ||
    request.nativeResolve !== options.nativeResolve
  )
    setRequest(selection(url, observation, options));
  const [answer, setAnswer] = useState<{ request: typeof request; lease: FilePreviewLease | null } | null>(null);
  const current = request.current();
  useEffect(() => {
    if (!enabled || !request.url || !current || (!request.driver && request.nativeRaw)) return;
    const controller = new AbortController();
    let stopped = false,
      lease: FilePreviewLease | null = null;
    void acquireFilePreview(request.url, { ...request, signal: controller.signal }).then(
      (next) => {
        lease = next;
        if (stopped || !request.current() || !next.current()) {
          next.release();
          return;
        }
        setAnswer({ request, lease: next });
      },
      () => {
        if (!stopped && request.current()) setAnswer({ request, lease: null });
      }
    );
    return () => {
      stopped = true;
      controller.abort();
      lease?.release();
    };
  }, [request, enabled, current]);
  if (!enabled || !url || !current) return { src: '', loading: false };
  if (!request.driver && request.nativeRaw) return { src: url, loading: false };
  if (answer?.request !== request) return { src: '', loading: true };
  return { src: answer.lease?.current() ? answer.lease.url : '', loading: false };
}
