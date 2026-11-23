import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFamilyApplicationHandler } from './applicationHandler';
import { useFamilyReadState } from './readState';
import { FamilyFrontendRepository, familyReaders, type FamilySession } from './repository';
import { createFamilyAxiosAdapter, createFamilyFetch } from './transport';

const id = (n: number) => `10000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const trip = id(4),
  file = id(5);
const original: FamilySession = {
  userId: id(1),
  personId: id(2),
  familyId: id(3),
  user: { username: 'Fixture', email: 'fixture@example.invalid', avatar_url: null, created_at: '2026-01-01' },
};
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fileRecord(): Awaited<ReturnType<typeof familyReaders.files.listTripFiles>>[number] {
  return {
    id: file,
    tripId: trip,
    storagePath: 'old/file.pdf',
    links: [],
    originalName: 'file.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 12,
    uploadedBy: original.personId,
    starred: false,
    description: null,
    deletedAt: null,
    createdAt: '2026-01-01',
  };
}
function fixture() {
  let session = { ...original },
    source = 'https://project-a.invalid';
  const row = () => ({
    id: trip,
    family_id: session.familyId,
    title: `${source}:${session.personId}:${session.familyId}`,
    description: null,
    start_date: '2026-08-13',
    end_date: '2026-08-14',
    cover_image: null,
    is_archived: 0,
    currency: 'EUR',
    reminder_days: 7,
    status: 'planned',
  });
  const readers = {
    ...familyReaders,
    trips: {
      ...familyReaders.trips,
      fetchTripById: vi.fn(async () => row()),
      listFamilyTrips: vi.fn(async () => ({ trips: [row()], archivedTrips: [] })),
    },
    days: { ...familyReaders.days, listTripDays: vi.fn(async () => []) },
    places: { ...familyReaders.places, listTripPlaces: vi.fn(async () => []) },
    schedule: { ...familyReaders.schedule, listScheduleItems: vi.fn(async () => []) },
    notes: { ...familyReaders.notes, listDayNotes: vi.fn(async () => []) },
    capabilities: { ...familyReaders.capabilities, canMutateTrip: vi.fn(async () => false) },
    permissions: {
      ...familyReaders.permissions,
      listTripActionOutcomes: vi.fn(async () => ({
        tripId: trip,
        familyId: session.familyId,
        outcomes: { 'trip.places.manage': 'direct' } as Awaited<
          ReturnType<typeof familyReaders.permissions.listTripActionOutcomes>
        >['outcomes'],
      })),
    },
    files: {
      ...familyReaders.files,
      listTripFiles: vi.fn(async () => [] as Awaited<ReturnType<typeof familyReaders.files.listTripFiles>>),
      signedTripFileUrl: vi.fn(async () => 'https://files.invalid/original'),
    },
    listTripTravelers: vi.fn(async () => []),
    listMemberFamilyPlaceCategories: vi.fn(async () => []),
  };
  const repo = new FamilyFrontendRepository(
    async () => session,
    readers,
    () => ({ source, ...session })
  );
  const client = axios.create({ adapter: createFamilyAxiosAdapter(createFamilyApplicationHandler(repo)) });
  function change(kind: string) {
    if (kind === 'source') source = 'https://project-b.invalid';
    else if (kind === 'layer') repo.setLayer(trip, 'myDraft');
    else {
      session = { ...session, [kind === 'user' ? 'userId' : kind === 'person' ? 'personId' : 'familyId']: id(80) };
      repo.acceptSession(session);
    }
  }
  return { repo, readers, client, row, change, session: () => session };
}
beforeEach(() => {
  localStorage.clear();
  useFamilyReadState.setState({ reads: {} });
});

describe('Family context through actual repository and HTTP orchestration', () => {
  it.each(['person', 'family', 'source'])(
    'replaces cached records for same-account %s changes while preserving numeric IDs',
    async (kind) => {
      const f = fixture(),
        first = await f.client.get(`/trips/${trip}`);
      f.repo.setLayer(trip, 'myDraft');
      f.change(kind);
      const second = await f.client.get(`/trips/${first.data.trip.id}`);
      expect(second.data.trip.title).toBe(f.row().title);
      expect(second.data.trip.id).toBe(first.data.trip.id);
      expect(f.repo.getLayer(trip)).toBe('published');
      expect(f.readers.trips.fetchTripById).toHaveBeenCalledTimes(2);
    }
  );
  it.each(['person', 'family', 'source'])('rejects an old core completion after %s changes', async (kind) => {
    const f = fixture(),
      wait = deferred<ReturnType<typeof f.row>>(),
      old = f.row();
    f.readers.trips.fetchTripById.mockReturnValueOnce(wait.promise);
    const response = f.client.get(`/trips/${trip}`);
    const stale = expect(response).rejects.toMatchObject({ response: { status: 409 } });
    await vi.waitFor(() => expect(f.readers.trips.fetchTripById).toHaveBeenCalledOnce());
    f.change(kind);
    wait.resolve(old);
    await stale;
    expect((await f.client.get(`/trips/${trip}`)).data.trip.title).toBe(f.row().title);
  });
  it.each(['user', 'person', 'family', 'source', 'layer'])(
    'never dispatches a pending permission decision into a different %s',
    async (kind) => {
      const f = fixture(),
        wait = deferred<boolean>(),
        direct = vi.fn(async () => 'direct'),
        draft = vi.fn(async () => 'draft');
      f.readers.capabilities.canMutateTrip.mockReturnValueOnce(wait.promise);
      const result = f.repo.write(trip, 'trip.places.manage', direct, draft);
      const stale = expect(result).rejects.toMatchObject({ status: 409 });
      await vi.waitFor(() => expect(f.readers.capabilities.canMutateTrip).toHaveBeenCalledOnce());
      f.change(kind);
      wait.resolve(true);
      await stale;
      expect(direct).not.toHaveBeenCalled();
      expect(draft).not.toHaveBeenCalled();
    }
  );
  it('rejects a late write acknowledgement without invalidating the replacement cache or replaying', async () => {
    const f = fixture(),
      wait = deferred<string>(),
      direct = vi.fn(() => wait.promise);
    const result = f.repo.write(trip, 'trip.places.manage', direct);
    const stale = expect(result).rejects.toMatchObject({ status: 409 });
    await vi.waitFor(() => expect(direct).toHaveBeenCalledOnce());
    f.change('person');
    await f.repo.core(trip);
    const count = f.readers.trips.fetchTripById.mock.calls.length;
    wait.resolve('committed in original context');
    await stale;
    await f.repo.core(trip);
    expect(f.readers.trips.fetchTripById).toHaveBeenCalledTimes(count);
    expect(direct).toHaveBeenCalledOnce();
  });
  it('does not let a stale file list repopulate references or readiness in a replacement context', async () => {
    const f = fixture(),
      wait = deferred<Awaited<ReturnType<typeof familyReaders.files.listTripFiles>>>();
    const record = fileRecord();
    f.readers.files.listTripFiles.mockReturnValueOnce(wait.promise);
    const result = f.repo.fileList(trip),
      stale = expect(result).rejects.toMatchObject({ status: 409 });
    await vi.waitFor(() => expect(f.readers.files.listTripFiles).toHaveBeenCalledOnce());
    f.change('person');
    await f.repo.session();
    wait.resolve([record]);
    await stale;
    f.readers.files.listTripFiles.mockResolvedValue([record]);
    await expect(f.repo.resolveFileUrl(file)).rejects.toMatchObject({ code: 'file_unavailable' });
    expect(f.readers.files.signedTripFileUrl).not.toHaveBeenCalled();
    expect(useFamilyReadState.getState().reads).toEqual({});
  });
  it('does not mint a signed URL after its file membership read changes context', async () => {
    const f = fixture();
    const record = fileRecord();
    f.readers.files.listTripFiles.mockResolvedValue([record]);
    await f.repo.fileList(trip);
    const wait = deferred<(typeof record)[]>();
    f.readers.files.listTripFiles.mockReturnValueOnce(wait.promise);
    const result = f.repo.resolveFileUrl(file),
      stale = expect(result).rejects.toMatchObject({ status: 409 });
    await vi.waitFor(() => expect(f.readers.files.listTripFiles).toHaveBeenCalledTimes(2));
    f.change('family');
    wait.resolve([record]);
    await stale;
    expect(f.readers.files.signedTripFileUrl).not.toHaveBeenCalled();
  });
  it.each(['trips', 'categories', 'members'])('rejects late %s through the real fetch adapter', async (resource) => {
    const f = fixture(),
      wait = deferred<never>();
    const mocked =
      resource === 'trips'
        ? f.readers.trips.listFamilyTrips
        : resource === 'categories'
          ? f.readers.listMemberFamilyPlaceCategories
          : f.readers.listTripTravelers;
    mocked.mockReturnValueOnce(wait.promise);
    const fetcher = createFamilyFetch(createFamilyApplicationHandler(f.repo), vi.fn(), 'https://app.invalid');
    const result = fetcher(`/api/${resource === 'members' ? `trips/${trip}/members` : resource}`);
    await vi.waitFor(() => expect(mocked).toHaveBeenCalledOnce());
    f.change('person');
    wait.resolve((resource === 'trips' ? { trips: [], archivedTrips: [] } : []) as never);
    const response = await result;
    expect(response.status).toBe(409);
  });
  it('does not dispatch a stale controller callback or let old cleanup evict a new attachment', async () => {
    const f = fixture(),
      old = vi.fn(),
      next = vi.fn();
    const core = await f.repo.core(trip),
      cleanup = f.repo.attachController(core, { canMutate: false, outcomes: {} }, 'published', old);
    f.change('person');
    await f.repo.session();
    f.repo.attachController(await f.repo.core(trip), { canMutate: false, outcomes: {} }, 'published', next);
    cleanup();
    f.repo.setLayer(trip, 'myDraft');
    expect(old).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith('myDraft');
  });
  it('keeps a mid-read invalidation from returning the obsolete core', async () => {
    const f = fixture(),
      wait = deferred<ReturnType<typeof f.row>>();
    f.readers.trips.fetchTripById.mockReturnValueOnce(wait.promise);
    const read = f.repo.core(trip),
      stale = expect(read).rejects.toMatchObject({ status: 409 });
    await vi.waitFor(() => expect(f.readers.trips.fetchTripById).toHaveBeenCalledOnce());
    f.repo.invalidate(trip);
    wait.resolve(f.row());
    await stale;
  });
  it('retains Direct/Propose/Deny and coalescing in a healthy context', async () => {
    const f = fixture(),
      direct = vi.fn(async () => 'direct'),
      draft = vi.fn(async () => 'draft');
    await Promise.all([f.repo.trip(trip), f.repo.dayList(trip), f.repo.placeList(trip)]);
    expect(f.readers.trips.fetchTripById).toHaveBeenCalledOnce();
    await expect(f.repo.write(trip, 'trip.places.manage', direct, draft)).resolves.toBe('direct');
    await expect(f.repo.write(trip, 'unknown', direct, draft)).rejects.toMatchObject({ status: 403 });
    expect(direct).toHaveBeenCalledOnce();
    expect(draft).not.toHaveBeenCalled();
  });
});

it.each(['person', 'family'])('rechecks cached Direct authority after a same-user %s change', async (kind) => {
  const f = fixture(),
    direct = vi.fn(async () => 'direct');
  await f.repo.policy(trip);
  f.change(kind);
  f.readers.permissions.listTripActionOutcomes.mockResolvedValue({
    tripId: trip,
    familyId: f.session().familyId,
    outcomes: {},
  });
  await expect(f.repo.write(trip, 'trip.places.manage', direct)).rejects.toMatchObject({ status: 403 });
  expect(direct).not.toHaveBeenCalled();
  expect(f.readers.permissions.listTripActionOutcomes).toHaveBeenCalledTimes(2);
});
it('rejects a late signed URL even if its original Storage request has already completed', async () => {
  const f = fixture();
  const record = fileRecord();
  f.readers.files.listTripFiles.mockResolvedValue([record]);
  await f.repo.fileList(trip);
  const wait = deferred<string>();
  f.readers.files.signedTripFileUrl.mockReturnValueOnce(wait.promise);
  // Exercise the actual repository URL boundary; the public open route fetches bytes after this boundary.
  const url = f.repo.resolveFileUrl(file),
    stale = expect(url).rejects.toMatchObject({ status: 409 });
  await vi.waitFor(() => expect(f.readers.files.signedTripFileUrl).toHaveBeenCalledOnce());
  f.change('source');
  wait.resolve('https://files.invalid/old-signed');
  await stale;
});

it('rejects a source change during the first session load before any backend read', async () => {
  const wait = deferred<FamilySession>(),
    getSession = vi.fn(() => wait.promise);
  let source = 'https://first.invalid';
  const readers = { ...familyReaders, trips: { ...familyReaders.trips, fetchTripById: vi.fn(async () => null) } };
  const repo = new FamilyFrontendRepository(getSession, readers, () => ({ ...original, source }));
  const pending = repo.session(),
    stale = expect(pending).rejects.toMatchObject({ status: 409 });
  await vi.waitFor(() => expect(getSession).toHaveBeenCalledOnce());
  source = 'https://second.invalid';
  wait.resolve(original);
  await stale;
  expect(readers.trips.fetchTripById).not.toHaveBeenCalled();
  await expect(repo.session()).resolves.toEqual(original);
});
