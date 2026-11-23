import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { Blob as NativeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlace, buildTrip } from '../../../tests/helpers/factories';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import { apiClient } from '../../api/client';
import { CREATION_TERMINAL_ARCHIVE_KEY as CREATION_KEY } from '../../db/creationTerminalArchive';
import {
  clearAll,
  clearTripData,
  currentOfflineDatabase,
  deleteCurrentUserDb,
  detachOfflineDatabase,
  invalidateOfflineSession,
  offlineDb,
  reopenAnonymous,
  reopenForUser,
  type QueuedMutation,
  type SyncMeta,
} from '../../db/offlineDb';
import { PACKING_TERMINAL_ARCHIVE_KEY as PACKING_KEY } from '../../db/packingTerminalArchive';
import {
  installSourcePolicy,
  SOURCE_OWNER_KEY,
  SOURCE_PAUSE_KEY,
  sourceOwnerMarker,
  sourceOwnerName,
  type SourceDatabaseOwner,
} from '../../db/sourceDatabase';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode } from '../../sync/networkMode';
import { prepareOriginalWorkExport } from '../../sync/originalWorkExport';
import { readQueueStatus } from '../../sync/queueStatus';
import { captureReadSession } from '../../sync/readSession';
import { prepareRetainedWorkExport, retainedWorkCount } from '../../sync/retainedRecovery';

const USER = 279201;
const OTHER_USER = 279202;
const TRIP = 'd27d0000-0000-4000-8000-000000000009';
const OWNER: SourceDatabaseOwner = {
  format: 'family.native-owner.v1',
  source: 'http://127.0.0.1:55331',
  user_id: 'd27d0000-0000-4000-8000-000000000001',
  family_id: 'd27d0000-0000-4000-8000-000000000002',
  person_id: 'd27d0000-0000-4000-8000-000000000003',
  native_user: USER,
};
let releaseSource: (() => void) | undefined;
let currentSource: SourceDatabaseOwner;
const names = new Set<string>();
const exports: Array<Awaited<ReturnType<typeof prepareOriginalWorkExport>>> = [];

