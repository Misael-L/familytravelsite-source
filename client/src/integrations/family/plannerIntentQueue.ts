import { isAxiosError } from 'axios';
import { CREATION_TERMINAL_ARCHIVE_KEY, creationTerminalBlocks } from '../../db/creationTerminalArchive';
import { MUTATION_SCHEMA_VERSION, type QueuedMutation } from '../../db/offlineDb';
import { createRetainedPlannerRow, creationAffects, type CreationOwner } from './creationIntentQueue';
import { FamilyApiError } from './errors';
import { dependencyIdentity } from './packingBagDependencyContract';
import type { CreationPacket } from './plannerCreationContract';

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
  'conflictServer',
  'conflictAt',
]);
const identity = (value: unknown) => dependencyIdentity(value, true);

type PlannerIntentQueueProtocol<Packet> = {
  tripId: (packet: Packet) => string;
  url: (packet: Packet) => string;
  changed: () => FamilyApiError;
  refusalMessage: string;
};

export function createPlannerIntentQueue<Packet extends Pick<CreationPacket, 'operation_id'>>({
  tripId,
  url,
  changed,
  refusalMessage,
}: PlannerIntentQueueProtocol<Packet>) {
  function matchesOriginal(row: QueuedMutation, p: Packet, native: number) {
    return (
      Object.keys(row).every((k) => keys.has(k)) &&
      ['pending', 'failed', 'conflict'].includes(row.status) &&
      Number.isSafeInteger(row.createdAt) &&
      (row.conflictAt === undefined || Number.isSafeInteger(row.conflictAt)) &&
      Number.isSafeInteger(row.attempts) &&
      row.attempts >= 0 &&
      typeof row.buildVersion === 'string' &&
      row.schemaVersion === MUTATION_SCHEMA_VERSION &&
      row.retentionPolicy === 'family-original-v1' &&
      row.id === p.operation_id &&
      row.tripId === native &&
      row.method === 'POST' &&
      row.url === url(p) &&
      identity(row.body) === identity(p)
    );
  }
  async function held(owner: CreationOwner, p: Packet) {
    const meta = await owner.db.syncMeta.get(CREATION_TERMINAL_ARCHIVE_KEY);
    owner.assertCurrent();
    if (creationTerminalBlocks(meta, tripId(p), p.operation_id)) throw changed();
  }
  async function original(owner: CreationOwner, p: Packet, native: number, row: QueuedMutation) {
    owner.assertCurrent();
    await held(owner, p);
    const rows = (await owner.db.mutationQueue.toArray()).filter((r) => creationAffects(r, tripId(p), native));
    owner.assertCurrent();
    if (rows.length !== 1 || !matchesOriginal(rows[0], p, native) || identity(rows[0]) !== identity(row))
      throw changed();
  }
  async function assertOriginal(owner: CreationOwner, p: Packet, native: number, row: QueuedMutation) {
    await owner.db.transaction('r', owner.db.mutationQueue, owner.db.syncMeta, () => original(owner, p, native, row));
    owner.assertCurrent();
  }
  /** The dispatcher also refuses any other original; it never treats a packet as a network target. */
  async function assertAvailable(owner: CreationOwner, p: Packet, native: number) {
    await owner.db.transaction('r', owner.db.mutationQueue, owner.db.syncMeta, async () => {
      owner.assertCurrent();
      await held(owner, p);
      const rows = await owner.db.mutationQueue.toArray();
      owner.assertCurrent();
      if (
        rows.some(
          (r) => creationAffects(r, tripId(p), native) && (r.id !== p.operation_id || !matchesOriginal(r, p, native))
        )
      )
        throw changed();
    });
    owner.assertCurrent();
  }
  async function retain(owner: CreationOwner, p: Packet, native: number): Promise<QueuedMutation> {
    owner.assertCurrent();
    const row = await owner.db.transaction('rw', owner.db.mutationQueue, owner.db.syncMeta, async () => {
      owner.assertCurrent();
      await held(owner, p);
      const rows = await owner.db.mutationQueue.toArray();
      owner.assertCurrent();
      if (rows.some((r) => r.id !== p.operation_id && creationAffects(r, tripId(p), native))) throw changed();
      const existing = rows.find((r) => r.id === p.operation_id);
      if (existing) {
        if (!matchesOriginal(existing, p, native)) throw changed();
        return structuredClone(existing);
      }
      if (!Number.isSafeInteger(native) || native === 0 || rows.some((r) => !Number.isSafeInteger(r.createdAt)))
        throw changed();
      const saved = createRetainedPlannerRow(p.operation_id, native, url(p), p, rows);
      await owner.db.mutationQueue.add(saved);
      owner.assertCurrent();
      return saved;
    });
    owner.assertCurrent();
    return row;
  }
  async function acknowledge(owner: CreationOwner, p: Packet, native: number, row: QueuedMutation) {
    await owner.db.transaction('rw', owner.db.mutationQueue, owner.db.syncMeta, async () => {
      await original(owner, p, native, row);
      await owner.db.mutationQueue.delete(row.id);
      owner.assertCurrent();
    });
    owner.assertCurrent();
  }
  async function parkRefusal(owner: CreationOwner, p: Packet, native: number, row: QueuedMutation, error: unknown) {
    const status = isAxiosError(error)
      ? error.response?.status
      : error instanceof FamilyApiError
        ? error.status
        : undefined;
    owner.assertCurrent();
    if (!status || status < 400 || status >= 500 || [401, 408, 425, 429].includes(status)) return;
    await owner.db.transaction('rw', owner.db.mutationQueue, owner.db.syncMeta, async () => {
      await original(owner, p, native, row);
      await owner.db.mutationQueue.update(row.id, {
        status: status === 409 ? 'conflict' : 'failed',
        lastError: refusalMessage,
      });
      owner.assertCurrent();
    });
  }

  return { matchesOriginal, assertOriginal, assertAvailable, retain, acknowledge, parkRefusal };
}
