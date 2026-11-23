import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { act, cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import OfflineTab from '../../components/Settings/OfflineTab';
import {
  currentOfflineDatabase,
  invalidateOfflineSession,
  offlineDb,
  reopenAnonymous,
  reopenForUser,
  TrekOfflineDb,
  type QueuedMutation,
} from '../../db/offlineDb';
import MSettingsOffline from '../../mobile/screens/settings/MSettingsOffline';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { _resetOfflinePrefs } from '../../sync/offlinePrefs';
import { watchQueueStatus } from '../../sync/queueStatus';
import * as retainedQueueGuards from '../../sync/retainedQueueGuards';
import { registerSyncTriggers, unregisterSyncTriggers } from '../../sync/syncTriggers';
import * as runtime from './runtime';

const wire = vi.hoisted(() => ({
  flush: null as (() => Promise<void>) | null,
  refetch: null as ((id: string) => void) | null,
  sync: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock('../../api/websocket', () => ({
  getSocketId: () => null,
  reconnectNow: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  getActiveTrips: () => ['1'],
  setPreReconnectHook: (fn: typeof wire.flush) => {
    wire.flush = fn;
  },
  setRefetchCallback: (fn: typeof wire.refetch) => {
    wire.refetch = fn;
  },
  addListener: vi.fn(),
  removeListener: vi.fn(),
}));
vi.mock('../../sync/tripSyncManager', () => ({ tripSyncManager: { syncAll: wire.sync }, isDateEligible: () => true }));
vi.mock('../../components/shared/Toast', () => ({ useToast: () => wire }));
vi.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (key: string, values?: { name?: string }) => values?.name ?? key, locale: 'en' }),
}));
const A = 88101,
  url = '/trips/1/family/planner-editor-command';
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function seed(extra: Partial<QueuedMutation> = {}) {
  const row: QueuedMutation = {
    id: crypto.randomUUID(),
    tripId: 1,
    method: 'POST',
    url,
    body: { name: 'Original queued edit' },
    baseUpdatedAt: 'original',
    status: 'pending',
    attempts: 0,
    createdAt: 1,
    lastError: null,
    schemaVersion: 2,
    ...extra,
  };
  await offlineDb.mutationQueue.put(row);
  return row;
}
beforeEach(async () => {
  resetAllStores();
  await reopenAnonymous();
  await reopenForUser(A);
  await resetOfflineTestDatabase();
  _resetNetworkMode();
  _resetOfflinePrefs();
  mutationQueue._resetFlushing();
  setAuthed(true);
  wire.sync.mockReset();
  wire.error.mockReset();
  vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(true);
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  server.use(http.get('/api/trips', () => HttpResponse.json({ trips: [] })));
});
afterEach(async () => {
  unregisterSyncTriggers();
  cleanup();
  setAuthed(false);
  vi.restoreAllMocks();
  await reopenAnonymous();
  await Dexie.delete(`trek-offline-u${A}`);
});
async function hold() {
  const entered = deferred(),
    release = deferred();
  const done = navigator.locks.request(`trek-mutation-flush:${offlineDb.name}`, () => {
    entered.resolve();
    return release.promise;
  });
  await entered.promise;
  return { release: release.resolve, done };
}
const settledBeforeRelease = (run: Promise<void>) =>
  Promise.race([run.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 60))]);

