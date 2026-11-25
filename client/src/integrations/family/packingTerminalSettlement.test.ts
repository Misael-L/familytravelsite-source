import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalPackingList,
  canonicalPackingRow,
  packingFixtureId as id,
} from '../../../tests/helpers/familyPacking';
import { bagObservation } from '../../../tests/helpers/familyPackingBags';
import { terminalAck, terminalOriginal, terminalProof } from '../../../tests/helpers/familyPackingTerminal';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api from '../../api/client';
import {
  clearAll,
  clearTripData,
  deleteCurrentUserDb,
  invalidateOfflineSession,
  offlineDb,
  reopenForUser,
  type QueuedMutation,
} from '../../db/offlineDb';
import { PACKING_TERMINAL_ARCHIVE_KEY as KEY } from '../../db/packingTerminalArchive';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode } from '../../sync/networkMode';
import { prepareOriginalWorkExport } from '../../sync/originalWorkExport';
import { readQueueStatus } from '../../sync/queueStatus';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { prepareRetainedWorkExport } from '../../sync/retainedRecovery';
import { captureWriteSession } from '../../sync/writeSession';
import { dependencyIdentity, packingDependencyDescriptor, packingDependencyHash } from './packingBagDependencyContract';
import { createPackingBagTransport, type PackingBagRpc } from './packingBagTransport';
import {
  createPackingCategoryAggregateTransport,
  type PackingCategoryAggregateRpc,
} from './packingCategoryAggregateTransport';
import * as packingQueue from './packingIntentQueue';
import { packingRestoreEnvelope, packingRestoreRequest, type PackingRestoreEnvelope } from './packingTerminalContract';
import { PackingTerminalSettlement } from './packingTerminalSettlement';
import { createPackingTerminalTransport, type PackingTerminalRpc } from './packingTerminalTransport';
import { createPackingTransport, type PackingRpc } from './packingTransport';
import { FamilyFrontendRepository, type FamilySession } from './repository';

const { packingIntentUrl, retainPackingIntent } = packingQueue;
let original: PackingRestoreEnvelope,
  repo: FamilyFrontendRepository,
  session: FamilySession,
  current: boolean,
  allowed: boolean,
  source: string,
  native: number,
  stop: () => void;
let scope: typeof original.command.scope,
  collection: number,
  state: 'unknown' | 'cancelled' | 'committed',
  redacted: boolean,
  lost: boolean,
  hook: (() => Promise<void> | void) | undefined;
let saved: QueuedMutation;
const rpc = vi.fn<PackingTerminalRpc>(),
  items = vi.fn<PackingRpc>(),
  bags = vi.fn<PackingBagRpc>(),
  aggregates = vi.fn<PackingCategoryAggregateRpc>();
const previous = api.defaults.adapter;
const reads = () => ({
  terminal: createPackingTerminalTransport(rpc),
  items: createPackingTransport(items),
  bags: createPackingBagTransport(bags),
  aggregates: createPackingCategoryAggregateTransport(aggregates),
});
const manager = () =>
  new PackingTerminalSettlement(
    repo,
    original.command.scope.trip_id,
    { source: () => source, current: () => current },
    reads()
  );
const archived = async () =>
  (await offlineDb.syncMeta.get(KEY))?.familyPackingTerminalArchive as
    | { entries: Array<{ state: string; row: QueuedMutation; proof: unknown; companions: QueuedMutation[] }> }
    | undefined;
