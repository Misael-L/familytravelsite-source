import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import {
  canonicalPackingGroupAck as ack,
  canonicalPackingGroup as fixture,
} from '../../../tests/helpers/familyPackingGroups';
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
import { packingJson } from './packingCommandContract';
import type { PackingList } from './packingContract';
import { createPackingGroupCommandHandler } from './packingGroupCommandHandler';
import { PackingGroupCommandSession } from './packingGroupCommandSession';
import { packingGroupCommand, type PackingGroupEnvelope } from './packingGroupContract';
import { createPackingGroupTransport, type PackingGroupRpc } from './packingGroupTransport';
import { acknowledgePackingIntent, packingIntentUrl, retainPackingIntent } from './packingIntentQueue';
import { createPackingTransport } from './packingTransport';
import { PlannerCohortPacking } from './plannerCohortPacking';
import { projectPacking } from './plannerPacking';
import { createPlannerPackingRecovery } from './plannerPackingRecovery';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';

let repo: FamilyFrontendRepository,
  packet: PackingGroupEnvelope,
  native: number,
  session: FamilySession,
  source: string,
  current: boolean,
  visible: boolean,
  allowed: boolean,
  proof: 'unknown' | 'visible' | 'redacted',
  stop: () => void;
const oldAdapter = api.defaults.adapter,
  calls: unknown[] = [],
  rpc = vi.fn<PackingGroupRpc>();
const channel = () =>
  new PackingGroupCommandSession(
    repo,
    { source: () => source, disposed: () => !current },
    packet,
    createPackingGroupTransport(rpc)
  );
const recover = () =>
  createPlannerPackingRecovery(
    repo,
    packet.command.scope.trip_id,
    { source: () => source, current: () => current },
    undefined,
    rpc
  );
