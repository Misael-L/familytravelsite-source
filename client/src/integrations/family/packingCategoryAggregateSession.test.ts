import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import {
  aggregateAck,
  aggregateReorder,
  aggregateRestore,
  aggregateTrash,
} from '../../../tests/helpers/familyPackingCategoryAggregate';
import { itemV2, snapshotV2 } from '../../../tests/helpers/familyPackingCategoryV2';
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
import { PackingCategoryAggregateCohort } from './packingCategoryAggregateCohort';
import { createPackingCategoryAggregateCommandHandler } from './packingCategoryAggregateCommandHandler';
import { PackingCategoryAggregateCommandSession } from './packingCategoryAggregateCommandSession';
import { type PackingCategoryAggregateEnvelope } from './packingCategoryAggregateContract';
import {
  createPackingCategoryAggregateTransport,
  type PackingCategoryAggregateRpc,
} from './packingCategoryAggregateTransport';
import { createPackingCategoryV2Transport, type PackingCategoryV2Rpc } from './packingCategoryV2Transport';
import { acknowledgePackingIntent, packingIntentUrl, retainPackingIntent } from './packingIntentQueue';
import { createPlannerPackingRecovery } from './plannerPackingRecovery';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const rpc = vi.fn<PackingCategoryAggregateRpc>(),
  previousAdapter = api.defaults.adapter;
let repo: FamilyFrontendRepository,
  packet: PackingCategoryAggregateEnvelope,
  native: number,
  session: FamilySession,
  source: string,
  current: boolean,
  allowed: boolean,
  stop: () => void,
  proof: 'unknown' | 'visible' | 'redacted';
const channel = (editorCurrent?: () => boolean) =>
  new PackingCategoryAggregateCommandSession(
    repo,
    { source: () => source, disposed: () => !current, current: editorCurrent },
    packet,
    createPackingCategoryAggregateTransport(rpc)
  );
const recover = () =>
  createPlannerPackingRecovery(
    repo,
    packet.command.scope.trip_id,
    { source: () => source, current: () => current },
    undefined,
    { categoryAggregateRpc: rpc }
  );
