import { CREATION_TERMINAL_ARCHIVE_KEY, hasPendingCreationTerminal } from '../db/creationTerminalArchive';
import { packingDependencyProtectedIds } from '../db/packingDependencyProtection';
import { PACKING_TERMINAL_ARCHIVE_KEY, hasPendingPackingTerminal } from '../db/packingTerminalArchive';
import { SOURCE_PAUSE_KEY, sourceDatabaseName } from '../db/sourceDatabase';
import { isSupportedMutationFormat } from './queueFormat';
import type { captureQueueSession } from './queueSession';
import { isRetainedCommand, isUnscopedFamilyWrite } from './retainedCommand';
/** Both terminal protocols hold automatic replay; neither journal grants permission to resend. */
export async function pendingTerminalDecision(db: ReturnType<typeof captureQueueSession>['db']): Promise<boolean> {
  return (
    hasPendingPackingTerminal(await db.syncMeta.get(PACKING_TERMINAL_ARCHIVE_KEY)) ||
    hasPendingCreationTerminal(await db.syncMeta.get(CREATION_TERMINAL_ARCHIVE_KEY))
  );
}
export async function retryRetainedFailures(session: ReturnType<typeof captureQueueSession>): Promise<void> {
  const db = session.db;
  // Read the decision and rewrite metadata in one transaction; cancellation may be armed in another tab.
  await db.transaction('rw', db.mutationQueue, db.syncMeta, async () => {
    const dependencyIds = packingDependencyProtectedIds(await db.mutationQueue.toArray());
    const pendingCreation = hasPendingCreationTerminal(await db.syncMeta.get(CREATION_TERMINAL_ARCHIVE_KEY));
    const paused = new Set(
      sourceDatabaseName(db.name) ? ((await db.syncMeta.get(SOURCE_PAUSE_KEY))?.sourcePaused ?? []) : []
    );
    session.assertCurrent();
    await db.mutationQueue
      .where('status')
      .equals('failed')
      .filter(
        (m) =>
          isSupportedMutationFormat(m) &&
          !dependencyIds.has(m.id) &&
          !isUnscopedFamilyWrite(m) &&
          !paused.has(m.id) &&
          !(pendingCreation && isRetainedCommand(m))
      )
      .modify((m) => {
        m.status = 'pending';
        m.attempts = 0;
        m.retryAfter = undefined;
        m.lastError = null;
      });
    session.assertCurrent();
  });
  session.assertCurrent();
}