describe('queue lock lifetime and failure boundaries', () => {
  it.each(['session', 'offline'] as const)(
    'retires a queued lock promptly on %s change, without rewriting the queued original',
    async (reason) => {
      const row = await seed(),
        other = await hold(),
        request = vi.spyOn(api, 'request').mockResolvedValue({ data: { ok: true } } as never);
      const lock = vi.spyOn(navigator.locks, 'request');
      const run = mutationQueue.flush();
      try {
        await waitFor(() => expect(lock).toHaveBeenCalled());
        if (reason === 'session') invalidateOfflineSession();
        else setForcedOffline(true);
        expect(await settledBeforeRelease(run)).toBe(true);
        expect(request).not.toHaveBeenCalled();
        expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
      } finally {
        other.release();
        await other.done;
        await run;
      }
    }
  );
  it.each(['session end', 'offline mode'] as const)(
    'stops the pass and releases the held lock on %s after the queue is read',
    async (reason) => {
      const row = await seed();
      const original = currentOfflineDatabase();
      const read = deferred(),
        resume = deferred();
      const readTerminalDecision = retainedQueueGuards.pendingTerminalDecision;
      vi.spyOn(retainedQueueGuards, 'pendingTerminalDecision').mockImplementationOnce(async (db) => {
        const pending = await readTerminalDecision(db);
        read.resolve();
        await resume.promise;
        return pending;
      });
      const request = vi.spyOn(api, 'request').mockResolvedValue({ data: { ok: true } } as never);
      const after = vi.fn();
      const abort = new AbortController();
      const pass = mutationQueue._flushPass();
      try {
        await Promise.race([
          read.promise,
          pass.then(() => {
            throw new Error('Flush stopped before reading the terminal decisions');
          }),
        ]);
        const nextLock = navigator.locks
          .request(`trek-mutation-flush:${original.name}`, { signal: abort.signal }, after)
          .then(
            () => true,
            () => false
          );
        await Promise.resolve();
        expect(after).not.toHaveBeenCalled();
        if (reason === 'session end') {
          setAuthed(false);
          await reopenAnonymous();
        } else setForcedOffline(true);
        resume.resolve();

        const result = await pass;
        await waitFor(() => expect(after).toHaveBeenCalledOnce());
        expect(await nextLock).toBe(true);
        expect(request).not.toHaveBeenCalled();
        if (reason === 'session end') {
          expect(await offlineDb.mutationQueue.get(row.id)).toBeUndefined();
          const originalReader = new TrekOfflineDb(original.name);
          try {
            await originalReader.open();
            expect(await originalReader.mutationQueue.get(row.id)).toStrictEqual(row);
          } finally {
            originalReader.close();
          }
        } else expect(await offlineDb.mutationQueue.get(row.id)).toStrictEqual(row);
        expect(result).toBe(false);
      } finally {
        resume.resolve();
        abort.abort();
        setForcedOffline(false);
        await pass;
      }
    }
  );
  it.each(['absent', 'rejected', 'throws'] as const)('preserves Family work when Web Locks are %s', async (mode) => {
    const row = await seed(),
      request = vi.spyOn(api, 'request').mockResolvedValue({ data: { ok: true } } as never);
    if (mode === 'absent') Reflect.deleteProperty(navigator, 'locks');
    else
      vi.spyOn(navigator.locks, 'request').mockImplementation(() => {
        if (mode === 'throws') throw new DOMException('Denied', 'SecurityError');
        return Promise.reject(new DOMException('Denied', 'SecurityError'));
      });
    await expect(mutationQueue.flush()).rejects.toThrow('lock');
    expect(request).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
  });
  it('retains the ordinary native fallback when no protected work exists', async () => {
    vi.spyOn(runtime, 'isFamilyFrontendActive').mockReturnValue(false);
    Reflect.deleteProperty(navigator, 'locks');
    const row = await seed({ url: '/trips/1/places' }),
      request = vi.spyOn(api, 'request').mockResolvedValue({ data: { ok: true } } as never);
    await mutationQueue.flush();
    expect(request).toHaveBeenCalledOnce();
    expect(await offlineDb.mutationQueue.get(row.id)).toBeUndefined();
  });
  it.each(['forced offline', 'browser disconnect'] as const)(
    'keeps the original pending without an HTTP attempt after %s while marking syncing',
    async (mode) => {
      const row = await seed({ retentionPolicy: 'family-original-v1' });
      const table = currentOfflineDatabase().mutationQueue;
      const update: typeof table.update = table.update.bind(table);
      const request = vi.spyOn(api, 'request').mockResolvedValue({ data: { ok: true } } as never);
      let marked: QueuedMutation | undefined;
      vi.spyOn(table, 'update').mockImplementation((key, changes) =>
        update(key, changes).then(async (count) => {
          if (key === row.id && typeof changes === 'object' && changes.status === 'syncing') {
            marked = await table.get(row.id);
            if (mode === 'forced offline') setForcedOffline(true);
            else {
              Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
              window.dispatchEvent(new Event('offline'));
            }
          }
          return count;
        })
      );

      try {
        await mutationQueue.flush();
        expect(marked).toStrictEqual({ ...row, status: 'syncing', syncingSince: expect.any(Number) });
        expect(request).not.toHaveBeenCalled();
        expect(await table.get(row.id)).toStrictEqual(row);
      } finally {
        setForcedOffline(false);
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      }
    }
  );
});

