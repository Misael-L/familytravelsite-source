import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import {
  bagAck,
  bagCreate,
  bagMembers,
  bagReceipt,
  bagRestore,
  bagTrash,
  bagUpdate,
} from '../../../tests/helpers/familyPackingBags';
import { itemV2 } from '../../../tests/helpers/familyPackingCategoryV2';
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
import { createPackingBagCommandHandler } from './packingBagCommandHandler';
import { PackingBagCommandSession } from './packingBagCommandSession';
import { type PackingBagEnvelope } from './packingBagContract';
import { createPackingBagTransport, type PackingBagRpc } from './packingBagTransport';
import { acknowledgePackingIntent, packingIntentUrl, retainPackingIntent } from './packingIntentQueue';
import { createPlannerPackingRecovery } from './plannerPackingRecovery';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const rpc = vi.fn<PackingBagRpc>(),
  previousAdapter = api.defaults.adapter;
let repo: FamilyFrontendRepository,
  packet: PackingBagEnvelope,
  native: number,
  session: FamilySession,
  source: string,
  current: boolean,
  allowed: boolean,
  stop: () => void,
  proof: 'unknown' | 'visible' | 'redacted';
const channel = (editorCurrent?: () => boolean) =>
  new PackingBagCommandSession(
    repo,
    { source: () => source, disposed: () => !current, current: editorCurrent },
    packet,
    createPackingBagTransport(rpc)
  );
const recover = () =>
  createPlannerPackingRecovery(
    repo,
    packet.command.scope.trip_id,
    { source: () => source, current: () => current },
    undefined,
    { bagRpc: rpc }
  );
const retained = () => offlineDb.mutationQueue.get(packet.command.operation_id);
for (const factory of [bagCreate, bagUpdate, bagMembers, bagTrash, bagRestore])
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
        if (name.includes('receipt')) return bagReceipt(packet, proof);
        return bagAck(packet);
      });
      api.defaults.adapter = createFamilyAxiosAdapter(
        createPackingBagCommandHandler(
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
      rpc.mockResolvedValueOnce(bagAck(original));
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
        resolve(bagAck(packet));
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
      expect(rpc.mock.calls[0][0]).toContain('receipt_v1');
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
          version: 1,
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
        url: packingIntentUrl(packet) + '/unsupported',
      });
      expect(await recover().inspect()).toBeNull();
      await mutationQueue.flush();
      expect(await retained()).toBeDefined();
    });
  });
function required<T>(value: T | null | undefined): T {
  if (value == null) throw Error('Original required');
  return value;
}

// Each additional case uses the same explicit writer environment as the five action cohorts.
describe('bag cancellation and dependency ownership', () => {
  beforeEach(async () => {
    resetAllStores();
    await resetOfflineTestDatabase();
    installTestLocks();
    _resetNetworkMode();
    setAuthed(true);
    packet = bagRestore();
    source = packet.source_url;
    current = allowed = true;
    proof = 'unknown';
    const s = packet.command.scope;
    session = {
      userId: s.user_id,
      personId: s.person_id,
      familyId: s.family_id,
      user: { username: 'Bag SDK', email: 'sdk@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
    };
    repo = new FamilyFrontendRepository(
      async () => session,
      undefined,
      () => ({ userId: session.userId, personId: session.personId, familyId: session.familyId, source })
    );
    await repo.session();
    native = (await repo.views()).ids.register('trip', s.trip_id);
    useTripStore.setState({ trip: { id: native, title: 'Original', user_id: 0 } as never });
    rpc
      .mockReset()
      .mockImplementation(async (name) => (name.includes('receipt') ? bagReceipt(packet, proof) : bagAck(packet)));
    api.defaults.adapter = createFamilyAxiosAdapter(
      createPackingBagCommandHandler(
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
  it('refuses the retired bag editor even while its Trip, account and source are current', async () => {
    let editorCurrent = true;
    const session = channel(() => editorCurrent);
    editorCurrent = false;

    await expect(session.submit()).rejects.toMatchObject({ code: 'packing_session_changed' });
    await expect(session.reconcile()).rejects.toMatchObject({ code: 'packing_session_changed' });
    expect(await retained()).toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('cancel before send has no queue/network effect', async () => {
    const c = channel();
    current = false;
    await expect(c.submit()).rejects.toBeDefined();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('aborting a request after server commit leaves the original queue entry for typed reconciliation', async () => {
    const controller = new AbortController();
    rpc.mockImplementationOnce(async () => {
      controller.abort();
      return bagAck(packet);
    });
    await retainPackingIntent(captureWriteSession(), packet, native);
    const before = await retained();
    await expect(
      api.post(packingIntentUrl(packet), packet, {
        signal: controller.signal,
        headers: { 'X-Idempotency-Key': packet.command.operation_id },
      })
    ).rejects.toBeDefined();
    expect(await retained()).toEqual(before);
    proof = 'visible';
    expect(await channel().reconcile()).toBe('committed');
  });
  it('dependency409 retains the exact command and never clears references or auto-restores another parent', async () => {
    rpc.mockRejectedValueOnce({ code: 'PT409' });
    await expect(channel().submit()).rejects.toHaveProperty('status', 409);
    expect((await retained())?.body).toEqual(packet);
    expect((await retained())?.status).toBe('conflict');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('an older item/batch operation blocks parent restoration until an explicit dependency workflow resolves it', async () => {
    const original = itemV2();
    original.command.operation_id = id(777);
    original.command.scope = structuredClone(packet.command.scope);
    await retainPackingIntent(captureWriteSession(), original, native);
    const before = await offlineDb.mutationQueue.toArray();
    await expect(channel().submit()).rejects.toHaveProperty('code', 'packing_older_work');
    expect(await offlineDb.mutationQueue.toArray()).toEqual(before);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('saved read-only leases cannot create writable bag observations or consume originals', async () => {
    await retainPackingIntent(captureWriteSession(), packet, native);
    const before = await retained();
    const { installReadOnlySession } = await import('../../db/readOnlySession');
    const release = installReadOnlySession();
    try {
      expect(() => channel()).toThrow();
      expect(await retained()).toEqual(before);
      expect(rpc).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });
});
