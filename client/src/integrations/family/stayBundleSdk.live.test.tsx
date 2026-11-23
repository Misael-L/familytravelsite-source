import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'fake-indexeddb/auto';
import { bypass, http, HttpResponse, passthrough } from 'msw';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import { invalidateOfflineSession, offlineDb, reopenAnonymous, reopenForUser } from '../../db/offlineDb';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { clearSignedOut } from '../../utils/signedOut';
import { familyAuthStore, FamilyFrontendRepository } from './repository';
import { StayBundleCommandSession } from './stayBundleCommandSession';
import { prepareStayBundleIntent, type StayBundleEnvelope } from './stayBundleContract';
import { createStayBundleTransport } from './stayBundleTransport';
import { stayScope } from './stayContract';

type Actor = { token: string; user_id: string; person_id: string; family_id: string; session_id: string };
type Fixture = {
  api: string;
  anon_key: string;
  access_token: string;
  fresh_access_token: string;
  user_id: string;
  person_id: string;
  family_id: string;
  session_id: string;
  fresh_session_id: string;
  actors: Record<string, Actor>;
  fixtures: { kind: string; trip_id: string; stay_id: string; location_id: string; booking_id: string }[];
};
const file = process.env.FAMILY_STAY_BUNDLE_ADAPTER_FIXTURE;
const live = file ? (JSON.parse(readFileSync(file, 'utf8')) as Fixture) : null;
if (live && live.api !== 'http://127.0.0.1:56971') throw new Error('Explicit isolated bundle-adapter fixture required');
const f = () => {
  if (!live) throw new Error('Missing isolated fixture');
  return live;
};
let sdk: SupabaseClient,
  repo: FamilyFrontendRepository,
  source: string,
  disposed: boolean,
  identity: Actor,
  stop: () => void;
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({
  getSupabaseUrl: () => source ?? live?.api ?? 'http://127.0.0.1:56971',
}));
function client(token = f().access_token, user = f().user_id) {
  const key = 'bundle-sdk-' + crypto.randomUUID(),
    memory = new Map([
      [
        key,
        JSON.stringify({
          access_token: token,
          refresh_token: 'synthetic-refresh-not-used',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Date.now() / 1000 + 1800,
          user: {
            id: user,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'bundle@fixture.invalid',
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
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (k) => memory.get(k) ?? null,
        setItem: (k, v) => {
          memory.set(k, v);
        },
        removeItem: (k) => {
          memory.delete(k);
        },
      },
    },
  });
}
async function setupActor(name = 'owner') {
  identity = f().actors[name];
  sdk = client(identity.token, identity.user_id);
  const initialized = await sdk.auth.getSession();
  if (initialized.error || !initialized.data.session) throw new Error('Signed fixture session failed');
  repo = new FamilyFrontendRepository(
    async () => ({
      userId: identity.user_id,
      familyId: identity.family_id,
      personId: identity.person_id,
      user: { username: 'Local bundle', email: 'bundle@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
    }),
    undefined,
    () => ({ userId: identity.user_id, familyId: identity.family_id, personId: identity.person_id, source })
  );
  await repo.session();
  const person = (await repo.views()).ids.register('person', identity.person_id);
  await reopenForUser(person);
  await resetOfflineTestDatabase();
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
    authUserId: identity.user_id,
    familyId: identity.family_id,
    personId: identity.person_id,
    authGate: 'ok',
    authCheckFailed: false,
  });
}
function scenario(kind = 'base') {
  const q = f().fixtures.find((x) => x.kind === kind);
  if (!q) throw new Error('Missing synthetic scenario');
  const id = repo.knownViews()?.ids.register('trip', q.trip_id);
  useTripStore.setState({ trip: { id } as never });
  return q;
}
async function rpc(name: string, args: Record<string, unknown>) {
  const r = await sdk.rpc(name, args);
  if (r.error) throw r.error;
  return r.data;
}
async function packet(kind = 'base') {
  const q = scenario(kind),
    core = await rpc('get_family_trip_booking_view_v2', { p_trip_id: q.trip_id });
  const scope = stayScope.parse({
    version: 1,
    layer: 'published',
    trip_id: q.trip_id,
    family_id: identity.family_id,
    user_id: identity.user_id,
    person_id: identity.person_id,
    session_id: identity.session_id,
  });
  const stay_id = crypto.randomUUID(),
    reservation_id = crypto.randomUUID();
  const context = await createStayBundleTransport().context(scope, {
    p_location_id: q.location_id,
    p_arrival_day_id: core.days[0].id,
    p_departure_day_id: core.days[core.days.length - 1].id,
    p_stay_id: stay_id,
    p_reservation_id: reservation_id,
  });
  return prepareStayBundleIntent({
    source_url: source,
    context,
    stay_id,
    reservation_id,
    operation_id: crypto.randomUUID(),
    stay: {
      location_id: q.location_id,
      arrival_date: context.observation.arrival_day.civil_day,
      departure_date: context.observation.departure_day.civil_day,
    },
    reservation: { title: 'Actual SDK bundle', status: 'pending', confirmation_code: '' },
  });
}
const channel = (p: StayBundleEnvelope) =>
  new StayBundleCommandSession(repo, { source: () => source, disposed: () => disposed }, p);
const row = (p: StayBundleEnvelope) => offlineDb.mutationQueue.get(p.command.operation_id);
function policy(mode: 'allow' | 'propose' | 'deny' | 'clear') {
  if (!file) throw new Error('Missing guarded fixture path');
  execFileSync('python3', [join(dirname(file), 'bundle_fixture_control.py'), mode], { stdio: 'pipe', timeout: 20000 });
}
const oldFamily = familyAuthStore.getState();
describe.skipIf(!live)(
  'actual signed atomic bundle adapter and original-operation queue; native creation stays gated',
  () => {
    beforeEach(async () => {
      stop = () => {};
      resetAllStores();
      installTestLocks();
      _resetNetworkMode();
      setAuthed(true);
      clearSignedOut();
      source = f().api;
      disposed = false;
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      server.use(
        http.all(f().api + '/*', () => passthrough()),
        http.get('*/api/health', () => HttpResponse.json({ status: 'ok' }))
      );
      await setupActor();
      stop = installFamilyCommandRetention();
    });
    afterEach(async () => {
      stop();
      policy('clear');
      vi.restoreAllMocks();
      _resetNetworkMode();
      setAuthed(false);
      familyAuthStore.setState(oldFamily, true);
      await resetOfflineTestDatabase();
      await reopenAnonymous();
    });
    it('creates through actual SDK/SQL and clears the queue only after a coherent read, without native publication', async () => {
      const p = await packet(),
        before = useTripStore.getState(),
        result = await channel(p).submit();
      expect(result.status).toBe('committed');
      if (result.status !== 'committed') throw new Error('No current core');
      const stay = result.current.stays.find((x) => x.stay.id === p.command.stay_id),
        booking = result.current.bookings.find((x) => x.record.id === p.command.reservation_id);
      expect(stay?.link?.reservation_id).toBe(p.command.reservation_id);
      expect(stay?.stay.check_in_time).toBeNull();
      expect(booking?.record.starts_at).toBeNull();
      expect(await row(p)).toBeUndefined();
      expect(useTripStore.getState()).toBe(before);
      expect(await offlineDb.accommodations.count()).toBe(0);
    });
    it('offline close/open keeps exact IDs and body; generic flush never sends the bundle', async () => {
      const p = await packet();
      let sends = 0;
      server.use(
        http.post(f().api + '/rest/v1/rpc/create_family_stay_bundle_v1', () => {
          sends++;
          return passthrough();
        })
      );
      setForcedOffline(true);
      await expect(channel(p).submit()).rejects.toBeDefined();
      const old = await row(p);
      offlineDb.close();
      await offlineDb.open();
      setForcedOffline(false);
      await mutationQueue.flush();
      expect(sends).toBe(0);
      expect(await row(p)).toEqual(old);
      expect(await channel(p).reconcile()).toEqual({ status: 'unknown' });
      expect(await row(p)).toEqual(old);
      await channel(p).submit();
      expect(sends).toBe(1);
      expect(await row(p)).toBeUndefined();
    });
    it('reconciles a genuinely committed but lost reply without another create', async () => {
      const p = await packet();
      let sends = 0;
      server.use(
        http.post(
          f().api + '/rest/v1/rpc/create_family_stay_bundle_v1',
          async ({ request }) => {
            sends++;
            const actual = await fetch(bypass(request));
            expect(actual.status).toBe(200);
            return HttpResponse.error();
          },
          { once: true }
        )
      );
      const c = channel(p);
      await expect(c.submit()).rejects.toBeDefined();
      expect(await row(p)).toBeDefined();
      expect((await c.reconcile()).status).toBe('committed');
      expect(sends).toBe(1);
      expect(await row(p)).toBeUndefined();
    });
    it('known commitment plus failed read retries only the fresh read', async () => {
      const p = await packet();
      let sends = 0;
      server.use(
        http.post(f().api + '/rest/v1/rpc/create_family_stay_bundle_v1', () => {
          sends++;
          return passthrough();
        })
      );
      server.use(
        http.post(
          f().api + '/rest/v1/rpc/get_family_trip_booking_view_v2',
          () => HttpResponse.json({ message: 'Injected read failure' }, { status: 503 }),
          { once: true }
        )
      );
      const c = channel(p);
      await expect(c.submit()).rejects.toBeDefined();
      expect(await row(p)).toBeDefined();
      expect((await c.submit()).status).toBe('committed');
      expect(sends).toBe(1);
      expect(await row(p)).toBeUndefined();
    });
    it('cold recovery recognizes commitment after a failed confirming read', async () => {
      const p = await packet();
      server.use(
        http.post(
          f().api + '/rest/v1/rpc/get_family_trip_booking_view_v2',
          () => HttpResponse.json({}, { status: 503 }),
          { once: true }
        )
      );
      await expect(channel(p).submit()).rejects.toBeDefined();
      expect(await row(p)).toBeDefined();
      expect((await channel(p).reconcile()).status).toBe('committed');
      expect(await row(p)).toBeUndefined();
    });
    it('allows intentional repeated stays with different original identities', async () => {
      const a = await packet();
      await channel(a).submit();
      const b = await packet();
      const out = await channel(b).submit();
      expect(a.command.stay_id).not.toBe(b.command.stay_id);
      expect(a.command.reservation_id).not.toBe(b.command.reservation_id);
      if (out.status !== 'committed') throw new Error('No read');
      expect(out.current.stays.some((x) => x.stay.id === a.command.stay_id)).toBe(true);
      expect(out.current.stays.some((x) => x.stay.id === b.command.stay_id)).toBe(true);
    });
    it('a real competing stay edit refuses a stale creation and retains the original body', async () => {
      const p = await packet(),
        q = scenario(),
        ctx = await rpc('get_family_stay_command_context_v1', {
          p_trip_id: q.trip_id,
          p_stay_id: q.stay_id,
          p_location_id: null,
          p_reservation_id: null,
        });
      await rpc('save_family_stay_v1', {
        p_trip_id: q.trip_id,
        p_stay_id: q.stay_id,
        p_operation_id: crypto.randomUUID(),
        p_scope: ctx.scope,
        p_observation: ctx.observation,
        p_changes: { notes: 'Concurrent edit ' + crypto.randomUUID() },
      });
      await expect(channel(p).submit()).rejects.toMatchObject({ status: 409 });
      expect((await row(p))?.status).toBe('conflict');
      expect((await row(p))?.body).toEqual(p);
    });
    it('fresh valid login can inspect and cancel but cannot submit the old scope', async () => {
      const p = await packet();
      setForcedOffline(true);
      await expect(channel(p).submit()).rejects.toBeDefined();
      setForcedOffline(false);
      sdk = client(f().fresh_access_token);
      const c = channel(p);
      await expect(c.submit()).rejects.toBeDefined();
      expect(await c.reconcile()).toEqual({ status: 'unknown' });
      expect(await c.reconcile(true)).toEqual({ status: 'cancelled' });
      expect(await row(p)).toBeUndefined();
    });
    it('SQL rechecks both Direct domains after a retained operation loses permission', async () => {
      policy('allow');
      await setupActor('editor');
      const p = await packet('timed');
      setForcedOffline(true);
      const c = channel(p);
      await expect(c.submit()).rejects.toBeDefined();
      setForcedOffline(false);
      policy('propose');
      await expect(c.reconcile()).rejects.toMatchObject({ status: 403 });
      expect((await row(p))?.body).toEqual(p);
      policy('allow');
      expect((await c.submit()).status).toBe('committed');
      expect(await row(p)).toBeUndefined();
    });
    it.each(['aal1', 'revoked'])('actual %s session cannot inspect or send retained work', async (actor) => {
      const p = await packet();
      setForcedOffline(true);
      await expect(channel(p).submit()).rejects.toBeDefined();
      setForcedOffline(false);
      sdk = client(f().actors[actor].token);
      await expect(channel(p).reconcile()).rejects.toMatchObject({ status: 403 });
      expect((await row(p))?.body).toEqual(p);
    });
    it('changed metadata during a real successful reply is retained instead of acknowledged', async () => {
      const p = await packet();
      server.use(
        http.post(
          f().api + '/rest/v1/rpc/create_family_stay_bundle_v1',
          async ({ request }) => {
            const actual = await fetch(bypass(request));
            expect(actual.status).toBe(200);
            await offlineDb.mutationQueue.update(p.command.operation_id, { lastError: 'Another queue owner' });
            return actual;
          },
          { once: true }
        )
      );
      await expect(channel(p).submit()).rejects.toBeDefined();
      expect((await row(p))?.lastError).toBe('Another queue owner');
    });
    it('returns a newer actual server edit rather than content from the old receipt', async () => {
      const p = await packet();
      server.use(
        http.post(
          f().api + '/rest/v1/rpc/get_family_trip_booking_view_v2',
          async ({ request }) => {
            const ctx = await rpc('get_family_stay_command_context_v1', {
              p_trip_id: p.command.scope.trip_id,
              p_stay_id: p.command.stay_id,
              p_location_id: null,
              p_reservation_id: null,
            });
            await rpc('save_family_stay_v1', {
              p_trip_id: p.command.scope.trip_id,
              p_stay_id: p.command.stay_id,
              p_operation_id: crypto.randomUUID(),
              p_scope: ctx.scope,
              p_observation: ctx.observation,
              p_changes: { notes: 'Actual newer server note' },
            });
            return fetch(bypass(request));
          },
          { once: true }
        )
      );
      const out = await channel(p).submit();
      if (out.status !== 'committed') throw new Error('No read');
      expect(out.current.stays.find((x) => x.stay.id === p.command.stay_id)?.stay.notes).toBe(
        'Actual newer server note'
      );
    });
    it.each(['source', 'logout'])('retires a real %s-switched response while preserving the queue', async (kind) => {
      const p = await packet();
      server.use(
        http.post(
          f().api + '/rest/v1/rpc/create_family_stay_bundle_v1',
          async ({ request }) => {
            const actual = await fetch(bypass(request));
            expect(actual.status).toBe(200);
            if (kind === 'source') source += '/another-source';
            else {
              setAuthed(false);
              invalidateOfflineSession();
            }
            return actual;
          },
          { once: true }
        )
      );
      await expect(channel(p).submit()).rejects.toBeDefined();
      expect(await row(p)).toBeDefined();
      expect(await offlineDb.accommodations.count()).toBe(0);
    });
  }
);
