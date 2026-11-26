import { notifyFilePreviewChange, type FilePreviewLease } from '../../repo/filePreview';
import {
  currentPreparedFilePool,
  installSavedFilePreview,
  type PreparedFileRead,
} from '../../repo/preparedFilePreview';
import { familyFileKey } from './filePreview';
import { FamilyIdentityRegistry } from './identity';
/** One existing saved-view publication owns every URL. Missing RAM bytes never fall back to native blobs. */
export function installSavedPrivateFiles(read: PreparedFileRead, origin = window.location.origin) {
  const ids = new FamilyIdentityRegistry(read.envelope.scope.user_id),
    leases = new Set<FilePreviewLease>();
  for (const binding of read.envelope.bindings)
    ids.register(binding.kind as import('./identity').IdentityKind, binding.uuid);
  const lifetime = new AbortController();
  let disposed = false;
  const check = () => {
    read.check();
    if (disposed) throw new Error('The saved file view ended.');
  };
  return installSavedFilePreview({
    async acquire(value, signal) {
      check();
      const key = familyFileKey(value, origin),
        fileId = ids.uuid('file', key),
        pool = currentPreparedFilePool();
      if (!pool) throw new Error('This file was not prepared in this document.');
      const lease = await pool.borrow(
        {
          ...read,
          check,
          verify: async () => {
            check();
            await read.verify();
            check();
          },
        },
        fileId,
        signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal
      );
      try {
        check();
        if (signal?.aborted) throw new DOMException('Saved file preview cancelled.', 'AbortError');
        const owned = {
          ...lease,
          release: () => {
            leases.delete(owned);
            lease.release();
          },
        };
        leases.add(owned);
        return owned;
      } catch (error) {
        lease.release();
        throw error;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifetime.abort();
      for (const lease of leases) lease.release();
      leases.clear();
      notifyFilePreviewChange();
    },
  });
}
