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
import { FamilyStayManagement } from './FamilyStayManagement';
import { createNativeStayCreation } from './nativeStayCreation';
import { createNativeStayLifecycle } from './nativeStayLifecycle';
import { originalNativeStayCohort } from './nativeStayObservation';
import { currentOfflineTripSession } from './offlineTripSession';
import { plannerCacheDb } from './plannerCache';
import { createFamilyPlannerCohort } from './plannerCohort';
import { familyAuthStore, FamilyFrontendRepository } from './repository';
import { useFamilyUiPermissions } from './uiPermissions';
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
const file = process.env.FAMILY_NATIVE_STAY_LIFECYCLE_FIXTURE;
if (file && file !== '/private/tmp/trek-u05b2b3c5-lifecycle-20261114/sdk-fixture-private.json')
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
let lifecycle: ReturnType<typeof createNativeStayLifecycle>;
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
describe.skipIf(!live)('actual compound native edit and recoverable lifecycle', () => {
  beforeEach(async () => {
    resetAllStores();
    useFamilyUiPermissions.setState({ controller: null });
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
    lifecycle = createNativeStayLifecycle(repo, {
      source: () => source,
      disposed: () => disposed,
      allowed: () => allowed,
      confirmCurrent: cohort.hydrateNativeStay,
    });
    undoCreation = installPlannerStayWritePort({ ...creation, ...lifecycle });
  });
  afterEach(async () => {
    finish?.();
    finish = undefined;
    cleanup();
    useFamilyUiPermissions.setState({ controller: null });
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

  it('native update uses the compound command and preserves independent booking facts', async () => {
    const { trip, row } = await owned();
    const before = core(trip),
      id = required(repo.knownViews()).ids.uuid('stay', row.id);
    const booking = required(before.stays.find((s) => s.stay.id === id)).booking;
    const result = await writeStay(trip, row.id, { notes: 'Private lodging note' }, row);
    expect(result.accommodation.notes).toBe('Private lodging note');
    expect(required(core(trip).stays.find((s) => s.stay.id === id)).booking).toEqual(booking);
    expect(core(trip).planner.state.visits.find((v) => v.owning_stay_id === id)).toMatchObject({
      timing_kind: 'untimed',
      starts_at: null,
    });
    expect(executions).toBe(1);
  });
  it('moving arrival preserves the same owned visit identity and notes', async () => {
    const { trip, row } = await owned();
    const before = core(trip),
      id = required(repo.knownViews()).ids.uuid('stay', row.id),
      v = required(before.planner.state.visits.find((v) => v.owning_stay_id === id));
    const day = required(useTripStore.getState().days[0]);
    await writeStay(trip, row.id, { start_day_id: day.id }, row);
    expect(core(trip).planner.state.visits.find((x) => x.id === v.id)).toMatchObject({
      owning_stay_id: id,
      trip_day_id: required(repo.knownViews()).ids.uuid('day', day.id),
      explanations: v.explanations,
    });
  });
  it('repository Trash and cross-device discovery restore the same stay and owned arrival', async () => {
    const { trip, row } = await owned();
    const before = core(trip),
      id = required(repo.knownViews()).ids.uuid('stay', row.id),
      visit = required(before.planner.state.visits.find((v) => v.owning_stay_id === id));
    await accommodationRepo.delete(trip, row.id, undefined, row);
    expect(core(trip).stays.some((s) => s.stay.id === id)).toBe(false);
    expect(core(trip).bookings.map((b) => b.record)).toEqual(before.bookings.map((b) => b.record));
    const other = createNativeStayLifecycle(repo, {
      source: () => source,
      disposed: () => false,
      allowed: () => true,
      confirmCurrent: cohort.hydrateNativeStay,
    });
    const page = await other.trashPage(trip);
    const trashed = required(page.items.find((s) => s.id === id));
    await other.restore(trip, trashed);
    expect(core(trip).stays.find((s) => s.stay.id === id)?.stay.id).toBe(id);
    expect(core(trip).planner.state.visits.find((v) => v.owning_stay_id === id)?.id).toBe(visit.id);
  });
  it('keepStop releases the arrival and restore never reclaims it', async () => {
    const { trip, row } = await owned();
    const id = required(repo.knownViews()).ids.uuid('stay', row.id),
      visit = required(core(trip).planner.state.visits.find((v) => v.owning_stay_id === id));
    await accommodationRepo.delete(trip, row.id, { keepStop: true }, row);
    expect(core(trip).planner.state.visits.find((v) => v.id === visit.id)?.owning_stay_id).toBeUndefined();
    await lifecycle.restore(trip, required((await lifecycle.trashPage(trip)).items.find((r) => r.id === id)));
    expect(core(trip).planner.state.visits.find((v) => v.id === visit.id)?.owning_stay_id).toBeUndefined();
  });
  it('removing the original owner preserves an arrival shared by another stay', async () => {
    const { trip, row, body } = await owned();
    const before = core(trip),
      id = required(repo.knownViews()).ids.uuid('stay', row.id),
      v = required(before.planner.state.visits.find((v) => v.owning_stay_id === id));
    await writeStay(trip, null, body, undefined, required(creation.captureCreation(trip)));
    const current = required(
      currentPlannerReadPort()
        ?.currentStays?.(trip)
        ?.accommodations.find((x) => x.id === row.id)
    );
    await accommodationRepo.delete(trip, current.id, undefined, current);
    expect(core(trip).planner.state.visits.find((x) => x.id === v.id)).toMatchObject({ id: v.id, deleted_at: null });
    expect(core(trip).planner.state.visits.find((x) => x.id === v.id)?.owning_stay_id).toBeUndefined();
  });
  it.each(['save', 'trash', 'restore'] as const)(
    'lost committed %s reply reconciles without another execution',
    async (action) => {
      const { trip, row } = await owned();
      let selected: Awaited<ReturnType<typeof lifecycle.trashPage>>['items'][number] | undefined;
      if (action === 'restore') {
        await lifecycle.trash(trip, row.id, false, row);
        selected = required((await lifecycle.trashPage(trip)).items[0]);
        executions = 0;
      }
      const run = () =>
        action === 'save'
          ? writeStay(trip, row.id, { notes: 'Once' }, row)
          : action === 'trash'
            ? lifecycle.trash(trip, row.id, false, row)
            : lifecycle.restore(trip, required(selected));
      lose = true;
      await expect(run()).rejects.toBeDefined();
      const original = (await offlineDb.mutationQueue.toArray())[0];
      expect(original).toBeDefined();
      await run();
      expect(executions).toBe(1);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
  it('two identical update submissions share one original operation', async () => {
    const { trip, row } = await owned();
    await Promise.all([writeStay(trip, row.id, { notes: 'One' }, row), writeStay(trip, row.id, { notes: 'One' }, row)]);
    expect(executions).toBe(1);
  });
  it('a changed edit body cannot replace a retained operation', async () => {
    const { trip, row } = await owned();
    lose = true;
    await expect(writeStay(trip, row.id, { notes: 'Original' }, row)).rejects.toBeDefined();
    const original = (await offlineDb.mutationQueue.toArray())[0];
    await expect(writeStay(trip, row.id, { notes: 'Changed' }, row)).rejects.toBeDefined();
    expect((await offlineDb.mutationQueue.toArray())[0]).toEqual(original);
    await writeStay(trip, row.id, { notes: 'Original' }, row);
    expect(executions).toBe(1);
  });
  it('preparing a new offline edit refuses clearly before any context or queue write', async () => {
    const { trip, row } = await owned();
    setForcedOffline(true);
    const calls = vi.spyOn(sdk, 'rpc');
    await expect(writeStay(trip, row.id, { notes: 'Offline' }, row)).rejects.toThrow('Go online');
    expect(calls).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('cloned native rows and cloned Trash items confer no observation', async () => {
    const { trip, row } = await owned();
    await expect(lifecycle.trash(trip, row.id, false, structuredClone(row))).rejects.toBeDefined();
    await lifecycle.trash(trip, row.id, false, row);
    const item = (await lifecycle.trashPage(trip)).items[0];
    executions = 0;
    await expect(lifecycle.restore(trip, structuredClone(item))).rejects.toBeDefined();
    expect(executions).toBe(0);
  });
  it('a stale Trash selection cannot silently adopt another current Trip revision', async () => {
    const { trip, row, body } = await owned();
    await lifecycle.trash(trip, row.id, false, row);
    const item = (await lifecycle.trashPage(trip)).items[0];
    await writeStay(trip, null, body, undefined, required(creation.captureCreation(trip)));
    executions = 0;
    await expect(lifecycle.restore(trip, item)).rejects.toBeDefined();
    expect(executions).toBe(0);
  });
  it('booking confirmation changes remain refused by the separate booking contract', async () => {
    const { trip, row } = await owned();
    await expect(writeStay(trip, row.id, { confirmation: 'Not a stay field' }, row)).rejects.toThrow(
      'Booking confirmation'
    );
    expect(executions).toBe(0);
  });
  it('current Direct permission is required for list and mutation', async () => {
    const { trip, row } = await owned();
    allowed = false;
    const calls = vi.spyOn(sdk, 'rpc');
    await expect(lifecycle.trashPage(trip)).rejects.toBeDefined();
    await expect(lifecycle.trash(trip, row.id, false, row)).rejects.toBeDefined();
    expect(calls).not.toHaveBeenCalled();
  });
  it.each(['source', 'permission', 'dispose', 'layer'])(
    'delayed %s change retires preparation before retention',
    async (change) => {
      const { trip, row } = await owned();
      hold('/rpc/get_family_stay_command_context_v1');
      const result = writeStay(trip, row.id, { notes: 'No late save' }, row).catch((e) => e);
      await waitFor(() => expect(entered).toBe(true));
      if (change === 'source') source = 'http://127.0.0.1:57172';
      if (change === 'permission') allowed = false;
      if (change === 'dispose') disposed = true;
      if (change === 'layer') repo.setLayer(required(repo.knownViews()).ids.uuid('trip', trip), 'myDraft');
      finish?.();
      expect(await result).toBeInstanceOf(Error);
      expect(executions).toBe(0);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
  it('staged imports block edits before context or queue writes', async () => {
    const { trip, row } = await owned();
    await offlineDb.importFiles.put({ jobId: 'pending', fileName: 'synthetic.txt', createdAt: Date.now() } as never);
    const calls = vi.spyOn(sdk, 'rpc');
    await expect(lifecycle.trash(trip, row.id, false, row)).rejects.toThrow('imports');
    expect(calls).not.toHaveBeenCalled();
  });
  it('the native desktop Remove handler carries its exact target and recoverably trashes it', async () => {
    const { trip, row } = await owned();
    const state = useTripStore.getState();
    const hook = renderHook(() => useDayDetail(state.days[0], useTripStore.getState().days, trip, null, null, 'en'));
    await waitFor(() => expect(hook.result.current.accommodations.length).toBeGreaterThan(0));
    await act(async () => hook.result.current.handleRemoveAccommodation(row));
    expect(executions).toBe(1);
    expect(
      (await lifecycle.trashPage(trip)).items.some((x) => x.id === required(repo.knownViews()).ids.uuid('stay', row.id))
    ).toBe(true);
    hook.unmount();
  });
  it.each([false, true])(
    'reachable desktop/phone management confirms Trash and restores it (phone=%s)',
    async (phone) => {
      const { trip } = await owned();
      Object.defineProperty(window, 'innerWidth', { value: phone ? 390 : 1440, configurable: true });
      enableManagement();
      render(<FamilyStayManagement />);
      fireEvent.click(screen.getByRole('button', { name: 'Lodgings · Trash' }));
      await screen.findByText('No lodgings in Trash.');
      fireEvent.click(required(screen.getAllByRole('button', { name: 'Move lodging to Trash' }).slice(-1)[0]));
      expect(executions).toBe(0);
      fireEvent.click(screen.getByRole('button', { name: 'Confirm move to Trash' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Restore lodging' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Restore lodging' }));
      await waitFor(() => expect(screen.getByText('No lodgings in Trash.')).toBeInTheDocument());
      expect(executions).toBe(2);
      expect((await lifecycle.trashPage(trip)).items).toHaveLength(0);
    }
  );
  it('permission retirement hides a late confirmed-Trash response', async () => {
    await owned();
    enableManagement();
    hold('/rpc/list_family_trashed_stays_v1');
    render(<FamilyStayManagement />);
    fireEvent.click(screen.getByRole('button', { name: 'Lodgings · Trash' }));
    await waitFor(() => expect(entered).toBe(true));
    act(() => useFamilyUiPermissions.setState({ controller: null }));
    finish?.();
    await act(async () => new Promise((r) => setTimeout(r, 60)));
    expect(screen.queryByRole('button', { name: 'Restore lodging' })).not.toBeInTheDocument();
  });
  it('adding explicit midnight inherits a known lodging zone without creating a timed arrival', async () => {
    const { trip, row } = await owned('cohort_33');
    await writeStay(trip, row.id, { check_in: '00:00' }, row);
    const id = required(repo.knownViews()).ids.uuid('stay', row.id),
      s = required(core(trip).stays.find((x) => x.stay.id === id));
    expect(s.stay.check_in_time).toBe('00:00:00');
    expect(s.stay.time_zone).toBe(s.location.time_zone);
    expect(core(trip).planner.state.visits.find((v) => v.owning_stay_id === id)).toMatchObject({
      timing_kind: 'untimed',
      starts_at: null,
      time_zone: null,
    });
  });
  it('the actual phone existing-stay form saves through the compound adapter', async () => {
    const { trip, row } = await owned(),
      state = useTripStore.getState();
    const planner = buildPlanner({
      tripId: trip,
      trip: state.trip,
      days: state.days,
      places: state.places,
      categories: state.categories,
      tripAccommodations: required(creation.captureCreation(trip)),
    });
    const shell = buildShell({ sheet: { id: 'accommodation', payload: { accId: row.id, dayId: row.start_day_id } } });
    render(<MAccommodationSheet planner={planner} shell={shell} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(shell.openSheet).toHaveBeenCalled());
    expect(planner.toast.error).not.toHaveBeenCalled();
    expect(executions).toBe(1);
  });
  it('an unavailable Trash row stays visible with Restore disabled', async () => {
    const { trip, row } = await owned();
    await lifecycle.trash(trip, row.id, false, row);
    undoCreation?.();
    undoCreation = installPlannerStayWritePort({
      ...creation,
      ...lifecycle,
      trashPage: async (...args) => {
        const page = await lifecycle.trashPage(...args);
        return { ...page, items: page.items.map((r) => ({ ...r, restore_available: false })) };
      },
    });
    enableManagement();
    render(<FamilyStayManagement />);
    fireEvent.click(screen.getByRole('button', { name: 'Lodgings · Trash' }));
    await screen.findByText('This lodging is unavailable. Restore its source before restoring the stay.');
    expect(screen.getByRole('button', { name: 'Restore lodging' })).toBeDisabled();
  });
  it('a refused Trash read is an error and can retry, never an empty-success page', async () => {
    await owned();
    enableManagement();
    failure = '/rpc/list_family_trashed_stays_v1';
    render(<FamilyStayManagement />);
    fireEvent.click(screen.getByRole('button', { name: 'Lodgings · Trash' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('No lodgings in Trash.')).not.toBeInTheDocument();
    failure = '';
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await screen.findByText('No lodgings in Trash.');
  });
  it('the management dialog can close and reopen with a fresh response owner', async () => {
    await owned();
    enableManagement();
    render(<FamilyStayManagement />);
    fireEvent.click(screen.getByRole('button', { name: 'Lodgings · Trash' }));
    await screen.findByText('No lodgings in Trash.');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Active lodgings')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Lodgings · Trash' }));
    await screen.findByText('No lodgings in Trash.');
  });
  it('an unknown lodging zone cannot fabricate local midnight guidance', async () => {
    const { trip } = await setup('cohort_34'),
      row = required(creation.captureCreation(trip)?.[0]);
    const calls = vi.spyOn(sdk, 'rpc');
    await expect(writeStay(trip, row.id, { check_in: '00:00' }, row)).rejects.toThrow('known lodging time zone');
    expect(calls).not.toHaveBeenCalled();
    expect(executions).toBe(0);
  });
});
function core(trip: number) {
  return required(originalNativeStayCohort(required(creation.captureCreation(trip)))).core;
}
async function owned(kind?: string) {
  const x = await setup(kind),
    body = { ...x.body, start_day_id: required(useTripStore.getState().days.slice(-1)[0]).id };
  const row = (await writeStay(x.trip, null, body, undefined, x.rows)).accommodation;
  executions = 0;
  return { ...x, body, row };
}

function enableManagement() {
  useFamilyUiPermissions.setState({
    controller: {
      isCurrent: () => true,
      gov: { layer: 'published', canEditPublished: true, actionOutcomes: { 'trip.schedule.manage': 'direct' } },
    } as never,
  });
}
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
