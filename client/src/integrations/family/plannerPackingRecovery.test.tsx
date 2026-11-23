import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalPackingScope, packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import { canonicalPackingAck } from '../../../tests/helpers/familyPackingCommands';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api from '../../api/client';
import { invalidateOfflineSession, MUTATION_SCHEMA_VERSION, offlineDb, type QueuedMutation } from '../../db/offlineDb';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { prepareRetainedWorkExport } from '../../sync/retainedRecovery';
import { captureWriteSession } from '../../sync/writeSession';
import { FamilyPlannerTaskRecovery } from './FamilyPlannerTaskRecovery';
import type { PackingCommand, PackingEnvelope } from './packingCommandContract';
import { packingJson } from './packingCommandContract';
import { createPackingCommandHandler } from './packingCommandHandler';
import type { PackingCommandRpc } from './packingCommandTransport';
import type { PackingAck } from './packingContract';
import { acknowledgePackingIntent, retainPackingIntent } from './packingIntentQueue';
import type { PackingRpc } from './packingTransport';
import { createPlannerPackingRecovery } from './plannerPackingRecovery';
import type { PlannerTaskRecovery } from './plannerTaskRecovery';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const download = vi.hoisted(() => vi.fn());
vi.mock('../../utils/fileDownload', () => ({ downloadBlob: download }));
const scope = canonicalPackingScope(),
  saved = { id: id(9), name: 'Original native packing' };
