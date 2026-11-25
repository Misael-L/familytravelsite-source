import axios from 'axios';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import api from '../../api/client';
import { offlineDb } from '../../db/offlineDb';
import { placeRepo } from '../../repo/placeRepo';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode } from '../../sync/networkMode';
import { createFamilyApplicationHandler } from './applicationHandler';
import { NOT_HANDLED } from './listHandler';
import { createPlannerReadCoordinator } from './plannerState';
import type { PlannerState } from './plannerStateContract';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => db }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => db }));
const uuid = (n: number) => `b0400000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const trip = uuid(1),
  family = uuid(2),
  city = uuid(3),
  at = '2026-11-05T00:00:00Z';
const prefix = `/trips/${trip}/family/destinations/bridge`;
type Observation = { place_id: string; expected_category_id: string | null };
type Receipt = {
  version: 1;
  trip_id: string;
  trip_revision: number;
  created_count: number;
  remaining_unmaterialized_count: number;
  mappings: {
    source_place_id: string;
    location_id: string;
    location_revision: number;
    created: boolean;
    category_disposition: string;
  }[];
};
let state: PlannerState,
  repo: FamilyFrontendRepository,
  client: ReturnType<typeof axios.create>,
  session: FamilySession;
let loseAck: boolean, switchScope: boolean, deny: { code: string } | null;
const receipts = new Map<string, { hash: string; result: Receipt }>(),
  original = api.defaults.adapter;
function makeLocation(id: string, source: string) {
  return {
    id,
    trip_id: trip,
    revision: 1,
    deleted_at: null,
    source: { kind: 'place' as const, id: source },
    source_archived: false,
    name: 'Puebla',
    description: 'Catalog text',
    notes: null,
    latitude: 19.04,
    longitude: -98.19,
    is_located: true,
    address: null,
    website: null,
    phone: null,
    context_place_id: null,
    context_place_name: null,
    country_id: uuid(4),
    country_name: 'Mexico',
    country_code: 'MX',
    time_zone: 'America/Mexico_City',
    source_type_label: 'City',
    cover_media_id: null,
    category: null,
    overrides: {},
    created_at: at,
    updated_at: at,
  };
}
beforeEach(async () => {
  await resetOfflineTestDatabase();
  localStorage.clear();
  mutationQueue._resetFlushing();
  _resetNetworkMode();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  state = {
    version: 1,
    trip_id: trip,
    family_id: family,
    trip_revision: 7,
    locations: [],
    visits: [],
    days: [],
    notes: [],
    destinations: [{ source_place_id: city, location_id: null, legacy_category_id: null }],
  };
  session = {
    userId: uuid(90),
    familyId: family,
    personId: uuid(91),
    user: { username: 'Fixture', email: 'fixture@example.invalid', avatar_url: null, created_at: at },
  };
  repo = new FamilyFrontendRepository(async () => session);
  loseAck = false;
  switchScope = false;
  deny = null;
  receipts.clear();
  db.rpc.mockReset();
  db.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'get_family_trip_planner_state_v1') return { data: structuredClone(state), error: null };
    if (deny) return { data: null, error: deny };
    if (name !== 'bridge_family_trip_destinations_v1') throw new Error('Unexpected operation ' + name);
    const rows = args.p_destinations as Observation[],
      key = String(args.p_operation_id);
    const hash = JSON.stringify([
      args.p_expected_revision,
      [...rows].sort((a, b) => a.place_id.localeCompare(b.place_id)),
    ]);
    const old = receipts.get(key);
    if (old && old.hash !== hash) return { data: null, error: { code: '40001' } };
    if (!old) {
      if (args.p_expected_revision !== state.trip_revision) return { data: null, error: { code: '40001' } };
      const mappings: Receipt['mappings'] = [];
      let made = 0;
      for (const row of rows) {
        const d = state.destinations.find((v) => v.source_place_id === row.place_id);
        if (!d || d.legacy_category_id !== row.expected_category_id) return { data: null, error: { code: '40001' } };
        const existed = d.location_id !== null;
        if (!existed) {
          d.location_id = uuid(100 + state.locations.length);
          state.locations.push(makeLocation(d.location_id, d.source_place_id));
          made++;
        }
        mappings.push({
          source_place_id: d.source_place_id,
          location_id: String(d.location_id),
          location_revision: 1,
          created: !existed,
          category_disposition: existed ? 'existing_preserved' : 'destination_copied',
        });
      }
      if (made) state.trip_revision++;
      receipts.set(key, {
        hash,
        result: {
          version: 1,
          trip_id: trip,
          trip_revision: state.trip_revision,
          created_count: made,
          remaining_unmaterialized_count: state.destinations.filter((d) => !d.location_id).length,
          mappings,
        },
      });
    }
    if (switchScope) {
      session = { ...session, familyId: uuid(99) };
      repo.acceptSession(session);
    }
    if (loseAck) {
      loseAck = false;
      return { data: null, error: { message: 'Lost acknowledgement' } };
    }
    return { data: receipts.get(key)?.result, error: null };
  });
  const read = createPlannerReadCoordinator(repo),
    application = createFamilyApplicationHandler(repo);
  const adapter = createFamilyAxiosAdapter(async (request) => {
    const result = await read(request);
    return result === NOT_HANDLED ? application(request) : result;
  });
  client = axios.create({ adapter });
  api.defaults.adapter = adapter;
});
afterEach(async () => {
  api.defaults.adapter = original;
  setAuthed(false);
  await resetOfflineTestDatabase();
  vi.restoreAllMocks();
});
const body = () => ({
  scope: { user_id: uuid(90), family_id: family, person_id: uuid(91) },
  operation_id: uuid(10),
  expected_revision: 7,
  destinations: [{ place_id: city, expected_category_id: null }],
});
async function bridge() {
  return (await client.post(prefix, body())).data;
}
async function nativeTrip() {
  return (await repo.views()).ids.register('trip', trip);
}

describe('Explicit destination bridge through actual application, native readers and queued retries', () => {
  it('loads an unvisited city through native readers after one explicit mutation and snapshot readback', async () => {
    const result = await bridge();
    expect(result.operation.created_count).toBe(1);
    expect(result.state.readiness.ready).toBe(true);
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual([
      'get_family_trip_planner_state_v1',
      'bridge_family_trip_destinations_v1',
      'get_family_trip_planner_state_v1',
    ]);
    expect(db.rpc).toHaveBeenCalledWith('bridge_family_trip_destinations_v1', {
      p_trip_id: trip,
      p_operation_id: uuid(10),
      p_expected_revision: 7,
      p_destinations: body().destinations,
    });
    const { places } = await placeRepo.list(await nativeTrip());
    expect(places[0].name).toBe('Puebla');
    expect(places[0].description).toBe('Catalog text');
    expect(places[0].notes).toBeNull();
    expect(state.visits).toEqual([]);
    expect((await repo.views()).ids.uuid('place', places[0].id)).toBe(uuid(100));
    await offlineDb.transaction('r', offlineDb.places, async () => expect(await offlineDb.places.count()).toBe(1));
  });
  it('normalizes observed UUID text before validating the canonical command receipt', async () => {
    const input = body();
    input.destinations[0].place_id = city.toUpperCase();
    const result = (await client.post(prefix, input)).data;
    expect(result.operation.mappings[0].source_place_id).toBe(city);
    expect(db.rpc).toHaveBeenCalledWith(
      'bridge_family_trip_destinations_v1',
      expect.objectContaining({ p_destinations: body().destinations })
    );
  });
  it('never bridges automatically on a planner read and refuses incomplete native success', async () => {
    const result = (await client.get(`/trips/${trip}/family/planner-state`)).data;
    expect(result.destinations[0].location_id).toBeNull();
    await expect(placeRepo.list(await nativeTrip())).rejects.toMatchObject({ response: { status: 409 } });
    expect(db.rpc.mock.calls.every(([name]) => name === 'get_family_trip_planner_state_v1')).toBe(true);
  });
  it('returns an immutable retry receipt plus newer current notes without overwriting saved content', async () => {
    const first = await bridge();
    state.locations[0].notes = 'Later personal note';
    state.locations[0].revision = 2;
    const replay = await bridge();
    expect(replay.operation).toEqual(first.operation);
    expect(replay.state.locations[0].notes).toBe('Later personal note');
    expect(state.locations).toHaveLength(1);
  });
  it('preserves intentional existing overrides while reusing their saved UUID', async () => {
    const l = makeLocation(uuid(88), city);
    l.name = 'Personal name';
    state.locations.push({ ...l, notes: 'Keep me', description: 'Own description' });
    state.destinations[0].location_id = uuid(88);
    const result = await bridge();
    expect(result.operation.created_count).toBe(0);
    expect(result.state.locations[0]).toMatchObject({
      id: uuid(88),
      name: 'Personal name',
      notes: 'Keep me',
      description: 'Own description',
    });
  });
  it('retries a lost acknowledgement with the original operation and observed revision', async () => {
    loseAck = true;
    await expect(bridge()).rejects.toMatchObject({ response: { status: 503 } });
    const result = await bridge();
    expect(result.operation.created_count).toBe(1);
    expect(receipts.size).toBe(1);
    expect(state.locations).toHaveLength(1);
    expect(
      db.rpc.mock.calls
        .filter(([name]) => name === 'bridge_family_trip_destinations_v1')
        .every(([, args]) => args.p_expected_revision === 7)
    ).toBe(true);
  });
  it('uses the actual IndexedDB queue operation header after a lost acknowledgement', async () => {
    const id = uuid(11);
    loseAck = true;
    await mutationQueue.enqueue({
      id,
      tripId: await nativeTrip(),
      method: 'POST',
      url: prefix,
      body: { scope: body().scope, expected_revision: 7, destinations: body().destinations },
    });
    await mutationQueue.flush();
    expect((await offlineDb.mutationQueue.get(id))?.status).toBe('pending');
    await offlineDb.mutationQueue.update(id, { retryAfter: undefined });
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.get(id)).toBeUndefined();
    expect(state.locations).toHaveLength(1);
    expect(
      db.rpc.mock.calls
        .filter(([name]) => name === 'bridge_family_trip_destinations_v1')
        .every(([, args]) => args.p_operation_id === id && args.p_expected_revision === 7)
    ).toBe(true);
  });
  it.each([
    ['42501', 403],
    ['40001', 409],
    ['PGRST202', 503],
    ['23514', 422],
  ] as const)('surfaces %s without a legacy mutation fallback', async (code, status) => {
    deny = { code };
    await expect(bridge()).rejects.toMatchObject({ response: { status } });
    expect(state.locations).toEqual([]);
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual([
      'get_family_trip_planner_state_v1',
      'bridge_family_trip_destinations_v1',
    ]);
  });
  it('rejects stale category observations instead of copying another category', async () => {
    state.destinations[0].legacy_category_id = uuid(12);
    await expect(bridge()).rejects.toMatchObject({ response: { status: 409 } });
    expect(state.locations).toEqual([]);
  });
  it('rejects malformed observations and old timestamp tokens before the RPC', async () => {
    for (const malformed of [
      { ...body(), destinations: [] },
      { ...body(), destinations: body().destinations.concat(body().destinations) },
      { ...body(), destinations: [{ place_id: city }] },
      { ...body(), extra: true },
      { ...body(), expected_revision: 0 },
      { ...body(), destinations: [{ ...body().destinations[0], notes: 'No override in bridge' }] },
    ])
      await expect(client.post(prefix, malformed)).rejects.toMatchObject({ response: { status: 400 } });
    await expect(client.post(prefix, body(), { headers: { 'X-Base-Updated-At': at } })).rejects.toMatchObject({
      response: { status: 409 },
    });
    await expect(client.post(prefix, body(), { headers: { 'X-Idempotency-Key': uuid(55) } })).rejects.toMatchObject({
      response: { status: 400 },
    });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('rejects a Trip outside the selected Family before issuing its mutation', async () => {
    state.family_id = uuid(77);
    await expect(bridge()).rejects.toMatchObject({ response: { status: 403 } });
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual(['get_family_trip_planner_state_v1']);
    expect(state.locations).toEqual([]);
  });
  it('fences a same-user Family switch after commit before cache invalidation or readback', async () => {
    const invalidate = vi.spyOn(repo, 'invalidate');
    switchScope = true;
    await expect(bridge()).rejects.toMatchObject({ response: { status: 409 } });
    expect(invalidate).not.toHaveBeenCalled();
    expect(db.rpc.mock.calls.map(([name]) => name)).toEqual([
      'get_family_trip_planner_state_v1',
      'bridge_family_trip_destinations_v1',
    ]);
  });
  it('keeps the rest of an explicitly selected batch unresolved rather than inventing full completion', async () => {
    state.destinations.push({ source_place_id: uuid(66), location_id: null, legacy_category_id: null });
    const result = await bridge();
    expect(result.operation.remaining_unmaterialized_count).toBe(1);
    expect(result.state.readiness.ready).toBe(false);
  });
  it('rejects a command result for another Trip before presenting success', async () => {
    db.rpc.mockResolvedValueOnce({
      data: {
        version: 1,
        trip_id: uuid(77),
        trip_revision: 8,
        created_count: 1,
        remaining_unmaterialized_count: 0,
        mappings: [
          {
            source_place_id: city,
            location_id: uuid(100),
            location_revision: 1,
            created: true,
            category_disposition: 'destination_copied',
          },
        ],
      },
      error: null,
    });
    await expect(bridge()).rejects.toMatchObject({ response: { status: 502 } });
    expect(state.locations).toEqual([]);
  });
  it('parks the original queued request after an account switch without rebinding its scope', async () => {
    const id = uuid(82),
      queuedBody = { scope: body().scope, expected_revision: 7, destinations: body().destinations };
    await mutationQueue.enqueue({ id, tripId: await nativeTrip(), method: 'POST', url: prefix, body: queuedBody });
    session = { ...session, userId: uuid(92), personId: uuid(93) };
    repo.acceptSession(session);
    await mutationQueue.flush();
    const row = await offlineDb.mutationQueue.get(id);
    expect(row?.status).toBe('conflict');
    expect(row?.body).toEqual(queuedBody);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(state.locations).toEqual([]);
  });
  it('preserves a queued conflict and its original observed revision', async () => {
    state.trip_revision = 8;
    const id = uuid(81);
    await mutationQueue.enqueue({
      id,
      tripId: await nativeTrip(),
      method: 'POST',
      url: prefix,
      body: { scope: body().scope, expected_revision: 7, destinations: body().destinations },
    });
    await mutationQueue.flush();
    const queued = await offlineDb.mutationQueue.get(id);
    expect(queued?.status).toBe('conflict');
    expect(queued?.body).toEqual({ scope: body().scope, expected_revision: 7, destinations: body().destinations });
    expect(state.locations).toEqual([]);
  });
});
