import type { StayBundleRpc } from '@family/backend/supabase/stayBundleRpc';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { stayBundleFixture } from '../../../tests/helpers/familyStayBundles';
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
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { StayBundleCommandSession } from './stayBundleCommandSession';
import { retainStayBundleIntent, stayBundleIntentUrl } from './stayBundleIntentQueue';
import { createStayBundleTransport } from './stayBundleTransport';
const rpc = vi.fn<StayBundleRpc>(),
  read = vi.fn<(trip: number | string) => Promise<unknown>>();
let x: ReturnType<typeof stayBundleFixture>,
  repo: FamilyFrontendRepository,
  source: string,
  sid: string,
  native: number,
  current: boolean,
  user: FamilySession,
  status: 'unknown' | 'committed' | 'cancelled',
  stop: () => void;
const auth = async () => ({ user_id: user.userId, session_id: sid });
const retained = () => offlineDb.mutationQueue.get(x.packet.command.operation_id);
const channel = (beforeRetain?: () => Promise<void>) =>
  new StayBundleCommandSession(repo, { source: () => source, disposed: () => !current, beforeRetain }, x.packet, {
    transport: createStayBundleTransport(rpc),
    auth,
    readCurrent: read,
  });
const creates = () => rpc.mock.calls.filter(([name]) => name === 'create_family_stay_bundle_v1');
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  installTestLocks();
  _resetNetworkMode();
  setAuthed(true);
  x = stayBundleFixture();
  const s = x.packet.command.scope;
  source = x.packet.source_url;
  sid = s.session_id;
  current = true;
  status = 'unknown';
  user = {
    userId: s.user_id,
    familyId: s.family_id,
    personId: s.person_id,
    user: { username: 'Synthetic', email: 'bundle@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
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
    if (name === 'create_family_stay_bundle_v1') {
      status = 'committed';
      return x.ack;
    }
    if (name === 'cancel_family_stay_bundle_v1' && status !== 'committed') status = 'cancelled';
    return {
      format: 'family.stay-bundle-outcome.v1',
      trip_id: s.trip_id,
      stay_id: x.packet.command.stay_id,
      reservation_id: x.packet.command.reservation_id,
      operation_id: x.packet.command.operation_id,
      current_scope: { ...s, session_id: sid },
      original_session_id: s.session_id,
      status,
      acknowledgement: status === 'committed' ? x.ack : null,
      cancelled_at: status === 'cancelled' ? '2026-11-14T12:01:00Z' : null,
    };
  });
  read.mockReset().mockResolvedValue(x.core);
  stop = installFamilyCommandRetention();
});
afterEach(async () => {
  stop();
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
it('coalesces double submit into one original command then a fresh complete read, without native publication', async () => {
  const c = channel(),
    before = useTripStore.getState();
  const [a, b] = await Promise.all([c.submit(), c.submit()]);
  expect(a).toEqual({ status: 'committed', current: x.core });
  expect(a).toBe(b);
  expect(creates()).toHaveLength(1);
  expect(read).toHaveBeenCalledExactlyOnceWith(native);
  expect(await retained()).toBeUndefined();
  expect(useTripStore.getState()).toBe(before);
  expect(await offlineDb.accommodations.count()).toBe(0);
  expect(await offlineDb.reservations.count()).toBe(0);
});
it('deep clones before caller mutation and never reallocates either identity', async () => {
  const c = channel(),
    old = structuredClone(x.packet.command);
  x.packet.command.reservation.title = 'Borrowed mutation';
  await c.submit();
  expect(creates()[0][1]).toEqual({ p_command: old });
});
it('retains one whole offline intent; generic flush cannot dispatch it', async () => {
  const c = channel();
  setForcedOffline(true);
  await expect(c.submit()).rejects.toMatchObject({ status: 503 });
  const before = await retained();
  expect(before?.url).toBe(stayBundleIntentUrl(x.packet));
  expect(before?.body).toEqual(x.packet);
  setForcedOffline(false);
  await mutationQueue.flush();
  expect(rpc).not.toHaveBeenCalled();
  expect(await retained()).toEqual(before);
  await c.submit();
  expect(creates()).toHaveLength(1);
  expect(await retained()).toBeUndefined();
});
it('startup after IndexedDB close/open inspects the original queued body before retry', async () => {
  setForcedOffline(true);
  await expect(channel().submit()).rejects.toBeDefined();
  const before = await retained();
  offlineDb.close();
  await offlineDb.open();
  setForcedOffline(false);
  expect(await channel().reconcile()).toEqual({ status: 'unknown' });
  expect(creates()).toHaveLength(0);
  expect(await retained()).toEqual(before);
  await channel().submit();
  expect(creates()).toHaveLength(1);
  expect(creates()[0][1]).toEqual({ p_command: x.packet.command });
});
it('a genuinely ambiguous response retains intent and reconciles committed without another create', async () => {
  rpc.mockImplementationOnce(async () => ({ format: 'family.stay-bundle-outcome.v1', trip_id: user.familyId }));
  await expect(channel().submit()).rejects.toBeDefined();
  expect(creates()).toHaveLength(0);
  expect(await retained()).toBeDefined();
});
it('lost create reply is inspected, then refreshed; never composed from old create/link calls', async () => {
  const base = rpc.getMockImplementation();
  rpc.mockImplementation(async (name, args) => {
    if (name === 'create_family_stay_bundle_v1') {
      status = 'committed';
      throw new Error('Committed but lost reply');
    }
    return base?.(name, args);
  });
  const c = channel();
  await expect(c.submit()).rejects.toBeDefined();
  expect(await retained()).toBeDefined();
  await expect(c.reconcile()).resolves.toEqual({ status: 'committed', current: x.core });
  expect(creates()).toHaveLength(1);
  expect(await retained()).toBeUndefined();
});
it('confirmed read failure retains a read-refresh obligation and retries only the read', async () => {
  read.mockRejectedValueOnce(new Error('Current read unavailable'));
  const c = channel();
  await expect(c.submit()).rejects.toThrow('Current read');
  const before = await retained();
  expect(before).toBeDefined();
  const calls = rpc.mock.calls.length;
  await c.submit();
  expect(rpc.mock.calls).toHaveLength(calls);
  expect(read).toHaveBeenCalledTimes(2);
  expect(creates()).toHaveLength(1);
  expect(await retained()).toBeUndefined();
});
it('a cold recovery recognizes a committed creation after its confirming read failed', async () => {
  read.mockRejectedValueOnce(new Error('No read'));
  await expect(channel().submit()).rejects.toBeDefined();
  await expect(channel().reconcile()).resolves.toEqual({ status: 'committed', current: x.core });
  expect(creates()).toHaveLength(1);
});
it('finished sessions fetch current state again without recreating a queue row', async () => {
  const c = channel();
  await c.submit();
  await c.submit();
  expect(creates()).toHaveLength(1);
  expect(read).toHaveBeenCalledTimes(2);
  expect(await retained()).toBeUndefined();
});
it('fresh login cannot submit old scope but may inspect and terminally cancel it', async () => {
  await retainStayBundleIntent(captureWriteSession(), x.packet, native);
  sid = crypto.randomUUID();
  const c = channel();
  await expect(c.submit()).rejects.toBeDefined();
  expect(rpc).not.toHaveBeenCalled();
  expect(await c.reconcile()).toEqual({ status: 'unknown' });
  expect(await retained()).toBeDefined();
  expect(await c.reconcile(true)).toEqual({ status: 'cancelled' });
  expect(await retained()).toBeUndefined();
  expect(creates()).toHaveLength(0);
  expect(rpc.mock.calls[rpc.mock.calls.length - 1]?.[1]).toEqual({ p_command: x.packet.command });
});
it('fresh-login recovery of committed work returns a new read, not its acknowledgement', async () => {
  await retainStayBundleIntent(captureWriteSession(), x.packet, native);
  sid = crypto.randomUUID();
  status = 'committed';
  expect(await channel().reconcile()).toEqual({ status: 'committed', current: x.core });
  expect(creates()).toHaveLength(0);
});
it.each(['source', 'trip', 'family', 'person', 'session', 'logout', 'layer', 'registry'] as const)(
  'preserves original work on %s change during a response',
  async (kind) => {
    const base = rpc.getMockImplementation();
    rpc.mockImplementation(async (name, args) => {
      if (name === 'create_family_stay_bundle_v1') {
        if (kind === 'source') source += '/another';
        if (kind === 'trip') useTripStore.setState({ trip: { id: native + 1 } as never });
        if (kind === 'family') user = { ...user, familyId: crypto.randomUUID() };
        if (kind === 'person') user = { ...user, personId: crypto.randomUUID() };
        if (kind === 'session') sid = crypto.randomUUID();
        if (kind === 'logout') {
          setAuthed(false);
          invalidateOfflineSession();
        }
        if (kind === 'layer') repo.setLayer(x.packet.command.scope.trip_id, 'myDraft');
        if (kind === 'registry') vi.spyOn(repo, 'knownViews').mockReturnValue({ ids: {} } as never);
        return x.ack;
      }
      return base?.(name, args);
    });
    await expect(channel().submit()).rejects.toBeDefined();
    expect(await retained()).toBeDefined();
    expect(read).not.toHaveBeenCalled();
  }
);
it.each(['row', 'hold', 'undefined'] as const)('never clears changed %s metadata across a reply', async (kind) => {
  const base = rpc.getMockImplementation();
  rpc.mockImplementation(async (name, args) => {
    if (name === 'create_family_stay_bundle_v1') {
      const row = await retained();
      if (!row) throw Error('Missing original intent');
      await offlineDb.mutationQueue.put(
        kind === 'row'
          ? { ...row, lastError: 'Another owner' }
          : kind === 'undefined'
            ? { ...row, retryAfter: undefined }
            : ({ ...row, recoveryHold: { released: false } } as never)
      );
      return x.ack;
    }
    return base?.(name, args);
  });
  await expect(channel().submit()).rejects.toBeDefined();
  expect(await retained()).toBeDefined();
  expect(read).not.toHaveBeenCalled();
});
it('does not resurrect a row removed during an uncertain operation', async () => {
  const base = rpc.getMockImplementation();
  rpc.mockImplementation(async (name, args) => {
    if (name === 'create_family_stay_bundle_v1') {
      await offlineDb.mutationQueue.delete(x.packet.command.operation_id);
      return x.ack;
    }
    return base?.(name, args);
  });
  const c = channel();
  await expect(c.submit()).rejects.toBeDefined();
  await expect(c.submit()).rejects.toBeDefined();
  expect(creates()).toHaveLength(1);
  expect(await retained()).toBeUndefined();
});
it('refuses competing Trip work before creating another operation', async () => {
  await retainStayBundleIntent(captureWriteSession(), x.packet, native);
  const old = structuredClone(x.packet);
  x.packet.command.operation_id = crypto.randomUUID();
  await expect(channel().submit()).rejects.toBeDefined();
  expect(rpc).not.toHaveBeenCalled();
  expect((await offlineDb.mutationQueue.toArray())[0].body).toEqual(old);
});
it('rejects syncing ownership and leaves old syncing metadata unchanged during generic flush', async () => {
  await retainStayBundleIntent(captureWriteSession(), x.packet, native);
  await offlineDb.mutationQueue.update(x.packet.command.operation_id, {
    status: 'syncing',
    syncingSince: Date.now() - 120000,
  });
  const before = await retained();
  await mutationQueue.flush();
  expect(await retained()).toEqual(before);
  await expect(channel().reconcile()).rejects.toBeDefined();
  expect(rpc).not.toHaveBeenCalled();
});
it('known authorization/conflict refusals remain retained and can retry the same body after repair', async () => {
  const base = rpc.getMockImplementation();
  let denied = true;
  rpc.mockImplementation(async (name, args) => {
    if (name === 'create_family_stay_bundle_v1' && denied) throw { code: '42501' };
    return base?.(name, args);
  });
  const c = channel();
  await expect(c.submit()).rejects.toMatchObject({ status: 403 });
  expect((await retained())?.status).toBe('failed');
  denied = false;
  await c.submit();
  expect(creates()).toHaveLength(2);
  expect(creates()[0][1]).toEqual(creates()[1][1]);
});
it('missing outcome APIs are not unknown success and never permit a send', async () => {
  rpc.mockRejectedValue({ code: 'PGRST202' });
  await expect(channel().submit()).rejects.toMatchObject({ status: 503 });
  expect(creates()).toHaveLength(0);
  expect(await retained()).toBeDefined();
});
it('a malformed or stale confirming read retains the original work', async () => {
  const old = structuredClone(x.core);
  old.trip_revision = x.ack.trip_revision_after - 1;
  old.planner.state.trip_revision = old.trip_revision;
  read.mockResolvedValueOnce(old);
  await expect(channel().submit()).rejects.toBeDefined();
  expect(await retained()).toBeDefined();
});
it('a newer server edit wins over the old creation receipt', async () => {
  const next = structuredClone(x.core);
  next.trip_revision += 3;
  next.planner.state.trip_revision = next.trip_revision;
  next.stays[0].stay.notes = 'Newer server note';
  read.mockResolvedValue(next);
  const r = await channel().submit();
  expect(r.status).toBe('committed');
  if (r.status === 'committed') expect(r.current.stays[0].stay.notes).toBe('Newer server note');
});
it('local state or queue changes during the confirming read cannot be overwritten', async () => {
  read.mockImplementationOnce(async () => {
    useTripStore.setState({ error: 'Newer local state' });
    return x.core;
  });
  await expect(channel().submit()).rejects.toBeDefined();
  expect(useTripStore.getState().error).toBe('Newer local state');
  expect(await retained()).toBeDefined();
});
it.each(['canonical', 'numeric'] as const)(
  'preserves both queue entries when a %s Trip edit arrives during the confirming read',
  async (identity) => {
    const selector = identity === 'canonical' ? x.packet.command.scope.trip_id : native;
    const edit = {
      id: 'late-trip-edit',
      tripId: native + 1,
      url: `/trips/${selector}`,
      method: 'PUT' as const,
      body: { title: 'Local edit' },
      status: 'pending' as const,
      attempts: 0,
      lastError: null,
      createdAt: 42,
    };
    read.mockImplementationOnce(async () => {
      expect(await retained()).toBeDefined();
      await offlineDb.mutationQueue.add(edit);
      return x.core;
    });

    const result = await channel()
      .submit()
      .catch((error: unknown) => error);

    expect(await retained()).toBeDefined();
    expect(await offlineDb.mutationQueue.get(edit.id)).toEqual(edit);
    expect(result).toMatchObject({ code: 'stay_bundle_session_changed' });
    expect(creates()).toHaveLength(1);
  }
);
it('a final source/session change during the confirming read preserves the intent', async () => {
  read.mockImplementationOnce(async () => {
    sid = crypto.randomUUID();
    return x.core;
  });
  await expect(channel().submit()).rejects.toBeDefined();
  expect(await retained()).toBeDefined();
});
it('cannot mix inspection/cancellation with a pending submit or bypass a closed view', async () => {
  let release = () => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const c = channel(async () => wait),
    pending = c.submit();
  await expect(c.reconcile(true)).rejects.toBeDefined();
  release();
  await pending;
  current = false;
  await expect(c.reconcile()).rejects.toBeDefined();
});
