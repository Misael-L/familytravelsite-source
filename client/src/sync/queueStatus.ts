import { liveQuery } from 'dexie';
import { CREATION_TERMINAL_ARCHIVE_KEY, creationTerminalArchiveCount } from '../db/creationTerminalArchive';
import type { QueuedMutation } from '../db/offlineDb';
import { PACKING_TERMINAL_ARCHIVE_KEY, packingTerminalArchiveCount } from '../db/packingTerminalArchive';
import { SOURCE_PAUSE_KEY, sourceDatabaseName } from '../db/sourceDatabase';
import { onPrivateSessionEnd } from './privateSessionEvents';
import { captureReadSession, type ReadSession } from './readSession';
import { isProtectedQueueWork } from './retainedCommand';

export interface QueueStatus {
  pending: number;
  failed: number;
  conflicts: QueuedMutation[];
  retained: number;
}
export const emptyQueueStatus = (): QueueStatus => ({ pending: 0, failed: 0, conflicts: [], retained: 0 });
/** One readonly transaction: badges and conflict rows describe the same queue snapshot. */
export async function readQueueStatus(
  session: ReadSession = captureReadSession(),
  includeImportSources = false
): Promise<QueueStatus> {
  session.assertCurrent();
  const db = session.db;
  const {
    rows: originals,
    sources,
    paused,
    archived,
    creationArchived,
  } = await db.transaction(
    'r',
    [db.mutationQueue, db.syncMeta, ...(includeImportSources ? [db.importFiles] : [])],
    async () => ({
      rows: await db.mutationQueue.toArray(),
      archived: await db.syncMeta.get(PACKING_TERMINAL_ARCHIVE_KEY),
      creationArchived: await db.syncMeta.get(CREATION_TERMINAL_ARCHIVE_KEY),
      paused: new Set(
        sourceDatabaseName(db.name) ? ((await db.syncMeta.get(SOURCE_PAUSE_KEY))?.sourcePaused ?? []) : []
      ),
      sources: includeImportSources ? await db.importFiles.count() : 0,
    })
  );
  session.assertCurrent();
  const rows = originals.map((row) => (paused.has(row.id) ? { ...row, status: 'conflict' as const } : row));
  return {
    pending: rows.filter((r) => r.status === 'pending' || r.status === 'syncing').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    conflicts: rows.filter((r) => r.status === 'conflict').sort((a, b) => (b.conflictAt ?? 0) - (a.conflictAt ?? 0)),
    retained:
      rows.filter((row) => paused.has(row.id) || isProtectedQueueWork(row)).length +
      sources +
      packingTerminalArchiveCount(archived, originals) +
      creationTerminalArchiveCount(creationArchived, originals),
  };
}
/** Dexie observes same-origin tabs; retiring the owner clears data and unsubscribes synchronously. */
export function watchQueueStatus(
  next: (value: QueueStatus) => void,
  error: () => void,
  retire: () => void,
  includeImportSources = false
) {
  const session = captureReadSession();
  let stopped = false;
  const subscription = liveQuery(() => readQueueStatus(session, includeImportSources)).subscribe({
    next: (value) => {
      if (!stopped && session.current()) next(value);
    },
    error: () => {
      if (!stopped && session.current()) error();
    },
  });
  let unwatch = () => {};
  const stop = () => {
    if (!stopped) {
      stopped = true;
      subscription.unsubscribe();
      unwatch();
    }
  };
  unwatch = onPrivateSessionEnd(() => {
    stop();
    retire();
  });
  return stop;
}
