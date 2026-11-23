import { IDBFactory } from 'fake-indexeddb';
import { Blob as NativeBlob, File as NativeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readUnattributedWorkArchive } from '../../tests/browser/family-offline-lifecycle/unattributed-work-reader.mjs';
import { beginUnattributedRecovery } from './unattributedWorkExport';
const name = 'trek-offline-u161604';
let factory: IDBFactory;
const command = {
  id: 'unattributed-original',
  schemaVersion: 999,
  status: 'future',
  attempts: 7,
  body: { revision: 'original', unknown: [undefined, false, -0] },
  createdAt: 123,
};
function request<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
async function fixture(
  options: {
    version?: number;
    marker?: unknown;
    importsOnly?: boolean;
    empty?: boolean;
    key?: string;
    missing?: boolean;
    auto?: boolean;
  } = {}
) {
  const open = factory.open(name, options.version ?? 140);
  open.onupgradeneeded = () => {
    const db = open.result;
    db.createObjectStore('mutationQueue', { keyPath: options.key ?? 'id', autoIncrement: options.auto ?? false });
    if (!options.missing) db.createObjectStore('importFiles', { keyPath: ['jobId', 'fileName'] });
    db.createObjectStore('syncMeta', { keyPath: 'tripId' });
    db.createObjectStore('unknownCache', { keyPath: 'key' });
  };
  const db = await request(open),
    tx = db.transaction(Array.from(db.objectStoreNames), 'readwrite'),
    completed = done(tx);
  if (!options.empty) {
    if (!options.importsOnly)
      tx.objectStore('mutationQueue').put({ ...command, ...(options.key ? { [options.key]: command.id } : {}) });
    if (!options.missing)
      tx.objectStore('importFiles').put({
        jobId: 'same-job',
        fileName: 'original.pdf',
        blob: new NativeFile([new Uint8Array([0, 255, 128, 13, 10])], 'original.pdf', {
          type: 'application/pdf',
          lastModified: 321,
        }),
        createdAt: 456,
      });
  }
  tx.objectStore('unknownCache').put({ key: 'keep', value: [1, undefined, false] });
  if (options.marker !== undefined) tx.objectStore('syncMeta').put({ tripId: 0, unknownOwner: options.marker });
  await completed;
  db.close();
}
async function snapshot() {
  const db = await request(factory.open(name));
  const tx = db.transaction(Array.from(db.objectStoreNames), 'readonly'),
    completed = done(tx);
  const values = await Promise.all(
    Array.from(db.objectStoreNames).map(async (store) => ({
      name: store,
      rows: await request(tx.objectStore(store).getAll()),
      keys: await request(tx.objectStore(store).getAllKeys()),
    }))
  );
  await completed;
  db.close();
  for (const store of values)
    for (const row of store.rows)
      if (row.blob)
        row.blob = {
          bytes: Array.from(new Uint8Array(await row.blob.arrayBuffer())),
          name: row.blob.name,
          type: row.blob.type,
          lastModified: row.blob.lastModified,
        };
  return values;
}
function begin(consented = true) {
  return beginUnattributedRecovery({ consented, origin: 'http://127.0.0.1:5900', factory });
}
beforeEach(() => {
  factory = new IDBFactory();
  vi.stubGlobal('Blob', NativeBlob);
  vi.stubGlobal('File', NativeFile);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('explicit unattributed device recovery', () => {
  it('requires device consent, enumerates only on explicit discovery and never opens guessed names', async () => {
    const list = vi.spyOn(factory, 'databases'),
      open = vi.spyOn(factory, 'open');
    expect(() => begin(false)).toThrow();
    expect(list).not.toHaveBeenCalled();
    const session = begin();
    expect(list).not.toHaveBeenCalled();
    await expect(session.prepare(name)).rejects.toThrow();
    expect(open).not.toHaveBeenCalled();
    expect(await session.discover()).toEqual([]);
    expect(list).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
  });
  it('preserves exact unknown commands, compound keys, metadata and bytes without attribution or mutation', async () => {
    await fixture();
    const before = await snapshot(),
      session = begin();
    expect(await session.discover()).toEqual([name]);
    const result = await session.prepare(name),
      decoded = readUnattributedWorkArchive(Buffer.from(await result.blob.arrayBuffer()));
    expect(decoded.data.queue).toEqual([{ key: command.id, row: command }]);
    expect(decoded.data.imports[0].key).toEqual(['same-job', 'original.pdf']);
    const file = decoded.data.imports[0].row.blob;
    expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual([0, 255, 128, 13, 10]);
    expect([file.name, file.type, file.lastModified]).toEqual(['original.pdf', 'application/pdf', 321]);
    expect(decoded.payload.attribution).toEqual({ kind: 'unattributed' });
    expect(decoded.payload).not.toHaveProperty('source_owner');
    expect(decoded.payload.excluded_stores).toEqual(['syncMeta', 'unknownCache']);
    expect(await snapshot()).toEqual(before);
    session.cancel();
    expect(() => result.assertCurrent()).toThrow();
  });
  it('uses only readonly transactions and leaves current owned databases alone', async () => {
    await fixture();
    const owned = 'trek-offline-f1-' + 'a'.repeat(64) + '-u161604',
      open = factory.open(owned, 140);
    open.onupgradeneeded = () => open.result.createObjectStore('private');
    const db = await request(open);
    db.close();
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction');
    const session = begin();
    expect(await session.discover()).toEqual([name]);
    await session.prepare(name);
    expect(spy.mock.calls.every((v) => v[1] === 'readonly')).toBe(true);
    spy.mockRestore();
    await expect(session.prepare(owned)).rejects.toThrow();
  });
  it('exports import-only originals without a queue command', async () => {
    await fixture({ importsOnly: true });
    const session = begin();
    await session.discover();
    const result = await session.prepare(name);
    expect(result.summary).toMatchObject({ queue: 0, imports: 1 });
  });
  it.each([130, 150])('refuses schema %s without upgrading, interpreting or clearing it', async (version) => {
    await fixture({ version });
    const before = await snapshot(),
      session = begin();
    await session.discover();
    await expect(session.prepare(name)).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    const db = await request(factory.open(name));
    expect(db.version).toBe(version);
    db.close();
  });
  it.each([{ marker: {} }, { marker: 'future' }, { missing: true }, { key: 'other' }, { auto: true }, { empty: true }])(
    'refuses incompatible/owned/empty originals and preserves all stores: %j',
    async (options) => {
      await fixture(options);
      const before = await snapshot(),
        session = begin();
      await session.discover();
      await expect(session.prepare(name)).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
    }
  );
  it('aborts a deleted-name creation race so the missing database stays absent', async () => {
    await fixture();
    const session = begin();
    await session.discover();
    await request(factory.deleteDatabase(name));
    await expect(session.prepare(name)).rejects.toThrow();
    expect(await factory.databases()).toEqual([]);
  });
  it('refuses unavailable discovery instead of probing names', async () => {
    Object.defineProperty(factory, 'databases', { value: undefined });
    const session = begin(),
      open = vi.spyOn(factory, 'open');
    await expect(session.discover()).rejects.toThrow();
    expect(open).not.toHaveBeenCalled();
  });
  it('refuses an excessive candidate list before opening any database', async () => {
    vi.spyOn(factory, 'databases').mockResolvedValue(
      Array.from({ length: 101 }, (_, i) => ({ name: 'trek-offline-u' + (i + 1), version: 140 }))
    );
    const session = begin(),
      open = vi.spyOn(factory, 'open');
    await expect(session.discover()).rejects.toThrow();
    expect(open).not.toHaveBeenCalled();
  });
  it('refuses a row-count overflow before reading original bodies', async () => {
    await fixture();
    const db = await request(factory.open(name)),
      tx = db.transaction('mutationQueue', 'readwrite'),
      end = done(tx);
    for (let i = 0; i < 5000; i++) tx.objectStore('mutationQueue').put({ ...command, id: 'extra-' + i });
    await end;
    db.close();
    const session = begin();
    await session.discover();
    await expect(session.prepare(name)).rejects.toThrow();
  });
  it.each(['text', 'binary'])(
    'refuses known credential signatures in %s without silently redacting originals',
    async (kind) => {
      await fixture();
      const db = await request(factory.open(name)),
        tx = db.transaction(['mutationQueue', 'importFiles'], 'readwrite'),
        end = done(tx);
      if (kind === 'text')
        tx.objectStore('mutationQueue').put({ ...command, body: { password: 'synthetic confidential value' } });
      else
        tx.objectStore('importFiles').put({
          jobId: 'secret',
          fileName: 'original',
          blob: new NativeBlob(['sb_' + 'secret_synthetic_signature']),
        });
      await end;
      db.close();
      const before = await snapshot(),
        session = begin();
      await session.discover();
      await expect(session.prepare(name)).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
    }
  );
  it('rejects binary overflow without modifying the original import', async () => {
    await fixture();
    const db = await request(factory.open(name)),
      tx = db.transaction('importFiles', 'readwrite'),
      end = done(tx);
    tx.objectStore('importFiles').put({
      jobId: 'large',
      fileName: 'original',
      blob: new NativeBlob([new Uint8Array(16 * 1024 * 1024 + 1)]),
    });
    await end;
    db.close();
    const session = begin();
    await session.discover();
    await expect(session.prepare(name)).rejects.toThrow();
  });
  it('rejects a delayed byte read after explicit cancellation and retains the originals', async () => {
    await fixture();
    const before = await snapshot(),
      session = begin();
    await session.discover();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
        release = resolve;
      }),
      original = NativeBlob.prototype.arrayBuffer;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const spy = vi.spyOn(NativeBlob.prototype, 'arrayBuffer').mockImplementation(async function (this: NativeBlob) {
      entered();
      await held;
      return original.call(this);
    });
    const pending = session.prepare(name);
    await started;
    session.cancel();
    release();
    await expect(pending).rejects.toThrow();
    spy.mockRestore();
    expect(await snapshot()).toEqual(before);
  });
  it('refuses an actual capture request failure without changing any original store', async () => {
    await fixture();
    const before = await snapshot(),
      session = begin();
    await session.discover();
    const spy = vi.spyOn(IDBObjectStore.prototype, 'count').mockImplementation(() => {
      throw new DOMException('Synthetic read fault', 'QuotaExceededError');
    });
    await expect(session.prepare(name)).rejects.toThrow();
    spy.mockRestore();
    expect(await snapshot()).toEqual(before);
  });
  it('captures one consistent readonly generation while another tab queues a replacement', async () => {
    await fixture();
    const writer = await request(factory.open(name)),
      session = begin();
    await session.discover();
    const original = IDBObjectStore.prototype.openCursor;
    let writing: Promise<void> | undefined;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'openCursor').mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      if (writing === undefined && this.name === 'mutationQueue') {
        const tx = writer.transaction(['mutationQueue', 'importFiles'], 'readwrite');
        writing = done(tx);
        tx.objectStore('mutationQueue').clear();
        tx.objectStore('importFiles').clear();
        tx.objectStore('mutationQueue').put({ ...command, id: 'later-command' });
      }
      return Reflect.apply(original, this, args);
    });
    const result = await session.prepare(name);
    spy.mockRestore();
    await writing;
    writer.close();
    const decoded = readUnattributedWorkArchive(Buffer.from(await result.blob.arrayBuffer()));
    expect(decoded.data.queue).toEqual([{ key: command.id, row: command }]);
    expect(decoded.data.imports).toHaveLength(1);
    const later = await snapshot();
    expect(later.find((store) => store.name === 'importFiles')?.rows).toEqual([]);
  });
  it('isolates cancellation of an overlapping inspection from the replacement capture', async () => {
    await fixture();
    const before = await snapshot(),
      session = begin();
    await session.discover();
    const old = session.prepare(name).then(
      () => 'unexpected success',
      () => 'refused'
    );
    const replacement = session.prepare(name);
    expect(await old).toBe('refused');
    const result = await replacement;
    result.assertCurrent();
    expect(result.summary).toMatchObject({ queue: 1, imports: 1 });
    expect(await snapshot()).toEqual(before);
  });
  it('invalidates previous ready results on a new inspection and on consent cancellation', async () => {
    await fixture();
    const session = begin();
    await session.discover();
    const old = await session.prepare(name);
    await session.prepare(name);
    expect(() => old.assertCurrent()).toThrow();
    session.cancel();
    await expect(session.discover()).rejects.toThrow();
  });
});
