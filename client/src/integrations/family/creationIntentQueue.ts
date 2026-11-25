import { isAxiosError } from 'axios';
import { CREATION_TERMINAL_ARCHIVE_KEY, creationTerminalBlocks } from '../../db/creationTerminalArchive';
import { MUTATION_SCHEMA_VERSION, type QueuedMutation } from '../../db/offlineDb';
import type { captureWriteSession } from '../../sync/writeSession';
import { FamilyApiError } from './errors';
import type { CreationPacket } from './plannerCreationContract';
export type CreationOwner = ReturnType<typeof captureWriteSession>;
export const creationIntentUrl = (p: CreationPacket) => `/trips/${p.scope.trip_id}/family/planner-create-command`;
export const creationJson = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
const keys = new Set([
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
function changed(): never {
  throw new FamilyApiError(409, 'creation_original_changed', 'The original place save changed. Nothing was removed.');
}
export function creationAffects(row: QueuedMutation, trip: string, native: number) {
  if (!Number.isSafeInteger(row.tripId) || row.tripId === 0 || typeof row.url !== 'string') return true;
  const selector = row.url.match(/^\/trips\/([^/]+)(?:\/|$)/)?.[1];
  return row.tripId === native || selector === trip || selector === String(native);
}
function supportedMetadata(row: QueuedMutation) {
  return (
    Object.keys(row).every((k) => keys.has(k)) &&
    ['pending', 'failed', 'conflict'].includes(row.status) &&
    Number.isFinite(row.createdAt) &&
    typeof row.buildVersion === 'string' &&
    Number.isSafeInteger(row.attempts) &&
    row.attempts >= 0
  );
}
export function matchesCreationOriginal(row: QueuedMutation, p: CreationPacket, native: number) {
  return (
    supportedMetadata(row) &&
    row.schemaVersion === MUTATION_SCHEMA_VERSION &&
    row.retentionPolicy === 'family-original-v1' &&
    row.id === p.operation_id &&
    row.tripId === native &&
    row.method === 'POST' &&
    row.url === creationIntentUrl(p) &&
    creationJson(row.body) === creationJson(p)
  );
}
async function original(owner: CreationOwner, p: CreationPacket, native: number, expected: QueuedMutation) {
  owner.assertCurrent();
  await assertCreationUnarmed(owner, p);
  const rows = (await owner.db.mutationQueue.toArray()).filter((row) => creationAffects(row, p.scope.trip_id, native));
  owner.assertCurrent();
  if (
    rows.length !== 1 ||
    !matchesCreationOriginal(rows[0], p, native) ||
    JSON.stringify(rows[0]) !== JSON.stringify(expected)
  )
    changed();
}
export async function assertCreationOriginal(
  owner: CreationOwner,
  p: CreationPacket,
  native: number,
  expected: QueuedMutation
) {
  await owner.db.transaction('r', owner.db.mutationQueue, owner.db.syncMeta, () =>
    original(owner, p, native, expected)
  );
  owner.assertCurrent();
}
/** Builds a new queued row after the caller has checked its domain and ownership rules. */
export function createRetainedPlannerRow(
  operationId: string,
  nativeTrip: number,
  url: string,
  packet: unknown,
  rows: readonly QueuedMutation[]
): QueuedMutation {
  return {
    id: operationId,
    tripId: nativeTrip,
    method: 'POST',
    url,
    body: structuredClone(packet),
    retentionPolicy: 'family-original-v1',
    status: 'pending',
    attempts: 0,
    lastError: null,
    schemaVersion: MUTATION_SCHEMA_VERSION,
    buildVersion: typeof __TREK_UI_VERSION__ === 'string' ? __TREK_UI_VERSION__ : '',
    createdAt: rows.reduce((n, r) => Math.max(n, r.createdAt + 1), Date.now()),
  };
}
/** Persist first, in the existing immutable account/source database; no native optimistic cache. */
export async function retainCreationIntent(
  owner: CreationOwner,
  p: CreationPacket,
  native: number
): Promise<QueuedMutation> {
  owner.assertCurrent();
  const row = await owner.db.transaction('rw', owner.db.mutationQueue, owner.db.syncMeta, async () => {
    owner.assertCurrent();
    await assertCreationUnarmed(owner, p);
    const rows = await owner.db.mutationQueue.toArray();
    owner.assertCurrent();
    if (rows.some((r) => r.id !== p.operation_id && creationAffects(r, p.scope.trip_id, native)))
      throw new FamilyApiError(
        409,
        'creation_older_work',
        'Resolve the older Trip save before creating another place or visit.'
      );
    const existing = rows.find((r) => r.id === p.operation_id);
    if (existing) {
      if (!matchesCreationOriginal(existing, p, native)) changed();
      return structuredClone(existing);
    }
    if (!Number.isSafeInteger(native) || native === 0 || rows.some((r) => !Number.isFinite(r.createdAt))) changed();
    const saved = createRetainedPlannerRow(p.operation_id, native, creationIntentUrl(p), p, rows);
    await owner.db.mutationQueue.add(saved);
    owner.assertCurrent();
    return saved;
  });
  owner.assertCurrent();
  return row;
}
export async function acknowledgeCreationIntent(
  owner: CreationOwner,
  p: CreationPacket,
  native: number,
  expected: QueuedMutation
) {
  owner.assertCurrent();
  await owner.db.transaction('rw', owner.db.mutationQueue, owner.db.syncMeta, async () => {
    await original(owner, p, native, expected);
    await owner.db.mutationQueue.delete(expected.id);
    owner.assertCurrent();
  });
  owner.assertCurrent();
}
export async function parkCreationRefusal(
  owner: CreationOwner,
  p: CreationPacket,
  native: number,
  expected: QueuedMutation,
  error: unknown
) {
  owner.assertCurrent();
  const status = isAxiosError(error)
    ? error.response?.status
    : error instanceof FamilyApiError
      ? error.status
      : undefined;
  if (!status || status < 400 || status >= 500 || [401, 408, 425, 429].includes(status)) return;
  await owner.db.transaction('rw', owner.db.mutationQueue, owner.db.syncMeta, async () => {
    await original(owner, p, native, expected);
    await owner.db.mutationQueue.update(expected.id, {
      status: status === 409 ? 'conflict' : 'failed',
      lastError: 'Original place save refused; retained intact.',
    });
    owner.assertCurrent();
  });
}

/** An armed or settled original cannot be retried by any current native producer or acknowledgement path. */
export async function assertCreationUnarmed(owner: CreationOwner, p: CreationPacket) {
  const meta = await owner.db.syncMeta.get(CREATION_TERMINAL_ARCHIVE_KEY);
  owner.assertCurrent();
  if (creationTerminalBlocks(meta, p.scope.trip_id, p.operation_id))
    throw new FamilyApiError(
      409,
      'creation_terminal_held',
      'This original has a cancellation decision. Resolve that decision before creating another save.'
    );
}
