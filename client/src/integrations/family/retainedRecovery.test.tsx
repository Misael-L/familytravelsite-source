import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { http, HttpResponse } from 'msw';
import { Blob as NativeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlace, buildTrip } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import OfflineTab from '../../components/Settings/OfflineTab';
import {
  clearAll,
  clearTripData,
  currentOfflineDatabase,
  offlineDb,
  reopenAnonymous,
  reopenForUser,
  type QueuedMutation,
} from '../../db/offlineDb';
import MSettingsOffline from '../../mobile/screens/settings/MSettingsOffline';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { _resetOfflinePrefs } from '../../sync/offlinePrefs';
import { installFamilyCommandRetention, RetainedCommandError } from '../../sync/retainedCommand';
import { downloadRetainedWork, prepareRetainedWorkExport, retainedWorkCount } from '../../sync/retainedRecovery';
const io = vi.hoisted(() => ({ download: vi.fn(), error: vi.fn(), success: vi.fn(), sync: vi.fn() }));
vi.mock('../../utils/fileDownload', () => ({ downloadBlob: io.download }));
vi.mock('../../sync/tripSyncManager', () => ({ tripSyncManager: { syncAll: io.sync }, isDateEligible: () => true }));
vi.mock('../../components/shared/Toast', () => ({ useToast: () => io }));
vi.mock('../../i18n', () => ({ useTranslation: () => ({ t: (k: string) => k, locale: 'en' }) }));
let release: (() => void) | undefined;
beforeEach(async () => {
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  resetAllStores();
  _resetNetworkMode();
  _resetOfflinePrefs();
  setAuthed(false);
  io.download.mockReset();
  io.error.mockReset();
  io.sync.mockReset();
  server.use(http.get('/api/trips', () => HttpResponse.json({ trips: [] })));
});
afterEach(async () => {
  cleanup();
  release?.();
  release = undefined;
  vi.restoreAllMocks();
  await resetOfflineTestDatabase();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  await Dexie.delete('trek-offline-up04u-a');
  await Dexie.delete('trek-offline-up04u-b');
});
async function seed(over: Partial<QueuedMutation> = {}) {
  const row: QueuedMutation = {
    id: crypto.randomUUID(),
    tripId: 1,
    method: 'POST',
    url: '/trips/1/family/planner-editor-command',
    body: {
      version: 1,
      operation_id: 'original-uuid',
      scope: {
        user_id: 'original-user',
        family_id: 'original-family',
        person_id: 'original-person',
        trip_id: 'original-trip',
        layer: 'myDraft',
      },
      observation: { revision: 8 },
      changes: { notes: 'Retained private note' },
      future: { unknown: [1, 'keep'] },
    },
    baseUpdatedAt: 'Original precise token',
    createdAt: 1,
    status: 'conflict',
    attempts: 2,
    lastError: 'Original refusal',
    ...over,
  };
  await offlineDb.mutationQueue.put(row);
  return row;
}
async function read(blob: Blob) {
  return JSON.parse(
    await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsText(blob);
    })
  );
}
async function cache() {
  const trip = buildTrip({ id: 1 }),
    place = buildPlace({ id: -7, trip_id: 1 });
  await offlineDb.trips.put(trip);
  await offlineDb.places.put(place);
  return { trip, place };
}
describe('P04u actual guarded database operations', () => {
  it.each(['pending', 'syncing', 'failed', 'conflict'] as const)(
    'Clear cache refuses atomically for retained %s work',
    async (status) => {
      const row = await seed({ status }),
        saved = await cache();
      await expect(clearAll()).rejects.toBeInstanceOf(RetainedCommandError);
      expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
      expect(await offlineDb.trips.get(1)).toEqual(saved.trip);
      expect(await offlineDb.places.get(-7)).toEqual(saved.place);
    }
  );
  it('an unknown newer command and its unmarked dependent both survive cache clearing', async () => {
    const row = await seed({ schemaVersion: 99 }),
      next = await seed({ id: 'later', url: '/trips/1/places/7', retentionPolicy: undefined, createdAt: 2 });
    await expect(clearAll()).rejects.toThrow();
    expect(await offlineDb.mutationQueue.toArray()).toEqual(expect.arrayContaining([row, next]));
  });
  it('an active cohort protects an otherwise unmarked native write before clearing', async () => {
    release = installFamilyCommandRetention();
    const row = await seed({ url: '/trips/1/places/7' });
    await expect(clearAll()).rejects.toThrow();
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
  });
  it('a previously stamped native write stays protected after cohort release', async () => {
    const row = await seed({ url: '/trips/1/places/7', retentionPolicy: 'family-original-v1' });
    await expect(clearAll()).rejects.toThrow();
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
  });
  it('ordinary native cache clearing remains available without retained work', async () => {
    await cache();
    await seed({ url: '/trips/1/places/7' });
    await clearAll();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(await offlineDb.trips.count()).toBe(0);
    expect(await offlineDb.places.count()).toBe(0);
  });
  it('a later table-clear failure rolls the complete native clear back', async () => {
    const saved = await cache();
    const fail = () => {
      throw new Error('Local failure');
    };
    currentOfflineDatabase().places.hook('deleting', fail);
    try {
      await expect(clearAll()).rejects.toThrow('Local failure');
    } finally {
      currentOfflineDatabase().places.hook('deleting').unsubscribe(fail);
    }
    expect(await offlineDb.trips.get(1)).toEqual(saved.trip);
    expect(await offlineDb.places.get(-7)).toEqual(saved.place);
  });
  it('per-Trip eviction still preserves all queued work', async () => {
    const row = await seed();
    await cache();
    await clearTripData(1);
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
    expect(await offlineDb.trips.count()).toBe(0);
  });
});
describe('P04u lossless active-queue export through actual IndexedDB', () => {
  it('exports complete original rows and later dependencies without mutating queue or cached originals', async () => {
    const first = await seed(),
      next = await seed({ id: 'dependent', url: '/trips/1/places/7', createdAt: 2, body: { name: 'Following work' } }),
      saved = await cache(),
      before = await offlineDb.mutationQueue.toArray();
    const result = await prepareRetainedWorkExport(),
      file = await read(result.blob);
    expect(file.format).toBe('family.retained-work.v1');
    expect(file.rows).toEqual([first, next]);
    expect(file.automatic_replay).toBe(false);
    expect(file.retained_count).toBe(1);
    expect(await offlineDb.mutationQueue.toArray()).toEqual(before);
    expect(await offlineDb.places.get(-7)).toEqual(saved.place);
    expect(io.sync).not.toHaveBeenCalled();
  });
  it('preserves undefined object/array values using explicit paths instead of silent JSON loss', async () => {
    await seed({ syncingSince: undefined, body: { nested: { unset: undefined }, values: [undefined, null] } });
    const file = await read((await prepareRetainedWorkExport()).blob);
    expect(file.undefined_paths).toEqual(
      expect.arrayContaining([
        [0, 'syncingSince'],
        [0, 'body', 'nested', 'unset'],
        [0, 'body', 'values', 0],
      ])
    );
    expect(file.rows[0].body.values).toEqual([null, null]);
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });
  it.each([
    { access_token: 'private-auth' },
    { nested: { Authorization: 'Bearer private' } },
    { url: 'https://fixture.invalid/file?token=private' },
    { secret: ['sb_', 'secret_', 'do_not_export'].join('') },
    { secret: 'eyJabc.abc.abc' },
  ])('refuses credential-shaped content without redacting or dropping the original', async (body) => {
    const row = await seed({ body });
    await expect(downloadRetainedWork()).rejects.toThrow('credentials');
    expect(io.download).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
  });
  it.each([
    { label: 'binary', make: () => new NativeBlob(['original file']) },
    { label: 'date', make: () => new Date() },
    { label: 'nonfinite', make: () => Number.NaN },
    { label: 'bigint', make: () => BigInt(1) },
  ])('refuses unsupported $label data rather than exporting an incomplete recovery file', async ({ make }) => {
    const row = await seed({ body: { value: make() } });
    await expect(downloadRetainedWork()).rejects.toThrow();
    expect(io.download).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
  });
  it('refuses cyclic content without deleting it', async () => {
    const body: Record<string, unknown> = {};
    body.self = body;
    const row = await seed({ body });
    await expect(downloadRetainedWork()).rejects.toThrow();
    expect((await offlineDb.mutationQueue.get(row.id))?.body).toEqual(body);
  });
  it('rejects an oversized file without truncation or deletion', async () => {
    await seed({ body: { notes: 'x'.repeat(33 * 1024 * 1024) } });
    await expect(downloadRetainedWork()).rejects.toThrow('bound');
    expect(io.download).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });
  it('does not export ordinary rows when no retained work exists', async () => {
    await seed({ url: '/trips/1/places/7' });
    await expect(downloadRetainedWork()).rejects.toThrow('no retained');
    expect(io.download).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });
  it('a failed browser download never clears original work', async () => {
    const row = await seed();
    io.download.mockImplementationOnce(() => {
      throw new Error('Download unavailable');
    });
    await expect(downloadRetainedWork()).rejects.toThrow('Download unavailable');
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
  });
  it('an export prepared for one account cannot be used after switching accounts', async () => {
    await reopenForUser('p04u-a');
    const first = await seed(),
      result = await prepareRetainedWorkExport();
    await reopenForUser('p04u-b');
    expect(await retainedWorkCount()).toBe(0);
    expect(() => result.assertCurrent()).toThrow('account changed');
    await expect(downloadRetainedWork()).rejects.toThrow('no retained');
    expect(io.download).not.toHaveBeenCalled();
    await reopenForUser('p04u-a');
    expect(await offlineDb.mutationQueue.get(first.id)).toMatchObject(first);
    expect((await offlineDb.mutationQueue.get(first.id))?.recoveryHold?.released).toBe(false);
  });
});
describe('P04u real native desktop and phone settings', () => {
  it.each(['desktop', 'phone'])(
    '%s exports the original queue locally while offline and leaves it visible',
    async (shell) => {
      const row = await seed();
      setForcedOffline(true);
      render(shell === 'desktop' ? <OfflineTab /> : <MSettingsOffline />);
      fireEvent.click(await screen.findByRole('button', { name: 'settings.offline.retained.export' }));
      await waitFor(() => expect(io.download).toHaveBeenCalledOnce());
      expect((await read(io.download.mock.calls[0][0])).rows[0]).toEqual(row);
      expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
      expect(await screen.findByRole('button', { name: 'settings.offline.retained.export' })).toBeInTheDocument();
      expect(io.sync).not.toHaveBeenCalled();
    }
  );
  it.each(['desktop', 'phone'])(
    '%s Clear cache reports retained work after the real confirmation and removes nothing',
    async (shell) => {
      const row = await seed(),
        saved = await cache();
      render(shell === 'desktop' ? <OfflineTab /> : <MSettingsOffline />);
      await waitFor(() => expect(screen.getByRole('button', { name: 'settings.offline.clear' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'settings.offline.clear' }));
      const buttons = await screen.findAllByRole('button', { name: 'settings.offline.clear' });
      fireEvent.click(buttons[buttons.length - 1]);
      await waitFor(() => expect(io.error).toHaveBeenCalled());
      expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
      expect(await offlineDb.places.get(-7)).toEqual(saved.place);
      expect(io.sync).not.toHaveBeenCalled();
    }
  );
  it.each(['desktop', 'phone'])('%s download failure reports an error and retains all work', async (shell) => {
    const row = await seed();
    io.download.mockImplementationOnce(() => {
      throw new Error('Device download failed');
    });
    render(shell === 'desktop' ? <OfflineTab /> : <MSettingsOffline />);
    fireEvent.click(await screen.findByRole('button', { name: 'settings.offline.retained.export' }));
    await waitFor(() => expect(io.error).toHaveBeenCalledWith('Device download failed'));
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
  });
  it.each(['desktop', 'phone'])('%s has no new export action for ordinary native work', async (shell) => {
    await seed({ url: '/trips/1/places/7' });
    render(shell === 'desktop' ? <OfflineTab /> : <MSettingsOffline />);
    await screen.findByText('settings.offline.cache.title');
    expect(screen.queryByRole('button', { name: 'settings.offline.retained.export' })).not.toBeInTheDocument();
  });
});

it('enqueue stamps native cohort work before disposal without relying on a flush', async () => {
  release = installFamilyCommandRetention();
  const id = await mutationQueue.enqueue({
    id: 'not-flushed',
    tripId: 1,
    method: 'PUT',
    url: '/trips/1/places/7',
    body: { notes: 'Original unsent work' },
  });
  release();
  release = undefined;
  expect((await offlineDb.mutationQueue.get(id))?.retentionPolicy).toBe('family-original-v1');
  await expect(clearAll()).rejects.toThrow();
  expect(await retainedWorkCount()).toBe(1);
});
