import { z } from 'zod';
import type { QueuedMutation } from '../../db/offlineDb';
import { SOURCE_PAUSE_KEY } from '../../db/sourceDatabase';
import type { captureWriteSession } from '../../sync/writeSession';
import {
  COLLECTION_QUEUE_FORMAT,
  collectionCommandBelongs,
  collectionCommandParent,
  collectionCommandUrl,
  parseCollectionCommand,
  type CollectionCommand,
} from './collectionCommandContract';
import * as c from './collectionContract';
import { FamilyApiError } from './errors';
export type CollectionQueueOwner = ReturnType<typeof captureWriteSession>;
const rowSchema = z
  .object({
    id: c.collectionId,
    tripId: z.literal(0),
    schemaVersion: z.literal(COLLECTION_QUEUE_FORMAT),
    method: z.literal('POST'),
    url: z.string(),
    body: z.unknown(),
    retentionPolicy: z.literal('family-original-v1'),
    createdAt: z.number().int().nonnegative().safe(),
    status: z.enum(['pending', 'failed', 'conflict']),
    attempts: z.number().int().nonnegative().safe(),
    lastError: z.string().nullable(),
    buildVersion: z.string(),
  })
  .strict();
export const collectionQueueChanged = () =>
  new FamilyApiError(
    409,
    'collection_queue_changed',
    'The retained Collection work changed or is unsupported. Nothing was removed.'
  );
export function parseCollectionQueueRow(raw: unknown) {
  const row = c.collectionParse(rowSchema, raw, 1048576),
    packet = parseCollectionCommand(row.body);
  if (row.id !== packet.operation_id || row.url !== collectionCommandUrl(packet)) throw collectionQueueChanged();
  return { row: row as QueuedMutation, packet };
}
export function createCollectionCommandQueue(owner: CollectionQueueOwner, scope: c.CollectionIdentity, source: string) {
  const check = (raw: unknown) => {
    const r = parseCollectionQueueRow(raw);
    if (!collectionCommandBelongs(r.packet, scope, source)) throw collectionQueueChanged();
    return r;
  };
  const same = (a: unknown, b: unknown) => c.collectionJson(a, 1048576) === c.collectionJson(b, 1048576);
  const own = (row: QueuedMutation) => collectionCommandParent(row.url) === scope.collection_id;
  async function exact(expected: QueuedMutation) {
    owner.assertCurrent();
    const row = await owner.db.mutationQueue.get(expected.id);
    owner.assertCurrent();
    if (!row || !same(row, expected)) throw collectionQueueChanged();
    return check(row);
  }
  async function transaction<T>(fn: () => Promise<T>) {
    owner.assertCurrent();
    const result = await owner.db.transaction('rw', owner.db.mutationQueue, owner.db.syncMeta, async () => {
      owner.assertCurrent();
      const r = await fn();
      owner.assertCurrent();
      return r;
    });
    owner.assertCurrent();
    return result;
  }
  return {
    async list() {
      owner.assertCurrent();
      const rows = await owner.db.mutationQueue.toArray();
      owner.assertCurrent();
      return rows.filter(own).map((row) => check(row));
    },
    async get(id: string) {
      owner.assertCurrent();
      const rows = await owner.db.mutationQueue.toArray();
      owner.assertCurrent();
      const siblings = rows.filter(own);
      if (siblings.length !== 1 || siblings[0].id !== id) throw collectionQueueChanged();
      return check(siblings[0]);
    },
    exact,
    async retain(raw: CollectionCommand) {
      const packet = parseCollectionCommand(raw);
      if (!collectionCommandBelongs(packet, scope, source) || packet.scope.session_id !== scope.session_id)
        throw collectionQueueChanged();
      return transaction(async () => {
        const rows = await owner.db.mutationQueue.toArray();
        owner.assertCurrent();
        if (
          rows.some(
            (r) => r.id === packet.operation_id || own(r) || (r.tripId === 0 && !collectionCommandParent(r.url))
          )
        )
          throw collectionQueueChanged();
        const row: QueuedMutation = {
          id: packet.operation_id,
          tripId: 0,
          method: 'POST',
          url: collectionCommandUrl(packet),
          body: packet,
          retentionPolicy: 'family-original-v1',
          status: 'pending',
          attempts: 0,
          lastError: null,
          schemaVersion: COLLECTION_QUEUE_FORMAT,
          buildVersion: typeof __TREK_UI_VERSION__ === 'string' ? __TREK_UI_VERSION__ : '',
          createdAt: Math.max(Date.now(), ...rows.map((r) => r.createdAt + 1)),
        };
        check(row);
        await owner.db.mutationQueue.add(structuredClone(row));
        return row;
      });
    },
    async replace(expected: QueuedMutation, next: CollectionCommand) {
      return transaction(async () => {
        const { packet } = await exact(expected),
          p = parseCollectionCommand(next);
        const stable = (x: CollectionCommand) => {
          const { original: _original, decision: _decision, ...base } = x;
          return base;
        };
        if (
          !same(stable(packet), stable(p)) ||
          (packet.decision === 'cancel' && p.decision !== 'cancel') ||
          (packet.original !== null && !same(packet.original, p.original))
        )
          throw collectionQueueChanged();
        const row = { ...expected, body: p };
        check(row);
        await owner.db.mutationQueue.put(structuredClone(row));
        return row;
      });
    },
    async acknowledge(expected: QueuedMutation, publish: () => unknown) {
      return transaction(async () => {
        await exact(expected);
        owner.assertCurrent();
        const result = publish();
        if (result !== undefined) throw collectionQueueChanged();
        owner.assertCurrent();
        await owner.db.mutationQueue.delete(expected.id);
        const paused = await owner.db.syncMeta.get(SOURCE_PAUSE_KEY);
        if (paused?.sourcePaused?.includes(expected.id))
          await owner.db.syncMeta.put({
            ...paused,
            sourcePaused: paused.sourcePaused.filter((id) => id !== expected.id),
          });
      });
    },
  };
}
