import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bookingStayFixture } from '../../../tests/helpers/familyBookingStays';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { createBookingStayReader, handleFamilyBookingStayView } from './bookingStayRead';
import { NOT_HANDLED } from './listHandler';
import { FamilyFrontendRepository, type FamilySession } from './repository';
const rpc = vi.fn<(trip: string) => Promise<unknown>>();
let p: ReturnType<typeof bookingStayFixture>,
  repo: FamilyFrontendRepository,
  user: FamilySession,
  source: string,
  sid: string,
  selected: number;
const auth = async () => ({ user_id: user.userId, session_id: sid });
const reader = () => createBookingStayReader(repo, { rpc, auth, source: () => source });
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  _resetNetworkMode();
  setAuthed(true);
  p = bookingStayFixture();
  source = 'http://127.0.0.1:56371';
  sid = crypto.randomUUID();
  user = {
    userId: p.user_id,
    personId: p.person_id,
    familyId: p.family_id,
    user: { username: 'Synthetic', email: 'synthetic@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  };
  repo = new FamilyFrontendRepository(
    async () => user,
    undefined,
    () => ({ userId: user.userId, personId: user.personId, familyId: user.familyId, source })
  );
  await repo.session();
  selected = (await repo.views()).ids.register('trip', p.trip_id);
  useTripStore.setState({ trip: { id: selected } as never });
  rpc.mockReset().mockResolvedValue(p);
});
afterEach(async () => {
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
it('one actual reader call uses UUID and publishes no store, cache or saved generation', async () => {
  const before = useTripStore.getState();
  expect(await reader()(selected)).toEqual(p);
  expect(rpc).toHaveBeenCalledExactlyOnceWith(p.trip_id);
  expect(useTripStore.getState()).toBe(before);
  expect(await offlineDb.accommodations.count()).toBe(0);
});
it.each(['source', 'family', 'person', 'session', 'trip', 'layer', 'logout', 'abort'] as const)(
  'retires the entire %s-switched read',
  async (kind) => {
    const abort = new AbortController();
    rpc.mockImplementationOnce(async () => {
      if (kind === 'source') source += '/changed';
      if (kind === 'family') user.familyId = crypto.randomUUID();
      if (kind === 'person') user.personId = crypto.randomUUID();
      if (kind === 'session') sid = crypto.randomUUID();
      if (kind === 'trip') useTripStore.setState({ trip: { id: selected + 1 } as never });
      if (kind === 'layer') repo.setLayer(p.trip_id, 'myDraft');
      if (kind === 'logout') {
        setAuthed(false);
        invalidateOfflineSession();
      }
      if (kind === 'abort') abort.abort();
      return p;
    });
    await expect(reader()(selected, abort.signal)).rejects.toBeDefined();
  }
);
it('same-session renewed credentials remain compatible', async () => {
  let generation = 0;
  const same = vi.fn(async () => {
    generation++;
    return { user_id: p.user_id, session_id: sid };
  });
  expect(await createBookingStayReader(repo, { rpc, auth: same, source: () => source })(selected)).toEqual(p);
  expect(generation).toBeGreaterThan(1);
});
it('refuses offline rather than substituting a v3 cached generation', async () => {
  setForcedOffline(true);
  await expect(reader()(selected)).rejects.toMatchObject({ status: 503 });
  expect(rpc).not.toHaveBeenCalled();
});
it.each([
  ['42501', 403],
  ['PGRST202', 503],
  ['54000', 413],
  ['23514', 422],
])('preserves %s refusal instead of empty success', async (code, status) => {
  rpc.mockRejectedValue({ code });
  await expect(reader()(selected)).rejects.toMatchObject({ status });
});
it('does not route public or old native accommodation requests into the private reader', async () => {
  for (const pathname of [`/shared/trips/${p.trip_id}`, `/trips/${p.trip_id}/accommodations`])
    expect(
      await handleFamilyBookingStayView(repo, { method: 'GET', pathname, query: new URLSearchParams(), body: null })
    ).toBe(NOT_HANDLED);
  expect(rpc).not.toHaveBeenCalled();
});
it.each([
  ['POST', ''],
  ['GET', 'layer=myDraft'],
  ['GET', 'limit=20'],
])('refuses %s %s partial/private native request', async (method, query) => {
  await expect(
    handleFamilyBookingStayView(repo, {
      method,
      pathname: `/trips/${p.trip_id}/family/booking-stay-view-v2`,
      query: new URLSearchParams(query),
      body: null,
    })
  ).rejects.toMatchObject({ status: 400 });
});
