import Dexie from 'dexie';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import * as native from '../../../src/db/offlineDb';
import * as legacy from '../../../src/integrations/family/legacy/db/offlineDb';

const trip = { id: 17, title: 'Retained trip' };
const queue = ['pending', 'syncing', 'conflict', 'failed'].map((status, index) => ({
  id: 'fixture-' + index,
  tripId: trip.id,
  status,
  createdAt: index + 1,
  body: { title: 'Original edit ' + index },
}));
const cases = [
  { label: 'native', port: native, version: 14, prefix: 704800 },
  { label: 'legacy', port: legacy, version: 4, prefix: 704900 },
];
const openNames = new Set<string>();

// fake-indexeddb clones in Node. Set the Blob realm before Dexie records its built-in types.
await vi.hoisted(async () => {
  vi.resetModules();
  const { Blob } = await import('node:buffer');
  vi.stubGlobal('Blob', Blob);
});
afterAll(() => vi.unstubAllGlobals());

async function seed(id: number, from: 2 | 4) {
  const name = 'trek-offline-u' + id;
  openNames.add(name);
  const db = new Dexie(name);
  db.version(1).stores({
    trips: 'id',
    days: 'id, trip_id',
    places: 'id, trip_id',
    packingItems: 'id, trip_id',
    todoItems: 'id, trip_id',
    budgetItems: 'id, trip_id',
    reservations: 'id, trip_id',
    tripFiles: 'id, trip_id',
    mutationQueue: 'id, tripId, status, createdAt',
    syncMeta: 'tripId',
    blobCache: 'url, cachedAt',
  });
  db.version(2).stores({
    accommodations: 'id, trip_id',
    tripMembers: '[tripId+id], tripId',
    tags: 'id',
    categories: 'id',
  });
  if (from === 4) {
    db.version(3).stores({ blobCache: 'url, cachedAt, tripId' });
    db.version(4).stores({ importFiles: '[jobId+fileName], jobId, createdAt' });
  }
  try {
    await db.table('trips').put(trip);
    await db.table('mutationQueue').bulkPut(queue);
    const old = { url: '/fixture/old.pdf', blob: new Blob(['abc']), mime: 'application/pdf', cachedAt: 1 };
    await db.table('blobCache').put(from === 2 ? old : { ...old, tripId: trip.id, bytes: 3 });
    if (from === 4) {
      await db.table('importFiles').put({
        jobId: 'fixture-job',
        fileName: 'fixture.pdf',
        blob: new Blob(['import']),
        createdAt: 8,
      });
    }
  } finally {
    db.close();
  }
}

afterEach(async () => {
  await native.reopenAnonymous();
  await legacy.reopenAnonymous();
  for (const name of openNames) await Dexie.delete(name);
  openNames.clear();
});

describe.each(cases)('$label blob-cache and device compatibility', ({ port, version, prefix }) => {
  it('keeps the proxy stable and forwards each new access to the current account', async () => {
    const first = prefix + 21;
    const second = prefix + 22;
    const marker = Symbol('database instance');
    openNames.add('trek-offline-u' + first);
    openNames.add('trek-offline-u' + second);

    await port.reopenForUser(first);
    const proxy = port.offlineDb;
    const firstIsOpen = proxy.isOpen;
    expect(firstIsOpen()).toBe(true);
    expect(Reflect.set(proxy, marker, first)).toBe(true);
    expect(Reflect.get(proxy, marker)).toBe(first);
    await proxy.syncMeta.put({ tripId: 1, lastSyncedAt: 23, status: 'idle', tilesBbox: null, filesCachedCount: 0 });

    await port.reopenForUser(second);
    expect(port.offlineDb).toBe(proxy);
    expect(firstIsOpen()).toBe(false);
    expect(proxy.isOpen()).toBe(true);
    expect(Reflect.get(proxy, marker)).toBeUndefined();
    expect(await proxy.syncMeta.get(1)).toBeUndefined();
    await proxy.syncMeta.put({ tripId: 1, lastSyncedAt: 45, status: 'idle', tilesBbox: null, filesCachedCount: 0 });

    await port.reopenForUser(first);
    expect((await proxy.syncMeta.get(1))?.lastSyncedAt).toBe(23);
  });

  it.each([2, 4] as const)('preserves original rows when opening a v%i device database', async (from) => {
    const id = prefix + from;
    await seed(id, from);
    await port.reopenForUser(id);

    expect(port.offlineDb.name).toBe('trek-offline-u' + id);
    expect(port.offlineDb.verno).toBe(version);
    expect(await port.offlineDb.trips.get(trip.id)).toEqual(trip);
    expect(await port.offlineDb.mutationQueue.toArray()).toEqual(queue);
    const old = await port.offlineDb.blobCache.get('/fixture/old.pdf');
    expect(old).toMatchObject({
      url: '/fixture/old.pdf',
      mime: 'application/pdf',
      tripId: from === 2 ? -1 : trip.id,
      bytes: 3,
      cachedAt: 1,
    });
    expect(await old?.blob.text()).toBe('abc');
    const imported = await port.offlineDb.importFiles.get(['fixture-job', 'fixture.pdf']);
    if (from === 4) {
      expect(await imported?.blob.text()).toBe('import');
    } else {
      expect(imported).toBeUndefined();
    }

    await port.offlineDb.blobCache.bulkPut([
      {
        url: '/fixture/recent-b.pdf',
        tripId: 18,
        blob: new Blob(['BB']),
        bytes: 2,
        mime: 'application/pdf',
        cachedAt: 2,
      },
      {
        url: '/fixture/recent-c.pdf',
        tripId: 18,
        blob: new Blob(['CC']),
        bytes: 2,
        mime: 'application/pdf',
        cachedAt: 2,
      },
    ]);
    await port.enforceBlobBudget(3, 4);
    expect(await port.offlineDb.blobCache.orderBy('cachedAt').primaryKeys()).toEqual([
      '/fixture/recent-b.pdf',
      '/fixture/recent-c.pdf',
    ]);
    await port.enforceBlobBudget(1, 4);
    expect(await port.offlineDb.blobCache.orderBy('cachedAt').primaryKeys()).toEqual(['/fixture/recent-c.pdf']);
    expect(await port.offlineDb.trips.get(trip.id)).toEqual(trip);
    expect(await port.offlineDb.mutationQueue.toArray()).toEqual(queue);
  });

  it('leaves the other account cache intact when enforcing the active account budget', async () => {
    await seed(prefix + 20, 4);
    await seed(prefix + 21, 4);
    await port.reopenForUser(prefix + 20);
    await port.enforceBlobBudget(0, 0);
    expect(await port.offlineDb.blobCache.count()).toBe(0);
    await port.reopenForUser(prefix + 21);
    expect(await port.offlineDb.blobCache.count()).toBe(1);
    expect(await port.offlineDb.mutationQueue.toArray()).toEqual(queue);
  });
});
