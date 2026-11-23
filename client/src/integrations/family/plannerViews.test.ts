import axios from 'axios';
import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import api from '../../api/client';
import { invalidateOfflineSession, offlineDb, type QueuedMutation } from '../../db/offlineDb';
import { dayRepo } from '../../repo/dayRepo';
import { placeRepo } from '../../repo/placeRepo';
import { installPlannerReadPort } from '../../repo/plannerReadPort';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { createFamilyApplicationHandler } from './applicationHandler';
import { NOT_HANDLED } from './listHandler';
import type { PlanLocation } from './planLocationContract';
import { PLANNER_CACHE_TTL, plannerCacheDb } from './plannerCache';
import type { PlannerState } from './plannerStateContract';
import { createPlannerViewReader } from './plannerView';
import type { PlannerView } from './plannerViewContract';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';
const boundary = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => 'https://fixture.supabase.invalid' }));
const uuid = (n: number) => `a0400000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const trip = uuid(1),
  family = uuid(2),
  city = uuid(3),
  day = uuid(4),
  media = uuid(5),
  saved = uuid(6);
const hero = 'https://fixture.supabase.invalid/storage/v1/object/public/catalog/variants/v1/a/hero-x.webp';
const thumb = hero.replace('hero-', 'thumb-');
const at = '2026-11-05T00:00:00Z',
  path = `/trips/${trip}/family/planner-view`;
function location(id = saved, source: PlanLocation['source'] = { kind: 'food', id: uuid(7) }): PlanLocation {
  return {
    id,
    trip_id: trip,
    revision: 4,
    deleted_at: null,
    source,
    source_archived: false,
    name: 'Actual cafe',
    description: 'Catalog description',
    notes: 'Saved note',
    latitude: 19.05,
    longitude: -98.2,
    is_located: true,
    address: 'Cafe street 7',
    website: null,
    phone: null,
    context_place_id: city,
    context_place_name: 'Context city',
    country_id: uuid(8),
    country_name: 'Mexico',
    country_code: 'MX',
    time_zone: 'America/Mexico_City',
    source_type_label: null,
    cover_media_id: media,
    category: null,
    overrides: {},
    created_at: at,
    updated_at: at,
  };
}
function fixture(): PlannerState {
  const l = location();
  return {
    version: 1,
    trip_id: trip,
    family_id: family,
    trip_revision: 10,
    locations: [l],
    days: [{ id: day, trip_id: trip, civil_day: '2027-04-01', day_index: 1, title: 'First day', updated_at: at }],
    visits: [0, 1].map((i) => ({
      id: uuid(20 + i),
      trip_id: trip,
      activity: 'Dinner',
      starts_at: '2027-04-02T01:00:00Z',
      ends_at: null,
      time_zone: 'America/Mexico_City',
      sort_order: i,
      explanations: `Visit ${i} note`,
      updated_at: at,
      plan_location_id: saved,
      location: l,
      timing_kind: 'timed' as const,
      trip_day_id: day,
      planning_day: '2027-04-01',
      revision: 2,
      duration_minutes: null,
      planned_duration_minutes: null,
      start_local: '2027-04-01T19:00:00.000000',
      end_local: null,
      deleted_at: null,
    })),
    notes: [
      {
        id: uuid(30),
        trip_id: trip,
        civil_day: '2027-04-01',
        body: 'Day note',
        icon: null,
        sort_order: 0,
        updated_at: at,
      },
    ],
    destinations: [],
  };
}

let repo: FamilyFrontendRepository,
  session: FamilySession,
  state: PlannerState,
  reader: ReturnType<typeof createPlannerViewReader>;
let client: ReturnType<typeof axios.create>, now: number, origin: string, variant: string | null;
let response: (layer: string) => unknown, release: () => void;
const original = api.defaults.adapter;
function envelope(layer = 'published'): PlannerView {
  return {
    version: 1,
    scope: {
      user_id: session.userId,
      family_id: session.familyId,
      person_id: session.personId,
      trip_id: trip,
      layer: layer as 'published' | 'myDraft',
    },
    state: structuredClone(state),
    operations: [],
    bindings: [],
    draft_token: layer === 'published' ? null : 'a'.repeat(64),
    readiness: { ready: true, blockers: [] },
  };
}
function privateView(): PlannerView {
  const v = envelope('myDraft');
  v.state.locations[0].notes = 'Private saved note';
  v.state.visits.forEach((s) => {
    s.location = v.state.locations[0];
  });
  v.operations = [
    {
      op_id: uuid(70),
      status: 'projected',
      target_id: saved,
      payload: {
        contract: 'family.plan_change.v2',
        domain: 'location',
        action: 'update',
        changes: { notes: 'Private saved note' },
      },
    },
  ];
  v.bindings = [
    {
      op_id: uuid(70),
      domain: 'location',
      action: 'update',
      location_id: saved,
      visit_id: null,
      virtual_location: false,
      virtual_visit: false,
    },
  ];
  return v;
}
async function lists() {
  const id = (await repo.views()).ids.register('trip', trip);
  return Promise.all([placeRepo.list(id), dayRepo.list(id)]);
}
function install() {
  const app = createFamilyApplicationHandler(repo),
    adapter = createFamilyAxiosAdapter(async (q) => {
      const result = await reader.native(q);
      return result === NOT_HANDLED ? app(q) : result;
    });
  api.defaults.adapter = adapter;
  client = axios.create({ adapter });
  release = installPlannerReadPort({
    places: async (t, p) => (await api.get(`/trips/${t}/places`, { params: p })).data,
    days: async (t) => (await api.get(`/trips/${t}/days`)).data,
  });
}
beforeEach(async () => {
  await resetOfflineTestDatabase();
  await plannerCacheDb.snapshots.clear();
  localStorage.clear();
  mutationQueue._resetFlushing();
  _resetNetworkMode();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  now = 1_000_000;
  origin = 'https://fixture.supabase.invalid';
  state = fixture();
  variant = hero;
  session = {
    userId: uuid(90),
    familyId: family,
    personId: uuid(91),
    user: { username: 'Fixture', email: 'fixture@example.invalid', avatar_url: null, created_at: at },
  };
  repo = new FamilyFrontendRepository(async () => session);
  reader = createPlannerViewReader(repo, { source: () => origin, now: () => now });
  response = (layer) => (layer === 'myDraft' ? privateView() : envelope());
  boundary.rpc.mockReset();
  boundary.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'get_family_trip_planner_view_v1')
      return { data: response(String(args.p_layer)), error: null, status: 200 };
    if (name === 'catalog_media_variants_for_assets')
      return {
        data: [
          {
            media_asset_id: media,
            public_url: 'https://fixture.supabase.invalid/storage/v1/object/public/catalog/original.jpg',
            thumb_url: thumb,
            hero_url: variant,
            recipe_version: 'v1',
          },
        ],
        error: null,
        status: 200,
      };
    throw new Error('Unexpected RPC ' + name);
  });
  await repo.session();
  install();
});
afterEach(async () => {
  release();
  reader.dispose();
  api.defaults.adapter = original;
  setAuthed(false);
  _resetNetworkMode();
  await resetOfflineTestDatabase();
  await plannerCacheDb.snapshots.clear();
  vi.restoreAllMocks();
});
describe('P04e actual HTTP/native repositories and scoped Dexie snapshots', () => {
  it('coalesces simultaneous native places/days and preserves repeated visits, clock and media identity', async () => {
    const [p, d] = await lists();
    expect(p.places[0].image_url).toBe(hero);
    expect(d.days[0].assignments).toHaveLength(2);
    expect(d.days[0].assignments?.[0].assignment_time).toBe('19:00');
    expect(d.days[0].assignments?.[0].place_id).toBe(p.places[0].id);
    expect(boundary.rpc.mock.calls.filter((c) => c[0] === 'get_family_trip_planner_view_v1')).toHaveLength(1);
    expect(await offlineDb.places.count()).toBe(0);
    expect(await offlineDb.days.count()).toBe(0);
    expect(await plannerCacheDb.snapshots.count()).toBe(1);
  });
  it('revalidates authority for each new online read instead of reusing resolved results', async () => {
    await lists();
    await lists();
    expect(boundary.rpc.mock.calls.filter((c) => c[0] === 'get_family_trip_planner_view_v1')).toHaveLength(2);
  });
  it('keeps MyDraft private across native reloads and layer changes', async () => {
    await lists();
    repo.setLayer(trip, 'myDraft');
    const [p, d] = await lists();
    expect(p.places[0].notes).toBe('Private saved note');
    expect(d.days[0].assignments?.[1].place?.notes).toBe('Private saved note');
    repo.setLayer(trip, 'published');
    expect((await lists())[0].places[0].notes).toBe('Saved note');
    expect(await plannerCacheDb.snapshots.count()).toBe(2);
    setForcedOffline(true);
    repo.setLayer(trip, 'myDraft');
    expect((await lists())[0].places[0].notes).toBe('Private saved note');
  });
  it('works after a reader reload offline without a media request and without extending TTL', async () => {
    await lists();
    const stored = (await plannerCacheDb.snapshots.toArray())[0].storedAt;
    reader.dispose();
    reader = createPlannerViewReader(repo, { source: () => origin, now: () => now });
    setForcedOffline(true);
    boundary.rpc.mockClear();
    now += 1000;
    expect((await lists())[0].places[0].image_url).toBe(hero);
    expect(boundary.rpc).not.toHaveBeenCalled();
    expect((await plannerCacheDb.snapshots.toArray())[0].storedAt).toBe(stored);
  });
  it('uses a current cached snapshot only for proven status-zero network failure', async () => {
    await lists();
    boundary.rpc.mockResolvedValue({ data: null, error: { code: '', message: 'Failed to fetch' }, status: 0 });
    expect((await lists())[0].places).toHaveLength(1);
  });
  it.each([401, 403, 404, 409, 500, 503])(
    'surfaces HTTP %s and evicts both layers without native-cache fallback',
    async (status) => {
      await lists();
      repo.setLayer(trip, 'myDraft');
      await lists();
      boundary.rpc.mockResolvedValue({ data: null, error: { code: '42501' }, status });
      await expect(placeRepo.list(trip)).rejects.toMatchObject({ response: { status } });
      expect(await plannerCacheDb.snapshots.count()).toBe(0);
      setForcedOffline(true);
      await expect(placeRepo.list(trip)).rejects.toMatchObject({ response: { status: 503 } });
    }
  );
  it('does not treat an unknown thrown error as proof of disconnection', async () => {
    await lists();
    boundary.rpc.mockRejectedValue(new TypeError('Unexpected failure'));
    await expect(placeRepo.list(trip)).rejects.toThrow('Unexpected failure');
    expect(await plannerCacheDb.snapshots.count()).toBe(0);
  });
  it.each(['expired', 'future', 'corrupt'])(
    'refuses %s cached data without returning an empty success',
    async (mode) => {
      await lists();
      const row = (await plannerCacheDb.snapshots.toArray())[0];
      if (mode === 'expired') now += PLANNER_CACHE_TTL + 1;
      else if (mode === 'future') now--;
      else row.value = { bad: true };
      await plannerCacheDb.snapshots.put(row);
      setForcedOffline(true);
      await expect(placeRepo.list(trip)).rejects.toMatchObject({
        response: { data: { code: 'planner_offline_unavailable' } },
      });
      expect(await plannerCacheDb.snapshots.count()).toBe(0);
    }
  );
  it.each(['account', 'family', 'person', 'source', 'layer'])(
    'never borrows a snapshot from another %s scope',
    async (mode) => {
      await lists();
      if (mode === 'account') session = { ...session, userId: uuid(93) };
      if (mode === 'family') session = { ...session, familyId: uuid(94) };
      if (mode === 'person') session = { ...session, personId: uuid(95) };
      if (mode === 'source') origin = 'https://another.supabase.invalid';
      if (mode === 'layer') repo.setLayer(trip, 'myDraft');
      if (['account', 'family', 'person'].includes(mode)) repo.acceptSession(session);
      setForcedOffline(true);
      await expect(placeRepo.list(trip)).rejects.toMatchObject({ response: { status: 503 } });
    }
  );
  it.each(['account', 'family', 'person', 'source', 'layer', 'invalidation', 'abort'])(
    'fences a late HTTP result after %s changes before cache publication',
    async (mode) => {
      let resolve!: (v: unknown) => void;
      const raw = envelope();
      boundary.rpc.mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          })
      );
      const abort = new AbortController(),
        task = client.get(`/trips/${trip}/places`, { signal: abort.signal });
      await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
      if (mode === 'account') session = { ...session, userId: uuid(93) };
      if (mode === 'family') session = { ...session, familyId: uuid(94) };
      if (mode === 'person') session = { ...session, personId: uuid(95) };
      if (mode === 'source') origin = 'https://another.supabase.invalid';
      if (mode === 'layer') repo.setLayer(trip, 'myDraft');
      if (mode === 'invalidation') repo.invalidate(trip);
      if (mode === 'abort') abort.abort();
      if (['account', 'family', 'person'].includes(mode)) repo.acceptSession(session);
      const rejection = expect(task).rejects.toBeDefined();
      resolve({ data: raw, error: null, status: 200 });
      await rejection;
      expect(await plannerCacheDb.snapshots.count()).toBe(0);
    }
  );
  it('invalidation clears an offline snapshot, then a fresh online reload can be cached again', async () => {
    await lists();
    repo.invalidate(trip);
    setForcedOffline(true);
    await expect(placeRepo.list(trip)).rejects.toMatchObject({ response: { status: 503 } });
    setForcedOffline(false);
    await lists();
    setForcedOffline(true);
    expect((await lists())[0].places).toHaveLength(1);
  });
  it('returns blocked legacy intents on neither native list and preserves the queued original request', async () => {
    await mutationQueue.enqueue({
      id: uuid(88),
      tripId: 1,
      method: 'PUT',
      url: '/trips/1/places/2',
      body: { notes: 'Unsubmitted original' },
      resource: 'places',
      entityId: 2,
    });
    const queued = await offlineDb.mutationQueue.toArray();
    response = () => ({
      ...privateView(),
      readiness: { ready: false, blockers: [{ op_id: uuid(70), code: '0A000' }] },
      bindings: [],
    });
    repo.setLayer(trip, 'myDraft');
    await expect(placeRepo.list(trip)).rejects.toMatchObject({ response: { status: 409 } });
    expect(await offlineDb.mutationQueue.toArray()).toEqual(queued);
    expect(await plannerCacheDb.snapshots.count()).toBe(0);
  });
  it.each(['unmaterialized', 'legacy', 'unassigned'])(
    'refuses the %s native-readiness blocker before publishing cache',
    async (mode) => {
      if (mode === 'unmaterialized')
        state.destinations = [{ source_place_id: city, location_id: null, legacy_category_id: null }];
      if (mode === 'legacy') state.visits[0].timing_kind = 'legacy';
      if (mode === 'unassigned') {
        state.visits[0].trip_day_id = null;
        state.visits[0].planning_day = null;
      }
      await expect(placeRepo.list(trip)).rejects.toMatchObject({
        response: { data: { code: 'planner_readiness_blocked' } },
      });
      expect(await plannerCacheDb.snapshots.count()).toBe(0);
    }
  );
  it.each(['wrong-scope', 'duplicate', 'binding', 'published-private', 'large'])(
    'rejects malformed %s HTTP snapshots',
    async (mode) => {
      response = () => {
        const v = envelope();
        if (mode === 'wrong-scope') v.scope.person_id = uuid(111);
        if (mode === 'duplicate') v.state.locations.push(v.state.locations[0]);
        if (mode === 'binding') v.bindings = privateView().bindings;
        if (mode === 'published-private') v.operations = privateView().operations;
        if (mode === 'large') v.state.locations[0].description = 'x'.repeat(8388608);
        return v;
      };
      await expect(placeRepo.list(trip)).rejects.toMatchObject({ response: { status: 502 } });
      expect(await plannerCacheDb.snapshots.count()).toBe(0);
    }
  );
  it('marks private virtual identities without materializing canonical writes', async () => {
    const v = privateView();
    v.state.locations[0].id = uuid(70);
    v.state.visits.forEach((s) => {
      s.plan_location_id = uuid(70);
      s.location = v.state.locations[0];
    });
    v.bindings[0].location_id = uuid(70);
    v.bindings[0].virtual_location = true;
    v.bindings[0].action = 'create';
    v.operations[0].payload.action = 'create';
    response = () => v;
    const result = await client.get(path + '?layer=myDraft');
    expect(result.data.bindings[0].virtual_location).toBe(true);
    expect(
      boundary.rpc.mock.calls.every(
        (c) => String(c[0]).startsWith('get_') || c[0] === 'catalog_media_variants_for_assets'
      )
    ).toBe(true);
  });
  it('missing or unsafe variants stay placeholders in online and cached native consumers', async () => {
    variant = hero.replace('/object/public/', '/render/image/public/');
    expect((await lists())[0].places[0].image_url).toBeNull();
    setForcedOffline(true);
    expect((await lists())[0].places[0].image_url).toBeNull();
    expect(JSON.stringify((await lists())[1]).includes('/render/image/')).toBe(false);
  });
  it('rejects filtered reads, unknown layers and versioned writes through the real handler', async () => {
    await expect(placeRepo.list(trip, { q: 'x' })).rejects.toMatchObject({ response: { status: 400 } });
    await expect(client.get(path + '?layer=secret')).rejects.toMatchObject({ response: { status: 400 } });
    await expect(client.get(path + '?layer=myDraft&layer=published')).rejects.toMatchObject({
      response: { status: 400 },
    });
    await expect(client.put(path, {})).rejects.toMatchObject({ response: { status: 405 } });
  });
  it('blocks old native offline writes before optimistic cache or queue changes', async () => {
    await lists();
    setForcedOffline(true);
    for (const write of [
      () => placeRepo.create(trip, { name: 'Do not create' }),
      () => placeRepo.update(trip, 1, { notes: 'No' }),
      () => placeRepo.delete(trip, 1),
      () => placeRepo.updateMany(trip, [1], {}),
      () => placeRepo.deleteMany(trip, [1]),
      () => dayRepo.update(trip, 1, {}),
      () => dayRepo.remove(trip, 1),
      () => dayRepo.reorder(trip, [1]),
      () => dayRepo.insert(trip),
      () => dayRepo.appendDated(trip),
      () => dayRepo.setTransport(trip, 1, null),
    ])
      await expect(write()).rejects.toThrow('not cut over');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(await offlineDb.places.count()).toBe(0);
    expect(await offlineDb.days.count()).toBe(0);
  });
  it('does not persist credentials in scoped snapshot storage', async () => {
    await lists();
    expect(JSON.stringify(await plannerCacheDb.snapshots.toArray())).not.toMatch(
      /access_token|refresh_token|authorization|service_role|eyJ/
    );
  });
  it('a newer authority denial prevents an older successful reader from repopulating the shared cache', async () => {
    let resolve!: (value: unknown) => void;
    boundary.rpc
      .mockImplementationOnce(async () => ({ data: envelope(), error: null, status: 200 }))
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          })
      );
    const older = placeRepo.list(trip);
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    const newer = createPlannerViewReader(repo, { source: () => origin, now: () => now });
    boundary.rpc.mockResolvedValue({ data: null, error: { code: '42501' }, status: 403 });
    try {
      await expect(newer.read(trip)).rejects.toMatchObject({ status: 403 });
      const rejection = expect(older).rejects.toMatchObject({ response: { status: 409 } });
      resolve({ data: [], error: null, status: 200 });
      await rejection;
      expect(await plannerCacheDb.snapshots.count()).toBe(0);
    } finally {
      newer.dispose();
    }
  });
  it('a variant service authorization failure cannot return an older cached cover', async () => {
    await lists();
    boundary.rpc.mockImplementation(async (name) =>
      name === 'get_family_trip_planner_view_v1'
        ? { data: envelope(), error: null, status: 200 }
        : { data: null, error: { code: '42501' }, status: 403 }
    );
    await expect(placeRepo.list(trip)).rejects.toMatchObject({ response: { status: 403 } });
    expect(await plannerCacheDb.snapshots.count()).toBe(0);
  });
  it('an absent ready variant remains a placeholder without requesting an original or transform', async () => {
    boundary.rpc.mockImplementation(async (name) => ({
      data: name === 'get_family_trip_planner_view_v1' ? envelope() : [],
      error: null,
      status: 200,
    }));
    expect((await lists())[0].places[0].image_url).toBeNull();
    setForcedOffline(true);
    expect((await lists())[0].places[0].image_url).toBeNull();
    expect(
      boundary.rpc.mock.calls.every((c) =>
        ['get_family_trip_planner_view_v1', 'catalog_media_variants_for_assets'].includes(c[0])
      )
    ).toBe(true);
  });
  it('refuses a structurally valid but blocked private snapshot in offline storage', async () => {
    repo.setLayer(trip, 'myDraft');
    await lists();
    const row = (await plannerCacheDb.snapshots.toArray())[0];
    const view = privateView();
    view.readiness = { ready: false, blockers: [{ op_id: uuid(70), code: '40001' }] };
    view.bindings = [];
    view.operations[0].status = 'blocked';
    row.value = { view, variants: [] };
    await plannerCacheDb.snapshots.put(row);
    setForcedOffline(true);
    await expect(placeRepo.list(trip)).rejects.toMatchObject({
      response: { data: { code: 'planner_offline_unavailable' } },
    });
    expect(await plannerCacheDb.snapshots.count()).toBe(0);
  });
});

// P04ar: scoped cache and native read-port regressions against actual reader/adapter code.
async function retainedViewCommand(extra: Partial<QueuedMutation> = {}) {
  const native = (await repo.views()).ids.register('trip', trip);
  const row: QueuedMutation = {
    id: crypto.randomUUID(),
    tripId: native,
    method: 'POST',
    url: `/trips/${trip}/family/planner-editor-command`,
    body: { operation_id: uuid(991), original: ['preserve'] },
    status: 'pending',
    attempts: 2,
    createdAt: 1,
    lastError: null,
    schemaVersion: 2,
    baseUpdatedAt: 'Original token',
    ...extra,
  };
  await offlineDb.mutationQueue.put(row);
  return row;
}
async function heldView() {
  const impl = boundary.rpc.getMockImplementation();
  if (!impl) throw new Error('Missing RPC fixture');
  let finish!: () => void,
    entered = false;
  const held = new Promise<void>((resolve) => {
    finish = resolve;
  });
  boundary.rpc.mockImplementation(async (name, args) => {
    if (name === 'get_family_trip_planner_view_v1') {
      entered = true;
      await held;
    }
    return impl(name, args);
  });
  const run = reader.read(trip).catch((error) => error);
  await vi.waitFor(() => expect(entered).toBe(true));
  return { run, finish };
}
describe('P04ar scoped read retention', () => {
  it.each(['pending', 'syncing', 'failed', 'conflict', 'future'] as const)(
    'holds %s work without fetching, invalidating or replacing the scoped snapshot',
    async (status) => {
      await lists();
      const before = await plannerCacheDb.snapshots.toArray();
      const original = await retainedViewCommand(status === 'future' ? { schemaVersion: 100 } : { status });
      boundary.rpc.mockClear();
      repo.invalidate(trip);
      await expect(placeRepo.list(trip)).rejects.toMatchObject({
        response: { status: 409, data: { code: 'planner_local_work' } },
      });
      expect(boundary.rpc).not.toHaveBeenCalled();
      expect(await plannerCacheDb.snapshots.toArray()).toEqual(before);
      expect(await offlineDb.mutationQueue.get(original.id)).toEqual(original);
    }
  );
  it.each([undefined, 'foreign'])('holds opaque future work with unrecognized trip metadata (%s)', async (tripId) => {
    const original = await retainedViewCommand({ tripId: tripId as never, schemaVersion: 100 });
    boundary.rpc.mockClear();
    await expect(reader.read(trip)).rejects.toMatchObject({ code: 'planner_local_work' });
    expect(boundary.rpc).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.get(original.id)).toEqual(original);
  });
  it('rejects a successful response if a command arrives while its RPC is waiting', async () => {
    await lists();
    const before = await plannerCacheDb.snapshots.toArray(),
      held = await heldView();
    const original = await retainedViewCommand();
    held.finish();
    expect(await held.run).toMatchObject({ code: 'planner_local_work' });
    expect(await plannerCacheDb.snapshots.toArray()).toEqual(before);
    expect(await offlineDb.mutationQueue.get(original.id)).toEqual(original);
  });
  it.each([0, 403, 500])('does not delete retained snapshots after a late HTTP %s result', async (status) => {
    await lists();
    const before = await plannerCacheDb.snapshots.toArray();
    let finish!: () => void,
      entered = false;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    boundary.rpc.mockImplementation(async () => {
      entered = true;
      await held;
      return { data: null, error: { code: '42501' }, status };
    });
    const run = reader.read(trip).catch((error) => error);
    await vi.waitFor(() => expect(entered).toBe(true));
    const original = await retainedViewCommand();
    finish();
    expect(await run).toMatchObject({ code: 'planner_local_work' });
    expect(await plannerCacheDb.snapshots.toArray()).toEqual(before);
    expect(await offlineDb.mutationQueue.get(original.id)).toEqual(original);
  });
  it('does not purge an expired snapshot while local work is held, or serve it as current', async () => {
    await lists();
    const before = await plannerCacheDb.snapshots.toArray(),
      original = await retainedViewCommand();
    now += PLANNER_CACHE_TTL + 1;
    setForcedOffline(true);
    await expect(reader.read(trip)).rejects.toMatchObject({ code: 'planner_local_work' });
    expect(await plannerCacheDb.snapshots.toArray()).toEqual(before);
    await offlineDb.mutationQueue.delete(original.id);
    await expect(reader.read(trip)).rejects.toMatchObject({ code: 'planner_offline_unavailable' });
    expect(await plannerCacheDb.snapshots.count()).toBe(0);
  });
  it('preserves a native optimistic write made before its command is enqueued', async () => {
    await lists();
    const before = await plannerCacheDb.snapshots.toArray(),
      held = await heldView();
    const place = { id: 123, trip_id: (await repo.views()).ids.register('trip', trip), name: 'Concurrent native edit' };
    await offlineDb.places.put(place);
    held.finish();
    expect(await held.run).toMatchObject({ code: 'planner_local_work' });
    expect(await offlineDb.places.get(123)).toEqual(place);
    expect(await plannerCacheDb.snapshots.toArray()).toEqual(before);
  });
  it('does not replace a newer scoped snapshot from another connection', async () => {
    await lists();
    const before = await plannerCacheDb.snapshots.toArray(),
      held = await heldView();
    const newer = structuredClone(before[0]);
    newer.storedAt++;
    (newer.value as { view: { state: { trip_revision: number } } }).view.state.trip_revision++;
    await plannerCacheDb.snapshots.put(newer);
    held.finish();
    expect(await held.run).toMatchObject({ code: 'planner_local_work' });
    expect(await plannerCacheDb.snapshots.toArray()).toEqual([newer]);
  });
  it('fences same-actor private-epoch replacement even when Family IDs and source are unchanged', async () => {
    await lists();
    const before = await plannerCacheDb.snapshots.toArray(),
      held = await heldView();
    invalidateOfflineSession();
    held.finish();
    expect(await held.run).toBeInstanceOf(Error);
    expect(await plannerCacheDb.snapshots.toArray()).toEqual(before);
  });
  it('resumes authoritative reads after the original command is resolved', async () => {
    await lists();
    const original = await retainedViewCommand();
    await expect(reader.read(trip)).rejects.toMatchObject({ code: 'planner_local_work' });
    await offlineDb.mutationQueue.delete(original.id);
    state.locations[0].notes = 'New canonical note';
    expect((await reader.read(trip)).state.native.places[0].notes).toBe('New canonical note');
  });
  it('refuses a scoped online read if a required Web Lock is unavailable', async () => {
    Reflect.deleteProperty(navigator, 'locks');
    boundary.rpc.mockClear();
    await expect(reader.read(trip)).rejects.toThrow('cross-tab queue lock');
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
});

it('P04ar a same-actor successor read cannot join an earlier private-epoch RPC', async () => {
  await lists();
  const impl = boundary.rpc.getMockImplementation();
  if (!impl) throw new Error('Missing RPC fixture');
  const held = await heldView();
  invalidateOfflineSession();
  boundary.rpc.mockImplementation(impl);
  const next = reader.read(trip).catch((error) => error);
  try {
    await vi.waitFor(() =>
      expect(boundary.rpc.mock.calls.filter(([name]) => name === 'get_family_trip_planner_view_v1')).toHaveLength(3)
    );
  } finally {
    held.finish();
  }
  expect(await held.run).toBeInstanceOf(Error);
  expect(await next).toMatchObject({ readiness: { ready: true } });
});

it('P04ar cache commits never invoke a session resolver while their IndexedDB transaction is held', async () => {
  const session = repo.session.bind(repo);
  vi.spyOn(repo, 'session').mockImplementation(() => {
    if (Dexie.currentTransaction?.db === plannerCacheDb)
      throw new Error('Session resolver entered a cache transaction');
    return session();
  });
  await lists();
  expect(await plannerCacheDb.snapshots.count()).toBe(1);
});