const retained = () => offlineDb.mutationQueue.get(packet.command.operation_id);
for (const factory of [aggregateTrash, aggregateRestore, aggregateReorder])
  describe(factory.name + ' owned persistence/handler/recovery', () => {
    beforeEach(async () => {
      resetAllStores();
      await resetOfflineTestDatabase();
      installTestLocks();
      _resetNetworkMode();
      setAuthed(true);
      packet = factory();
      source = packet.source_url;
      current = allowed = true;
      proof = 'unknown';
      const s = packet.command.scope;
      session = {
        userId: s.user_id,
        personId: s.person_id,
        familyId: s.family_id,
        user: { username: 'Category SDK', email: 'sdk@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
      };
      repo = new FamilyFrontendRepository(
        async () => session,
        undefined,
        () => ({ userId: session.userId, personId: session.personId, familyId: session.familyId, source })
      );
      await repo.session();
      native = (await repo.views()).ids.register('trip', s.trip_id);
      useTripStore.setState({ trip: { id: native, title: 'Synthetic original', user_id: 0 } as never });
      rpc.mockReset().mockImplementation(async (name) => {
        if (!allowed) throw { code: '42501' };
        if (name.includes('receipt'))
          return {
            version: 3,
            kind: packet.command.kind,
            trip_id: s.trip_id,
            operation_id: packet.command.operation_id,
            scope: { ...s, trip_lifecycle_revision: s.trip_lifecycle_revision + 1 },
            status: proof === 'unknown' ? 'unknown' : 'committed',
            result_redacted: proof === 'redacted',
            result: proof === 'visible' ? aggregateAck(packet) : null,
          };
        return aggregateAck(packet);
      });
      api.defaults.adapter = createFamilyAxiosAdapter(
        createPackingCategoryAggregateCommandHandler(
          repo,
          () => source,
          () => !current,
          rpc
        )
      );
      stop = installFamilyCommandRetention();
    });
    afterEach(async () => {
      stop();
      api.defaults.adapter = previousAdapter;
      vi.restoreAllMocks();
      _resetNetworkMode();
      setAuthed(false);
      await resetOfflineTestDatabase();
    });
    it('coalesces submits and never publishes acknowledgement as cache/native state', async () => {
      const c = channel(),
        before = useTripStore.getState().packingItems;
      await Promise.all([c.submit(), c.submit()]);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(await retained()).toBeUndefined();
      expect(useTripStore.getState().packingItems).toBe(before);
      expect(await offlineDb.packingItems.count()).toBe(0);
    });
    it('preserves the retained command after its category editor retires', async () => {
      let editorCurrent = true;
      const commandSession = channel(() => editorCurrent);
      await retainPackingIntent(captureWriteSession(), packet, native);
      const before = await retained();

      editorCurrent = false;
      await expect(commandSession.reconcile()).rejects.toMatchObject({ code: 'packing_session_changed' });
      expect(await retained()).toEqual(before);
      expect(rpc).not.toHaveBeenCalled();
    });
    it('clones original intent before asynchronous caller mutation', async () => {
      const c = channel(),
        original = structuredClone(packet);
      Object.assign(packet.command.values, { name: 'Borrowed' });
      rpc.mockResolvedValueOnce(aggregateAck(original));
      await c.submit();
      expect(rpc.mock.calls[0][1].p_values).toEqual(original.command.values);
    });
    it('retains originals offline, refuses background replay, and explicitly submits the same operation', async () => {
      const c = channel();
      setForcedOffline(true);
      await expect(c.submit()).rejects.toBeDefined();
      const before = await retained();
      setForcedOffline(false);
      await mutationQueue.flush();
      expect(await retained()).toEqual(before);
      expect(rpc).not.toHaveBeenCalled();
      await c.submit();
      expect(await retained()).toBeUndefined();
      expect(rpc.mock.calls[0][1].p_operation_id).toBe(packet.command.operation_id);
    });
    it.each(['source', 'trip', 'layer', 'person', 'account', 'logout', 'disposed'])(
      'keeps unresolved work when %s changes during a slow reply',
      async (kind) => {
        let resolve!: (raw: unknown) => void;
        rpc.mockImplementationOnce(
          () =>
            new Promise((r) => {
              resolve = r;
            })
        );
        const pending = channel().submit();
        await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
        const before = await retained();
        if (kind === 'source') source = 'https://elsewhere.fixture.invalid';
        if (kind === 'trip') useTripStore.setState({ trip: { id: native + 1 } as never });
        if (kind === 'layer') repo.setLayer(packet.command.scope.trip_id, 'myDraft');
        if (kind === 'person') session = { ...session, personId: id(700) };
        if (kind === 'account') session = { ...session, userId: id(700) };
        if (kind === 'logout') invalidateOfflineSession();
        if (kind === 'disposed') current = false;
        resolve(aggregateAck(packet));
        await expect(pending).rejects.toBeDefined();
        if (kind !== 'logout') expect(await retained()).toEqual(before);
      }
    );
    it.each(['visible', 'redacted'] as const)('reconciles %s commitment without executing or publishing', async (p) => {
      await retainPackingIntent(captureWriteSession(), packet, native);
      proof = p;
      const before = useTripStore.getState().packingItems;
      expect(await channel().reconcile()).toBe('committed');
      expect(await retained()).toBeUndefined();
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc.mock.calls[0][0]).toContain('receipt_v3');
      expect(useTripStore.getState().packingItems).toBe(before);
    });
    it('startup recovery preserves unknown then explicitly retries its unchanged domain and intent', async () => {
      await retainPackingIntent(captureWriteSession(), packet, native);
      const before = await retained();
      const original = await recover().inspect();
      expect(original).not.toBeNull();
      expect(await required(original).check()).toBe('unknown');
      expect(await retained()).toEqual(before);
      expect(await required(original).retry()).toBe('committed');
      expect(await retained()).toBeUndefined();
      expect(rpc.mock.calls.filter(([name]) => name.startsWith('execute'))).toHaveLength(1);
    });
    it('recovery and exact retry do not rebase after a stale collection or root lifecycle refusal', async () => {
      await retainPackingIntent(captureWriteSession(), packet, native);
      const original = await recover().inspect();
      rpc.mockImplementation(async (name) => {
        if (name.startsWith('execute')) throw { code: 'PT409' };
        return {
          version: 3,
          kind: packet.command.kind,
          trip_id: packet.command.scope.trip_id,
          operation_id: packet.command.operation_id,
          scope: packet.command.scope,
          status: 'unknown',
          result_redacted: false,
          result: null,
        };
      });
      await expect(required(original).retry()).rejects.toBeDefined();
      expect((await retained())?.status).toBe('conflict');
      expect((await retained())?.body).toEqual(packet);
    });
    it('parks authority refusal but retains session-expiry and lost-response uncertainty', async () => {
      rpc.mockRejectedValueOnce({ code: 'PGRST301' });
      await expect(channel().submit()).rejects.toBeDefined();
      const before = await retained();
      expect(before?.status).toBe('pending');
      rpc.mockRejectedValueOnce(new Error('Lost response'));
      await expect(channel().submit()).rejects.toBeDefined();
      expect(await retained()).toEqual(before);
      allowed = false;
      await expect(channel().submit()).rejects.toBeDefined();
      expect((await retained())?.status).toBe('failed');
      expect((await retained())?.body).toEqual(packet);
    });
    it('preserves exact older typed intent bytes on a cross-domain operation collision', async () => {
      const older = itemV2();
      older.command.operation_id = packet.command.operation_id;
      older.command.scope = structuredClone(packet.command.scope);
      await retainPackingIntent(captureWriteSession(), older, native);
      const before = await retained();
      await expect(retainPackingIntent(captureWriteSession(), packet, native)).rejects.toBeDefined();
      expect(await retained()).toEqual(before);
      expect((await retained())?.body).toEqual(older);
      await acknowledgePackingIntent(captureWriteSession(), older, native, before);
      await retainPackingIntent(captureWriteSession(), packet, native);
      const own = await retained();
      await expect(retainPackingIntent(captureWriteSession(), older, native)).rejects.toBeDefined();
      expect(await retained()).toEqual(own);
    });
    it('refuses changed queue rows and shared-operation collisions', async () => {
      await retainPackingIntent(captureWriteSession(), packet, native);
      const before = await retained();
      const changed = structuredClone(packet);
      Object.assign(changed.command.values, { name: 'Second intent' });
      await expect(retainPackingIntent(captureWriteSession(), changed, native)).rejects.toBeDefined();
      await offlineDb.mutationQueue.update(packet.command.operation_id, { attempts: 1 });
      await expect(acknowledgePackingIntent(captureWriteSession(), packet, native, before)).rejects.toBeDefined();
      expect(await retained()).toBeDefined();
    });
    it('refuses an older protocol body on the new typed route before dispatch', async () => {
      const route = packingIntentUrl(packet);
      await expect(
        api.post(route, { ...packet, version: 2 }, { headers: { 'X-Idempotency-Key': packet.command.operation_id } })
      ).rejects.toBeDefined();
      expect(rpc).not.toHaveBeenCalled();
    });
    it('does not consume unsupported original queue bodies or a mismatched domain receipt', async () => {
      await retainPackingIntent(captureWriteSession(), packet, native);
      const before = await retained();
      rpc.mockResolvedValueOnce({ version: 1, kind: 'packing-category' });
      await expect(channel().reconcile()).rejects.toBeDefined();
      expect(await retained()).toEqual(before);
      await offlineDb.mutationQueue.update(packet.command.operation_id, {
        url: packingIntentUrl(packet).replace('-v3', '-v999'),
      });
      expect(await recover().inspect()).toBeNull();
      await mutationQueue.flush();
      expect(await retained()).toBeDefined();
    });

    it('discards slower canonical reads and keeps SDK snapshots separate from native/cache state', async () => {
      const canonical = snapshotV2(),
        read = vi.fn<PackingCategoryV2Rpc>().mockImplementation(async () => structuredClone(canonical));
      const c = new PackingCategoryAggregateCohort(
        repo,
        { source: () => source, disposed: () => !current },
        createPackingCategoryAggregateTransport(rpc),
        createPackingCategoryV2Transport(read)
      );
      await c.load(packet.command.scope.trip_id);
      const nativeRows = useTripStore.getState().packingItems;
      const borrowed = required(c.snapshot());
      borrowed.categories[0].name = 'Borrowed';
      expect(c.snapshot()?.categories[0].name).toBe('Gear');
      let resolve!: (value: unknown) => void;
      read.mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          })
      );
      const slow = c.load(packet.command.scope.trip_id);
      await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
      canonical.categories[0].name = 'Newer';
      await c.load(packet.command.scope.trip_id);
      resolve(snapshotV2());
      await expect(slow).rejects.toBeDefined();
      expect(c.snapshot()?.categories[0].name).toBe('Newer');
      expect(useTripStore.getState().packingItems).toBe(nativeRows);
      c.reset();
      expect(c.snapshot()).toBeNull();
    });
    it('refreshes coupled metadata only after its original commitment, and checks retained view lifetimes', async () => {
      const canonical = snapshotV2(),
        ack = aggregateAck(packet);
      canonical.collection_revision = canonical.packing.collection_revision = ack.collection_revision;
      let view = true;
      const c = new PackingCategoryAggregateCohort(
        repo,
        { source: () => source, disposed: () => !current, current: () => view },
        createPackingCategoryAggregateTransport(rpc),
        createPackingCategoryV2Transport(async () => canonical)
      );
      await c.load(packet.command.scope.trip_id);
      await c.submit(packet);
      expect(c.snapshot()).toEqual(canonical);
      view = false;
      expect(c.snapshot()).toBeNull();
      await expect(c.lane(packet.command.scope.trip_id, 'common')).rejects.toBeDefined();
    });
  });

function required<T>(value: T | null | undefined): T {
  if (value == null) throw Error('Required original observation missing');
  return value;
}
