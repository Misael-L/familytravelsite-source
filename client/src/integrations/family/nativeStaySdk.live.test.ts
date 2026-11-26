import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { bypass } from 'msw';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coherentTripCapture, coherentTripData } from '../../../tests/helpers/familyCompleteTripV4';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode } from '../../sync/networkMode';
import { checkedBookingStayView } from './bookingStayContract';
import { createNativeStayReader } from './bookingStayRead';
import { projectCompleteTrip } from './completeTripProjection';
import { parseCompleteTripV4, serializeCompleteTripV4 } from './completeTripV4';
import { FamilyIdentityRegistry } from './identity';
import { originalNativeStayIntent } from './nativeStayContract';
import { checkedNativeStayView } from './nativeStayReadContract';
import { createNativeStayTransport } from './nativeStayTransport';
import { FamilyFrontendRepository } from './repository';
import { prepareStayBundleIntent } from './stayBundleContract';
import { createStayBundleTransport } from './stayBundleTransport';
import { stayIdentity } from './stayContract';
import { createStayTransport } from './stayTransport';
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
  fixtures: { kind: string; trip_id: string; location_id: string }[];
};
const file = process.env.FAMILY_NATIVE_STAY_CLIENT_FIXTURE;
if (file && file !== '/private/tmp/trek-u05b2b3c5-client-20261114/sdk-fixture-private.json')
  throw new Error('Explicit owned local fixture required');
const live = file ? (JSON.parse(readFileSync(file, 'utf8')) as Fixture) : null;
if (live && live.api !== 'http://127.0.0.1:57171') throw new Error('Hosted native fixture refused');
let sdk: SupabaseClient,
  lose = false,
  executes = 0;
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Required synthetic observation missing');
  return value;
}
const fixture = () => {
  if (!live) throw Error('Missing local fixture');
  return live;
};
const client = (token: string) =>
  createClient(fixture().api, fixture().anon_key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: 'Bearer ' + token },
      fetch: async (input, init) => {
        const request = new Request(input, init);
        if (!request.url.startsWith(fixture().api + '/rest/v1/')) throw Error('Unexpected local SDK route');
        const execute = request.url.endsWith('/rpc/execute_family_native_stay_v1');
        if (execute) executes++;
        const response = await fetch(bypass(request));
        if (lose && execute) {
          expect(response.status).toBe(200);
          lose = false;
          throw new TypeError('Deliberately lost committed response');
        }
        return response;
      },
    },
  });
