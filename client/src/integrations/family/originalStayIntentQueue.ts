import { isAxiosError } from 'axios';
import { MUTATION_SCHEMA_VERSION, type QueuedMutation } from '../../db/offlineDb';
import { packingDependencyProtectedIds } from '../../db/packingDependencyProtection';
import { captureWriteSession } from '../../sync/writeSession';
import { FamilyApiError } from './errors';
import { retainTripIntent } from './retainedTripIntent';

export type OriginalStayOwner = ReturnType<typeof captureWriteSession>;
type Intent = { source_url: string; command: { operation_id: string; scope: { trip_id: string } } };
export const originalStayIntentKeys: ReadonlySet<string> = new Set([
  'id',
  'tripId',
  'method',
  'url',
  'body',
  'retentionPolicy',
  'status',
  'attempts',
  'lastError',
  'schemaVersion',
  'buildVersion',
  'createdAt',
  'retryAfter',
  'syncingSince',
]);
// Type tags preserve present-but-undefined metadata and sparse arrays. JSON stringification alone does not.
export function sameOriginalStayRow(a: unknown, b: unknown): boolean {
  const encode = (v: unknown): unknown => {
    if (v === null) return ['null'];
    if (typeof v === 'object')
      return [
        Array.isArray(v) ? 'array' : 'object',
        Array.isArray(v) ? v.length : null,
        Object.keys(v)
          .sort()
          .map((k) => [k, encode((v as Record<string, unknown>)[k])]),
      ];
    return [typeof v, typeof v === 'number' ? String(v) : v];
  };
  return JSON.stringify(encode(a)) === JSON.stringify(encode(b));
}

function validOriginalMetadata(row: QueuedMutation) {
  return (
    Object.keys(row).every((key) => originalStayIntentKeys.has(key)) &&
    ['pending', 'syncing', 'conflict', 'failed'].includes(row.status) &&
    Number.isSafeInteger(row.attempts) &&
    row.attempts >= 0 &&
    Number.isFinite(row.createdAt) &&
    (row.buildVersion === undefined || typeof row.buildVersion === 'string') &&
    (row.lastError === undefined || row.lastError === null || typeof row.lastError === 'string') &&
    (row.retryAfter === undefined || Number.isFinite(row.retryAfter)) &&
    (row.syncingSince === undefined || Number.isFinite(row.syncingSince))
  );
}

/** Shared ownership mechanics, never a shared response dialect or permission to auto-replay. */
export function createOriginalStayIntentQueue<P extends Intent>(parse: (raw: unknown) => P, url: (p: P) => string) {
  const changed = (): never => {
    throw new FamilyApiError(409, 'stay_queue_changed', 'The retained stay command changed. Nothing was removed.');
  };
  const matches = (row: QueuedMutation, p: P, native: number) =>
    validOriginalMetadata(row) &&
    row.id === p.command.operation_id &&
    row.tripId === native &&
    row.schemaVersion === MUTATION_SCHEMA_VERSION &&
    row.retentionPolicy === 'family-original-v1' &&
    row.method === 'POST' &&
    row.resource === undefined &&
    row.entityId === undefined &&
    row.tempEntityId === undefined &&
    row.baseUpdatedAt === undefined &&
    row.url === url(p) &&
    sameOriginalStayRow(row.body, p);
  const inspect = async (owner: OriginalStayOwner, original: P, native: number) => {
    const p = parse(original);
    owner.assertCurrent();
    const rows = await owner.db.mutationQueue.toArray();
    owner.assertCurrent();
    if (packingDependencyProtectedIds(rows).has(p.command.operation_id)) changed();
    const row = rows.find((r) => r.id === p.command.operation_id);
    if (row && !matches(row, p, native)) changed();
    return row ? structuredClone(row) : undefined;
  };
  const retain = async (owner: OriginalStayOwner, original: P, native: number) => {
    const p = parse(original);
    const {
      operation_id: id,
      scope: { trip_id: trip },
    } = p.command;
    await retainTripIntent(
      owner,
      p,
      { id, trip, native },
      {
        matches,
        url,
        changed,
        olderWork: () =>
          new FamilyApiError(409, 'stay_older_work', 'Resolve the older Trip command before another stay edit.'),
      }
    );
  };
  const acknowledge = async (owner: OriginalStayOwner, original: P, native: number, expected?: QueuedMutation) => {
    const p = parse(original);
    owner.assertCurrent();
    await owner.db.transaction('rw', owner.db.mutationQueue, async () => {
      owner.assertCurrent();
      const rows = await owner.db.mutationQueue.toArray();
      owner.assertCurrent();
      if (packingDependencyProtectedIds(rows).has(p.command.operation_id)) changed();
      const row = rows.find((r) => r.id === p.command.operation_id);
      if ((expected && !sameOriginalStayRow(row, expected)) || (row && !matches(row, p, native))) changed();
      if (row) await owner.db.mutationQueue.delete(row.id);
      owner.assertCurrent();
    });
    owner.assertCurrent();
  };
  const park = async (
    owner: OriginalStayOwner,
    original: P,
    native: number,
    error: unknown,
    expected?: QueuedMutation
  ) => {
    const p = parse(original);
    owner.assertCurrent();
    const status = isAxiosError(error)
      ? error.response?.status
      : error instanceof FamilyApiError
        ? error.status
        : undefined;
    if (!status || status < 400 || status >= 500 || [401, 408, 425, 429].includes(status)) return;
    const next = await owner.db.transaction('rw', owner.db.mutationQueue, async () => {
      owner.assertCurrent();
      const rows = await owner.db.mutationQueue.toArray();
      owner.assertCurrent();
      if (packingDependencyProtectedIds(rows).has(p.command.operation_id)) changed();
      const row = rows.find((r) => r.id === p.command.operation_id);
      if (expected && !sameOriginalStayRow(row, expected)) changed();
      if (!row) return;
      if (!matches(row, p, native)) changed();
      const patch = {
        status: status === 409 ? ('conflict' as const) : ('failed' as const),
        lastError: 'Original stay command refused; retained intact.',
      };
      await owner.db.mutationQueue.update(row.id, patch);
      owner.assertCurrent();
      return structuredClone({ ...row, ...patch });
    });
    owner.assertCurrent();
    return next;
  };
  return { matches, inspect, retain, acknowledge, park };
}
