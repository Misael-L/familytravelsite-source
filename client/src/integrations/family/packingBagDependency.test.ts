import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalPackingRow, packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import { bagAck, bagObservation, bagReceipt } from '../../../tests/helpers/familyPackingBags';
import { aggregateAck, aggregateRestore } from '../../../tests/helpers/familyPackingCategoryAggregate';
import { canonicalPackingAck } from '../../../tests/helpers/familyPackingCommands';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api from '../../api/client';
import type { QueuedMutation } from '../../db/offlineDb';
import { deleteCurrentUserDb, invalidateOfflineSession, offlineDb, reopenForUser } from '../../db/offlineDb';
import { installReadOnlySession } from '../../db/readOnlySession';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { acquireQueueLock } from '../../sync/queueLock';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { prepareRetainedWorkExport } from '../../sync/retainedRecovery';
import { captureWriteSession } from '../../sync/writeSession';
import { createPackingBagCommandHandler } from './packingBagCommandHandler';
import { packingBagEnvelope, type PackingBagEnvelope } from './packingBagContract';
import { PackingBagDependency } from './packingBagDependency';
import {
  packingDependencyDescriptor,
  packingDependencyHash,
  type PackingDependencyChild,
} from './packingBagDependencyContract';
import { createPackingBagTransport, type PackingBagRpc } from './packingBagTransport';
import {
  createPackingCategoryAggregateTransport,
  type PackingCategoryAggregateRpc,
} from './packingCategoryAggregateTransport';
import { packingEnvelope, packingJson } from './packingCommandContract';
import { PackingCommandSession } from './packingCommandSession';
import { acknowledgePackingIntent, retainPackingIntent } from './packingIntentQueue';
import { createPackingTransport, type PackingRpc } from './packingTransport';
import { createPlannerPackingRecovery } from './plannerPackingRecovery';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const bagRpc = vi.fn<PackingBagRpc>(),
  itemsRpc = vi.fn<PackingRpc>(),
  aggregateRpc = vi.fn<PackingCategoryAggregateRpc>();
let repo: FamilyFrontendRepository,
  child: PackingDependencyChild,
  native: number,
  session: FamilySession,
  source: string,
  current: boolean,
  allowed: boolean,
  stop: () => void,
  collection: number;
let childProof: 'unknown' | 'visible' | 'redacted',
  parentProof: 'unknown' | 'visible' | 'redacted',
  loseReply: boolean,
  retireReply: boolean;
let originalRow: QueuedMutation | undefined;
const previous = api.defaults.adapter;
const deps = () =>
  new PackingBagDependency(
    repo,
    child.command.scope.trip_id,
    { source: () => source, current: () => current },
    {
      bags: createPackingBagTransport(bagRpc),
      items: createPackingTransport(itemsRpc),
      aggregates: createPackingCategoryAggregateTransport(aggregateRpc),
    }
  );
const recovery = () =>
  createPlannerPackingRecovery(
    repo,
    child.command.scope.trip_id,
    { source: () => source, current: () => current },
    itemsRpc,
    { bagRpc, categoryAggregateRpc: aggregateRpc }
  );
const pair = async () =>
  (await offlineDb.mutationQueue.toArray()).find((r) => r.familyPackingDependency)?.body as PackingBagEnvelope;
const trashItem = () =>
  canonicalPackingRow({ deleted_at: '2026-11-12T12:00:00.123456+00:00', deleted_by_person_id: id(4) });
