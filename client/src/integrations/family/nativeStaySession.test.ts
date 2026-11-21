import type { NativeStayRpc } from '@family/backend/supabase/nativeStayRpc';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { nativeStayFixture, nativeStayIntentFixture } from '../../../tests/helpers/familyNativeStays';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { captureWriteSession } from '../../sync/writeSession';
import { NativeStayCommandSession } from './nativeStayCommandSession';
import { nativeStayIntentUrl, retainNativeStayIntent } from './nativeStayIntentQueue';
import type { NativeStayView } from './nativeStayReadContract';
import { createNativeStayTransport } from './nativeStayTransport';
import { createPlannerNativeStayRecovery } from './plannerNativeStayRecovery';
import type { PlannerReadGuard } from './plannerReadGuard';
import { FamilyFrontendRepository, type FamilySession } from './repository';
const rpc = vi.fn<NativeStayRpc>(),
  read = vi.fn<(trip: number | string) => Promise<unknown>>(),
  refresh = vi.fn<(v: NativeStayView, g: PlannerReadGuard) => Promise<void>>();
let x: ReturnType<typeof nativeStayIntentFixture>,
  view: NativeStayView,
  repo: FamilyFrontendRepository,
  source: string,
  sid: string,
  native: number,
  current: boolean,
  user: FamilySession,
  status: 'unknown' | 'committed' | 'cancelled',
  stop: () => void;
const auth = async () => ({ user_id: user.userId, session_id: sid });
const row = () => offlineDb.mutationQueue.get(x.packet.command.operation_id);
const channel = (confirm: true | false = true) =>
  new NativeStayCommandSession(
    repo,
    { source: () => source, disposed: () => !current, ...(confirm ? { confirmCurrent: refresh } : {}) },
    x.packet,
    { transport: createNativeStayTransport(rpc), auth, readCurrent: read }
  );
const recovery = () =>
  createPlannerNativeStayRecovery(
    repo,
    x.packet.command.scope.trip_id,
    { source: () => source, current: () => current, confirmCurrent: refresh },
    { transport: createNativeStayTransport(rpc), auth, readCurrent: read }
  );
