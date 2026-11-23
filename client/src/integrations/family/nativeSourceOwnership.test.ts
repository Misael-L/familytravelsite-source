import { cleanup, renderHook } from '@testing-library/react';
import Dexie from 'dexie';
import { Blob as NativeBlob, File as NativeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAll,
  currentOfflineDatabase,
  deleteCurrentUserDb,
  detachOfflineDatabase,
  offlineDb,
  prepareSourceDatabaseRead,
  reopenAnonymous,
  reopenForUser,
  TrekOfflineDb,
  type QueuedMutation,
} from '../../db/offlineDb';
import {
  installSourcePolicy,
  SOURCE_OWNER_KEY,
  SOURCE_PAUSE_KEY,
  sourceOwnerMarker,
  sourceOwnerName,
  type SourceDatabaseBinding,
  type SourceDatabaseOwner,
} from '../../db/sourceDatabase';
import { useStayActionScope, useStayState } from '../../hooks/useStayActionScope';
import { setAuthed } from '../../sync/authGate';
import { useImportAccountScope } from '../../sync/importSessionScope';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { prepareOriginalWorkExport } from '../../sync/originalWorkExport';
import { readQueueStatus } from '../../sync/queueStatus';
import { captureReadSession } from '../../sync/readSession';
const A: SourceDatabaseOwner = {
  format: 'family.native-owner.v1',
  source: 'http://127.0.0.1:55331',
  user_id: 'd16c0000-0000-4000-8000-000000000001',
  family_id: 'd16c0000-0000-4000-8000-000000000002',
  person_id: 'd16c0000-0000-4000-8000-000000000003',
  native_user: 161601,
};
const B = { ...A, source: 'http://localhost:55331' };
const row: QueuedMutation = {
  id: 'exact-operation',
  tripId: 9,
  method: 'POST',
  url: '/trips/9/family/future',
  body: { operation_id: 'exact-operation', revision: 'original', unknown: [false, 7] },
  createdAt: 123,
  status: 'pending',
  attempts: 4,
  schemaVersion: 999,
  lastError: 'original refusal',
};
let current = A,
  active = true,
  accepted = true,
  writable = true,
  release = () => {};
const names = new Set<string>();
async function binding(owner: SourceDatabaseOwner): Promise<SourceDatabaseBinding> {
  const name = await sourceOwnerName(owner);
  names.add(name);
  return {
    name,
    owner,
    current: () => active && current === owner,
    initialize: () => accepted && active && current === owner,
    writable: () => writable && accepted && active && current === owner,
  };
}
function install() {
  release = installSourcePolicy({
    async select(user) {
      if (!accepted || Number(user) !== current.native_user) throw Error('No accepted bootstrap');
      return binding(current);
    },
    async read() {
      const value = await binding(current);
      if (!(await Dexie.exists(value.name))) throw Error('Missing original');
      return { ...value, initialize: () => false, writable: () => false };
    },
  });
  detachOfflineDatabase();
}
async function seed() {
  await reopenForUser(current.native_user);
  await offlineDb.mutationQueue.put(row);
  await offlineDb.importFiles.put({
    jobId: 'same-job',
    fileName: 'original.pdf',
    blob: new NativeFile([new Uint8Array([0, 255, 128, 13, 10])], 'original.pdf', {
      type: 'application/pdf',
      lastModified: 321,
    }) as unknown as File,
    createdAt: 456,
  });
  return currentOfflineDatabase().name;
}
async function raw(name: string, store: string, key: IDBValidKey, value?: unknown) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const q = indexedDB.open(name);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(store, value === undefined ? 'readonly' : 'readwrite'),
        q = value === undefined ? tx.objectStore(store).get(key) : tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve(q.result);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
