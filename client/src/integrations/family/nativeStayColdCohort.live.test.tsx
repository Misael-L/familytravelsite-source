import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cleanup, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { bypass } from 'msw';
import { readFileSync } from 'node:fs';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { fireEvent, render, screen } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api from '../../api/client';
import { offlineDb, reopenAnonymous, reopenForUser } from '../../db/offlineDb';
import { currentPlannerReadPort } from '../../repo/plannerReadPort';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { clearSignedOut } from '../../utils/signedOut';
import { FamilyPlannerReadProblem } from './FamilyPlannerReadProblem';
import { NativeStayCommandSession } from './nativeStayCommandSession';
import type { NativeStayEnvelope } from './nativeStayContract';
import * as nativeQueue from './nativeStayIntentQueue';
import { originalNativeStayCohort } from './nativeStayObservation';
import { createNativeStayTransport } from './nativeStayTransport';
import { currentOfflineTripSession } from './offlineTripSession';
import { currentPlannerBoundaryOwner } from './plannerBoundaryOwner';
import { plannerCacheDb } from './plannerCache';
import { createFamilyPlannerCohort } from './plannerCohort';
import { familyAuthStore, FamilyFrontendRepository } from './repository';
import { prepareStayBundleIntent } from './stayBundleContract';
import { createStayBundleTransport } from './stayBundleTransport';
import { stayScope } from './stayContract';
function required<T>(v: T | null | undefined): T {
  if (v == null) throw new Error('Missing native fixture observation');
  return v;
}
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
  fixtures: { kind: string; trip_id: string; stay_id: string; location_id: string; booking_id: string }[];
};
const file = process.env.FAMILY_NATIVE_STAY_COLD_FIXTURE;
if (file && file !== '/private/tmp/trek-u05b2b3c5-cold-20261114/sdk-fixture-private.json')
  throw Error('Explicit owned fixture required');
