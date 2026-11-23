import { stayAuthIdentity } from '@family/backend/supabase/stayRpc';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'fake-indexeddb/auto';
import { http, passthrough } from 'msw';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api from '../../api/client';
import { offlineDb } from '../../db/offlineDb';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { FamilyFrontendRepository } from './repository';
import { StayCommandSession } from './stayCommandSession';
import { stayEnvelope, stayIdentity, stayScope, type StayEnvelope } from './stayContract';
import { createStayHandler } from './stayHandler';
import { createStayTransport } from './stayTransport';
import { createFamilyAxiosAdapter } from './transport';
const file = process.env.FAMILY_STAY_SDK_FIXTURE;
type Fixture = {
  api: string;
  anon_key: string;
  access_token: string;
  fresh_access_token: string;
  fresh_session_id: string;
  scope: StayEnvelope['command']['scope'];
  trips: { trip_id: string; stay_id: string; location_id: string; booking_id: string }[];
};
const live = file ? (JSON.parse(readFileSync(file, 'utf8')) as Fixture) : null;
if (live && live.api !== 'http://127.0.0.1:56361') throw Error('Explicit isolated loopback fixture required');
const f = () => {
  if (!live) throw Error('No local stay fixture');
  return live;
};
let sdk: SupabaseClient,
  repo: FamilyFrontendRepository,
  row: Fixture['trips'][number],
  index = 0,
  stop: () => void;