describe('live parked-work visibility', () => {
  it.each(['desktop', 'phone'] as const)(
    '%s settings shows a conflict created through a separate database connection without user refresh',
    async (shell) => {
      render(shell === 'desktop' ? <OfflineTab /> : <MSettingsOffline />);
      await screen.findByText('settings.offline.cache.title');
      const other = new TrekOfflineDb(offlineDb.name);
      await other.open();
      try {
        const row = {
          id: 'other-tab',
          tripId: 1,
          url,
          method: 'POST' as const,
          body: { name: 'Parked by the other tab' },
          createdAt: 1,
          status: 'conflict' as const,
          attempts: 0,
          lastError: null,
        };
        await act(async () => {
          await other.mutationQueue.put(row);
        });
        expect(await screen.findByText('Parked by the other tab')).toBeInTheDocument();
        await act(async () => {
          await other.mutationQueue.delete(row.id);
        });
        await waitFor(() => expect(screen.queryByText('Parked by the other tab')).not.toBeInTheDocument());
        expect(wire.sync).not.toHaveBeenCalled();
      } finally {
        other.close();
      }
    }
  );
  it.each(['desktop', 'phone'] as const)(
    '%s retry reports a refused lock through the existing toast and retains the original',
    async (shell) => {
      vi.spyOn(api, 'request').mockResolvedValue({ data: { ok: true } } as never);
      const row = await seed({ status: 'failed' });
      render(shell === 'desktop' ? <OfflineTab /> : <MSettingsOffline />);
      const retry = await screen.findByRole('button', { name: 'settings.offline.failed.retry' });
      Reflect.deleteProperty(navigator, 'locks');
      fireEvent.click(retry);
      await waitFor(() => expect(wire.error).toHaveBeenCalledWith(expect.stringContaining('cross-tab queue lock')));
      expect(await offlineDb.mutationQueue.get(row.id)).toMatchObject({
        id: row.id,
        body: row.body,
        baseUpdatedAt: row.baseUpdatedAt,
      });
    }
  );
  it('a retired observer clears its view and cannot publish a later original-account change', async () => {
    const next = vi.fn(),
      retired = vi.fn(),
      failed = vi.fn(),
      stop = watchQueueStatus(next, failed, retired);
    try {
      await waitFor(() => expect(next).toHaveBeenCalled());
      invalidateOfflineSession();
      expect(retired).toHaveBeenCalledOnce();
      next.mockClear();
      await seed({ status: 'conflict' });
      await new Promise((r) => setTimeout(r, 30));
      expect(next).not.toHaveBeenCalled();
      expect(failed).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });
});

describe('reconnect respects queue failure and original registration ownership', () => {
  it('does not resync or hydrate after an online-event replay failure', async () => {
    useAuthStore.setState({ isAuthenticated: true });
    registerSyncTriggers();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {}),
      hydrate = vi.spyOn(useTripStore.getState(), 'hydrateActiveTrip').mockResolvedValue();
    vi.spyOn(mutationQueue, 'flush').mockRejectedValue(new Error('Synthetic lock failure'));
    window.dispatchEvent(new Event('online'));
    await waitFor(() => expect(errors).toHaveBeenCalled());
    expect(wire.sync).not.toHaveBeenCalled();
    expect(hydrate).not.toHaveBeenCalled();
  });
  it('a retained reconnect callback cannot cross an authentication epoch even before unregister', async () => {
    useAuthStore.setState({ isAuthenticated: true });
    registerSyncTriggers();
    const flush = wire.flush,
      refetch = wire.refetch;
    const request = vi.spyOn(mutationQueue, 'flush').mockResolvedValue(),
      hydrate = vi.spyOn(useTripStore.getState(), 'hydrateActiveTrip').mockResolvedValue();
    invalidateOfflineSession();
    await flush?.();
    refetch?.('1');
    expect(request).not.toHaveBeenCalled();
    expect(hydrate).not.toHaveBeenCalled();
  });
});
