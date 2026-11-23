import Dexie from 'dexie';
import { Blob as NativeBlob, File as NativeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAll,
  currentOfflineDatabase,
  deleteCurrentUserDb,
  invalidateOfflineSession,
  offlineDb,
  reopenAnonymous,
  reopenForUser,
  type QueuedMutation,
} from '../../db/offlineDb';
import { notifyPrivateSessionEnd } from '../../db/privateSessionEvents';
import { installFamilyCommandRetention } from '../../db/retainedCommand';
import { setAuthed } from '../../sync/authGate';
import {
  encodeOriginalWork,
  ORIGINAL_WORK_FORMAT,
  ORIGINAL_WORK_MAX_BINARY_BYTES,
} from '../../sync/originalWorkArchive';
import { downloadOriginalWork, prepareOriginalWorkExport } from '../../sync/originalWorkExport';
import { readQueueStatus } from '../../sync/queueStatus';
import { prepareRetainedWorkExport } from '../../sync/retainedRecovery';
const io = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock('../../utils/fileDownload', () => ({ downloadBlob: io.download }));
let prepared: Awaited<ReturnType<typeof prepareOriginalWorkExport>> | undefined;
beforeEach(async () => {
  vi.stubGlobal('Blob', NativeBlob);
  vi.stubGlobal('File', NativeFile);
  await reopenForUser(16001);
  await offlineDb.mutationQueue.clear();
  await offlineDb.importFiles.clear();
  setAuthed(true);
  io.download.mockReset();
});
afterEach(async () => {
  prepared?.dispose();
  prepared = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await reopenAnonymous();
  await Dexie.delete('trek-offline-u16001');
  await Dexie.delete('trek-offline-u16002');
});
function row(id = 'original-operation'): QueuedMutation {
  return {
    id,
    tripId: 13,
    url: '/trips/13/family/future',
    method: 'POST',
    body: { operation_id: id, observation: { revision: 'precise-original-token' }, future: { unknown: ['retain', 4] } },
    schemaVersion: 999,
    createdAt: 1,
    status: 'conflict',
    attempts: 4,
    lastError: 'Original refusal',
    baseUpdatedAt: 'opaque-exact-token',
  };
}
async function seed() {
  await offlineDb.mutationQueue.put(row());
  await offlineDb.mutationQueue.put({
    ...row('dependent'),
    schemaVersion: 1,
    url: '/trips/13/places/-9',
    createdAt: 2,
  });
  await offlineDb.importFiles.put({
    jobId: 'same-job',
    fileName: 'original.pdf',
    createdAt: 1,
    blob: new Blob([new Uint8Array([0, 255, 128, 13, 10])], { type: 'application/pdf' }),
  });
  await offlineDb.importFiles.put({
    jobId: 'same-job',
    fileName: 'next.pdf',
    createdAt: 2,
    blob: new Blob(['second original'], { type: 'application/pdf' }),
  });
}
// Independent format reader: no production decode/restore, queue code or database writes.
async function decode(blob: Blob) {
  const file = JSON.parse(await blob.text());
  expect(file.format).toBe(ORIGINAL_WORK_FORMAT);
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(file.payload))),
    (b) => b.toString(16).padStart(2, '0')
  ).join('');
  expect(file.sha256).toBe(hash);
  const payload = JSON.parse(file.payload),
    graph = payload.graph;
  const objects: unknown[] = [];
  const value = (v: [string, unknown?]): unknown => {
    switch (v[0]) {
      case 'null':
        return null;
      case 'undefined':
        return undefined;
      case 'boolean':
      case 'string':
        return v[1];
      case 'number':
        return typeof v[1] === 'number' ? v[1] : v[1] === '-0' ? -0 : Number(v[1]);
      case 'bigint':
        return BigInt(String(v[1]));
      case 'ref':
        return objects[Number(v[1])];
      default:
        throw Error('Unknown archive value');
    }
  };
  for (const node of graph.nodes) {
    if (node.kind === 'object') objects.push(Object.create(node.prototype === 'null' ? null : Object.prototype));
    else if (node.kind === 'array') objects.push(new Array(node.length));
    else if (node.kind === 'date') objects.push(new Date(Number(value(node.milliseconds))));
    else if (['blob', 'file', 'array-buffer'].includes(node.kind)) {
      const bytes = Uint8Array.from(atob(node.bytes), (c) => c.charCodeAt(0));
      expect(bytes.length).toBe(node.size);
      const checksum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
        b.toString(16).padStart(2, '0')
      ).join('');
      expect(checksum).toBe(node.sha256);
      objects.push(
        node.kind === 'array-buffer'
          ? bytes.buffer
          : node.kind === 'file'
            ? new File([bytes], node.name, { type: node.type, lastModified: node.lastModified })
            : new Blob([bytes], { type: node.type })
      );
    } else throw Error('Unknown archive node');
  }
  graph.nodes.forEach((node: { entries?: Array<[string, [string, unknown?]]> }, i: number) => {
    for (const [key, encoded] of node.entries ?? [])
      Object.defineProperty(objects[i], key, {
        value: value(encoded),
        enumerable: true,
        configurable: true,
        writable: true,
      });
  });
  return {
    payload,
    data: value(graph.root) as {
      queue: Array<{ key: string; row: QueuedMutation }>;
      imports: Array<{ key: [string, string]; row: { blob: Blob; [k: string]: unknown } }>;
    },
  };
}
describe('atomic account-owned original-work archive', () => {
  it.each(['anonymous', 'signed-out'] as const)(
    'refuses initial %s export without opening another account database',
    async (kind) => {
      if (kind === 'anonymous') await reopenAnonymous();
      else setAuthed(false);
      await expect(downloadOriginalWork()).rejects.toThrow('Open the original account');
      expect(io.download).not.toHaveBeenCalled();
    }
  );

  it('round-trips unknown commands, every dependency and two compound-key binary sources without modifying originals', async () => {
    await seed();
    const queue = await offlineDb.mutationQueue.toArray();
    prepared = await prepareOriginalWorkExport();
    const { payload, data } = await decode(prepared.blob);
    expect(payload.automatic_replay).toBe(false);
    expect(data.queue.map((v) => v.row)).toEqual(queue);
    expect(data.queue.map((v) => v.key)).toEqual(['dependent', 'original-operation']);
    expect(data.imports.map((v) => v.key)).toEqual([
      ['same-job', 'next.pdf'],
      ['same-job', 'original.pdf'],
    ]);
    expect(Array.from(new Uint8Array(await data.imports[1].row.blob.arrayBuffer()))).toEqual([0, 255, 128, 13, 10]);
    expect(await data.imports[0].row.blob.text()).toBe('second original');
    expect(data.imports[1].row.blob.type).toBe('application/pdf');
    expect(await offlineDb.mutationQueue.toArray()).toEqual(queue);
    expect(await offlineDb.importFiles.count()).toBe(2);
    expect(io.download).not.toHaveBeenCalled();
  });
  it('preserves graph identity, cycles, undefined, holes, dates, BigInt, negative zero, File metadata and ArrayBuffer bytes', async () => {
    const body: Record<string, unknown> = {
      missing: undefined,
      sparse: Object.assign(new Array(3), { 1: undefined, 2: null }),
      big: BigInt('12345678901234567890'),
      negativeZero: -0,
      nan: Number.NaN,
      date: new Date('2026-11-10T12:00:00Z'),
      buffer: new Uint8Array([1, 2, 255]).buffer,
      file: new File(['exact file'], 'original.txt', { type: 'text/plain', lastModified: 123 }),
    };
    body.self = body;
    body.alias = body.sparse;
    await offlineDb.mutationQueue.put({ ...row(), body });
    prepared = await prepareOriginalWorkExport();
    const result = (await decode(prepared.blob)).data.queue[0].row.body as typeof body;
    expect(result.self).toBe(result);
    expect(result.alias).toBe(result.sparse);
    expect(0 in (result.sparse as unknown[])).toBe(false);
    expect(result.missing).toBeUndefined();
    expect(result.big).toBe(body.big);
    expect(Object.is(result.negativeZero, -0)).toBe(true);
    expect(Number.isNaN(result.nan)).toBe(true);
    expect(result.date).toEqual(body.date);
    expect(Array.from(new Uint8Array(result.buffer as ArrayBuffer))).toEqual([1, 2, 255]);
    const file = result.file as File;
    expect([file.name, file.lastModified, file.type, await file.text()]).toEqual([
      'original.txt',
      123,
      'text/plain',
      'exact file',
    ]);
  });
  it('can preserve orphaned imported originals even without a remaining queue row', async () => {
    await offlineDb.importFiles.put({ jobId: 'orphan', fileName: 'keep.bin', blob: new Blob(['keep']), createdAt: 1 });
    prepared = await prepareOriginalWorkExport();
    expect((await decode(prepared.blob)).data.imports).toHaveLength(1);
    expect(await offlineDb.importFiles.count()).toBe(1);
  });
  it.each(['epoch', 'private-context', 'account', 'closed', 'auth'] as const)(
    'refuses a prepared download after %s replacement',
    async (kind) => {
      await seed();
      prepared = await prepareOriginalWorkExport();
      if (kind === 'epoch') invalidateOfflineSession();
      else if (kind === 'private-context') notifyPrivateSessionEnd();
      else if (kind === 'account') {
        await reopenForUser(16002);
        await reopenForUser(16001);
      } else if (kind === 'closed') {
        currentOfflineDatabase().close();
        await currentOfflineDatabase().open();
      } else {
        setAuthed(false);
        setAuthed(true);
        invalidateOfflineSession();
      }
      expect(prepared.assertCurrent).toThrow('context changed');
      expect(await offlineDb.mutationQueue.count()).toBe(2);
      expect(io.download).not.toHaveBeenCalled();
    }
  );
  it('does not open or downgrade an unsupported future native schema to obtain an export', async () => {
    await seed();
    const current = currentOfflineDatabase(),
      name = current.name;
    current.close();
    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 150);
      request.onupgradeneeded = () =>
        request.result
          .createObjectStore('unknownOriginals', { keyPath: 'id' })
          .put({ id: 'opaque', future: true, blob: new Blob(['future original']) });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await expect(downloadOriginalWork()).rejects.toThrow('Open the original account');
      expect(raw.version).toBe(150);
      const read = <T>(store: string, key: IDBValidKey) =>
        new Promise<T>((resolve, reject) => {
          const request = raw.transaction(store).objectStore(store).get(key);
          request.onsuccess = () => resolve(request.result as T);
          request.onerror = () => reject(request.error);
        });
      expect(await read('mutationQueue', 'original-operation')).toEqual(row());
      const source = await read<{ blob: Blob }>('importFiles', ['same-job', 'original.pdf']);
      expect(Array.from(new Uint8Array(await source.blob.arrayBuffer()))).toEqual([0, 255, 128, 13, 10]);
      const opaque = await read<{ blob: Blob; future: boolean }>('unknownOriginals', 'opaque');
      expect(opaque.future).toBe(true);
      expect(await opaque.blob.text()).toBe('future original');
      expect(io.download).not.toHaveBeenCalled();
    } finally {
      raw.close();
    }
  });
  it('keeps import-only Family originals through Clear cache and actual logout, and exposes their qualified availability', async () => {
    const release = installFamilyCommandRetention();
    try {
      await offlineDb.importFiles.put({
        jobId: 'orphan',
        fileName: 'keep.bin',
        blob: new Blob(['only original']),
        createdAt: 1,
      });
      expect((await readQueueStatus()).retained).toBe(0);
      expect((await readQueueStatus(undefined, true)).retained).toBe(1);
      await expect(clearAll()).rejects.toThrow('imported sources');
      expect(await offlineDb.importFiles.count()).toBe(1);
      await deleteCurrentUserDb();
      await reopenForUser(16001);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect(await (await offlineDb.importFiles.get(['orphan', 'keep.bin']))?.blob.text()).toBe('only original');
      prepared = await prepareOriginalWorkExport();
      expect((await decode(prepared.blob)).data.imports).toHaveLength(1);
    } finally {
      release();
    }
  });
  it('keeps ordinary native cache cleanup unchanged without a Family retention policy', async () => {
    await offlineDb.importFiles.put({
      jobId: 'ordinary',
      fileName: 'cache.bin',
      blob: new Blob(['disposable']),
      createdAt: 1,
    });
    await clearAll();
    expect(await offlineDb.importFiles.count()).toBe(0);
    await offlineDb.importFiles.put({
      jobId: 'ordinary',
      fileName: 'cache.bin',
      blob: new Blob(['disposable']),
      createdAt: 1,
    });
    await deleteCurrentUserDb();
    await reopenForUser(16001);
    expect(await offlineDb.importFiles.count()).toBe(0);
  });
  it('refuses a source/owner change while binary bytes are being read', async () => {
    await seed();
    const read = Blob.prototype.arrayBuffer;
    vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(async function (this: Blob) {
      notifyPrivateSessionEnd();
      return read.call(this);
    });
    await expect(downloadOriginalWork()).rejects.toThrow('context changed');
    expect(io.download).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(2);
    expect(await offlineDb.importFiles.count()).toBe(2);
  });
  it.each([
    { password: 'private' },
    { url: 'https://example.invalid/file?token=private' },
    { future: { access_token: 'private' } },
  ])('refuses credential-shaped metadata without redaction or source removal', async (body) => {
    await offlineDb.mutationQueue.put({ ...row(), body });
    await expect(downloadOriginalWork()).rejects.toThrow('credentials');
    expect(await offlineDb.mutationQueue.get('original-operation')).toMatchObject({ body });
    expect(io.download).not.toHaveBeenCalled();
  });
  it('refuses recognized credentials inside binary sources', async () => {
    await seed();
    await offlineDb.importFiles.put({
      jobId: 'secret',
      fileName: 'secret.txt',
      blob: new Blob(['eyJabc.abc.abc']),
      createdAt: 1,
    });
    await expect(downloadOriginalWork()).rejects.toThrow('credentials');
    expect(await offlineDb.importFiles.count()).toBe(3);
    expect(io.download).not.toHaveBeenCalled();
  });
  it('refuses unsupported prototypes and symbol data rather than dropping it', async () => {
    await expect(encodeOriginalWork(new Map([['unknown', 1]]), () => {})).rejects.toThrow();
    await expect(encodeOriginalWork({ [Symbol('unknown')]: 1 }, () => {})).rejects.toThrow();
    await expect(
      encodeOriginalWork(
        Object.defineProperty({}, 'value', {
          get() {
            throw Error('must not invoke');
          },
          enumerable: true,
        }),
        () => {}
      )
    ).rejects.toThrow('credentials');
  });
  it('refuses oversized binary/row snapshots without truncation or a partial download', async () => {
    await seed();
    await offlineDb.importFiles.put({
      jobId: 'large',
      fileName: 'large.bin',
      blob: new Blob([new Uint8Array(ORIGINAL_WORK_MAX_BINARY_BYTES + 1)]),
      createdAt: 1,
    });
    await expect(downloadOriginalWork()).rejects.toThrow('bound');
    expect(await offlineDb.importFiles.count()).toBe(3);
    await offlineDb.importFiles.clear();
    await offlineDb.mutationQueue.bulkPut(Array.from({ length: 5001 }, (_, i) => row('row-' + i)));
    await expect(downloadOriginalWork()).rejects.toThrow('row bound');
    expect(await offlineDb.mutationQueue.count()).toBe(5003);
    expect(io.download).not.toHaveBeenCalled();
  });
  it('failed browser download retains every queue row and source byte', async () => {
    await seed();
    io.download.mockImplementationOnce(() => {
      throw Error('Download unavailable');
    });
    await expect(downloadOriginalWork()).rejects.toThrow('Download unavailable');
    expect(await offlineDb.mutationQueue.count()).toBe(2);
    expect(await offlineDb.importFiles.count()).toBe(2);
  });
  it('v1 also refuses a same-database authentication epoch replacement without changing its format', async () => {
    await offlineDb.mutationQueue.put(row());
    const legacy = await prepareRetainedWorkExport();
    expect(JSON.parse(await legacy.blob.text()).format).toBe('family.retained-work.v1');
    invalidateOfflineSession();
    expect(legacy.assertCurrent).toThrow('account changed');
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });
});
