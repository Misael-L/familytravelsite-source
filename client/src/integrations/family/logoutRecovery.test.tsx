import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { http, HttpResponse } from 'msw';
import { Blob as NativeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlace, buildTrip, buildUser } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import OfflineTab from '../../components/Settings/OfflineTab';
import {
  clearAll,
  currentOfflineDatabase,
  deleteImportFiles,
  MUTATION_SCHEMA_VERSION,
  offlineDb,
  reopenAnonymous,
  reopenForUser,
  saveImportFiles,
  type QueuedMutation,
} from '../../db/offlineDb';
import MSettingsOffline from '../../mobile/screens/settings/MSettingsOffline';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { isAuthed, setAuthed } from '../../sync/authGate';
import { waitForLogout } from '../../sync/logoutCoordinator';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { _resetOfflinePrefs } from '../../sync/offlinePrefs';
import { captureQueueSession, QueueSessionChanged } from '../../sync/queueSession';
import { prepareRetainedWorkExport } from '../../sync/retainedRecovery';
import { createFamilyApplicationHandler } from './applicationHandler';
import { FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter } from './transport';
const storage = vi.hoisted(() => ({ gate: null as Promise<void> | null, fail: false }));
vi.mock('../../db/offlineDb', async (original) => {
  const db = await original<typeof import('../../db/offlineDb')>();
  return {
    ...db,
    reopenForUser: async (id: number | string) => {
      if (storage.gate !== null) await storage.gate;
      if (storage.fail) throw new Error('Storage unavailable');
      return db.reopenForUser(id);
    },
  };
});
const io = vi.hoisted(() => ({
  syncAll: vi.fn(async () => {}),
  error: vi.fn(),
  success: vi.fn(),
  rpc: vi.fn(),
  t: (k: string) => k,
}));
vi.mock('../../sync/tripSyncManager', () => ({ tripSyncManager: io, isDateEligible: () => true }));
vi.mock('../../sync/syncTriggers', () => ({ registerSyncTriggers: vi.fn(), unregisterSyncTriggers: vi.fn() }));
vi.mock('../../push/webPush', () => ({
  forgetPushDeviceOnLogout: vi.fn(async () => {}),
  resyncPushSubscription: vi.fn(async () => {}),
}));
vi.mock('../../components/shared/Toast', () => ({ useToast: () => io }));
vi.mock('../../i18n', () => ({ useTranslation: () => ({ t: io.t, locale: 'en' }) }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => ({ rpc: io.rpc }) }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => ({ rpc: io.rpc }) }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => source }));
const A = buildUser({ id: 701, email: 'a@fixture.invalid' }),
  B = buildUser({ id: 702, email: 'b@fixture.invalid' });
const uid = '10000000-0000-4000-8000-000000000001',
  person = '10000000-0000-4000-8000-000000000002',
  family = '10000000-0000-4000-8000-000000000003',
  trip = '10000000-0000-4000-8000-000000000004',
  draft = '10000000-0000-4000-8000-000000000005',
  op = '10000000-0000-4000-8000-000000000006';
let source = 'https://fixture.supabase.invalid',
  allow = true;
