import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { bypass } from 'msw';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api from '../../api/client';
import { useTripStays } from '../../components/Planner/useTripStays';
import { offlineDb, reopenAnonymous, reopenForUser } from '../../db/offlineDb';
import { currentPlannerReadPort } from '../../repo/plannerReadPort';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode } from '../../sync/networkMode';
import { captureWriteSession } from '../../sync/writeSession';
import { clearSignedOut } from '../../utils/signedOut';
import { createNativeStayReader } from './bookingStayRead';
import { NativeStayCommandSession, type NativeStaySessionEnvironment } from './nativeStayCommandSession';
import type { NativeStayEnvelope } from './nativeStayContract';
import { originalNativeStayCohort } from './nativeStayObservation';
import { createNativeStayTransport } from './nativeStayTransport';
import { currentOfflineTripSession } from './offlineTripSession';
import { currentPlannerBoundaryOwner } from './plannerBoundaryOwner';
import { plannerCacheDb } from './plannerCache';
import { createFamilyPlannerCohort } from './plannerCohort';
import { createOriginalStayReadGuard } from './plannerReadGuard';
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
const file = process.env.FAMILY_NATIVE_STAY_COHORT_FIXTURE;
if (file && file !== '/private/tmp/trek-u05b2b3c5-cohort-20261114/sdk-fixture-private.json')
  throw Error('Explicit owned fixture required');
