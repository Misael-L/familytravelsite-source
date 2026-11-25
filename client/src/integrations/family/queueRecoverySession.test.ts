import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlace } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import api from '../../api/client';
import {
  clearAll,
  currentOfflineDatabase,
  deleteCurrentUserDb,
  deleteImportFiles,
  invalidateOfflineSession,
  MUTATION_SCHEMA_VERSION,
  offlineDb,
  reopenAnonymous,
  reopenForUser,
  type QueuedMutation,
} from '../../db/offlineDb';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode } from '../../sync/networkMode';
import { _resetOfflinePrefs } from '../../sync/offlinePrefs';
import { prepareRetainedWorkExport } from '../../sync/retainedRecovery';
import * as runtime from './runtime';

const A = 88001,
  B = 88002;
const command = '/trips/1/family/planner-editor-command';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function row(over: Partial<QueuedMutation> = {}) {
  const item: QueuedMutation = {
    id: crypto.randomUUID(),
    tripId: 1,
    method: 'PUT',
    url: '/trips/1/places/42',
    resource: 'places',
    entityId: 42,
    body: { name: 'Original private edit', future: { keep: [1, null, 'x'] } },
    baseUpdatedAt: 'Original base',
    createdAt: 1,
    status: 'pending',
    attempts: 4,
    lastError: 'Original error',
    schemaVersion: MUTATION_SCHEMA_VERSION + 1,
    ...over,
  };
  await offlineDb.mutationQueue.put(item);
  return item;
}
beforeEach(async () => {
  vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(false);
  await reopenAnonymous();
  await reopenForUser(A);
  await resetOfflineTestDatabase();
  mutationQueue._resetFlushing();
  _resetNetworkMode();
  _resetOfflinePrefs();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});
afterEach(async () => {
  setAuthed(false);
  vi.restoreAllMocks();
  await reopenAnonymous();
  await Dexie.delete(`trek-offline-u${A}`);
  await Dexie.delete(`trek-offline-u${B}`);
});
function requestSpy() {
  return vi.spyOn(api, 'request').mockResolvedValue({ data: { ok: true } } as never);
}

describe('unknown queue formats remain original data', () => {
  it('does not reclaim a newer-format syncing row, even after its lease looks abandoned', async () => {
    const item = await row({ status: 'syncing', syncingSince: 1 }),
      send = requestSpy();
    await mutationQueue.flush();
    expect(send).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.get(item.id)).toEqual(item);
  });
  it.each([0, -1, 1.5, Number.NaN])('does not dispatch or rewrite malformed format %s', async (schemaVersion) => {
    const item = await row({ schemaVersion }),
      send = requestSpy();
    await mutationQueue.flush();
    expect(send).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.get(item.id)).toEqual(item);
  });
  it('Try again does not reset newer failed work', async () => {
    const item = await row({ status: 'failed', retryAfter: 12345 }),
      send = requestSpy();
    await mutationQueue.retryFailed();
    expect(send).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.get(item.id)).toEqual(item);
  });
  it.each(['resolveKeepMine', 'resolveKeepServer'] as const)(
    '%s refuses an unknown conflict without changing it',
    async (operation) => {
      const item = await row({ status: 'conflict', conflictServer: { id: 42, name: 'Future server image' } }),
        send = requestSpy();
      await expect(mutationQueue[operation](item.id)).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
      expect(await offlineDb.mutationQueue.get(item.id)).toEqual(item);
      expect(await offlineDb.places.count()).toBe(0);
    }
  );
  it('Discard refuses a mixed batch atomically while newer failed work exists', async () => {
    const future = await row({ status: 'failed' }),
      native = await row({ status: 'failed', schemaVersion: 1, createdAt: 2 });
    await expect(mutationQueue.discardFailed()).rejects.toThrow();
    expect(await offlineDb.mutationQueue.get(future.id)).toEqual(future);
    expect(await offlineDb.mutationQueue.get(native.id)).toEqual(native);
  });
  it('Clear cache refuses instead of erasing newer work', async () => {
    const item = await row();
    await expect(clearAll()).rejects.toThrow();
    expect(await offlineDb.mutationQueue.get(item.id)).toEqual(item);
  });
  it.each(['pending', 'syncing', 'failed', 'conflict'] as const)(
    'logout/reopen keeps newer %s bytes, status and format intact in the original account',
    async (status) => {
      const item = await row({ status });
      await deleteCurrentUserDb();
      await reopenForUser(B);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      await reopenForUser(A);
      expect(await offlineDb.mutationQueue.get(item.id)).toEqual(item);
    }
  );
  it('a known create cannot remap a future payload or its temporary reference', async () => {
    const item = await row({
      status: 'failed',
      createdAt: 2,
      tripId: 2,
      tempEntityId: -9,
      url: '/trips/2/places/{id}',
      body: { place_id: -9 },
    });
    await row({
      id: 'known-create',
      tripId: 2,
      schemaVersion: 1,
      createdAt: 1,
      method: 'POST',
      url: '/trips/2/places',
      tempId: -9,
    });
    vi.spyOn(api, 'request').mockResolvedValue({ data: { place: buildPlace({ id: 90, trip_id: 2 }) } } as never);
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.get(item.id)).toEqual(item);
  });
  it('a known edit cannot advance a future pending record’s observed base token', async () => {
    const item = await row({ createdAt: 2 });
    await row({ id: 'known-edit', schemaVersion: 1, createdAt: 1 });
    vi.spyOn(api, 'request').mockResolvedValue({
      data: { place: buildPlace({ id: 42, updated_at: '2026-11-08T01:00:00Z' }) },
    } as never);
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.get(item.id)).toEqual(item);
  });
  it('exports unknown work without authorizing automatic replay', async () => {
    const item = await row();
    const result = await prepareRetainedWorkExport();
    expect(result.blob.size).toBeGreaterThan(0);
    result.assertCurrent();
    expect(await offlineDb.mutationQueue.get(item.id)).toEqual(item);
  });
  it('keeps import file dependencies while an unknown queue protocol may reference them', async () => {
    const item = await row();
    await offlineDb.importFiles.put({
      jobId: 'fixture-job',
      fileName: 'booking.pdf',
      blob: new Blob(['original']),
      createdAt: 1,
    });
    await deleteImportFiles('fixture-job');
    expect(await offlineDb.importFiles.count()).toBe(1);
    expect(await offlineDb.mutationQueue.get(item.id)).toEqual(item);
  });
});