const live = file ? (JSON.parse(readFileSync(file, 'utf8')) as Fixture) : null;
if (live && live.api !== 'http://127.0.0.1:57171') throw Error('Explicit isolated loopback fixture required');
const f = () => {
  if (!live) throw Error('Missing local-only fixture');
  return live;
};
let sdk: SupabaseClient, repo: FamilyFrontendRepository;
let actorPerson: string, actorFamily: string;
let fixtureIndex = 0;
const previous = api.defaults.adapter;
let source: string, failure: string, holdRoute: string, entered: boolean, executions: number, lose: boolean;
let finish: (() => void) | undefined;
let held: Promise<void> = Promise.resolve();
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => source ?? 'http://127.0.0.1:57171' }));
function client(fresh = false, bad = false) {
  const key = 'native-cohort-' + crypto.randomUUID(),
    original = fresh ? f().fresh_access_token : f().access_token;
  const token = bad ? original.slice(0, -2) + 'XX' : original;
  const memory = new Map([
    [
      key,
      JSON.stringify({
        access_token: token,
        refresh_token: 'synthetic-refresh-not-used',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Date.now() / 1000 + 1800,
        user: {
          id: f().user_id,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'coherent@fixture.invalid',
          app_metadata: {},
          user_metadata: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      }),
    ],
  ]);
  return createClient(f().api, f().anon_key, {
    global: {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        if (!request.url.startsWith(f().api + '/')) throw Error('Nonlocal fixture refused');
        const execute = request.url.endsWith('/rpc/execute_family_native_stay_v1');
        if (execute) executions++;
        if (holdRoute && request.url.includes(holdRoute)) {
          entered = true;
          await held;
        }
        if (failure && request.url.includes(failure))
          return new Response(JSON.stringify({ code: '42501', message: 'Required read deliberately refused' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          });
        const response = await fetch(bypass(request));
        if (lose && execute) {
          expect(response.status).toBe(200);
          lose = false;
          throw new TypeError('Lost committed reply');
        }
        return response;
      },
    },
    auth: {
      storageKey: key,
      storage: {
        getItem: (k) => memory.get(k) ?? null,
        setItem: (k, v) => {
          memory.set(k, v);
        },
        removeItem: (k) => {
          memory.delete(k);
        },
      },
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
function scenario(kind: string) {
  const row = f().fixtures.find((r) => r.kind === kind);
  if (!row) throw Error('Missing synthetic scenario');
  const native = repo.knownViews()?.ids.register('trip', row.trip_id);
  useTripStore.setState({ trip: { id: native } as never });
  return row;
}

let cohort: ReturnType<typeof createFamilyPlannerCohort>, release: (() => void) | undefined;
const oldFamily = familyAuthStore.getState();
describe.skipIf(!live)('actual cold original-command recovery through the native cohort', () => {
  beforeEach(async () => {
    resetAllStores();
    _resetNetworkMode();
    setAuthed(true);
    clearSignedOut();
    vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', 'local-native-v1');
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    source = f().api;
    actorPerson = f().person_id;
    actorFamily = f().family_id;
    failure = '';
    holdRoute = '';
    entered = false;
    executions = 0;
    lose = false;
    installTestLocks();
    sdk = client();
    const initialized = await sdk.auth.getSession();
    if (initialized.error || !initialized.data.session)
      throw new Error('Signed synthetic SDK session failed to initialize');
    const s = f();
    repo = new FamilyFrontendRepository(
      async () => ({
        userId: s.user_id,
        personId: actorPerson,
        familyId: actorFamily,
        user: { username: 'Local', email: 'native@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
      }),
      undefined,
      () => ({ userId: s.user_id, familyId: actorFamily, personId: actorPerson, source })
    );
    await repo.session();
    const ids = (await repo.views()).ids,
      person = ids.register('person', s.person_id);
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
      authUserId: s.user_id,
      familyId: actorFamily,
      personId: actorPerson,
      authGate: 'ok',
      authCheckFailed: false,
    });
    cohort = createFamilyPlannerCohort(repo, { source: () => source, reportError: () => {} });
    release = cohort.install();
  });
  afterEach(async () => {
    finish?.();
    finish = undefined;
    cleanup();
    currentOfflineTripSession()?.dispose();
    release?.();
    release = undefined;
    api.defaults.adapter = previous;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    _resetNetworkMode();
    setAuthed(false);
    familyAuthStore.setState(oldFamily, true);
    await resetOfflineTestDatabase();
    await reopenAnonymous();
  });

  it('recovers a committed retained save with null selection and real complete native/cache publication', async () => {
    const p = await pending('committed'),
      original = required(await retained(p));
    const { problem, recovery } = await cold(p);
    const inspector = required(await recovery.inspect());
    expect(useTripStore.getState().trip).toBeNull();
    expect(await inspector.check()).toBe('committed');
    expectComplete(p);
    expect(await retained(p)).toBeUndefined();
    expect(executions).toBe(1);
    expect(original.body).toEqual(p);
    expect(currentPlannerBoundaryOwner()?.getProblem()).toBeNull();
    await expect(problem.retry()).rejects.toBeDefined();
    await expect(inspector.retry()).rejects.toBeDefined();
  }, 30000);
  it('unknown remains intact after actual IndexedDB reopen, then retries the exact original once', async () => {
    const p = await pending('unknown'),
      row = await retained(p);
    offlineDb.close();
    await offlineDb.open();
    await mutationQueue.flush();
    expect(await retained(p)).toEqual(row);
    expect(executions).toBe(0);
    const { recovery } = await cold(p),
      inspector = required(await recovery.inspect());
    expect(await inspector.check()).toBe('unknown');
    expect(await retained(p)).toEqual(row);
    expect(useTripStore.getState().trip).toBeNull();
    expect(await inspector.retry()).toBe('committed');
    expectComplete(p);
    expect(executions).toBe(1);
    expect(await retained(p)).toBeUndefined();
  }, 30000);
  it('a lost real committed reply recovers cold without a second execution', async () => {
    const p = await pending('lost'),
      { recovery } = await cold(p);
    expect(await required(await recovery.inspect()).retry()).toBe('committed');
    expectComplete(p);
    expect(executions).toBe(1);
    expect(await retained(p)).toBeUndefined();
  }, 30000);
  it('fresh same-actor login discovers and publishes an old committed save without rebinding it', async () => {
    const p = await pending('committed');
    sdk = client(true);
    await sdk.auth.getSession();
    const { recovery } = await cold(p),
      inspector = required(await recovery.inspect());
    expect(inspector.intent).toBe('cancel-command');
    expect(await inspector.check()).toBe('committed');
    expectComplete(p);
    expect(executions).toBe(1);
    expect(await retained(p)).toBeUndefined();
  }, 30000);
  it('fresh login cancels an unknown original and ordinary Retry reads only after cancellation', async () => {
    const p = await pending('unknown');
    sdk = client(true);
    await sdk.auth.getSession();
    const { problem, recovery } = await cold(p),
      inspector = required(await recovery.inspect());
    expect(await inspector.check()).toBe('unknown');
    expect(await inspector.retry()).toBe('cancelled');
    expect(executions).toBe(0);
    expect(await retained(p)).toBeUndefined();
    expect(useTripStore.getState().trip).toBeNull();
    await problem.retry();
    expect(useTripStore.getState().trip).not.toBeNull();
  }, 30000);
  it.each(['/rpc/get_family_trip_tasks_v1', '/rpc/get_family_trip_packing_with_categories_v2', '/trip_expenses?'])(
    'refused real ancillary %s leaves the cold original and failure usable for retry',
    async (route) => {
      const p = await pending('committed'),
        { problem, recovery } = await cold(p),
        inspector = required(await recovery.inspect()),
        row = await retained(p);
      failure = route;
      await expect(inspector.check()).rejects.toBeDefined();
      expect(await retained(p)).toEqual(row);
      expect(useTripStore.getState().trip).toBeNull();
      expect(problem.current()).toBe(true);
      failure = '';
      expect(await inspector.check()).toBe('committed');
      expectComplete(p);
      expect(executions).toBe(1);
    },
    30000
  );
  it('does not publish or acknowledge during held ancillary loading; ordinary same-Trip reads refuse', async () => {
    const p = await pending('committed'),
      { recovery } = await cold(p),
      inspector = required(await recovery.inspect());
    hold('/rpc/get_family_trip_tasks_v1');
    const run = inspector.check();
    await waitFor(() => expect(entered).toBe(true));
    expect(useTripStore.getState().trip).toBeNull();
    expect(await retained(p)).toBeDefined();
    await expect(cohort.loadTrip(p.command.scope.trip_id)).rejects.toMatchObject({ code: 'planner_local_work' });
    expect(await retained(p)).toBeDefined();
    finish?.();
    expect(await run).toBe('committed');
    expectComplete(p);
  }, 30000);
  it.each(['source', 'person', 'family', 'layerABA', 'logout', 'dispose', 'selection', 'queueMetadata', 'localEdit'])(
    '%s changes while cold data is loading retire the result and preserve the command',
    async (change) => {
      const p = await pending('committed'),
        { recovery } = await cold(p),
        inspector = required(await recovery.inspect());
      hold('/rpc/get_family_trip_tasks_v1');
      const run = inspector.check().catch((e) => e);
      await waitFor(() => expect(entered).toBe(true));
      if (change === 'source') source = 'http://127.0.0.1:57172';
      if (change === 'person') {
        actorPerson = crypto.randomUUID();
        repo.clear();
      }
      if (change === 'family') {
        actorFamily = crypto.randomUUID();
        repo.clear();
      }
      if (change === 'layerABA') {
        repo.setLayer(p.command.scope.trip_id, 'myDraft');
        repo.setLayer(p.command.scope.trip_id, 'published');
      }
      if (change === 'logout') setAuthed(false);
      if (change === 'dispose') {
        release?.();
        release = undefined;
      }
      if (change === 'selection') useTripStore.setState({ trip: { id: 999999 } as never });
      if (change === 'queueMetadata') {
        const row = required(await retained(p));
        await offlineDb.mutationQueue.put({ ...row, retryAfter: undefined });
      }
      if (change === 'localEdit') useTripStore.setState({ todoItems: [...useTripStore.getState().todoItems] });
      finish?.();
      expect(await run).toBeInstanceOf(Error);
      expect(await retained(p)).toBeDefined();
      if (change === 'selection') expect(useTripStore.getState().trip?.id).toBe(999999);
      else expect(useTripStore.getState().trip).toBeNull();
      expect(currentPlannerBoundaryOwner()?.get() ?? null).toBeNull();
    },
    30000
  );
  it('a newer different-Trip failure cannot be cleared by an older recovery', async () => {
    const p = await pending('committed'),
      { recovery } = await cold(p),
      inspector = required(await recovery.inspect());
    hold('/rpc/get_family_trip_tasks_v1');
    const run = inspector.check().catch((e) => e);
    await waitFor(() => expect(entered).toBe(true));
    const other = required(f().fixtures.find((x) => x.kind === 'midnight'));
    const newer = cohort.loadTrip(other.trip_id).catch((e) => e);
    finish?.();
    await newer;
    expect(await run).toBeInstanceOf(Error);
    expect(await retained(p)).toBeDefined();
    expect(useTripStore.getState().trip?.id).toBe(required(repo.knownViews()).ids.register('trip', other.trip_id));
  }, 30000);
  it('simultaneous inspectors publish once and a stale inspector cannot execute again', async () => {
    const p = await pending('committed'),
      { recovery } = await cold(p),
      a = required(await recovery.inspect()),
      b = required(await recovery.inspect());
    const results = await Promise.allSettled([a.check(), b.check()]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expectComplete(p);
    expect(await retained(p)).toBeUndefined();
    expect(executions).toBe(1);
  }, 30000);

  it('a still-visible warm Trip uses the same prepared recovery without remounting it', async () => {
    const p = await pending('committed');
    const before = useTripStore.getState(),
      mounts: boolean[] = [];
    const stop = useTripStore.subscribe((s) => mounts.push(s.isLoading));
    await expect(cohort.loadTrip(p.command.scope.trip_id)).rejects.toMatchObject({ code: 'planner_local_work' });
    const inspector = required(await required(currentPlannerBoundaryOwner()?.getProblem()?.taskRecovery).inspect());
    expect(await inspector.check()).toBe('committed');
    stop();
    expectComplete(p);
    expect(mounts).not.toContain(true);
    expect(useTripStore.getState().trip?.id).toBe(before.trip?.id);
  }, 30000);
  it('late metadata-CAS failure pauses the published cohort and retains the changed row for a fresh inspector', async () => {
    const p = await pending('committed'),
      { recovery } = await cold(p);
    const acknowledge = nativeQueue.acknowledgeNativeStayIntent;
    vi.spyOn(nativeQueue, 'acknowledgeNativeStayIntent').mockImplementationOnce(async (...args) => {
      const row = required(await retained(p));
      await offlineDb.mutationQueue.put({ ...row, retryAfter: undefined });
      return acknowledge(...args);
    });
    const inspector = required(await recovery.inspect());
    await expect(inspector.check()).rejects.toBeDefined();
    expect(await retained(p)).toBeDefined();
    expect(currentPlannerBoundaryOwner()?.get()).toBeNull();
    expect(currentPlannerReadPort()?.currentStays?.(required(useTripStore.getState().trip).id)).toBeUndefined();
    expect(await plannerCacheDb.completeHeads.count()).toBe(0);
    expect(await required(await recovery.inspect()).check()).toBe('committed');
    expectComplete(p);
    expect(executions).toBe(1);
  }, 30000);
  it.each(['desktop', 'phone'])(
    'the actual %s recovery control clears only after paired publication and acknowledgement',
    async (profile) => {
      Object.defineProperty(window, 'innerWidth', { value: profile === 'phone' ? 390 : 1440, configurable: true });
      const p = await pending('committed'),
        { problem } = await cold(p),
        owner = required(currentPlannerBoundaryOwner()),
        native = required(repo.knownViews()).ids.register('trip', p.command.scope.trip_id);
      render(
        <Routes>
          <Route path="/trips/:id" element={<FamilyPlannerReadProblem owner={owner} />} />
        </Routes>,
        { initialEntries: ['/trips/' + native] }
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Check retained stay save' }));
      await waitFor(() => expect(useTripStore.getState().trip?.id).toBe(native));
      await waitFor(() => expect(owner.getProblem()).toBeNull());
      expectComplete(p);
      expect(await retained(p)).toBeUndefined();
      expect(problem.current()).toBe(false);
    },
    30000
  );
});
async function pending(kind: 'committed' | 'unknown' | 'lost') {
  const p = await packet();
  if (kind === 'unknown') setForcedOffline(true);
  if (kind === 'lost') lose = true;
  await expect(
    new NativeStayCommandSession(repo, { source: () => source, disposed: () => false }, p).submit()
  ).rejects.toBeDefined();
  setForcedOffline(false);
  expect(await retained(p)).toBeDefined();
  return p;
}
async function cold(p: NativeStayEnvelope) {
  useTripStore.getState().resetTrip();
  await expect(cohort.loadTrip(p.command.scope.trip_id)).rejects.toMatchObject({ code: 'planner_local_work' });
  const problem = required(currentPlannerBoundaryOwner()?.getProblem()),
    recovery = required(problem.taskRecovery);
  return { problem, recovery };
}
function expectComplete(p: NativeStayEnvelope) {
  const state = useTripStore.getState(),
    ids = required(repo.knownViews()).ids;
  expect(state.trip?.id).toBe(ids.register('trip', p.command.scope.trip_id));
  expect(state.error).toBeNull();
  expect(state.todoItems.map((x) => x.name)).toContain('Native task');
  expect(state.packingItems.map((x) => x.name)).toContain('Native packing item');
  const paired = required(currentPlannerReadPort()?.currentStays?.(required(state.trip).id));
  expect(paired.reservations).toBe(state.reservations);
  expect(paired.accommodations.some((x) => x.id === ids.register('stay', p.command.stay_id))).toBe(true);
  expect(currentPlannerBoundaryOwner()?.get()).not.toBeNull();
}
function hold(route: string) {
  holdRoute = route;
  entered = false;
  held = new Promise<void>((resolve) => {
    finish = resolve;
  });
}
async function packet(kind = 'cohort_' + fixtureIndex++): Promise<NativeStayEnvelope> {
  const row = scenario(kind);
  await cohort.loadTrip(row.trip_id);
  const paired = required(currentPlannerReadPort()?.currentStays?.(required(useTripStore.getState().trip).id));
  const core = required(originalNativeStayCohort(paired.accommodations)).core;
  const scope = stayScope.parse({
    version: 1,
    layer: 'published',
    trip_id: row.trip_id,
    family_id: f().family_id,
    user_id: f().user_id,
    person_id: f().person_id,
    session_id: f().session_id,
  });
  const stay_id = crypto.randomUUID(),
    reservation_id = crypto.randomUUID();
  const context = await createStayBundleTransport().context(scope, {
    p_location_id: row.location_id,
    p_arrival_day_id: core.days[0].id,
    p_departure_day_id: core.days[core.days.length - 1].id,
    p_stay_id: stay_id,
    p_reservation_id: reservation_id,
  });
  const inner = prepareStayBundleIntent({
    source_url: source,
    context,
    stay_id,
    reservation_id,
    operation_id: crypto.randomUUID(),
    stay: {
      location_id: row.location_id,
      arrival_date: context.observation.arrival_day.civil_day,
      departure_date: context.observation.departure_day.civil_day,
    },
    reservation: { title: 'Real native cohort lodging', status: 'pending' },
  });
  return createNativeStayTransport().context(source, inner.command, crypto.randomUUID());
}
const retained = (p: NativeStayEnvelope) => offlineDb.mutationQueue.get(p.command.operation_id);
