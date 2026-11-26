import { isAxiosError } from 'axios';
import { z } from 'zod';
import { MUTATION_SCHEMA_VERSION, type QueuedMutation } from '../../db/offlineDb';
import { packingDependencyProtectedIds } from '../../db/packingDependencyProtection';
import { captureWriteSession } from '../../sync/writeSession';
import { FamilyApiError } from './errors';
import { packingBagEnvelope } from './packingBagContract';
import { packingCategoryAggregateEnvelope } from './packingCategoryAggregateContract';
import { packingCategoryEnvelope } from './packingCategoryContract';
import { packingCategoryV2Envelope } from './packingCategoryV2Contract';
import { packingEnvelope, packingJson } from './packingCommandContract';
import { packingGroupEnvelope } from './packingGroupContract';
import { retainTripIntent } from './retainedTripIntent';

export const retainedPackingEnvelope = z.union([
  packingBagEnvelope,
  packingCategoryAggregateEnvelope,
  packingEnvelope,
  packingGroupEnvelope,
  packingCategoryEnvelope,
  packingCategoryV2Envelope,
]);
export type RetainedPackingEnvelope = z.infer<typeof retainedPackingEnvelope>;

export type PackingWriteSession = ReturnType<typeof captureWriteSession>;
export const packingIntentUrl = (p: RetainedPackingEnvelope) =>
  `/trips/${p.command.scope.trip_id}/family/packing/${'kind' in p.command && p.command.kind === 'packing-bag' ? 'bag-commands' : p.version === 3 ? 'category-aggregate-v3' : p.version === 2 ? (p.command.kind === 'packing-category-lifecycle' ? 'category-lifecycle-v2' : 'category-items-v2') : 'kind' in p.command ? (p.command.kind === 'packing-category' ? 'category-commands' : 'group-commands') : 'commands'}`;
function changed(): never {
  throw new FamilyApiError(409, 'packing_queue_changed', 'The retained packing command changed. Nothing was removed.');
}
// Unknown/future metadata and recovery holds belong to their original owner.
export const packingIntentKeys = new Set([
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
export function matchesPackingIntent(row: QueuedMutation, p: RetainedPackingEnvelope, native: number) {
  return (
    Object.keys(row).every((key) => packingIntentKeys.has(key)) &&
    row.id === p.command.operation_id &&
    row.tripId === native &&
    row.schemaVersion === MUTATION_SCHEMA_VERSION &&
    row.retentionPolicy === 'family-original-v1' &&
    row.method === 'POST' &&
    row.resource === undefined &&
    row.entityId === undefined &&
    row.tempEntityId === undefined &&
    row.baseUpdatedAt === undefined &&
    row.url === packingIntentUrl(p) &&
    packingJson(row.body) === packingJson(p)
  );
}
/** Return the validated queue snapshot used to compare the row at acknowledgement. */
export async function inspectPackingIntent(
  owner: PackingWriteSession,
  original: RetainedPackingEnvelope,
  native: number
) {
  const p = retainedPackingEnvelope.parse(original);
  owner.assertCurrent();
  const rows = await owner.db.mutationQueue.toArray();
  if (packingDependencyProtectedIds(rows).has(p.command.operation_id)) changed();
  const row = rows.find((row) => row.id === p.command.operation_id);
  owner.assertCurrent();
  if (row && !matchesPackingIntent(row, p, native)) changed();
  return row;
}
/** Call under the exclusive queue lease; retained originals keep their own exact recovery contract. */
export async function assertPackingObservedIntent(
  owner: PackingWriteSession,
  packet: RetainedPackingEnvelope,
  currentPacket: () => { collection_revision: number; items: { id: string; revision: number }[] } | null,
  check: () => void
) {
  const prior = await owner.db.mutationQueue.get(packet.command.operation_id);
  const expected =
    'expected_collection_revision' in packet.command ? packet.command.expected_collection_revision : null;
  check();
  const current = currentPacket();
  const expectedRow =
    !('kind' in packet.command) && packet.command.action === 'packed-state' ? packet.command.expected_revision : null;
  const staleCollection = expected !== null && expected !== current?.collection_revision;
  const target = 'target_id' in packet.command ? packet.command.target_id : null;
  const staleRow = expectedRow !== null && current?.items.find((row) => row.id === target)?.revision !== expectedRow;
  if (!prior && (staleCollection || staleRow))
    throw new FamilyApiError(
      409,
      'packing_observation_changed',
      'The original packing view changed. Reopen it before editing.'
    );
}
/** Only complete original commands. No temporary IDs, optimistic native cache or competing Trip intent. */
export async function retainPackingIntent(
  owner: PackingWriteSession,
  original: RetainedPackingEnvelope,
  native: number
) {
  const p = retainedPackingEnvelope.parse(original);
  const {
    operation_id: id,
    scope: { trip_id: trip },
  } = p.command;
  return retainTripIntent(
    owner,
    p,
    { id, trip, native },
    {
      matches: matchesPackingIntent,
      url: packingIntentUrl,
      changed,
      olderWork: () =>
        new FamilyApiError(409, 'packing_older_work', 'Resolve the older Trip command before another packing edit.'),
    }
  );
}
export async function acknowledgePackingIntent(
  owner: PackingWriteSession,
  original: RetainedPackingEnvelope,
  native: number,
  expectedRow?: QueuedMutation
) {
  const p = retainedPackingEnvelope.parse(original);
  owner.assertCurrent();
  await owner.db.transaction('rw', owner.db.mutationQueue, async () => {
    owner.assertCurrent();
    const rows = await owner.db.mutationQueue.toArray();
    if (packingDependencyProtectedIds(rows).has(p.command.operation_id)) changed();
    const row = rows.find((row) => row.id === p.command.operation_id);
    owner.assertCurrent();
    if (
      (expectedRow && packingJson(row) !== packingJson(expectedRow)) ||
      (row && !matchesPackingIntent(row, p, native))
    )
      changed();
    if (row) await owner.db.mutationQueue.delete(row.id);
    owner.assertCurrent();
  });
  owner.assertCurrent();
}
export async function parkPackingRefusal(
  owner: PackingWriteSession,
  original: RetainedPackingEnvelope,
  native: number,
  error: unknown,
  expectedRow?: QueuedMutation
) {
  const p = retainedPackingEnvelope.parse(original);
  owner.assertCurrent();
  const status = isAxiosError(error)
    ? error.response?.status
    : error instanceof FamilyApiError
      ? error.status
      : undefined;
  if (!status || status < 400 || status >= 500 || [401, 408, 425, 429].includes(status)) return;
  await owner.db.transaction('rw', owner.db.mutationQueue, async () => {
    owner.assertCurrent();
    const rows = await owner.db.mutationQueue.toArray();
    if (packingDependencyProtectedIds(rows).has(p.command.operation_id)) changed();
    const row = rows.find((row) => row.id === p.command.operation_id);
    owner.assertCurrent();
    if (expectedRow && packingJson(row) !== packingJson(expectedRow)) changed();
    if (!row) return;
    if (!matchesPackingIntent(row, p, native)) changed();
    await owner.db.mutationQueue.update(row.id, {
      status: status === 409 ? 'conflict' : 'failed',
      lastError: 'Original packing command refused; retained intact.',
    });
    owner.assertCurrent();
  });
  owner.assertCurrent();
}
