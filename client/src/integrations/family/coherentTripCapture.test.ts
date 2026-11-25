import axios from 'axios';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { coherentTripData } from '../../../tests/helpers/familyCompleteTripV4';
import { nativeStayFixture } from '../../../tests/helpers/familyNativeStays';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { invalidateOfflineSession, offlineDb, reopenAnonymous, reopenForUser } from '../../db/offlineDb';
import { accommodationRepo } from '../../repo/accommodationRepo';
import { installPlannerReadPort } from '../../repo/plannerReadPort';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { clearSignedOut } from '../../utils/signedOut';
import { coherentStayQualificationEnabled } from './coherentStayQualification';
import { createCoherentTripCapture } from './coherentTripCapture';
import { openCoherentTripRead, openCompleteTripRead } from './completeTripRead';
import { parseCompleteTripV4 } from './completeTripV4';
import { withOfflineTripReads } from './offlineTripReadPort';
import { createOfflineTripSession, currentOfflineTripSession } from './offlineTripSession';
import { plannerCacheDb, retirePlannerCacheOwners } from './plannerCache';
import { withdrawCompleteTripGeneration } from './plannerCompleteStorage';
import { FamilyFrontendRepository, familyAuthStore, type FamilySession } from './repository';
import { createFamilyAxiosAdapter, createFamilyFetch, type FamilyRequest } from './transport';
function required<T>(v: T | null | undefined): T {
  if (v == null) throw new Error('Missing test observation');
  return v;
}
const env = vi.hoisted(() => ({ source: 'http://127.0.0.1:56471' }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => env.source }));
let data: ReturnType<typeof coherentTripData>,
  repo: FamilyFrontendRepository,
  user: FamilySession,
  sid: string,
  selected: number;
const read = vi.fn(),
  auth = async () => ({ user_id: user.userId, session_id: sid });
