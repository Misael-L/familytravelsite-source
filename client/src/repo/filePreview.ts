import { getAuthUrl } from '../api/authUrl';
import { isEffectivelyOffline } from '../sync/networkMode';
import { captureReadSession } from '../sync/readSession';

export interface FilePreviewLease {
  url: string;
  current: () => boolean;
  release: () => void;
}
export interface FilePreviewPort {
  acquire: (url: string, signal?: AbortSignal) => Promise<FilePreviewLease>;
  dispose: () => void;
}
let port: FilePreviewPort | null = null;
let revision = 0,
  routeEpoch = 0;
export const filePreviewRouteEpoch = () => routeEpoch;
export function notifyFilePreviewRouteChange() {
  routeEpoch++;
  notifyFilePreviewChange();
}
const listeners = new Set<() => void>();
export const currentFilePreviewPort = () => port;
export const filePreviewRevision = () => revision;
export function onFilePreviewChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function notifyFilePreviewChange() {
  revision++;
  for (const listener of [...listeners]) listener();
}
export function installFilePreviewPort(next: FilePreviewPort) {
  if (port) throw new Error('A private file preview provider is already installed.');
  port = next;
  notifyFilePreviewChange();
  return () => {
    if (port !== next) return;
    port = null;
    next.dispose();
    notifyFilePreviewChange();
  };
}
export async function acquireFilePreview(
  url: string,
  options: {
    nativeResolve?: (url: string) => Promise<string>;
    nativeRaw?: boolean;
    signal?: AbortSignal;
  } = {}
): Promise<FilePreviewLease> {
  const original = port,
    session = captureReadSession();
  const lease = original
    ? await original.acquire(url, options.signal)
    : {
        url:
          options.nativeRaw || isEffectivelyOffline()
            ? url
            : await (options.nativeResolve ?? ((value) => getAuthUrl(value, 'download')))(url),
        current: () => session.current() && port === original,
        release: () => {},
      };
  if (options.signal?.aborted || !session.current() || port !== original || !lease.current()) {
    lease.release();
    throw new Error('The original file preview owner retired.');
  }
  return lease;
}