const oldAdapter = api.defaults.adapter;
beforeEach(async () => {
  await waitForLogout();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  resetAllStores();
  mutationQueue._resetFlushing();
  _resetNetworkMode();
  _resetOfflinePrefs();
  setAuthed(false);
  storage.gate = null;
  storage.fail = false;
  io.error.mockReset();
  io.syncAll.mockClear();
  io.rpc.mockReset();
  allow = true;
  source = 'https://fixture.supabase.invalid';
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true });
  server.use(
    http.post('/api/auth/login', async ({ request }) =>
      HttpResponse.json({ user: ((await request.json()) as { email: string }).email === B.email ? B : A })
    ),
    http.post('/api/auth/logout', () => HttpResponse.json({ success: true })),
    http.get('/api/trips', () => HttpResponse.json({ trips: [] }))
  );
});
afterEach(async () => {
  cleanup();
  api.defaults.adapter = oldAdapter;
  vi.useRealTimers();
  await waitForLogout();
  await resetOfflineTestDatabase();
  await reopenAnonymous();
  await resetOfflineTestDatabase();
  await Dexie.delete('trek-offline-u701');
  await Dexie.delete('trek-offline-u702');
  setAuthed(false);
  vi.restoreAllMocks();
});
async function signIn(user = A) {
  api.defaults.adapter = oldAdapter;
  await useAuthStore.getState().login(user.email, 'fixture-password');
  expect(isAuthed()).toBe(true);
}
async function row(over: Partial<QueuedMutation> = {}) {
  const item: QueuedMutation = {
    id: crypto.randomUUID(),
    tripId: 1,
    method: 'POST',
    url: '/trips/' + trip + '/family/governance/commands',
    body: {
      original: 'Private exact intent',
      scope: { user_id: uid, family_id: family, person_id: person, layer: 'myDraft' },
      observation: { revision: 7 },
      unknown: { future: ['keep'] },
    },
    baseUpdatedAt: 'Original precise token',
    createdAt: 1,
    status: 'conflict',
    attempts: 4,
    lastError: 'Original problem',
    schemaVersion: 1,
    ...over,
  };
  await offlineDb.mutationQueue.put(item);
  return item;
}
async function offlineLogout() {
  setForcedOffline(true);
  await useAuthStore.getState().logout();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
  expect(isAuthed()).toBe(false);
  expect(offlineDb.name).toBe('trek-offline');
}
function original(actual: QueuedMutation | undefined, expected: QueuedMutation) {
  expect(actual).toMatchObject({
    id: expected.id,
    body: expected.body,
    url: expected.url,
    method: expected.method,
    baseUpdatedAt: expected.baseUpdatedAt,
  });
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function artifact() {
  const id = crypto.randomUUID(),
    scope = { version: 1, trip_id: trip, family_id: family, user_id: uid, person_id: person, layer: 'myDraft' },
    observation = {
      record: { id: draft, trip_id: trip, owner_person_id: person },
      operations: [
        {
          id: op,
          draft_id: draft,
          module: 'trip_place',
          op: 'add',
          sort_order: 0,
          payload: {
            schema_version: 2,
            contract: 'family.plan_change.v2',
            domain: 'location',
            action: 'create',
            changes: { label: 'Original venue' },
          },
        },
      ],
    };
  return row({
    id,
    baseUpdatedAt: undefined,
    body: {
      version: 1,
      operation_id: id,
      source_url: source,
      scope,
      action: 'submit',
      target_id: draft,
      observation,
      parameters: { summary: 'Original request' },
    },
  });
}
async function checkedAdapter(override: Partial<{ userId: string; personId: string; familyId: string }> = {}) {
  const repo = new FamilyFrontendRepository(async () => ({
    userId: uid,
    personId: person,
    familyId: family,
    ...override,
    user: { username: 'Fixture', email: A.email, created_at: '2026-01-01', avatar_url: null },
  }));
  await repo.session();
  repo.setLayer(trip, 'myDraft');
  const app = createFamilyApplicationHandler(repo);
  api.defaults.adapter = createFamilyAxiosAdapter(async (request) =>
    request.pathname === '/trips' && request.method === 'GET' ? { trips: [] } : app(request)
  );
  io.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name !== 'execute_family_plan_governance_v1') throw new Error('Unexpected RPC ' + name);
    if (!allow) return { data: null, error: { code: '42501', message: 'Current permission revoked' } };
    return {
      data: {
        version: 1,
        trip_id: trip,
        operation_id: args.p_operation_id,
        action: args.p_action,
        target_id: args.p_target_id,
        result: { request_id: op },
      },
      error: null,
    };
  });
  return repo;
}
describe('P04v actual native auth logout and recovery', () => {
  it.each(['pending', 'syncing', 'failed', 'conflict'] as const)(
    'retains original %s work and returns it paused only to the original account',
    async (status) => {
      await signIn();
      const first = await row({ status });
      await offlineDb.trips.put(buildTrip({ id: 1 }));
      await offlineDb.places.put(buildPlace({ id: 1, name: 'Private read cache' }));
      await offlineLogout();
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      await signIn(B);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect(await offlineDb.places.count()).toBe(0);
      await signIn();
      const kept = await offlineDb.mutationQueue.get(first.id);
      original(kept, first);
      expect(kept).toMatchObject({
        status: 'conflict',
        attempts: first.attempts,
        lastError: first.lastError,
        schemaVersion: MUTATION_SCHEMA_VERSION,
        recoveryHold: { reason: 'signed-out', originalStatus: status, originalSchemaVersion: 1, released: false },
      });
      expect(await offlineDb.trips.count()).toBe(0);
      expect(await offlineDb.places.count()).toBe(0);
    }
  );
  it('holds the complete mixed dependency queue without rewriting any body or identity', async () => {
    await signIn();
    const first = await row(),
      next = await row({
        id: 'dependent',
        createdAt: 2,
        url: '/trips/1/places/42',
        body: { notes: 'Dependent original' },
      });
    await offlineLogout();
    await signIn();
    for (const saved of [first, next]) {
      const kept = await offlineDb.mutationQueue.get(saved.id);
      original(kept, saved);
      expect(kept?.status).toBe('conflict');
    }
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.count()).toBe(2);
  });
  it('preserves newer formats without downgrading their version or unknown fields', async () => {
    await signIn();
    const first = await row({ schemaVersion: 99 });
    await offlineLogout();
    await signIn();
    const kept = await offlineDb.mutationQueue.get(first.id);
    original(kept, first);
    expect(kept).toEqual(first);
    await expect(mutationQueue.resolveKeepMine(first.id)).rejects.toThrow('unsupported');
    expect(await offlineDb.mutationQueue.get(first.id)).toEqual(first);
  });
  it('preserves source document bytes but clears downloaded read blobs', async () => {
    await signIn();
    await row();
    await offlineDb.importFiles.put({
      jobId: 'original',
      fileName: 'original.txt',
      createdAt: 0,
      blob: new NativeBlob(['Original document']) as unknown as Blob,
    });
    await offlineDb.blobCache.put({
      url: 'https://fixture.invalid/cached',
      tripId: 1,
      cachedAt: 1,
      mime: 'text/plain',
      bytes: 4,
      blob: new NativeBlob(['read']) as unknown as Blob,
    });
    await offlineLogout();
    await signIn();
    const file = await offlineDb.importFiles.get(['original', 'original.txt']);
    expect(await (file?.blob as unknown as NativeBlob).text()).toBe('Original document');
    expect(await offlineDb.blobCache.count()).toBe(0);
    await saveImportFiles('other', []);
    await deleteImportFiles('original');
    expect(await offlineDb.importFiles.count()).toBe(1);
    await offlineDb.mutationQueue.clear();
    await deleteImportFiles('original');
    expect(await offlineDb.importFiles.count()).toBe(0);
  });
  it('still blocks Clear cache after recovery and keeps export available', async () => {
    await signIn();
    const first = await artifact();
    await offlineLogout();
    await signIn();
    await expect(clearAll()).rejects.toThrow('retained');
    expect((await prepareRetainedWorkExport()).blob.size).toBeGreaterThan(0);
    original(await offlineDb.mutationQueue.get(first.id), first);
  });
  it('completes logout after a cleanup failure, keeps originals paused and reports the failure', async () => {
    await signIn();
    const first = await row({ status: 'pending' });
    await offlineDb.places.put(buildPlace({ id: 42 }));
    const db = currentOfflineDatabase(),
      fail = () => {
        throw new Error('Cache cleanup failed');
      };
    db.places.hook('deleting', fail);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await offlineLogout();
      expect(useAuthStore.getState().error).toContain('Local cleanup could not finish');
      expect(log).toHaveBeenCalled();
    } finally {
      db.places.hook('deleting').unsubscribe(fail);
    }
    await signIn(B);
    expect(await offlineDb.places.count()).toBe(0);
    await signIn();
    original(await offlineDb.mutationQueue.get(first.id), first);
    expect((await offlineDb.mutationQueue.get(first.id))?.status).toBe('conflict');
  });
  it('opening a stored account pauses old retained work even after an interrupted logout', async () => {
    await reopenForUser(A.id);
    const first = await row({ status: 'pending' });
    await reopenAnonymous();
    await signIn();
    expect((await offlineDb.mutationQueue.get(first.id))?.recoveryHold?.released).toBe(false);
    await mutationQueue.flush();
    original(await offlineDb.mutationQueue.get(first.id), first);
  });
  it('clears visible Trip data and global categories before returning to sign-in', async () => {
    await signIn();
    useTripStore.setState({ trip: buildTrip({ id: 1 }), places: [buildPlace({ id: 42, name: 'Previous account' })] });
    await offlineLogout();
    expect(useTripStore.getState().trip).toBeNull();
    expect(useTripStore.getState().places).toEqual([]);
    expect(useTripStore.getState().tags).toEqual([]);
    expect(useTripStore.getState().categories).toEqual([]);
  });
  it('ordinary native accounts without retained work retain the previous cache cleanup behavior', async () => {
    await signIn();
    await row({ url: '/trips/1/places/42' });
    await offlineLogout();
    await signIn();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
});
describe('P04v delayed real queue HTTP callbacks', () => {
  it.each([200, 403, 409, 500, 'network'] as const)(
    'a late %s response cannot write/delete the next account queue or cache',
    async (status) => {
      await signIn();
      const first = await row({ status: 'pending', resource: 'places', entityId: 42 }),
        arrived = deferred<void>(),
        finish = deferred<void>();
      server.use(
        http.post('/api/trips/' + trip + '/family/governance/commands', async () => {
          arrived.resolve();
          await finish.promise;
          return status === 'network'
            ? HttpResponse.error()
            : HttpResponse.json({ place: buildPlace({ id: 42, name: 'Old account response' }) }, { status });
        })
      );
      const running = mutationQueue.flush();
      await arrived.promise;
      await offlineLogout();
      await signIn(B);
      const collision = await row({
        id: first.id,
        status: 'failed',
        body: { notes: 'New account original' },
        url: '/trips/2/places/42',
      });
      const place = buildPlace({ id: 42, name: 'New account cache' });
      await offlineDb.places.put(place);
      finish.resolve();
      await running;
      expect(await offlineDb.mutationQueue.get(first.id)).toEqual(collision);
      expect(await offlineDb.places.get(42)).toEqual(place);
      await signIn();
      original(await offlineDb.mutationQueue.get(first.id), first);
      expect((await offlineDb.mutationQueue.get(first.id))?.status).toBe('conflict');
    }
  );
  it('a late success cannot acknowledge away recovery after the same account logs back in', async () => {
    await signIn();
    const first = await row({ status: 'pending' }),
      arrived = deferred<void>(),
      finish = deferred<void>();
    server.use(
      http.post('/api/trips/' + trip + '/family/governance/commands', async () => {
        arrived.resolve();
        await finish.promise;
        return HttpResponse.json({ ok: true });
      })
    );
    const running = mutationQueue.flush();
    await arrived.promise;
    await offlineLogout();
    await signIn();
    finish.resolve();
    await running;
    original(await offlineDb.mutationQueue.get(first.id), first);
    expect((await offlineDb.mutationQueue.get(first.id))?.status).toBe('conflict');
  });
  it('a cached Table handle itself is fenced after the session ends', async () => {
    await signIn();
    const captured = captureQueueSession(),
      table = captured.db.places;
    await offlineLogout();
    await signIn(B);
    await expect(async () => table.put(buildPlace({ id: 42, name: 'Stale' }))).rejects.toBeInstanceOf(
      QueueSessionChanged
    );
    expect(await offlineDb.places.count()).toBe(0);
  });
});
describe('P04v actual settings retry through checked Family HTTP orchestration', () => {
  it.each(['desktop', 'phone'])('%s retries only the original confirmed command after re-login', async (shell) => {
    await signIn();
    const first = await artifact();
    await offlineLogout();
    await signIn();
    await checkedAdapter();
    render(shell === 'desktop' ? <OfflineTab /> : <MSettingsOffline />);
    fireEvent.click(await screen.findByRole('button', { name: 'settings.offline.conflicts.keepMine' }));
    await waitFor(async () => expect(await offlineDb.mutationQueue.get(first.id)).toBeUndefined());
    expect(io.rpc).toHaveBeenCalledOnce();
    const [, args] = io.rpc.mock.calls[0];
    expect(args.p_operation_id).toBe(first.id);
    expect(args.p_observation).toEqual((first.body as { observation: unknown }).observation);
    expect(args.p_scope).toEqual((first.body as { scope: unknown }).scope);
  });
  it('current revoked authority refuses the recovered original instead of deleting it', async () => {
    await signIn();
    const first = await artifact();
    await offlineLogout();
    await signIn();
    await checkedAdapter();
    allow = false;
    await mutationQueue.resolveKeepMine(first.id);
    original(await offlineDb.mutationQueue.get(first.id), first);
    expect((await offlineDb.mutationQueue.get(first.id))?.status).toBe('failed');
    expect(io.rpc).toHaveBeenCalledOnce();
  });
  it('a different source refuses before invoking the RPC', async () => {
    await signIn();
    const first = await artifact();
    await offlineLogout();
    await signIn();
    await checkedAdapter();
    source = 'https://other.supabase.invalid';
    await mutationQueue.resolveKeepMine(first.id);
    expect(io.rpc).not.toHaveBeenCalled();
    original(await offlineDb.mutationQueue.get(first.id), first);
    expect((await offlineDb.mutationQueue.get(first.id))?.status).toBe('conflict');
  });
  it('an unscoped recovered native request remains exportable but cannot be retried as another edit', async () => {
    await signIn();
    const first = await row({ url: '/trips/1/places/42', retentionPolicy: 'family-original-v1' });
    await offlineLogout();
    await signIn();
    let calls = 0;
    server.use(
      http.post('/api/trips/1/places/42', () => {
        calls++;
        return HttpResponse.json({ ok: true });
      })
    );
    await expect(mutationQueue.resolveKeepMine(first.id)).rejects.toThrow('no checked original scope');
    expect(calls).toBe(0);
    original(await offlineDb.mutationQueue.get(first.id), first);
    expect((await prepareRetainedWorkExport()).blob.size).toBeGreaterThan(0);
  });
  it('Keep server still cannot discard recovered work', async () => {
    await signIn();
    const first = await artifact();
    await offlineLogout();
    await signIn();
    await expect(mutationQueue.resolveKeepServer(first.id)).rejects.toThrow('retained');
    original(await offlineDb.mutationQueue.get(first.id), first);
  });
});
describe('P04v real authentication lifecycle concurrency', () => {
  it('does not let an old loadUser completion sign the user back in', async () => {
    await signIn();
    const arrived = deferred<void>(),
      finish = deferred<void>();
    server.use(
      http.get('/api/auth/me', async () => {
        arrived.resolve();
        await finish.promise;
        return HttpResponse.json({ user: A });
      })
    );
    const old = useAuthStore.getState().loadUser();
    await arrived.promise;
    await offlineLogout();
    finish.resolve();
    await old;
    expect(useAuthStore.getState().user).toBeNull();
    expect(isAuthed()).toBe(false);
    expect(offlineDb.name).toBe('trek-offline');
  });
  it('does not let a pre-logout password response restore the old account', async () => {
    const arrived = deferred<void>(),
      finish = deferred<void>();
    server.use(
      http.post('/api/auth/login', async () => {
        arrived.resolve();
        await finish.promise;
        return HttpResponse.json({ user: A });
      })
    );
    const old = useAuthStore
      .getState()
      .login(A.email, 'fixture-password')
      .catch((e) => e);
    await arrived.promise;
    await offlineLogout();
    finish.resolve();
    expect(await old).toBeInstanceOf(Error);
    expect(useAuthStore.getState().user).toBeNull();
    expect(isAuthed()).toBe(false);
  });
  it('serializes a new sign-in behind logout teardown and coalesces repeat logout clicks', async () => {
    await signIn();
    const arrived = deferred<void>(),
      finish = deferred<void>();
    let calls = 0;
    server.use(
      http.post('/api/auth/logout', async () => {
        calls++;
        arrived.resolve();
        await finish.promise;
        return HttpResponse.json({ success: true });
      })
    );
    setForcedOffline(true);
    const one = useAuthStore.getState().logout(),
      two = useAuthStore.getState().logout();
    await arrived.promise;
    const next = useAuthStore.getState().login(B.email, 'fixture-password');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    finish.resolve();
    await Promise.all([one, two, next]);
    expect(calls).toBe(1);
    expect(useAuthStore.getState().user?.id).toBe(B.id);
    expect(offlineDb.name).toBe('trek-offline-u702');
    expect(isAuthed()).toBe(true);
  });
  it('logout remains bounded when the queue cannot finish', async () => {
    await signIn();
    const first = await row({ status: 'pending' });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    vi.spyOn(mutationQueue, 'flush').mockImplementation(() => new Promise(() => {}));
    const done = useAuthStore.getState().logout();
    await vi.advanceTimersByTimeAsync(5001);
    await vi.runAllTimersAsync();
    await done;
    vi.useRealTimers();
    expect(useAuthStore.getState().user).toBeNull();
    await signIn();
    original(await offlineDb.mutationQueue.get(first.id), first);
    expect((await offlineDb.mutationQueue.get(first.id))?.status).toBe('conflict');
  });
});