for (const domain of ['item', 'bag', 'batch'] as const)
  describe(`${domain} exact retained terminal settlement`, () => {
    beforeEach(async () => {
      resetAllStores();
      await reopenForUser(88004);
      await resetOfflineTestDatabase();
      installTestLocks();
      _resetNetworkMode();
      setAuthed(true);
      original = terminalOriginal(domain);
      scope = structuredClone(original.command.scope);
      collection = 'observed' in original.command ? original.command.expected_collection_revision! : 7;
      current = allowed = true;
      lost = redacted = false;
      hook = undefined;
      state = 'unknown';
      source = original.source_url;
      session = {
        userId: scope.user_id,
        familyId: scope.family_id,
        personId: scope.person_id,
        user: {
          username: 'Terminal fixture',
          email: 'fixture@fixture.invalid',
          avatar_url: null,
          created_at: '2026-11-12',
        },
      };
      repo = new FamilyFrontendRepository(
        async () => session,
        undefined,
        () => ({ userId: session.userId, familyId: session.familyId, personId: session.personId, source })
      );
      await repo.session();
      native = (await repo.views()).ids.register('trip', scope.trip_id);
      useTripStore.setState({ trip: { id: native, title: 'Terminal fixture', user_id: 0 } as never });
      stop = installFamilyCommandRetention();
      items.mockReset().mockImplementation(async (name) => {
        if (!allowed) throw { code: '42501' };
        if (name === 'get_family_trip_packing_v1')
          return { ...canonicalPackingList(scope, true), collection_revision: collection };
        if (name.includes('trash'))
          return {
            version: 1,
            scope,
            collection_revision: collection,
            items: [
              canonicalPackingRow({
                id: original.command.target_id!,
                revision: 5,
                deleted_at: '2026-11-12T12:00:00.123456+00:00',
                deleted_by_person_id: scope.person_id,
              }),
            ],
            next_cursor: null,
          };
        throw Error('Unexpected read');
      });
      bags.mockReset().mockImplementation(async () => ({
        ...bagObservation(true),
        scope: structuredClone(scope),
        collection_revision: collection,
      }));
      aggregates.mockReset().mockImplementation(async () => {
        if (!('observed' in original.command) || !original.command.observed) throw Error();
        return {
          ...structuredClone(original.command.observed),
          scope: structuredClone(scope),
          collection_revision: collection,
        };
      });
      rpc.mockReset().mockImplementation(async (name, args) => {
        if (!allowed) throw { code: '42501' };
        expect(args.p_original_args).toEqual(packingRestoreRequest(original).args);
        if (name.startsWith('cancel') && state === 'unknown') state = 'cancelled';
        const proof = await terminalProof(original, state, redacted, scope);
        await hook?.();
        if (lost) throw Error('Lost terminal reply');
        return proof;
      });
      api.defaults.adapter = vi.fn(async (config) => {
        const p = packingRestoreEnvelope.parse(typeof config.data === 'string' ? JSON.parse(config.data) : config.data);
        return { data: terminalAck(p), status: 200, statusText: 'OK', headers: {}, config };
      });
      await retainPackingIntent(captureWriteSession(), original, native);
      await offlineDb.mutationQueue.update(original.command.operation_id, {
        status: 'conflict',
        lastError: 'Original refused',
      });
      saved = (await offlineDb.mutationQueue.get(original.command.operation_id))!;
    });
    afterEach(async () => {
      stop();
      api.defaults.adapter = previous;
      vi.restoreAllMocks();
      _resetNetworkMode();
      setAuthed(false);
      await resetOfflineTestDatabase();
    });
    if (domain !== 'bag') {
      const pair = async () => {
        const child = structuredClone(original),
          b = terminalOriginal('bag');
        b.command.operation_id = id(900);
        b.command.scope = structuredClone(child.command.scope);
        if (!('observed' in b.command) || !b.command.observed) throw Error();
        b.command.observed.scope = structuredClone(child.command.scope);
        const descriptor = packingDependencyDescriptor.parse({
          version: 1,
          kind: 'packing-bag-restore-dependency',
          child_operation_id: child.command.operation_id,
          child_sha256: await packingDependencyHash(child),
          child_row_sha256: await packingDependencyHash(saved),
          parent_operation_id: b.command.operation_id,
          bag_id: b.command.target_id,
          child_item:
            domain === 'item'
              ? canonicalPackingRow({
                  id: child.command.target_id!,
                  revision: 3,
                  deleted_at: '2026-11-12T12:00:00.123456+00:00',
                  deleted_by_person_id: id(4),
                })
              : null,
        });
        const parent: QueuedMutation = {
          id: b.command.operation_id,
          tripId: native,
          method: 'POST',
          url: packingIntentUrl(b),
          body: structuredClone(b),
          familyPackingDependency: descriptor,
          retentionPolicy: 'family-original-v1',
          status: 'pending',
          attempts: 0,
          lastError: null,
          schemaVersion: 3,
          createdAt: saved.createdAt + 1,
        };
        await offlineDb.mutationQueue.add(parent);
        const states = new Map<string, 'unknown' | 'cancelled' | 'committed'>();
        rpc.mockImplementation(async (name, args) => {
          const p = args.p_operation_id === b.command.operation_id ? b : child;
          if (name.startsWith('cancel')) states.set(p.command.operation_id, 'cancelled');
          const proof = await terminalProof(p, states.get(p.command.operation_id) ?? 'unknown', false, scope);
          await hook?.();
          if (lost) throw Error('Lost terminal reply');
          return proof;
        });
        return { child: saved, parent, packet: b };
      };
      it('cancelling a parent archives only that exact parent and leaves its child byte-for-byte intact', async () => {
        const x = await pair();
        expect(await (await manager().prepare(x.parent.id)).cancel()).toBe('cancelled');
        expect(await offlineDb.mutationQueue.toArray()).toEqual([x.child]);
        expect((await archived())?.entries[0].row).toEqual(x.parent);
        expect((await archived())?.entries[0].companions).toEqual([x.child]);
      });
      it('cancelling a child preserves its original parent and permits only typed terminal recovery of that orphan', async () => {
        const x = await pair();
        expect(await (await manager().prepare(x.child.id)).cancel()).toBe('cancelled');
        expect(await offlineDb.mutationQueue.toArray()).toEqual([x.parent]);
        const pending = await manager().pending();
        expect(await pending?.check()).toBe('unknown');
        expect(api.defaults.adapter).not.toHaveBeenCalled();
        expect(await (await pending!.terminal.prepare(x.parent.id)).cancel()).toBe('cancelled');
        expect(await offlineDb.mutationQueue.count()).toBe(0);
        expect((await archived())?.entries.map((e) => e.row)).toEqual([x.child, x.parent]);
      });
      it('refuses concurrent dependency mutation while preserving both queue rows and the exact archival cohort', async () => {
        const x = await pair();
        hook = async () => {
          await offlineDb.mutationQueue.update(x.child.id, { attempts: 99 });
        };
        await expect((await manager().prepare(x.parent.id)).cancel()).rejects.toBeDefined();
        expect(await offlineDb.mutationQueue.count()).toBe(2);
        expect((await archived())?.entries[0].row).toEqual(x.parent);
        expect((await archived())?.entries[0].companions).toEqual([x.child]);
      });
    }
    it('pins negative zero metadata while leaving the previous dependency hash codec unchanged', async () => {
      expect(dependencyIdentity({ v: -0 })).toBe(dependencyIdentity({ v: 0 }));
      expect(dependencyIdentity({ v: -0 }, true)).not.toBe(dependencyIdentity({ v: 0 }, true));
      await offlineDb.mutationQueue.update(saved.id, { createdAt: 0 });
      const d = await manager().prepare(saved.id);
      await offlineDb.mutationQueue.put({ ...(await offlineDb.mutationQueue.get(saved.id))!, createdAt: -0 });
      expect(Object.is((await offlineDb.mutationQueue.get(saved.id))?.createdAt, -0)).toBe(true);
      await expect(d.cancel()).rejects.toBeDefined();
      expect(rpc).not.toHaveBeenCalled();
    });
    it('exports negative zero and undefined metadata in settled originals without JSON value loss', async () => {
      await offlineDb.mutationQueue.put({ ...saved, createdAt: -0, retryAfter: undefined });
      await (await manager().prepare(saved.id)).cancel();
      const archivedRow = (await archived())!.entries[0].row;
      expect(Object.is(archivedRow.createdAt, -0)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(archivedRow, 'retryAfter')).toBe(true);
      const exported = JSON.parse(await (await prepareRetainedWorkExport()).blob.text());
      expect(exported.negative_zero_paths).toContainEqual([
        'settled_originals',
        'familyPackingTerminalArchive',
        'entries',
        0,
        'row',
        'createdAt',
      ]);
      expect(exported.undefined_paths).toContainEqual([
        'settled_originals',
        'familyPackingTerminalArchive',
        'entries',
        0,
        'row',
        'retryAfter',
      ]);
      const graph = await prepareOriginalWorkExport();
      expect(JSON.parse(await graph.blob.text()).payload).toContain('["createdAt",["number","-0"]]');
      graph.dispose();
    });
    it('prepares without sending/archiving; unknown check preserves the complete row', async () => {
      const d = await manager().prepare(saved.id);
      expect(d.original).toEqual(saved);
      expect(rpc).not.toHaveBeenCalled();
      expect(await archived()).toBeUndefined();
      expect(await d.check()).toBe('unknown');
      expect(await offlineDb.mutationQueue.toArray()).toEqual([saved]);
      expect(await archived()).toBeUndefined();
    });
    it('atomically archives the exact original and terminal proof before removing only its row', async () => {
      const d = await manager().prepare(saved.id);
      expect(await d.cancel()).toBe('cancelled');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect((await readQueueStatus()).retained).toBe(1);
      const a = await archived();
      expect(a?.entries).toHaveLength(1);
      expect(a?.entries[0].row).toEqual(saved);
      expect(a?.entries[0].state).toBe('cancelled');
      expect(a?.entries[0].proof).toMatchObject({ status: 'cancelled' });
      const before = await offlineDb.syncMeta.get(KEY);
      expect(await d.cancel()).toBe('cancelled');
      expect(await offlineDb.syncMeta.get(KEY)).toEqual(before);
    });
    it.each([false, true])(
      'settles an already committed %s-redacted proof without replaying or cancelling again',
      async (hidden) => {
        state = 'committed';
        redacted = hidden;
        const d = await manager().prepare(saved.id);
        expect(await d.check()).toBe('committed');
        expect(await offlineDb.mutationQueue.count()).toBe(0);
        expect(rpc.mock.calls.every(([name]) => name.startsWith('get_'))).toBe(true);
        expect((await archived())?.entries[0].row).toEqual(saved);
      }
    );
    it('durably arms a decision before send and recovers a lost reply with a fresh owner, lookup only', async () => {
      lost = true;
      await expect((await manager().prepare(saved.id)).cancel()).rejects.toThrow('Lost terminal reply');
      expect(await offlineDb.mutationQueue.toArray()).toEqual([saved]);
      expect((await archived())?.entries[0].state).toBe('pending');
      lost = false;
      const attempts = rpc.mock.calls.filter(([n]) => n.startsWith('cancel')).length;
      const pending = await manager().pending();
      expect(pending?.intent).toBe('cancel-restore');
      expect(await pending?.check()).toBe('cancelled');
      expect(rpc.mock.calls.filter(([n]) => n.startsWith('cancel'))).toHaveLength(attempts);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    });
    it('recovers a before-send interruption only through an explicit cancellation retry', async () => {
      rpc.mockRejectedValueOnce(Error('Before send'));
      await expect((await manager().prepare(saved.id)).cancel()).rejects.toThrow('Before send');
      const p = await manager().pending();
      expect(await p?.check()).toBe('unknown');
      expect(await offlineDb.mutationQueue.toArray()).toEqual([saved]);
      expect(await p?.retry()).toBe('cancelled');
    });
    it('retains both the old archival original and a concurrently changed queue row', async () => {
      hook = async () => {
        await offlineDb.mutationQueue.update(saved.id, { lastError: 'Other tab changed this' });
      };
      await expect((await manager().prepare(saved.id)).cancel()).rejects.toMatchObject({ status: 409 });
      expect((await archived())?.entries[0].row).toEqual(saved);
      expect((await offlineDb.mutationQueue.get(saved.id))?.lastError).toBe('Other tab changed this');
    });
    it('refuses a changed row between prepare and explicit confirmation', async () => {
      const d = await manager().prepare(saved.id);
      await offlineDb.mutationQueue.update(saved.id, { attempts: 1 });
      await expect(d.cancel()).rejects.toBeDefined();
      expect(rpc).not.toHaveBeenCalled();
      expect(await archived()).toBeUndefined();
    });
    it.each([
      ['check', 'missing'],
      ['cancel', 'missing'],
      ['check', 'replaced'],
      ['cancel', 'replaced'],
    ] as const)('refuses %s when the queue row is %s during the scope read', async (action, change) => {
      const decision = await manager().prepare(saved.id);
      const replacement: QueuedMutation = { ...saved, attempts: saved.attempts + 1 };
      items.mockImplementationOnce(async (name) => {
        expect(name).toBe('get_family_trip_packing_v1');
        if (change === 'missing') await offlineDb.mutationQueue.delete(saved.id);
        else await offlineDb.mutationQueue.put(replacement);
        return { ...canonicalPackingList(scope, true), collection_revision: collection };
      });

      await expect(decision[action]()).rejects.toMatchObject({ code: 'packing_terminal_changed' });
      expect(rpc).not.toHaveBeenCalled();
      expect(await archived()).toBeUndefined();
      expect(await offlineDb.mutationQueue.toArray()).toEqual(change === 'missing' ? [] : [replacement]);
    });
    it.each(['source', 'family', 'person', 'trip', 'owner', 'visibility'])(
      'retires %s context before confirmation without a request',
      async (change) => {
        const d = await manager().prepare(saved.id, () => current);
        if (change === 'source') source += '/changed';
        else if (change === 'family') session.familyId = id(999);
        else if (change === 'person') session.personId = id(999);
        else if (change === 'trip') useTripStore.setState({ trip: { id: native + 1 } as never });
        else if (change === 'owner') invalidateOfflineSession();
        else current = false;
        await expect(d.cancel()).rejects.toBeDefined();
        expect(rpc).not.toHaveBeenCalled();
        expect(await offlineDb.mutationQueue.toArray()).toEqual([saved]);
      }
    );
    it('keeps a real postcommit retired owner pending until fresh-owner proof recovery', async () => {
      hook = () => {
        current = false;
      };
      await expect((await manager().prepare(saved.id)).cancel()).rejects.toBeDefined();
      expect(await offlineDb.mutationQueue.toArray()).toEqual([saved]);
      expect((await archived())?.entries[0].state).toBe('pending');
      current = true;
      hook = undefined;
      expect(await (await manager().pending())?.check()).toBe('cancelled');
    });
    it('preserves the exact original and pending archive across logout, then recovers after reopening the original account', async () => {
      hook = async () => {
        await deleteCurrentUserDb();
      };
      await expect((await manager().prepare(saved.id)).cancel()).rejects.toBeDefined();
      await reopenForUser(88004);
      setAuthed(true);
      hook = undefined;
      expect(await offlineDb.mutationQueue.toArray()).toEqual([saved]);
      expect((await archived())?.entries[0].state).toBe('pending');
      expect(await (await manager().pending())?.check()).toBe('cancelled');
    });
    it('never lets generic queue flush replay an armed pending original', async () => {
      await offlineDb.mutationQueue.update(saved.id, { status: 'pending' });
      saved = (await offlineDb.mutationQueue.get(saved.id))!;
      rpc.mockRejectedValueOnce(Error('Before send'));
      await expect((await manager().prepare(saved.id)).cancel()).rejects.toThrow();
      const before = await offlineDb.mutationQueue.toArray();
      await mutationQueue.flush();
      expect(await offlineDb.mutationQueue.toArray()).toEqual(before);
      expect(api.defaults.adapter).not.toHaveBeenCalled();
    });
    it('blocks another packing command while the cancellation is armed, even if an older tab already removed its row', async () => {
      rpc.mockRejectedValueOnce(Error('Before send'));
      await expect((await manager().prepare(saved.id)).cancel()).rejects.toThrow();
      await offlineDb.mutationQueue.delete(saved.id);
      const other = structuredClone(original);
      other.command.operation_id = id(777);
      await expect(retainPackingIntent(captureWriteSession(), other, native)).rejects.toBeDefined();
      expect(await (await manager().pending())?.check()).toBe('unknown');
    });
    it('recovers terminal history when an older tab has already acknowledged and removed the same row', async () => {
      lost = true;
      await expect((await manager().prepare(saved.id)).cancel()).rejects.toThrow();
      await offlineDb.mutationQueue.delete(saved.id);
      lost = false;
      expect(await (await manager().pending())?.check()).toBe('cancelled');
      expect((await archived())?.entries[0].row).toEqual(saved);
    });
    it('exports settled originals and preserves them during cache eviction and logout without keeping read caches', async () => {
      await (await manager().prepare(saved.id)).cancel();
      const meta = await offlineDb.syncMeta.get(KEY);
      const raw = await prepareRetainedWorkExport();
      expect(await raw.blob.text()).toContain('settled_originals');
      const originalExport = await prepareOriginalWorkExport();
      expect(await originalExport.blob.text()).toContain('family.original-work');
      originalExport.dispose();
      await clearTripData(native);
      await clearAll();
      expect(await offlineDb.syncMeta.get(KEY)).toEqual(meta);
      await deleteCurrentUserDb();
      await reopenForUser(88004);
      setAuthed(true);
      expect(await offlineDb.syncMeta.get(KEY)).toEqual(meta);
    });
    it('requires a fresh observation and distinct UUID plus explicit confirmation for replacement', async () => {
      await (await manager().prepare(saved.id)).cancel();
      const archive = await offlineDb.syncMeta.get(KEY);
      collection += 5;
      const draft = await manager().prepareReplacement(saved.id);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect(api.defaults.adapter).not.toHaveBeenCalled();
      expect(draft.original.command.operation_id).not.toBe(saved.id);
      expect(draft.original.command.scope).toEqual(scope);
      expect(await draft.submit()).toBe('committed');
      expect(await offlineDb.syncMeta.get(KEY)).toEqual(archive);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    });
    it('refuses to silently rebase a replacement when its fresh observation changes before submit', async () => {
      await (await manager().prepare(saved.id)).cancel();
      const draft = await manager().prepareReplacement(saved.id);
      scope = { ...scope, trip_lifecycle_revision: scope.trip_lifecycle_revision + 2 };
      await expect(draft.submit()).rejects.toBeDefined();
      expect(api.defaults.adapter).not.toHaveBeenCalled();
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    });
    it.each(['updated', 'removed'] as const)(
      'refuses an archive replacement if its row was %s after retention',
      async (change) => {
        await (await manager().prepare(saved.id)).cancel();
        const archive = await offlineDb.syncMeta.get(KEY);
        const draft = await manager().prepareReplacement(saved.id);
        const op = draft.original.command.operation_id;
        const retain = packingQueue.retainPackingIntent;
        const newer = { attempts: 3, lastError: 'Newer replacement recovery state' };
        vi.spyOn(packingQueue, 'retainPackingIntent').mockImplementationOnce(async (...args) => {
          const original = await retain(...args);
          expect(original.id).toBe(op);
          if (change === 'updated') expect(await offlineDb.mutationQueue.update(op, newer)).toBe(1);
          else await offlineDb.mutationQueue.delete(op);
          return original;
        });

        const outcome: unknown = await draft.submit().catch((error: unknown) => error);
        expect(api.defaults.adapter).not.toHaveBeenCalled();
        expect(outcome).toMatchObject({ code: 'packing_terminal_changed' });
        expect(await offlineDb.syncMeta.get(KEY)).toEqual(archive);
        if (change === 'updated')
          expect(await offlineDb.mutationQueue.get(op)).toMatchObject({
            ...newer,
            status: 'pending',
            body: draft.original,
          });
        else expect(await offlineDb.mutationQueue.get(op)).toBeUndefined();
      }
    );
    it('keeps archive and queue intact when proof or permission is refused', async () => {
      rpc.mockRejectedValueOnce({ code: '54000' });
      await expect((await manager().prepare(saved.id)).cancel()).rejects.toMatchObject({ status: 413 });
      expect(await offlineDb.mutationQueue.toArray()).toEqual([saved]);
      expect((await archived())?.entries[0].row).toEqual(saved);
    });
    it('refuses binary/secret originals rather than deleting or exposing them', async () => {
      await offlineDb.mutationQueue.update(saved.id, { lastError: 'eyJabc.def.ghi' });
      const d = await manager().prepare(saved.id);
      await expect(d.cancel()).rejects.toBeDefined();
      expect(rpc).not.toHaveBeenCalled();
      expect(await offlineDb.mutationQueue.count()).toBe(1);
    });
    it('does not treat a future archive marker as execution/cleanup authority', async () => {
      await offlineDb.syncMeta.put({
        tripId: KEY,
        lastSyncedAt: null,
        status: 'idle',
        tilesBbox: null,
        filesCachedCount: 0,
        familyPackingTerminalArchive: { version: 999, private_original: 'keep' },
      });
      await expect(manager().prepare(saved.id)).rejects.toBeDefined();
      expect(await offlineDb.mutationQueue.count()).toBe(1);
      expect((await offlineDb.syncMeta.get(KEY))?.familyPackingTerminalArchive).toEqual({
        version: 999,
        private_original: 'keep',
      });
    });
  });
