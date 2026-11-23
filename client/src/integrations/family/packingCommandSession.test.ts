import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import {
  canonicalPackingAck as ack,
  canonicalPackingEnvelope as envelope,
} from '../../../tests/helpers/familyPackingCommands';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api from '../../api/client';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { installFamilyCommandRetention, isRetainedCommand } from '../../sync/retainedCommand';
import { captureWriteSession } from '../../sync/writeSession';
import { packingCommand, packingJson, type PackingCommand, type PackingEnvelope } from './packingCommandContract';
import { createPackingCommandHandler } from './packingCommandHandler';
import { PackingCommandSession } from './packingCommandSession';
import type { PackingCommandRpc } from './packingCommandTransport';
import {
  acknowledgePackingIntent,
  packingIntentUrl,
  parkPackingRefusal,
  retainPackingIntent,
} from './packingIntentQueue';
import { createPackingTransport } from './packingTransport';
import { plannerActionAvailable } from './plannerActionAvailability';
import { FamilyApiError, FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';

let repo: FamilyFrontendRepository,
  source: string,
  disposed: boolean,
  native: number,
  packet: PackingEnvelope,
  session: FamilySession,
  result: 'unknown' | 'visible' | 'redacted';
const originalAdapter = api.defaults.adapter;
const rpc = vi.fn<PackingCommandRpc>();
const received: PackingCommand[] = [];
let stopRetention: () => void;
function newSession(p = packet, beforeReceipt?: () => Promise<void>) {
  return new PackingCommandSession(
    repo,
    { source: () => source, disposed: () => disposed },
    p,
    createPackingTransport(async (name, args) => {
      if (name !== 'get_family_trip_packing_receipt_v1') throw new Error('Unexpected reader');
      await beforeReceipt?.();
      return {
        version: 1,
        trip_id: packet.command.scope.trip_id,
        operation_id: args.p_operation_id,
        scope: packet.command.scope,
        status: result === 'unknown' ? 'unknown' : 'committed',
        result_redacted: result === 'redacted',
        result: result === 'visible' ? ack(packet.command) : null,
      };
    })
  );
}
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  installTestLocks();
  _resetNetworkMode();
  setAuthed(true);
  packet = envelope();
  source = packet.source_url;
  disposed = false;
  result = 'unknown';
  received.length = 0;
  const s = packet.command.scope;
  session = {
    userId: s.user_id,
    personId: s.person_id,
    familyId: s.family_id,
    user: { username: 'Packing writer', email: 'packing@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  };
  repo = new FamilyFrontendRepository(async () => session);
  await repo.session();
  native = (await repo.views()).ids.register('trip', s.trip_id);
  useTripStore.setState({ trip: { id: native, title: 'Packing writer', user_id: 0 } as never });
  rpc.mockReset().mockImplementation(async (_name, args) => {
    const c = packingCommand.parse({
      version: 1,
      scope: args.p_scope,
      operation_id: args.p_operation_id,
      action: args.p_action,
      target_id: args.p_target_id,
      expected_revision: args.p_expected_revision,
      expected_collection_revision: args.p_expected_collection_revision,
      values: args.p_values,
    });
    received.push(structuredClone(c));
    return ack(c);
  });
  api.defaults.adapter = createFamilyAxiosAdapter(
    createPackingCommandHandler(
      repo,
      () => source,
      () => disposed,
      rpc
    )
  );
  stopRetention = installFamilyCommandRetention();
});
afterEach(async () => {
  stopRetention();
  api.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
describe('original packing intent channel', () => {
  it('sends one checked command and never publishes its historical acknowledgement into native state/cache', async () => {
    const before = useTripStore.getState().packingItems,
      out = await newSession().submit();
    expect(out).toEqual(ack(packet.command));
    expect(received).toEqual([packet.command]);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(await offlineDb.packingItems.count()).toBe(0);
    expect(useTripStore.getState().packingItems).toBe(before);
    expect(plannerActionAvailable('packing_edit')).toBe(false);
  });
  it('freezes the initiating caller body rather than borrowing later values', async () => {
    const original = structuredClone(packet),
      channel = newSession();
    packet.command.values = { name: 'Changed' };
    await channel.submit();
    expect(received).toEqual([original.command]);
  });
  it('retains offline intent without an optimistic item, and real generic replay sends that exact operation/body', async () => {
    const before = useTripStore.getState().packingItems,
      channel = newSession();
    setForcedOffline(true);
    await expect(channel.submit()).rejects.toMatchObject({ code: 'packing_queued' });
    const row = await offlineDb.mutationQueue.get(packet.command.operation_id);
    expect(row).toMatchObject({
      url: packingIntentUrl(packet),
      body: packet,
      retentionPolicy: 'family-original-v1',
      status: 'pending',
    });
    if (!row) throw new Error('Missing retained command');
    expect(isRetainedCommand(row)).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    setForcedOffline(false);
    await mutationQueue.flush();
    expect(received).toEqual([packet.command]);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(useTripStore.getState().packingItems).toBe(before);
  });
  it('resubmits the original UUID after response loss without allocating a replacement', async () => {
    const channel = newSession();
    rpc.mockImplementationOnce(async (_name, args) => {
      expect(args.p_operation_id).toBe(packet.command.operation_id);
      throw new Error('ReadError');
    });
    await expect(channel.submit()).rejects.toThrow('ReadError');
    expect(await offlineDb.mutationQueue.count()).toBe(1);
    await channel.submit();
    expect(received[0]).toEqual(packet.command);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  for (const [code, state] of [
    ['PT409', 'conflict'],
    ['42501', 'failed'],
    ['23514', 'failed'],
    ['PGRST301', 'pending'],
    ['54000', 'failed'],
  ] as const)
    it(`retains ${code} as ${state}`, async () => {
      rpc.mockRejectedValue({ code });
      await expect(newSession().submit()).rejects.toBeDefined();
      expect(await offlineDb.mutationQueue.get(packet.command.operation_id)).toMatchObject({
        status: state,
        body: packet,
      });
    });
  it('retains malformed acknowledgements as unresolved, not successful saves', async () => {
    rpc.mockResolvedValue({ ...ack(packet.command), operation_id: id(99) });
    await expect(newSession().submit()).rejects.toMatchObject({ response: { status: 502 } });
    expect(await offlineDb.mutationQueue.get(packet.command.operation_id)).toMatchObject({
      status: 'pending',
      body: packet,
    });
  });
  for (const kind of ['source', 'Trip', 'layer', 'actor', 'disposed', 'logout'])
    it(`refuses a changed ${kind} before sending`, async () => {
      const channel = newSession();
      if (kind === 'source') source = 'https://other.invalid';
      if (kind === 'Trip') useTripStore.setState({ trip: null });
      if (kind === 'layer') repo.setLayer(packet.command.scope.trip_id, 'myDraft');
      if (kind === 'actor') repo.acceptSession({ ...session, personId: id(99) });
      if (kind === 'disposed') disposed = true;
      if (kind === 'logout') invalidateOfflineSession();
      await expect(channel.submit()).rejects.toBeDefined();
      expect(rpc).not.toHaveBeenCalled();
    });
  it('does not acknowledge a response that arrived after a source change', async () => {
    rpc.mockImplementation(async () => {
      source = 'https://other.invalid';
      return ack(packet.command);
    });
    await expect(newSession().submit()).rejects.toBeDefined();
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });
  it.each(['success', 'conflict'] as const)('preserves newer queue metadata after a %s reply', async (reply) => {
    const op = packet.command.operation_id;
    const newer = { attempts: 2, lastError: 'A later queue action' };
    rpc.mockImplementationOnce(async () => {
      expect(await offlineDb.mutationQueue.update(op, newer)).toBe(1);
      if (reply === 'conflict') throw { code: 'PT409' };
      return ack(packet.command);
    });

    const outcome: unknown = await newSession()
      .submit()
      .catch((error: unknown) => error);
    expect(await offlineDb.mutationQueue.get(op)).toMatchObject({ ...newer, status: 'pending', body: packet });
    expect(outcome).toMatchObject({ code: 'packing_queue_changed' });
  });
  for (const proof of ['unknown', 'visible', 'redacted'] as const)
    it(`reconciles ${proof} proof without replaying or exposing item data`, async () => {
      const channel = newSession();
      setForcedOffline(true);
      await expect(channel.submit()).rejects.toBeDefined();
      setForcedOffline(false);
      result = proof;
      expect(await channel.reconcile()).toBe(proof === 'unknown' ? 'unknown' : 'committed');
      expect(await offlineDb.mutationQueue.count()).toBe(proof === 'unknown' ? 1 : 0);
      expect(rpc).not.toHaveBeenCalled();
      expect(await offlineDb.packingItems.count()).toBe(0);
    });
  it('returns none without inspecting a receipt when no original command is retained', async () => {
    expect(await newSession().reconcile()).toBe('none');
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(['visible', 'redacted'] as const)(
    'keeps the replaced queue row after a %s commitment receipt',
    async (proof) => {
      await retainPackingIntent(captureWriteSession(), packet, native);
      result = proof;
      const op = packet.command.operation_id;
      const newer = { attempts: 3, lastError: 'Retained by another action' };
      const channel = newSession(packet, async () => {
        expect(await offlineDb.mutationQueue.update(op, newer)).toBe(1);
      });

      const outcome: unknown = await channel.reconcile().catch((error: unknown) => error);
      expect(await offlineDb.mutationQueue.get(op)).toMatchObject({ ...newer, status: 'pending', body: packet });
      expect(outcome).toMatchObject({ code: 'packing_queue_changed' });
      expect(rpc).not.toHaveBeenCalled();
    }
  );
});
describe('queue integrity and handler contract', () => {
  it('refuses competing Trip work and altered retry intent, preserving the first body', async () => {
    const owner = captureWriteSession();
    await retainPackingIntent(owner, packet, native);
    const different = structuredClone(packet);
    different.command.operation_id = id(11);
    await expect(retainPackingIntent(owner, different, native)).rejects.toMatchObject({ code: 'packing_older_work' });
    different.command.operation_id = packet.command.operation_id;
    different.command.values = { name: 'Other' };
    await expect(retainPackingIntent(owner, different, native)).rejects.toMatchObject({
      code: 'packing_queue_changed',
    });
    expect((await offlineDb.mutationQueue.get(packet.command.operation_id))?.body).toEqual(packet);
  });
  for (const field of ['body', 'tripId', 'resource', 'schemaVersion', 'baseUpdatedAt'])
    it(`never removes or parks a changed retained ${field}`, async () => {
      const owner = captureWriteSession();
      await retainPackingIntent(owner, packet, native);
      const patch =
        field === 'body'
          ? { body: { ...packet, version: 2 } }
          : field === 'tripId'
            ? { tripId: 999 }
            : field === 'resource'
              ? { resource: 'packingItems' as const }
              : field === 'schemaVersion'
                ? { schemaVersion: 999 }
                : { baseUpdatedAt: 'new' };
      await offlineDb.mutationQueue.update(packet.command.operation_id, patch);
      await expect(acknowledgePackingIntent(owner, packet, native)).rejects.toMatchObject({
        code: 'packing_queue_changed',
      });
      await expect(
        parkPackingRefusal(owner, packet, native, new FamilyApiError(409, 'conflict', 'Conflict'))
      ).rejects.toBeDefined();
      await expect(newSession().reconcile()).rejects.toBeDefined();
      expect(await offlineDb.mutationQueue.count()).toBe(1);
    });
  for (const variation of [
    'source',
    'actor',
    'path',
    'layer',
    'idempotency',
    'unknown field',
    'native token',
    'query',
    'verb',
  ])
    it(`refuses unqualified ${variation} before the command RPC`, async () => {
      const p = structuredClone(packet);
      let url = packingIntentUrl(p);
      const headers: Record<string, string> = { 'X-Idempotency-Key': p.command.operation_id };
      if (variation === 'source') p.source_url = 'https://wrong.invalid';
      if (variation === 'actor') p.command.scope.person_id = id(99);
      if (variation === 'path') url = url.replace(p.command.scope.trip_id, id(99));
      if (variation === 'layer') p.view_layer = 'myDraft';
      if (variation === 'idempotency') headers['X-Idempotency-Key'] = id(99);
      if (variation === 'unknown field') Object.assign(p.command.values, { recipient_ids: [] });
      if (variation === 'native token') headers['X-Base-Updated-At'] = 'borrowed';
      if (variation === 'query') url += '?partial=true';
      await expect(
        api.request({ method: variation === 'verb' ? 'PATCH' : 'POST', url, data: p, headers })
      ).rejects.toBeDefined();
      expect(rpc).not.toHaveBeenCalled();
    });
  it('does not change original queued JSON while retrying a conflict', async () => {
    const channel = newSession();
    rpc.mockRejectedValue({ code: 'PT409' });
    await expect(channel.submit()).rejects.toBeDefined();
    const before = packingJson((await offlineDb.mutationQueue.get(packet.command.operation_id))?.body);
    await mutationQueue.resolveKeepMine(packet.command.operation_id);
    expect(packingJson((await offlineDb.mutationQueue.get(packet.command.operation_id))?.body)).toBe(before);
  });
});
