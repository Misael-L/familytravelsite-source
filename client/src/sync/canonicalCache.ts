import type { TrekOfflineDb } from '../db/offlineDb';
import { isEffectivelyOffline } from './networkMode';
import { acquireQueueLock } from './queueLock';
import type { ReadSession } from './readSession';

const rowTables = [
  'days',
  'places',
  'packingItems',
  'todoItems',
  'budgetItems',
  'reservations',
  'tripFiles',
  'accommodations',
] as const;
type Session = Pick<ReadSession, 'db' | 'current' | 'assertCurrent'>;
export type CanonicalResult<T> = { value: T; disposition: 'updated' | 'retained' | 'uncached' };
type CacheTable = (typeof rowTables)[number] | 'trips' | 'tripMembers';
interface Read<T> {
  tables?: readonly CacheTable[];
  fetch: () => Promise<T>;
  cache: (value: T) => Promise<unknown>;
  cached: () => Promise<T>;
}

function tables(db: TrekOfflineDb) {
  return [db.trips, ...rowTables.map((name) => db.table(name)), db.tripMembers, db.syncMeta, db.mutationQueue];
}
/** Unknown trip metadata cannot safely be attributed to a different trip. */
async function hasQueuedWork(db: TrekOfflineDb, tripId: number | null): Promise<boolean> {
  return (await db.mutationQueue.toArray()).some(
    (row) => tripId === null || row.tripId === tripId || !Number.isSafeInteger(row.tripId) || row.tripId === 0
  );
}
/** Read a coherent baseline. A trip list uses an account-wide conservative barrier. */
async function snapshot(db: TrekOfflineDb, tripId: number | null, names: readonly CacheTable[]) {
  const pending = await hasQueuedWork(db, tripId);
  const rows = await Promise.all(
    names.map((name) => {
      if (tripId === null) return db.table(name).toArray();
      if (name === 'trips') return db.trips.get(tripId);
      return db
        .table(name)
        .where(name === 'tripMembers' ? 'tripId' : 'trip_id')
        .equals(tripId)
        .toArray();
    })
  );
  return { pending, fingerprint: JSON.stringify(rows) };
}

/**
 * Never overlay canonical rows onto queued local work. The existing account lock
 * prevents a cooperating flush from acknowledging a newly queued edit between
 * the baseline and commit. The transactional comparison also covers optimistic
 * cache writes made before enqueue. No HTTP runs inside an IndexedDB transaction.
 */
export async function refreshCanonical<T>(
  session: Session,
  tripId: number | null,
  read: Read<T>
): Promise<CanonicalResult<T>> {
  const release = await acquireQueueLock(session, 'shared');
  try {
    session.assertCurrent();
    if (!release) return { value: await read.cached(), disposition: 'retained' };
    return await refreshLocked(session, tripId, read);
  } finally {
    release?.();
  }
}
async function refreshLocked<T>(session: Session, tripId: number | null, read: Read<T>): Promise<CanonicalResult<T>> {
  const db = session.db,
    scope = tables(db);
  const names = read.tables ?? ['trips', ...rowTables, 'tripMembers'];
  const before = await db.transaction('r', scope, () => snapshot(db, tripId, names));
  if (before.pending || isEffectivelyOffline()) return { value: await read.cached(), disposition: 'retained' };
  const value = await read.fetch();
  session.assertCurrent();
  const changed = async () => {
    const now = await snapshot(db, tripId, names);
    return now.pending || now.fingerprint !== before.fingerprint || isEffectivelyOffline();
  };
  try {
    return await db.transaction('rw', scope, async () => {
      session.assertCurrent();
      if (await changed()) return { value: await read.cached(), disposition: 'retained' as const };
      await read.cache(value);
      session.assertCurrent();
      return { value, disposition: 'updated' as const };
    });
  } catch {
    session.assertCurrent();
    // A failed optional cache copy may still return valid online data, but only
    // after proving again that no local edit is at risk. Unreadable state fails closed.
    return db.transaction('r', scope, async () =>
      (await changed())
        ? { value: await read.cached(), disposition: 'retained' as const }
        : { value, disposition: 'uncached' as const }
    );
  }
}
/** Same safety boundary for automatic eviction; explicit user cache actions are separate. */
export async function evictCanonical(session: Session, tripId: number, remove: () => Promise<void>): Promise<void> {
  const release = await acquireQueueLock(session);
  try {
    session.assertCurrent();
    if (!release) return;
    await session.db.transaction('rw', session.db.tables, async () => {
      session.assertCurrent();
      if (!(await hasQueuedWork(session.db, tripId))) await remove();
      session.assertCurrent();
    });
  } finally {
    release?.();
  }
}
