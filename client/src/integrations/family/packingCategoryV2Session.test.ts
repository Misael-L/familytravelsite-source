import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import { ackV2, itemV2, lifecycleV2, snapshotV2 } from '../../../tests/helpers/familyPackingCategoryV2';
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
import { PackingCategoryV2Cohort } from './packingCategoryV2Cohort';
import { createPackingCategoryV2CommandHandler } from './packingCategoryV2CommandHandler';
import { PackingCategoryV2CommandSession } from './packingCategoryV2CommandSession';
import { packingCategoryV2Envelope, type PackingCategoryV2Envelope } from './packingCategoryV2Contract';
import { createPackingCategoryV2Transport, type PackingCategoryV2Rpc } from './packingCategoryV2Transport';
import { acknowledgePackingIntent, packingIntentUrl, retainPackingIntent } from './packingIntentQueue';
import { createPlannerPackingRecovery } from './plannerPackingRecovery';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const rpc = vi.fn<PackingCategoryV2Rpc>(),
  previousAdapter = api.defaults.adapter;
let repo: FamilyFrontendRepository,
  packet: PackingCategoryV2Envelope,
  native: number,
  session: FamilySession,
  source: string,
  current: boolean,
  allowed: boolean,
  stop: () => void,
  proof: 'unknown' | 'visible' | 'redacted';
let canonical = snapshotV2();
const channel = () =>
  new PackingCategoryV2CommandSession(
    repo,
    { source: () => source, disposed: () => !current },
    packet,
    createPackingCategoryV2Transport(rpc)
  );
const recover = () =>
  createPlannerPackingRecovery(
    repo,
    packet.command.scope.trip_id,
    { source: () => source, current: () => current },
    undefined,
    { categoryV2Rpc: rpc }
  );
const retained = () => offlineDb.mutationQueue.get(packet.command.operation_id);
const cohort = () =>
  new PackingCategoryV2Cohort(
    repo,
    { source: () => source, disposed: () => !current },
    createPackingCategoryV2Transport(rpc)
  );
for (const factory of [lifecycleV2, itemV2])
  describe(factory.name + ' owned persistence/handler/recovery', () => {
    beforeEach(async () => {
      resetAllStores();
      await resetOfflineTestDatabase();
      installTestLocks();
      _resetNetworkMode();
      setAuthed(true);
      packet = factory();
      canonical = snapshotV2();
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
        if (name === 'get_family_trip_packing_with_categories_v2') return structuredClone(canonical);
        if (name.includes('receipt'))
          return {
            version: 2,
            kind: packet.command.kind,
            trip_id: s.trip_id,
            operation_id: packet.command.operation_id,
            scope: { ...s, trip_lifecycle_revision: s.trip_lifecycle_revision + 1 },
            status: proof === 'unknown' ? 'unknown' : 'committed',
            result_redacted: proof === 'redacted',
            result: proof === 'visible' ? ackV2(packet) : null,
          };
        return ackV2(packet);
      });
      api.defaults.adapter = createFamilyAxiosAdapter(
        createPackingCategoryV2CommandHandler(
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
    it('clones original intent before asynchronous caller mutation', async () => {
      const c = channel(),
        original = structuredClone(packet);
      Object.assign(packet.command.values, { name: 'Borrowed' });
      rpc.mockResolvedValueOnce(ackV2(original));
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
        resolve(ackV2(packet));
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
      expect(rpc.mock.calls[0][0]).toContain('receipt_v2');
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
          version: 2,
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
    it('refuses a v2 body on a wrong typed route before dispatch', async () => {
      const route = packingIntentUrl(packet).replace(
        /category-(lifecycle|items)-v2$/,
        packet.command.kind === 'packing-category-item' ? 'category-lifecycle-v2' : 'category-items-v2'
      );
      const resolveTrip = vi.spyOn(repo, 'tripUuid');
      await expect(
        api.post(route, packet, { headers: { 'X-Idempotency-Key': packet.command.operation_id } })
      ).rejects.toMatchObject({ response: { status: 400, data: { code: 'packing_v2_domain' } } });
      expect(resolveTrip).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });
    it('does not consume unsupported original queue bodies or a mismatched domain receipt', async () => {
      await retainPackingIntent(captureWriteSession(), packet, native);
      const before = await retained();
      rpc.mockResolvedValueOnce({ version: 1, kind: 'packing-category' });
      await expect(channel().reconcile()).rejects.toBeDefined();
      expect(await retained()).toEqual(before);
      await offlineDb.mutationQueue.update(packet.command.operation_id, {
        url: packingIntentUrl(packet).replace('-v2', '-v999'),
      });
      expect(await recover().inspect()).toBeNull();
      await mutationQueue.flush();
      expect(await retained()).toBeDefined();
    });
    it('holds one coupled generation and discards a slower read after newer publication', async () => {
      const c = cohort();
      await c.load(packet.command.scope.trip_id);
      const before = useTripStore.getState().packingItems;
      const saved = required(c.snapshot());
      saved.categories[0].name = 'Borrowed';
      expect(c.snapshot()?.categories[0].name).toBe('Gear');
      let resolve!: (raw: unknown) => void;
      rpc.mockImplementationOnce(
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
      expect(useTripStore.getState().packingItems).toBe(before);
      current = false;
      expect(c.snapshot()).toBeNull();
    });
    it('accepts only a fresh coupled read after a commitment; never publishes its historical category', async () => {
      const c = cohort();
      await c.load(packet.command.scope.trip_id);
      await c.submit(packet);
      expect(c.snapshot()).toEqual(canonical);
      expect(c.snapshot()?.categories.some((x) => x.id === id(21))).toBe(false);
      expect(packingCategoryV2Envelope.parse(packet)).toEqual(packet);
    });
  });

function required<T>(value: T | null | undefined): T {
  if (value == null) throw Error('Required original observation missing');
  return value;
}