async function retained() {
  return offlineDb.mutationQueue.get(packet.command.operation_id);
}
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  installTestLocks();
  _resetNetworkMode();
  setAuthed(true);
  packet = fixture();
  source = packet.source_url;
  current = visible = allowed = true;
  proof = 'unknown';
  calls.length = 0;
  const s = packet.command.scope;
  session = {
    userId: s.user_id,
    personId: s.person_id,
    familyId: s.family_id,
    user: { username: 'Group writer', email: 'group@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  };
  repo = new FamilyFrontendRepository(async () => session);
  await repo.session();
  native = (await repo.views()).ids.register('trip', s.trip_id);
  useTripStore.setState({ trip: { id: native, title: 'Original Trip', user_id: 0 } as never });
  rpc.mockReset().mockImplementation(async (name, args) => {
    if (!allowed) throw { code: '42501' };
    if (name === 'get_family_trip_packing_group_receipt_v1')
      return {
        version: 1,
        kind: 'packing-group',
        trip_id: s.trip_id,
        operation_id: args.p_operation_id,
        scope: s,
        status: proof === 'unknown' ? 'unknown' : 'committed',
        result_redacted: proof === 'redacted',
        result: proof === 'visible' ? ack(packet) : null,
      };
    const command = packingGroupCommand.parse({
      ...packet.command,
      scope: args.p_scope,
      operation_id: args.p_operation_id,
      action: args.p_action,
      expected_collection_revision: args.p_expected_collection_revision,
      selector: args.p_selector,
      observed_items: args.p_observed_items,
      values: args.p_values,
    });
    calls.push(structuredClone(command));
    return ack({ ...packet, command });
  });
  api.defaults.adapter = createFamilyAxiosAdapter(
    createPackingGroupCommandHandler(
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
  api.defaults.adapter = oldAdapter;
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});

describe('owned group session and retained queue', () => {
  it('coalesces concurrent submits and publishes no historical/native/cache rows', async () => {
    const c = channel(),
      before = useTripStore.getState().packingItems;
    await Promise.all([c.submit(), c.submit()]);
    expect(calls).toEqual([packet.command]);
    expect(await retained()).toBeUndefined();
    expect(useTripStore.getState().packingItems).toBe(before);
    expect(await offlineDb.packingItems.count()).toBe(0);
  });
  it('clones the complete original before a caller mutates its selector or rows', async () => {
    const c = channel(),
      original = structuredClone(packet);
    rpc.mockResolvedValueOnce(ack(original));
    packet.command.selector.status = 'done';
    packet.original_items[0].name = 'Borrowed';
    await c.submit();
    expect(rpc).toHaveBeenCalledWith(
      'execute_family_trip_packing_group_v1',
      expect.objectContaining({
        p_selector: original.command.selector,
        p_observed_items: original.command.observed_items,
      })
    );
  });
  it('retains offline groups and refuses background replay until an explicit owned retry', async () => {
    const c = channel();
    setForcedOffline(true);
    await expect(c.submit()).rejects.toBeDefined();
    const before = await retained();
    setForcedOffline(false);
    await mutationQueue.flush();
    expect(await retained()).toEqual(before);
    expect(calls).toHaveLength(0);
    await c.submit();
    expect(calls).toEqual([packet.command]);
    expect(await retained()).toBeUndefined();
  });
  it('retries a response loss with the identical operation/set, and a forged ack retains it', async () => {
    const c = channel();
    rpc.mockRejectedValueOnce(new Error('Lost response'));
    await expect(c.submit()).rejects.toThrow();
    const body = (await retained())?.body;
    rpc.mockResolvedValueOnce({ ...ack(packet), changed_ids: [] });
    await expect(c.submit()).rejects.toBeDefined();
    expect((await retained())?.body).toEqual(body);
    await c.submit();
    expect(calls).toEqual([packet.command]);
  });
  it.each(['source', 'Trip', 'layer', 'actor', 'logout', 'disposed'] as const)(
    'refuses changed %s before sending',
    async (kind) => {
      const c = channel();
      if (kind === 'source') source += '/other';
      if (kind === 'Trip') useTripStore.setState({ trip: null });
      if (kind === 'layer') repo.setLayer(packet.command.scope.trip_id, 'myDraft');
      if (kind === 'actor') repo.acceptSession({ ...session, personId: id(99) });
      if (kind === 'logout') invalidateOfflineSession();
      if (kind === 'disposed') current = false;
      await expect(c.submit()).rejects.toBeDefined();
      expect(rpc).not.toHaveBeenCalled();
    }
  );
  it('retains a commit arriving after a changed source', async () => {
    rpc.mockImplementationOnce(async () => {
      source += '/changed';
      return ack(packet);
    });
    await expect(channel().submit()).rejects.toBeDefined();
    expect(await retained()).toBeDefined();
  });
  it('blocks competing item/group/other Trip work without replacing the first original', async () => {
    await retainPackingIntent(captureWriteSession(), packet, native);
    const next = fixture();
    next.command.operation_id = id(55);
    await expect(retainPackingIntent(captureWriteSession(), next, native)).rejects.toBeDefined();
    const { canonicalPackingEnvelope } = await import('../../../tests/helpers/familyPackingCommands');
    await expect(retainPackingIntent(captureWriteSession(), canonicalPackingEnvelope(), native)).rejects.toBeDefined();
    expect((await retained())?.body).toEqual(packet);
  });
  it.each(['body', 'metadata', 'operation', 'url'] as const)('never acknowledges altered retained %s', async (kind) => {
    await retainPackingIntent(captureWriteSession(), packet, native);
    if (kind === 'body')
      await offlineDb.mutationQueue.update(packet.command.operation_id, { body: { ...packet, future: true } });
    if (kind === 'metadata')
      await offlineDb.mutationQueue.update(packet.command.operation_id, { future: true } as never);
    if (kind === 'operation')
      await offlineDb.mutationQueue.update(packet.command.operation_id, {
        body: { ...packet, command: { ...packet.command, operation_id: id(77) } },
      });
    if (kind === 'url')
      await offlineDb.mutationQueue.update(packet.command.operation_id, { url: packingIntentUrl(packet) + '/future' });
    const before = await retained();
    await expect(acknowledgePackingIntent(captureWriteSession(), packet, native)).rejects.toBeDefined();
    expect(await recover().inspect()).toBeNull();
    expect(await retained()).toEqual(before);
  });
  it.each(['source', 'actor', 'path', 'layer', 'idempotency', 'query', 'verb', 'extra'] as const)(
    'handler refuses invalid %s before RPC',
    async (kind) => {
      const p = structuredClone(packet),
        headers = { 'X-Idempotency-Key': p.command.operation_id };
      let url = packingIntentUrl(p);
      if (kind === 'source') p.source_url += '/other';
      if (kind === 'actor') p.command.scope.user_id = id(99);
      if (kind === 'path') url = url.replace(p.command.scope.trip_id, id(99));
      if (kind === 'layer') p.view_layer = 'myDraft';
      if (kind === 'idempotency') headers['X-Idempotency-Key'] = id(99);
      if (kind === 'query') url += '?subset=true';
      if (kind === 'extra') Object.assign(p, { extra: true });
      await expect(
        api.request({ method: kind === 'verb' ? 'PUT' : 'POST', url, data: p, headers })
      ).rejects.toBeDefined();
      expect(rpc).not.toHaveBeenCalled();
    }
  );
});
describe('cold group receipt recovery', () => {
  it.each(['unknown', 'visible', 'redacted'] as const)(
    'reopens persisted %s intent without publishing a planner snapshot',
    async (mode) => {
      await retainPackingIntent(captureWriteSession(), packet, native);
      proof = mode;
      offlineDb.close();
      await offlineDb.open();
      useTripStore.getState().resetTrip();
      const task = await recover().inspect();
      expect(task?.domain).toBe('packing');
      expect(await task?.check()).toBe(mode === 'unknown' ? 'unknown' : 'committed');
      expect(!!(await retained())).toBe(mode === 'unknown');
      expect(calls).toHaveLength(0);
      expect(useTripStore.getState().trip).toBeNull();
      expect(useTripStore.getState().packingItems).toEqual([]);
    }
  );
  it('explicit cold retry sends the original complete intent and clears only its retained row', async () => {
    await retainPackingIntent(captureWriteSession(), packet, native);
    useTripStore.getState().resetTrip();
    const task = await recover().inspect();
    expect(await task?.retry()).toBe('committed');
    expect(calls).toEqual([packet.command]);
    expect(await retained()).toBeUndefined();
  });
  it('current revocation prevents receipt/replay and preserves the whole body', async () => {
    await retainPackingIntent(captureWriteSession(), packet, native);
    const task = await recover().inspect();
    allowed = false;
    await expect(task?.retry()).rejects.toMatchObject({ status: 403 });
    expect((await retained())?.body).toEqual(packet);
    expect(calls).toHaveLength(0);
  });
  it('retains old lifecycle replay but accepts an authenticated historical committed receipt', async () => {
    await retainPackingIntent(captureWriteSession(), packet, native);
    const task = await recover().inspect();
    rpc.mockResolvedValueOnce({
      version: 1,
      kind: 'packing-group',
      trip_id: packet.command.scope.trip_id,
      operation_id: packet.command.operation_id,
      scope: { ...packet.command.scope, trip_lifecycle_revision: 2 },
      status: 'committed',
      result_redacted: true,
      result: null,
    });
    expect(await task?.retry()).toBe('committed');
    expect(calls).toHaveLength(0);
  });
  it.each(['source', 'layer', 'actor', 'surface', 'logout', 'queue'] as const)(
    'changed %s cannot consume an original',
    async (kind) => {
      await retainPackingIntent(captureWriteSession(), packet, native);
      const task = await recover().inspect(() => visible);
      if (kind === 'source') source += '/other';
      if (kind === 'layer') repo.setLayer(packet.command.scope.trip_id, 'myDraft');
      if (kind === 'actor') repo.acceptSession({ ...session, personId: id(99) });
      if (kind === 'surface') visible = false;
      if (kind === 'logout') invalidateOfflineSession();
      if (kind === 'queue') await offlineDb.mutationQueue.update(packet.command.operation_id, { createdAt: 123 });
      await expect(task?.retry()).rejects.toBeDefined();
      expect(await retained()).toBeDefined();
      expect(calls).toHaveLength(0);
    }
  );
  it('two cold retries serialize and only the matching original can be acknowledged', async () => {
    await retainPackingIntent(captureWriteSession(), packet, native);
    const task = await recover().inspect();
    if (!task) throw Error('Missing original');
    const results = await Promise.allSettled([task.retry(), task.retry()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });
  it('future/recovery-held metadata stays intact and unsupported', async () => {
    await retainPackingIntent(captureWriteSession(), packet, native);
    await offlineDb.mutationQueue.update(packet.command.operation_id, {
      recoveryHold: { reason: 'signed-out', originalStatus: 'pending' },
    });
    const before = packingJson(await retained());
    expect(await recover().inspect()).toBeNull();
    expect(packingJson(await retained())).toBe(before);
  });
});

describe('bound complete group publication', () => {
  async function writerFixture() {
    let data: PackingList = {
      version: 1,
      scope: packet.command.scope,
      collection_revision: 7,
      items: structuredClone(packet.original_items),
      bags: [],
      category_assignees: {},
      unassigned_weight_grams: 2100,
      trash_count: 0,
    };
    vi.spyOn(repo.readers, 'listTripTravelers').mockResolvedValue([]);
    const reader = createPackingTransport(async () => structuredClone(data));
    const writer = new PlannerCohortPacking(
      repo,
      { source: () => source, disposed: () => !current, allowed: () => allowed },
      reader,
      createPackingGroupTransport(rpc)
    );
    const projected = projectPacking(data, identities(), []);
    writer.publish(data, projected);
    useTripStore.setState({ packingItems: projected.items });
    rpc.mockImplementation(async (name, args) => {
      if (name !== 'execute_family_trip_packing_group_v1') throw Error('Unexpected receipt');
      const command = packingGroupCommand.parse({
        ...packet.command,
        operation_id: args.p_operation_id,
        selector: args.p_selector,
        action: args.p_action,
        values: args.p_values,
        observed_items: args.p_observed_items,
        expected_collection_revision: args.p_expected_collection_revision,
      });
      if (command.expected_collection_revision !== data.collection_revision) throw { code: 'PT409' };
      calls.push(structuredClone(command));
      const result = ack({ ...packet, command });
      data = { ...data, collection_revision: result.collection_revision, items: structuredClone(result.items) };
      return result;
    });
    return { writer, items: projected.items };
  }
  it('publishes one canonical set into both stores, coalesces submits, and retires its completed origin', async () => {
    const { writer, items } = await writerFixture();
    const group = writer.bindGroup(native, packet.command.selector, items, {
      action: 'group-packed-state',
      values: { checked: true },
    });
    await Promise.all([group.submit(), group.submit()]);
    expect(calls).toHaveLength(1);
    expect(writer.snapshot()?.items).toEqual(useTripStore.getState().packingItems);
    expect(writer.snapshot()?.items.every((r) => r.checked === 1)).toBe(true);
    await expect(group.submit()).rejects.toBeDefined();
    expect(calls).toHaveLength(1);
  });
  it.each(['missing', 'duplicate', 'borrowed'] as const)(
    'refuses %s rendered members before allocating retained work',
    async (kind) => {
      const { writer, items } = await writerFixture();
      const selected = structuredClone(items);
      if (kind === 'missing') selected.pop();
      if (kind === 'duplicate') selected.push(selected[0]);
      if (kind === 'borrowed') selected[0].name = 'Borrowed row';
      expect(() =>
        writer.bindGroup(native, packet.command.selector, selected, { action: 'group-trash', values: {} })
      ).toThrow();
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect(rpc).not.toHaveBeenCalled();
    }
  );
  it.each(['source', 'Trip', 'layer', 'permission'] as const)(
    'a bound group cannot borrow changed %s authority',
    async (kind) => {
      const { writer, items } = await writerFixture();
      const group = writer.bindGroup(native, packet.command.selector, items, { action: 'group-trash', values: {} });
      if (kind === 'source') source += '/other';
      if (kind === 'Trip') useTripStore.setState({ trip: null });
      if (kind === 'layer') repo.setLayer(packet.command.scope.trip_id, 'myDraft');
      if (kind === 'permission') allowed = false;
      await expect(group.submit()).rejects.toBeDefined();
      expect(rpc).not.toHaveBeenCalled();
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
  it('malformed commit proof retains work and neither publishes historical rows nor optimistic partial state', async () => {
    const { writer, items } = await writerFixture(),
      before = useTripStore.getState().packingItems;
    const group = writer.bindGroup(native, packet.command.selector, items, {
      action: 'group-packed-state',
      values: { checked: true },
    });
    rpc.mockResolvedValueOnce({ ...ack(packet), operation_id: id(99) });
    await expect(group.submit()).rejects.toBeDefined();
    expect(useTripStore.getState().packingItems).toBe(before);
    expect(await offlineDb.mutationQueue.count()).toBe(1);
    expect(await offlineDb.packingItems.count()).toBe(0);
  });
});

it('cannot acknowledge group metadata replaced while the server response is in flight', async () => {
  const c = channel();
  rpc.mockImplementationOnce(async () => {
    const row = await retained();
    if (!row) throw Error('Original missing');
    await offlineDb.mutationQueue.update(row.id, { createdAt: row.createdAt + 1 });
    return ack(packet);
  });
  await expect(c.submit()).rejects.toBeDefined();
  expect(await retained()).toBeDefined();
});

function identities() {
  const views = repo.knownViews();
  if (!views) throw Error('Fixture identity registry missing');
  return views.ids;
}
