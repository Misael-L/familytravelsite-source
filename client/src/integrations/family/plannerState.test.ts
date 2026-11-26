import axios from 'axios';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import api from '../../api/client';
import { offlineDb } from '../../db/offlineDb';
import { dayRepo } from '../../repo/dayRepo';
import { placeRepo } from '../../repo/placeRepo';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode } from '../../sync/networkMode';
import { createFamilyApplicationHandler } from './applicationHandler';
import { NOT_HANDLED } from './listHandler';
import type { PlanLocation } from './planLocationContract';
import { resolvePlannerLocation } from './plannerProjection';
import { createPlannerReadCoordinator } from './plannerState';
import type { PlannerState } from './plannerStateContract';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const boundary = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => boundary }));
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
  path = `/trips/${trip}/family/planner-state`;
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
let state: PlannerState, repo: FamilyFrontendRepository, client: ReturnType<typeof axios.create>;
let variant: string | null, session: FamilySession;
const original = api.defaults.adapter;
beforeEach(async () => {
  await resetOfflineTestDatabase();
  localStorage.clear();
  mutationQueue._resetFlushing();
  _resetNetworkMode();
  setAuthed(true);
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  state = fixture();
  variant = hero;
  session = {
    userId: uuid(90),
    familyId: family,
    personId: uuid(91),
    user: { username: 'Fixture', email: 'fixture@example.invalid', avatar_url: null, created_at: at },
  };
  repo = new FamilyFrontendRepository(async () => session);
  boundary.rpc.mockReset();
  boundary.rpc.mockImplementation(async (name: string) => {
    if (name === 'get_family_trip_planner_state_v1') return { data: structuredClone(state), error: null };
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
      };
    throw new Error('Unexpected database operation ' + name);
  });
  const native = createPlannerReadCoordinator(repo),
    app = createFamilyApplicationHandler(repo);
  const adapter = createFamilyAxiosAdapter(async (request) => {
    const result = await native(request);
    return result === NOT_HANDLED ? app(request) : result;
  });
  api.defaults.adapter = adapter;
  client = axios.create({ adapter });
});
afterEach(async () => {
  api.defaults.adapter = original;
  setAuthed(false);
  await resetOfflineTestDatabase();
  vi.restoreAllMocks();
});
async function nativeTrip() {
  return (await repo.views()).ids.register('trip', trip);
}
async function snapshot() {
  return (await client.get(path)).data;
}