const create = () => createCoherentTripCapture(repo, { read, auth });
const load = async () => {
  const { core: _core, ...ancillary } = data;
  return structuredClone(ancillary);
};
const beforeFamily = familyAuthStore.getState();
beforeEach(async () => {
  resetAllStores();
  _resetNetworkMode();
  clearSignedOut();
  setAuthed(true);
  env.source = 'http://127.0.0.1:56471';
  vi.stubEnv('VITE_FAMILY_STAY_READ_QUALIFICATION', 'local-v4');
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  data = coherentTripData();
  sid = crypto.randomUUID();
  const p = data.core;
  user = {
    userId: p.user_id,
    personId: p.person_id,
    familyId: p.family_id,
    user: { username: 'Synthetic', email: 'fixture@invalid.test', avatar_url: null, created_at: '2026-01-01' },
  };
  repo = new FamilyFrontendRepository(
    async () => user,
    undefined,
    () => ({ userId: user.userId, personId: user.personId, familyId: user.familyId, source: env.source })
  );
  await repo.session();
  const ids = (await repo.views()).ids;
  const person = ids.register('person', p.person_id);
  selected = ids.register('trip', p.trip_id);
  await reopenForUser(person);
  await resetOfflineTestDatabase();
  await Promise.all(plannerCacheDb.tables.map((t) => t.clear()));
  useTripStore.setState({ trip: { id: selected } as never });
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
    authUserId: p.user_id,
    familyId: p.family_id,
    personId: p.person_id,
    authGate: 'ok',
    authCheckFailed: false,
  });
  read.mockReset().mockImplementation(async () => structuredClone(data.core));
});
afterEach(async () => {
  currentOfflineTripSession()?.dispose();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  _resetNetworkMode();
  setAuthed(false);
  familyAuthStore.setState(beforeFamily, true);
  await resetOfflineTestDatabase();
  await reopenAnonymous();
});
function cold() {
  setAuthed(false);
  familyAuthStore.setState({ authGate: null, authCheckFailed: true });
  useAuthStore.setState({ authCheckFailed: true });
  setForcedOffline(true);
}
it('persists exactly one immutable complete v4 and does not publish native/store/partial rows', async () => {
  const before = useTripStore.getState();
  const c = await create()(selected, load);
  expect(read).toHaveBeenCalledExactlyOnceWith(data.core.trip_id, undefined);
  expect(useTripStore.getState()).toBe(before);
  expect(await plannerCacheDb.snapshots.count()).toBe(0);
  expect(await plannerCacheDb.completeSnapshots.count()).toBe(1);
  expect(await plannerCacheDb.completeHeads.count()).toBe(1);
  expect(await offlineDb.accommodations.count()).toBe(0);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
  expect(c.envelope.data.core).toEqual(data.core);
});
it('cold reopens the actual persisted head without network or cached authorization, and old readers refuse it', async () => {
  const c = await create()(selected, load);
  await plannerCacheDb.close();
  await plannerCacheDb.open();
  cold();
  const lease = await openCoherentTripRead(data.core.trip_id);
  expect(lease.envelope).toEqual(c.envelope);
  let calls = 0;
  await lease.publish(() => calls++);
  expect(calls).toBe(1);
  expect(familyAuthStore.getState().authGate).toBeNull();
  expect(read).toHaveBeenCalledTimes(1);
  await expect(openCompleteTripRead(data.core.trip_id)).rejects.toThrow();
  lease.close();
});
it('a capture loader cannot mutate or replace the retained canonical core', async () => {
  const c = await create()(selected, async (core) => {
    core.stays[0].stay.notes = 'Loader mutation';
    return load();
  });
  expect(c.envelope.data.core).toEqual(data.core);
  await expect(create()(selected, async () => ({ ...(await load()), core: data.core }))).rejects.toThrow(
    'cannot replace'
  );
});
it.each(['source', 'family', 'person', 'trip', 'session', 'layer', 'logout', 'abort', 'invalidation'] as const)(
  'refuses a %s change during ancillary capture and leaves no partial head',
  async (kind) => {
    const abort = new AbortController();
    await expect(
      create()(
        selected,
        async () => {
          if (kind === 'source') env.source += '/changed';
          if (kind === 'family') user.familyId = crypto.randomUUID();
          if (kind === 'person') user.personId = crypto.randomUUID();
          if (kind === 'trip') useTripStore.setState({ trip: { id: selected + 1 } as never });
          if (kind === 'session') sid = crypto.randomUUID();
          if (kind === 'layer') repo.setLayer(data.core.trip_id, 'myDraft');
          if (kind === 'logout') {
            setAuthed(false);
            invalidateOfflineSession();
          }
          if (kind === 'abort') abort.abort();
          if (kind === 'invalidation') repo.invalidate(data.core.trip_id);
          return load();
        },
        abort.signal
      )
    ).rejects.toBeDefined();
    expect(await plannerCacheDb.completeHeads.count()).toBe(0);
  }
);
it('never calls the read on an ordinary/hosted build or offline', async () => {
  vi.stubEnv('VITE_FAMILY_STAY_READ_QUALIFICATION', '');
  expect(coherentStayQualificationEnabled()).toBe(false);
  await expect(create()(selected, load)).rejects.toThrow();
  vi.stubEnv('VITE_FAMILY_STAY_READ_QUALIFICATION', 'local-v4');
  setForcedOffline(true);
  await expect(create()(selected, load)).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});