async function raw(name: string, args: Record<string, unknown>) {
  const r = await sdk.rpc(name, args);
  if (r.error) throw r.error;
  return r.data;
}
const scope = (trip: string, fresh = false) => ({
  version: 1 as const,
  layer: 'published' as const,
  trip_id: trip,
  user_id: fixture().user_id,
  family_id: fixture().family_id,
  person_id: fixture().person_id,
  session_id: fresh ? fixture().fresh_session_id : fixture().session_id,
});
async function createPacket(kind = 'base', clocks: Record<string, unknown> = {}) {
  const q = fixture().fixtures.find((f) => f.kind === kind);
  if (!q) throw Error('Missing synthetic trip');
  const core = checkedBookingStayView(
    await raw('get_family_trip_booking_view_v2', { p_trip_id: q.trip_id }),
    stayIdentity.parse(scope(q.trip_id))
  );
  const stay_id = crypto.randomUUID(),
    reservation_id = crypto.randomUUID(),
    context = await createStayBundleTransport().context(scope(q.trip_id), {
      p_location_id: q.location_id,
      p_arrival_day_id: core.days[0].id,
      p_departure_day_id: core.days[core.days.length - 1].id,
      p_stay_id: stay_id,
      p_reservation_id: reservation_id,
    });
  const inner = prepareStayBundleIntent({
    source_url: fixture().api,
    context,
    operation_id: crypto.randomUUID(),
    stay_id,
    reservation_id,
    stay: {
      location_id: q.location_id,
      arrival_date: context.observation.arrival_day.civil_day,
      departure_date: context.observation.departure_day.civil_day,
      ...clocks,
    },
    reservation: { title: 'Actual native client lodging', status: 'pending' },
  }).command;
  return createNativeStayTransport().context(fixture().api, inner, crypto.randomUUID());
}
async function view(trip: string) {
  return checkedNativeStayView(
    await raw('get_family_native_stay_view_v1', { p_trip_id: trip }),
    stayIdentity.parse(scope(trip))
  );
}
async function existing(
  p: Awaited<ReturnType<typeof createPacket>>,
  action: 'save' | 'trash' | 'restore',
  keep = false
) {
  const c = await createStayTransport().context(p.command.scope, p.command.stay_id, null, null);
  return createNativeStayTransport().context(
    fixture().api,
    {
      action,
      operation_id: crypto.randomUUID(),
      stay_id: p.command.stay_id,
      scope: c.scope,
      observation: c.observation,
      changes: {},
      reservation_id: null,
    },
    crypto.randomUUID(),
    keep
  );
}
describe.skipIf(!live)('actual installed native-stay client contracts on guarded schema135', () => {
  afterEach(() => {
    _resetNetworkMode();
    setAuthed(false);
  });
  beforeEach(() => {
    sdk = client(fixture().access_token);
    lose = false;
    executes = 0;
  });
  it('prepares and creates only the whole native operation, then validates the actual owned core', async () => {
    const p = await createPacket(),
      a = await createNativeStayTransport().execute(p),
      v = await view(p.command.scope.trip_id);
    expect(a.operation_id).toBe(p.command.operation_id);
    expect(executes).toBe(1);
    expect(v.core.stays.some((s) => s.stay.id === p.command.stay_id)).toBe(true);
    expect(
      v.core.planner.state.visits.some((s) => s.owning_stay_id === p.command.stay_id && s.starts_at === null)
    ).toBe(true);
  });
  it('runs the real fenced reader through the installed native RPC without publishing a store', async () => {
    _resetNetworkMode();
    setAuthed(true);
    const f = fixture(),
      trip = f.fixtures[0].trip_id;
    const repo = new FamilyFrontendRepository(
      async () => ({
        userId: f.user_id,
        familyId: f.family_id,
        personId: f.person_id,
        user: { username: 'Synthetic', email: 'fixture@invalid.test', avatar_url: null, created_at: '2026-01-01' },
      }),
      undefined,
      () => ({ userId: f.user_id, familyId: f.family_id, personId: f.person_id, source: f.api })
    );
    await repo.session();
    const selected = (await repo.views()).ids.register('trip', trip);
    useTripStore.setState({ trip: { id: selected } as never });
    const before = useTripStore.getState();
    const value = await createNativeStayReader(repo, {
      source: () => f.api,
      auth: async () => ({ user_id: f.user_id, session_id: f.session_id }),
    })(selected);
    expect(value.format).toBe('family.native-stay-view.v1');
    expect(value.core.trip_id).toBe(trip);
    expect(useTripStore.getState()).toBe(before);
  });
  it('exact parallel retries keep original decision without duplicating the deliberate stay', async () => {
    const p = await createPacket(),
      t = createNativeStayTransport(),
      [a, b] = await Promise.all([t.execute(p), t.execute(p)]);
    expect(a).toEqual(b);
    expect(
      (await view(p.command.scope.trip_id)).core.stays.filter((s) => s.stay.id === p.command.stay_id)
    ).toHaveLength(1);
  });
  it('inspects a genuinely lost committed response without another execute', async () => {
    const p = await createPacket(),
      t = createNativeStayTransport();
    lose = true;
    await expect(t.execute(p)).rejects.toBeDefined();
    expect(lose).toBe(false);
    const out = await t.outcome(p, p.command.scope);
    expect(out.status).toBe('committed');
    expect(executes).toBe(1);
  });
  it('fresh login inspects and cancels but cannot execute an original session command', async () => {
    const p = await createPacket();
    sdk = client(fixture().fresh_access_token);
    const t = createNativeStayTransport(),
      now = scope(p.command.scope.trip_id, true);
    expect((await t.outcome(p, now)).status).toBe('unknown');
    await expect(t.execute(p)).rejects.toMatchObject({ status: 409 });
    expect((await t.outcome(p, now, true)).status).toBe('cancelled');
    sdk = client(fixture().access_token);
    await expect(t.execute(p)).rejects.toMatchObject({ status: 409 });
  });
  it('confirmed Trash is discoverable and restores the original arrival without editing booking facts', async () => {
    const p = await createPacket('retained'),
      t = createNativeStayTransport(),
      a = await t.execute(p),
      before = await view(p.command.scope.trip_id);
    const booking = before.core.bookings.find(
      (b) => b.record.id === ('reservation_id' in p.command.inner ? p.command.inner.reservation_id : null)
    );
    await t.execute(await existing(p, 'trash'));
    const page = await t.trash(p.command.scope.trip_id);
    expect(page.items.some((r) => r.id === p.command.stay_id && r.restore_available)).toBe(true);
    const restored = await t.execute(await existing(p, 'restore'));
    expect(restored.arrival_visit_id).toBe(a.arrival_visit_id);
    const current = await view(p.command.scope.trip_id);
    expect(current.core.bookings.find((b) => b.record.id === booking?.record.id)?.record).toEqual(booking?.record);
  });
  it('reads and accepts the actual unchanged revision of a no-op stay save', async () => {
    const p = await createPacket();
    await createNativeStayTransport().execute(p);
    const noOp = await existing(p, 'save'),
      ack = await createNativeStayTransport().execute(noOp);
    expect(ack.trip_revision_after).toBe(noOp.command.observation.trip_revision);
  });
  it('round-trips the real native core through the lossless complete cache and ownership projection', async () => {
    const p = await createPacket(),
      t = createNativeStayTransport();
    await t.execute(p);
    const native = await view(p.command.scope.trip_id),
      base = coherentTripCapture(),
      s = native.core.planner.scope;
    const key = JSON.stringify([1, fixture().api, s.user_id, s.family_id, s.person_id, s.trip_id, s.layer]),
      ownerKey = JSON.stringify([1, fixture().api, s.user_id, s.family_id, s.person_id]);
    const c = {
      ...base,
      source: fixture().api,
      scope: s,
      ownership: { ...base.ownership, key, ownerKey },
      data: { ...coherentTripData(native.core), native_stay_format: native.format },
    };
    const e = await serializeCompleteTripV4(c),
      parsed = await parseCompleteTripV4(JSON.stringify(e), { ...c, now: c.verifiedAt }),
      projected = await projectCompleteTrip(parsed, () => {});
    expect(parsed.data.core).toEqual(native.core);
    const ids = new FamilyIdentityRegistry(s.user_id);
    const owned = required(native.core.planner.state.visits.find((v) => v.owning_stay_id));
    expect(owned).toBeDefined();
    const assignment = projected.bundle.days
      .flatMap((d) => d.assignments ?? [])
      .find((a) => a.id === ids.register('assignment', owned.id));
    expect(assignment?.accommodation_id).toBe(ids.register('stay', required(owned.owning_stay_id)));
  });
  it('rejects unknown original fields before reaching the actual SDK', async () => {
    const p = await createPacket();
    Object.assign(p.command, { future: true });
    expect(() => originalNativeStayIntent(p)).toThrow();
    expect(executes).toBe(0);
  });
});