describe('Planner snapshot through actual dispatcher, native repos and IndexedDB', () => {
  it('owns undated notes by day UUID and preserves descriptive Markdown and colour', async () => {
    state.visits = [];
    state.days[0].civil_day = null;
    state.days.push({ ...state.days[0], id: uuid(45), day_index: 2 });
    state.notes[0] = { ...state.notes[0], civil_day: null, trip_day_id: day,
      detail: 'Bring **water** and snacks', color: '#dc2626', sort_order: 0.5 };
    const projected = (await snapshot()).native.days;
    expect(projected[0].notes_items).toHaveLength(1);
    expect(projected[0].notes_items[0]).toMatchObject({ time: 'Bring **water** and snacks', color: '#dc2626', sort_order: 0.5 });
    expect(projected[1].notes_items).toEqual([]);
  });

  it('loads days and pool concurrently from one snapshot with venue identity and local dates', async () => {
    // Synchronize at the HTTP boundary: local cache inspection may take different
    // time for each repository. The coordinator shares overlapping requests,
    // deliberately not already resolved results (each new read checks authority).
    const adapter = api.defaults.adapter;
    if (typeof adapter !== 'function') throw new Error('Expected the fixture adapter');
    let entered = 0,
      release!: () => void;
    const both = new Promise<void>((resolve) => {
      release = resolve;
    });
    api.defaults.adapter = async (config) => {
      if (++entered === 2) release();
      await both;
      return adapter(config);
    };
    const [days, places] = await Promise.all([dayRepo.list(await nativeTrip()), placeRepo.list(await nativeTrip())]);
    expect(days.days[0].day_number).toBe(1);
    expect(days.days[0].assignments).toHaveLength(2);
    const a = days.days[0].assignments ?? [];
    expect(a.map((v) => v.assignment_time)).toEqual(['19:00', '19:00']);
    expect(a[0].place_id).toBe(places.places[0].id);
    expect(a[0].id).not.toBe(a[1].id);
    expect(a[0].place.name).toBe('Actual cafe');
    expect(a[0].place.lat).toBe(19.05);
    expect(a[0].notes).toBe('Visit 0 note');
    expect(places.places[0].notes).toBe('Saved note');
    expect(places.places[0].description).toBe('Catalog description');
    expect(places.places[0].image_url).toBe(hero);
    expect(days.days[0].notes_items?.[0].text).toBe('Day note');
    expect(boundary.rpc.mock.calls.filter(([name]) => name === 'get_family_trip_planner_state_v1')).toHaveLength(1);
    await offlineDb.transaction('r', offlineDb.days, offlineDb.places, async () => {
      expect(await offlineDb.days.count()).toBe(1);
      expect(await offlineDb.places.count()).toBe(1);
    });
  });
  it('reproduces the old city/UTC projection and proves the new read keeps the real venue and planning day', async () => {
    const views = await repo.views();
    const originalDay = { id: day, tripId: trip, civilDay: '2027-04-01', dayIndex: 1, title: null };
    const cityRow = {
      id: city,
      name: 'Context city',
      lat: 19.04,
      lng: -98.19,
      notes: 'Catalog city text',
      timeZone: 'America/Mexico_City',
      countryId: uuid(8),
      placeTypeId: null,
      isPrimary: true,
      imageUrl: thumb,
      familyPlaceCategoryId: null,
      familyPlaceCategoryName: null,
      familyPlaceCategoryColor: null,
      familyPlaceCategoryIcon: null,
    };
    const legacyVisit = {
      id: uuid(20),
      tripId: trip,
      activity: 'Dinner',
      placeId: city,
      startsAt: '2027-04-02T01:00:00Z',
      endsAt: null,
      address: null,
      timeZone: 'America/Mexico_City',
      sortOrder: 0,
      experienceId: null,
      foodId: uuid(7),
      linkUrl: null,
    };
    expect(views.assignment(legacyVisit, originalDay, [cityRow]).place.name).toBe('Context city');
    expect(views.days([originalDay], [legacyVisit], [], [cityRow])[0].assignments).toHaveLength(0);
    const oldPlace = views.place(trip, cityRow);
    expect(oldPlace.description).toBe(oldPlace.notes);
    expect(oldPlace.image_url).toBe(thumb);
    const { days } = await dayRepo.list(await nativeTrip());
    const assignment = days[0].assignments?.[0];
    expect(assignment?.place.name).toBe('Actual cafe');
    expect(assignment?.assignment_time).toBe('19:00');
    expect(assignment?.place.image_url).toBe(hero);
    expect(days[0].assignments).toHaveLength(2);
  });
  it('keeps untimed, real midnight and End-only distinct without invented clocks', async () => {
    const a = state.visits[0],
      b = state.visits[1];
    Object.assign(a, { starts_at: null, ends_at: null, time_zone: null, start_local: null, timing_kind: 'untimed' });
    Object.assign(b, { starts_at: '2027-04-01T06:00:00Z', start_local: '2027-04-01T00:00:00.000000' });
    const end = {
      ...b,
      id: uuid(22),
      starts_at: null,
      start_local: null,
      ends_at: '2027-04-02T02:00:00Z',
      end_local: '2027-04-01T20:00:00.000000',
      sort_order: 2,
    };
    state.visits.push(end);
    const { days } = await dayRepo.list(await nativeTrip()),
      aRows = days[0].assignments ?? [];
    expect(aRows.map((v) => v.assignment_time)).toEqual([null, '00:00', null]);
    expect(aRows[2].assignment_end_time).toBe('20:00');
    expect(aRows.map((v) => v.place.place_time)).toEqual([null, '00:00', null]);
    expect(aRows[2].place.end_time).toBe('20:00');
    expect((await snapshot()).native.places[0].place_time).toBeUndefined();
  });
  it('retains all standalone visits, sorted occurrences and per-visit metadata', async () => {
    Object.assign(state.visits[0], { plan_location_id: null, location: null, activity: 'Read', sort_order: 5 });
    const s = await snapshot(),
      assignments = s.native.days[0].assignments;
    expect(assignments[1].place).toMatchObject({ id: 0, name: 'Read' });
    expect(assignments[1].family_visit.revision).toBe(2);
  });
  it('resolves the same legacy city separately in each Trip without changing global identities', async () => {
    const ids = (await repo.views()).ids,
      old = ids.register('place', city),
      cityLocation = location(uuid(40), { kind: 'place', id: city });
    state.locations.push(cityLocation);
    state.destinations.push({ source_place_id: city, location_id: cityLocation.id, legacy_category_id: null });
    const first = await snapshot();
    expect(resolvePlannerLocation(first, ids, old, 'legacy-destination')).toBe(uuid(40));
    state.trip_id = uuid(50);
    state.locations = [{ ...cityLocation, id: uuid(41), trip_id: uuid(50) }];
    state.destinations[0].location_id = uuid(41);
    state.days = [];
    state.visits = [];
    state.notes = [];
    const second = (await client.get(`/trips/${uuid(50)}/family/planner-state`)).data;
    expect(resolvePlannerLocation(second, ids, old, 'legacy-destination')).toBe(uuid(41));
    expect(ids.uuid('place', old)).toBe(city);
    expect(() => resolvePlannerLocation(second, ids, uuid(40), 'saved')).toThrow('Reload');
  });
  it.each(['legacy', 'undated', 'destination', 'note'] as const)(
    'reports retained %s data and refuses incomplete native success',
    async (kind) => {
      if (kind === 'legacy') state.visits[0].timing_kind = 'legacy';
      if (kind === 'undated') Object.assign(state.visits[0], { trip_day_id: null, planning_day: null });
      if (kind === 'destination')
        state.destinations.push({ source_place_id: city, location_id: null, legacy_category_id: null });
      if (kind === 'note') state.notes[0].civil_day = '2027-03-31';
      expect((await snapshot()).readiness.ready).toBe(false);
      await expect(dayRepo.list(await nativeTrip())).rejects.toMatchObject({ response: { status: 409 } });
      expect(await offlineDb.days.count()).toBe(0);
    }
  );
  it.each(['trip', 'family', 'duplicate', 'location', 'day', 'clock', 'destination'] as const)(
    'rejects malformed %s relationships before native cache',
    async (kind) => {
      if (kind === 'trip') state.locations[0].trip_id = uuid(99);
      if (kind === 'family') state.family_id = uuid(99);
      if (kind === 'duplicate') state.visits.push(state.visits[0]);
      if (kind === 'location') state.visits[0].location = location(uuid(99));
      if (kind === 'day') state.visits[0].trip_day_id = uuid(99);
      if (kind === 'clock') state.visits[0].start_local = '2027-04-02T19:00:00';
      if (kind === 'destination')
        state.destinations.push({ source_place_id: city, location_id: saved, legacy_category_id: null });
      await expect(placeRepo.list(await nativeTrip())).rejects.toMatchObject({ response: { status: 502 } });
      expect(await offlineDb.places.count()).toBe(0);
    }
  );
  it.each(['family', 'person', 'trip'] as const)(
    'fences a same-user %s change while variant loading is pending',
    async (kind) => {
      boundary.rpc.mockImplementation(async (name: string) => {
        if (name === 'get_family_trip_planner_state_v1') return { data: structuredClone(state), error: null };
        if (kind === 'trip') repo.invalidate(trip);
        else {
          session = { ...session, [kind === 'family' ? 'familyId' : 'personId']: uuid(99) };
          repo.acceptSession(session);
        }
        return { data: [], error: null };
      });
      await expect(placeRepo.list(await nativeTrip())).rejects.toMatchObject({ response: { status: 409 } });
      expect(await offlineDb.places.count()).toBe(0);
    }
  );
  it('rechecks database authorization after a completed read and never falls back on HTTP failures', async () => {
    await placeRepo.list(await nativeTrip());
    boundary.rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(placeRepo.list(await nativeTrip())).rejects.toMatchObject({ response: { status: 403 } });
    expect(boundary.rpc.mock.calls.filter(([name]) => name === 'get_family_trip_planner_state_v1')).toHaveLength(2);
  });
  it('uses placeholders when a variant is missing or a transformation URL is returned', async () => {
    for (const bad of [null, hero.replace('/object/public/', '/render/image/public/')]) {
      variant = bad;
      expect((await placeRepo.list(await nativeTrip())).places[0].image_url).toBeNull();
    }
    expect(boundary.rpc.mock.calls.every(([name]) => !String(name).includes('render/image'))).toBe(true);
  });
  it('blocks native mutations and preserves a parked older queue entry', async () => {
    const views = await repo.views(),
      locationId = views.ids.register('place', city),
      tripId = views.ids.register('trip', trip);
    const id = uuid(80);
    await mutationQueue.enqueue({
      id,
      tripId,
      method: 'PUT',
      url: `/trips/${trip}/places/${locationId}`,
      resource: 'places',
      entityId: locationId,
      baseUpdatedAt: at,
      body: { notes: 'Unsynced old intent' },
    });
    await mutationQueue.flush();
    const queued = await offlineDb.mutationQueue.get(id);
    expect(queued?.status).toBe('conflict');
    expect(queued?.body).toEqual({ notes: 'Unsynced old intent' });
    expect(queued?.baseUpdatedAt).toBe(at);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it('rejects filtered reads and an unavailable snapshot rather than returning an empty list', async () => {
    await expect(placeRepo.list(await nativeTrip(), { category: 'cafes' })).rejects.toMatchObject({
      response: { status: 400 },
    });
    boundary.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    await expect(dayRepo.list(await nativeTrip())).rejects.toMatchObject({ response: { status: 503 } });
    expect(await offlineDb.days.count()).toBe(0);
  });
});
