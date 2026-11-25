import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'fake-indexeddb/auto';
import { bypass } from 'msw';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { coherentTripData } from '../../../tests/helpers/familyCompleteTripV4';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import { offlineDb, reopenAnonymous, reopenForUser } from '../../db/offlineDb';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { clearSignedOut } from '../../utils/signedOut';
import { createNativeStayReader } from './bookingStayRead';
import { createCoherentTripCapture } from './coherentTripCapture';
import { NativeStayCommandSession } from './nativeStayCommandSession';
import type { NativeStayEnvelope } from './nativeStayContract';
import type { NativeStayView } from './nativeStayReadContract';
import { createNativeStayTransport } from './nativeStayTransport';
import { plannerCacheDb } from './plannerCache';
import { createPlannerNativeStayRecovery } from './plannerNativeStayRecovery';
import type { PlannerReadGuard } from './plannerReadGuard';
import { FamilyFrontendRepository, familyAuthStore } from './repository';
import { StayBundleCommandSession } from './stayBundleCommandSession';
import { prepareStayBundleIntent, type StayBundleEnvelope } from './stayBundleContract';
import { createStayBundleTransport } from './stayBundleTransport';
import { stayScope } from './stayContract';
import { createStayTransport } from './stayTransport';

type Fixture = {
  api: string;
  anon_key: string;
  access_token: string;
  fresh_access_token: string;
  user_id: string;
  family_id: string;
  person_id: string;
  session_id: string;
  fresh_session_id: string;
  fixtures: { kind: string; trip_id: string; location_id: string }[];
};
const file = process.env.FAMILY_NATIVE_STAY_QUEUE_FIXTURE;
if (file && file !== '/private/tmp/trek-u05b2b3c5-queue-20261114/sdk-fixture-private.json')
  throw Error('Explicit owned local queue fixture required');
const live = file ? (JSON.parse(readFileSync(file, 'utf8')) as Fixture) : null;
if (live && live.api !== 'http://127.0.0.1:57171') throw Error('Hosted queue qualification refused');
const f = () => {
  if (!live) throw Error('Missing local fixture');
  return live;
};
let sdk: SupabaseClient,
  repo: FamilyFrontendRepository,
  source: string,
  disposed: boolean,
  stop: () => void,
  lose: boolean,
  executions: number,
  refreshes: number,
  refreshFailure: boolean;
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => source ?? 'http://127.0.0.1:57171' }));
function client(fresh = false) {
  const token = fresh ? f().fresh_access_token : f().access_token,
    key = 'native-queue-' + crypto.randomUUID();
  const memory = new Map([
    [
      key,
      JSON.stringify({
        access_token: token,
        refresh_token: 'synthetic-not-used',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Date.now() / 1000 + 1800,
        user: {
          id: f().user_id,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'native@fixture.invalid',
          app_metadata: {},
          user_metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      }),
    ],
  ]);
  return createClient(f().api, f().anon_key, {
    auth: {
      storageKey: key,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (k) => memory.get(k) ?? null,
        setItem: (k, v) => {
          memory.set(k, v);
        },
        removeItem: (k) => {
          memory.delete(k);
        },
      },
    },
    global: {
      fetch: async (input, init) => {
        const req = new Request(input, init);
        if (!req.url.startsWith(f().api + '/')) throw Error('Nonlocal test route refused');
        const execute = req.url.endsWith('/rpc/execute_family_native_stay_v1');
        if (execute) executions++;
        const r = await fetch(bypass(req));
        if (lose && execute) {
          expect(r.status).toBe(200);
          lose = false;
          throw new TypeError('Lost committed native queue reply');
        }
        return r;
      },
    },
  });
}
async function raw(name: string, args: Record<string, unknown>) {
  const r = await sdk.rpc(name, args);
  if (r.error) throw r.error;
  return r.data;
}
async function inner(): Promise<StayBundleEnvelope> {
  const q = f().fixtures.find((x) => x.kind === 'base');
  if (!q) throw Error();
  const ids = (await repo.views()).ids;
  useTripStore.setState({ trip: { id: ids.register('trip', q.trip_id) } as never });
  const core = await raw('get_family_trip_booking_view_v2', { p_trip_id: q.trip_id }),
    stay_id = crypto.randomUUID(),
    reservation_id = crypto.randomUUID();
  const scope = stayScope.parse({
    version: 1,
    layer: 'published',
    trip_id: q.trip_id,
    family_id: f().family_id,
    user_id: f().user_id,
    person_id: f().person_id,
    session_id: f().session_id,
  });
  const context = await createStayBundleTransport().context(scope, {
    p_location_id: q.location_id,
    p_arrival_day_id: core.days[0].id,
    p_departure_day_id: core.days[core.days.length - 1].id,
    p_stay_id: stay_id,
    p_reservation_id: reservation_id,
  });
  return prepareStayBundleIntent({
    source_url: source,
    context,
    stay_id,
    reservation_id,
    operation_id: crypto.randomUUID(),
    stay: {
      location_id: q.location_id,
      arrival_date: context.observation.arrival_day.civil_day,
      departure_date: context.observation.departure_day.civil_day,
    },
    reservation: { title: 'Actual queued lodging', status: 'pending' },
  });
}
async function packet() {
  const i = await inner();
  return createNativeStayTransport().context(source, i.command, crypto.randomUUID());
}
async function complete(current: NativeStayView, guard: PlannerReadGuard) {
  refreshes++;
  if (refreshFailure) throw Error('Ancillary refresh deliberately unavailable');
  expect(await offlineDb.mutationQueue.count()).toBe(1);
  const capture = createCoherentTripCapture(repo, { source: () => source, nativeRead: createNativeStayReader(repo) });
  const saved = await capture(
    current.core.trip_id,
    async (core) => {
      const { core: _core, ...ancillary } = coherentTripData(core);
      return ancillary;
    },
    undefined,
    guard
  );
  expect(saved.envelope.data.native_stay_format).toBe('family.native-stay-view.v1');
  expect(saved.envelope.data.core.trip_revision).toBeGreaterThanOrEqual(current.core.trip_revision);
  expect(await offlineDb.mutationQueue.count()).toBe(1);
}
const channel = (p: NativeStayEnvelope) =>
  new NativeStayCommandSession(repo, { source: () => source, disposed: () => disposed, confirmCurrent: complete }, p);
