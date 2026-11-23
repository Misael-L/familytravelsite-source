import { CREATION_TERMINAL_ARCHIVE_KEY } from '../db/creationTerminalArchive';
import { currentOfflineDatabase, offlineSessionEpoch, offlineSourceOwner } from '../db/offlineDb';
import { PACKING_TERMINAL_ARCHIVE_KEY } from '../db/packingTerminalArchive';
import { onPrivateSessionEnd } from '../db/privateSessionEvents';
import { assertSourceDatabase, nativeDatabaseUser } from '../db/sourceDatabase';
import { downloadBlob } from '../utils/fileDownload';
import { isAuthed } from './authGate';
import {
  encodeOriginalWork,
  ORIGINAL_WORK_FORMAT,
  ORIGINAL_WORK_MAX_BYTES,
  ORIGINAL_WORK_MAX_ROWS,
  OriginalWorkExportError,
} from './originalWorkArchive';
import { isProtectedQueueWork } from './retainedCommand';

/** One current, already-open account DB. No enumeration, upgrade, snapshot admission or network permission. */
export async function prepareOriginalWorkExport() {
  const db = currentOfflineDatabase(),
    epoch = offlineSessionEpoch(),
    authenticated = isAuthed();
  if (!authenticated || !nativeDatabaseUser(db.name) || !db.isOpen())
    throw new OriginalWorkExportError('Open the original account before exporting its work. Nothing was removed.');
  const owner = offlineSourceOwner();
  const connection = db.backendDB();
  let retired = false,
    disposed = false;
  const release = onPrivateSessionEnd(() => {
    retired = true;
  });
  const dispose = () => {
    disposed = true;
    release();
  };
  const assertCurrent = () => {
    assertSourceDatabase(db.name);
    if (
      disposed ||
      retired ||
      db !== currentOfflineDatabase() ||
      !db.isOpen() ||
      db.backendDB() !== connection ||
      epoch !== offlineSessionEpoch() ||
      authenticated !== isAuthed()
    )
      throw new OriginalWorkExportError('The original recovery context changed. Nothing was exported or removed.');
  };
  try {
    const data = await db.transaction('r', db.mutationQueue, db.importFiles, db.syncMeta, async () => {
      assertCurrent();
      const counts = await Promise.all([db.mutationQueue.count(), db.importFiles.count()]);
      if (counts[0] + counts[1] > ORIGINAL_WORK_MAX_ROWS)
        throw new OriginalWorkExportError('The original-work export exceeds its row bound. Nothing was removed.');
      const [queue, queueKeys, imports, importKeys] = await Promise.all([
        db.mutationQueue.toArray(),
        db.mutationQueue.toCollection().primaryKeys(),
        db.importFiles.toArray(),
        db.importFiles.toCollection().primaryKeys(),
      ]);
      assertCurrent();
      const archived = await db.syncMeta.get(PACKING_TERMINAL_ARCHIVE_KEY);
      const creationArchived = await db.syncMeta.get(CREATION_TERMINAL_ARCHIVE_KEY);
      assertCurrent();
      if (!queue.some(isProtectedQueueWork) && !imports.length && !archived && !creationArchived)
        throw new OriginalWorkExportError('There is no retained original work to export.');
      return {
        ...(archived ? { settled_originals: archived } : {}),
        ...(creationArchived ? { creation_terminal_originals: creationArchived } : {}),
        queue: queue.map((row, i) => ({ key: queueKeys[i], row })),
        imports: imports.map((row, i) => ({ key: importKeys[i], row })),
      };
    });
    assertCurrent();
    const graph = await encodeOriginalWork(data, assertCurrent);
    const payload = JSON.stringify({
      database: db.name,
      ...(owner ? { source_owner: owner } : {}),
      native_version: db.verno,
      captured_at: new Date().toISOString(),
      automatic_replay: false,
      counts: { queue: data.queue.length, imports: data.imports.length },
      graph,
    });
    const sha256 = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))),
      (b) => b.toString(16).padStart(2, '0')
    ).join('');
    const blob = new Blob(
      [JSON.stringify({ format: owner ? 'family.original-work.v3' : ORIGINAL_WORK_FORMAT, sha256, payload })],
      {
        type: 'application/json',
      }
    );
    if (blob.size > ORIGINAL_WORK_MAX_BYTES)
      throw new OriginalWorkExportError('The original-work export exceeds its bound. Nothing was removed.');
    assertCurrent();
    return {
      blob,
      filename: owner ? 'family-original-work-v3.json' : 'family-original-work-v2.json',
      assertCurrent,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
export async function downloadOriginalWork(): Promise<void> {
  const result = await prepareOriginalWorkExport();
  try {
    result.assertCurrent();
    downloadBlob(result.blob, result.filename);
  } finally {
    result.dispose();
  }
}
