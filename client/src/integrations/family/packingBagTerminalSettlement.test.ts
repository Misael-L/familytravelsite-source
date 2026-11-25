import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalPackingList } from '../../../tests/helpers/familyPacking';
import { bagActions, bagTerminalOriginal, bagTerminalProof } from '../../../tests/helpers/familyPackingBagTerminal';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import {
  clearAll,
  clearTripData,
  deleteCurrentUserDb,
  invalidateOfflineSession,
  offlineDb,
  reopenForUser,
} from '../../db/offlineDb';
import { PACKING_TERMINAL_ARCHIVE_KEY as KEY } from '../../db/packingTerminalArchive';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode } from '../../sync/networkMode';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { prepareRetainedWorkExport } from '../../sync/retainedRecovery';
import { captureWriteSession } from '../../sync/writeSession';
import { type PackingBagTerminalEnvelope } from './packingBagTerminalContract';
import { createPackingBagTerminalTransport, type PackingBagTerminalRpc } from './packingBagTerminalTransport';
import { retainPackingIntent } from './packingIntentQueue';
import { PackingTerminalSettlement } from './packingTerminalSettlement';
import { createPackingTransport } from './packingTransport';
import { FamilyFrontendRepository, type FamilySession } from './repository';
let p: PackingBagTerminalEnvelope,
  repo: FamilyFrontendRepository,
  current: boolean,
  session: FamilySession,
  native: number,
  state: 'unknown' | 'committed' | 'cancelled',
  lost: boolean,
  source: string,
  stop: () => void;
const rpc = vi.fn<PackingBagTerminalRpc>();
const manager = (enabled = true) =>
  new PackingTerminalSettlement(
    repo,
    p.command.scope.trip_id,
    { source: () => source, current: () => current, bagCommands: enabled },
    {
      bagTerminal: createPackingBagTerminalTransport(rpc),
      items: createPackingTransport(async () => ({
        ...canonicalPackingList(p.command.scope, true),
        collection_revision: p.command.expected_collection_revision,
      })),
    }
  );
for (const action of bagActions)
  describe(action + ' durable bag decision', () => {
    beforeEach(async () => {
      resetAllStores();
      await reopenForUser(88005);
      await resetOfflineTestDatabase();
      installTestLocks();
      _resetNetworkMode();
      setAuthed(true);
      p = bagTerminalOriginal(action);
      current = true;
      lost = false;
      state = 'unknown';
      source = p.source_url;
      const c = p.command.scope;
      session = {
        userId: c.user_id,
        familyId: c.family_id,
        personId: c.person_id,
        user: { username: 'Synthetic', email: 'fixture@fixture.invalid', avatar_url: null, created_at: '2026-11-12' },
      };
      repo = new FamilyFrontendRepository(
        async () => session,
        undefined,
        () => ({ userId: session.userId, familyId: session.familyId, personId: session.personId, source })
      );
      await repo.session();
      native = (await repo.views()).ids.register('trip', c.trip_id);
      useTripStore.setState({ trip: { id: native, title: 'Recovery', user_id: 0 } as never });
      stop = installFamilyCommandRetention();
      await retainPackingIntent(captureWriteSession(), p, native);
      await offlineDb.mutationQueue.update(p.command.operation_id, {
        status: 'conflict',
        attempts: 2,
        lastError: 'Server refused',
      });
      rpc.mockReset().mockImplementation(async (name) => {
        if (name.startsWith('cancel')) state = state === 'committed' ? 'committed' : 'cancelled';
        const proof = await bagTerminalProof(p, state);
        if (lost) throw Error('Reply lost');
        return proof;
      });
    });
    afterEach(async () => {
      stop();
      setAuthed(false);
      _resetNetworkMode();
      await resetOfflineTestDatabase();
    });
    it('prepares without network effects, then archives only the exact cancelled original', async () => {
      const row = await offlineDb.mutationQueue.get(p.command.operation_id),
        decision = await manager().prepare(p.command.operation_id);
      expect(rpc).not.toHaveBeenCalled();
      expect(await decision.cancel()).toBe('cancelled');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      const a = (await offlineDb.syncMeta.get(KEY))?.familyPackingTerminalArchive as {
        entries: Array<{ row: unknown; state: string }>;
      };
      expect(a.entries[0].row).toEqual(row);
      expect(a.entries[0].state).toBe('cancelled');
      expect((await prepareRetainedWorkExport()).blob.size).toBeGreaterThan(0);
    });
    it('looks up a committed original without cancelling or inventing a new save', async () => {
      state = 'committed';
      const decision = await manager().prepare(p.command.operation_id);
      expect(await decision.check()).toBe('committed');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect(rpc.mock.calls.every(([n]) => n.startsWith('get_'))).toBe(true);
    });
    it('does not delete unknown work', async () => {
      const row = await offlineDb.mutationQueue.get(p.command.operation_id);
      expect(await (await manager().prepare(p.command.operation_id)).check()).toBe('unknown');
      expect(await offlineDb.mutationQueue.get(p.command.operation_id)).toEqual(row);
    });
    it('durably arms cancellation and rediscovers it after a lost response', async () => {
      const row = await offlineDb.mutationQueue.get(p.command.operation_id);
      lost = true;
      await expect((await manager().prepare(p.command.operation_id)).cancel()).rejects.toThrow('Reply lost');
      expect(await offlineDb.mutationQueue.get(p.command.operation_id)).toEqual(row);
      lost = false;
      const pending = await manager().pending();
      expect(pending?.intent).toBe('cancel-command');
      expect(await pending?.retry()).toBe('cancelled');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    });
    it('preserves settled original bytes through cache eviction and logout', async () => {
      await (await manager().prepare(p.command.operation_id)).cancel();
      const archive = await offlineDb.syncMeta.get(KEY);
      await clearTripData(native);
      await clearAll();
      await invalidateOfflineSession();
      await deleteCurrentUserDb();
      await reopenForUser(88005);
      expect(await offlineDb.syncMeta.get(KEY)).toEqual(archive);
    });
    it('does not create a restore replacement for a cancelled bag edit', async () => {
      await (await manager().prepare(p.command.operation_id)).cancel();
      expect((await manager().replacements()).items).toEqual([]);
      await expect(manager().prepareReplacement(p.command.operation_id)).rejects.toBeDefined();
    });
    it('requires the separate128 capability', async () => {
      await expect(manager(false).prepare(p.command.operation_id)).rejects.toBeDefined();
      expect(rpc).not.toHaveBeenCalled();
    });
    it('rejects changed original rows after preparation', async () => {
      const decision = await manager().prepare(p.command.operation_id);
      await offlineDb.mutationQueue.update(p.command.operation_id, { attempts: 3 });
      await expect(decision.cancel()).rejects.toBeDefined();
      expect(rpc).not.toHaveBeenCalled();
      expect(await offlineDb.mutationQueue.count()).toBe(1);
    });
    it('rejects a retired owner before sending', async () => {
      const decision = await manager().prepare(p.command.operation_id);
      current = false;
      await expect(decision.cancel()).rejects.toBeDefined();
      expect(rpc).not.toHaveBeenCalled();
    });
  });