const live = file ? (JSON.parse(readFileSync(file, 'utf8')) as Fixture) : null;
if (live && live.api !== 'http://127.0.0.1:57171') throw Error('Explicit isolated loopback fixture required');
const f = () => {
  if (!live) throw Error('Missing local-only fixture');
  return live;
};
let sdk: SupabaseClient, repo: FamilyFrontendRepository;
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
describe.skipIf(!live)('actual native cohort with signed core and real ancillary SDK loaders', () => {
  beforeEach(async () => {
    resetAllStores();
    _resetNetworkMode();
    setAuthed(true);
    clearSignedOut();
    vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', 'local-native-v1');
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    source = f().api;
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
        personId: s.person_id,
        familyId: s.family_id,
        user: { username: 'Local', email: 'native@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
      }),
      undefined,
      () => ({ userId: s.user_id, familyId: s.family_id, personId: s.person_id, source })
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
      familyId: s.family_id,
      personId: s.person_id,
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

  it.each(['base', 'midnight', 'repeated', 'retained'])(
    'loads %s through the actual ownership-aware core and real ancillary loaders',
    async (kind) => {
      const row = scenario(kind),
        calls = vi.spyOn(sdk, 'rpc'),
        tables = vi.spyOn(sdk, 'from');
      await cohort.loadTrip(row.trip_id);
      expect(calls.mock.calls.filter(([n]) => n === 'get_family_native_stay_view_v1')).toHaveLength(1);
      expect(
        calls.mock.calls.some(([n]) =>
          ['get_family_trip_booking_view_v1', 'get_family_trip_booking_view_v2'].includes(n)
        )
      ).toBe(false);
      expect(tables.mock.calls.map(([n]) => n)).toEqual(
        expect.arrayContaining([
          'trips',
          'trip_expenses',
          'trip_files',
          'trip_travelers',
          'trip_expense_shares',
          'trip_expense_payers',
        ])
      );
      const state = useTripStore.getState();
      expect(state.todoItems.map((x) => x.name)).toContain('Native task');
      expect(state.packingItems.map((x) => x.name)).toContain('Native packing item');
      expect(state.files).toHaveLength(1);
      expect(state.budgetItems).toHaveLength(1);
      const paired = required(currentPlannerReadPort()?.currentStays?.(required(state.trip).id));
      expect(paired.reservations).toBe(state.reservations);
      const witness = required(originalNativeStayCohort(paired.accommodations));
      expect(witness.core.trip_id).toBe(row.trip_id);
      await witness.fence();
      const saved = (await plannerCacheDb.completeSnapshots.toArray())[0].value;
      expect(saved.format).toBe('family.offline-trip.v4');
      if (saved.format !== 'family.offline-trip.v4') throw Error();
      expect(saved.data.native_stay_format).toBe('family.native-stay-view.v1');
    }
  );
  it.each(['overnight', 'off_calendar'])('continues to refuse unqualified %s native display', async (kind) => {
    await expect(cohort.loadTrip(scenario(kind).trip_id)).rejects.toMatchObject({
      code: 'native_stay_unrepresentable',
    });
    expect(await plannerCacheDb.completeHeads.count()).toBe(0);
  });
  it('keeps the actual queue row until the real complete native publication, without nesting a lock', async () => {
    const p = await packet();
    const before = useTripStore.getState();
    const result = await channel(p, async (current, guard) => {
      expect(await retained(p)).toBeDefined();
      await cohort.hydrateNativeStay(current, guard);
      expect(await retained(p)).toBeDefined();
      const state = useTripStore.getState();
      expect(state).not.toBe(before);
      expect(currentPlannerBoundaryOwner()?.get()).not.toBeNull();
      const paired = required(currentPlannerReadPort()?.currentStays?.(required(state.trip).id));
      const ids = required(repo.knownViews()).ids;
      expect(paired.accommodations.some((x) => x.id === ids.register('stay', p.command.stay_id))).toBe(true);
      expect(
        state.days
          .flatMap((d) => d.assignments ?? [])
          .some((a) => a.accommodation_id === ids.register('stay', p.command.stay_id))
      ).toBe(true);
      const saved = (await plannerCacheDb.completeSnapshots.toArray()).find((x) => x.id === paired.generation);
      expect(saved).toBeDefined();
      expect(state.todoItems.map((x) => x.name)).toContain('Native task');
      expect(state.packingItems.map((x) => x.name)).toContain('Native packing item');
    }).submit();
    expect(result.status).toBe('committed');
    expect(await retained(p)).toBeUndefined();
    expect(executions).toBe(1);
  }, 30000);
  it.each(['/rpc/get_family_trip_tasks_v1', '/rpc/get_family_trip_packing_with_categories_v2', '/trip_expenses?'])(
    'retains a committed save when real ancillary %s fails, then refreshes without reexecuting',
    async (route) => {
      const p = await packet(),
        before = useTripStore.getState();
      failure = route;
      const c = channel(p);
      await expect(c.submit()).rejects.toBeDefined();
      expect(await retained(p)).toBeDefined();
      expect(useTripStore.getState().places).toBe(before.places);
      failure = '';
      expect((await c.reconcile()).status).toBe('committed');
      expect(await retained(p)).toBeUndefined();
      expect(executions).toBe(1);
    },
    30000
  );
  it('reconciles a genuinely lost committed HTTP reply into the actual full cohort', async () => {
    const p = await packet(),
      c = channel(p);
    lose = true;
    await expect(c.submit()).rejects.toBeDefined();
    expect(await retained(p)).toBeDefined();
    expect((await c.reconcile()).status).toBe('committed');
    expect(executions).toBe(1);
    expect(await retained(p)).toBeUndefined();
  }, 30000);
  it('ordinary hydration cannot join the privileged refresh while its original row is retained', async () => {
    const p = await packet();
    hold('/rpc/get_family_trip_tasks_v1');
    const save = channel(p).submit();
    await waitFor(() => expect(entered).toBe(true));
    await expect(useTripStore.getState().hydrateActiveTrip(p.command.scope.trip_id)).rejects.toMatchObject({
      code: 'planner_local_work',
    });
    expect(await retained(p)).toBeDefined();
    finish?.();
    expect((await save).status).toBe('committed');
  }, 30000);
  it('a local edit during real ancillary loading preserves the draft and withdraws the rejected cache generation', async () => {
    const p = await packet();
    hold('/rpc/get_family_trip_tasks_v1');
    const save = channel(p)
      .submit()
      .catch((e) => e);
    await waitFor(() => expect(entered).toBe(true));
    const draft = [...useTripStore.getState().todoItems];
    useTripStore.setState({ todoItems: draft });
    finish?.();
    expect(await save).toMatchObject({ code: 'planner_local_work' });
    expect(useTripStore.getState().todoItems).toBe(draft);
    expect(await retained(p)).toBeDefined();
    expect(await plannerCacheDb.completeHeads.count()).toBe(0);
    expect(currentPlannerBoundaryOwner()?.get()).toBeNull();
  }, 30000);
  it.each(['source', 'layer', 'logout', 'dispose', 'queueMetadata'])(
    'retires real refresh on %s change and preserves the original command',
    async (change) => {
      const p = await packet(),
        before = useTripStore.getState();
      hold('/rpc/get_family_trip_tasks_v1');
      const save = channel(p)
        .submit()
        .catch((e) => e);
      await waitFor(() => expect(entered).toBe(true));
      if (change === 'source') source = 'http://127.0.0.1:57172';
      if (change === 'layer') repo.setLayer(p.command.scope.trip_id, 'myDraft');
      if (change === 'logout') setAuthed(false);
      if (change === 'dispose') {
        release?.();
        release = undefined;
      }
      if (change === 'queueMetadata') {
        const row = required(await retained(p));
        await offlineDb.mutationQueue.put({ ...row, retryAfter: undefined });
      }
      finish?.();
      expect(await save).toBeInstanceOf(Error);
      expect(await retained(p)).toBeDefined();
      expect(useTripStore.getState().places).toBe(before.places);
    },
    30000
  );

  it('first Add starts from an actually published empty accommodation cohort', async () => {
    const p = await packet('retained');
    const original = required(currentPlannerReadPort()?.currentStays?.(required(useTripStore.getState().trip).id));
    expect(original.accommodations).toEqual([]);
    expect(originalNativeStayCohort(original.accommodations)?.native).toEqual([]);
    expect((await channel(p).submit()).status).toBe('committed');
    const next = required(currentPlannerReadPort()?.currentStays?.(required(useTripStore.getState().trip).id));
    expect(next.accommodations).toHaveLength(1);
    expect(await retained(p)).toBeUndefined();
  });
  it('a second stay reuses the existing arrival without claiming or replacing its identity', async () => {
    const kind = 'cohort_' + fixtureIndex++,
      p = await packet(kind);
    await channel(p).submit();
    const prior = await createNativeStayReader(repo)(p.command.scope.trip_id);
    const owned = required(prior.core.planner.state.visits.find((v) => v.owning_stay_id === p.command.stay_id));
    const second = await packet(kind);
    await channel(second).submit();
    const next = await createNativeStayReader(repo)(p.command.scope.trip_id);
    expect(next.core.planner.state.visits.find((v) => v.id === owned.id)).toEqual(owned);
    expect(next.core.planner.state.visits.some((v) => v.owning_stay_id === second.command.stay_id)).toBe(false);
    expect(next.core.stays.filter((s) => [p.command.stay_id, second.command.stay_id].includes(s.stay.id))).toHaveLength(
      2
    );
  });
  it('cold unpublished selection cannot borrow warm completion authority', async () => {
    const p = await packet(),
      current = await createNativeStayReader(repo)(p.command.scope.trip_id);
    const lease = await readLease(p.command.scope.trip_id);
    useTripStore.getState().resetTrip();
    await expect(cohort.hydrateNativeStay(current, lease.guard)).rejects.toMatchObject({ code: 'planner_local_work' });
    lease.close();
    expect(useTripStore.getState().trip).toBeNull();
    expect(executions).toBe(0);
  });
  it('a closed original read lease cannot refresh the cohort', async () => {
    const p = await packet(),
      current = await createNativeStayReader(repo)(p.command.scope.trip_id),
      lease = await readLease(p.command.scope.trip_id);
    lease.close();
    const calls = vi.spyOn(sdk, 'rpc');
    await expect(Promise.resolve().then(() => cohort.hydrateNativeStay(current, lease.guard))).rejects.toThrow(
      'Closed or changed original refresh'
    );
    expect(calls).not.toHaveBeenCalled();
  });
  it('a lease for another Trip cannot refresh even with a valid current view', async () => {
    const p = await packet(),
      current = await createNativeStayReader(repo)(p.command.scope.trip_id),
      other = required(f().fixtures.find((x) => x.kind === 'midnight'));
    const lease = await readLease(other.trip_id),
      calls = vi.spyOn(sdk, 'rpc');
    await expect(Promise.resolve().then(() => cohort.hydrateNativeStay(current, lease.guard))).rejects.toThrow();
    lease.close();
    expect(calls).not.toHaveBeenCalled();
  });
  it('refuses a complete generation older than the acknowledged current revision and retracts only its head', async () => {
    const p = await packet(),
      current = await createNativeStayReader(repo)(p.command.scope.trip_id),
      lease = await readLease(p.command.scope.trip_id),
      before = useTripStore.getState();
    const newer = structuredClone(current);
    newer.core.trip_revision += 100;
    newer.core.planner.state.trip_revision = newer.core.trip_revision;
    await expect(cohort.hydrateNativeStay(newer, lease.guard)).rejects.toMatchObject({ code: 'planner_local_work' });
    lease.close();
    expect(useTripStore.getState().places).toBe(before.places);
    expect(await plannerCacheDb.completeHeads.count()).toBe(0);
  });
  it('qualification ending before refresh refuses without another SQL read', async () => {
    const p = await packet(),
      current = await createNativeStayReader(repo)(p.command.scope.trip_id),
      lease = await readLease(p.command.scope.trip_id),
      calls = vi.spyOn(sdk, 'rpc');
    vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', '');
    await expect(cohort.hydrateNativeStay(current, lease.guard)).rejects.toMatchObject({ code: 'planner_local_work' });
    lease.close();
    expect(calls).not.toHaveBeenCalled();
  });
  it.each(['desktop', 'phone'])('the unchanged %s hook reads the new paired cohort', async (profile) => {
    const p = await packet();
    await channel(p).submit();
    Object.defineProperty(window, 'innerWidth', { value: profile === 'phone' ? 390 : 1440, configurable: true });
    const hook = renderHook(() => useTripStays(required(useTripStore.getState().trip).id));
    await waitFor(() => expect(hook.result.current.tripAccommodations.length).toBeGreaterThan(0));
    hook.unmount();
  });
});
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
const channel = (
  p: NativeStayEnvelope,
  confirmCurrent: NonNullable<NativeStaySessionEnvironment['confirmCurrent']> = cohort.hydrateNativeStay
) => new NativeStayCommandSession(repo, { source: () => source, disposed: () => false, confirmCurrent }, p);

async function readLease(trip: string) {
  return createOriginalStayReadGuard(
    captureWriteSession(),
    { uuid: trip, native: required(repo.knownViews()).ids.register('trip', trip) },
    undefined,
    () => Error('Closed or changed original refresh')
  );
}
