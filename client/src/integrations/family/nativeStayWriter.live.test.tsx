import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cleanup } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { http, passthrough } from 'msw';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api from '../../api/client';
import { offlineDb, reopenAnonymous, reopenForUser } from '../../db/offlineDb';
import { accommodationRepo, FamilyAccommodationUnavailable } from '../../repo/accommodationRepo';
import { currentPlannerReadPort } from '../../repo/plannerReadPort';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { clearSignedOut } from '../../utils/signedOut';
import { bookingStayView } from './bookingStayContract';
import { currentOfflineTripSession } from './offlineTripSession';
import { plannerCacheDb } from './plannerCache';
import { createFamilyPlannerCohort } from './plannerCohort';
import { createPlannerStayRecovery } from './plannerStayRecovery';
import { familyAuthStore, FamilyFrontendRepository } from './repository';
import { stayEnvelope, stayScope } from './stayContract';
import { createStayTransport } from './stayTransport';
import { createFamilyAxiosAdapter } from './transport';
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
const file = process.env.FAMILY_NATIVE_STAY_WRITE_FIXTURE;
const live = file ? (JSON.parse(readFileSync(file, 'utf8')) as Fixture) : null;
if (live && live.api !== 'http://127.0.0.1:56671') throw Error('Explicit isolated loopback fixture required');
const f = () => {
  if (!live) throw Error('Missing local-only fixture');
  return live;
};
let sdk: SupabaseClient, repo: FamilyFrontendRepository;
const previous = api.defaults.adapter;
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:56671' }));
function client(fresh = false, bad = false) {
  const key = 'isolated-native-write-' + crypto.randomUUID(),
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
describe.skipIf(!live)('actual qualified native stay writer with signed local SQL and real IndexedDB', () => {
  beforeEach(async () => {
    resetAllStores();
    installTestLocks();
    _resetNetworkMode();
    setAuthed(true);
    clearSignedOut();
    vi.stubEnv('VITE_FAMILY_STAY_READ_QUALIFICATION', 'local-v4');
    vi.stubEnv('VITE_FAMILY_STAY_WRITE_QUALIFICATION', 'local-existing-v1');
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
    api.defaults.adapter = createFamilyAxiosAdapter(cohort.handle);
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

  async function open(kind: string) {
    const q = scenario(kind);
    await cohort.loadTrip(q.trip_id);
    const view = required(currentPlannerReadPort()?.currentStays?.(required(useTripStore.getState().trip).id));
    return {
      q,
      view,
      row: required(view.accommodations.find((r) => repo.knownViews()?.ids.uuid('stay', r.id) === q.stay_id)),
      id: required(useTripStore.getState().trip).id,
    };
  }
  async function core(trip: string) {
    const r = await sdk.rpc('get_family_trip_booking_view_v2', { p_trip_id: trip });
    if (r.error) throw r.error;
    return bookingStayView.parse(r.data);
  }
  it('real native existing save publishes a fresh coherent pair and preserves its exact linked booking', async () => {
    const { q, row, id } = await open('base');
    const before = await core(q.trip_id);
    const calls = vi.spyOn(sdk, 'rpc');
    const out = await accommodationRepo.update(
      id,
      row.id,
      { check_in: '00:00', check_out: null, notes: 'Native signed edit' },
      row
    );
    const after = await core(q.trip_id);
    expect(after.stays[0].stay.check_in_time).toBe('00:00:00');
    expect(after.stays[0].stay.notes).toBe('Native signed edit');
    expect(after.bookings).toEqual(before.bookings);
    expect(out.accommodation).toBe(currentPlannerReadPort()?.currentStays?.(id)?.accommodations[0]);
    expect(calls.mock.calls.filter(([n]) => n === 'save_family_stay_v1')).toHaveLength(1);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('editing one of repeated stays preserves all other identities and rows', async () => {
    const { q, row, id } = await open('repeated');
    const before = await core(q.trip_id);
    await accommodationRepo.update(id, row.id, { notes: 'Only one repeated stay' }, row);
    const after = await core(q.trip_id);
    expect(after.stays).toHaveLength(before.stays.length);
    for (const s of before.stays.filter((s) => s.stay.id !== q.stay_id))
      expect(after.stays.find((r) => r.stay.id === s.stay.id)).toEqual(s);
  });
  it('a native clock edit cannot rewrite confirmed booking instants or microseconds', async () => {
    const { q, row, id } = await open('timed');
    const before = await core(q.trip_id);
    await accommodationRepo.update(id, row.id, { check_out: '00:00' }, row);
    const after = await core(q.trip_id);
    expect(after.bookings).toEqual(before.bookings);
    expect(JSON.stringify(after.bookings)).toContain('.123456');
  });
  it('real offline queue survives reopening and startup recovery replays one exact original save', async () => {
    const { q, row, id } = await open('unclassified');
    const calls = vi.spyOn(sdk, 'rpc');
    setForcedOffline(true);
    await expect(accommodationRepo.update(id, row.id, { notes: 'Retained native intent' }, row)).rejects.toMatchObject({
      code: 'stay_queued',
    });
    expect(calls).not.toHaveBeenCalled();
    const original = required((await offlineDb.mutationQueue.toArray())[0]);
    offlineDb.close();
    await offlineDb.open();
    expect((await offlineDb.mutationQueue.toArray())[0]).toEqual(original);
    setForcedOffline(false);
    useTripStore.setState({ trip: null });
    const recovery = await createPlannerStayRecovery(repo, q.trip_id, {
      source: () => f().api,
      current: () => true,
    }).inspect();
    expect(recovery?.domain).toBe('stay');
    expect(await recovery?.check()).toBe('unknown');
    expect(await recovery?.retry()).toBe('committed');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect((await core(q.trip_id)).stays[0].stay.notes).toBe('Retained native intent');
    expect(calls.mock.calls.filter(([n]) => n === 'save_family_stay_v1')[0]?.[1]).toMatchObject({
      p_operation_id: original.id,
    });
    await cohort.loadTrip(q.trip_id);
  });
  it('a fresh SQL session cancels unknown original intent without sending that old write', async () => {
    const { q, row, id } = await open('midnight');
    setForcedOffline(true);
    await expect(accommodationRepo.update(id, row.id, { notes: 'Old SQL session intent' }, row)).rejects.toMatchObject({
      code: 'stay_queued',
    });
    setForcedOffline(false);
    sdk = client(true);
    await sdk.auth.getSession();
    const calls = vi.spyOn(sdk, 'rpc');
    const recovery = await createPlannerStayRecovery(repo, q.trip_id, {
      source: () => f().api,
      current: () => true,
    }).inspect();
    expect(recovery?.intent).toBe('cancel-command');
    expect(await recovery?.check()).toBe('unknown');
    expect(await recovery?.retry()).toBe('cancelled');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(calls.mock.calls.some(([n]) => n === 'save_family_stay_v1')).toBe(false);
    expect((await core(q.trip_id)).stays[0].stay.notes).not.toBe('Old SQL session intent');
  });
  it('an actual competing SQL edit makes the old native observation refuse instead of overwriting', async () => {
    const { q, row, id } = await open('base');
    const before = await core(q.trip_id);
    const scope = stayScope.parse({
      version: 1,
      layer: 'published',
      trip_id: q.trip_id,
      user_id: f().user_id,
      family_id: f().family_id,
      person_id: f().person_id,
      session_id: f().session_id,
    });
    const t = createStayTransport();
    const ctx = await t.context(scope, q.stay_id, q.location_id, null);
    await t.execute(
      stayEnvelope.parse({
        version: 1,
        source_url: f().api,
        command: {
          scope,
          observation: ctx.observation,
          action: 'save',
          stay_id: q.stay_id,
          operation_id: crypto.randomUUID(),
          changes: { notes: 'Competing SQL edit' },
          reservation_id: null,
        },
      })
    );
    await expect(accommodationRepo.update(id, row.id, { notes: 'Stale UI write' }, row)).rejects.toThrow();
    const after = await core(q.trip_id);
    expect(after.stays[0].stay.notes).toBe('Competing SQL edit');
    expect(after.bookings).toEqual(before.bookings);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('unsupported compound creation and native deletion remain refused without a mutation RPC', async () => {
    const { row, id } = await open('base');
    const placeId = required(row.place_id);
    const calls = vi.spyOn(sdk, 'rpc');
    await expect(
      accommodationRepo.create(id, {
        place_id: placeId,
        start_day_id: row.start_day_id,
        end_day_id: row.end_day_id,
      })
    ).rejects.toBeInstanceOf(FamilyAccommodationUnavailable);
    await expect(accommodationRepo.delete(id, row.id)).rejects.toBeInstanceOf(FamilyAccommodationUnavailable);
    expect(calls).not.toHaveBeenCalled();
  });
  it('a lost response after a real SQL commit is reconciled by its original receipt without a second save', async () => {
    const { q, row, id } = await open('base'),
      original = sdk.rpc.bind(sdk);
    let dropped = false;
    const call = vi.spyOn(sdk, 'rpc').mockImplementation((async (name: string, args: Record<string, unknown>) => {
      const result = await original(name, args);
      if (name === 'save_family_stay_v1' && !dropped && !result.error) {
        dropped = true;
        throw Error('Synthetic lost reply after real commit');
      }
      return result;
    }) as never);
    await expect(accommodationRepo.update(id, row.id, { notes: 'Committed but reply lost' }, row)).rejects.toThrow();
    expect(dropped).toBe(true);
    expect(await offlineDb.mutationQueue.count()).toBe(1);
    call.mockRestore();
    const r = await createPlannerStayRecovery(repo, q.trip_id, {
      source: () => f().api,
      current: () => true,
    }).inspect();
    expect(await r?.check()).toBe('committed');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(currentPlannerReadPort()?.currentStays?.(id)?.accommodations[0].notes).not.toBe('Committed but reply lost');
    await cohort.refreshPlanner(q.trip_id);
    expect(currentPlannerReadPort()?.currentStays?.(id)?.accommodations[0].notes).toBe('Committed but reply lost');
  });
  it('civil day edits and deliberate clear preserve an already named stay time zone', async () => {
    const { q, row, id } = await open('midnight');
    const before = await core(q.trip_id),
      days = useTripStore.getState().days;
    await accommodationRepo.update(
      id,
      row.id,
      { start_day_id: days[1].id, end_day_id: days[2].id, check_in: null },
      row
    );
    const after = await core(q.trip_id);
    expect(after.stays[0].stay.arrival_date).toBe(days[1].date);
    expect(after.stays[0].stay.check_in_time).toBeNull();
    expect(after.stays[0].stay.time_zone).toBe('America/Mexico_City');
    expect(after.bookings).toEqual(before.bookings);
  });
  it('a cold initial native publication can edit without a desktop-only second read', async () => {
    const q = required(f().fixtures.find((r) => r.kind === 'base'));
    useTripStore.setState({ trip: null });
    await cohort.loadTrip(q.trip_id);
    const id = required(useTripStore.getState().trip).id;
    const row = required(
      currentPlannerReadPort()
        ?.currentStays?.(id)
        ?.accommodations.find((r) => repo.knownViews()?.ids.uuid('stay', r.id) === q.stay_id)
    );
    const before = await core(q.trip_id);
    await accommodationRepo.update(id, row.id, { check_in: '13:50' }, row);
    const after = await core(q.trip_id);
    expect(after.stays[0].stay.check_in_time).toBe('13:50:00');
    expect(after.bookings).toEqual(before.bookings);
  });
});
