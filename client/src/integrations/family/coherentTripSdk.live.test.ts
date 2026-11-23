import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'fake-indexeddb/auto';
import { http, passthrough } from 'msw';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { coherentTripData } from '../../../tests/helpers/familyCompleteTripV4';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import { offlineDb, reopenAnonymous, reopenForUser } from '../../db/offlineDb';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { clearSignedOut } from '../../utils/signedOut';
import { createCoherentTripCapture } from './coherentTripCapture';
import { openCoherentTripRead } from './completeTripRead';
import { handleFamilyPlanApi } from './planApiHandler';
import { plannerCacheDb } from './plannerCache';
import { familyAuthStore, FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter } from './transport';
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
const file = process.env.FAMILY_COHERENT_CACHE_FIXTURE;
const live = file ? (JSON.parse(readFileSync(file, 'utf8')) as Fixture) : null;
if (live && live.api !== 'http://127.0.0.1:56471') throw Error('Explicit isolated loopback fixture required');
const f = () => {
  if (!live) throw Error('Missing local-only fixture');
  return live;
};
let sdk: SupabaseClient, repo: FamilyFrontendRepository;
const previous = api.defaults.adapter;
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:56471' }));
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

const oldFamily = familyAuthStore.getState();
const capture = () =>
  createCoherentTripCapture(repo, {
    read: async (trip, signal) => (await api.get(`/trips/${trip}/family/booking-stay-view-v2`, { signal })).data,
  });
const load = async (core: Parameters<typeof coherentTripData>[0]) => {
  const { core: _core, ...ancillary } = coherentTripData(core);
  return ancillary;
};
describe.skipIf(!live)('actual SDK/dispatcher -> one canonical core -> owned IndexedDB -> cold v4', () => {
  beforeEach(async () => {
    resetAllStores();
    _resetNetworkMode();
    clearSignedOut();
    setAuthed(true);
    vi.stubEnv('VITE_FAMILY_STAY_READ_QUALIFICATION', 'local-v4');
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    server.use(http.all(f().api + '/*', () => passthrough()));
    sdk = client();
    const s = f();
    repo = new FamilyFrontendRepository(
      async () => ({
        userId: s.user_id,
        personId: s.person_id,
        familyId: s.family_id,
        user: { username: 'Local', email: 'cache@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
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
    api.defaults.adapter = createFamilyAxiosAdapter((request) => handleFamilyPlanApi(repo, request));
  });
  afterEach(async () => {
    api.defaults.adapter = previous;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    _resetNetworkMode();
    setAuthed(false);
    familyAuthStore.setState(oldFamily, true);
    await resetOfflineTestDatabase();
    await reopenAnonymous();
  });
  it.each(['base', 'midnight', 'overnight', 'off_calendar', 'retained', 'repeated', 'unclassified', 'timed'])(
    'round trips signed %s canonical facts through persisted cold read without media fetch',
    async (kind) => {
      const scenarioRow = scenario(kind),
        calls = vi.spyOn(sdk, 'rpc');
      const c = await capture()(scenarioRow.trip_id, load);
      expect(calls).toHaveBeenCalledExactlyOnceWith('get_family_trip_booking_view_v2', {
        p_trip_id: scenarioRow.trip_id,
      });
      expect(c.envelope.data).not.toHaveProperty('booking');
      expect(c.envelope.data).not.toHaveProperty('planner');
      if (kind === 'midnight') expect(c.envelope.data.core.stays[0].stay.check_in_time).toBe('00:00:00');
      if (kind === 'overnight') expect(c.envelope.data.core.stays[0].stay.check_in_window_end_day_offset).toBe(1);
      if (kind === 'off_calendar') expect(c.envelope.data.core.stays[0].arrival_day_id).toBeNull();
      if (kind === 'retained') {
        expect(c.envelope.data.core.stays).toEqual([]);
        expect(JSON.stringify(c.envelope)).not.toContain('Retained private original');
      }
      if (kind === 'repeated') expect(c.envelope.data.core.stays).toHaveLength(3);
      if (kind === 'unclassified' || kind === 'timed')
        expect(JSON.stringify(c.envelope.data.core)).toContain('00:00:00.123456');
      await plannerCacheDb.close();
      await plannerCacheDb.open();
      setAuthed(false);
      familyAuthStore.setState({ authGate: null, authCheckFailed: true });
      useAuthStore.setState({ authCheckFailed: true });
      setForcedOffline(true);
      const cold = await openCoherentTripRead(scenarioRow.trip_id);
      expect(cold.envelope).toEqual(c.envelope);
      await cold.publish(() => {});
      cold.close();
      expect(calls).toHaveBeenCalledTimes(1);
      expect(await offlineDb.accommodations.count()).toBe(0);
    }
  );
  it('a new signed SDK login after a real reply cannot persist the old generation', async () => {
    const row = scenario('base');
    await expect(
      capture()(row.trip_id, async (core) => {
        sdk = client(true);
        return load(core);
      })
    ).rejects.toBeDefined();
    expect(await plannerCacheDb.completeHeads.count()).toBe(0);
  });
  it('a tampered signature refuses before any cache head is published', async () => {
    const row = scenario('base');
    sdk = client(false, true);
    await expect(capture()(row.trip_id, load)).rejects.toBeDefined();
    expect(await plannerCacheDb.completeHeads.count()).toBe(0);
  });
});
