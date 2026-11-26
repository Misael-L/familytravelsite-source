import type { StoredCompleteTrip } from '../integrations/family/completeTripV4';
import type { FilePreviewLease, FilePreviewPort } from './filePreview';
import { notifyFilePreviewRouteChange } from './filePreview';
export type PreparedFileRead = {
  envelope: StoredCompleteTrip;
  check: () => void;
  verify: () => Promise<void>;
};
export type PreparedFileState = { fileId: string; status: 'ready' | 'pending' | 'missing' };
export type PreparedFilePool = {
  inspect?: (read: PreparedFileRead, files: readonly string[], signal?: AbortSignal) => Promise<PreparedFileState[]>;
  borrow: (read: PreparedFileRead, fileId: string, signal?: AbortSignal) => Promise<FilePreviewLease>;
  dispose: () => void;
};
let pool: PreparedFilePool | null = null,
  view: { port: FilePreviewPort } | null = null;
export const currentPreparedFilePool = () => pool;
export const currentSavedFilePreview = () => view?.port ?? null;
export function installPreparedFilePool(next: PreparedFilePool) {
  const old = pool;
  pool = next;
  old?.dispose();
  return () => {
    if (pool === next) pool = null;
  };
}
const unavailable: FilePreviewPort = {
  acquire: async () => {
    throw new Error('The saved file read ended.');
  },
  dispose: () => {},
};
export function installSavedFilePreview(next: FilePreviewPort) {
  const entry = { port: next },
    old = view;
  view = entry;
  old?.port.dispose();
  notifyFilePreviewRouteChange();
  const release = () => {
    if (view === entry) {
      view = null;
      notifyFilePreviewRouteChange();
    }
    next.dispose();
  };
  const retire = () => {
    if (view === entry) {
      entry.port = unavailable;
      notifyFilePreviewRouteChange();
    }
    next.dispose();
  };
  return Object.assign(release, { retire });
}
/** A late failure may retire only the pool observed by that original request. */
export function retireObservedFilePool(observed: PreparedFilePool | null) {
  if (observed && pool === observed) {
    pool = null;
    observed.dispose();
  }
}