describe('older raw Family work without an installed planner cohort', () => {
  beforeEach(() => vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true));
  it('Clear cache and export recognize raw Family work before any cohort is installed', async () => {
    const item = await row({ schemaVersion: undefined });
    await expect(clearAll()).rejects.toThrow();
    expect((await prepareRetainedWorkExport()).blob.size).toBeGreaterThan(0);
    expect(await offlineDb.mutationQueue.get(item.id)).toEqual(item);
  });
  it('Discard refuses older failed raw work without deleting it', async () => {
    const item = await row({ schemaVersion: 1, status: 'failed' });
    await expect(mutationQueue.discardFailed()).rejects.toThrow();
    expect(await offlineDb.mutationQueue.get(item.id)).toEqual(item);
  });
  it('reopening an account protects raw work even before the cohort can be mounted', async () => {
    const item = await row({ schemaVersion: undefined });
    await deleteCurrentUserDb();
    await reopenForUser(A);
    const kept = await offlineDb.mutationQueue.get(item.id);
    expect(kept?.body).toEqual(item.body);
    expect(kept?.id).toBe(item.id);
    expect(kept?.recoveryHold?.released).toBe(false);
    expect(kept?.status).toBe('conflict');
  });
  it.each(['pending', 'syncing', 'failed', 'conflict'] as const)(
    'parks unscoped raw %s work without dispatching or inventing an observed command',
    async (status) => {
      const item = await row({ schemaVersion: 1, status }),
        send = requestSpy();
      await mutationQueue.flush();
      const kept = await offlineDb.mutationQueue.get(item.id);
      expect(send).not.toHaveBeenCalled();
      expect(kept).toMatchObject({
        id: item.id,
        url: item.url,
        body: item.body,
        baseUpdatedAt: item.baseUpdatedAt,
        attempts: item.attempts,
        status: 'conflict',
        retentionPolicy: 'family-original-v1',
        recoveryHold: { reason: 'unscoped-native', released: false },
      });
      await expect(mutationQueue.resolveKeepMine(item.id)).rejects.toThrow('scope');
      expect(send).not.toHaveBeenCalled();
    }
  );
  it('a held raw write blocks later checked commands in its trip while another trip can proceed', async () => {
    const item = await row({ schemaVersion: 1 });
    const later = await row({ createdAt: 2, schemaVersion: 1, url: command, resource: undefined });
    const other = await row({
      tripId: 2,
      createdAt: 3,
      schemaVersion: 1,
      url: '/trips/2/family/calendar',
      resource: undefined,
    });
    const send = requestSpy();
    await mutationQueue.flush();
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0].url).toBe(other.url);
    expect(await offlineDb.mutationQueue.get(item.id)).toBeDefined();
    expect(await offlineDb.mutationQueue.get(later.id)).toBeDefined();
    expect(await offlineDb.mutationQueue.get(other.id)).toBeUndefined();
  });
  it('a checked Family command retains its exact body and idempotency/base headers through native HTTP', async () => {
    const item = await row({ schemaVersion: 1, url: command, resource: undefined });
    const observed: unknown[] = [];
    server.use(
      http.put('/api' + command, async ({ request }) => {
        observed.push([
          await request.json(),
          request.headers.get('X-Idempotency-Key'),
          request.headers.get('X-Base-Updated-At'),
        ]);
        return HttpResponse.json({ ok: true });
      })
    );
    await mutationQueue.flush();
    expect(observed).toEqual([[item.body, item.id, item.baseUpdatedAt]]);
    expect(await offlineDb.mutationQueue.get(item.id)).toBeUndefined();
  });
});