describe('P04v storage readiness and narrower recovery scope', () => {
  it.each([
    { personId: '20000000-0000-4000-8000-000000000001' },
    { familyId: '20000000-0000-4000-8000-000000000002' },
    { userId: '20000000-0000-4000-8000-000000000003' },
  ])('a changed principal scope refuses recovered original intent: %j', async (override) => {
    await signIn();
    const first = await artifact();
    await offlineLogout();
    await signIn();
    await checkedAdapter(override);
    await mutationQueue.resolveKeepMine(first.id);
    expect(io.rpc).not.toHaveBeenCalled();
    original(await offlineDb.mutationQueue.get(first.id), first);
    expect((await offlineDb.mutationQueue.get(first.id))?.status).toBe('conflict');
  });
  it('does not publish the next authenticated user until its storage connection is ready', async () => {
    await signIn();
    const gate = deferred<void>();
    storage.gate = gate.promise;
    const next = useAuthStore.getState().login(B.email, 'fixture-password');
    await waitFor(() => expect(isAuthed()).toBe(false));
    expect(useAuthStore.getState().user?.id).toBe(A.id);
    expect(useAuthStore.getState().isLoading).toBe(true);
    gate.resolve();
    await next;
    storage.gate = null;
    expect(useAuthStore.getState().user?.id).toBe(B.id);
    expect(offlineDb.name).toBe('trek-offline-u702');
  });
  it('a storage-open failure cannot enable replay against the previous account database', async () => {
    await signIn();
    const first = await row();
    storage.fail = true;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await useAuthStore.getState().login(B.email, 'fixture-password');
    expect(useAuthStore.getState().user?.id).toBe(B.id);
    expect(isAuthed()).toBe(false);
    expect(offlineDb.name).toBe('trek-offline');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(log).toHaveBeenCalled();
    storage.fail = false;
    await signIn();
    original(await offlineDb.mutationQueue.get(first.id), first);
  });
  it('a failed pause cannot erase work and a later successful connection pauses it before enabling replay', async () => {
    await signIn();
    const first = await row({ status: 'pending' }),
      db = currentOfflineDatabase(),
      fail = () => {
        throw new Error('Pause failed');
      };
    db.mutationQueue.hook('updating', fail);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await offlineLogout();
      expect(useAuthStore.getState().error).toContain('Local cleanup');
    } finally {
      db.mutationQueue.hook('updating').unsubscribe(fail);
    }
    await signIn();
    original(await offlineDb.mutationQueue.get(first.id), first);
    expect((await offlineDb.mutationQueue.get(first.id))?.recoveryHold?.released).toBe(false);
  });
  it('repeated logout preserves the first original status/version rather than nesting or rewriting history', async () => {
    await signIn();
    const first = await row({ status: 'pending', schemaVersion: 1 });
    await offlineLogout();
    await signIn();
    await offlineLogout();
    await signIn();
    const kept = await offlineDb.mutationQueue.get(first.id);
    original(kept, first);
    expect(kept?.recoveryHold).toEqual({
      reason: 'signed-out',
      originalStatus: 'pending',
      originalSchemaVersion: 1,
      released: false,
    });
  });
});