it('does not replace a complete old head after a missing API or invalid ancillary reply', async () => {
  const first = await create()(selected, load);
  read.mockRejectedValueOnce({ status: 503, code: 'PGRST202' });
  await expect(create()(selected, load)).rejects.toBeDefined();
  await expect(
    create()(selected, async () => ({ ...(await load()), packing_categories_v2: {} }) as never)
  ).rejects.toThrow();
  const row = await plannerCacheDb.completeSnapshots.get(first.envelope.generation);
  expect(row?.value).toEqual(first.envelope);
  expect(await plannerCacheDb.completeSnapshots.count()).toBe(1);
});
it('a fresh successful capture atomically replaces the head and removes only its previous generation', async () => {
  const first = await create()(selected, load),
    next = await create()(selected, load);
  expect(next.envelope.generation).not.toBe(first.envelope.generation);
  expect(await plannerCacheDb.completeSnapshots.get(first.envelope.generation)).toBeUndefined();
  expect((await plannerCacheDb.completeHeads.toArray())[0].generation).toBe(next.envelope.generation);
});
it('a late competing capture cannot overwrite a newer complete head', async () => {
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>((r) => (entered = r)),
    go = new Promise<void>((r) => (release = r));
  const old = create()(selected, async () => {
    entered();
    await go;
    return load();
  });
  await waiting;
  const current = await create()(selected, load);
  release();
  await expect(old).rejects.toThrow('generation advanced');
  expect((await plannerCacheDb.completeHeads.toArray())[0].generation).toBe(current.envelope.generation);
});
it('known online denial evicts its original saved generation', async () => {
  await create()(selected, load);
  read.mockRejectedValueOnce({ status: 403, code: '42501' });
  await expect(create()(selected, load)).rejects.toBeDefined();
  expect(await plannerCacheDb.completeHeads.count()).toBe(0);
});
it.each(['body', 'head', 'owner', 'queue', 'family', 'source', 'expired', 'online', 'logout'] as const)(
  'retires a cold reader after %s change before publication',
  async (kind) => {
    const c = await create()(selected, load);
    cold();
    const lease = await openCoherentTripRead(data.core.trip_id);
    if (kind === 'body') {
      const row = await plannerCacheDb.completeSnapshots.get(c.envelope.generation);
      required(row).value.capturedAt--;
      await plannerCacheDb.completeSnapshots.put(required(row));
    }
    if (kind === 'head') {
      const head = (await plannerCacheDb.completeHeads.toArray())[0];
      await plannerCacheDb.completeHeads.put({ ...head, generation: crypto.randomUUID() });
    }
    if (kind === 'owner')
      await retirePlannerCacheOwners(
        Promise.resolve([{ key: c.envelope.ownership.ownerKey, generation: c.envelope.ownership.ownerGeneration }])
      );
    if (kind === 'queue')
      await offlineDb.mutationQueue.put({
        id: crypto.randomUUID(),
        tripId: selected,
        method: 'POST',
        url: `/trips/${data.core.trip_id}/family/stays/commands`,
        body: {},
        createdAt: Date.now(),
        status: 'pending',
        retryCount: 0,
      } as never);
    if (kind === 'family') familyAuthStore.setState({ familyId: crypto.randomUUID() });
    if (kind === 'source') env.source += '/changed';
    if (kind === 'expired') vi.spyOn(Date, 'now').mockReturnValue(c.envelope.expiresAt + 1);
    if (kind === 'online') setForcedOffline(false);
    if (kind === 'logout') invalidateOfflineSession();
    let publications = 0;
    await expect(lease.publish(() => publications++)).rejects.toBeDefined();
    expect(publications).toBe(0);
    lease.close();
  }
);
it('corrupt persisted manifest fails cold parsing rather than falling back to a partial planner row', async () => {
  const c = await create()(selected, load),
    row = await plannerCacheDb.completeSnapshots.get(c.envelope.generation);
  required(row).value.digest = '0'.repeat(64);
  await plannerCacheDb.completeSnapshots.put(required(row));
  cold();
  await expect(openCoherentTripRead(data.core.trip_id)).rejects.toThrow('digest');
});
it('parser checks a roundtripped database value against its original persisted owner', async () => {
  const c = await create()(selected, load),
    e = c.envelope;
  expect(
    await parseCompleteTripV4(JSON.stringify(e), {
      source: e.source,
      scope: e.scope,
      ownership: e.ownership,
      now: e.verifiedAt,
    })
  ).toEqual(e);
});

it('withdraws its own head when an Auth-session change is observed immediately after its cache commit', async () => {
  const put: typeof plannerCacheDb.completeHeads.put = plannerCacheDb.completeHeads.put.bind(
    plannerCacheDb.completeHeads
  );
  vi.spyOn(plannerCacheDb.completeHeads, 'put').mockImplementationOnce((...args) =>
    put(...args).then((result) => {
      sid = crypto.randomUUID();
      return result;
    })
  );
  await expect(create()(selected, load)).rejects.toBeDefined();
  expect(await plannerCacheDb.completeHeads.count()).toBe(0);
  expect(await plannerCacheDb.completeSnapshots.count()).toBe(0);
});

it('exact-generation withdrawal never deletes a newer complete head', async () => {
  const old = await create()(selected, load),
    current = await create()(selected, load);
  await withdrawCompleteTripGeneration(plannerCacheDb, old.envelope);
  expect((await plannerCacheDb.completeHeads.toArray())[0].generation).toBe(current.envelope.generation);
  expect(await plannerCacheDb.completeSnapshots.count()).toBe(1);
});

