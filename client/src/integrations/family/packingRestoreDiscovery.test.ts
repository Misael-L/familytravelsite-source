import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalPackingList, canonicalPackingRow } from '../../../tests/helpers/familyPacking';
import { bagObservation } from '../../../tests/helpers/familyPackingBags';
import { terminalOriginal, terminalProof } from '../../../tests/helpers/familyPackingTerminal';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import { clearAll, deleteCurrentUserDb, invalidateOfflineSession, offlineDb, reopenForUser } from '../../db/offlineDb';
import { PACKING_TERMINAL_ARCHIVE_KEY as KEY } from '../../db/packingTerminalArchive';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode } from '../../sync/networkMode';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { captureWriteSession } from '../../sync/writeSession';
import { retainPackingIntent } from './packingIntentQueue';
import { PackingTerminalSettlement } from './packingTerminalSettlement';
import { createPackingTerminalTransport, type PackingTerminalRpc } from './packingTerminalTransport';
import { FamilyFrontendRepository, type FamilySession } from './repository';
let p: ReturnType<typeof terminalOriginal>,
  repo: FamilyFrontendRepository,
  current: boolean,
  source: string,
  stop: () => void,
  deleted: boolean,
  native: number;
const rpc = vi.fn<PackingTerminalRpc>(),
  list = vi.fn(),
  batches = vi.fn(),
  observation = vi.fn(),
  trash = vi.fn();
const manager = (enabled = true) =>
  new PackingTerminalSettlement(
    repo,
    p.command.scope.trip_id,
    { source: () => source, current: () => current, bagCommands: enabled },
    {
      terminal: createPackingTerminalTransport(rpc),
      items: { list, trash } as never,
      bags: { observation } as never,
      aggregates: { batches, observation } as never,
    }
  );
