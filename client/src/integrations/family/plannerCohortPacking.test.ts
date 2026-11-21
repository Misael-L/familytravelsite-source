import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  packingFixtureAt as at,
  canonicalPackingList,
  canonicalPackingRow,
  packingFixtureId as id,
} from '../../../tests/helpers/familyPacking';
import { canonicalPackingAck } from '../../../tests/helpers/familyPackingCommands';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api from '../../api/client';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { packingCommand, packingJson } from './packingCommandContract';
import { createPackingCommandHandler } from './packingCommandHandler';
import type { PackingCommandRpc } from './packingCommandTransport';
import type { PackingAck, PackingList, PackingRow } from './packingContract';
import * as packingQueue from './packingIntentQueue';
import { createPackingTransport, type PackingRpc } from './packingTransport';
import { PlannerCohortPacking } from './plannerCohortPacking';
import { projectPacking } from './plannerPacking';
import { FamilyApiError, FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';

let repo: FamilyFrontendRepository,
  writer: PlannerCohortPacking,
  data: PackingList,
  trash: PackingRow[],
  source: string,
  disposed: boolean,
  allowed: boolean,
  native: number;
let stop: () => void;
let session: FamilySession;
const priorAdapter = api.defaults.adapter;
const receipts = new Map<string, { body: string; ack: PackingAck }>();
const rpc = vi.fn<PackingCommandRpc>();
const readRpc = vi.fn<PackingRpc>();
let lose = false,
  redacted = false;
function currentItem() {
  const item = useTripStore.getState().packingItems[0];
  if (!item) throw new Error('No projected item');
  return item;
}
function publish() {
  const ids = repo.knownViews()?.ids;
  if (!ids) throw new Error('Missing fixture identity registry');
  const projection = projectPacking(data, ids, [
    { personId: data.scope.person_id, displayName: 'Current Person' },
    { personId: id(7), displayName: 'Other Person' },
  ]);
  writer.publish(data, projection);
  useTripStore.setState({ packingItems: projection.items });
}
function refusal(): never {
  throw new FamilyApiError(409, 'stale', 'Original revision changed');
}
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  installTestLocks();
  _resetNetworkMode();
  setAuthed(true);
  data = canonicalPackingList();
  trash = [];
  receipts.clear();
  source = 'https://fixture.supabase.invalid';
  disposed = false;
  allowed = true;
  lose = redacted = false;
  const s = data.scope;
  session = {
    userId: s.user_id,
    personId: s.person_id,
    familyId: s.family_id,
    user: { username: 'Packing member', email: 'packing@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  };
  repo = new FamilyFrontendRepository(async () => session);
  await repo.session();
  const ids = (await repo.views()).ids;
  native = ids.register('trip', s.trip_id);
  vi.spyOn(repo.readers, 'listTripTravelers').mockResolvedValue([
    { personId: s.person_id, displayName: 'Current Person', color: null },
    { personId: id(7), displayName: 'Other Person', color: null },
  ]);
  useTripStore.setState({ trip: { id: native, title: 'Packing test', user_id: 0 } as never });
  readRpc.mockReset().mockImplementation(async (name, args) => {
    if (name === 'get_family_trip_packing_v1') return structuredClone(data);
    if (name === 'list_family_trip_packing_trash_v1')
      return {
        version: 1,
        scope: data.scope,
        collection_revision: data.collection_revision,
        items: structuredClone(trash),
        next_cursor: null,
      };
    const r = receipts.get(String(args.p_operation_id));
    return {
      version: 1,
      trip_id: s.trip_id,
      operation_id: args.p_operation_id,
      scope: data.scope,
      status: r ? 'committed' : 'unknown',
      result_redacted: !!r && redacted,
      result: r && !redacted ? r.ack : null,
    };
  });
  rpc.mockReset().mockImplementation(async (_name, args) => {
    const command = packingCommand.parse({
      version: 1,
      scope: args.p_scope,
      operation_id: args.p_operation_id,
      action: args.p_action,
      target_id: args.p_target_id,
      expected_revision: args.p_expected_revision,
      expected_collection_revision: args.p_expected_collection_revision,
      values: args.p_values,
    });
    if (!allowed) throw new FamilyApiError(403, 'denied', 'Denied');
    const prior = receipts.get(command.operation_id);
    if (prior) {
      if (prior.body !== packingJson(command)) refusal();
      return structuredClone(prior.ack);
    }
    const row = command.target_id ? [...data.items, ...trash].find((r) => r.id === command.target_id) : null;
    if (command.action !== 'create' && command.action !== 'reorder' && row?.revision !== command.expected_revision)
      refusal();
    if (command.action === 'reorder' && command.expected_collection_revision !== data.collection_revision) refusal();
    const ack = canonicalPackingAck(command);
    if (ack.item && row) {
      ack.item = { ...structuredClone(row), ...ack.item, revision: row.revision + 2 };
      // The fixture helper supplies default values; preserve source values for fields outside this command.
      const next = {
        ...structuredClone(row),
        revision: row.revision + 2,
        deleted_at: command.action === 'trash' ? at : null,
        deleted_by_person_id: command.action === 'trash' ? s.person_id : null,
      };
      if (command.action === 'update') Object.assign(next, command.values);
      if (command.action === 'packed-state') {
        if ('checked' in command.values) {
          next.checked = command.values.checked;
          next.packed_quantity = null;
        } else {
          const count = command.values.packed_quantity ?? 0;
          next.checked = count === next.quantity;
          next.packed_quantity = count > 0 && count < next.quantity ? count : null;
        }
      }
      ack.item = next;
    }
    if (command.action === 'create' && ack.item) ack.item.sort_order = data.items.length;
    if (command.action === 'reorder') {
      data.items = command.values.ids.map((uuid, index) => ({
        ...(data.items.find((r) => r.id === uuid) ?? refusal()),
        sort_order: index,
      }));
    } else if (ack.item) {
      const savedId = ack.item.id;
      data.items = data.items.filter((r) => r.id !== savedId);
      trash = trash.filter((r) => r.id !== savedId);
      if (command.action === 'trash') trash.push(ack.item);
      else data.items.push(ack.item);
      data.items.sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
    }
    data.collection_revision++;
    data.trash_count = trash.length;
    ack.collection_revision = data.collection_revision;
    receipts.set(command.operation_id, { body: packingJson(command), ack: structuredClone(ack) });
    if (lose) {
      lose = false;
      throw new Error('Response lost after commit');
    }
    return structuredClone(ack);
  });
  writer = new PlannerCohortPacking(
    repo,
    { source: () => source, disposed: () => disposed, allowed: () => allowed },
    createPackingTransport(readRpc)
  );
  api.defaults.adapter = createFamilyAxiosAdapter(
    createPackingCommandHandler(
      repo,
      () => source,
      () => disposed,
      rpc
    )
  );
  stop = installFamilyCommandRetention();
  publish();
});
afterEach(async () => {
  stop();
  api.defaults.adapter = priorAdapter;
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});

it('publishes complete canonical projections, real Person names and server totals without native cache writes', async () => {
  expect(writer.snapshot()?.items[0].owner_username).toBe('Current Person');
  expect(writer.snapshot()?.bags[0].total_weight_grams).toBe(2200);
  expect(await offlineDb.packingItems.count()).toBe(0);
  data = canonicalPackingList({}, true);
  publish();
  expect(writer.snapshot()).toEqual({ items: [], bags: [], assignees: {}, unassigned_weight_grams: 0 });
});
it('creates from an originally empty list, then saves the canonical answer instead of appending a historical ack', async () => {
  data = canonicalPackingList({}, true);
  publish();
  const result = await writer.bind(null, native).save({ name: 'Map', visibility: 'common' });
  expect(result.name).toBe('Map');
  expect(useTripStore.getState().packingItems).toHaveLength(1);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
  expect(await offlineDb.packingItems.count()).toBe(0);
});
it('retains the form revision through a later publication and refuses a conflict without borrowing the new version', async () => {
  const origin = writer.bind(currentItem(), native);
  data.items[0].revision++;
  publish();
  await expect(origin.save({ name: 'Stale' })).rejects.toBeDefined();
  expect(rpc.mock.calls[0][1].p_expected_revision).toBe(3);
  expect(await offlineDb.mutationQueue.toArray()).toMatchObject([{ status: 'conflict' }]);
});
it('coalesces identical rapid form submissions under one operation and accepts opaque revision increments', async () => {
  const origin = writer.bind(currentItem(), native);
  const result = await Promise.all([origin.save({ name: 'Coat' }), origin.save({ name: 'Coat' })]);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(result[0]).toEqual(result[1]);
  expect(writer.snapshot()?.items[0].family_packing.revision).toBe(5);
});
it('retains an offline original, rejects changed retries, and resends the exact original operation', async () => {
  const origin = writer.bind(currentItem(), native);
  setForcedOffline(true);
  await expect(origin.save({ name: 'Coat' })).rejects.toMatchObject({ code: 'packing_queued' });
  const retained = (await offlineDb.mutationQueue.toArray())[0];
  expect(currentItem().name).toBe('Raincoat');
  expect(rpc).not.toHaveBeenCalled();
  await expect(origin.save({ name: 'Different' })).rejects.toMatchObject({ code: 'packing_pending_intent' });
  setForcedOffline(false);
  await origin.save({ name: 'Coat' });
  expect(rpc.mock.calls[0][1].p_operation_id).toBe(retained.id);
  expect(await offlineDb.mutationQueue.count()).toBe(0);
});
it.each(['updated', 'removed'] as const)('refuses a native save if its row was %s after retention', async (change) => {
  const retain = packingQueue.retainPackingIntent;
  const newer = { attempts: 2, lastError: 'Newer packing recovery state' };
  vi.spyOn(packingQueue, 'retainPackingIntent').mockImplementationOnce(async (...args) => {
    const original = await retain(...args);
    if (change === 'updated') expect(await offlineDb.mutationQueue.update(original.id, newer)).toBe(1);
    else await offlineDb.mutationQueue.delete(original.id);
    return original;
  });
  const before = useTripStore.getState().packingItems;
  const outcome: unknown = await writer
    .bind(currentItem(), native)
    .save({ name: 'Coat' })
    .catch((error: unknown) => error);

  expect(rpc).not.toHaveBeenCalled();
  expect(outcome).toMatchObject({ code: 'packing_observation_changed' });
  expect(useTripStore.getState().packingItems).toBe(before);
  const rows = await offlineDb.mutationQueue.toArray();
  if (change === 'updated') expect(rows).toMatchObject([{ ...newer, status: 'pending' }]);
  else expect(rows).toEqual([]);
});
it.each([false, true])(
  'reconciles a committed response-loss receipt with redacted=%s using a fresh canonical list',
  async (hidden) => {
    lose = true;
    const origin = writer.bind(currentItem(), native);
    await expect(origin.save({ name: 'Committed' })).rejects.toThrow('Response lost');
    expect(currentItem().name).toBe('Raincoat');
    expect(await offlineDb.mutationQueue.count()).toBe(1);
    redacted = hidden;
    if (hidden) data.items = [];
    expect(await writer.reconcile()).toBe('committed');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(writer.snapshot()?.items.map((r) => r.name)).toEqual(hidden ? [] : ['Committed']);
    expect(rpc).toHaveBeenCalledTimes(1);
  }
);
it('keeps unknown receipts unresolved and does not allocate another command', async () => {
  setForcedOffline(true);
  await expect(writer.bind(currentItem(), native).save({ name: 'Not sent' })).rejects.toBeDefined();
  setForcedOffline(false);
  expect(await writer.reconcile()).toBe('unknown');
  expect(await offlineDb.mutationQueue.count()).toBe(1);
  expect(rpc).not.toHaveBeenCalled();
});
it('does not change native state while a canonical post-save list is unavailable', async () => {
  const initial = useTripStore.getState().packingItems;
  readRpc.mockRejectedValueOnce(new Error('List unavailable'));
  await expect(writer.bind(currentItem(), native).save({ name: 'Committed' })).rejects.toThrow('List unavailable');
  expect(useTripStore.getState().packingItems).toBe(initial);
  expect(data.items[0].name).toBe('Committed');
  expect(await writer.reconcile()).toBe('none');
  expect(currentItem().name).toBe('Committed');
});
it('does not replace existing original queue work with a different item operation', async () => {
  setForcedOffline(true);
  await expect(writer.bind(currentItem(), native).save({ name: 'First original' })).rejects.toBeDefined();
  const before = await offlineDb.mutationQueue.toArray();
  setForcedOffline(false);
  await expect(writer.packed(native, currentItem(), { checked: true })).rejects.toMatchObject({
    code: 'packing_older_work',
  });
  expect(await offlineDb.mutationQueue.toArray()).toEqual(before);
  expect(rpc).not.toHaveBeenCalled();
});
it('does not inspect Trash through pending work or a nested command lease', async () => {
  setForcedOffline(true);
  await expect(writer.bind(currentItem(), native).save({ name: 'First original' })).rejects.toBeDefined();
  setForcedOffline(false);
  await expect(writer.trashPage()).rejects.toBeDefined();
  expect(readRpc).not.toHaveBeenCalled();
});
it.each(['source', 'Trip', 'layer', 'actor', 'disposed', 'logout', 'reset', 'closed'] as const)(
  'refuses changed %s before any save or native effect',
  async (kind) => {
    const origin = writer.bind(currentItem(), native),
      before = useTripStore.getState().packingItems;
    if (kind === 'source') source = 'https://other.invalid';
    if (kind === 'Trip') useTripStore.setState({ trip: null });
    if (kind === 'layer') repo.setLayer(data.scope.trip_id, 'myDraft');
    if (kind === 'actor') repo.acceptSession({ ...session, personId: id(99) });
    if (kind === 'disposed') disposed = true;
    if (kind === 'logout') invalidateOfflineSession();
    if (kind === 'reset') writer.reset();
    if (kind === 'closed') origin.close();
    await expect(origin.save({ name: 'Must refuse' })).rejects.toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
    expect(useTripStore.getState().packingItems).toBe(before);
  }
);
it('guards every direct write with packing authority', async () => {
  allowed = false;
  await expect(writer.bind(currentItem(), native).save({ name: 'Denied' })).rejects.toMatchObject({ status: 403 });
  expect(rpc).not.toHaveBeenCalled();
});
it.each(['source', 'layer', 'actor', 'disposed', 'logout'] as const)(
  'retires the published snapshot and rejects a new binding after %s replacement',
  async (kind) => {
    const old = currentItem();
    if (kind === 'source') source = 'https://different.invalid';
    if (kind === 'layer') repo.setLayer(data.scope.trip_id, 'myDraft');
    if (kind === 'actor') repo.acceptSession({ ...session, personId: id(99) });
    if (kind === 'disposed') disposed = true;
    if (kind === 'logout') invalidateOfflineSession();
    expect(writer.snapshot()).toBeNull();
    await expect(writer.bind(old, native).save({ name: 'Do not rebind' })).rejects.toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  }
);
it('rejects forged native observations before sending', async () => {
  await expect(writer.bind({ ...currentItem(), quantity: 999 }, native).save({ name: 'Forged' })).rejects.toMatchObject(
    { code: 'packing_observation_changed' }
  );
  expect(rpc).not.toHaveBeenCalled();
});
it('applies explicit partial counts and checkbox commands and retains server bag totals', async () => {
  await writer.packed(native, currentItem(), { packed_quantity: 2 });
  expect(currentItem().packed_quantity).toBe(2);
  await writer.packed(native, currentItem(), { checked: true });
  expect(currentItem().checked).toBe(1);
  expect(currentItem().packed_quantity).toBe(null);
  expect(writer.snapshot()?.bags[0].total_weight_grams).toBe(2200);
});
it('single-item Trash removes the actual last custom item, then restores only from an owned page', async () => {
  await writer.bind(currentItem(), native).trash();
  expect(writer.snapshot()?.items).toEqual([]);
  expect(trash[0].name).toBe('Raincoat');
  const page = await writer.trashPage();
  await writer.restore(page, page.items[0]);
  expect(currentItem().name).toBe('Raincoat');
  await expect(writer.restore(page, page.items[0])).rejects.toBeDefined();
});
it('rejects invented or mutated Trash pages', async () => {
  trash = [canonicalPackingRow({ deleted_at: at, deleted_by_person_id: data.scope.person_id })];
  data.trash_count = 1;
  const page = await writer.trashPage();
  await expect(writer.restore(structuredClone(page), page.items[0])).rejects.toBeDefined();
  page.items[0].revision++;
  await expect(writer.restore(page, page.items[0])).rejects.toBeDefined();
  expect(rpc).not.toHaveBeenCalled();
});
it('reorders only the complete originally observed set, not filtered or duplicate rows', async () => {
  data.items.push(canonicalPackingRow({ id: id(8), sort_order: 1 }));
  publish();
  const rows = useTripStore.getState().packingItems;
  await expect(writer.reorder(native, [rows[0]], [rows[0].id])).rejects.toBeDefined();
  await expect(writer.reorder(native, [rows[0], rows[0]], [rows[0].id, rows[0].id])).rejects.toBeDefined();
  expect(rpc).not.toHaveBeenCalled();
  await writer.reorder(native, rows, [rows[1].id, rows[0].id]);
  expect(writer.snapshot()?.items.map((r) => r.family_packing.id)).toEqual([id(8), id(5)]);
});
it('retires a late answer after source replacement without removing the original queued command', async () => {
  rpc.mockImplementation(async () => {
    source = 'https://changed.invalid';
    throw new Error('Late failure');
  });
  await expect(writer.bind(currentItem(), native).save({ name: 'Late' })).rejects.toBeDefined();
  expect(await offlineDb.mutationQueue.count()).toBe(1);
  expect(currentItem().name).toBe('Raincoat');
});

it.each(['source', 'actor ABA', 'layer ABA', 'disposed'] as const)(
  'retires a pending original receipt after %s without acknowledging or replacing it',
  async (kind) => {
    lose = true;
    await expect(writer.bind(currentItem(), native).save({ name: 'Original committed save' })).rejects.toThrow(
      'Response lost'
    );
    const queued = await offlineDb.mutationQueue.toArray(),
      before = useTripStore.getState().packingItems;
    const previous = readRpc.getMockImplementation();
    if (!previous) throw new Error('Missing original receipt reader');
    let entered: () => void = () => {
        throw new Error('Receipt gate not initialized');
      },
      release: () => void = () => {
        throw new Error('Receipt gate not initialized');
      };
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    readRpc.mockImplementation(async (name, args) => {
      if (name === 'get_family_trip_packing_receipt_v1') {
        entered();
        await gate;
      }
      return previous(name, args);
    });
    const flight = writer.reconcile();
    await ready;
    if (kind === 'source') source = 'https://retired-receipt.invalid';
    if (kind === 'actor ABA') {
      const original = session;
      repo.acceptSession({ ...session, personId: id(999) });
      repo.acceptSession(original);
    }
    if (kind === 'layer ABA') {
      repo.setLayer(data.scope.trip_id, 'myDraft');
      repo.setLayer(data.scope.trip_id, 'published');
    }
    if (kind === 'disposed') disposed = true;
    release();
    await expect(flight).rejects.toBeDefined();
    expect(await offlineDb.mutationQueue.toArray()).toEqual(queued);
    expect(useTripStore.getState().packingItems).toBe(before);
    expect(rpc).toHaveBeenCalledTimes(1);
  }
);

it('refuses a new collection-bound reorder after waiting for a preceding publication, before retaining or sending', async () => {
  data.items.push(canonicalPackingRow({ id: id(8), sort_order: 1 }));
  publish();
  const rows = useTripStore.getState().packingItems;
  let release = () => {},
    entered = false;
  const prior = navigator.locks.request(`trek-mutation-flush:${offlineDb.name}`, () => {
    entered = true;
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  await vi.waitFor(() => expect(entered).toBe(true));
  const lock = vi.spyOn(navigator.locks, 'request');
  const pending = writer.reorder(native, rows, [rows[1].id, rows[0].id]).catch((e) => e);
  await vi.waitFor(() => expect(lock).toHaveBeenCalled());
  data.collection_revision++;
  publish(); // The preceding write finishes its canonical publication while owning the exclusive lease.
  release();
  await prior;
  expect(await pending).toMatchObject({ code: 'packing_observation_changed' });
  expect(rpc).not.toHaveBeenCalled();
  expect(await offlineDb.mutationQueue.toArray()).toEqual([]);
  const fresh = useTripStore.getState().packingItems;
  await writer.reorder(native, fresh, [fresh[1].id, fresh[0].id]);
  expect(rpc).toHaveBeenCalledOnce();
  expect(writer.snapshot()?.items.map((r) => r.family_packing.id)).toEqual([id(8), id(5)]);
});
it('refuses an unretained stale observed-group command without creating a permanently conflicting original', async () => {
  const rows = useTripStore.getState().packingItems;
  const observed = writer.observeGroup(native, { view: 'personal', status: 'all', categories: ['Clothes'] }, rows);
  data.collection_revision++;
  publish();
  const post = vi.spyOn(api, 'post');
  await expect(observed.submit({ action: 'group-packed-state', values: { checked: true } })).rejects.toMatchObject({
    code: 'packing_observation_changed',
  });
  expect(post).not.toHaveBeenCalled();
  expect(await offlineDb.mutationQueue.toArray()).toEqual([]);
});
it('a retained reordered original still settles its lost committed reply after canonical publication advances', async () => {
  data.items.push(canonicalPackingRow({ id: id(8), sort_order: 1 }));
  publish();
  const rows = useTripStore.getState().packingItems;
  lose = true;
  await expect(writer.reorder(native, rows, [rows[1].id, rows[0].id])).rejects.toThrow('Response lost');
  const original = (await offlineDb.mutationQueue.toArray())[0];
  expect(original).toBeDefined();
  publish();
  const count = rpc.mock.calls.length;
  expect(await writer.reconcile()).toBe('committed');
  expect(rpc).toHaveBeenCalledTimes(count);
  expect(rpc.mock.calls[0][1].p_operation_id).toBe(original.id);
  expect(await offlineDb.mutationQueue.toArray()).toEqual([]);
});
it.each(['create', 'update'] as const)(
  'an independent %s is not blocked by an unrelated collection publication',
  async (kind) => {
    const origin = writer.bind(kind === 'create' ? null : currentItem(), native);
    data.collection_revision++;
    publish();
    const result = await origin.save({
      name: 'Independent row write',
      ...(kind === 'create' ? { visibility: 'common' as const } : {}),
    });
    expect(result.name).toBe('Independent row write');
    expect(rpc).toHaveBeenCalledOnce();
    expect(await offlineDb.mutationQueue.toArray()).toEqual([]);
  }
);

it('refuses a new partial count that waited behind a row-changing reorder before retention, then accepts the fresh row', async () => {
  const item = currentItem();
  let release = () => {},
    entered = false;
  const prior = navigator.locks.request(`trek-mutation-flush:${offlineDb.name}`, () => {
    entered = true;
    return new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  await vi.waitFor(() => expect(entered).toBe(true));
  const lock = vi.spyOn(navigator.locks, 'request');
  const pending = writer.packed(native, item, { packed_quantity: 1 }).catch((e) => e);
  await vi.waitFor(() => expect(lock).toHaveBeenCalled());
  data.items[0].revision++;
  data.collection_revision++;
  publish();
  release();
  await prior;
  expect(await pending).toMatchObject({ code: 'packing_observation_changed' });
  expect(rpc).not.toHaveBeenCalled();
  expect(await offlineDb.mutationQueue.toArray()).toEqual([]);
  await writer.packed(native, currentItem(), { packed_quantity: 1 });
  expect(rpc).toHaveBeenCalledOnce();
});
