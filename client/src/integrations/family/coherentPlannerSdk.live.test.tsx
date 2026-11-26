import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { http, passthrough } from 'msw';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import { useTripStays } from '../../components/Planner/useTripStays';
import { offlineDb, reopenAnonymous, reopenForUser } from '../../db/offlineDb';
import { accommodationRepo } from '../../repo/accommodationRepo';
import { currentPlannerReadPort } from '../../repo/plannerReadPort';
import { currentSavedFilePreview } from '../../repo/preparedFilePreview';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { clearSignedOut } from '../../utils/signedOut';
import { createOfflineTripSession, currentOfflineTripSession } from './offlineTripSession';
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
const file = process.env.FAMILY_NATIVE_STAY_FIXTURE;
const live = file ? (JSON.parse(readFileSync(file, 'utf8')) as Fixture) : null;
if (live && live.api !== 'http://127.0.0.1:56571') throw Error('Explicit isolated loopback fixture required');
const f = () => {
  if (!live) throw Error('Missing local-only fixture');
  return live;
};
let sdk: SupabaseClient, repo: FamilyFrontendRepository;
const previous = api.defaults.adapter;
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:56571' }));
function client(fresh = false, bad = false) {
  const key = 'isolated-coherent-read',
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
    vi.stubEnv('VITE_FAMILY_STAY_READ_QUALIFICATION', 'local-v4');
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    server.use(http.all(f().api + '/*', () => passthrough()));
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
      () => ({ userId: s.user_id, familyId: s.family_id, personId: s.person_id, source: s.api })
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
    cohort = createFamilyPlannerCohort(repo, { source: () => s.api, reportError: () => {} });
    release = cohort.install();
  });
  afterEach(async () => {
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
  it.each(['base', 'midnight', 'retained', 'repeated', 'unclassified', 'timed'])(
    'loads real %s ancillary rows and pairs native stays/bookings from one core',
    async (kind) => {
      const row = scenario(kind),
        calls = vi.spyOn(sdk, 'rpc'),
        tables = vi.spyOn(sdk, 'from');
      await cohort.loadTrip(row.trip_id);
      const state = useTripStore.getState(),
        port = currentPlannerReadPort();
      expect(calls.mock.calls.filter(([n]) => n === 'get_family_trip_booking_view_v2')).toHaveLength(1);
      expect(
        calls.mock.calls.some(([n]) =>
          ['get_family_trip_planner_view_v1', 'get_family_trip_booking_view_v1'].includes(n)
        )
      ).toBe(false);
      expect(tables.mock.calls.map(([n]) => n)).toEqual(
        expect.arrayContaining([
          'trips',
          'trip_expenses',
          'trip_travelers',
          'trip_files',
          'trip_expense_shares',
          'trip_expense_payers',
        ])
      );
      expect(state.todoItems.map((r) => r.name)).toContain('Native task');
      expect(state.packingItems.map((r) => r.name)).toContain('Native packing item');
      expect(state.budgetItems).toHaveLength(1);
      expect(state.files).toHaveLength(1);
      const saved = (await plannerCacheDb.completeSnapshots.toArray())[0].value;
      if (saved.format !== 'family.offline-trip.v4') throw new Error('Expected the actual v4 capture');
      expect(saved.data.companions.members).toHaveLength(1);
      const paired = port?.currentStays?.(required(state.trip).id);
      expect(paired?.reservations).toBe(state.reservations);
      expect(paired?.accommodations).toHaveLength(kind === 'retained' ? 0 : kind === 'repeated' ? 3 : 1);
      if (kind === 'midnight') expect(paired?.accommodations[0].check_in).toBe('00:00:00');
      expect((await plannerCacheDb.completeSnapshots.toArray())[0].value.format).toBe('family.offline-trip.v4');
    }
  );
  it.each(['overnight', 'off_calendar'])(
    'refuses unrepresentable %s without publishing partial native content or a new head',
    async (kind) => {
      await expect(cohort.loadTrip(scenario(kind).trip_id)).rejects.toMatchObject({
        code: 'native_stay_unrepresentable',
      });
      expect(useTripStore.getState().places).toEqual([]);
      expect(await plannerCacheDb.completeHeads.count()).toBe(0);
    }
  );
  it.each(['desktop', 'phone'])(
    'the actual %s stays hook consumes the paired port without independent reservation fetch',
    async (profile) => {
      const row = scenario('base');
      await cohort.loadTrip(row.trip_id);
      const id = required(repo.knownViews()).ids.register('trip', row.trip_id);
      Object.defineProperty(window, 'innerWidth', { value: profile === 'phone' ? 390 : 1440, configurable: true });
      const independent = vi.spyOn(useTripStore.getState(), 'loadReservations'),
        legacy = vi.spyOn(accommodationRepo, 'list');
      const hook = renderHook(() => useTripStays(id));
      await act(async () => hook.result.current.loadAccommodations());
      await waitFor(() => expect(hook.result.current.tripAccommodations).toHaveLength(1));
      expect(independent).not.toHaveBeenCalled();
      expect(legacy).not.toHaveBeenCalled();
      expect(currentPlannerReadPort()?.currentStays?.(id)?.reservations).toBe(useTripStore.getState().reservations);
    }
  );
  it('cold v4 session publishes native reservations/stays and keeps private file preparation refused', async () => {
    const row = scenario('base');
    await cohort.loadTrip(row.trip_id);
    const id = required(repo.knownViews()).ids.register('trip', row.trip_id);
    setAuthed(false);
    familyAuthStore.setState({ authGate: null, authCheckFailed: true });
    useAuthStore.setState({ authCheckFailed: true });
    setForcedOffline(true);
    const cold = await createOfflineTripSession(row.trip_id, () => {});
    await cold.load(id);
    expect(cold.currentStays(id)?.accommodations).toHaveLength(1);
    expect(cold.currentStays(id)?.reservations).toBe(useTripStore.getState().reservations);
    expect(useTripStore.getState().todoItems[0].name).toBe('Native task');
    await expect(
      required(currentSavedFilePreview()).acquire(
        '/api/trips/' + id + '/files/' + useTripStore.getState().files[0].id + '/download'
      )
    ).rejects.toThrow('V4 saved file preparation is not connected');
    cold.dispose();
  });
  it('all native accommodation writes remain refused without any SQL mutation RPC', async () => {
    const row = scenario('base');
    await cohort.loadTrip(row.trip_id);
    const calls = vi.spyOn(sdk, 'rpc');
    await expect(
      accommodationRepo.create(row.trip_id, { place_id: 1, start_day_id: 1, end_day_id: 2 })
    ).rejects.toThrow('not connected');
    expect(calls).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
});
