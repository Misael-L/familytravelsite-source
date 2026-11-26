import * as backendSupabase from '@family/backend/supabase/client';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFamilyApplicationHandler } from './applicationHandler';
import { expenseDraft } from './expenseDraft';
import { FamilyIdentityRegistry } from './identity';
import * as auth from './legacy/data/supabase/auth';
import * as supabase from './legacy/data/supabase/client';
import type { FamilyScheduleItem } from './legacy/data/supabase/scheduleItems';
import * as schedule from './legacy/data/supabase/scheduleItems';
import type { FamilyTripDay } from './legacy/data/supabase/tripDays';
import type { FamilyTripExpense, TripExpenseDraft } from './legacy/data/supabase/tripExpenses';
import * as expenses from './legacy/data/supabase/tripExpenses';
import * as tripPlaces from './legacy/data/supabase/tripPlaces';
import type { FamilyTransportReservation, FamilyTripReservation } from './legacy/data/supabase/tripReservations';
import * as reservations from './legacy/data/supabase/tripReservations';
import { plannerActionAvailable } from './plannerActionAvailability';
import {
  FamilyApiError,
  FamilyFrontendRepository,
  familyReaders,
  type FamilyReaders,
  type FamilySession,
} from './repository';
import { createFamilyAxiosAdapter, createFamilyFetch } from './transport';
import * as weather from './upstream/weatherService';
import * as previewScope from './routePlanningPreview';
import * as routePreview from './routePreferences';
import * as tourPreview from './previewTourReads';