const previous = api.defaults.adapter;
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:56361' }));
function client(fresh = false) {
  const key = 'isolated-stay-session',
    token = fresh ? f().fresh_access_token : f().access_token;
  const memory = new Map<string, string>([
    [
      key,
      JSON.stringify({
        access_token: token,
        refresh_token: 'synthetic-refresh-not-used',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Date.now() / 1000 + 1800,
        user: {
          id: f().scope.user_id,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'stay@fixture.invalid',
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
const identity = () => stayIdentity.parse({ ...f().scope, trip_id: row.trip_id });
const scope = async () =>
  stayScope.parse({ ...identity(), version: 1, layer: 'published', session_id: (await stayAuthIdentity()).session_id });
const reads = () => createStayTransport();
async function packet(
  action: StayEnvelope['command']['action'] = 'save',
  changes: StayEnvelope['command']['changes'] = { notes: 'Real SDK save' },
  stay = row.stay_id,
  booking: string | null = null
) {
  const c = await reads().context(await scope(), stay, changes.location_id ?? null, booking);
  return stayEnvelope.parse({
    version: 1,
    source_url: f().api,
    command: {
      action,
      stay_id: stay,
      operation_id: crypto.randomUUID(),
      scope: c.scope,
      observation: c.observation,
      changes,
      reservation_id: booking,
    },
  });
}
const channel = (p: StayEnvelope) => new StayCommandSession(repo, { source: () => f().api, disposed: () => false }, p);
describe.skipIf(!live)('actual Supabase SDK -> Axios handler -> signed local Unix PostgREST', () => {
  beforeEach(async () => {
    resetAllStores();
    await resetOfflineTestDatabase();
    installTestLocks();
    _resetNetworkMode();
    setAuthed(true);
    row = f().trips[index++];
    if (!row) throw Error('Fixture exhausted');
    server.use(http.all(f().api + '/*', () => passthrough()));
    sdk = client();
    const s = f().scope;
    repo = new FamilyFrontendRepository(
      async () => ({
        userId: s.user_id,
        familyId: s.family_id,
        personId: s.person_id,
        user: { username: 'Synthetic stay', email: 'stay@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
      }),
      undefined,
      () => ({ userId: s.user_id, familyId: s.family_id, personId: s.person_id, source: f().api })
    );
    await repo.session();
    const native = (await repo.views()).ids.register('trip', row.trip_id);
    useTripStore.setState({ trip: { id: native, title: 'SDK local stay' } as never });
    api.defaults.adapter = createFamilyAxiosAdapter(createStayHandler(repo));
    stop = installFamilyCommandRetention();
  });
  afterEach(async () => {
    stop();
    await sdk.auth.stopAutoRefresh();
    api.defaults.adapter = previous;
    _resetNetworkMode();
    setAuthed(false);
    await resetOfflineTestDatabase();
  });
  it('validates the actual read/editor/context contract through installed browser SDK', async () => {
    const root = `/trips/${row.trip_id}/family/stays`;
    expect((await api.get(root)).data.stays[0].stay.id).toBe(row.stay_id);
    expect((await api.get(`${root}/${row.stay_id}`)).data.capabilities.commands).toBe(false);
    expect((await api.get(`${root}/${row.stay_id}/context`)).data.scope.session_id).toBe(f().scope.session_id);
  });
  it('saves real midnight and overnight clocks without altering the linked unclassified booking', async () => {
    const before = await reads().editor(identity(), row.stay_id),
      p = await packet('save', {
        check_in_time: '22:00',
        check_in_window_end: '02:00',
        check_in_window_end_day_offset: 1,
        check_out_time: '00:00',
        time_zone: 'America/Mexico_City',
        notes: 'UTC is not a default clock',
      });
    await channel(p).submit();
    const after = await reads().editor(identity(), row.stay_id);
    expect(after.observation.stay.check_out_time).toBe('00:00:00');
    expect(after.observation.booking).toEqual(before.observation.booking);
    expect(after.capabilities.commands).toBe(false);
    expect(await offlineDb.accommodations.count()).toBe(0);
  });
  it('deliberately repeated stays retain distinct UUIDs without partner reservations or stops', async () => {
    const before = await reads().list(identity());
    const ids: string[] = [crypto.randomUUID(), crypto.randomUUID()];
    for (const id of ids)
      await channel(
        await packet(
          'save',
          { location_id: row.location_id, arrival_date: '2027-05-01', departure_date: '2027-05-02' },
          id
        )
      ).submit();
    const after = await reads().list(identity());
    expect(after.stays.length).toBe(before.stays.length + 2);
    expect(
      after.stays.filter((p) => ids.includes(p.stay.id)).every((p) => p.booking === null && p.arrival_day_id === null)
    ).toBe(true);
  });
  it('unlinks and relinks only the observed booking association', async () => {
    const before = await reads().editor(identity(), row.stay_id);
    await channel(await packet('link', {})).submit();
    expect((await reads().editor(identity(), row.stay_id)).observation.link).toBeNull();
    await channel(await packet('link', {}, row.stay_id, row.booking_id)).submit();
    expect((await reads().editor(identity(), row.stay_id)).observation.booking).toEqual(before.observation.booking);
  });
  it('Trash/restore and paged history preserve original content without operational session fields', async () => {
    await channel(await packet('trash', {})).submit();
    expect((await reads().list(identity())).stays).toHaveLength(0);
    expect((await reads().editor(identity(), row.stay_id)).state).toBe('trash');
    await channel(await packet('restore', {})).submit();
    const h = await reads().history(identity(), row.stay_id, null, 1);
    expect(h.has_more).toBe(true);
    expect(h.events[0]).not.toHaveProperty('session_id');
    const next = await reads().history(identity(), row.stay_id, h.next_before_sequence, 1);
    expect(next.events[0].sequence).toBeLessThan(h.events[0].sequence);
  });
  it('reconciles a genuinely committed save after the reply is lost and a new login occurs', async () => {
    const p = await packet(),
      handler = createStayHandler(repo);
    let lose = true;
    api.defaults.adapter = createFamilyAxiosAdapter(async (request) => {
      const out = await handler(request);
      if (lose && request.method === 'POST') {
        lose = false;
        throw Error('Synthetic lost browser reply after actual server commit');
      }
      return out;
    });
    await expect(channel(p).submit()).rejects.toBeDefined();
    expect(await offlineDb.mutationQueue.get(p.command.operation_id)).toBeDefined();
    sdk = client(true);
    const fresh = channel(p);
    await expect(fresh.submit()).rejects.toBeDefined();
    expect(await fresh.reconcile()).toBe('committed');
    expect(await offlineDb.mutationQueue.get(p.command.operation_id)).toBeUndefined();
    expect((await reads().editor(identity(), row.stay_id)).observation.stay.notes).toBe('Real SDK save');
  });
  it('fresh-login cancellation is terminal and a delayed original-session write is refused', async () => {
    const p = await packet();
    setForcedOffline(true);
    await expect(channel(p).submit()).rejects.toBeDefined();
    setForcedOffline(false);
    sdk = client(true);
    const fresh = channel(p);
    expect(await fresh.reconcile()).toBe('unknown');
    expect(await fresh.reconcile(true)).toBe('cancelled');
    sdk = client();
    await expect(reads().execute(p)).rejects.toMatchObject({ status: 409 });
    expect((await reads().editor(identity(), row.stay_id)).observation.stay.notes).not.toBe('Real SDK save');
  });
});
