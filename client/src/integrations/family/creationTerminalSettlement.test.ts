// organize-imports-ignore
// sort-imports-ignore
import '../../../tests/helpers/familyPlannerCohort/state';
import { describe, expect, it, vi } from 'vitest';
import { beginNew, newData } from '../../../tests/helpers/familyPlannerCohort/formActions';
import { required } from '../../../tests/helpers/familyPlannerCohort/core';
import '../../../tests/helpers/familyPlannerCohort/setup';
import { cohortState, db, trip, creationReceipts, uuid } from '../../../tests/helpers/familyPlannerCohort/state';
import { offlineDb, invalidateOfflineSession, type QueuedMutation } from '../../db/offlineDb';
import { CREATION_TERMINAL_ARCHIVE_KEY as KEY, creationTerminalArchiveCount } from '../../db/creationTerminalArchive';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { dependencyIdentity, packingDependencyHash } from './packingBagDependencyContract';
import { CreationTerminalSettlement } from './creationTerminalSettlement';
import { createCreationTerminalTransport } from './creationTerminalTransport';
import { assertCreationOriginal, retainCreationIntent } from './creationIntentQueue';
import { captureWriteSession } from '../../sync/writeSession';
import type { CreationPacket } from './plannerCreationContract';
const rows = () => offlineDb.mutationQueue.toArray();
type Journal = { entries: Array<{ state: string; row: QueuedMutation; request_sha256: string; proof: unknown }> };
const journal = async () => (await offlineDb.syncMeta.get(KEY))?.familyCreationTerminalArchive as Journal | undefined;
async function pending(committed = false) {
  const context = await beginNew(),
    original = required(db.rpc.getMockImplementation());
  if (committed) cohortState.loseAck = true;
  else
    db.rpc.mockImplementation((name: string, args: Record<string, unknown>) =>
      name === 'create_family_native_plan_v1'
        ? Promise.resolve({ data: null, error: { code: '08006' } })
        : original(name, args)
    );
  let failure: unknown;
  try {
    await cohortState.cohort.creation.createForm(context, newData({ lat: 19.043798, lng: -98.198151 }));
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeDefined();
  if (!(await rows()).length) throw new Error('Producer failed before retaining: ' + String(failure));
  return required((await rows())[0]);
}
function service(row: QueuedMutation, committed = false) {
  const p = row.body as CreationPacket;
  let status: 'unknown' | 'cancelled' | 'committed' = committed ? 'committed' : 'unknown';
  const reply = () => ({
    version: 2,
    trip_id: trip,
    operation_id: row.id,
    scope: p.scope,
    form: p.form,
    request_sha256: 'a'.repeat(64),
    status,
    cancelled_at: status === 'cancelled' ? '2026-11-16T12:00:00Z' : null,
    result: status === 'committed' ? required(creationReceipts.get(row.id)).result : null,
  });
  const rpc = vi.fn(async (name: string) => {
    if (name === 'cancel_family_native_plan_v1') status = 'cancelled';
    return reply();
  });
  return {
    rpc,
    reply,
    set: (s: typeof status) => {
      status = s;
    },
    transport: createCreationTerminalTransport(rpc),
  };
}
const engine = (s: ReturnType<typeof service>, current = () => true) =>
  new CreationTerminalSettlement(cohortState.repo, trip, { source: () => cohortState.source, current }, s.transport);
describe('durable native creation cancellation and atomic preservation foundation', () => {
  it('preparing and checking unknown work never arms or writes cancellation', async () => {
    const row = await pending(),
      s = service(row),
      d = await engine(s).prepare(row);
    expect(await journal()).toBeUndefined();
    expect(await d.check()).toBe('unknown');
    expect(await journal()).toBeUndefined();
    expect(await rows()).toEqual([row]);
    expect(s.rpc.mock.calls.map((c) => c[0])).toEqual(['get_family_native_plan_receipt_v2']);
  });
  it('durably arms before cancellation, then atomically preserves the exact row/proof and removes only that row', async () => {
    const row = await pending(),
      s = service(row);
    s.rpc.mockImplementation(async (name) => {
      if (name === 'cancel_family_native_plan_v1') {
        const a = required(await journal());
        expect(a.entries).toHaveLength(1);
        expect(a.entries[0].row).toEqual(row);
        expect(a.entries[0].state).toBe('pending');
        expect(a.entries[0].request_sha256).toBe('a'.repeat(64));
        expect(await rows()).toEqual([row]);
        s.set('cancelled');
      }
      return s.reply();
    });
    const d = await engine(s).prepare(row);
    expect(await d.cancel()).toBe('cancelled');
    expect(await rows()).toEqual([]);
    const a = required(await journal());
    expect(a.entries[0].row).toEqual(row);
    expect(a.entries[0].state).toBe('cancelled');
    expect(creationTerminalArchiveCount(await offlineDb.syncMeta.get(KEY), [])).toBe(1);
    expect(await d.cancel()).toBe('cancelled');
    expect(s.rpc.mock.calls.filter((c) => c[0] === 'cancel_family_native_plan_v1')).toHaveLength(1);
  });
  it('lost cancellation reply recovers under a fresh owner by read-only proof; it never retries creation', async () => {
    const row = await pending(),
      s = service(row);
    s.rpc
      .mockImplementationOnce(async () => s.reply())
      .mockImplementationOnce(async () => {
        s.set('cancelled');
        throw new Error('Lost reply');
      });
    await expect((await engine(s).prepare(row)).cancel()).rejects.toThrow();
    expect(await rows()).toEqual([row]);
    expect(required(await journal()).entries[0].state).toBe('pending');
    expect(await (await engine(s).prepare(row)).check()).toBe('cancelled');
    expect(await rows()).toEqual([]);
    expect(required(await journal()).entries[0].row).toEqual(row);
    expect(s.rpc.mock.calls.every((c) => !c[0].startsWith('create_'))).toBe(true);
  });
  it('committed creation is acknowledged and archived without cancellation or deleting its saved location', async () => {
    const row = await pending(true),
      s = service(row, true);
    expect(await (await engine(s).prepare(row)).cancel()).toBe('committed');
    expect(cohortState.creationRows).toHaveLength(1);
    expect(await rows()).toEqual([]);
    expect(required(await journal()).entries[0].state).toBe('committed');
    expect(s.rpc.mock.calls).toHaveLength(1);
  });
  it('failure to persist the decision dispatches no cancellation', async () => {
    const row = await pending(),
      s = service(row),
      put = vi.spyOn(offlineDb.syncMeta, 'put').mockRejectedValueOnce(new Error('Quota'));
    await expect((await engine(s).prepare(row)).cancel()).rejects.toThrow('Quota');
    put.mockRestore();
    expect(await journal()).toBeUndefined();
    expect(await rows()).toEqual([row]);
    expect(s.rpc.mock.calls).toHaveLength(1);
  });
  it('a failed queue deletion rolls back settlement and leaves the durable decision and original', async () => {
    const row = await pending(),
      s = service(row),
      del = vi.spyOn(offlineDb.mutationQueue, 'delete').mockRejectedValueOnce(new Error('Delete failed'));
    await expect((await engine(s).prepare(row)).cancel()).rejects.toThrow('Delete failed');
    del.mockRestore();
    expect(required(await journal()).entries[0].state).toBe('pending');
    expect(await rows()).toEqual([row]);
    expect(await (await engine(s).prepare(row)).check()).toBe('cancelled');
    expect(await rows()).toEqual([]);
  });
  it('unknown armed checks remain read-only; deliberate retries repeat cancellation with the original digest', async () => {
    const row = await pending(),
      s = service(row);
    s.rpc.mockImplementation(async () => {
      throw new Error('Unavailable');
    });
    s.rpc.mockImplementationOnce(async () => s.reply());
    await expect((await engine(s).prepare(row)).cancel()).rejects.toThrow();
    s.rpc.mockImplementation(async () => s.reply());
    const d = await engine(s).prepare(row);
    expect(await d.check()).toBe('unknown');
    expect(await rows()).toEqual([row]);
    s.rpc.mockImplementation(async (name) => {
      if (name === 'cancel_family_native_plan_v1') s.set('cancelled');
      return s.reply();
    });
    expect(await d.cancel()).toBe('cancelled');
  });
  it('native retention/dispatch/acknowledgement paths refuse an armed original', async () => {
    const row = await pending(),
      p = row.body as CreationPacket,
      s = service(row);
    s.rpc
      .mockImplementationOnce(async () => s.reply())
      .mockImplementationOnce(async () => {
        throw new Error('Lost');
      });
    await expect((await engine(s).prepare(row)).cancel()).rejects.toThrow();
    const owner = captureWriteSession();
    await expect(assertCreationOriginal(owner, p, row.tripId, row)).rejects.toThrow(/cancellation decision/);
    await expect(retainCreationIntent(owner, p, row.tripId)).rejects.toThrow(/cancellation decision/);
    expect(await rows()).toEqual([row]);
    await mutationQueue.flush();
    expect(await rows()).toEqual([row]);
  });
  it('settled UUID cannot be resurrected; a deliberate new UUID can create a separate original', async () => {
    const row = await pending(),
      p = row.body as CreationPacket,
      s = service(row);
    await (await engine(s).prepare(row)).cancel();
    const owner = captureWriteSession();
    await expect(retainCreationIntent(owner, p, row.tripId)).rejects.toThrow(/cancellation decision/);
    const fresh = { ...p, operation_id: crypto.randomUUID() };
    await retainCreationIntent(owner, fresh, row.tripId);
    expect((await rows())[0].id).toBe(fresh.operation_id);
    expect(required(await journal()).entries[0].row).toEqual(row);
  });
  it('two cooperating recovery owners cannot duplicate cancellation or archival', async () => {
    const row = await pending(),
      s = service(row),
      a = await engine(s).prepare(row),
      b = await engine(s).prepare(row);
    expect(await Promise.all([a.cancel(), b.cancel()])).toEqual(['cancelled', 'cancelled']);
    expect(s.rpc.mock.calls.filter((c) => c[0] === 'cancel_family_native_plan_v1')).toHaveLength(1);
    expect(required(await journal()).entries).toHaveLength(1);
  });
  it('a changed observed row refuses before a decision or network command', async () => {
    const row = await pending(),
      s = service(row),
      d = await engine(s).prepare(row);
    await offlineDb.mutationQueue.update(row.id, { attempts: row.attempts + 1 });
    await expect(d.cancel()).rejects.toThrow(/changed/);
    expect(s.rpc).not.toHaveBeenCalled();
    expect(await journal()).toBeUndefined();
    expect(await rows()).toHaveLength(1);
  });
  it('another-tab mutation during the server read never acknowledges or replaces that row', async () => {
    const row = await pending(),
      s = service(row);
    s.rpc.mockImplementation(async () => {
      await offlineDb.mutationQueue.update(row.id, { lastError: 'Another tab' });
      return s.reply();
    });
    await expect((await engine(s).prepare(row)).cancel()).rejects.toThrow(/changed/);
    expect(await journal()).toBeUndefined();
    expect((await rows())[0].lastError).toBe('Another tab');
  });
  it.each(['source', 'family', 'person', 'layer', 'logout', 'visibility'])(
    'changed %s retires the captured decision without dispatch',
    async (kind) => {
      const row = await pending(),
        s = service(row);
      let visible = true;
      const d = await engine(s, () => visible).prepare(row);
      if (kind === 'source') cohortState.source = 'https://other.invalid';
      if (kind === 'layer') cohortState.repo.setLayer(trip, 'myDraft');
      if (kind === 'visibility') visible = false;
      if (kind === 'logout') {
        setAuthed(false);
        invalidateOfflineSession();
      }
      if (kind === 'family' || kind === 'person') {
        cohortState.session = { ...cohortState.session, [kind === 'family' ? 'familyId' : 'personId']: uuid(999) };
        cohortState.repo.acceptSession(cohortState.session);
      }
      await expect(d.cancel()).rejects.toThrow();
      expect(s.rpc).not.toHaveBeenCalled();
      expect(await rows()).toEqual([row]);
    }
  );
  it('unknown archive versions remain opaque and block decisions/replay', async () => {
    const row = await pending(),
      s = service(row);
    await offlineDb.syncMeta.put({
      tripId: KEY,
      lastSyncedAt: null,
      status: 'idle',
      tilesBbox: null,
      filesCachedCount: 0,
      familyCreationTerminalArchive: { version: 99, original: 'keep' },
    });
    await expect(engine(s).prepare(row)).rejects.toThrow();
    await expect(retainCreationIntent(captureWriteSession(), row.body as CreationPacket, row.tripId)).rejects.toThrow();
    expect(s.rpc).not.toHaveBeenCalled();
    expect(await rows()).toEqual([row]);
    expect((await offlineDb.syncMeta.get(KEY))?.familyCreationTerminalArchive).toEqual({
      version: 99,
      original: 'keep',
    });
  });
  it('a changed digest after the durable decision leaves the original and pending journal intact', async () => {
    const row = await pending(),
      s = service(row);
    s.rpc
      .mockImplementationOnce(async () => s.reply())
      .mockImplementationOnce(async () => ({
        ...s.reply(),
        status: 'cancelled',
        cancelled_at: '2026-11-16T12:00:00Z',
        request_sha256: 'b'.repeat(64),
      }));
    await expect((await engine(s).prepare(row)).cancel()).rejects.toThrow(/exact original/);
    expect(await rows()).toEqual([row]);
    expect(required(await journal()).entries[0].state).toBe('pending');
  });
  it('current authority lost after arming keeps both the original and decision', async () => {
    const row = await pending(),
      s = service(row);
    s.rpc
      .mockImplementationOnce(async () => s.reply())
      .mockImplementationOnce(async () => {
        throw { code: '42501' };
      });
    await expect((await engine(s).prepare(row)).cancel()).rejects.toThrow(/retained/);
    expect(await rows()).toEqual([row]);
    expect(required(await journal()).entries[0].state).toBe('pending');
  });
  it('an armed original missing from the queue still recovers from its preserved row and terminal evidence', async () => {
    const row = await pending(),
      s = service(row);
    s.rpc
      .mockImplementationOnce(async () => s.reply())
      .mockImplementationOnce(async () => {
        throw new Error('Lost');
      });
    await expect((await engine(s).prepare(row)).cancel()).rejects.toThrow();
    await offlineDb.mutationQueue.delete(row.id);
    s.set('cancelled');
    expect(await (await engine(s).prepare(row)).check()).toBe('cancelled');
    expect(required(await journal()).entries[0].row).toEqual(row);
  });
  it('a failed final archive write preserves the armed state and is recoverable', async () => {
    const row = await pending(),
      s = service(row),
      raw = offlineDb.syncMeta.put.bind(offlineDb.syncMeta);
    let calls = 0;
    const put = vi.spyOn(offlineDb.syncMeta, 'put').mockImplementation((...args: Parameters<typeof raw>) => {
      if (++calls === 2) return Promise.reject(new Error('Archive quota')) as ReturnType<typeof raw>;
      return raw(...args);
    });
    await expect((await engine(s).prepare(row)).cancel()).rejects.toThrow('Archive quota');
    put.mockRestore();
    expect(await rows()).toEqual([row]);
    expect(required(await journal()).entries[0].state).toBe('pending');
    expect(await (await engine(s).prepare(row)).check()).toBe('cancelled');
  });
  it('combined preservation budget refuses arming before either archive becomes unexportable', async () => {
    const row = await pending(),
      s = service(row);
    await offlineDb.syncMeta.put({
      tripId: -2,
      lastSyncedAt: null,
      status: 'idle',
      tilesBbox: null,
      filesCachedCount: 0,
      familyPackingTerminalArchive: { version: 99, private_original: 'x'.repeat(29 * 1024 * 1024) },
    });
    await expect((await engine(s).prepare(row)).cancel()).rejects.toThrow();
    expect(s.rpc.mock.calls).toHaveLength(1);
    expect(await rows()).toEqual([row]);
    expect(await journal()).toBeUndefined();
  });

  it.each(['https', 'postgresql', 'custom+scheme'])(
    'credential-bearing %s text is refused before a cancellation decision',
    async (scheme) => {
      const row = await pending(),
        p = row.body as CreationPacket,
        s = service(row);
      p.form.location = {
        create: { source: { kind: 'manual' }, label: scheme + '://fixture-user:fixture-password@fixture.invalid' },
      };
      row.body = p;
      await offlineDb.mutationQueue.put(row);
      await expect((await engine(s).prepare(row)).cancel()).rejects.toThrow(/credentials/);
      expect(await rows()).toEqual([row]);
      expect(await journal()).toBeUndefined();
      expect(s.rpc.mock.calls).toHaveLength(1);
    }
  );
  it('retirement during asynchronous journal validation prevents even a read from dispatching', async () => {
    const row = await pending(),
      s = service(row);
    s.rpc
      .mockImplementationOnce(async () => s.reply())
      .mockImplementationOnce(async () => {
        throw new Error('Lost');
      });
    await expect((await engine(s).prepare(row)).cancel()).rejects.toThrow();
    const d = await engine(s).prepare(row),
      before = s.rpc.mock.calls.length;
    const original = crypto.subtle.digest.bind(crypto.subtle);
    const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, data) => {
      setAuthed(false);
      invalidateOfflineSession();
      return original(algorithm, data);
    });
    await expect(d.check()).rejects.toThrow();
    digest.mockRestore();
    expect(s.rpc.mock.calls).toHaveLength(before);
    expect(await rows()).toEqual([row]);
  });
  it.each([
    { count: 220, padding: 100000, label: 'proof space within journal byte limit' },
    { count: 1000, padding: 0, label: 'entry-count limit' },
  ])(
    'refuses a new cancellation before dispatch at the $label',
    async ({ count, padding }) => {
      const row = await pending(),
        p = row.body as CreationPacket,
        s = service(row),
        entries = [];
      for (let n = 0; n < count; n++) {
        const old = {
          ...structuredClone(row),
          id: uuid(2000 + n),
          body: { ...structuredClone(p), operation_id: uuid(2000 + n) },
        };
        entries.push({
          key: dependencyIdentity([p.source_url, p.scope, old.id], true),
          row: old,
          row_sha256: await packingDependencyHash(old, true),
          request_sha256: 'a'.repeat(64),
          state: 'committed',
          decided_at: '2026-11-16T12:00:00.000Z',
          settled_at: '2026-11-16T12:01:00.000Z',
          proof: {
            version: 2,
            trip_id: trip,
            operation_id: old.id,
            scope: p.scope,
            form: p.form,
            request_sha256: 'a'.repeat(64),
            status: 'committed',
            cancelled_at: null,
            result: {
              version: 1,
              state: 'published',
              location_id: uuid(8),
              visit_id: null,
              operation: { id: uuid(8), extra: 'x'.repeat(padding) },
            },
          },
        });
      }
      const meta = {
        tripId: KEY,
        lastSyncedAt: null,
        status: 'idle' as const,
        tilesBbox: null,
        filesCachedCount: 0,
        familyCreationTerminalArchive: { version: 1, kind: 'creation-terminal-archive', entries },
      };
      await offlineDb.syncMeta.put(meta);
      await expect((await engine(s).prepare(row)).cancel()).rejects.toThrow();
      expect(s.rpc.mock.calls.map((c) => c[0])).toEqual(['get_family_native_plan_receipt_v2']);
      expect(await rows()).toEqual([row]);
      expect(await offlineDb.syncMeta.get(KEY)).toEqual(meta);
    },
    30000
  );
});
