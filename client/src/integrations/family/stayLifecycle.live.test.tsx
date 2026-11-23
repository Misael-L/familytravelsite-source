import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cleanup } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { http, passthrough } from 'msw';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api from '../../api/client';
import { offlineDb, reopenAnonymous, reopenForUser } from '../../db/offlineDb';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { clearSignedOut } from '../../utils/signedOut';
import { bookingStayView } from './bookingStayContract';
import { currentOfflineTripSession } from './offlineTripSession';
import { plannerCacheDb } from './plannerCache';
import { createPlannerStayRecovery } from './plannerStayRecovery';
import { familyAuthStore, FamilyFrontendRepository } from './repository';
import { StayCommandSession } from './stayCommandSession';
import { stayEnvelope, stayScope } from './stayContract';
import { createStayHandler } from './stayHandler';
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
  actors: Record<string, { token: string; user_id: string; family_id: string; person_id: string; session_id: string }>;
  fixtures: { kind: string; trip_id: string; stay_id: string; location_id: string; booking_id: string }[];
};
const file = process.env.FAMILY_STAY_LIFECYCLE_FIXTURE;
const live = file ? (JSON.parse(readFileSync(file, 'utf8')) as Fixture) : null;
if (live && live.api !== 'http://127.0.0.1:56771') throw Error('Explicit isolated loopback fixture required');
const f = () => {
  if (!live) throw Error('Missing local-only fixture');
  return live;
};
let sdk: SupabaseClient, repo: FamilyFrontendRepository;
const previous = api.defaults.adapter;
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:56771' }));
function client(fresh = false, actor?: string) {
  const key = 'isolated-native-write-' + crypto.randomUUID(),
    original = fresh ? f().fresh_access_token : f().access_token;
  const token = actor ? f().actors[actor].token : original;
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
describe.skipIf(!live)(
  'actual isolated stay lifecycle APIs and original-operation queue; native controls remain gated',
  () => {
    beforeEach(async () => {
      resetAllStores();
      installTestLocks();
      _resetNetworkMode();
      setAuthed(true);
      clearSignedOut();
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
      api.defaults.adapter = createFamilyAxiosAdapter(createStayHandler(repo));
    });
    afterEach(async () => {
      cleanup();
      currentOfflineTripSession()?.dispose();
      api.defaults.adapter = previous;
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      _resetNetworkMode();
      setAuthed(false);
      familyAuthStore.setState(oldFamily, true);
      await resetOfflineTestDatabase();
      await reopenAnonymous();
    });

    const control = (mode: string) =>
      execFileSync('python3', [join(dirname(required(file)), 'fixture_control.py'), 'schedule', mode], {
        stdio: 'pipe',
      });
    async function core(trip: string) {
      const r = await sdk.rpc('get_family_trip_booking_view_v2', { p_trip_id: trip });
      if (r.error) throw r.error;
      return bookingStayView.parse(r.data);
    }
    function scope(q: ReturnType<typeof scenario>) {
      return stayScope.parse({
        version: 1,
        layer: 'published',
        trip_id: q.trip_id,
        family_id: f().family_id,
        person_id: f().person_id,
        user_id: f().user_id,
        session_id: f().session_id,
      });
    }
    async function intent(kind: string, action: 'trash' | 'restore') {
      const q = scenario(kind),
        ctx = await createStayTransport().context(scope(q), q.stay_id);
      expect(ctx.native_controls).toBe(false);
      const p = stayEnvelope.parse({
        version: 1,
        source_url: f().api,
        command: {
          action,
          stay_id: q.stay_id,
          operation_id: crypto.randomUUID(),
          scope: scope(q),
          observation: ctx.observation,
          changes: {},
          reservation_id: null,
        },
      });
      return { q, p, session: new StayCommandSession(repo, { source: () => f().api, disposed: () => false }, p) };
    }
    async function restore(kind: string) {
      const r = await intent(kind, 'restore');
      await r.session.submit();
      return r;
    }
    function recovery(trip: string) {
      return createPlannerStayRecovery(repo, trip, { source: () => f().api, current: () => true }).inspect();
    }
    const bookingFacts = (p: Awaited<ReturnType<typeof core>>) =>
      p.bookings.map(({ stay_link: _link, ...facts }) => facts);
    it('Trash/restore retains the same identity, independent booking, lodging and immutable history', async () => {
      await restore('base');
      const { q, p, session } = await intent('base', 'trash'),
        before = await core(q.trip_id);
      await session.submit();
      const trashed = await core(q.trip_id);
      expect(trashed.stays.some((s) => s.stay.id === q.stay_id)).toBe(false);
      expect(bookingFacts(trashed)).toEqual(bookingFacts(before));
      expect(trashed.bookings.find((b) => b.stay_link?.id === q.stay_id)?.stay_link?.state).toBe('retained');
      expect(trashed.planner.state.locations).toEqual(before.planner.state.locations);
      const r = await restore('base'),
        after = await core(q.trip_id);
      expect(after.stays[0].stay.id).toBe(q.stay_id);
      expect(after.stays[0].stay.deleted_at).toBeNull();
      expect(after.stays[0].link).toEqual(before.stays[0].link);
      expect(after.bookings).toEqual(before.bookings);
      const h = await createStayTransport().history(p.command.scope, q.stay_id);
      expect(
        h.events
          .filter((e) => [p.command.operation_id, r.p.command.operation_id].includes(e.operation_id))
          .map((e) => e.action)
      ).toEqual(['restore', 'trash']);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    });
    it('identical Trash and restore retries return one original receipt without duplicate rows', async () => {
      const x = await intent('repeated', 'trash'),
        before = await core(x.q.trip_id),
        a = await x.session.submit(),
        b = await x.session.submit();
      expect(a).toEqual(b);
      const mid = await core(x.q.trip_id);
      expect(mid.stays).toEqual(before.stays.filter((s) => s.stay.id !== x.q.stay_id));
      const r = await restore('repeated');
      expect(await r.session.submit()).toEqual(await r.session.submit());
      const h = await createStayTransport().history(x.p.command.scope, x.q.stay_id);
      expect(h.events.filter((e) => e.operation_id === x.p.command.operation_id)).toHaveLength(1);
      expect(h.events.filter((e) => e.operation_id === r.p.command.operation_id)).toHaveLength(1);
      expect((await core(x.q.trip_id)).stays.map((s) => s.stay.id)).toEqual(before.stays.map((s) => s.stay.id));
    });
    it('a real intervening edit rejects an old Trash observation and retains its original intent', async () => {
      const x = await intent('base', 'trash'),
        notes = 'Intervening lifecycle edit ' + crypto.randomUUID(),
        edit = stayEnvelope.parse({
          ...x.p,
          command: {
            ...x.p.command,
            action: 'save',
            operation_id: crypto.randomUUID(),
            changes: { notes },
          },
        });
      await createStayTransport().execute(edit);
      await expect(x.session.submit()).rejects.toThrow();
      expect((await core(x.q.trip_id)).stays[0].stay.notes).toBe(notes);
      expect(await offlineDb.mutationQueue.count()).toBe(1);
    });
    it('offline Trash survives IndexedDB reopening and startup recovery retries its exact original operation', async () => {
      const x = await intent('base', 'trash');
      setForcedOffline(true);
      await expect(x.session.submit()).rejects.toMatchObject({ code: 'stay_queued' });
      const original = required((await offlineDb.mutationQueue.toArray())[0]);
      offlineDb.close();
      await offlineDb.open();
      expect((await offlineDb.mutationQueue.toArray())[0]).toEqual(original);
      setForcedOffline(false);
      useTripStore.setState({ trip: null });
      const r = await recovery(x.q.trip_id);
      expect(await r?.check()).toBe('unknown');
      expect(await r?.retry()).toBe('committed');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect((await core(x.q.trip_id)).stays.some((s) => s.stay.id === x.q.stay_id)).toBe(false);
      await restore('base');
    });
    it.each(['trash', 'restore'] as const)(
      'a lost %s reply after SQL commit resolves the original receipt without a second mutation',
      async (action) => {
        if (action === 'restore') {
          const t = await intent('base', 'trash');
          await t.session.submit();
        }
        const x = await intent('base', action),
          rpc = sdk.rpc.bind(sdk);
        let lost = false;
        const calls = vi.spyOn(sdk, 'rpc').mockImplementation((async (name: string, args: Record<string, unknown>) => {
          const r = await rpc(name, args);
          if (name === action + '_family_stay_v1' && !r.error && !lost) {
            lost = true;
            throw Error('Lost lifecycle reply after SQL commit');
          }
          return r;
        }) as never);
        await expect(x.session.submit()).rejects.toThrow();
        expect(lost).toBe(true);
        expect(await offlineDb.mutationQueue.count()).toBe(1);
        const r = await recovery(x.q.trip_id);
        expect(await r?.check()).toBe('committed');
        expect(calls.mock.calls.filter(([n]) => n === action + '_family_stay_v1')).toHaveLength(1);
        expect(await offlineDb.mutationQueue.count()).toBe(0);
        calls.mockRestore();
        if (action === 'trash') await restore('base');
      }
    );
    it('a new valid session cancels unknown restore intent without rebinding the original write', async () => {
      const x = await intent('retained', 'restore');
      setForcedOffline(true);
      await expect(x.session.submit()).rejects.toThrow();
      setForcedOffline(false);
      sdk = client(true);
      await sdk.auth.getSession();
      const calls = vi.spyOn(sdk, 'rpc');
      useTripStore.setState({ trip: null });
      const r = await recovery(x.q.trip_id);
      expect(r?.intent).toBe('cancel-command');
      expect(await r?.check()).toBe('unknown');
      expect(await r?.retry()).toBe('cancelled');
      expect(calls.mock.calls.some(([n]) => n === 'restore_family_stay_v1')).toBe(false);
      expect((await core(x.q.trip_id)).stays.some((s) => s.stay.id === x.q.stay_id)).toBe(false);
    });
    it.each(['propose', 'deny'])(
      'restore reevaluates current schedule authority after %s replaces Direct, without requiring booking-edit authority',
      async (mode) => {
        await restore('timed');
        const q = scenario('timed'),
          before = await core(q.trip_id);
        control('allow');
        const other = client(false, 'editor');
        await other.auth.getSession();
        const ctx = async () => {
          const r = await other.rpc('get_family_stay_command_context_v1', {
            p_trip_id: q.trip_id,
            p_stay_id: q.stay_id,
            p_location_id: null,
            p_reservation_id: null,
          });
          expect(r.error).toBeNull();
          return r.data;
        };
        const t = await ctx();
        expect(t.admission).toMatchObject({ trash: true, restore: true, link: false });
        const args = (c: typeof t) => ({
          p_trip_id: q.trip_id,
          p_stay_id: q.stay_id,
          p_operation_id: crypto.randomUUID(),
          p_scope: c.scope,
          p_observation: c.observation,
        });
        expect((await other.rpc('trash_family_stay_v1', args(t))).error).toBeNull();
        const observed = await ctx();
        control(mode);
        expect((await other.rpc('restore_family_stay_v1', args(observed))).error).toMatchObject({ code: '42501' });
        expect(bookingFacts(await core(q.trip_id))).toEqual(bookingFacts(before));
        control('allow');
        expect((await other.rpc('restore_family_stay_v1', args(await ctx()))).error).toBeNull();
        control('clear');
        expect(bookingFacts(await core(q.trip_id))).toEqual(bookingFacts(before));
      }
    );
    it.each(['foreign', 'aal1', 'revoked'])(
      'actual signed %s credentials cannot read lifecycle context or Trash the original stay',
      async (actor) => {
        const x = await intent('overnight', 'trash'),
          before = await core(x.q.trip_id),
          other = client(false, actor);
        await other.auth.getSession();
        expect(
          (await other.rpc('get_family_stay_command_context_v1', { p_trip_id: x.q.trip_id, p_stay_id: x.q.stay_id }))
            .error
        ).not.toBeNull();
        const a = f().actors[actor],
          p = { ...x.p.command.scope, user_id: a.user_id, person_id: a.person_id, session_id: a.session_id };
        expect(
          (
            await other.rpc('trash_family_stay_v1', {
              p_trip_id: x.q.trip_id,
              p_stay_id: x.q.stay_id,
              p_operation_id: crypto.randomUUID(),
              p_scope: p,
              p_observation: x.p.command.observation,
            })
          ).error
        ).not.toBeNull();
        const after = await core(x.q.trip_id);
        expect(after.stays).toEqual(before.stays);
        expect(after.bookings).toEqual(before.bookings);
      }
    );
    it('modified retained queue metadata refuses recovery without clearing or publishing it', async () => {
      const x = await intent('base', 'trash');
      setForcedOffline(true);
      await expect(x.session.submit()).rejects.toThrow();
      setForcedOffline(false);
      const r = await recovery(x.q.trip_id);
      const row = required((await offlineDb.mutationQueue.toArray())[0]);
      await offlineDb.mutationQueue.update(row.id, { attempts: 1 });
      await expect(r?.retry()).rejects.toThrow();
      expect(await offlineDb.mutationQueue.count()).toBe(1);
      expect((await core(x.q.trip_id)).stays.some((s) => s.stay.id === x.q.stay_id)).toBe(true);
    });
  }
);