async function prepare() {
  const p = await deps().prepare(id(6));
  if (p.status !== 'prepared') throw Error('Prepared parent required');
  return p;
}
async function retainedPair() {
  const p = await prepare();
  loseReply = true;
  await expect(p.submit()).rejects.toThrow('lost reply');
  loseReply = false;
  return p;
}
for (const batch of [false, true])
  describe(batch ? 'category-batch dependency' : 'single-item dependency', () => {
    beforeEach(async () => {
      resetAllStores();
      await reopenForUser(88003);
      await resetOfflineTestDatabase();
      installTestLocks();
      _resetNetworkMode();
      setAuthed(true);
      current = allowed = true;
      loseReply = retireReply = false;
      childProof = parentProof = 'unknown';
      child = batch
        ? aggregateRestore()
        : packingEnvelope.parse({
            version: 1,
            source_url: 'http://127.0.0.1:55831',
            view_layer: 'published',
            command: {
              version: 1,
              operation_id: id(100),
              scope: bagObservation().scope,
              action: 'restore',
              target_id: id(5),
              expected_revision: 3,
              expected_collection_revision: null,
              values: {},
            },
          });
      child.source_url = 'http://127.0.0.1:55831';
      source = child.source_url;
      collection = child.version === 3 ? child.command.expected_collection_revision! : 7;
      const s = child.command.scope;
      session = {
        userId: s.user_id,
        familyId: s.family_id,
        personId: s.person_id,
        user: { username: 'Synthetic', email: 'fixture@fixture.invalid', avatar_url: null, created_at: '2026-11-12' },
      };
      repo = new FamilyFrontendRepository(
        async () => session,
        undefined,
        () => ({ userId: session.userId, familyId: session.familyId, personId: session.personId, source })
      );
      await repo.session();
      native = (await repo.views()).ids.register('trip', s.trip_id);
      useTripStore.setState({ trip: { id: native, title: 'Dependency fixture', user_id: 0 } as never });
      itemsRpc.mockReset().mockImplementation(async (name) => {
        if (!allowed) throw { code: '42501' };
        if (name.includes('receipt'))
          return {
            version: 1,
            trip_id: s.trip_id,
            operation_id: child.command.operation_id,
            scope: s,
            status: childProof === 'unknown' ? 'unknown' : 'committed',
            result_redacted: childProof === 'redacted',
            result: childProof === 'visible' ? canonicalPackingAck(child.command as never) : null,
          };
        return { version: 1, scope: s, collection_revision: collection, items: [trashItem()], next_cursor: null };
      });
      aggregateRpc.mockReset().mockImplementation(async (name) => {
        if (!allowed) throw { code: '42501' };
        if (child.version !== 3 || child.command.action !== 'category-restore-batch')
          throw Error('Unexpected aggregate');
        if (name.includes('receipt'))
          return {
            version: 3,
            kind: 'packing-category-aggregate',
            trip_id: s.trip_id,
            operation_id: child.command.operation_id,
            scope: s,
            status: childProof === 'unknown' ? 'unknown' : 'committed',
            result_redacted: childProof === 'redacted',
            result: childProof === 'visible' ? aggregateAck(child) : null,
          };
        return structuredClone(child.command.observed);
      });
      bagRpc.mockReset().mockImplementation(async (name, args) => {
        if (!allowed) throw { code: '42501' };
        if (name.includes('receipt')) return bagReceipt(await pair(), parentProof);
        if (name.startsWith('get'))
          return { ...bagObservation(parentProof !== 'visible'), scope: s, collection_revision: collection };
        const parent = packingBagEnvelope.parse({
          version: 1,
          source_url: source,
          view_layer: 'published',
          command: {
            version: 1,
            kind: 'packing-bag',
            operation_id: args.p_operation_id,
            scope: args.p_scope,
            action: args.p_action,
            target_id: args.p_target_id,
            expected_revision: args.p_expected_revision,
            expected_collection_revision: args.p_expected_collection_revision,
            observed: args.p_observed,
            values: args.p_values,
          },
        });
        parentProof = 'visible';
        if (loseReply) throw Error('Synthetic lost reply');
        if (retireReply) current = false;
        return bagAck(parent);
      });
      api.defaults.adapter = createFamilyAxiosAdapter(
        createPackingBagCommandHandler(
          repo,
          () => source,
          () => !current,
          bagRpc
        )
      );
      stop = installFamilyCommandRetention();
      await retainPackingIntent(captureWriteSession(), child, native);
      await offlineDb.mutationQueue.update(child.command.operation_id, {
        status: 'conflict',
        lastError: 'Original packing command refused; retained intact.',
      });
      originalRow = await offlineDb.mutationQueue.get(child.command.operation_id);
    });
    afterEach(async () => {
      stop();
      api.defaults.adapter = previous;
      _resetNetworkMode();
      setAuthed(false);
      await resetOfflineTestDatabase();
    });
    it('prepares without writes, then acknowledges only parent with original child bytes intact', async () => {
      const p = await prepare();
      expect(await offlineDb.mutationQueue.count()).toBe(1);
      expect(await p.submit()).toBe('committed');
      expect(await offlineDb.mutationQueue.toArray()).toEqual([originalRow]);
      expect(p.original.command.operation_id).not.toBe(child.command.operation_id);
    });
    it('retains pair on real response loss and recovers its exact typed parent receipt after reopening', async () => {
      const p = await retainedPair();
      expect(await offlineDb.mutationQueue.count()).toBe(2);
      expect(await offlineDb.mutationQueue.get(child.command.operation_id)).toEqual(originalRow);
      const pending = await recovery().inspect();
      expect(pending?.action).toBe('bag-restore');
      expect(await pending?.check()).toBe('committed');
      expect(await offlineDb.mutationQueue.toArray()).toEqual([originalRow]);
      expect(bagRpc.mock.calls.filter(([n]) => n.startsWith('execute'))).toHaveLength(1);
      expect(p.original.command.operation_id).toBeDefined();
    });
    it.each(['unknown', 'redacted'] as const)(
      'handles %s parent proof without inferring child success',
      async (proof) => {
        await retainedPair();
        parentProof = proof;
        const pending = await deps().pending();
        expect(await pending?.check()).toBe(proof === 'unknown' ? 'unknown' : 'committed');
        expect(await offlineDb.mutationQueue.get(child.command.operation_id)).toEqual(originalRow);
        expect(await offlineDb.mutationQueue.count()).toBe(proof === 'unknown' ? 2 : 1);
      }
    );
    it('retries same parent UUID after uncertainty and never allocates a replacement', async () => {
      const p = await retainedPair();
      parentProof = 'unknown';
      expect(await (await deps().pending())?.retry()).toBe('committed');
      const writes = bagRpc.mock.calls.filter(([n]) => n.startsWith('execute'));
      expect(writes.map(([, a]) => a.p_operation_id)).toEqual([
        p.original.command.operation_id,
        p.original.command.operation_id,
      ]);
      expect(await offlineDb.mutationQueue.get(child.command.operation_id)).toEqual(originalRow);
    });
    it('serializes double confirmation on one draft', async () => {
      const p = await prepare();
      await Promise.all([p.submit(), p.submit()]);
      expect(bagRpc.mock.calls.filter(([n]) => n.startsWith('execute'))).toHaveLength(1);
    });
    it('exports both exact originals and prevents generic flush or discard', async () => {
      await retainedPair();
      const rows = await offlineDb.mutationQueue.toArray(),
        exported = await prepareRetainedWorkExport();
      expect(exported.blob.size).toBeGreaterThan(0);
      const text = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsText(exported.blob);
      });
      expect(JSON.parse(text).rows.sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id))).toEqual(
        [...rows].sort((a, b) => a.id.localeCompare(b.id))
      );
      expect(JSON.parse(text).automatic_replay).toBe(false);
      await mutationQueue.flush();
      expect(await offlineDb.mutationQueue.toArray()).toEqual(rows);
      await expect(mutationQueue.resolveKeepServer(child.command.operation_id)).rejects.toBeDefined();
      await expect(mutationQueue.resolveKeepMine(child.command.operation_id)).rejects.toBeDefined();
      expect(await offlineDb.mutationQueue.get(child.command.operation_id)).toEqual(originalRow);
    });
    it('does not allow a legacy session to acknowledge a child while the parent remains retained', async () => {
      await retainedPair();
      await expect(acknowledgePackingIntent(captureWriteSession(), child, native, originalRow)).rejects.toBeDefined();
      if (child.version === 1)
        await expect(
          new PackingCommandSession(
            repo,
            { source: () => source, disposed: () => false },
            child,
            createPackingTransport(itemsRpc)
          ).reconcile()
        ).rejects.toBeDefined();
      expect(await offlineDb.mutationQueue.count()).toBe(2);
    });
    it.each(['descriptor', 'digest', 'child', 'parent', 'third', 'format', 'url', 'unknown-key'] as const)(
      'refuses tampered pair %s',
      async (fault) => {
        await retainedPair();
        const parent = (await offlineDb.mutationQueue.toArray()).find((r) => r.familyPackingDependency)!;
        if (fault === 'descriptor')
          await offlineDb.mutationQueue.update(parent.id, { familyPackingDependency: { version: 999 } });
        if (fault === 'digest') {
          const d = packingDependencyDescriptor.parse(parent.familyPackingDependency);
          d.child_sha256 = '0'.repeat(64);
          await offlineDb.mutationQueue.update(parent.id, { familyPackingDependency: d });
        }
        if (fault === 'child')
          await offlineDb.mutationQueue.update(child.command.operation_id, { lastError: 'changed' });
        if (fault === 'parent') {
          const body = structuredClone(parent.body) as PackingBagEnvelope;
          body.command.target_id = id(999);
          await offlineDb.mutationQueue.update(parent.id, { body });
        }
        if (fault === 'third') await offlineDb.mutationQueue.add({ ...parent, id: id(999) });
        if (fault === 'format') await offlineDb.mutationQueue.update(parent.id, { schemaVersion: 99 });
        if (fault === 'url') await offlineDb.mutationQueue.update(parent.id, { url: parent.url + '/unknown' });
        if (fault === 'unknown-key') await offlineDb.mutationQueue.update(parent.id, { future: 'unknown' } as never);
        await expect(deps().pending()).rejects.toBeDefined();
        expect(await offlineDb.mutationQueue.count()).toBe(fault === 'third' ? 3 : 2);
      }
    );
    it.each(['source', 'person', 'family', 'account', 'trip', 'layer', 'retire', 'logout', 'read-only'] as const)(
      'retires pending callback on %s',
      async (fault) => {
        await retainedPair();
        const pending = await deps().pending(),
          rows = await offlineDb.mutationQueue.toArray();
        let release = () => {};
        if (fault === 'source') source += '-other';
        if (fault === 'person') session = { ...session, personId: id(990) };
        if (fault === 'family') session = { ...session, familyId: id(991) };
        if (fault === 'account') session = { ...session, userId: id(992) };
        if (fault === 'trip') useTripStore.setState({ trip: { id: 999 } as never });
        if (fault === 'layer') repo.setLayer(child.command.scope.trip_id, 'myDraft');
        if (fault === 'retire') current = false;
        if (fault === 'logout') invalidateOfflineSession();
        if (fault === 'read-only') release = installReadOnlySession();
        try {
          await expect(pending!.check()).rejects.toBeDefined();
        } finally {
          release();
        }
        expect(await offlineDb.mutationQueue.toArray()).toEqual(rows);
      }
    );
    it('refuses permission loss without consuming a pair', async () => {
      await retainedPair();
      allowed = false;
      await expect((await deps().pending())!.check()).rejects.toBeDefined();
      expect(await offlineDb.mutationQueue.count()).toBe(2);
    });
    it('leaves the pair after commit when its owner retires', async () => {
      const p = await prepare();
      retireReply = true;
      await expect(p.submit()).rejects.toBeDefined();
      current = true;
      expect(await (await deps().pending())!.check()).toBe('committed');
      expect(await offlineDb.mutationQueue.toArray()).toEqual([originalRow]);
    });
    it('settles a known committed child before preparing an unnecessary parent', async () => {
      childProof = 'redacted';
      expect((await deps().prepare(id(6))).status).toBe('child-committed');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect(bagRpc).not.toHaveBeenCalled();
    });
    it('refuses a parent when its child observation or bag relation changes', async () => {
      if (child.version === 3 && child.command.action === 'category-restore-batch') {
        child.command.observed.items[0].bag_id = id(900);
        await offlineDb.mutationQueue.update(child.command.operation_id, { body: child });
      } else
        itemsRpc.mockImplementation(async () => ({
          version: 1,
          scope: child.command.scope,
          collection_revision: collection,
          items: [{ ...trashItem(), revision: 9 }],
          next_cursor: null,
        }));
      await expect(deps().prepare(id(6))).rejects.toBeDefined();
      expect(await offlineDb.mutationQueue.count()).toBe(1);
    });
    it('requires online exclusive ownership and cancels a waiting caller', async () => {
      setForcedOffline(true);
      await expect(deps().prepare(id(6))).rejects.toBeDefined();
      setForcedOffline(false);
      const release = await acquireQueueLock(captureWriteSession(), 'exclusive', true);
      const task = deps().prepare(id(6));
      invalidateOfflineSession();
      release?.();
      await expect(task).rejects.toBeDefined();
      expect(await offlineDb.mutationQueue.count()).toBe(1);
    });
    it('does not trust an arbitrary conflict for another bag', async () => {
      await expect(deps().prepare(id(900))).rejects.toBeDefined();
      expect(await offlineDb.mutationQueue.toArray()).toEqual([originalRow]);
    });
    it('binds descriptor hashes to both the envelope and entire original child row', async () => {
      await retainedPair();
      const rows = await offlineDb.mutationQueue.toArray(),
        parent = rows.find((r) => r.familyPackingDependency)!,
        d = packingDependencyDescriptor.parse(parent.familyPackingDependency);
      expect(d.child_sha256).toBe(await packingDependencyHash(child));
      expect(d.child_row_sha256).toBe(await packingDependencyHash(originalRow));
      expect(packingJson(rows.find((r) => r.id === child.command.operation_id))).toBe(packingJson(originalRow));
    });
    it('preserves both exact queue rows across real logout database cleanup and reopen', async () => {
      await retainedPair();
      const rows = await offlineDb.mutationQueue.toArray(),
        old = await deps().pending();
      await deleteCurrentUserDb();
      await reopenForUser(88003);
      expect(await offlineDb.mutationQueue.toArray()).toEqual(rows);
      await expect(old!.check()).rejects.toBeDefined();
      expect(await (await deps().pending())!.check()).toBe('committed');
      expect(await offlineDb.mutationQueue.toArray()).toEqual([originalRow]);
    });
    it('leaves parent and child intact after a real refusal instead of converting it into a new intent', async () => {
      const p = await prepare();
      bagRpc.mockImplementation(async (name) => {
        if (name.startsWith('execute')) throw { code: 'PT409' };
        if (name.includes('receipt')) return bagReceipt(await pair(), 'unknown');
        return { ...bagObservation(true), scope: child.command.scope, collection_revision: collection };
      });
      await expect(p.submit()).rejects.toBeDefined();
      expect(await offlineDb.mutationQueue.count()).toBe(2);
      expect(await offlineDb.mutationQueue.get(child.command.operation_id)).toEqual(originalRow);
      expect((await pair()).command.operation_id).toBe(p.original.command.operation_id);
    });
    it('does not retry the parent when its child committed elsewhere during uncertainty', async () => {
      await retainedPair();
      childProof = 'redacted';
      parentProof = 'unknown';
      const before = bagRpc.mock.calls.filter(([n]) => n.startsWith('execute')).length;
      await expect((await deps().pending())!.retry()).rejects.toBeDefined();
      expect(bagRpc.mock.calls.filter(([n]) => n.startsWith('execute'))).toHaveLength(before);
      expect(await offlineDb.mutationQueue.count()).toBe(2);
    });
    it('preserves child and invalidates a draft if its confirmation view closes', async () => {
      let visible = true;
      const p = await deps().prepare(id(6), () => visible);
      if (p.status !== 'prepared') throw Error();
      visible = false;
      await expect(p.submit()).rejects.toBeDefined();
      expect(await offlineDb.mutationQueue.toArray()).toEqual([originalRow]);
    });
    it('guards two separately opened drafts under the same exclusive queue owner lock', async () => {
      const a = await prepare(),
        b = await prepare();
      const settled = await Promise.allSettled([a.submit(), b.submit()]);
      expect(settled.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
      expect(bagRpc.mock.calls.filter(([n]) => n.startsWith('execute'))).toHaveLength(1);
      expect(await offlineDb.mutationQueue.toArray()).toEqual([originalRow]);
    });
    it('keeps unsupported dependency metadata and referenced child out of background replay even if status is tampered', async () => {
      await retainedPair();
      const rows = await offlineDb.mutationQueue.toArray(),
        p = rows.find((r) => r.familyPackingDependency)!;
      await offlineDb.mutationQueue.update(p.id, {
        familyPackingDependency: { version: 999, child_operation_id: child.command.operation_id },
      });
      await offlineDb.mutationQueue.update(child.command.operation_id, { status: 'pending' });
      const before = await offlineDb.mutationQueue.toArray(),
        count = bagRpc.mock.calls.length;
      await mutationQueue.flush();
      expect(await offlineDb.mutationQueue.toArray()).toEqual(before);
      expect(bagRpc.mock.calls).toHaveLength(count);
    });
    it('detects adding a present undefined field without consuming the original row', async () => {
      await retainedPair();
      await offlineDb.mutationQueue.put({ ...originalRow!, retryAfter: undefined });
      await expect(deps().pending()).rejects.toBeDefined();
      expect(await offlineDb.mutationQueue.count()).toBe(2);
    });
    it.each(['syncing', 'failed'] as const)(
      'preserves a tampered %s dependency during generic normalization and retry',
      async (status) => {
        await retainedPair();
        await offlineDb.mutationQueue.update(child.command.operation_id, { status, syncingSince: 0 });
        const before = await offlineDb.mutationQueue.toArray();
        await mutationQueue.flush();
        await mutationQueue.retryFailed();
        expect(await offlineDb.mutationQueue.toArray()).toEqual(before);
      }
    );
  });

describe('stable lossless dependency identity', () => {
  it('ignores object insertion order while preserving arrays and present undefined', async () => {
    expect(await packingDependencyHash({ b: 2, a: 1 })).toBe(await packingDependencyHash({ a: 1, b: 2 }));
    expect(await packingDependencyHash({ a: undefined })).not.toBe(await packingDependencyHash({}));
    expect(await packingDependencyHash(['undefined'])).not.toBe(await packingDependencyHash([undefined]));
    expect(await packingDependencyHash([1, 2])).not.toBe(await packingDependencyHash([2, 1]));
  });
});
