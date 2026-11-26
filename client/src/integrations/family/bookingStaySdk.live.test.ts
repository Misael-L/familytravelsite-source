import { bookingStayReadRpc } from '@family/backend/supabase/bookingStayReadRpc';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'fake-indexeddb/auto';
import { http, passthrough } from 'msw';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import { offlineDb } from '../../db/offlineDb';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode } from '../../sync/networkMode';
import { createBookingStayReader } from './bookingStayRead';
import { nativeStayReadiness } from './nativeStayReadiness';
import { handleFamilyPlanApi } from './planApiHandler';
import { FamilyFrontendRepository } from './repository';
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
const file = process.env.FAMILY_BOOKING_STAY_FIXTURE;
const live = file ? (JSON.parse(readFileSync(file, 'utf8')) as Fixture) : null;
if (live && live.api !== 'http://127.0.0.1:56371') throw Error('Explicit isolated loopback fixture required');
const f = () => {
  if (!live) throw Error('Missing local-only fixture');
  return live;
};
let sdk: SupabaseClient, repo: FamilyFrontendRepository;
const previous = api.defaults.adapter;
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:56371' }));
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
const read = (kind: string) => createBookingStayReader(repo)(scenario(kind).trip_id);
describe.skipIf(!live)('actual installed SDK/Axios -> signed local coherent SQL view', () => {
  beforeEach(async () => {
    resetAllStores();
    await resetOfflineTestDatabase();
    _resetNetworkMode();
    setAuthed(true);
    server.use(http.all(f().api + '/*', () => passthrough()));
    sdk = client();
    const s = f();
    repo = new FamilyFrontendRepository(
      async () => ({
        userId: s.user_id,
        personId: s.person_id,
        familyId: s.family_id,
        user: { username: 'Local read', email: 'coherent@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
      }),
      undefined,
      () => ({ userId: s.user_id, familyId: s.family_id, personId: s.person_id, source: s.api })
    );
    await repo.session();
    await repo.views();
    api.defaults.adapter = createFamilyAxiosAdapter((r) => handleFamilyPlanApi(repo, r));
  });
  afterEach(async () => {
    api.defaults.adapter = previous;
    await sdk.auth.stopAutoRefresh();
    _resetNetworkMode();
    setAuthed(false);
    await resetOfflineTestDatabase();
  });
  it('serves the real handler using numeric presentation selector and one coherent v2 observation', async () => {
    const s = scenario('base'),
      key = repo.knownViews()?.ids.register('trip', s.trip_id),
      before = useTripStore.getState();
    const p = (await api.get(`/trips/${key}/family/booking-stay-view-v2`)).data;
    expect(p.stays[0].stay.id).toBe(s.stay_id);
    expect(p.planner.state.trip_revision).toBe(p.trip_revision);
    expect(p.bookings[0].stay_link.id).toBe(s.stay_id);
    expect(p.capabilities.native_read).toBe(false);
    expect(useTripStore.getState()).toBe(before);
    expect(await offlineDb.accommodations.count()).toBe(0);
  });
  it('preserves genuine midnight and its named zone for the pure native candidate', async () => {
    const p = await read('midnight'),
      registry = (await repo.views()).ids,
      candidate = nativeStayReadiness(p, registry);
    expect(p.stays[0].stay.time_zone).toBe('America/Mexico_City');
    if (candidate.status !== 'ready') throw Error('Expected native read candidate');
    expect(candidate.accommodations[0].check_in).toBe('00:00:00');
    expect(candidate.accommodations[0].place_image).toBeNull();
  });
  it.each(['overnight', 'off_calendar'])('keeps %s facts while refusing partial native success', async (kind) => {
    const p = await read(kind),
      candidate = nativeStayReadiness(p, (await repo.views()).ids);
    expect(p.stays).toHaveLength(1);
    expect(candidate.status).toBe('unsupported');
    expect(candidate).not.toHaveProperty('accommodations');
  });
  it('retains only the trashed association and never reads its private note as active content', async () => {
    const p = await read('retained');
    expect(p.stays).toEqual([]);
    expect(p.bookings[0].stay_link?.state).toBe('retained');
    expect(JSON.stringify(p)).not.toContain('Retained private original');
  });
  it('projects deliberately repeated stays with separate stable identities', async () => {
    const p = await read('repeated'),
      candidate = nativeStayReadiness(p, (await repo.views()).ids);
    if (candidate.status !== 'ready') throw Error('Expected complete candidate');
    expect(new Set(candidate.accommodations.map((a) => a.id)).size).toBe(3);
    expect(new Set(candidate.accommodations.map((a) => a.place_id)).size).toBe(1);
  });
  it.each(['unclassified', 'timed'])('preserves exact %s booking facts without guessing intent', async (kind) => {
    const p = await read(kind),
      b = p.bookings.find((x) => x.record.starts_at !== null);
    expect(b?.timing_state).toBe(kind);
    expect(b?.record.starts_at).toContain('.123456');
    if (kind === 'unclassified') expect(b?.record.time_zone).toBeNull();
  });
  it('a fresh authorized login reads current facts without returning any Auth session UUID', async () => {
    sdk = client(true);
    const p = await read('base');
    expect(p.user_id).toBe(f().user_id);
    expect(JSON.stringify(p)).not.toContain(f().fresh_session_id);
    expect(JSON.stringify(p)).not.toContain(f().session_id);
  });
  it('a new Auth session before publication refuses the old reply and writes no cache', async () => {
    const row = scenario('base');
    const reader = createBookingStayReader(repo, {
      rpc: async (trip) => {
        const out = await bookingStayReadRpc(trip);
        sdk = client(true);
        return out;
      },
    });
    await expect(reader(row.trip_id)).rejects.toMatchObject({ status: 409 });
    expect(await offlineDb.accommodations.count()).toBe(0);
  });
  it('the actual HTTP signature validator refuses a tampered signed credential', async () => {
    sdk = client(false, true);
    await expect(read('base')).rejects.toMatchObject({ status: 401 });
  });
});