describe('queue dispatch has an original session', () => {
  it('native format-1 writes remain replayable when the Family runtime is inactive', async () => {
    const item = await row({ schemaVersion: undefined });
    const send = requestSpy();
    await mutationQueue.flush();
    expect(send).toHaveBeenCalledOnce();
    expect(await offlineDb.mutationQueue.get(item.id)).toBeUndefined();
  });
  it('never remaps a retained command body or advances its original observed token after a native create', async () => {
    await row({ id: 'known-create', schemaVersion: 1, method: 'POST', url: '/trips/1/places', tempId: -9 });
    const item = await row({
      schemaVersion: 1,
      createdAt: 2,
      method: 'POST',
      url: command,
      body: { place_id: -9, notes: 'Original intent' },
    });
    const send = vi
      .spyOn(api, 'request')
      .mockResolvedValueOnce({ data: { place: buildPlace({ id: 42, updated_at: '2026-11-08T01:00:00Z' }) } } as never)
      .mockResolvedValue({ data: { ok: true } } as never);
    await mutationQueue.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toMatchObject({
      data: item.body,
      headers: { 'X-Idempotency-Key': item.id, 'X-Base-Updated-At': item.baseUpdatedAt },
    });
  });
  it('keeps optimistic originals when a retained command exhausts server-error retries', async () => {
    const item = await row({ schemaVersion: 1, url: command, attempts: 7, tempId: -9, method: 'POST' });
    const place = buildPlace({ id: -9, name: 'Retained local original' });
    await offlineDb.places.put(place);
    vi.spyOn(api, 'request').mockRejectedValue({ response: { status: 500 } });
    await mutationQueue.flush();
    expect(await offlineDb.places.get(-9)).toEqual(place);
    expect(await offlineDb.mutationQueue.get(item.id)).toMatchObject({
      id: item.id,
      body: item.body,
      status: 'failed',
    });
  });
  it('does not send after the authentication epoch changes while marking a row syncing', async () => {
    const item = await row({ schemaVersion: 1, url: command, resource: undefined }),
      send = requestSpy();
    const table = currentOfflineDatabase().mutationQueue;
    const update: typeof table.update = table.update.bind(table);
    let syncingUpdateCount: number | undefined;
    vi.spyOn(table, 'update').mockImplementation((key, changes) =>
      update(key, changes).then((saved) => {
        if (typeof changes === 'object' && changes.status === 'syncing') {
          syncingUpdateCount = saved;
          invalidateOfflineSession();
        }
        return saved;
      })
    );
    await mutationQueue.flush();
    expect(syncingUpdateCount).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.get(item.id)).toMatchObject({
      id: item.id,
      status: 'syncing',
      body: item.body,
    });
  });
  it.each([false, true])('a successor account needs its own flush request (requested=%s)', async (requested) => {
    await row({ schemaVersion: 1, url: command, resource: undefined });
    const started = deferred<void>(),
      done = deferred<void>();
    const send = vi.spyOn(api, 'request').mockImplementation(async () => {
      started.resolve();
      await done.promise;
      return { data: { ok: true } } as never;
    });
    const old = mutationQueue.flush();
    await started.promise;
    const oldAgain = mutationQueue.flush();
    await reopenForUser(B);
    const next = await row({ schemaVersion: 1, resource: undefined, url: command });
    const fresh = requested ? mutationQueue.flush() : Promise.resolve();
    done.resolve();
    await Promise.all([old, oldAgain, fresh]);
    expect(send).toHaveBeenCalledTimes(requested ? 2 : 1);
    expect(await offlineDb.mutationQueue.get(next.id)).toEqual(requested ? undefined : next);
  });
});