const executions = () => rpc.mock.calls.filter(([name]) => name === 'execute_family_native_stay_v1');
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  installTestLocks();
  _resetNetworkMode();
  setAuthed(true);
  x = nativeStayIntentFixture();
  view = nativeStayFixture();
  view.core.planner.state.visits[0].id = x.packet.command.arrival_visit_id;
  const s = x.packet.command.scope;
  source = x.packet.source_url;
  sid = s.session_id;
  current = true;
  status = 'unknown';
  user = {
    userId: s.user_id,
    familyId: s.family_id,
    personId: s.person_id,
    user: { username: 'Synthetic', email: 'queue@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  };
  repo = new FamilyFrontendRepository(
    async () => user,
    undefined,
    () => ({ userId: user.userId, familyId: user.familyId, personId: user.personId, source })
  );
  await repo.session();
  native = (await repo.views()).ids.register('trip', s.trip_id);
  useTripStore.setState({ trip: { id: native } as never });
  rpc.mockReset().mockImplementation(async (name) => {
    if (name === 'execute_family_native_stay_v1') {
      status = 'committed';
      return x.ack;
    }
    if (name === 'cancel_family_native_stay_v1' && status !== 'committed') status = 'cancelled';
    return {
      format: 'family.native-stay-outcome.v1',
      trip_id: s.trip_id,
      stay_id: x.packet.command.stay_id,
      operation_id: x.packet.command.operation_id,
      current_scope: { ...s, session_id: sid },
      original_session_id: s.session_id,
      status,
      acknowledgement: status === 'committed' ? x.ack : null,
      cancelled_at: status === 'cancelled' ? '2026-11-14T12:01:00Z' : null,
    };
  });
  read.mockReset().mockResolvedValue(view);
  refresh.mockReset().mockImplementation(async (_v, g) => g.check());
  stop = installFamilyCommandRetention();
});
afterEach(async () => {
  stop();
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
it('coalesces double submit and keeps the whole native intent until complete refresh succeeds', async () => {
  refresh.mockImplementationOnce(async (v, g) => {
    expect(await row()).toBeDefined();
    expect(v).toEqual(view);
    await g.check();
  });
  const c = channel(),
    before = useTripStore.getState(),
    [a, b] = await Promise.all([c.submit(), c.submit()]);
  expect(a).toEqual({ status: 'committed', current: view });
  expect(a).toBe(b);
  expect(executions()).toHaveLength(1);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(await row()).toBeUndefined();
  expect(useTripStore.getState()).toBe(before);
});
it('holds a confirmed operation when the complete refresh callback is missing', async () => {
  await expect(channel(false).submit()).rejects.toMatchObject({ code: 'native_stay_refresh_required' });
  expect(await row()).toBeDefined();
  expect(executions()).toHaveLength(1);
});
it('retains exact offline IDs/body through close-open, then generic flush never sends them', async () => {
  setForcedOffline(true);
  await expect(channel().submit()).rejects.toMatchObject({ status: 503 });
  const before = await row();
  expect(before?.url).toBe(nativeStayIntentUrl(x.packet));
  expect(before?.body).toEqual(x.packet);
  offlineDb.close();
  await offlineDb.open();
  setForcedOffline(false);
  await mutationQueue.flush();
  expect(rpc).not.toHaveBeenCalled();
  expect(await row()).toEqual(before);
  await channel().submit();
  expect(executions()).toHaveLength(1);
});
it('clones caller-owned commands before any offline or remote work', async () => {
  const c = channel(),
    old = structuredClone(x.packet.command);
  if ('format' in x.packet.command.inner) x.packet.command.inner.reservation.title = 'Changed';
  await c.submit();
  expect(executions()[0][1]).toEqual({ p_command: old });
});
it('lost committed reply is inspected without issuing another outer or inner execute', async () => {
  const base = rpc.getMockImplementation();
  rpc.mockImplementation(async (name, args) => {
    if (name === 'execute_family_native_stay_v1') {
      status = 'committed';
      throw Error('Lost reply after commit');
    }
    return base?.(name, args);
  });
  const c = channel();
  await expect(c.submit()).rejects.toThrow('Lost reply');
  expect(await row()).toBeDefined();
  await c.reconcile();
  expect(executions()).toHaveLength(1);
  expect(await row()).toBeUndefined();
});
it('a failed confirming core read retains the original and retries only reads', async () => {
  read.mockRejectedValueOnce(Error('Read unavailable'));
  const c = channel();
  await expect(c.submit()).rejects.toThrow('Read unavailable');
  const before = await row();
  const calls = rpc.mock.calls.length;
  await c.submit();
  expect(rpc.mock.calls).toHaveLength(calls);
  expect(before).toBeDefined();
  expect(await row()).toBeUndefined();
});
it('failed ancillary refresh remains a durable obligation after reopen, without another execute', async () => {
  refresh.mockRejectedValueOnce(Error('Packing unavailable'));
  await expect(channel().submit()).rejects.toThrow('Packing unavailable');
  expect(await row()).toBeDefined();
  offlineDb.close();
  await offlineDb.open();
  await channel().reconcile();
  expect(executions()).toHaveLength(1);
  expect(await row()).toBeUndefined();
});
it('cold recovery requires no already loaded Trip and inspects before retrying original bytes', async () => {
  await retainNativeStayIntent(captureWriteSession(), x.packet, native);
  useTripStore.setState({ trip: null });
  const item = await recovery().inspect();
  expect(item?.domain).toBe('stay');
  expect(await item?.check()).toBe('unknown');
  expect(executions()).toHaveLength(0);
  expect(await item?.retry()).toBe('committed');
  expect(executions()[0][1]).toEqual({ p_command: x.packet.command });
  expect(await row()).toBeUndefined();
  expect(useTripStore.getState().trip).toBeNull();
});
it('a fresh same-actor cold login may cancel, never rebind or send old work', async () => {
  await retainNativeStayIntent(captureWriteSession(), x.packet, native);
  sid = crypto.randomUUID();
  useTripStore.setState({ trip: null });
  const item = await recovery().inspect();
  expect(item?.intent).toBe('cancel-command');
  expect(await item?.check()).toBe('unknown');
  expect(await item?.retry()).toBe('cancelled');
  expect(executions()).toHaveLength(0);
  expect(await row()).toBeUndefined();
});
it('cold committed recovery performs the complete refresh before acknowledging', async () => {
  await retainNativeStayIntent(captureWriteSession(), x.packet, native);
  status = 'committed';
  sid = crypto.randomUUID();
  useTripStore.setState({ trip: null });
  const item = await recovery().inspect();
  expect(await item?.check()).toBe('committed');
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(executions()).toHaveLength(0);
});
it.each(['source', 'family', 'person', 'trip', 'session', 'logout', 'layer', 'registry'] as const)(
  'retires %s-switched execute responses without clearing work',
  async (kind) => {
    const base = rpc.getMockImplementation();
    rpc.mockImplementation(async (name, args) => {
      if (name === 'execute_family_native_stay_v1') {
        if (kind === 'source') source += '/changed';
        if (kind === 'family') user.familyId = crypto.randomUUID();
        if (kind === 'person') user.personId = crypto.randomUUID();
        if (kind === 'trip') useTripStore.setState({ trip: { id: native + 1 } as never });
        if (kind === 'session') sid = crypto.randomUUID();
        if (kind === 'logout') {
          setAuthed(false);
          invalidateOfflineSession();
        }
        if (kind === 'layer') repo.setLayer(x.packet.command.scope.trip_id, 'myDraft');
        if (kind === 'registry') vi.spyOn(repo, 'knownViews').mockReturnValue({ ids: {} } as never);
      }
      return base?.(name, args);
    });
    await expect(channel().submit()).rejects.toBeDefined();
    expect(await offlineDb.mutationQueue.get(x.packet.command.operation_id)).toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
  }
);
it.each(['lastError', 'undefined', 'hold'] as const)('holds changed %s metadata across a reply', async (kind) => {
  const base = rpc.getMockImplementation();
  rpc.mockImplementation(async (name, args) => {
    if (name === 'execute_family_native_stay_v1') {
      const r = await row();
      if (!r) throw Error();
      await offlineDb.mutationQueue.put(
        kind === 'lastError'
          ? { ...r, lastError: 'Another owner' }
          : kind === 'undefined'
            ? { ...r, retryAfter: undefined }
            : ({ ...r, recoveryHold: { released: false } } as never)
      );
    }
    return base?.(name, args);
  });
  await expect(channel().submit()).rejects.toBeDefined();
  expect(await row()).toBeDefined();
  expect(refresh).not.toHaveBeenCalled();
});
it('never resurrects an intent removed while a response was uncertain', async () => {
  const base = rpc.getMockImplementation();
  rpc.mockImplementation(async (name, args) => {
    if (name === 'execute_family_native_stay_v1') await offlineDb.mutationQueue.delete(x.packet.command.operation_id);
    return base?.(name, args);
  });
  const c = channel();
  await expect(c.submit()).rejects.toBeDefined();
  await expect(c.submit()).rejects.toBeDefined();
  expect(executions()).toHaveLength(1);
  expect(await row()).toBeUndefined();
});
it('pins inspected cold metadata through a later user retry', async () => {
  await retainNativeStayIntent(captureWriteSession(), x.packet, native);
  useTripStore.setState({ trip: null });
  const item = await recovery().inspect();
  await offlineDb.mutationQueue.update(x.packet.command.operation_id, { lastError: 'Changed after inspector opened' });
  await expect(item?.retry()).rejects.toBeDefined();
  expect(await row()).toBeDefined();
  expect(executions()).toHaveLength(0);
});
it('generic flush does not release stale syncing ownership', async () => {
  await retainNativeStayIntent(captureWriteSession(), x.packet, native);
  await offlineDb.mutationQueue.update(x.packet.command.operation_id, {
    status: 'syncing',
    syncingSince: Date.now() - 120000,
  });
  const before = await row();
  await mutationQueue.flush();
  expect(await row()).toEqual(before);
  expect(await recovery().inspect()).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
});
it.each(['corrupt', 'unknown_metadata', 'foreign_source', 'second_entry'] as const)(
  'does not adopt %s cold work',
  async (kind) => {
    await retainNativeStayIntent(captureWriteSession(), x.packet, native);
    const r = await row();
    if (!r) throw Error();
    if (kind === 'corrupt') await offlineDb.mutationQueue.put({ ...r, body: {} });
    if (kind === 'unknown_metadata') await offlineDb.mutationQueue.put({ ...r, extra: true } as never);
    if (kind === 'foreign_source') source += '/other';
    if (kind === 'second_entry') await offlineDb.mutationQueue.put({ ...r, id: crypto.randomUUID() });
    const before = await offlineDb.mutationQueue.toArray();
    try {
      expect(await recovery().inspect()).toBeNull();
    } catch {
      expect(kind).toBe('foreign_source');
    }
    expect(await offlineDb.mutationQueue.toArray()).toEqual(before);
    expect(rpc).not.toHaveBeenCalled();
  }
);
it('does not mix cancellation and an in-flight refresh', async () => {
  let release = () => {};
  const wait = new Promise<void>((r) => (release = r));
  refresh.mockImplementationOnce(async () => wait);
  const c = channel(),
    pending = c.submit();
  await expect(c.reconcile(true)).rejects.toBeDefined();
  release();
  await pending;
});
it('a second caller cannot settle metadata owned by the first inspector', async () => {
  await retainNativeStayIntent(captureWriteSession(), x.packet, native);
  useTripStore.setState({ trip: null });
  const a = await recovery().inspect(),
    b = await recovery().inspect();
  expect(await a?.retry()).toBe('committed');
  await expect(b?.retry()).rejects.toBeDefined();
  expect(executions()).toHaveLength(1);
});
it('a newer read wins over the original receipt without replaying', async () => {
  const next = structuredClone(view);
  next.core.trip_revision += 3;
  next.core.planner.state.trip_revision = next.core.trip_revision;
  next.core.stays[0].stay.notes = 'Newer edit';
  read.mockResolvedValue(next);
  const result = await channel().submit();
  if (result.status !== 'committed') throw Error();
  expect(result.current.core.stays[0].stay.notes).toBe('Newer edit');
});
it('retains a known commit if refresh mutates original metadata', async () => {
  refresh.mockImplementationOnce(async () => {
    await offlineDb.mutationQueue.update(x.packet.command.operation_id, { lastError: 'Changed during refresh' });
  });
  await expect(channel().submit()).rejects.toBeDefined();
  expect(await row()).toBeDefined();
  expect(executions()).toHaveLength(1);
});

it('two simultaneous cold inspectors can execute and acknowledge the original at most once', async () => {
  await retainNativeStayIntent(captureWriteSession(), x.packet, native);
  useTripStore.setState({ trip: null });
  const a = await recovery().inspect(),
    b = await recovery().inspect();
  if (!a || !b) throw Error();
  const results = await Promise.allSettled([a.retry(), b.retry()]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(executions()).toHaveLength(1);
  expect(await row()).toBeUndefined();
});

async function preparedCold(publish: () => void = () => useTripStore.setState({ trip: { id: native } as never })) {
  await retainNativeStayIntent(captureWriteSession(), x.packet, native);
  const expected = await row();
  useTripStore.getState().resetTrip();
  status = 'committed';
  const complete = vi.fn(),
    discard = vi.fn(async () => {}),
    prepare = vi.fn(async (_view: NativeStayView, guard: PlannerReadGuard) => {
      expect(await row()).toEqual(expected);
      await guard.check();
      return { publish, complete, discard };
    });
  const session = new NativeStayCommandSession(
    repo,
    { source: () => source, disposed: () => !current, prepareCurrent: prepare },
    x.packet,
    { transport: createNativeStayTransport(rpc), auth, readCurrent: read, expected, cold: true }
  );
  return { session, prepare, complete, discard, expected };
}
it('prepared cold completion publishes under the original guard, acknowledges, then retires the failure', async () => {
  const p = await preparedCold();
  expect((await p.session.reconcile()).status).toBe('committed');
  expect(useTripStore.getState().trip?.id).toBe(native);
  expect(await row()).toBeUndefined();
  expect(p.complete).toHaveBeenCalledTimes(1);
  expect(p.discard).not.toHaveBeenCalled();
  await expect(p.prepare.mock.calls[0][1].check()).rejects.toBeDefined();
  expect(executions()).toHaveLength(0);
});
it('an asynchronous prepared publisher is refused and the original is never acknowledged', async () => {
  const invalid: unknown = async () => {}; // Deliberately malformed callback arriving from untyped code.
  const p = await preparedCold(invalid as () => void);
  await expect(p.session.reconcile()).rejects.toMatchObject({ code: 'native_stay_session_changed' });
  expect(await row()).toEqual(p.expected);
  expect(p.discard).toHaveBeenCalledTimes(1);
  expect(p.complete).not.toHaveBeenCalled();
});
it('prepared publication cannot adopt a different Trip as the recovered selection', async () => {
  const p = await preparedCold(() => useTripStore.setState({ trip: { id: 999999 } as never }));
  await expect(p.session.reconcile()).rejects.toMatchObject({ code: 'native_stay_session_changed' });
  expect(await row()).toEqual(p.expected);
  expect(p.discard).toHaveBeenCalledTimes(1);
  expect(p.complete).not.toHaveBeenCalled();
});
it('a publisher failure discards its prepared generation and preserves the full original', async () => {
  const p = await preparedCold(() => {
    throw Error('Publication failed');
  });
  await expect(p.session.reconcile()).rejects.toThrow('Publication failed');
  expect(await row()).toEqual(p.expected);
  expect(p.discard).toHaveBeenCalledTimes(1);
  expect(p.complete).not.toHaveBeenCalled();
});
it('a session change after preparation prevents publication and retires the prepared result', async () => {
  const publish = vi.fn(),
    p = await preparedCold(publish),
    base = p.prepare.getMockImplementation();
  p.prepare.mockImplementationOnce(async (v, g) => {
    if (!base) throw Error('Missing preparation');
    const prepared = await base(v, g);
    current = false;
    return prepared;
  });
  await expect(p.session.reconcile()).rejects.toMatchObject({ code: 'native_stay_session_changed' });
  expect(await row()).toEqual(p.expected);
  expect(publish).not.toHaveBeenCalled();
  expect(p.discard).toHaveBeenCalledTimes(1);
});
it('a local queue change after preparation prevents publication and exact acknowledgement', async () => {
  const publish = vi.fn(),
    p = await preparedCold(publish),
    base = p.prepare.getMockImplementation();
  p.prepare.mockImplementationOnce(async (v, g) => {
    if (!base) throw Error('Missing preparation');
    const prepared = await base(v, g);
    const r = await row();
    if (!r) throw Error();
    await offlineDb.mutationQueue.put({ ...r, retryAfter: undefined });
    return prepared;
  });
  await expect(p.session.reconcile()).rejects.toMatchObject({ code: 'native_stay_session_changed' });
  expect(await row()).toBeDefined();
  expect(publish).not.toHaveBeenCalled();
  expect(p.discard).toHaveBeenCalledTimes(1);
});
it('an already selected different Trip cannot borrow the cold publication handoff', async () => {
  const p = await preparedCold();
  useTripStore.setState({ trip: { id: 999999 } as never });
  const session = new NativeStayCommandSession(
    repo,
    { source: () => source, disposed: () => false, prepareCurrent: p.prepare },
    x.packet,
    { transport: createNativeStayTransport(rpc), auth, readCurrent: read, expected: p.expected, cold: true }
  );
  await expect(session.reconcile()).rejects.toMatchObject({ code: 'native_stay_session_changed' });
  expect(p.prepare).not.toHaveBeenCalled();
  expect(await row()).toEqual(p.expected);
});
it('a preparation error preserves the command before any native publication or acknowledgement', async () => {
  const p = await preparedCold();
  p.prepare.mockRejectedValueOnce(Error('Ancillary preparation failed'));
  await expect(p.session.reconcile()).rejects.toThrow('Ancillary preparation failed');
  expect(await row()).toEqual(p.expected);
  expect(useTripStore.getState().trip).toBeNull();
  expect(p.complete).not.toHaveBeenCalled();
});