it('an accepted live observation can fence retained intent offline, while its capture fence still refuses', async () => {
  const observed = await create()(data.core.trip_id, load);
  setForcedOffline(true);
  await expect(observed.fence()).rejects.toThrow();
  await expect(observed.originalIntentFence()).resolves.toBeUndefined();
  sid = crypto.randomUUID();
  await expect(observed.originalIntentFence()).rejects.toThrow();
});

it.each([null, { id: 999 }])('original intent follows only the captured Trip publication from %s', async (opening) => {
  useTripStore.setState({ trip: opening as never });
  const observed = await create()(data.core.trip_id, load);
  await expect(observed.originalIntentFence()).rejects.toThrow();
  useTripStore.setState({ trip: { id: selected } as never });
  await expect(observed.originalIntentFence()).resolves.toBeUndefined();
  await expect(observed.fence()).rejects.toThrow();
  useTripStore.setState({ trip: { id: selected + 1 } as never });
  await expect(observed.originalIntentFence()).rejects.toThrow();
  useTripStore.setState({ trip: null });
  await expect(observed.originalIntentFence()).rejects.toThrow();
});

it('captures the separately tagged native core then cold reopens explicit ownership without a second reader', async () => {
  const native = nativeStayFixture();
  data = coherentTripData(native.core);
  const nativeRead = vi.fn(async () => structuredClone(native));
  const c = await createCoherentTripCapture(repo, { nativeRead, auth })(selected, load);
  expect(nativeRead).toHaveBeenCalledExactlyOnceWith(native.core.trip_id, undefined);
  expect(read).not.toHaveBeenCalled();
  expect(c.envelope.data.native_stay_format).toBe(native.format);
  expect(c.envelope.data.core).toEqual(native.core);
  await plannerCacheDb.close();
  await plannerCacheDb.open();
  cold();
  const lease = await openCoherentTripRead(native.core.trip_id);
  expect(lease.envelope.data).toEqual(c.envelope.data);
  lease.close();
});
it('refuses an ancillary loader that forges native core provenance', async () => {
  await expect(
    create()(selected, async () => ({ ...(await load()), native_stay_format: 'family.native-stay-view.v1' }))
  ).rejects.toThrow('cannot replace');
  expect(await plannerCacheDb.completeHeads.count()).toBe(0);
});
it('refuses simultaneous old and native core readers', () => {
  expect(() => createCoherentTripCapture(repo, { read, nativeRead: async () => nativeStayFixture(), auth })).toThrow(
    'exactly one'
  );
});