const session: FamilySession = {
  userId: scope.user_id,
  familyId: scope.family_id,
  personId: scope.person_id,
  user: { username: 'Recovery', email: 'recovery@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
};
let source: string,
  current: boolean,
  visible: boolean,
  allowed: boolean,
  denyExecute: boolean,
  loseAck: boolean,
  hideReceipt: boolean,
  native: number,
  repo: FamilyFrontendRepository,
  recovery: PlannerTaskRecovery,
  packet: PackingEnvelope,
  row: QueuedMutation,
  originalAdapter: typeof api.defaults.adapter;
type RecoveryTestRpc = (
  name: Parameters<PackingRpc | PackingCommandRpc>[0],
  args: Record<string, unknown>
) => Promise<unknown>;
const receipts = new Map<string, PackingAck>(),
  rpc = vi.fn<RecoveryTestRpc>();
const afterExecute = { run: async () => {} },
  beforeReceipt = { run: async () => {} };
function ack(command: PackingCommand): PackingAck {
  if (command.action !== 'create') throw Error('Expected create fixture');
  return canonicalPackingAck(command);
}

beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  installTestLocks();
  _resetNetworkMode();
  setAuthed(true);
  source = 'http://127.0.0.1:55331';
  current = visible = allowed = true;
  denyExecute = loseAck = hideReceipt = false;
  receipts.clear();
  download.mockReset();
  afterExecute.run = async () => {};
  beforeReceipt.run = async () => {};
  repo = new FamilyFrontendRepository(async () => session);
  await repo.session();
  native = (await repo.views()).ids.register('trip', scope.trip_id);
  packet = {
    version: 1,
    source_url: source,
    view_layer: 'published',
    command: {
      version: 1,
      scope,
      operation_id: id(8),
      target_id: saved.id,
      action: 'create',
      expected_revision: null,
      expected_collection_revision: null,
      values: { name: saved.name },
    },
  };
  await retainPackingIntent(captureWriteSession(), packet, native);
  row = (await offlineDb.mutationQueue.toArray())[0];
  rpc.mockReset().mockImplementation(async (name, args) => {
    if (!allowed) throw { code: '42501' };
    if (name === 'get_family_trip_packing_receipt_v1') {
      await beforeReceipt.run();
      const result = hideReceipt ? null : (receipts.get(String(args.p_operation_id)) ?? null);
      return {
        version: 1,
        trip_id: scope.trip_id,
        scope,
        operation_id: args.p_operation_id,
        status: receipts.has(String(args.p_operation_id)) && !hideReceipt ? 'committed' : 'unknown',
        result_redacted: false,
        result,
      };
    }
    if (name !== 'execute_family_trip_packing_v1') throw Error('Unexpected canonical read ' + name);
    if (denyExecute) throw { code: 'PT409' };
    const old = receipts.get(String(args.p_operation_id));
    if (packet.command.action !== 'create') throw Error('Expected create fixture');
    const result =
      old ??
      ack({
        ...packet.command,
        operation_id: String(args.p_operation_id),
        target_id: String(args.p_target_id),
        values: args.p_values as never,
      });
    receipts.set(result.operation_id, result);
    await afterExecute.run();
    if (loseAck) {
      loseAck = false;
      throw Error('Lost original acknowledgement');
    }
    return result;
  });
  originalAdapter = api.defaults.adapter;
  api.defaults.adapter = createFamilyAxiosAdapter(
    createPackingCommandHandler(
      repo,
      () => source,
      () => !current,
      rpc
    )
  );
  recovery = createPlannerPackingRecovery(repo, scope.trip_id, { source: () => source, current: () => current }, rpc);
});
afterEach(async () => {
  cleanup();
  api.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
async function task() {
  const t = await recovery.inspect(() => visible);
  expect(t).not.toBeNull();
  if (!t) throw Error('Original packing recovery missing');
  return t;
}
async function unchanged() {
  expect(await offlineDb.mutationQueue.get(row.id)).toEqual(row);
}
const executions = () => rpc.mock.calls.filter(([n]) => n === 'execute_family_trip_packing_v1');
describe('owned cold-entry packing recovery without publishing a blocked snapshot', () => {
  it('inspects an original offline native create with no native Trip, grant fabrication or packing RPC', async () => {
    useTripStore.getState().resetTrip();
    const t = await task();
    expect(t.name).toBe(saved.name);
    expect(rpc).not.toHaveBeenCalled();
    await unchanged();
    expect(useTripStore.getState().trip).toBeNull();
  });
  it('reopens the persisted queue with a new repository and no planner snapshot before recovering', async () => {
    offlineDb.close();
    await offlineDb.open();
    const next = new FamilyFrontendRepository(async () => session);
    await next.session();
    await next.views();
    const restored = createPlannerPackingRecovery(
      next,
      scope.trip_id,
      { source: () => source, current: () => current },
      rpc
    );
    const original = await restored.inspect();
    expect(original?.domain).toBe('packing');
    expect(useTripStore.getState().trip).toBeNull();
    expect(await original?.retry()).toBe('committed');
    expect(executions()).toHaveLength(1);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(useTripStore.getState().packingItems).toEqual([]);
  });
  it('a redacted commitment confirms the original without a replay or private item publication', async () => {
    rpc.mockImplementationOnce(async (_name, args) => ({
      version: 1,
      trip_id: scope.trip_id,
      scope,
      operation_id: args.p_operation_id,
      status: 'committed',
      result_redacted: true,
      result: null,
    }));
    expect(await (await task()).retry()).toBe('committed');
    expect(executions()).toHaveLength(0);
    expect(useTripStore.getState().packingItems).toEqual([]);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('an unknown receipt keeps the original byte facts and makes no save or execute claim', async () => {
    expect(await (await task()).check()).toBe('unknown');
    await unchanged();
    expect(executions()).toHaveLength(0);
  });
  it('explicit retry uses the exact original body, target, scope, revision and idempotency header', async () => {
    const post = vi.spyOn(api, 'post');
    expect(await (await task()).retry()).toBe('committed');
    expect(post).toHaveBeenCalledWith(row.url, packet, { headers: { 'X-Idempotency-Key': row.id } });
    expect(executions()).toHaveLength(1);
    expect(receipts.size).toBe(1);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(useTripStore.getState().trip).toBeNull();
    expect(useTripStore.getState().packingItems).toEqual([]);
  });
  it('an already committed historical receipt clears only the matching intent, not another Trip', async () => {
    receipts.set(row.id, ack(packet.command));
    await offlineDb.mutationQueue.add({
      ...row,
      id: id(20),
      tripId: native + 1,
      url: '/trips/' + id(21) + '/family/other',
    });
    expect(await (await task()).retry()).toBe('committed');
    expect(executions()).toHaveLength(0);
    expect((await offlineDb.mutationQueue.toArray()).map((r) => r.id)).toEqual([id(20)]);
  });
  it('lost acknowledgement retains the exact command; a later receipt confirms one canonical item', async () => {
    loseAck = true;
    const t = await task();
    await expect(t.retry()).rejects.toThrow('Lost original');
    await unchanged();
    expect(receipts.size).toBe(1);
    expect(await t.check()).toBe('committed');
    expect(executions()).toHaveLength(1);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('idempotent retry after a lost acknowledgement never synthesizes another UUID even if receipt remains unknown', async () => {
    loseAck = true;
    hideReceipt = true;
    const t = await task();
    await expect(t.retry()).rejects.toThrow();
    expect(await t.retry()).toBe('committed');
    expect(receipts.size).toBe(1);
    expect(executions()[0][1]).toEqual(executions()[1][1]);
  });
  it('current permission/MFA refusal prevents execute and retains original work', async () => {
    const t = await task();
    allowed = false;
    await expect(t.retry()).rejects.toMatchObject({ status: 403 });
    await unchanged();
    expect(executions()).toHaveLength(0);
  });
  it('a real command conflict is parked without replacing its old observation or body', async () => {
    denyExecute = true;
    await expect((await task()).retry()).rejects.toMatchObject({ response: { status: 409 } });
    const stored = await offlineDb.mutationQueue.get(row.id);
    expect(stored).toEqual({
      ...row,
      status: 'conflict',
      lastError: 'Original packing command refused; retained intact.',
    });
    expect(receipts.size).toBe(0);
  });
  it.each(['source', 'layer', 'session', 'problem', 'surface', 'actor', 'ids'] as const)(
    'a changed %s refuses before receipt or execution',
    async (kind) => {
      const t = await task();
      if (kind === 'source') source = 'https://other.invalid';
      if (kind === 'layer') repo.setLayer(scope.trip_id, 'myDraft');
      if (kind === 'session') invalidateOfflineSession();
      if (kind === 'actor') repo.acceptSession({ ...session, personId: id(77) });
      if (kind === 'ids') {
        repo.clear();
        repo.acceptSession(session);
      }
      if (kind === 'problem') current = false;
      if (kind === 'surface') visible = false;
      await expect(t.retry()).rejects.toBeDefined();
      await unchanged();
      expect(rpc).not.toHaveBeenCalled();
    }
  );
  it.each(['source', 'surface', 'problem', 'queue', 'metadata'] as const)(
    'a changed %s after a server commit cannot remove retained work',
    async (kind) => {
      afterExecute.run = async () => {
        if (kind === 'source') source = 'https://other.invalid';
        if (kind === 'surface') visible = false;
        if (kind === 'problem') current = false;
        if (kind === 'metadata') await offlineDb.mutationQueue.update(row.id, { future: true } as never);
        if (kind === 'queue') await offlineDb.mutationQueue.update(row.id, { body: { ...packet, future: true } });
      };
      await expect((await task()).retry()).rejects.toBeDefined();
      expect(receipts.size).toBe(1);
      expect(await offlineDb.mutationQueue.get(row.id)).toBeDefined();
    }
  );
  it('changed queued bytes while a receipt is in flight cannot be acknowledged', async () => {
    receipts.set(row.id, ack(packet.command));
    beforeReceipt.run = async () => {
      await offlineDb.mutationQueue.update(row.id, { createdAt: row.createdAt + 1 });
    };
    await expect((await task()).check()).rejects.toBeDefined();
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });
  it('a mismatched acknowledgement never deletes the original', async () => {
    receipts.set(row.id, { ...ack(packet.command), operation_id: id(19) });
    await expect((await task()).check()).rejects.toMatchObject({ status: 502 });
    await unchanged();
  });
  it('offline recovery refuses network access and retains the command', async () => {
    const t = await task();
    setForcedOffline(true);
    await expect(t.retry()).rejects.toMatchObject({ status: 503 });
    await unchanged();
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    'schema',
    'body',
    'row',
    'hold',
    'method',
    'syncing',
    'source',
    'person',
    'multiple',
    'url',
    'operation',
    'native',
    'malformed',
  ])('unsupported %s work stays exportable without a receipt or replay request', async (kind) => {
    const changes: Partial<QueuedMutation> =
      kind === 'schema'
        ? { schemaVersion: MUTATION_SCHEMA_VERSION + 1 }
        : kind === 'body'
          ? { body: { ...packet, future: true } }
          : kind === 'row'
            ? ({ future: true } as never)
            : kind === 'hold'
              ? { recoveryHold: { reason: 'signed-out', originalStatus: 'pending' } }
              : kind === 'method'
                ? { method: 'PUT' }
                : kind === 'syncing'
                  ? { status: 'syncing' }
                  : kind === 'source'
                    ? { body: { ...packet, source_url: 'https://other.invalid' } }
                    : kind === 'person'
                      ? {
                          body: { ...packet, command: { ...packet.command, scope: { ...scope, person_id: id(77) } } },
                        }
                      : kind === 'url'
                        ? { url: row.url + '/future' }
                        : kind === 'operation'
                          ? { body: { ...packet, command: { ...packet.command, operation_id: id(88) } } }
                          : kind === 'native'
                            ? { tripId: native + 1 }
                            : kind === 'malformed'
                              ? { tripId: 0 }
                              : {};
    await offlineDb.mutationQueue.update(row.id, changes);
    if (kind === 'multiple')
      await offlineDb.mutationQueue.add({ ...row, id: id(55), url: '/trips/' + scope.trip_id + '/family/future' });
    const before = packingJson(await offlineDb.mutationQueue.toArray());
    expect(await recovery.inspect()).toBeNull();
    await recovery.export();
    expect(download).toHaveBeenCalledTimes(1);
    expect(packingJson(await offlineDb.mutationQueue.toArray())).toBe(before);
    expect(rpc).not.toHaveBeenCalled();
    expect((await prepareRetainedWorkExport()).blob.size).toBeGreaterThan(0);
  });
  it('two concurrent retries serialize; only one can acknowledge the original', async () => {
    const t = await task(),
      results = await Promise.allSettled([t.retry(), t.retry()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(executions()).toHaveLength(1);
  });
  it('the recovery surface offers explicit actions and fresh read only after confirmation', async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    render(
      <FamilyPlannerTaskRecovery
        problem={{ trip: scope.trip_id, current: () => current, message: 'Held', retry }}
        recovery={recovery}
      />
    );
    const button = await screen.findByRole('button', { name: 'Check retained packing save' });
    fireEvent.click(button);
    await screen.findByText(/original save is still unresolved/);
    expect(retry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry original packing save' }));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
    expect(receipts.size).toBe(1);
  });
  it('unmounting the recovery surface while the server commits leaves the original for later receipt recovery', async () => {
    let resume = () => {};
    const wait = new Promise<void>((r) => {
      resume = r;
    });
    afterExecute.run = () => wait;
    const retry = vi.fn();
    const view = render(
      <FamilyPlannerTaskRecovery
        problem={{ trip: scope.trip_id, current: () => current, message: 'Held', retry }}
        recovery={recovery}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Retry original packing save' }));
    await waitFor(() => expect(receipts.size).toBe(1));
    view.unmount();
    resume();
    await new Promise((r) => setTimeout(r, 20));
    await unchanged();
    expect(retry).not.toHaveBeenCalled();
  });
});

it('atomic acknowledgement cannot remove a row with newly added future metadata', async () => {
  await offlineDb.mutationQueue.update(row.id, { future: { preserve: true } } as never);
  const before = await offlineDb.mutationQueue.get(row.id);
  await expect(acknowledgePackingIntent(captureWriteSession(), packet, native, row)).rejects.toMatchObject({
    code: 'packing_queue_changed',
  });
  expect(await offlineDb.mutationQueue.get(row.id)).toEqual(before);
});

it('atomic acknowledgement refuses a row removed after its original observation', async () => {
  await offlineDb.mutationQueue.delete(row.id);
  await expect(acknowledgePackingIntent(captureWriteSession(), packet, native, row)).rejects.toMatchObject({
    code: 'packing_queue_changed',
  });
});
it('atomic acknowledgement refuses changed retry metadata even when command bytes match', async () => {
  await offlineDb.mutationQueue.update(row.id, { attempts: row.attempts + 1 });
  const before = await offlineDb.mutationQueue.get(row.id);
  await expect(acknowledgePackingIntent(captureWriteSession(), packet, native, row)).rejects.toMatchObject({
    code: 'packing_queue_changed',
  });
  expect(await offlineDb.mutationQueue.get(row.id)).toEqual(before);
});
