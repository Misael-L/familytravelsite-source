import { CREATION_TERMINAL_ARCHIVE_KEY, creationTerminalArchiveCount } from '../db/creationTerminalArchive';
import { currentOfflineDatabase, offlineSessionEpoch } from '../db/offlineDb';
import { PACKING_TERMINAL_ARCHIVE_KEY, packingTerminalArchiveCount } from '../db/packingTerminalArchive';
import { assertSourceDatabase } from '../db/sourceDatabase';
import { downloadBlob } from '../utils/fileDownload';
import { isProtectedQueueWork } from './retainedCommand';

const MAX_BYTES = 32 * 1024 * 1024;
const MAX_ROWS = 5000;
type Path = Array<string | number>;
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export class RetainedExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetainedExportError';
  }
}
function refused(): never {
  throw new RetainedExportError(
    'This retained work cannot be exported without losing data or exposing credentials. Nothing was removed.'
  );
}
const secretKey =
  /^(authorization|cookie|setcookie|accesstoken|refreshtoken|apikey|servicerolekey|secretkey|password)$/i;
const secretText =
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_secret_[A-Za-z0-9_-]+|[?&](?:token|access_token|apikey|api_key)=/i;
/** JSON plus explicit undefined/negative-zero paths preserves plain data. Binary/unknown prototypes refuse. */
function encode(
  value: unknown,
  path: Path,
  undefinedPaths: Path[],
  ancestors: Set<object>,
  negativeZeroPaths: Path[]
): Json {
  if (value === undefined) {
    undefinedPaths.push(path);
    return null;
  }
  if (value === null || typeof value === 'boolean') return value as null | boolean;
  if (typeof value === 'string') {
    if (secretText.test(value)) refused();
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) refused();
    if (Object.is(value, -0)) negativeZeroPaths.push(path);
    return value;
  }
  if (typeof value !== 'object' || path.length > 100 || ancestors.has(value)) return refused();
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) refused();
      return value.map((item, index) => encode(item, [...path, index], undefinedPaths, ancestors, negativeZeroPaths));
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) refused();
    if (Reflect.ownKeys(value).some((key) => typeof key !== 'string')) refused();
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (secretKey.test(key.replace(/[-_]/g, ''))) refused();
        return [key, encode(item, [...path, key], undefinedPaths, ancestors, negativeZeroPaths)];
      })
    );
  } finally {
    ancestors.delete(value);
  }
}
export async function retainedWorkCount(): Promise<number> {
  const db = currentOfflineDatabase(),
    epoch = offlineSessionEpoch();
  assertSourceDatabase(db.name);
  const { rows, archived, creationArchived } = await db.transaction('r', db.mutationQueue, db.syncMeta, async () => ({
    rows: await db.mutationQueue.toArray(),
    archived: await db.syncMeta.get(PACKING_TERMINAL_ARCHIVE_KEY),
    creationArchived: await db.syncMeta.get(CREATION_TERMINAL_ARCHIVE_KEY),
  }));
  if (db !== currentOfflineDatabase() || !db.isOpen() || epoch !== offlineSessionEpoch())
    throw new RetainedExportError('The active account changed. Reopen offline settings.');
  assertSourceDatabase(db.name);
  return (
    rows.filter(isProtectedQueueWork).length +
    packingTerminalArchiveCount(archived, rows) +
    creationTerminalArchiveCount(creationArchived, rows)
  );
}
/** Read the complete active queue together, including dependencies. Never enumerates other account databases. */
export async function prepareRetainedWorkExport() {
  const db = currentOfflineDatabase(),
    epoch = offlineSessionEpoch();
  assertSourceDatabase(db.name);
  const { rows, archived, creationArchived } = await db.transaction('r', db.mutationQueue, db.syncMeta, async () => ({
    rows: await db.mutationQueue.orderBy('createdAt').toArray(),
    archived: await db.syncMeta.get(PACKING_TERMINAL_ARCHIVE_KEY),
    creationArchived: await db.syncMeta.get(CREATION_TERMINAL_ARCHIVE_KEY),
  }));
  const assertCurrent = () => {
    if (db !== currentOfflineDatabase() || !db.isOpen() || epoch !== offlineSessionEpoch())
      throw new RetainedExportError('The active account changed. Nothing was exported or removed.');
    assertSourceDatabase(db.name);
  };
  assertCurrent();
  const retained = rows.filter(isProtectedQueueWork).length;
  if (!retained && !archived && !creationArchived)
    throw new RetainedExportError('There is no retained Family work to export.');
  if (rows.length > MAX_ROWS)
    throw new RetainedExportError('The retained-work export exceeds its bound. Nothing was removed.');
  const undefinedPaths: Path[] = [],
    negativeZeroPaths: Path[] = [],
    data = encode(rows, [], undefinedPaths, new Set(), negativeZeroPaths);
  const blob = new Blob(
    [
      JSON.stringify(
        {
          format: 'family.retained-work.v1',
          database: db.name,
          captured_at: new Date().toISOString(),
          retained_count:
            retained +
            packingTerminalArchiveCount(archived, rows) +
            creationTerminalArchiveCount(creationArchived, rows),
          rows: data,
          ...(archived
            ? {
                settled_originals: encode(
                  archived,
                  ['settled_originals'],
                  undefinedPaths,
                  new Set(),
                  negativeZeroPaths
                ),
              }
            : {}),
          ...(creationArchived
            ? {
                creation_terminal_originals: encode(
                  creationArchived,
                  ['creation_terminal_originals'],
                  undefinedPaths,
                  new Set(),
                  negativeZeroPaths
                ),
              }
            : {}),
          undefined_paths: undefinedPaths,
          ...(negativeZeroPaths.length ? { negative_zero_paths: negativeZeroPaths } : {}),
          automatic_replay: false,
        },
        null,
        2
      ),
    ],
    { type: 'application/json' }
  );
  if (blob.size > MAX_BYTES)
    throw new RetainedExportError('The retained-work export exceeds its bound. Nothing was removed.');
  return { blob, filename: 'family-retained-work.json', assertCurrent };
}
export async function downloadRetainedWork(): Promise<void> {
  const result = await prepareRetainedWorkExport();
  result.assertCurrent();
  downloadBlob(result.blob, result.filename);
}