const retained = (p: NativeStayEnvelope) => offlineDb.mutationQueue.get(p.command.operation_id);
describe.skipIf(!live)('actual native queue/SDK/RLS/IndexedDB and complete refresh lease', () => {
  beforeEach(async () => {
    resetAllStores();
    _resetNetworkMode();
    clearSignedOut();
    setAuthed(true);
    installTestLocks();
    source = f().api;
    disposed = false;
    lose = false;
    executions = 0;
    refreshes = 0;
    refreshFailure = false;
    vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', 'local-native-v1');
    sdk = client();
    await sdk.auth.getSession();
    repo = new FamilyFrontendRepository(
      async () => ({
        userId: f().user_id,
        familyId: f().family_id,
        personId: f().person_id,
        user: { username: 'Synthetic', email: 'native@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
      }),
      undefined,
      () => ({ userId: f().user_id, familyId: f().family_id, personId: f().person_id, source })
    );
    await repo.session();
    const person = (await repo.views()).ids.register('person', f().person_id);
    await reopenForUser(person);
    await resetOfflineTestDatabase();
    await Promise.all(plannerCacheDb.tables.map((t) => t.clear()));
    useAuthStore.setState({
      user: buildUser({ id: person }),
      isAuthenticated: true,
      isLoading: false,
      authCheckFailed: false,
      loggingOut: false,
    });
    familyAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      authUserId: f().user_id,
      familyId: f().family_id,
      personId: f().person_id,
      authGate: 'ok',
      authCheckFailed: false,
    });
    stop = installFamilyCommandRetention();
  });
  afterEach(async () => {
    stop();
    vi.unstubAllEnvs();
    _resetNetworkMode();
    setAuthed(false);
    await resetOfflineTestDatabase();
    await reopenAnonymous();
  });
  it('actual commit stays queued through the complete owned core/cache refresh then acknowledges once', async () => {
    const p = await packet(),
      before = useTripStore.getState();
    expect((await channel(p).submit()).status).toBe('committed');
    expect(executions).toBe(1);
    expect(refreshes).toBe(1);
    expect(await retained(p)).toBeUndefined();
    expect(await plannerCacheDb.completeSnapshots.count()).toBe(1);
    expect(await offlineDb.accommodations.count()).toBe(0);
    expect(useTripStore.getState()).toBe(before);
  });
  it('offline reopen preserves exact IDs and generic replay does not send or rebind', async () => {
    const p = await packet();
    setForcedOffline(true);
    await expect(channel(p).submit()).rejects.toBeDefined();
    const before = await retained(p);
    offlineDb.close();
    await offlineDb.open();
    setForcedOffline(false);
    await mutationQueue.flush();
    expect(await retained(p)).toEqual(before);
    expect(executions).toBe(0);
    await channel(p).submit();
    expect(executions).toBe(1);
  });
  it('lost real committed reply is reconciled without a second native execution', async () => {
    const p = await packet(),
      c = channel(p);
    lose = true;
    await expect(c.submit()).rejects.toBeDefined();
    expect(lose).toBe(false);
    expect(await retained(p)).toBeDefined();
    await c.reconcile();
    expect(executions).toBe(1);
    expect(await retained(p)).toBeUndefined();
  });
  it('an unavailable ancillary refresh survives reopen and retries reads without another execute', async () => {
    const p = await packet();
    refreshFailure = true;
    await expect(channel(p).submit()).rejects.toThrow('Ancillary');
    expect(await retained(p)).toBeDefined();
    offlineDb.close();
    await offlineDb.open();
    refreshFailure = false;
    await channel(p).reconcile();
    expect(executions).toBe(1);
    expect(await retained(p)).toBeUndefined();
  });
  it('cold fresh login cancels only undecided original work without loading a native Trip', async () => {
    const p = await packet();
    setForcedOffline(true);
    await expect(channel(p).submit()).rejects.toBeDefined();
    setForcedOffline(false);
    sdk = client(true);
    await sdk.auth.getSession();
    useTripStore.setState({ trip: null });
    const recovery = createPlannerNativeStayRecovery(repo, p.command.scope.trip_id, {
      source: () => source,
      current: () => !disposed,
      confirmCurrent: complete,
    });
    const item = await recovery.inspect();
    expect(item?.intent).toBe('cancel-command');
    expect(await item?.check()).toBe('unknown');
    expect(await item?.retry()).toBe('cancelled');
    expect(executions).toBe(0);
    expect(await retained(p)).toBeUndefined();
  });
  it('cold committed recovery after fresh login completes the owned read before clearing', async () => {
    const p = await packet();
    refreshFailure = true;
    await expect(channel(p).submit()).rejects.toThrow('Ancillary');
    sdk = client(true);
    await sdk.auth.getSession();
    useTripStore.setState({ trip: null });
    refreshFailure = false;
    const recovery = createPlannerNativeStayRecovery(repo, p.command.scope.trip_id, {
      source: () => source,
      current: () => !disposed,
      confirmCurrent: complete,
    });
    expect(await (await recovery.inspect())?.check()).toBe('committed');
    expect(executions).toBe(1);
    expect(await retained(p)).toBeUndefined();
    expect(useTripStore.getState().trip).toBeNull();
  });
  it('intentional repeated stays use separate original IDs and remain independent from retries', async () => {
    const a = await packet();
    await channel(a).submit();
    const b = await packet();
    await channel(b).submit();
    expect(a.command.stay_id).not.toBe(b.command.stay_id);
    expect(executions).toBe(2);
    const view = await createNativeStayReader(repo)(a.command.scope.trip_id);
    expect(view.core.stays.some((s) => s.stay.id === a.command.stay_id)).toBe(true);
    expect(view.core.stays.some((s) => s.stay.id === b.command.stay_id)).toBe(true);
  });
  it('queued no-op save and recoverable lifecycle preserve the original arrival and booking', async () => {
    const p = await packet();
    await channel(p).submit();
    const t = createNativeStayTransport(),
      trip = p.command.scope.trip_id;
    const before = await createNativeStayReader(repo)(trip);
    const existing = async (action: 'save' | 'trash' | 'restore') => {
      const ctx = await createStayTransport().context(p.command.scope, p.command.stay_id, null, null);
      return t.context(
        source,
        {
          action,
          operation_id: crypto.randomUUID(),
          stay_id: p.command.stay_id,
          scope: ctx.scope,
          observation: ctx.observation,
          changes: {},
          reservation_id: null,
        },
        crypto.randomUUID()
      );
    };
    await channel(await existing('save')).submit();
    await channel(await existing('trash')).submit();
    expect((await t.trash(trip)).items.some((r) => r.id === p.command.stay_id)).toBe(true);
    await channel(await existing('restore')).submit();
    const after = await createNativeStayReader(repo)(trip);
    expect(after.core.stays.some((s) => s.stay.id === p.command.stay_id)).toBe(true);
    expect(after.core.planner.state.visits.map((v) => v.id).sort()).toEqual(
      before.core.planner.state.visits.map((v) => v.id).sort()
    );
    expect(after.core.bookings.map((b) => b.record)).toEqual(before.core.bookings.map((b) => b.record));
  });
  it('shared C4 engine still commits the original separate bundle dialect through real SDK/RLS', async () => {
    const p = await inner(),
      before = useTripStore.getState();
    expect(
      (await new StayBundleCommandSession(repo, { source: () => source, disposed: () => disposed }, p).submit()).status
    ).toBe('committed');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(await plannerCacheDb.completeSnapshots.count()).toBe(0);
    expect(useTripStore.getState()).toBe(before);
  });
  it('a real source switch during a known commit refresh retains the original queue row', async () => {
    const p = await packet();
    const c = new NativeStayCommandSession(
      repo,
      {
        source: () => source,
        disposed: () => disposed,
        confirmCurrent: async () => {
          source += '/changed';
        },
      },
      p
    );
    await expect(c.submit()).rejects.toBeDefined();
    expect(await retained(p)).toBeDefined();
    expect(executions).toBe(1);
  });
  it('metadata changed across a real successful reply is preserved without acknowledgement', async () => {
    const p = await packet();
    const c = new NativeStayCommandSession(
      repo,
      {
        source: () => source,
        disposed: () => disposed,
        confirmCurrent: async () => {
          const original = await retained(p);
          if (!original) throw new Error('Missing retained intent');
          await offlineDb.mutationQueue.put({ ...original, retryAfter: undefined });
          expect(Object.prototype.hasOwnProperty.call(await retained(p), 'retryAfter')).toBe(true);
        },
      },
      p
    );
    await expect(c.submit()).rejects.toBeDefined();
    expect(await retained(p)).toBeDefined();
    expect(executions).toBe(1);
  });
});
