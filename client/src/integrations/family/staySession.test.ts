import type { StayRpc } from '@family/backend/supabase/stayRpc';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { stayFixture } from '../../../tests/helpers/familyStays';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api from '../../api/client';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { captureWriteSession } from '../../sync/writeSession';
import { NOT_HANDLED } from './listHandler';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { StayCommandSession } from './stayCommandSession';
import { createStayHandler } from './stayHandler';
import { acknowledgeStayIntent, retainStayIntent, stayIntentUrl } from './stayIntentQueue';
import { createStayTransport } from './stayTransport';
import { createFamilyAxiosAdapter } from './transport';
const rpc = vi.fn<StayRpc>(),
  previous = api.defaults.adapter;
let x: ReturnType<typeof stayFixture>,
  repo: FamilyFrontendRepository,
  native: number,
  source: string,
  sid: string,
  current: boolean,
  user: FamilySession,
  stop: () => void,
  status: 'unknown' | 'committed' | 'cancelled';
const auth = async () => ({ user_id: user.userId, session_id: sid });
const channel = () =>
  new StayCommandSession(
    repo,
    { source: () => source, disposed: () => !current },
    x.packet,
    createStayTransport(rpc),
    auth
  );
const handler = () => createStayHandler(repo, () => source, rpc, auth);
const retained = () => offlineDb.mutationQueue.get(x.packet.command.operation_id);
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  installTestLocks();
  _resetNetworkMode();
  setAuthed(true);
  x = stayFixture();
  const s = x.packet.command.scope;
  source = x.packet.source_url;
  sid = s.session_id;
  current = true;
  status = 'unknown';
  user = {
    userId: s.user_id,
    familyId: s.family_id,
    personId: s.person_id,
    user: { username: 'Synthetic stay', email: 'stay@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  };
  repo = new FamilyFrontendRepository(
    async () => user,
    undefined,
    () => ({ userId: user.userId, familyId: user.familyId, personId: user.personId, source })
  );
  await repo.session();
  native = (await repo.views()).ids.register('trip', s.trip_id);
  useTripStore.setState({ trip: { id: native, title: 'Synthetic stay' } as never });
  rpc.mockReset().mockImplementation(async (name) => {
    if (name === 'get_family_trip_stay_view_v1') return x.snapshot;
    if (name === 'get_family_stay_editor_v1') return x.editor;
    if (name === 'get_family_stay_command_context_v1') return { ...x.context, scope: { ...s, session_id: sid } };
    if (name === 'get_family_stay_history_v1') return x.history;
    if (name.includes('outcome') || name.includes('cancel_family'))
      return {
        version: 1,
        trip_id: s.trip_id,
        stay_id: x.packet.command.stay_id,
        operation_id: x.packet.command.operation_id,
        current_scope: { ...s, session_id: sid },
        original_session_id: s.session_id,
        status,
        acknowledgement: status === 'committed' ? x.ack : null,
        cancelled_at: status === 'cancelled' ? '2026-11-13T23:00:00Z' : null,
      };
    return x.ack;
  });
  api.defaults.adapter = createFamilyAxiosAdapter(handler());
  stop = installFamilyCommandRetention();
});
afterEach(async () => {
  stop();
  api.defaults.adapter = previous;
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
it('coalesces submits, keeps the original operation and publishes no native/cache row', async () => {
  const c = channel(),
    rows = useTripStore.getState();
  await Promise.all([c.submit(), c.submit()]);
  expect(rpc).toHaveBeenCalledOnce();
  expect(await retained()).toBeUndefined();
  expect(useTripStore.getState()).toBe(rows);
  expect(await offlineDb.accommodations.count()).toBe(0);
});
it('deep clones before any caller mutation', async () => {
  const c = channel();
  x.packet.command.changes.notes = 'Borrowed';
  await c.submit();
  expect(rpc.mock.calls[0][1]).toMatchObject({ p_changes: { notes: 'Adapter note' } });
});
it('retains offline and generic flush never dispatches a stay request', async () => {
  const c = channel();
  setForcedOffline(true);
  await expect(c.submit()).rejects.toBeDefined();
  const before = await retained();
  setForcedOffline(false);
  await mutationQueue.flush();
  expect(rpc).not.toHaveBeenCalled();
  expect(await retained()).toEqual(before);
  await c.submit();
  expect(await retained()).toBeUndefined();
});
it('recovers a lost reply only through a committed proof', async () => {
  rpc.mockRejectedValueOnce(new Error('Lost response'));
  const c = channel();
  await expect(c.submit()).rejects.toBeDefined();
  expect(await retained()).toBeDefined();
  status = 'committed';
  expect(await c.reconcile()).toBe('committed');
  expect(await retained()).toBeUndefined();
});
it('unknown outcomes retain exactly the original body', async () => {
  await retainStayIntent(captureWriteSession(), x.packet, native);
  const before = await retained();
  expect(await channel().reconcile()).toBe('unknown');
  expect(await retained()).toEqual(before);
});
it('a cold fresh login cannot submit the old scope but can confirm its committed outcome', async () => {
  await retainStayIntent(captureWriteSession(), x.packet, native);
  sid = crypto.randomUUID();
  const c = channel();
  await expect(c.submit()).rejects.toBeDefined();
  expect(rpc).not.toHaveBeenCalled();
  status = 'committed';
  expect(await c.reconcile()).toBe('committed');
  expect(rpc.mock.calls[0][1]).toMatchObject({ p_scope: x.packet.command.scope });
});
it('an authorized terminal cancellation clears only the exact retained original', async () => {
  await retainStayIntent(captureWriteSession(), x.packet, native);
  sid = crypto.randomUUID();
  status = 'cancelled';
  expect(await channel().reconcile(true)).toBe('cancelled');
  expect(rpc.mock.calls[0][0]).toBe('cancel_family_stay_command_v1');
  expect(await retained()).toBeUndefined();
});
it.each(['source', 'trip', 'family', 'session', 'logout'] as const)(
  'refuses %s change across response and retains original',
  async (kind) => {
    rpc.mockImplementationOnce(async () => {
      if (kind === 'source') source += '/changed';
      if (kind === 'trip') useTripStore.setState({ trip: { id: native + 1 } as never });
      if (kind === 'family') user = { ...user, familyId: crypto.randomUUID() };
      if (kind === 'session') sid = crypto.randomUUID();
      if (kind === 'logout') {
        setAuthed(false);
        invalidateOfflineSession();
      }
      return x.ack;
    });
    await expect(channel().submit()).rejects.toBeDefined();
    expect(await offlineDb.accommodations.count()).toBe(0);
  }
);
it('preserves refusal and never turns missing outcome APIs into unknown success', async () => {
  await retainStayIntent(captureWriteSession(), x.packet, native);
  const before = await retained();
  rpc.mockRejectedValue({ code: 'PGRST202' });
  await expect(channel().reconcile()).rejects.toMatchObject({ status: 503 });
  expect(await retained()).toEqual(before);
});
it('never clears changed/future queue metadata or recovery holds', async () => {
  await retainStayIntent(captureWriteSession(), x.packet, native);
  await offlineDb.mutationQueue.update(x.packet.command.operation_id, { recoveryHold: { released: false } as never });
  status = 'committed';
  await expect(channel().reconcile()).rejects.toBeDefined();
  expect(await retained()).toHaveProperty('recoveryHold');
});
it('retains a row changed during the response instead of acknowledging it', async () => {
  rpc.mockImplementationOnce(async () => {
    await offlineDb.mutationQueue.update(x.packet.command.operation_id, { lastError: 'Another owner' });
    return x.ack;
  });
  await expect(channel().submit()).rejects.toBeDefined();
  expect(await retained()).toHaveProperty('lastError', 'Another owner');
});
it('refuses competing Trip intents and altered original bodies', async () => {
  await retainStayIntent(captureWriteSession(), x.packet, native);
  const other = structuredClone(x.packet);
  other.command.operation_id = crypto.randomUUID();
  await expect(retainStayIntent(captureWriteSession(), other, native)).rejects.toBeDefined();
  x.packet.command.changes.notes = 'Changed';
  await expect(acknowledgeStayIntent(captureWriteSession(), x.packet, native)).rejects.toBeDefined();
  expect(await retained()).toBeDefined();
});
it('distinct native namespaces cannot alias a stay, place or booking', async () => {
  const ids = (await repo.views()).ids,
    uuid = x.packet.command.stay_id,
    keys = ['stay', 'place', 'reservation'].map((k) => ids.register(k as 'stay' | 'place' | 'reservation', uuid));
  expect(new Set(keys).size).toBe(3);
  expect(() => ids.uuid('stay', keys[1])).toThrow();
});
it('real handler supports only strict versioned list/editor/context/history routes', async () => {
  const base = `/trips/${native}/family/stays`,
    stay = (await repo.views()).ids.register('stay', x.packet.command.stay_id);
  for (const path of [base, `${base}/${stay}`, `${base}/${stay}/context`, `${base}/${stay}/history`])
    expect((await api.get(path)).status).toBe(200);
  expect(rpc.mock.calls.map((r) => r[0])).toEqual([
    'get_family_trip_stay_view_v1',
    'get_family_stay_editor_v1',
    'get_family_stay_command_context_v1',
    'get_family_stay_history_v1',
  ]);
  expect(
    await handler()({
      method: 'GET',
      pathname: `/trips/${native}/accommodations`,
      query: new URLSearchParams(),
      body: null,
    })
  ).toBe(NOT_HANDLED);
});
it.each(['?unknown=1', '?limit=2&limit=3', '?before=0', '?limit=101'])(
  'rejects invalid history query %s',
  async (query) => {
    await expect(
      api.get(`/trips/${native}/family/stays/${x.packet.command.stay_id}/history${query}`)
    ).rejects.toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  }
);
it('rejects missing original retry header, wrong method and cross-scope bodies', async () => {
  const path = stayIntentUrl(x.packet);
  await expect(api.post(path, x.packet)).rejects.toBeDefined();
  await expect(api.put(path, x.packet)).rejects.toBeDefined();
  x.packet.command.scope.family_id = crypto.randomUUID();
  await expect(
    api.post(path, x.packet, { headers: { 'X-Idempotency-Key': x.packet.command.operation_id } })
  ).rejects.toBeDefined();
  expect(rpc).not.toHaveBeenCalled();
});
