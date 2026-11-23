import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { bypass } from 'msw';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { buildPlanner, buildShell } from '../../../tests/helpers/mobileTrip';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { fireEvent, render, screen } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api from '../../api/client';
import { useDayDetail, writeStay } from '../../components/Planner/useDayDetail';
import { offlineDb, reopenAnonymous, reopenForUser } from '../../db/offlineDb';
import MAccommodationSheet from '../../mobile/screens/trip/sheets/MAccommodationSheet';
import { accommodationRepo } from '../../repo/accommodationRepo';
import { currentPlannerReadPort } from '../../repo/plannerReadPort';
import { installPlannerStayWritePort } from '../../repo/plannerStayPort';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { clearSignedOut } from '../../utils/signedOut';
import { createNativeStayCreation } from './nativeStayCreation';
import { originalNativeStayCohort } from './nativeStayObservation';
import { currentOfflineTripSession } from './offlineTripSession';
import { currentPlannerBoundaryOwner } from './plannerBoundaryOwner';
import { plannerCacheDb } from './plannerCache';
import { createFamilyPlannerCohort } from './plannerCohort';
import { familyAuthStore, FamilyFrontendRepository } from './repository';
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
const file = process.env.FAMILY_NATIVE_STAY_CREATE_FIXTURE;
if (file && file !== '/private/tmp/trek-u05b2b3c5-create-20261114/sdk-fixture-private.json')
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
let allowed = true,
  disposed = false;