describe('P04v acknowledgement uncertainty during logout', () => {
  it('a known acknowledged command is not retained unnecessarily by online logout', async () => {
    await signIn();
    const first = await artifact();
    await offlineDb.mutationQueue.update(first.id, { status: 'pending' });
    await checkedAdapter();
    await useAuthStore.getState().logout();
    await signIn();
    expect(await offlineDb.mutationQueue.get(first.id)).toBeUndefined();
    expect(io.rpc).toHaveBeenCalledOnce();
  });
  it('a lost acknowledgement retries the same observed command and the fake server applies it once', async () => {
    await signIn();
    const first = await artifact();
    await offlineDb.mutationQueue.update(first.id, { status: 'pending' });
    await checkedAdapter();
    const seen = new Map<string, unknown>();
    let lost = true,
      applied = 0;
    io.rpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => {
      const id = String(args.p_operation_id);
      if (!seen.has(id)) {
        applied++;
        seen.set(id, {
          version: 1,
          trip_id: trip,
          operation_id: id,
          action: args.p_action,
          target_id: args.p_target_id,
          result: { request_id: op },
        });
      }
      if (lost) {
        lost = false;
        return { data: null, error: { code: 'NETWORK', message: 'Acknowledgement lost' } };
      }
      return { data: seen.get(id), error: null };
    });
    await mutationQueue.flush();
    expect(applied).toBe(1);
    expect((await offlineDb.mutationQueue.get(first.id))?.status).toBe('pending');
    await offlineLogout();
    await signIn();
    await checkedAdapter();
    io.rpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => ({
      data: seen.get(String(args.p_operation_id)),
      error: null,
    }));
    await mutationQueue.resolveKeepMine(first.id);
    expect(await offlineDb.mutationQueue.get(first.id)).toBeUndefined();
    expect(applied).toBe(1);
    expect(io.rpc.mock.calls[0][1].p_operation_id).toBe(first.id);
  });
});

it('a same-tab deliberate logout is not undone by a later authenticated me response', async () => {
  await signIn();
  await offlineLogout();
  let calls = 0;
  server.use(
    http.get('/api/auth/me', () => {
      calls++;
      return HttpResponse.json({ user: A });
    })
  );
  await useAuthStore.getState().loadUser();
  expect(calls).toBe(0);
  expect(useAuthStore.getState().user).toBeNull();
  expect(isAuthed()).toBe(false);
  await signIn();
  expect(useAuthStore.getState().user?.id).toBe(A.id);
});