const uuid = (n: number) => `10000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const session: FamilySession = {
  userId: uuid(1),
  personId: uuid(2),
  familyId: uuid(3),
  user: { username: 'Family member', email: 'member@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
};
const trip = {
  id: uuid(4),
  family_id: uuid(3),
  title: 'Trip',
  description: null,
  start_date: '2026-08-13',
  end_date: '2026-08-14',
  cover_image: null,
  is_archived: 0,
  currency: 'EUR',
  reminder_days: 7,
  status: 'planned',
};
const day: FamilyTripDay = { id: uuid(5), tripId: trip.id, civilDay: '2026-08-13', dayIndex: 0, title: 'Rome' };
const visit: FamilyScheduleItem = {
  id: uuid(6),
  tripId: trip.id,
  activity: 'Visit',
  placeId: null,
  startsAt: '2026-08-13T08:00:00.000Z',
  endsAt: null,
  address: null,
  timeZone: null,
  sortOrder: 0,
  experienceId: null,
  foodId: null,
  linkUrl: null,
};
const flight: FamilyTransportReservation = {
  id: uuid(7),
  tripId: trip.id,
  title: 'Night flight',
  type: 'flight',
  status: 'pending',
  startTripDayId: day.id,
  endTripDayId: day.id,
  startsAt: '2026-08-13T21:00:00.000Z',
  endsAt: '2026-08-14T06:00:00.000Z',
  confirmationCode: null,
  notes: null,
  url: null,
  metadata: {},
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  endpoints: [],
  legs: [],
};
const hotel: FamilyTripReservation = {
  id: uuid(8),
  tripId: trip.id,
  title: 'Inn',
  type: 'hotel',
  status: 'pending',
  startTripDayId: day.id,
  endTripDayId: day.id,
  startsAt: null,
  endsAt: null,
  confirmationCode: null,
  notes: null,
  url: null,
  placeId: null,
  hotelId: null,
  scheduleItemId: null,
  metadata: {},
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function readers(outcomes: Record<string, 'direct' | 'propose' | 'deny'>): FamilyReaders {
  return {
    ...familyReaders,
    trips: { ...familyReaders.trips, fetchTripById: vi.fn(async () => trip) },
    days: { ...familyReaders.days, listTripDays: vi.fn(async () => [day]) },
    places: { ...familyReaders.places, listTripPlaces: vi.fn(async () => []) },
    schedule: { ...familyReaders.schedule, listScheduleItems: vi.fn(async () => [visit]) },
    notes: { ...familyReaders.notes, listDayNotes: vi.fn(async () => []) },
    expenses: { ...familyReaders.expenses, listTripExpenses: vi.fn(async () => []) },
    listTripTravelers: vi.fn(async () => []),
    capabilities: { ...familyReaders.capabilities, canMutateTrip: vi.fn(async () => true) },
    permissions: {
      ...familyReaders.permissions,
      listTripActionOutcomes: vi.fn(async () => ({ tripId: trip.id, familyId: session.familyId, outcomes })),
    },
  };
}

it('dispatches only scoped Road trip and Tour reads for an ordinary preview trip', async () => {
  const repo = new FamilyFrontendRepository(async () => session, readers({}));
  const handle = createFamilyApplicationHandler(repo);
  const active = vi.spyOn(previewScope, 'hostedRoadtripToursTripId').mockReturnValue(trip.id);
  const route = vi.spyOn(routePreview, 'handleRoutePreview').mockResolvedValue({ boundaries: [] });
  const tour = vi.spyOn(tourPreview, 'handlePreviewTourRead').mockResolvedValue({ tours: [] });
  const request = (suffix: string, method = 'GET', query = '') => handle({
    method, pathname: `/trips/${trip.id}/${suffix}`, query: new URLSearchParams(query), body: undefined,
  });
  try {
    await expect(request('roadtrip/day-boundaries')).resolves.toEqual({ boundaries: [] });
    await expect(request('tours')).resolves.toEqual({ tours: [] });
    await expect(request('tours/12')).resolves.toEqual({ tours: [] });
    await expect(request('family/route-waypoints', 'PUT')).rejects.toThrow();
    await expect(request('tours', 'GET', 'unexpected=1')).resolves.toEqual({ tours: [] });
    active.mockReturnValue(uuid(99));
    await expect(request('family/route-preferences')).rejects.toThrow();
    expect(route).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledWith(expect.anything(), trip.id, 'roadtrip/day-boundaries', expect.anything(), true);
    expect(tour).toHaveBeenCalledTimes(2);
  } finally {
    vi.restoreAllMocks();
  }
});

describe('application handler expense and transport contracts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps payer contributions on the draft the handler sends to upsertTripExpense', () => {
    const ids = new FamilyIdentityRegistry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const existing = {
      id: '66666666-6666-4666-8666-666666666666',
      tripId: '11111111-1111-4111-8111-111111111111',
      name: 'Meal',
      category: 'food',
      totalAmount: 20,
      currencyCode: 'USD',
      exchangeRate: 1,
      expenseDate: '2026-10-29',
      note: '',
      ticketLines: [],
      reservationId: null,
      sortOrder: 1,
      createdAt: '2026-10-29T00:00:00Z',
      shares: [],
      payers: [
        { expenseId: 'e', personId: 'p1', amount: 12 },
        { expenseId: 'e', personId: 'p2', amount: 8 },
      ],
    } as FamilyTripExpense;
    const draft: TripExpenseDraft = expenseDraft({ name: 'Meal' }, existing, ids, 'USD');
    expect(draft.payerContributions).toEqual([
      { personId: 'p1', amount: 12 },
      { personId: 'p2', amount: 8 },
    ]);
  });

  it('invokes schedule timing, payer contributions, transport header clocks, and draft rejection', async () => {
    const direct = readers({
      'trip.schedule.manage': 'direct',
      'trip.costs.manage': 'direct',
      'trip.reservations.manage': 'direct',
    });
    const repo = new FamilyFrontendRepository(async () => session, direct);
    const handler = createFamilyApplicationHandler(repo);
    const timing = vi
      .spyOn(schedule, 'updateScheduleTiming')
      .mockImplementation(async (_tripId, id, next) => ({ ...visit, id, ...next }));
    const savedExpense = vi.spyOn(expenses, 'upsertTripExpense').mockResolvedValue(uuid(9));
    vi.spyOn(expenses, 'listTripExpenses').mockResolvedValue([]);
    const savedTransport = vi.spyOn(reservations, 'upsertTripTransport').mockResolvedValue(flight.id);
    vi.spyOn(reservations, 'listTripTransports').mockResolvedValue([flight]);
    vi.spyOn(reservations, 'listTripBookings').mockResolvedValue([]);

    await handler({
      method: 'PUT',
      pathname: `/trips/${trip.id}/assignments/${visit.id}/time`,
      query: new URLSearchParams(),
      body: { place_time: '09:30' },
    });
    expect(timing).toHaveBeenCalledWith(
      trip.id,
      visit.id,
      expect.objectContaining({
        startsAt: '2026-08-13T09:30:00.000Z',
        endsAt: null,
      })
    );

    await handler({
      method: 'POST',
      pathname: `/trips/${trip.id}/budget`,
      query: new URLSearchParams(),
      body: {
        name: 'Meal',
        total_price: 20,
        currency: 'EUR',
        payers: [
          { user_id: uuid(2), amount: 12 },
          { user_id: uuid(3), amount: 8 },
        ],
      },
    });
    expect(savedExpense.mock.calls[0][0].draft.payerContributions).toEqual([
      { personId: uuid(2), amount: 12 },
      { personId: uuid(3), amount: 8 },
    ]);

    await handler({
      method: 'PUT',
      pathname: `/trips/${trip.id}/reservations/${flight.id}`,
      query: new URLSearchParams(),
      body: { type: 'flight', title: 'Night flight', metadata: { carrier: 'Flix' } },
    });
    expect(savedTransport).toHaveBeenCalledWith(
      trip.id,
      expect.objectContaining({
        headerStartsAt: flight.startsAt,
        headerEndsAt: flight.endsAt,
        metadata: expect.objectContaining({ carrier: 'Flix' }),
      })
    );

    const draftRepo = new FamilyFrontendRepository(
      async () => session,
      readers({ 'trip.reservations.manage': 'propose' })
    );
    const canonical = await draftRepo.tripUuid(trip.id);
    draftRepo.setLayer(canonical, 'myDraft');
    expect(draftRepo.getLayer(canonical)).toBe('myDraft');
    const draftHandler = createFamilyApplicationHandler(draftRepo);
    vi.spyOn(reservations, 'listTripBookings').mockResolvedValue([hotel]);
    vi.spyOn(reservations, 'listTripTransports').mockResolvedValue([]);
    const bookingWrite = vi.spyOn(reservations, 'upsertTripBooking');
    await expect(
      draftHandler({
        method: 'PUT',
        pathname: `/trips/${trip.id}/reservations/${hotel.id}`,
        query: new URLSearchParams(),
        body: { type: 'hotel', title: 'Inn', metadata: { room: '4' } },
      })
    ).rejects.toMatchObject({ code: 'draft_fields_unavailable', status: 422 } satisfies Partial<FamilyApiError>);
    expect(bookingWrite).not.toHaveBeenCalled();
  });
});

describe('application handler day titles and visit timing routes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves native day and visit IDs before renaming a day or moving a visit', async () => {
    const data = readers({ 'trip.schedule.manage': 'direct' });
    const destination: FamilyTripDay = { ...day, id: uuid(10), civilDay: '2026-08-14', dayIndex: 1 };
    const list = vi.mocked(data.days.listTripDays).mockResolvedValue([day, destination]);
    const title = vi.spyOn(data.days, 'updateTripDayTitle').mockImplementation(async (_id, value) => {
      list.mockResolvedValue([{ ...day, title: value }, destination]);
    });
    const timing = vi.spyOn(schedule, 'updateScheduleTiming').mockImplementation(async (_trip, id, fields) => ({
      ...visit,
      id,
      ...fields,
    }));
    const repo = new FamilyFrontendRepository(async () => session, data);
    const handler = createFamilyApplicationHandler(repo);
    const { ids } = await repo.views();
    const tripKey = ids.register('trip', trip.id);
    const dayKey = ids.register('day', day.id);
    const destinationKey = ids.register('day', destination.id);
    const visitKey = ids.register('assignment', visit.id);

    await expect(
      handler({
        method: 'PUT',
        pathname: `/trips/${tripKey}/days/${dayKey}`,
        query: new URLSearchParams(),
        body: { title: 'Museum day' },
      })
    ).resolves.toMatchObject({ day: { id: dayKey, title: 'Museum day' } });
    expect(title).toHaveBeenCalledExactlyOnceWith(day.id, 'Museum day');

    await expect(
      handler({
        method: 'PUT',
        pathname: `/trips/${tripKey}/assignments/${visitKey}/move`,
        query: new URLSearchParams(),
        body: { new_day_id: destinationKey, order_index: 0 },
      })
    ).resolves.toMatchObject({ assignment: { id: visitKey, day_id: destinationKey, assignment_time: '08:00' } });
    expect(timing).toHaveBeenCalledExactlyOnceWith(trip.id, visit.id, {
      ...visit,
      startsAt: '2026-08-14T08:00:00.000Z',
    });
  });

  it.each([
    { method: 'PUT', suffix: 'days', status: 501, code: 'family_action_unavailable' },
    { method: 'PUT', suffix: 'assignments//time', status: 501, code: 'family_action_unavailable' },
    { method: 'PUT', suffix: 'assignments//move', status: 501, code: 'family_action_unavailable' },
    { method: 'POST', suffix: `days/${day.id}`, status: 501, code: 'family_action_unavailable' },
    { method: 'POST', suffix: `assignments/${visit.id}/time`, status: 501, code: 'family_action_unavailable' },
    { method: 'PUT', suffix: `days/${uuid(99)}`, status: 404, code: 'day_unavailable' },
    { method: 'PUT', suffix: `assignments/${uuid(99)}/time`, status: 404, code: 'assignment_unavailable' },
  ])('refuses $method $suffix before a planner write', async ({ method, suffix, status, code }) => {
    const repo = new FamilyFrontendRepository(async () => session, readers({ 'trip.schedule.manage': 'direct' }));
    const write = vi.spyOn(repo, 'write').mockRejectedValue(new Error('Unexpected fixture write'));
    await expect(
      createFamilyApplicationHandler(repo)({
        method,
        pathname: `/trips/${trip.id}/${suffix}`,
        query: new URLSearchParams(),
        body: { title: 'Museum day' },
      })
    ).rejects.toMatchObject({ status, code });
    expect(write).not.toHaveBeenCalled();
  });
});

describe('application handler visit removal day scope', () => {
  afterEach(() => vi.restoreAllMocks());

  const otherDay: FamilyTripDay = { ...day, id: uuid(10), civilDay: '2026-08-14', dayIndex: 1 };
  const request = (dayId: string, target: string, method = 'DELETE') => ({
    method,
    pathname: `/trips/${trip.id}/days/${dayId}/assignments/${target}`,
    query: new URLSearchParams(),
    body: undefined,
  });

  it.each([
    { method: 'DELETE', dayId: otherDay.id, target: visit.id, status: 404, code: 'assignment_unavailable' },
    { method: 'DELETE', dayId: day.id, target: 'reorder', status: 501, code: 'family_action_unavailable' },
    { method: 'POST', dayId: day.id, target: 'reorder', status: 501, code: 'family_action_unavailable' },
  ])('refuses $method $target on $dayId before mutating the Trip', async ({ method, dayId, target, status, code }) => {
    const data = readers({ 'trip.schedule.manage': 'direct' });
    vi.mocked(data.days.listTripDays).mockResolvedValue([day, otherDay]);
    const repo = new FamilyFrontendRepository(async () => session, data);
    const write = vi.spyOn(repo, 'write').mockRejectedValue(new Error('Unexpected fixture write'));
    await expect(createFamilyApplicationHandler(repo)(request(dayId, target, method))).rejects.toMatchObject({
      status,
      code,
    });
    expect(write).not.toHaveBeenCalled();
  });

  it.each([true, false])('checks Trip, visit and day in the DELETE request, matching row: %s', async (matches) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(matches ? [{ id: visit.id }] : []));
    const sdk = createClient('https://schedule.fixture.invalid', 'fixture-public-key', {
      global: { fetch },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    vi.spyOn(supabase, 'getSupabaseBrowserClient').mockReturnValue(sdk);
    const repo = new FamilyFrontendRepository(async () => session, readers({ 'trip.schedule.manage': 'direct' }));
    const result = createFamilyApplicationHandler(repo)(request(day.id, visit.id));
    if (matches) await expect(result).resolves.toEqual({ success: true });
    else await expect(result).rejects.toMatchObject({ status: 409, code: 'assignment_changed' });

    expect(fetch).toHaveBeenCalledOnce();
    const [input, options] = fetch.mock.calls[0];
    const url = new URL(String(input));
    expect(url.pathname).toBe('/rest/v1/schedule_items');
    expect(options?.method).toBe('DELETE');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      id: `eq.${visit.id}`,
      trip_id: `eq.${trip.id}`,
      select: 'id',
    });
    expect(url.searchParams.getAll('starts_at')).toEqual([
      'gte.2026-08-13T00:00:00.000Z',
      'lt.2026-08-14T00:00:00.000Z',
    ]);
  });

  it('keeps the original day with a proposed removal', async () => {
    const repo = new FamilyFrontendRepository(async () => session, readers({ 'trip.schedule.manage': 'propose' }));
    const stage = vi.spyOn(repo, 'stage').mockResolvedValue({ draftId: uuid(99), opId: uuid(98) });
    const tripId = await repo.tripUuid(trip.id);
    repo.setLayer(tripId, 'myDraft');
    await expect(createFamilyApplicationHandler(repo)(request(day.id, visit.id))).rejects.toMatchObject({
      status: 409,
      code: 'family_draft_staged',
    });
    expect(stage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        tripId: trip.id,
        tripDayId: day.id,
        civilDate: day.civilDay,
        targetId: visit.id,
        targetTable: 'schedule_items',
        op: 'remove',
      })
    );
  });
});

describe('recovered password payload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const request = (body: Record<string, unknown>) => ({
    method: 'POST',
    pathname: '/auth/reset-password',
    query: new URLSearchParams(),
    body,
  });

  it('sends new_password to the Family recovery update', async () => {
    const update = vi.spyOn(auth, 'updateRecoveredPassword').mockResolvedValue();
    await expect(createFamilyApplicationHandler()(request({ new_password: 'Longenough1!' }))).resolves.toEqual({
      success: true,
    });
    expect(update).toHaveBeenCalledWith('Longenough1!');
  });

  it('still accepts the password field', async () => {
    const update = vi.spyOn(auth, 'updateRecoveredPassword').mockResolvedValue();
    await expect(createFamilyApplicationHandler()(request({ password: 'Longenough1!' }))).resolves.toEqual({
      success: true,
    });
    expect(update).toHaveBeenCalledWith('Longenough1!');
  });

  it('returns too_short instead of an empty success when the password is missing', async () => {
    await expect(createFamilyApplicationHandler()(request({}))).rejects.toMatchObject({
      code: 'too_short',
      status: 422,
    });
  });
});

describe('native TREK optional plugin map contributions', () => {
  it.each(['map-markers', 'map-layers'])(
    'returns no configured %s providers after checking trip access',
    async (path) => {
      const data = readers({});
      const repo = new FamilyFrontendRepository(async () => session, data);
      const handler = createFamilyApplicationHandler(repo);
      const tripKey = (await repo.views()).ids.register('trip', trip.id);
      const request = { method: 'GET', pathname: `/${path}/${trip.id}`, query: new URLSearchParams(), body: undefined };
      const empty = path === 'map-markers' ? { markers: [] } : { layers: [] };
      await expect(handler(request)).resolves.toEqual(empty);
      await expect(handler({ ...request, pathname: `/${path}/${tripKey}` })).resolves.toEqual(empty);
      expect(data.trips.fetchTripById).toHaveBeenNthCalledWith(1, trip.id);
      expect(data.trips.fetchTripById).toHaveBeenNthCalledWith(2, trip.id);

      const denied = readers({});
      vi.mocked(denied.trips.fetchTripById)
        .mockRejectedValueOnce(new FamilyApiError(403, 'trip_denied', 'Denied'))
        .mockResolvedValueOnce({ ...trip, family_id: uuid(99) });
      const deniedHandler = createFamilyApplicationHandler(new FamilyFrontendRepository(async () => session, denied));
      await expect(deniedHandler(request)).rejects.toMatchObject({ status: 403, code: 'trip_denied' });
      await expect(deniedHandler(request)).rejects.toMatchObject({ status: 403, code: 'trip_scope_unavailable' });

      for (const unmatched of [
        { ...request, method: 'POST' },
        { ...request, pathname: `/${path}/` },
        { ...request, pathname: `${request.pathname}/extra` },
      ]) {
        await expect(handler(unmatched)).rejects.toMatchObject({ status: 501, code: 'adapter_not_connected' });
      }
      expect(data.trips.fetchTripById).toHaveBeenCalledTimes(2);
    }
  );
});

describe('Family weather request validation', () => {
  afterEach(() => vi.restoreAllMocks());

  const forecast = { temp: 18, main: 'Clear', description: 'Clear sky', type: 'forecast' };
  const request = (pathname: string, query: string) => ({
    method: 'GET',
    pathname,
    query: new URLSearchParams(query),
    body: undefined,
  });

  it('forwards valid current, historical and detailed requests to the corresponding handler', async () => {
    const basic = vi.spyOn(weather, 'getWeather').mockResolvedValue(forecast);
    const detailed = vi.spyOn(weather, 'getDetailedWeather').mockResolvedValue(forecast);
    const handler = createFamilyApplicationHandler(new FamilyFrontendRepository(async () => session, readers({})));
    await expect(handler(request('/weather', 'lat=0&lng=-0'))).resolves.toEqual(forecast);
    await expect(
      handler(request('/weather', 'lat=19.04&lng=-98.19&date=2026-11-17&lang=es&time=09:30'))
    ).resolves.toEqual(forecast);
    await expect(handler(request('/weather/detailed', 'lat=-90&lng=180&date=2026-11-18&lang=es'))).resolves.toEqual(
      forecast
    );
    expect(basic.mock.calls).toEqual([
      ['0', '-0', undefined, 'en', undefined],
      ['19.04', '-98.19', '2026-11-17', 'es', '09:30'],
    ]);
    expect(detailed).toHaveBeenCalledExactlyOnceWith('-90', '180', '2026-11-18', 'es');
  });

  it.each([
    ['missing latitude', '/weather', 'lng=-98.19'],
    ['blank latitude', '/weather', 'lat=&lng=-98.19'],
    ['whitespace longitude', '/weather/detailed', 'lat=19.04&lng=%20%20&date=2026-11-18'],
    ['non-numeric latitude', '/weather', 'lat=unknown&lng=0'],
    ['out-of-range latitude', '/weather', 'lat=-91&lng=0'],
    ['out-of-range longitude', '/weather/detailed', 'lat=19.04&lng=181&date=2026-11-18'],
    ['missing detailed date', '/weather/detailed', 'lat=19.04&lng=-98.19'],
    ['blank detailed date', '/weather/detailed', 'lat=19.04&lng=-98.19&date='],
    ['malformed date', '/weather', 'lat=19.04&lng=-98.19&date=2026-11'],
  ])('refuses %s before dispatching weather work', async (_, path, query) => {
    const basic = vi.spyOn(weather, 'getWeather').mockResolvedValue(forecast);
    const detailed = vi.spyOn(weather, 'getDetailedWeather').mockResolvedValue(forecast);
    const handler = createFamilyApplicationHandler(new FamilyFrontendRepository(async () => session, readers({})));
    await expect(handler(request(path, query))).rejects.toMatchObject({
      status: 422,
      code: 'invalid_weather_location',
    });
    expect(basic).not.toHaveBeenCalled();
    expect(detailed).not.toHaveBeenCalled();
  });
});

describe('standalone lodging and public-share read boundaries', () => {
  it.each(['accommodations', 'bundle'])(
    'refuses unqualified %s instead of fabricating an empty lodging list',
    async (suffix) => {
      const r = readers({ 'trip.schedule.manage': 'direct', 'trip.reservations.manage': 'direct' });
      const handler = createFamilyApplicationHandler(new FamilyFrontendRepository(async () => session, r));
      const api = axios.create({ adapter: createFamilyAxiosAdapter(handler) });
      await expect(api.get(`/trips/${trip.id}/${suffix}`)).rejects.toMatchObject({
        response: { status: 503, data: { code: 'family_stays_unavailable' } },
      });
      expect(r.trips.fetchTripById).not.toHaveBeenCalled();
    }
  );
  it.each(['direct', 'propose', 'deny'])(
    'does not expose a private stay or create a public share from a %s grant',
    async (outcome) => {
      const r = readers({ 'trip.share.manage': outcome as 'direct' | 'propose' | 'deny' });
      const handler = createFamilyApplicationHandler(new FamilyFrontendRepository(async () => session, r));
      const network = vi.fn(),
        fetcher = createFamilyFetch(handler, network, 'https://family.fixture.invalid');
      for (const [method, path] of [
        ['GET', '/shared/opaque-local-test-token'],
        ['GET', `/trips/${trip.id}/share-link`],
        ['POST', `/trips/${trip.id}/share-link`],
        ['DELETE', `/trips/${trip.id}/share-link`],
      ]) {
        const response = await fetcher('/api' + path, { method });
        expect(response.status).toBe(501);
        const body = await response.json();
        expect(body).not.toHaveProperty('trip');
        expect(body).not.toHaveProperty('accommodations');
      }
      expect(network).not.toHaveBeenCalled();
      expect(r.trips.fetchTripById).not.toHaveBeenCalled();
      expect(plannerActionAvailable('share_manage')).toBe(false);
    }
  );
  it('keeps anonymous shared lookup unavailable without reading a private repository', async () => {
    const identity = vi.fn(async () => {
      throw new FamilyApiError(401, 'session_required', 'Sign in');
    });
    const r = readers({}),
      handler = createFamilyApplicationHandler(new FamilyFrontendRepository(identity, r));
    await expect(
      handler({
        method: 'GET',
        pathname: '/shared/opaque-local-test-token',
        query: new URLSearchParams(),
        body: undefined,
      })
    ).rejects.toMatchObject({ status: 501 });
    expect(identity).not.toHaveBeenCalled();
    expect(r.trips.fetchTripById).not.toHaveBeenCalled();
  });
});

describe('extracted Trip resource request ownership', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());
  function gate() {
    let resolve: () => void = () => {
      throw new Error('Gate not initialized');
    };
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, release: () => resolve() };
  }
  function bookingReads() {
    const list = vi.spyOn(reservations, 'listTripBookings').mockResolvedValue([hotel]);
    vi.spyOn(reservations, 'listTripTransports').mockResolvedValue([]);
    return list;
  }
  function placeRequest(outcome: 'direct' | 'propose') {
    const r = readers({ 'trip.places.manage': outcome });
    const repo = new FamilyFrontendRepository(async () => session, r);
    const publish = vi.spyOn(tripPlaces, 'upsertTripPlace').mockResolvedValue(true);
    const stage = vi.spyOn(repo, 'stage').mockResolvedValue({ draftId: uuid(90), opId: uuid(91) });
    const client = axios.create({ adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(repo)) });
    return { client, r, repo, publish, stage, path: '/trips/' + trip.id + '/places' };
  }
  it.each(['direct', 'propose'] as const)(
    'refuses missing catalog place identity for %s access before writing',
    async (outcome) => {
      const { client, repo, publish, stage, path } = placeRequest(outcome);
      await repo.tripUuid(trip.id);
      if (outcome === 'propose') repo.setLayer(trip.id, 'myDraft');
      const write = vi.spyOn(repo, 'write');
      await expect(client.post(path, {})).rejects.toMatchObject({
        response: {
          status: 422,
          data: { code: 'family_action_unavailable' },
        },
      });
      expect(write).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
      expect(stage).not.toHaveBeenCalled();
    }
  );
  it('publishes a selected catalog place and returns the place from the refreshed Trip', async () => {
    const { client, r, repo, publish, stage, path } = placeRequest('direct');
    const place: tripPlaces.FamilyTripPlace = {
      id: uuid(72),
      name: 'Catalog place',
      lat: null,
      lng: null,
      notes: null,
      timeZone: null,
      countryId: null,
      placeTypeId: null,
      isPrimary: false,
      imageUrl: null,
      familyPlaceCategoryId: null,
      familyPlaceCategoryName: null,
      familyPlaceCategoryColor: null,
      familyPlaceCategoryIcon: null,
    };
    publish.mockImplementation(async () => {
      vi.mocked(r.places.listTripPlaces).mockResolvedValue([place]);
      return true;
    });
    const result = await client.post(path, { family_place_id: place.id });
    expect(publish).toHaveBeenCalledExactlyOnceWith(trip.id, place.id);
    expect(stage).not.toHaveBeenCalled();
    expect(result.data.place.name).toBe(place.name);
    expect((await repo.views()).ids.uuid('place', result.data.place.id)).toBe(place.id);
  });
  it('stages a selected native place identity with its canonical ID', async () => {
    const { client, repo, publish, stage, path } = placeRequest('propose');
    await repo.tripUuid(trip.id);
    repo.setLayer(trip.id, 'myDraft');
    const placeId = uuid(73);
    const selector = (await repo.views()).ids.register('place', placeId);
    await expect(client.post(path, { place_id: selector })).rejects.toMatchObject({
      response: { status: 409, data: { code: 'family_draft_staged' } },
    });
    expect(stage).toHaveBeenCalledExactlyOnceWith({
      tripId: trip.id,
      module: 'trip_place',
      op: 'add',
      targetTable: 'trip_places',
      payload: { schema_version: 1, place_id: placeId, is_primary: false },
    });
    expect(publish).not.toHaveBeenCalled();
  });
  it.each(['canonical', 'native'])(
    'keeps %s booking identity and reloads only after the direct status write',
    async (kind) => {
      bookingReads();
      const repo = new FamilyFrontendRepository(async () => session, readers({ 'trip.reservations.manage': 'direct' }));
      const views = await repo.views();
      const selector = kind === 'canonical' ? hotel.id : views.ids.register('reservation', hotel.id);
      const update = vi.spyOn(reservations, 'setTripReservationStatus').mockResolvedValue();
      const client = axios.create({ adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(repo)) });
      const result = await client.put('/trips/' + trip.id + '/reservations/' + selector, { status: 'confirmed' });
      expect(update).toHaveBeenCalledExactlyOnceWith(hotel.id, 'confirmed');
      expect(views.ids.uuid('reservation', result.data.reservation.id)).toBe(hotel.id);
    }
  );
  it.each(['propose', 'deny'] as const)(
    'keeps %s permission away from the published status writer',
    async (outcome) => {
      bookingReads();
      const repo = new FamilyFrontendRepository(async () => session, readers({ 'trip.reservations.manage': outcome }));
      await repo.tripUuid(trip.id);
      if (outcome === 'propose') repo.setLayer(trip.id, 'myDraft');
      const stage = vi.spyOn(repo, 'stage').mockResolvedValue({ draftId: uuid(90), opId: uuid(91) });
      const update = vi.spyOn(reservations, 'setTripReservationStatus').mockResolvedValue();
      const client = axios.create({ adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(repo)) });
      await expect(
        client.put('/trips/' + trip.id + '/reservations/' + hotel.id, { status: 'confirmed' })
      ).rejects.toMatchObject({
        response: {
          status: outcome === 'propose' ? 409 : 403,
          data: { code: outcome === 'propose' ? 'family_draft_staged' : 'action_denied' },
        },
      });
      expect(update).not.toHaveBeenCalled();
      if (outcome === 'propose')
        expect(stage).toHaveBeenCalledWith(
          expect.objectContaining({
            tripId: trip.id,
            module: 'reservation',
            op: 'update',
            targetId: hotel.id,
          })
        );
      else expect(stage).not.toHaveBeenCalled();
    }
  );
  function reservationRemovalRequest(outcome: 'direct' | 'propose' | 'deny', isHof: boolean) {
    const list = bookingReads();
    const data = readers({ 'trip.reservations.manage': outcome });
    vi.mocked(data.capabilities.canMutateTrip).mockResolvedValue(isHof);
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, options) => {
      const { pathname } = new URL(String(input));
      if (pathname === '/rest/v1/rpc/upsert_trip_change_draft_op' && options?.method === 'POST')
        return Response.json({ draft_id: uuid(90), op_id: uuid(91) });
      if (pathname === '/rest/v1/trip_reservations' && options?.method === 'DELETE') {
        list.mockResolvedValue([]);
        return new Response(null, { status: 204 });
      }
      throw new Error('Unexpected reservation write in fixture');
    });
    const sdk = createClient('https://reservation.fixture.invalid', 'fixture-public-key', {
      global: { fetch },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: `reservation-fixture-${crypto.randomUUID()}`,
      },
    });
    vi.spyOn(supabase, 'getSupabaseBrowserClient').mockReturnValue(sdk);
    vi.spyOn(backendSupabase, 'getSupabaseBrowserClient').mockReturnValue(sdk);
    const repo = new FamilyFrontendRepository(async () => session, data);
    const client = axios.create({ adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(repo)) });
    return { fetch, repo, client, path: `/trips/${trip.id}/reservations` };
  }

  it.each([
    { outcome: 'propose', isHof: false, native: false },
    { outcome: 'propose', isHof: false, native: true },
    { outcome: 'direct', isHof: true, native: true },
  ] as const)(
    'stages a My Draft reservation removal for $outcome access with native ID: $native',
    async ({ outcome, isHof, native }) => {
      const { client, fetch, repo, path } = reservationRemovalRequest(outcome, isHof);
      const before = await client.get(path);
      expect(before.data).toMatchObject({ reservations: [{ title: hotel.title, status: hotel.status }] });
      const selector = native ? (await repo.views()).ids.register('reservation', hotel.id) : hotel.id;
      repo.setLayer(trip.id, 'myDraft');

      await expect(client.delete(`${path}/${selector}`)).rejects.toMatchObject({
        response: { status: 409, data: { code: 'family_draft_staged' } },
      });

      repo.setLayer(trip.id, 'published');
      expect((await client.get(path)).data).toEqual(before.data);
      expect(fetch).toHaveBeenCalledOnce();
      const [input, options] = fetch.mock.calls[0];
      expect(new URL(String(input)).pathname).toBe('/rest/v1/rpc/upsert_trip_change_draft_op');
      expect(options?.method).toBe('POST');
      expect(JSON.parse(String(options?.body))).toEqual({
        p_trip_id: trip.id,
        p_op_id: null,
        p_module: 'reservation',
        p_op: 'remove',
        p_trip_day_id: null,
        p_civil_date: null,
        p_target_table: 'trip_reservations',
        p_target_id: hotel.id,
        p_payload: { schema_version: 1 },
        p_sort_order: 0,
      });
    }
  );

  it.each([
    { outcome: 'deny', layer: 'myDraft', code: 'action_denied' },
    { outcome: 'propose', layer: 'published', code: 'draft_required' },
    { outcome: 'direct', layer: 'myDraft', code: 'action_denied' },
  ] as const)(
    'refuses a reservation removal for $outcome access in $layer without writing',
    async ({ outcome, layer, code }) => {
      const { client, fetch, repo, path } = reservationRemovalRequest(outcome, false);
      await repo.tripUuid(trip.id);
      repo.setLayer(trip.id, layer);

      await expect(client.delete(`${path}/${hotel.id}`)).rejects.toMatchObject({
        response: { status: 403, data: { code } },
      });

      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('preserves the direct Published reservation removal path', async () => {
    const { client, fetch, path } = reservationRemovalRequest('direct', true);
    const before = await client.get(path);
    expect(before.data).toMatchObject({ reservations: [{ title: hotel.title }] });

    expect((await client.delete(`${path}/${hotel.id}`)).data).toEqual({ success: true });
    expect((await client.get(path)).data).toEqual({ reservations: [] });

    expect(fetch).toHaveBeenCalledOnce();
    const [input, options] = fetch.mock.calls[0];
    const url = new URL(String(input));
    expect(url.pathname).toBe('/rest/v1/trip_reservations');
    expect(url.searchParams.get('id')).toBe(`eq.${hotel.id}`);
    expect(options?.method).toBe('DELETE');
  });

  it.each(['places', 'reservations'])('refuses an absent %s record without dispatching a delete', async (resource) => {
    bookingReads();
    const repo = new FamilyFrontendRepository(
      async () => session,
      readers({
        'trip.places.manage': 'direct',
        'trip.reservations.manage': 'direct',
      })
    );
    const reservationDelete = vi.spyOn(reservations, 'deleteTripReservation').mockResolvedValue();
    const write = vi.spyOn(repo, 'write');
    const client = axios.create({ adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(repo)) });
    await expect(client.delete('/trips/' + trip.id + '/' + resource + '/' + uuid(70))).rejects.toMatchObject({
      response: {
        status: 404,
        data: { code: resource === 'places' ? 'place_unavailable' : 'reservation_unavailable' },
      },
    });
    expect(write).not.toHaveBeenCalled();
    expect(reservationDelete).not.toHaveBeenCalled();
  });
  it.each(['person', 'family', 'source', 'layer'] as const)(
    'retires a pending reservation read on a %s switch before writing',
    async (kind) => {
      let actor = { ...session },
        source = 'https://one.invalid';
      const repo = new FamilyFrontendRepository(
        async () => actor,
        readers({ 'trip.reservations.manage': 'direct' }),
        () => ({ ...actor, source })
      );
      const wait = gate(),
        entered = gate();
      vi.spyOn(reservations, 'listTripBookings').mockImplementation(async () => {
        entered.release();
        await wait.promise;
        return [hotel];
      });
      vi.spyOn(reservations, 'listTripTransports').mockResolvedValue([]);
      const update = vi.spyOn(reservations, 'setTripReservationStatus').mockResolvedValue();
      const client = axios.create({ adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(repo)) });
      const body = { status: 'confirmed' };
      const request = client.put('/trips/' + trip.id + '/reservations/' + hotel.id, body);
      const refused = expect(request).rejects.toMatchObject({ response: { status: 409 } });
      await entered.promise;
      if (kind === 'source') {
        source = 'https://two.invalid';
        repo.refreshContext();
      } else if (kind === 'layer') repo.setLayer(trip.id, 'myDraft');
      else {
        actor = { ...actor, [kind === 'person' ? 'personId' : 'familyId']: uuid(80) };
        repo.acceptSession(actor);
      }
      wait.release();
      await refused;
      expect(update).not.toHaveBeenCalled();
      expect(body).toEqual({ status: 'confirmed' });
    }
  );
  it('retains one issued write and refuses its old acknowledgement after an account A/B/A switch', async () => {
    const list = bookingReads();
    const repo = new FamilyFrontendRepository(async () => session, readers({ 'trip.reservations.manage': 'direct' }));
    const entered = gate(),
      wait = gate();
    const update = vi.spyOn(reservations, 'setTripReservationStatus').mockImplementation(async () => {
      entered.release();
      await wait.promise;
    });
    const client = axios.create({ adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(repo)) });
    const request = client.put('/trips/' + trip.id + '/reservations/' + hotel.id, { status: 'confirmed' });
    const refused = expect(request).rejects.toMatchObject({ response: { status: 409 } });
    await entered.promise;
    repo.acceptSession({ ...session, userId: uuid(80), personId: uuid(81) });
    repo.acceptSession(session);
    wait.release();
    await refused;
    expect(update).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