beforeEach(async () => {
  active = true;
  accepted = true;
  writable = true;
  current = A;
  setAuthed(true);
  vi.stubGlobal('Blob', NativeBlob);
  vi.stubGlobal('File', NativeFile);
  await reopenAnonymous();
  install();
});
afterEach(async () => {
  cleanup();
  active = false;
  release();
  detachOfflineDatabase();
  await reopenAnonymous();
  for (const name of names) await Dexie.delete(name);
  names.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setAuthed(false);
});
describe('D16c durable native source ownership', () => {
  it('keeps exact source aliases distinct despite identical Auth/person/Family/native IDs', async () => {
    const a = await seed(),
      old = captureReadSession();
    current = B;
    await reopenForUser(B.native_user);
    const b = currentOfflineDatabase().name;
    expect(a).not.toBe(b);
    expect(old.current()).toBe(false);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(await offlineDb.importFiles.count()).toBe(0);
    await expect(prepareOriginalWorkExport()).rejects.toThrow('no retained');
    expect(await raw(a, 'mutationQueue', row.id)).toEqual(row);
    current = A;
    await reopenForUser(A.native_user);
    expect(currentOfflineDatabase().name).toBe(a);
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
    expect((await offlineDb.syncMeta.get(SOURCE_PAUSE_KEY))?.sourcePaused).toEqual([row.id]);
    const file = await offlineDb.importFiles.get(['same-job', 'original.pdf']);
    if (!file) throw Error('Original File missing');
    expect(file.createdAt).toBe(456);
    expect((file.blob as File).lastModified).toBe(321);
    expect(Array.from(new Uint8Array(await file.blob.arrayBuffer()))).toEqual([0, 255, 128, 13, 10]);
  });
  it.each(['user_id', 'person_id', 'family_id'] as const)(
    'separates %s changes without changing original identity fields',
    async (field) => {
      const a = await seed();
      current = { ...A, [field]: 'd16c0000-0000-4000-8000-000000000099' };
      await reopenForUser(current.native_user);
      expect(currentOfflineDatabase().name).not.toBe(a);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect(await raw(a, 'mutationQueue', row.id)).toEqual(row);
    }
  );
  it('initializes exactly one canonical immutable owner marker after accepted selection', async () => {
    await reopenForUser(A.native_user);
    const db = currentOfflineDatabase();
    expect(await db.syncMeta.get(SOURCE_OWNER_KEY)).toEqual(sourceOwnerMarker(A));
    await expect(db.syncMeta.put(sourceOwnerMarker(A))).rejects.toThrow();
    await expect(db.syncMeta.delete(0)).rejects.toThrow();
    await expect(db.syncMeta.clear()).rejects.toThrow();
    expect(await db.syncMeta.get(0)).toEqual(sourceOwnerMarker(A));
  });
  it('refuses missing cached databases and rejected initialization without creating an empty replacement', async () => {
    accepted = false;
    const name = await sourceOwnerName(A);
    names.add(name);
    await expect(reopenForUser(A.native_user)).rejects.toThrow('bootstrap');
    await expect(prepareSourceDatabaseRead()).rejects.toThrow('Missing');
    expect(await Dexie.exists(name)).toBe(false);
  });
  it('does not stamp an existing unmarked namespace, and leaves the previous live connection safe', async () => {
    const a = await seed();
    current = B;
    const name = await sourceOwnerName(B);
    names.add(name);
    const unmarked = new Dexie(name);
    unmarked.version(14).stores({ syncMeta: 'tripId', mutationQueue: 'id', importFiles: '[jobId+fileName]' });
    await unmarked.open();
    await unmarked.table('mutationQueue').put(row);
    unmarked.close();
    await expect(reopenForUser(B.native_user)).rejects.toThrow();
    expect(currentOfflineDatabase().name).toBe(a);
    expect(await raw(name, 'syncMeta', 0)).toBeUndefined();
    expect(await raw(name, 'mutationQueue', row.id)).toEqual(row);
  });
  it('refuses a forged owner before reads, original writes, export or queue replay can proceed', async () => {
    const name = await seed();
    await raw(name, 'syncMeta', 0, sourceOwnerMarker(B));
    await expect(offlineDb.mutationQueue.get(row.id)).rejects.toThrow();
    await expect(offlineDb.mutationQueue.delete(row.id)).rejects.toThrow();
    await expect(prepareOriginalWorkExport()).rejects.toThrow();
    await expect(mutationQueue._flushPass()).rejects.toThrow();
    expect(await raw(name, 'mutationQueue', row.id)).toEqual(row);
  });
  it('rolls back a newly created owner when its verified context ends during initialization', async () => {
    const name = await sourceOwnerName(A);
    names.add(name);
    const original = IDBObjectStore.prototype.add;
    const add = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
      this: IDBObjectStore,
      value,
      key
    ) {
      const request = original.call(this, value, key);
      if (this.name === 'syncMeta' && value?.tripId === SOURCE_OWNER_KEY) current = B;
      return request;
    });
    await expect(reopenForUser(A.native_user)).rejects.toThrow();
    add.mockRestore();
    expect(await Dexie.exists(name)).toBe(false);
  });
  it('never relabels, exports or replays existing legacy originals through the source-owned selection', async () => {
    release();
    const name = 'trek-offline-u' + A.native_user;
    names.add(name);
    await reopenForUser(A.native_user);
    await offlineDb.mutationQueue.put(row);
    install();
    const legacy = new TrekOfflineDb(name);
    try {
      await expect(legacy.mutationQueue.count()).rejects.toThrow();
    } finally {
      legacy.close();
    }
    await reopenForUser(A.native_user);
    expect(currentOfflineDatabase().name).not.toBe(name);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(await raw(name, 'mutationQueue', row.id)).toEqual(row);
    expect(await raw(name, 'syncMeta', 0)).toBeUndefined();
  });
  it('aborts a whole write transaction if it attempts to change immutable ownership', async () => {
    await seed();
    const db = currentOfflineDatabase();
    await expect(
      db.transaction('rw', db.mutationQueue, db.syncMeta, async () => {
        await db.mutationQueue.delete(row.id);
        await db.syncMeta.delete(SOURCE_OWNER_KEY);
      })
    ).rejects.toThrow();
    expect(await db.mutationQueue.get(row.id)).toEqual(row);
    expect(await db.syncMeta.get(0)).toEqual(sourceOwnerMarker(A));
  });
  it('uses IndexedDB key ordering to protect ownership from cross-type range deletion', async () => {
    await seed();
    await expect(offlineDb.syncMeta.where('tripId').below('').delete()).rejects.toThrow();
    expect(await offlineDb.syncMeta.get(0)).toEqual(sourceOwnerMarker(A));
    await offlineDb.syncMeta.put({
      tripId: 9,
      lastSyncedAt: null,
      status: 'idle',
      tilesBbox: null,
      filesCachedCount: 0,
    });
    await offlineDb.syncMeta.where('tripId').above(0).delete();
    expect(await offlineDb.syncMeta.get(9)).toBeUndefined();
    expect(await offlineDb.syncMeta.get(0)).toEqual(sourceOwnerMarker(A));
  });
  it('refuses a later write when source retirement occurs inside an already-open transaction', async () => {
    const name = await seed(),
      db = currentOfflineDatabase();
    await expect(
      db.transaction('rw', db.mutationQueue, db.syncMeta, async () => {
        await db.syncMeta.get(0);
        current = B;
        await db.mutationQueue.delete(row.id);
      })
    ).rejects.toThrow();
    expect(await raw(name, 'mutationQueue', row.id)).toEqual(row);
  });
  it('stabilizes a refused owner without render loops or granting read/write callbacks', async () => {
    await seed();
    current = B;
    const operation = vi.fn(),
      effect = vi.fn();
    const { result, rerender } = renderHook(() => {
      const account = useImportAccountScope(),
        stay = useStayActionScope(9);
      const [accountValue, setAccount] = useStayState(account, 'empty');
      const [stayValue, setStay] = useStayState(stay, 'empty');
      return { account, stay, accountValue, stayValue, setAccount, setStay };
    });
    rerender();
    expect(result.current.account().current()).toBe(false);
    expect(result.current.stay().current()).toBe(false);
    await expect(result.current.account().perform(operation)).rejects.toThrow();
    await expect(result.current.stay().perform(operation)).rejects.toThrow();
    result.current.account().effect(effect);
    result.current.stay().effect(effect);
    result.current.setAccount('forbidden');
    result.current.setStay('forbidden');
    expect(result.current.accountValue).toBe('empty');
    expect(result.current.stayValue).toBe('empty');
    expect(operation).not.toHaveBeenCalled();
    expect(effect).not.toHaveBeenCalled();
  });
  it('refuses implicit creation without a verified binding and rolls back the new database', async () => {
    const name = await sourceOwnerName(B);
    names.add(name);
    const db = new TrekOfflineDb(name);
    try {
      await expect(db.mutationQueue.count()).rejects.toThrow();
      expect(await Dexie.exists(name)).toBe(false);
    } finally {
      db.close();
    }
  });
  it('preserves owner, original fields and import-only bytes across logout, then requires explicit recovery', async () => {
    const name = await seed();
    await offlineDb.trips.put({ id: 9 } as never);
    await deleteCurrentUserDb();
    expect(await raw(name, 'mutationQueue', row.id)).toEqual(row);
    expect(await raw(name, 'syncMeta', 0)).toEqual(sourceOwnerMarker(A));
    expect(await raw(name, 'trips', 9)).toBeUndefined();
    await reopenForUser(A.native_user);
    expect((await readQueueStatus(undefined, true)).retained).toBe(2);
    await mutationQueue._flushPass();
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
    await offlineDb.mutationQueue.delete(row.id);
    await deleteCurrentUserDb();
    await reopenForUser(A.native_user);
    expect(await offlineDb.importFiles.count()).toBe(1);
    expect(await offlineDb.syncMeta.get(0)).toEqual(sourceOwnerMarker(A));
    await expect(clearAll()).rejects.toThrow();
  });
  it('releases only an explicitly retried compatible command while leaving other held originals exact', async () => {
    await seed();
    const compatible = { ...row, id: 'supported-operation', schemaVersion: 2, status: 'conflict' as const };
    await offlineDb.mutationQueue.put(compatible);
    await deleteCurrentUserDb();
    await reopenForUser(A.native_user);
    setForcedOffline(true);
    try {
      await mutationQueue.resolveKeepMine(compatible.id);
      const saved = await offlineDb.mutationQueue.get(compatible.id);
      expect(saved?.status).toBe('pending');
      expect(saved?.body).toEqual(compatible.body);
      expect(saved?.attempts).toBe(compatible.attempts);
      expect((await offlineDb.syncMeta.get(SOURCE_PAUSE_KEY))?.sourcePaused).toEqual([row.id]);
      expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
    } finally {
      _resetNetworkMode();
    }
  });
  it('exports owned v3 provenance without rewriting the original graph or implying replay authority', async () => {
    const name = await seed();
    const prepared = await prepareOriginalWorkExport();
    try {
      const outer = JSON.parse(await prepared.blob.text()),
        payload = JSON.parse(outer.payload);
      expect(outer.format).toBe('family.original-work.v3');
      expect(prepared.filename).toBe('family-original-work-v3.json');
      expect(payload.source_owner).toEqual(A);
      expect(payload.database).toBe(name);
      expect(payload.automatic_replay).toBe(false);
      expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
    } finally {
      prepared.dispose();
    }
  });
  it('retires delayed binary export on source replacement without acknowledging originals', async () => {
    const name = await seed();
    let entered!: () => void, finish!: () => void;
    const ready = new Promise<void>((resolve) => (entered = resolve)),
      held = new Promise<void>((resolve) => (finish = resolve)),
      original = NativeBlob.prototype.arrayBuffer;
    const spy = vi.spyOn(NativeBlob.prototype, 'arrayBuffer').mockImplementation(async function (this: NativeBlob) {
      entered();
      await held;
      return original.call(this);
    });
    const pending = prepareOriginalWorkExport();
    const result = expect(pending).rejects.toThrow();
    await ready;
    current = B;
    await reopenForUser(B.native_user);
    finish();
    await result;
    spy.mockRestore();
    expect(await raw(name, 'mutationQueue', row.id)).toEqual(row);
  });
  it('allows cached owner reads but refuses writes or initialization when the fresh bootstrap is absent', async () => {
    await seed();
    detachOfflineDatabase();
    accepted = false;
    await prepareSourceDatabaseRead();
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
    await expect(offlineDb.mutationQueue.delete(row.id)).rejects.toThrow();
  });
  it('refuses future source schemas without silently downgrading or changing unknown stores', async () => {
    const name = await seed();
    detachOfflineDatabase();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const q = indexedDB.open(name, 150);
      q.onupgradeneeded = () => q.result.createObjectStore('future').put({ exact: 'future' }, 'opaque');
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    db.close();
    await expect(reopenForUser(A.native_user)).rejects.toThrow();
    expect(await raw(name, 'future', 'opaque')).toEqual({ exact: 'future' });
    expect(await raw(name, 'mutationQueue', row.id)).toEqual(row);
  });
});