beforeEach(async () => {
  vi.stubGlobal('Blob', NativeBlob);
  await reopenForUser(USER);
  await resetOfflineTestDatabase();
  setAuthed(true);
  _resetNetworkMode();
  installTestLocks();
  mutationQueue._resetFlushing();
});
afterEach(async () => {
  for (const prepared of exports.splice(0)) prepared.dispose();
  releaseSource?.();
  releaseSource = undefined;
  detachOfflineDatabase();
  await reopenAnonymous();
  for (const name of [...names, `trek-offline-u${USER}`, `trek-offline-u${OTHER_USER}`]) await Dexie.delete(name);
  names.clear();
  mutationQueue._resetFlushing();
  setAuthed(false);
  _resetNetworkMode();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function original(id = 'creation-original', status: QueuedMutation['status'] = 'pending'): QueuedMutation {
  return {
    id,
    tripId: 9,
    method: 'POST',
    url: `/trips/${TRIP}/family/planner-create-command`,
    body: {
      version: 1,
      source_url: OWNER.source,
      operation_id: id,
      scope: { version: 1, ...OWNER, trip_id: TRIP, layer: 'myDraft' },
      form: { name: 'Puebla — café', latitude: -0, longitude: -98.198151, notes: null },
    },
    retentionPolicy: 'family-original-v1',
    createdAt: 123,
    status,
    attempts: 4,
    lastError: 'Original refusal',
    retryAfter: 456,
    syncingSince: undefined,
    schemaVersion: 2,
    buildVersion: 'preservation-fixture',
  };
}
function entry(row: QueuedMutation, state = 'pending') {
  return {
    key: `original:${row.id}`,
    row: structuredClone(row),
    state,
    row_sha256: 'a'.repeat(64),
    request_sha256: 'b'.repeat(64),
    proof:
      state === 'pending'
        ? null
        : {
            version: 2,
            trip_id: TRIP,
            operation_id: row.id,
            scope: (row.body as { scope: unknown }).scope,
            form: (row.body as { form: unknown }).form,
            request_sha256: 'b'.repeat(64),
            status: state,
            cancelled_at: state === 'cancelled' ? '2026-11-16T12:01:00Z' : null,
            result:
              state === 'committed'
                ? { version: 1, state: 'draft', location_id: null, visit_id: null, operation: { op_id: row.id } }
                : null,
          },
    decided_at: '2026-11-16T12:00:00.000Z',
    settled_at: state === 'pending' ? null : '2026-11-16T12:01:00.000Z',
  };
}
function creation(...entries: unknown[]): SyncMeta {
  return {
    tripId: CREATION_KEY,
    lastSyncedAt: null,
    status: 'idle',
    tilesBbox: null,
    filesCachedCount: 0,
    familyCreationTerminalArchive: { version: 1, kind: 'creation-terminal-archive', entries },
  };
}
function packing(row: QueuedMutation): SyncMeta {
  return {
    tripId: PACKING_KEY,
    lastSyncedAt: null,
    status: 'idle',
    tilesBbox: null,
    filesCachedCount: 0,
    familyPackingTerminalArchive: { version: 1, kind: 'packing-terminal-archive', entries: [entry(row, 'cancelled')] },
  };
}
async function seed(row: QueuedMutation, meta: SyncMeta = creation(entry(row))) {
  await offlineDb.transaction('rw', offlineDb.mutationQueue, offlineDb.syncMeta, async () => {
    await offlineDb.mutationQueue.put(row);
    await offlineDb.syncMeta.put(meta);
  });
}
async function cache() {
  await offlineDb.trips.put(buildTrip({ id: 9 }));
  await offlineDb.places.put(buildPlace({ id: 42, trip_id: 9 }));
}
async function graphExport() {
  const prepared = await prepareOriginalWorkExport();
  exports.push(prepared);
  const file = JSON.parse(await prepared.blob.text()) as { format: string; payload: string };
  const payload = JSON.parse(file.payload) as {
    automatic_replay: boolean;
    graph: { root: Encoded; nodes: Array<{ kind: string; length?: number; entries: Array<[string, Encoded]> }> };
  };
  const nodes = payload.graph.nodes.map((n) => {
    if (n.kind === 'array') return new Array(n.length) as object;
    if (n.kind === 'object') return {};
    throw Error('Unexpected preservation fixture graph');
  });
  const value = ([kind, item]: Encoded): unknown => {
    if (kind === 'ref') return nodes[item as number];
    if (kind === 'undefined') return undefined;
    if (kind === 'null') return null;
    if (kind === 'number' && item === '-0') return -0;
    return item;
  };
  payload.graph.nodes.forEach((n, i) => {
    for (const [key, encoded] of n.entries)
      Object.defineProperty(nodes[i], key, {
        value: value(encoded),
        enumerable: true,
        configurable: true,
        writable: true,
      });
  });
  return {
    prepared,
    file,
    payload,
    data: value(payload.graph.root) as { settled_originals?: SyncMeta; creation_terminal_originals?: SyncMeta },
  };
}
type Encoded = [string, (number | string | boolean)?];
async function installSource() {
  currentSource = OWNER;
  releaseSource = installSourcePolicy({
    async select(user) {
      const owner = currentSource;
      if (Number(user) !== owner.native_user) throw Error('Wrong source account');
      const name = await sourceOwnerName(owner);
      names.add(name);
      return {
        name,
        owner,
        current: () => currentSource === owner,
        initialize: () => true,
        writable: () => currentSource === owner,
      };
    },
    async read() {
      throw Error('No unverified source fallback');
    },
  });
  detachOfflineDatabase();
  await reopenForUser(USER);
}
async function rawMeta(name: string, key: number) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<SyncMeta>((resolve, reject) => {
      const tx = db.transaction('syncMeta'),
        request = tx.objectStore('syncMeta').get(key);
      tx.oncomplete = () => resolve(request.result as SyncMeta);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

describe('Q27d2a creation journal preservation, without terminal execution', () => {
  it.each(['pending', 'syncing', 'failed', 'conflict'] as const)(
    'logout preserves the exact %s armed original and both archives while purging read caches',
    async (status) => {
      const row = original('armed', status),
        meta = creation(entry(row)),
        packed = packing(original('packing'));
      await seed(row, meta);
      await offlineDb.syncMeta.put(packed);
      await cache();
      await deleteCurrentUserDb();
      await reopenForUser(USER);
      setAuthed(true);
      expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
      expect(await offlineDb.syncMeta.get(CREATION_KEY)).toEqual(meta);
      expect(await offlineDb.syncMeta.get(PACKING_KEY)).toEqual(packed);
      expect(await offlineDb.trips.count()).toBe(0);
      expect(await offlineDb.places.count()).toBe(0);
    }
  );
  it('keeps settled archive-only work across Clear cache, per-Trip eviction and logout', async () => {
    const meta = creation(entry(original(), 'committed')),
      packed = packing(original('packing'));
    await offlineDb.syncMeta.bulkPut([meta, packed]);
    await cache();
    await clearTripData(9);
    await clearAll();
    expect(await offlineDb.syncMeta.get(CREATION_KEY)).toEqual(meta);
    expect(await retainedWorkCount()).toBe(2);
    expect(await readQueueStatus()).toMatchObject({ pending: 0, failed: 0, conflicts: [], retained: 2 });
    await deleteCurrentUserDb();
    await reopenForUser(USER);
    expect(await offlineDb.syncMeta.get(CREATION_KEY)).toEqual(meta);
    expect(await offlineDb.syncMeta.get(PACKING_KEY)).toEqual(packed);
  });
  it('exports mixed archives in separate fields and counts pending copies only once', async () => {
    const row = original(),
      meta = creation(entry(row), entry(original('settled'), 'cancelled'));
    const packed = packing(original('packing'));
    await seed(row, meta);
    await offlineDb.syncMeta.put(packed);
    expect(await retainedWorkCount()).toBe(3);
    expect(await readQueueStatus()).toMatchObject({ pending: 1, retained: 3 });
    const file = JSON.parse(await (await prepareRetainedWorkExport()).blob.text());
    expect(file.format).toBe('family.retained-work.v1');
    expect(file.automatic_replay).toBe(false);
    expect(file.retained_count).toBe(3);
    expect(file.settled_originals).toEqual(
      JSON.parse(JSON.stringify(packed, (_key, value) => (value === undefined ? null : value)))
    );
    expect(file.undefined_paths).toContainEqual([
      'settled_originals',
      'familyPackingTerminalArchive',
      'entries',
      0,
      'row',
      'syncingSince',
    ]);
    expect(file.negative_zero_paths).toContainEqual([
      'settled_originals',
      'familyPackingTerminalArchive',
      'entries',
      0,
      'row',
      'body',
      'form',
      'latitude',
    ]);
    expect(file.creation_terminal_originals.tripId).toBe(CREATION_KEY);
    expect(file.undefined_paths).toContainEqual([
      'creation_terminal_originals',
      'familyCreationTerminalArchive',
      'entries',
      0,
      'row',
      'syncingSince',
    ]);
    expect(file.negative_zero_paths).toContainEqual([
      'creation_terminal_originals',
      'familyCreationTerminalArchive',
      'entries',
      0,
      'row',
      'body',
      'form',
      'latitude',
    ]);
    const graph = await graphExport();
    expect(graph.file.format).toBe('family.original-work.v2');
    expect(graph.payload.automatic_replay).toBe(false);
    expect(graph.data.settled_originals).toEqual(packed);
    expect(graph.data.creation_terminal_originals).toEqual(meta);
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
  });
  it('exports a creation-only journal without a remaining queue or packing row', async () => {
    const meta = creation(entry(original(), 'cancelled'));
    await offlineDb.syncMeta.put(meta);
    const file = JSON.parse(await (await prepareRetainedWorkExport()).blob.text());
    expect(file.creation_terminal_originals.tripId).toBe(CREATION_KEY);
    expect(file).not.toHaveProperty('settled_originals');
    expect(file.rows).toEqual([]);
    expect(file.retained_count).toBe(1);
    expect((await graphExport()).data.creation_terminal_originals).toEqual(meta);
  });
  it('retains opaque future journals through export, logout and cache cleanup without interpreting them', async () => {
    const row = original(),
      meta = creation();
    meta.familyCreationTerminalArchive = { version: 99, future: { untouched: ['private original', null] } };
    await seed(row, meta);
    expect(await retainedWorkCount()).toBe(2);
    expect((await graphExport()).data.creation_terminal_originals).toEqual(meta);
    const file = JSON.parse(await (await prepareRetainedWorkExport()).blob.text());
    expect(file.creation_terminal_originals.familyCreationTerminalArchive).toEqual(meta.familyCreationTerminalArchive);
    await expect(clearAll()).rejects.toThrow();
    await deleteCurrentUserDb();
    await reopenForUser(USER);
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
    await offlineDb.mutationQueue.delete(row.id);
    await clearAll();
    expect(await offlineDb.syncMeta.get(CREATION_KEY)).toEqual(meta);
  });
  it('refuses unsafe journal exports without redaction or deletion', async () => {
    const meta = creation();
    meta.familyCreationTerminalArchive = { version: 99, access_token: 'credential-shaped-original' };
    await offlineDb.syncMeta.put(meta);
    await expect(prepareRetainedWorkExport()).rejects.toThrow('credentials');
    await expect(prepareOriginalWorkExport()).rejects.toThrow('credentials');
    expect(await offlineDb.syncMeta.get(CREATION_KEY)).toEqual(meta);
  });
  it.each(['count', 'export', 'status'] as const)('reads queue plus both journals atomically for %s', async (kind) => {
    const row = original(),
      meta = creation(entry(row));
    await seed(row, meta);
    const db = currentOfflineDatabase();
    let writer: Promise<unknown> | undefined;
    const hook = (value: QueuedMutation) => {
      if (writer === undefined)
        writer = Dexie.ignoreTransaction(() =>
          db.transaction('rw', db.mutationQueue, db.syncMeta, async () => {
            await db.syncMeta.put(creation(entry(row, 'cancelled')));
            await db.mutationQueue.delete(row.id);
            await db.syncMeta.put(packing(original('later-packing')));
          })
        );
      return value;
    };
    db.mutationQueue.hook('reading', hook);
    try {
      if (kind === 'count') expect(await retainedWorkCount()).toBe(1);
      else if (kind === 'status') expect(await readQueueStatus()).toMatchObject({ pending: 1, retained: 1 });
      else {
        const file = JSON.parse(await (await prepareRetainedWorkExport()).blob.text());
        expect(file.rows).toHaveLength(1);
        expect(file).not.toHaveProperty('settled_originals');
        expect(file.creation_terminal_originals.familyCreationTerminalArchive.entries[0].state).toBe('pending');
      }
      await writer;
      expect(await db.mutationQueue.count()).toBe(0);
      expect(await retainedWorkCount()).toBe(2);
    } finally {
      db.mutationQueue.hook('reading').unsubscribe(hook);
    }
  });
  it.each(['pending', 'unknown'] as const)(
    'blocks generic replay and metadata resets for a %s creation decision',
    async (state) => {
      const row = original('failed', 'failed'),
        meta = creation(entry(row));
      if (state === 'unknown') meta.familyCreationTerminalArchive = { version: 99, untouched: true };
      await seed(row, meta);
      const later = { ...original('later'), url: `/trips/${TRIP}/family/planner-editor-command` };
      await offlineDb.mutationQueue.put(later);
      const network = vi.spyOn(apiClient, 'request').mockRejectedValue(Error('Unexpected generic replay'));
      await mutationQueue.retryFailed();
      expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
      expect(await offlineDb.mutationQueue.get(later.id)).toEqual(later);
      const conflicted = { ...row, status: 'conflict' as const };
      await offlineDb.mutationQueue.put(conflicted);
      await expect(mutationQueue.resolveKeepMine(row.id)).rejects.toThrow('creation cancellation');
      expect(await offlineDb.mutationQueue.get(row.id)).toEqual(conflicted);
      expect(await offlineDb.syncMeta.get(CREATION_KEY)).toEqual(meta);
      expect(network).not.toHaveBeenCalled();
    }
  );
  it('does not let a settled archive block ordinary retry metadata handling', async () => {
    const row = { ...original('ordinary', 'failed'), url: '/trips/9/places/42', retentionPolicy: undefined };
    await seed(row, creation(entry(original('settled'), 'committed')));
    const flush = vi.spyOn(mutationQueue, 'flush').mockResolvedValue();
    await mutationQueue.retryFailed();
    expect(await offlineDb.mutationQueue.get(row.id)).toMatchObject({
      status: 'pending',
      attempts: 0,
      lastError: null,
    });
    expect(flush).toHaveBeenCalledOnce();
  });
  it('invalidates prepared exports after account/epoch retirement and leaves journals in their original account', async () => {
    const meta = creation(entry(original(), 'cancelled'));
    await offlineDb.syncMeta.put(meta);
    const retained = await prepareRetainedWorkExport(),
      graph = await graphExport();
    invalidateOfflineSession();
    expect(retained.assertCurrent).toThrow('account changed');
    expect(graph.prepared.assertCurrent).toThrow('context changed');
    await reopenForUser(OTHER_USER);
    expect(await retainedWorkCount()).toBe(0);
    await expect(prepareRetainedWorkExport()).rejects.toThrow('no retained');
    await reopenForUser(USER);
    expect(await offlineDb.syncMeta.get(CREATION_KEY)).toEqual(meta);
  });
  it('preserves source-owned pending decisions, owner marker and pause state across logout', async () => {
    await installSource();
    const row = original(),
      meta = creation(entry(row)),
      packed = packing(original('packing'));
    await seed(row, meta);
    await offlineDb.syncMeta.put(packed);
    await cache();
    const name = currentOfflineDatabase().name;
    await deleteCurrentUserDb();
    expect(await rawMeta(name, CREATION_KEY)).toEqual(meta);
    expect(await rawMeta(name, PACKING_KEY)).toEqual(packed);
    expect(await rawMeta(name, SOURCE_OWNER_KEY)).toEqual(sourceOwnerMarker(OWNER));
    expect((await rawMeta(name, SOURCE_PAUSE_KEY)).sourcePaused).toEqual([row.id]);
    await reopenForUser(USER);
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
    expect(await offlineDb.trips.count()).toBe(0);
    expect(await offlineDb.places.count()).toBe(0);
  });
  it('refuses source-retired reads and prepared exports without relabeling the journal', async () => {
    await installSource();
    const meta = creation(entry(original(), 'cancelled'));
    await offlineDb.syncMeta.put(meta);
    const name = currentOfflineDatabase().name,
      session = captureReadSession();
    const retained = await prepareRetainedWorkExport(),
      graph = await graphExport();
    currentSource = { ...OWNER, source: 'http://localhost:55331' };
    expect(retained.assertCurrent).toThrow();
    expect(graph.prepared.assertCurrent).toThrow();
    await expect(readQueueStatus(session)).rejects.toThrow();
    await expect(retainedWorkCount()).rejects.toThrow();
    expect(await rawMeta(name, CREATION_KEY)).toEqual(meta);
  });
  it.each(['row_sha256', 'request_sha256', 'proof', 'settled_at', 'decided_at'])(
    'malformed settled %s remains held against generic retries and logout rewriting',
    async (field) => {
      const row = original('bad-settled', 'failed'),
        e = { ...entry(row, 'committed'), [field]: null },
        meta = creation(e);
      await seed(row, meta);
      await mutationQueue.retryFailed();
      expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
      const name = currentOfflineDatabase().name;
      await deleteCurrentUserDb();
      expect(await rawMeta(name, CREATION_KEY)).toEqual(meta);
    }
  );
  it('a settled proof naming another saved location stays held instead of rewriting the original', async () => {
    const row = original('bad-location', 'failed');
    const body = row.body as { scope: Record<string, unknown>; form: Record<string, unknown> };
    body.scope.layer = 'published';
    body.form = {
      location: { id: 'expected-location', revision: 1 },
      day: { id: 'day', civil_day: '2027-04-01' },
      clocks: { start: null, end: null },
      visit_notes: null,
    };
    const e = entry(row, 'committed');
    if (!e.proof) throw new Error('Missing proof fixture');
    const corrupted = {
      ...e,
      proof: {
        ...e.proof,
        result: {
          version: 1,
          state: 'published',
          location_id: 'other-location',
          visit_id: 'visit',
          operation: { id: 'visit' },
        },
      },
    };
    await seed(row, creation(corrupted));
    await mutationQueue.retryFailed();
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
  });
});
