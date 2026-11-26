import { describe, expect, it, vi } from 'vitest';
import {
  FamilyApiError,
  FamilyFrontendRepository,
  familyReaders,
  type FamilyReaders,
  type FamilySession,
} from './repository';
const uuid = (n: number) => `10000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const session: FamilySession = {
  userId: uuid(1),
  personId: uuid(2),
  familyId: uuid(3),
  user: {
    username: 'Family member',
    email: 'member@fixture.invalid',
    avatar_url: null,
    created_at: '2026-01-01',
  },
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
function readers(): FamilyReaders {
  return {
    ...familyReaders,
    trips: { ...familyReaders.trips, fetchTripById: vi.fn(async () => trip) },
    days: { ...familyReaders.days, listTripDays: vi.fn(async () => []) },
    places: { ...familyReaders.places, listTripPlaces: vi.fn(async () => []) },
    schedule: { ...familyReaders.schedule, listScheduleItems: vi.fn(async () => []) },
    notes: { ...familyReaders.notes, listDayNotes: vi.fn(async () => []) },
    capabilities: { ...familyReaders.capabilities, canMutateTrip: vi.fn(async () => false) },
    permissions: {
      ...familyReaders.permissions,
      listTripActionOutcomes: vi.fn(async () => ({
        tripId: trip.id,
        familyId: session.familyId,
        outcomes: {
          'trip.places.manage': 'direct' as const,
          'trip.schedule.manage': 'propose' as const,
        },
      })),
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
describe('Family frontend repository boundary', () => {
  it('coalesces session and canonical core reads for both original rails and the map', async () => {
    const r = readers();
    const getSession = vi.fn(async () => session);
    const repo = new FamilyFrontendRepository(getSession, r);
    const result = await Promise.all([repo.trip(trip.id), repo.dayList(trip.id), repo.placeList(trip.id)]);
    expect(result[0].trip.title).toBe('Trip');
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(r.trips.fetchTripById).toHaveBeenCalledTimes(1);
    const tripKey = result[0].trip.id;
    expect((await repo.trip(tripKey)).trip.family_uuid).toBe(trip.id);
    expect(r.trips.fetchTripById).toHaveBeenCalledWith(trip.id);
    repo.invalidate(trip.id);
    await repo.trip(tripKey);
    expect(r.trips.fetchTripById).toHaveBeenCalledTimes(2);
  });
  it('releases failed reads so Retry reaches the backend and never reports an empty success', async () => {
    const r = readers();
    vi.mocked(r.schedule.listScheduleItems).mockRejectedValueOnce(new Error('Backend unavailable'));
    const repo = new FamilyFrontendRepository(async () => session, r);
    await expect(repo.dayList(trip.id)).rejects.toThrow('Backend unavailable');
    expect((await repo.dayList(trip.id)).days).toEqual([]);
    expect(r.schedule.listScheduleItems).toHaveBeenCalledTimes(2);
  });
  it('rejects unknown or wrong-kind frontend keys before a canonical trip read', async () => {
    const r = readers();
    const repo = new FamilyFrontendRepository(async () => session, r);
    const v = await repo.views();
    const place = v.ids.register('place', uuid(8));
    await expect(repo.trip(place)).rejects.toThrow('unknown_view_key');
    await expect(repo.trip(42)).rejects.toThrow('unknown_view_key');
    expect(r.trips.fetchTripById).not.toHaveBeenCalled();
  });
  it('drops a completion from a cleared session and keeps the next session independent', async () => {
    const r = readers();
    const pending = deferred<typeof trip>();
    vi.mocked(r.trips.fetchTripById).mockReturnValueOnce(pending.promise);
    const repo = new FamilyFrontendRepository(async () => session, r);
    const first = repo.core(trip.id);
    const stale = expect(first).rejects.toMatchObject({ code: 'stale_session' });
    await vi.waitFor(() => expect(r.trips.fetchTripById).toHaveBeenCalledTimes(1));
    repo.clear();
    pending.resolve(trip);
    await stale;
    await repo.core(trip.id);
    expect(r.trips.fetchTripById).toHaveBeenCalledTimes(2);
  });
  it('uses action outcomes and the selected layer, never frontend ownership, to authorize writes', async () => {
    const repo = new FamilyFrontendRepository(async () => session, readers());
    const direct = vi.fn(async () => ({ ok: true }));
    const draft = vi.fn(async () => ({ ok: true }));
    await repo.write(trip.id, 'trip.places.manage', direct, draft);
    expect(direct).toHaveBeenCalledTimes(1);
    await expect(repo.write(trip.id, 'trip.schedule.manage', direct, draft)).rejects.toMatchObject({
      code: 'draft_required',
    });
    repo.setLayer(trip.id, 'myDraft');
    await repo.write(trip.id, 'trip.schedule.manage', direct, draft);
    expect(draft).toHaveBeenCalledTimes(1);
    expect(direct).toHaveBeenCalledTimes(1);
    await expect(repo.write(trip.id, 'trip.files.trash', direct)).rejects.toBeInstanceOf(FamilyApiError);
    expect(direct).toHaveBeenCalledTimes(1);
  });
});

it('shares canonical reservation reads with the map and releases failed reads for retry', async () => {
  const r = readers();
  r.reservations = {
    ...r.reservations,
    listTripBookings: vi.fn(async () => []),
    listTripTransports: vi.fn(async () => []),
  };
  const repo = new FamilyFrontendRepository(async () => session, r);
  await repo.session();
  await Promise.all([repo.canonicalBookings(trip.id), repo.reservationList(trip.id)]);
  expect(r.reservations.listTripBookings).toHaveBeenCalledTimes(1);
  expect(r.reservations.listTripTransports).toHaveBeenCalledTimes(1);
  repo.invalidate(trip.id);
  vi.mocked(r.reservations.listTripBookings).mockRejectedValueOnce(new Error('offline'));
  await expect(repo.reservationList(trip.id)).rejects.toThrow('offline');
  await expect(repo.reservationList(trip.id)).resolves.toEqual({ reservations: [] });
  expect(r.reservations.listTripBookings).toHaveBeenCalledTimes(3);
});