async function savedNativeStays(empty = false) {
  const native = nativeStayFixture();
  native.core.stays[0].stay.notes = 'Private saved lodging note';
  native.core.bookings[0].record.notes = 'Private saved booking note';
  native.core.bookings[0].record.confirmation_code = 'PRIVATE-LOCAL-REFERENCE';
  const booking = native.core.stays[0].booking;
  if (!booking) throw Error('Fixture needs a linked booking');
  booking.record = structuredClone(native.core.bookings[0].record);
  if (empty) {
    native.core.stays = [];
    native.core.bookings = [];
    native.core.planner.state.visits = [];
  }
  data = coherentTripData(native.core);
  await createCoherentTripCapture(repo, { nativeRead: async () => structuredClone(native), auth })(selected, load);
  await plannerCacheDb.close();
  await plannerCacheDb.open();
  cold();
  const saved = await createOfflineTripSession(native.core.trip_id, () => {});
  await saved.load(native.core.trip_id);
  return { saved, native };
}
const savedRequest = (suffix: string, method = 'GET', query = new URLSearchParams()): FamilyRequest => ({
  method,
  pathname: `/trips/${data.core.trip_id}/${suffix}`,
  query,
  body: undefined,
});
it('serves actual saved v4 lodgings through the handler, fetch/Axios and native port from one saved generation', async () => {
  const { saved, native } = await savedNativeStays();
  const paired = required(saved.currentStays(selected));
  expect(paired.accommodations).toHaveLength(native.core.stays.length);
  const api = axios.create({ adapter: createFamilyAxiosAdapter(saved.handle) }),
    network = vi.fn();
  const response = await api.get(`/trips/${selected}/accommodations`);
  expect(response.data.accommodations).toEqual(paired.accommodations);
  expect(response.data.accommodations[0].notes).toBe('Private saved lodging note');
  const fetcher = createFamilyFetch(saved.handle, network, 'https://saved.fixture.invalid');
  expect(await (await fetcher(`/api/trips/${selected}/reservations`)).json()).toEqual({
    reservations: paired.reservations,
  });
  const live = vi.fn(async () => {
    throw Error('No online fallback');
  });
  const release = installPlannerReadPort(
    withOfflineTripReads({ places: async () => ({ places: [] }), days: async () => ({ days: [] }), stays: live })
  );
  try {
    expect((await accommodationRepo.list(selected)).accommodations).toEqual(response.data.accommodations);
  } finally {
    release();
  }
  expect(live).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
  expect(await offlineDb.mutationQueue.count()).toBe(0);
});
it('returns an empty lodging list only for a verified complete v4 core with no stays', async () => {
  const { saved } = await savedNativeStays(true);
  await expect(saved.handle(savedRequest('accommodations'))).resolves.toEqual({ accommodations: [] });
});
it.each(['accommodations', 'reservations'])(
  'refuses filtered saved %s instead of pretending a subset is the whole paired view',
  async (suffix) => {
    const { saved } = await savedNativeStays();
    await expect(saved.handle(savedRequest(suffix, 'GET', new URLSearchParams('limit=1')))).rejects.toMatchObject({
      status: 400,
      code: 'coherent_full_read',
    });
  }
);
it.each(['constructor', 'toString', '__proto__'])('refuses inherited route key %s', async (suffix) => {
  const { saved } = await savedNativeStays();
  await expect(saved.handle(savedRequest(suffix))).rejects.toMatchObject({
    status: 503,
    code: 'saved_resource_unavailable',
  });
});
it.each(['POST', 'PUT', 'DELETE'])('refuses saved lodging %s without mutation or queued fallback', async (method) => {
  const { saved } = await savedNativeStays();
  const before = JSON.stringify(saved.currentStays(selected));
  await expect(saved.handle(savedRequest('accommodations', method))).rejects.toMatchObject({
    status: 503,
    code: 'saved_trip_read_only',
  });
  expect(JSON.stringify(saved.currentStays(selected))).toBe(before);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
});
it('does not substitute another Trip or keep serving a lodging after the saved lease ends', async () => {
  const { saved } = await savedNativeStays();
  await expect(
    saved.handle({ ...savedRequest('accommodations'), pathname: `/trips/${crypto.randomUUID()}/accommodations` })
  ).rejects.toThrow();
  saved.dispose();
  await expect(saved.handle(savedRequest('accommodations'))).rejects.toThrow();
});

it.each(['source', 'family', 'person', 'logout', 'online', 'queue', 'head', 'expiry', 'trip'])(
  'refuses the saved lodging endpoint after %s retirement rather than serving an old private pair',
  async (kind) => {
    const { saved } = await savedNativeStays();
    if (kind === 'source') env.source += '/other';
    if (kind === 'family') familyAuthStore.setState({ familyId: crypto.randomUUID() });
    if (kind === 'person') familyAuthStore.setState({ personId: crypto.randomUUID() });
    if (kind === 'logout') {
      invalidateOfflineSession();
      familyAuthStore.setState({ isAuthenticated: false });
    }
    if (kind === 'online') setForcedOffline(false);
    if (kind === 'queue')
      await offlineDb.mutationQueue.put({
        id: crypto.randomUUID(),
        tripId: selected,
        url: '/trips/' + data.core.trip_id + '/places',
        method: 'POST',
        body: {},
        createdAt: Date.now(),
        attempts: 0,
        status: 'pending',
      } as never);
    if (kind === 'head') {
      const head = required((await plannerCacheDb.completeHeads.toArray())[0]);
      await plannerCacheDb.completeHeads.put({ ...head, generation: crypto.randomUUID() });
    }
    if (kind === 'expiry') vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 86400000);
    if (kind === 'trip') useTripStore.setState({ trip: { id: selected + 1 } as never });
    const api = axios.create({ adapter: createFamilyAxiosAdapter(saved.handle) });
    await expect(api.get(`/trips/${selected}/accommodations`)).rejects.toBeDefined();
  }
);
