import { collectionsApi } from '../api/collections';
import { captureReadSession } from '../sync/readSession';
import { requireOnline } from './onlineOnly';

/**
 * Invitable users are live authorization-dependent data: deliberately online-only,
 * with no Dexie copy, memoized roster or queued read. The view retains its own
 * collection/account lifetime checks in addition to this original-session fence.
 */
export const collectionSharingRepo = {
  async availableUsers(collectionId: number) {
    requireOnline();
    const session = captureReadSession();
    session.assertCurrent();
    const result = await collectionsApi.availableUsers(collectionId);
    session.assertCurrent();
    return result;
  },
};
