import Dexie from 'dexie';
import { Blob as NativeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentOfflineDatabase, reopenAnonymous, reopenForUser, TrekOfflineDb } from '../../db/offlineDb';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { installFamilyOfflineDatabaseGuard } from './offlineDatabaseGuard';
import { familyAuthStore } from './repository';
const mode = vi.hoisted(() => ({ qualified: true }));
vi.mock('./offlineTripQualification', () => ({ offlineTripQualificationEnabled: () => mode.qualified }));
const initial = familyAuthStore.getState();
let release: () => void;
let id = 7160100;
const names: string[] = [];
beforeEach(async () => {
  await reopenAnonymous();
  _resetNetworkMode();
  mode.qualified = true;
  familyAuthStore.setState({ isAuthenticated: true, isLoading: false, authCheckFailed: false, authGate: 'ok' });
  release = installFamilyOfflineDatabaseGuard();
});
afterEach(async () => {
  release();
  _resetNetworkMode();
  familyAuthStore.setState(initial, true);
  await reopenAnonymous();
  for (const name of names.splice(0)) await Dexie.delete(name);
});
const next = () => {
  const value = ++id;
  names.push('trek-offline-u' + value);
  return value;
};
describe('qualified Family database creation boundary', () => {
  async function futureFixture() {
    const user = next();
    await reopenForUser(user);
    const original = {
      id: '71600000-0000-4000-8000-000000000099',
      tripId: 9,
      method: 'POST' as const,
      url: '/trips/9/family/future',
      body: { revision: 11, unknown: ['retain', false] },
      createdAt: 1,
      status: 'conflict' as const,
      attempts: 7,
      lastError: 'Future original',
      schemaVersion: 999,
    };
    await currentOfflineDatabase().mutationQueue.put(original);
    await currentOfflineDatabase().importFiles.put({
      jobId: 'future-schema',
      fileName: 'original.pdf',
      blob: new NativeBlob([new Uint8Array([0, 255, 128])]) as unknown as Blob,
      createdAt: 1,
    });
    const name = currentOfflineDatabase().name;
    await reopenAnonymous();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 150);
      request.onupgradeneeded = () =>
        request.result
          .createObjectStore('futureOpaque', { keyPath: 'id' })
          .put({ id: 'opaque', unknown: { revision: 19 }, bytes: new Uint8Array([0, 255, 128]) });
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    const read = async () => {
      const raw = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const get = (store: string, key: IDBValidKey) =>
          new Promise<Record<string, unknown>>((resolve, reject) => {
            const request = raw.transaction(store).objectStore(store).get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        const command = await get('mutationQueue', original.id),
          file = await get('importFiles', ['future-schema', 'original.pdf']),
          opaque = await get('futureOpaque', 'opaque');
        return {
          version: raw.version,
          stores: Array.from(raw.objectStoreNames),
          command,
          opaque,
          file: { ...file, blob: Array.from(new Uint8Array(await (file.blob as Blob).arrayBuffer())) },
        };
      } finally {
        raw.close();
      }
    };
    return { user, name, original, read, before: await read() };
  }
  it('refuses a future native schema on explicit open before changing any original or unknown data', async () => {
    const fixture = await futureFixture();
    await expect(reopenForUser(fixture.user)).rejects.toMatchObject({ name: 'VersionError' });
    expect(currentOfflineDatabase().isOpen()).toBe(false);
    expect(await fixture.read()).toEqual(fixture.before);
    expect(fixture.before.command).toEqual(fixture.original);
    expect(fixture.before.file.blob).toEqual([0, 255, 128]);
  });
  it('also refuses an implicit first read of the newer schema offline', async () => {
    const fixture = await futureFixture(),
      db = new TrekOfflineDb(fixture.name);
    setForcedOffline(true);
    try {
      await expect(db.mutationQueue.count()).rejects.toThrow();
      expect(await fixture.read()).toEqual(fixture.before);
    } finally {
      db.close();
    }
  });
  it('removes its version policy on disposal and preserves ordinary native future-schema behavior', async () => {
    const fixture = await futureFixture();
    release();
    mode.qualified = false;
    release = installFamilyOfflineDatabaseGuard();
    await reopenForUser(fixture.user);
    expect(currentOfflineDatabase().isOpen()).toBe(true);
    expect(await fixture.read()).toEqual(fixture.before);
  });

  it('refuses a missing user database offline and does not leave an empty replacement', async () => {
    const user = next();
    setForcedOffline(true);
    await expect(reopenForUser(user)).rejects.toThrow('missing');
    expect(await Dexie.exists('trek-offline-u' + user)).toBe(false);
    expect(currentOfflineDatabase().isOpen()).toBe(false);
  });
  it('also refuses Dexie implicit creation from a first table read', async () => {
    const user = next(),
      db = new TrekOfflineDb('trek-offline-u' + user);
    setForcedOffline(true);
    try {
      await expect(db.mutationQueue.count()).rejects.toThrow();
      expect(await Dexie.exists(db.name)).toBe(false);
    } finally {
      db.close();
    }
  });
  it.each([
    { isLoading: true },
    { authCheckFailed: true },
    { isAuthenticated: false },
    { authGate: 'mfa_challenge' as const },
  ])('requires current validated access for creation even when network mode is online: %j', async (state) => {
    const user = next();
    familyAuthStore.setState(state);
    await expect(reopenForUser(user)).rejects.toThrow('validate');
    expect(await Dexie.exists('trek-offline-u' + user)).toBe(false);
  });
  it('can retry the same refused namespace after online access is validated', async () => {
    const user = next();
    setForcedOffline(true);
    await expect(reopenForUser(user)).rejects.toThrow('missing');
    setForcedOffline(false);
    await reopenForUser(user);
    expect(await Dexie.exists('trek-offline-u' + user)).toBe(true);
  });
  it('allows a newly validated online account to create its own database', async () => {
    const user = next();
    await reopenForUser(user);
    expect(currentOfflineDatabase().name).toBe('trek-offline-u' + user);
    expect(await Dexie.exists('trek-offline-u' + user)).toBe(true);
  });
  it('opens an existing database offline without changing a future original or binary import', async () => {
    const user = next();
    await reopenForUser(user);
    const db = currentOfflineDatabase(),
      original = {
        id: '71600000-0000-4000-8000-000000000088',
        tripId: 7,
        method: 'POST' as const,
        url: '/trips/7/family/future',
        body: { revision: 9, operation_id: '71600000-0000-4000-8000-000000000088' },
        createdAt: 1,
        status: 'conflict' as const,
        attempts: 4,
        lastError: 'Original conflict',
        schemaVersion: 999,
      };
    await db.mutationQueue.put(original);
    await db.importFiles.put({
      jobId: 'guard-original',
      fileName: 'source.pdf',
      blob: new NativeBlob([new Uint8Array([0, 255, 128])]) as unknown as Blob,
      createdAt: 1,
    });
    await reopenAnonymous();
    setForcedOffline(true);
    familyAuthStore.setState({ authCheckFailed: true, authGate: null });
    await reopenForUser(user);
    expect(await currentOfflineDatabase().mutationQueue.get(original.id)).toEqual(original);
    const file = await currentOfflineDatabase().importFiles.get(['guard-original', 'source.pdf']);
    if (!file) throw new Error('Missing retained binary import');
    expect(Array.from(new Uint8Array(await file.blob.arrayBuffer()))).toEqual([0, 255, 128]);
  });
  it('leaves ordinary native creation unchanged when qualification is disabled', async () => {
    release();
    mode.qualified = false;
    release = installFamilyOfflineDatabaseGuard();
    const user = next();
    setForcedOffline(true);
    await reopenForUser(user);
    expect(await Dexie.exists('trek-offline-u' + user)).toBe(true);
  });
  it('removes its own policy on disposal without changing native database schema', async () => {
    release();
    const user = next();
    setForcedOffline(true);
    await reopenForUser(user);
    expect(currentOfflineDatabase().verno).toBe(14);
  });
});
