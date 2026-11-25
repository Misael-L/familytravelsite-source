import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { nativeStayFixture } from '../../../tests/helpers/familyNativeStays';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { createNativeStayReader } from './bookingStayRead';
import { FamilyFrontendRepository, type FamilySession } from './repository';
let p: ReturnType<typeof nativeStayFixture>,
  repo: FamilyFrontendRepository,
  user: FamilySession,
  source: string,
  sid: string,
  selected: number;
const rpc = vi.fn<(trip: string) => Promise<unknown>>();
const auth = async () => ({ user_id: user.userId, session_id: sid });
const reader = () => createNativeStayReader(repo, { rpc, auth, source: () => source });
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  _resetNetworkMode();
  setAuthed(true);
  p = nativeStayFixture();
  source = 'http://127.0.0.1:57171';
  sid = crypto.randomUUID();
  user = {
    userId: p.core.user_id,
    personId: p.core.person_id,
    familyId: p.core.family_id,
    user: { username: 'Synthetic', email: 'synthetic@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  };
  repo = new FamilyFrontendRepository(
    async () => user,
    undefined,
    () => ({ userId: user.userId, personId: user.personId, familyId: user.familyId, source })
  );
  await repo.session();
  selected = (await repo.views()).ids.register('trip', p.core.trip_id);
  useTripStore.setState({ trip: { id: selected } as never });
  rpc.mockReset().mockResolvedValue(p);
});
afterEach(async () => {
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
it('one tagged native read keeps the original UUID and never publishes native/cache state', async () => {
  const before = useTripStore.getState();
  expect(await reader()(selected)).toEqual(p);
  expect(rpc).toHaveBeenCalledExactlyOnceWith(p.core.trip_id);
  expect(useTripStore.getState()).toBe(before);
  expect(await offlineDb.accommodations.count()).toBe(0);
});
it.each(['source', 'family', 'person', 'session', 'trip', 'layer', 'logout', 'abort'] as const)(
  'retires a %s-switched read before exposing any core',
  async (kind) => {
    const abort = new AbortController();
    rpc.mockImplementationOnce(async () => {
      if (kind === 'source') source += '/changed';
      if (kind === 'family') user.familyId = crypto.randomUUID();
      if (kind === 'person') user.personId = crypto.randomUUID();
      if (kind === 'session') sid = crypto.randomUUID();
      if (kind === 'trip') useTripStore.setState({ trip: { id: selected + 1 } as never });
      if (kind === 'layer') repo.setLayer(p.core.trip_id, 'myDraft');
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
it('refuses offline without substituting an old cache or response dialect', async () => {
  setForcedOffline(true);
  await expect(reader()(selected)).rejects.toMatchObject({ status: 503 });
  expect(rpc).not.toHaveBeenCalled();
});
it('refuses a bare old core and malformed tagged views', async () => {
  rpc.mockResolvedValue(p.core);
  await expect(reader()(selected)).rejects.toBeDefined();
  rpc.mockResolvedValue({ ...p, extra: true });
  await expect(reader()(selected)).rejects.toBeDefined();
});
it.each([
  ['42501', 403],
  ['PGRST202', 503],
])('preserves actual %s refusal', async (code, status) => {
  rpc.mockRejectedValue({ code });
  await expect(reader()(selected)).rejects.toMatchObject({ status });
});