for (const domain of ['item', 'bag', 'batch'] as const)
  describe(domain + ' durable restore discovery', () => {
    beforeEach(async () => {
      resetAllStores();
      await reopenForUser(88006);
      await resetOfflineTestDatabase();
      installTestLocks();
      _resetNetworkMode();
      setAuthed(true);
      p = terminalOriginal(domain);
      p.source_url = 'http://127.0.0.1:56041';
      source = p.source_url;
      current = deleted = true;
      const c = p.command.scope;
      const session: FamilySession = {
        userId: c.user_id,
        familyId: c.family_id,
        personId: c.person_id,
        user: { username: 'Fixture', email: 'fixture@fixture.invalid', avatar_url: null, created_at: '2026-11-12' },
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
      list.mockReset().mockImplementation(async () => canonicalPackingList(p.command.scope, true));
      rpc.mockReset().mockImplementation(async () => terminalProof(p, 'cancelled'));
      observation.mockReset().mockImplementation(async () =>
        domain === 'bag'
          ? {
              ...{
                ...bagObservation(deleted),
                bag: { ...bagObservation(deleted).bag, id: p.command.target_id!, trip_id: c.trip_id },
              },
            }
          : 'observed' in p.command
            ? p.command.observed
            : undefined
      );
      batches.mockReset().mockImplementation(async () => ({
        categories: deleted ? [{ category: { id: p.command.target_id }, batch: {} }] : [],
        next_cursor: null,
      }));
      trash.mockReset().mockImplementation(async () => ({
        scope: c,
        items: deleted
          ? [
              {
                ...canonicalPackingRow({ trip_id: c.trip_id, id: p.command.target_id! }),
                deleted_at: '2026-11-12T00:00:00Z',
              },
            ]
          : [],
        next_cursor: null,
      }));
      await retainPackingIntent(captureWriteSession(), p, native);
      await (await manager().prepare(p.command.operation_id)).cancel();
    });
    afterEach(async () => {
      stop();
      setAuthed(false);
      await resetOfflineTestDatabase();
    });
    it('discovers only an authenticated cancelled restore with its unchanged original', async () => {
      const a = await offlineDb.syncMeta.get(KEY);
      expect((await manager().replacements()).items).toEqual([
        { id: p.command.operation_id, action: p.command.action },
      ]);
      expect(await offlineDb.syncMeta.get(KEY)).toEqual(a);
    });
    it('survives owner database logout and remount', async () => {
      const a = await offlineDb.syncMeta.get(KEY);
      await clearAll();
      await invalidateOfflineSession();
      await deleteCurrentUserDb();
      await reopenForUser(88006);
      setAuthed(true);
      expect(await offlineDb.syncMeta.get(KEY)).toEqual(a);
      expect((await manager().replacements()).items).toHaveLength(1);
    });
    it('omits a target that no longer needs restoration', async () => {
      deleted = false;
      expect((await manager().replacements()).items).toEqual([]);
      if (domain === 'batch') expect(observation).not.toHaveBeenCalled();
    });
    it('fails closed when fresh terminal proof is unavailable', async () => {
      rpc.mockRejectedValue(Error('Offline'));
      const a = await offlineDb.syncMeta.get(KEY);
      await expect(manager().replacements()).rejects.toThrow('Offline');
      expect(await offlineDb.syncMeta.get(KEY)).toEqual(a);
    });
    it('fails closed for a changed archived original', async () => {
      const a = (await offlineDb.syncMeta.get(KEY))!;
      const archive = a.familyPackingTerminalArchive as { entries: Array<{ row: { attempts: number } }> };
      archive.entries[0].row.attempts++;
      await offlineDb.syncMeta.put(a);
      await expect(manager().replacements()).rejects.toBeDefined();
    });
    it('refuses an unknown archive format without rewriting bytes', async () => {
      const a = (await offlineDb.syncMeta.get(KEY))!;
      (a.familyPackingTerminalArchive as { version: number }).version = 99;
      await offlineDb.syncMeta.put(a);
      await expect(manager().replacements()).rejects.toBeDefined();
      expect(await offlineDb.syncMeta.get(KEY)).toEqual(a);
    });
    it('does not grant new authority to old qualification', async () => {
      await expect(manager(false).replacements()).rejects.toBeDefined();
    });
    it('retires after the current owner changes', async () => {
      const held = manager();
      current = false;
      await expect(held.replacements()).rejects.toBeDefined();
    });
    it('does not offer a replacement while any executable original remains', async () => {
      const other = structuredClone(p);
      other.command.operation_id = crypto.randomUUID();
      await retainPackingIntent(captureWriteSession(), other, native);
      expect((await manager().replacements()).items).toEqual([]);
    });
    if (domain === 'item') {
      it('skips an already-live target but still discovers the next cancelled restore', async () => {
        const first = structuredClone(p);
        const firstTarget = first.command.target_id;
        if (!firstTarget) throw Error('Missing fixture target');
        p = structuredClone(p);
        p.command.operation_id = crypto.randomUUID();
        p.command.target_id = crypto.randomUUID();
        await retainPackingIntent(captureWriteSession(), p, native);
        await (await manager().prepare(p.command.operation_id)).cancel();
        rpc.mockImplementation(async (_name, args) =>
          terminalProof(args.p_operation_id === first.command.operation_id ? first : p, 'cancelled')
        );
        list.mockImplementation(async () => ({
          ...canonicalPackingList(p.command.scope, true),
          items: [canonicalPackingRow({ id: firstTarget })],
        }));
        trash.mockClear();
        const archive = await offlineDb.syncMeta.get(KEY);
        expect((await manager().replacements()).items).toEqual([
          { id: p.command.operation_id, action: p.command.action },
        ]);
        expect(trash).toHaveBeenCalledTimes(1);
        expect(await offlineDb.syncMeta.get(KEY)).toEqual(archive);
        expect(await offlineDb.mutationQueue.count()).toBe(0);
      });
      it('rejects owner invalidation during an already-live lookup without rewriting retained work', async () => {
        const archive = await offlineDb.syncMeta.get(KEY);
        const target = p.command.target_id;
        if (!target) throw Error('Missing fixture target');
        list.mockResolvedValueOnce(canonicalPackingList(p.command.scope, true)).mockImplementation(async () => {
          current = false;
          return {
            ...canonicalPackingList(p.command.scope, true),
            items: [canonicalPackingRow({ id: target })],
          };
        });
        await expect(manager().replacements()).rejects.toMatchObject({ status: 409 });
        expect(trash).not.toHaveBeenCalled();
        expect(await offlineDb.syncMeta.get(KEY)).toEqual(archive);
        expect(await offlineDb.mutationQueue.count()).toBe(0);
      });
    }
    if (domain === 'batch')
      it('paginates authenticated archive entries without silently dropping the next page', async () => {
        rpc.mockImplementation(async (_name, args) => {
          const original = structuredClone(p);
          original.command.operation_id = String(args.p_operation_id);
          return terminalProof(original, 'cancelled');
        });
        for (let n = 1; n < 21; n++) {
          p = structuredClone(p);
          p.command.operation_id = crypto.randomUUID();
          await retainPackingIntent(captureWriteSession(), p, native);
          await (await manager().prepare(p.command.operation_id)).cancel();
        }
        const first = await manager().replacements();
        expect(first.items).toHaveLength(20);
        expect(first.next_offset).toBe(20);
        const second = await manager().replacements(() => true, first.next_offset!);
        expect(second.items).toHaveLength(1);
        expect(second.next_offset).toBeNull();
        expect(first.items.map((i) => i.id)).not.toContain(second.items[0].id);
      });
    it('validates pagination bounds', async () => {
      for (const n of [-1, 0.5, Number.MAX_SAFE_INTEGER])
        await expect(manager().replacements(() => true, n)).rejects.toBeDefined();
    });
  });