let undoCreation: (() => void) | undefined;
let creation: ReturnType<typeof createNativeStayCreation>;
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
describe.skipIf(!live)('actual native original-cohort creation adapter', () => {
  beforeEach(async () => {
    resetAllStores();
    _resetNetworkMode();
    setAuthed(true);
    clearSignedOut();
    vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', 'local-native-v1');
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    source = f().api;
    allowed = true;
    disposed = false;
    vi.stubEnv('VITE_FAMILY_STAY_CONTROLS_QUALIFICATION', 'local-native-v1');
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
    // This suite installs its own fenced factory; leave combined-port installation to its separate tests.
    vi.stubEnv('VITE_FAMILY_STAY_CONTROLS_QUALIFICATION', '');
    cohort = createFamilyPlannerCohort(repo, { source: () => source, reportError: () => {} });
    release = cohort.install();
    vi.stubEnv('VITE_FAMILY_STAY_CONTROLS_QUALIFICATION', 'local-native-v1');
    creation = createNativeStayCreation(repo, {
      source: () => source,
      disposed: () => disposed,
      allowed: () => allowed,
      confirmCurrent: cohort.hydrateNativeStay,
    });
    undoCreation = installPlannerStayWritePort({
      ...creation,
      update: async () => {
        throw Error('Native existing edit remains gated');
      },
    });
  });
  afterEach(async () => {
    finish?.();
    finish = undefined;
    cleanup();
    undoCreation?.();
    undoCreation = undefined;
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

  it('writes the exact observed native create request and publishes its stay, booking and owned untimed arrival', async () => {
    const { trip, body, rows } = await setup();
    const result = await writeStay(trip, null, body, undefined, rows);
    expect(result.accommodation.id).toBeGreaterThan(0);
    expect(executions).toBe(1);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    const paired = required(currentPlannerReadPort()?.currentStays?.(trip)),
      core = required(originalNativeStayCohort(paired.accommodations)).core,
      ids = required(repo.knownViews()).ids,
      id = ids.uuid('stay', result.accommodation.id);
    expect(core.stays.find((s) => s.stay.id === id)?.link).not.toBeNull();
    expect(core.planner.state.visits.find((v) => v.owning_stay_id === id)).toMatchObject({
      timing_kind: 'untimed',
      starts_at: null,
      ends_at: null,
      time_zone: null,
    });
    expect((await plannerCacheDb.completeHeads.toArray()).some((h) => h.generation === paired.generation)).toBe(true);
  });
  it('uses an actual empty published cohort for first Add', async () => {
    const { trip, body, rows } = await setup('retained');
    expect(rows).toEqual([]);
    await writeStay(trip, null, body, undefined, rows);
    expect(currentPlannerReadPort()?.currentStays?.(trip)?.accommodations).toHaveLength(1);
  });
  it('deliberate repeated creation uses the new observed cohort and preserves the shared arrival identity', async () => {
    const { trip, body, rows } = await setup();
    const first = await writeStay(trip, null, body, undefined, rows);
    const next = required(creation.captureCreation(trip)),
      before = required(originalNativeStayCohort(next)).core;
    const second = await writeStay(trip, null, body, undefined, next);
    expect(second.accommodation.id).not.toBe(first.accommodation.id);
    const after = required(originalNativeStayCohort(required(creation.captureCreation(trip)))).core;
    expect(after.planner.state.visits).toEqual(before.planner.state.visits);
    expect(executions).toBe(2);
  });
  it('coalesces simultaneous native submissions without reallocating IDs', async () => {
    const { trip, body, rows } = await setup();
    const [a, b] = await Promise.all([
      writeStay(trip, null, body, undefined, rows),
      writeStay(trip, null, body, undefined, rows),
    ]);
    expect(a.accommodation.id).toBe(b.accommodation.id);
    expect(executions).toBe(1);
  });
  it('lost committed reply stays bound to the original form/body and retries once', async () => {
    const { trip, body, rows } = await setup();
    lose = true;
    await expect(writeStay(trip, null, body, undefined, rows)).rejects.toBeDefined();
    const original = (await offlineDb.mutationQueue.toArray())[0];
    await expect(writeStay(trip, null, { ...body, confirmation: 'Changed' }, undefined, rows)).rejects.toBeDefined();
    expect((await offlineDb.mutationQueue.toArray())[0]).toEqual(original);
    await writeStay(trip, null, body, undefined, rows);
    expect(executions).toBe(1);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('retains a new offline intent without context RPC and replays its exact bytes online', async () => {
    const { trip, body, rows } = await setup();
    setForcedOffline(true);
    const calls = vi.spyOn(sdk, 'rpc');
    await expect(writeStay(trip, null, body, undefined, rows)).rejects.toMatchObject({ code: 'native_stay_queued' });
    expect(calls).not.toHaveBeenCalled();
    const original = (await offlineDb.mutationQueue.toArray())[0];
    setForcedOffline(false);
    await writeStay(trip, null, body, undefined, rows);
    expect(executions).toBe(1);
    expect(original.body).toBeDefined();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('an offline-created original recovers after the form closes through the existing cold inspector', async () => {
    const { trip, body, rows } = await setup();
    setForcedOffline(true);
    await expect(writeStay(trip, null, body, undefined, rows)).rejects.toMatchObject({ code: 'native_stay_queued' });
    const original = (await offlineDb.mutationQueue.toArray())[0];
    undoCreation?.();
    undoCreation = undefined;
    useTripStore.getState().resetTrip();
    setForcedOffline(false);
    await expect(cohort.loadTrip(trip)).rejects.toMatchObject({ code: 'planner_local_work' });
    const recovery = required(currentPlannerBoundaryOwner()?.getProblem()?.taskRecovery),
      inspector = required(await recovery.inspect());
    expect(await inspector.check()).toBe('unknown');
    expect((await offlineDb.mutationQueue.toArray())[0]).toEqual(original);
    expect(await inspector.retry()).toBe('committed');
    expect(executions).toBe(1);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(useTripStore.getState().trip?.id).toBe(trip);
  });
  it('accepts an identically revalidated cohort without replacing the original observation', async () => {
    const { trip, body, rows } = await setup();
    await cohort.loadTrip(trip);
    expect(currentPlannerReadPort()?.currentStays?.(trip)?.accommodations).not.toBe(rows);
    await writeStay(trip, null, body, undefined, rows);
    expect(executions).toBe(1);
  });
  it('an edited replacement cohort cannot borrow the old form observation', async () => {
    const { trip, body, rows } = await setup();
    await cohort.loadTrip(trip);
    const current = required(creation.captureCreation(trip));
    current[0].notes = 'Unconfirmed local lodging edit';
    const calls = vi.spyOn(sdk, 'rpc');
    await expect(writeStay(trip, null, body, undefined, rows)).rejects.toBeDefined();
    expect(calls).not.toHaveBeenCalled();
    expect(current[0].notes).toBe('Unconfirmed local lodging edit');
  });
  it('a changed canonical observation is not silently rebased', async () => {
    const { trip, body, rows } = await setup();
    await writeStay(trip, null, body, undefined, rows);
    await expect(writeStay(trip, null, body, undefined, rows)).rejects.toBeDefined();
    expect(executions).toBe(1);
  });
  it('requires the original form witness, never a cloned array of matching rows', async () => {
    const { trip, body, rows } = await setup();
    await expect(writeStay(trip, null, body, undefined, structuredClone(rows))).rejects.toBeDefined();
    expect(executions).toBe(0);
  });
  it('requires current Direct creation permission before retaining or calling SQL', async () => {
    const { trip, body, rows } = await setup();
    allowed = false;
    const calls = vi.spyOn(sdk, 'rpc');
    await expect(writeStay(trip, null, body, undefined, rows)).rejects.toBeDefined();
    expect(calls).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it.each(['source', 'permission', 'dispose', 'layer'])(
    'a delayed %s change cannot prepare/retain another actor or context',
    async (change) => {
      const { trip, body, rows } = await setup();
      hold('/rpc/get_family_stay_bundle_context_v1');
      const run = writeStay(trip, null, body, undefined, rows).catch((e) => e);
      await waitFor(() => expect(entered).toBe(true));
      if (change === 'source') source = 'http://127.0.0.1:57172';
      if (change === 'permission') allowed = false;
      if (change === 'dispose') disposed = true;
      if (change === 'layer') repo.setLayer(required(repo.knownViews()).ids.uuid('trip', trip), 'myDraft');
      finish?.();
      expect(await run).toBeInstanceOf(Error);
      expect(executions).toBe(0);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
  it('the native desktop hook keeps form context and sends original creation through the repository port', async () => {
    const { trip, body } = await setup();
    const state = useTripStore.getState();
    const hook = renderHook(() => useDayDetail(state.days[0], useTripStore.getState().days, trip, null, null, 'en'));
    await waitFor(() => expect(hook.result.current.accommodations.length).toBeGreaterThan(0));
    act(() => hook.result.current.setShowHotelPicker(true));
    act(() => {
      hook.result.current.setHotelForm({
        place_id: body.place_id,
        check_in: '',
        check_in_end: '',
        check_out: '',
        confirmation: '',
      });
      hook.result.current.setHotelDayRange({ start: body.start_day_id, end: body.end_day_id });
    });
    await act(async () => hook.result.current.handleSaveAccommodation());
    expect(executions).toBe(1);
    expect(hook.result.current.showHotelPicker).toBe(false);
    hook.unmount();
  });
  it.each([false, true])(
    'the actual phone Add form keeps original context and confirms one save (lost=%s)',
    async (lost) => {
      const { trip, body } = await setup();
      const state = useTripStore.getState(),
        paired = required(currentPlannerReadPort()?.currentStays?.(trip));
      const planner = buildPlanner({
        tripId: trip,
        trip: state.trip,
        days: state.days,
        places: state.places,
        categories: state.categories,
        tripAccommodations: paired.accommodations,
      });
      const shell = buildShell({ sheet: { id: 'accommodation', payload: { dayId: state.days[0].id } } });
      render(<MAccommodationSheet planner={planner} shell={shell} />);
      const name = required(state.places.find((p) => p.id === body.place_id)).name;
      fireEvent.click(screen.getByText(name));
      lose = lost;
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      if (lost) {
        await waitFor(() => expect(planner.toast.error).toHaveBeenCalled());
        expect(shell.openSheet).not.toHaveBeenCalled();
        expect(await offlineDb.mutationQueue.count()).toBe(1);
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      }
      await waitFor(() => expect(shell.openSheet).toHaveBeenCalled());
      expect(executions).toBe(1);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
  it('normal Add and removal stay unavailable when this candidate is not installed', async () => {
    const { trip, body } = await setup();
    undoCreation?.();
    undoCreation = undefined;
    const calls = vi.spyOn(sdk, 'rpc');
    await expect(accommodationRepo.create(trip, body)).rejects.toThrow('not connected');
    await expect(accommodationRepo.delete(trip, 1)).rejects.toThrow('not connected');
    expect(calls).not.toHaveBeenCalled();
  });
  it('staged imports refuse new creation before any context RPC or retained entry', async () => {
    const { trip, body, rows } = await setup();
    await offlineDb.importFiles.put({ jobId: 'pending', fileName: 'synthetic.txt', createdAt: Date.now() } as never);
    const calls = vi.spyOn(sdk, 'rpc');
    await expect(writeStay(trip, null, body, undefined, rows)).rejects.toThrow('imports');
    expect(calls).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
});
function hold(route: string) {
  holdRoute = route;
  entered = false;
  held = new Promise<void>((resolve) => {
    finish = resolve;
  });
}
async function setup(kind = 'cohort_' + fixtureIndex++) {
  const row = scenario(kind);
  await cohort.loadTrip(row.trip_id);
  const state = useTripStore.getState(),
    ids = required(repo.knownViews()).ids,
    trip = required(state.trip).id,
    rows = required(creation.captureCreation(trip));
  const body = {
    place_id: ids.register('place', row.location_id),
    start_day_id: state.days[0].id,
    end_day_id: state.days[state.days.length - 1].id,
    check_in: null,
    check_out: null,
    confirmation: null,
  };
  expect(creation.eligibleLodging(body.place_id)).toBe(true);
  expect(creation.eligibleLodging(999999)).toBe(false);
  return { trip, body, rows };
}
