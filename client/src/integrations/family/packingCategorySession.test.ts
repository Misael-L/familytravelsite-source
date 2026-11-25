import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import {
  canonicalCategoryAck as ack,
  canonicalCategoryEnvelope as envelope,
  canonicalPackingCategories as snapshot,
} from '../../../tests/helpers/familyPackingCategories';
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
import { createPackingCategoryCommandHandler } from './packingCategoryCommandHandler';
import { PackingCategoryCommandSession } from './packingCategoryCommandSession';
import {
  packingCategoryCommand,
  type PackingCategoryEnvelope,
  type PackingCategoryPacket,
} from './packingCategoryContract';
import { createPackingCategoryTransport, type PackingCategoryRpc } from './packingCategoryTransport';
import { acknowledgePackingIntent, packingIntentUrl, retainPackingIntent } from './packingIntentQueue';
import { createPackingTransport } from './packingTransport';
import { PlannerCohortPacking } from './plannerCohortPacking';
import { projectPacking } from './plannerPacking';
import { createPlannerPackingRecovery } from './plannerPackingRecovery';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createFamilyAxiosAdapter } from './transport';

let repo: FamilyFrontendRepository,
  packet: PackingCategoryEnvelope,
  canonical: PackingCategoryPacket,
  native: number,
  session: FamilySession,
  source: string,
  current: boolean,
  allowed: boolean,
  proof: 'unknown' | 'visible' | 'redacted',
  stop: () => void;
const oldAdapter = api.defaults.adapter,
  calls: unknown[] = [],
  rpc = vi.fn<PackingCategoryRpc>();
const channel = () =>
  new PackingCategoryCommandSession(
    repo,
    { source: () => source, disposed: () => !current },
    packet,
    createPackingCategoryTransport(rpc)
  );
const recover = () =>
  createPlannerPackingRecovery(
    repo,
    packet.command.scope.trip_id,
    { source: () => source, current: () => current },
    undefined,
    { categoryRpc: rpc }
  );
const retained = () => offlineDb.mutationQueue.get(packet.command.operation_id);
function cohort(withCategories = true) {
  const ids = required(repo.knownViews()).ids;
  const c = new PlannerCohortPacking(
    repo,
    { source: () => source, disposed: () => !current, allowed: () => allowed },
    createPackingTransport(async () => canonical.packing),
    undefined,
    createPackingCategoryTransport(rpc)
  );
  const p = projectPacking(canonical.packing, ids, []);
  useTripStore.setState({ packingItems: p.items });
  c.publish(canonical.packing, p, true, withCategories ? canonical : undefined);
  return c;
}
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  installTestLocks();
  _resetNetworkMode();
  setAuthed(true);
  canonical = snapshot();
  packet = envelope(canonical);
  source = packet.source_url;
  current = allowed = true;
  proof = 'unknown';
  calls.length = 0;
  const s = packet.command.scope;
  session = {
    userId: s.user_id,
    personId: s.person_id,
    familyId: s.family_id,
    user: {
      username: 'Category writer',
      email: 'category@fixture.invalid',
      avatar_url: null,
      created_at: '2026-01-01',
    },
  };
  repo = new FamilyFrontendRepository(
    async () => session,
    undefined,
    () => ({ userId: session.userId, personId: session.personId, familyId: session.familyId, source })
  );
  await repo.session();
  native = (await repo.views()).ids.register('trip', s.trip_id);
  useTripStore.setState({ trip: { id: native, title: 'Original Trip', user_id: 0 } as never });
  rpc.mockReset().mockImplementation(async (name, args) => {
    if (!allowed) throw { code: '42501' };
    if (name === 'get_family_trip_packing_with_categories_v1') return structuredClone(canonical);
    if (name === 'get_family_trip_packing_category_receipt_v1')
      return {
        version: 1,
        kind: 'packing-category',
        trip_id: s.trip_id,
        operation_id: args.p_operation_id,
        scope: s,
        status: proof === 'unknown' ? 'unknown' : 'committed',
        result_redacted: proof === 'redacted',
        result: proof === 'visible' ? ack(packet) : null,
      };
    const command = packingCategoryCommand.parse({
      ...packet.command,
      scope: args.p_scope,
      operation_id: args.p_operation_id,
      action: args.p_action,
      expected_collection_revision: args.p_expected_collection_revision,
      observed_category: args.p_observed_category,
      values: args.p_values,
    });
    const result = ack({ ...packet, command });
    calls.push(structuredClone(command));
    canonical.categories = [result.category];
    canonical.collection_revision = result.collection_revision;
    canonical.packing.collection_revision = result.collection_revision;
    canonical.packing.items = canonical.packing.items.map((r) => ({
      ...r,
      category: result.category.name,
      revision: result.changed_item_revisions.find((x) => x.item_id === r.id)?.revision ?? r.revision,
    }));
    return result;
  });
  api.defaults.adapter = createFamilyAxiosAdapter(
    createPackingCategoryCommandHandler(
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

describe('owned category commands and queue recovery', () => {
  it('coalesces duplicate submits without publishing historical or optimistic rows', async () => {
    const c = channel(),
      before = useTripStore.getState().packingItems;
    await Promise.all([c.submit(), c.submit()]);
    expect(calls).toEqual([packet.command]);
    expect(await retained()).toBeUndefined();
    expect(useTripStore.getState().packingItems).toBe(before);
    expect(await offlineDb.packingItems.count()).toBe(0);
  });
  it('clones the observed category/provenance/rows before caller mutation', async () => {
    const c = channel(),
      original = structuredClone(packet);
    packet.command.observed_category.name = 'Borrowed';
    packet.original_items[0].revision++;
    rpc.mockResolvedValueOnce(ack(original));
    await c.submit();
    expect(rpc).toHaveBeenCalledWith(
      'execute_family_trip_packing_category_v1',
      expect.objectContaining({ p_observed_category: original.command.observed_category })
    );
  });
  it('retains offline intent and skips background replay until explicit owned submit', async () => {
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
  });
  it('retains a lost response and rejects a forged later acknowledgement without discarding it', async () => {
    const c = channel();
    rpc.mockRejectedValueOnce(new Error('Lost response'));
    await expect(c.submit()).rejects.toThrow();
    const before = await retained();
    rpc.mockResolvedValueOnce({ ...ack(packet), changed_item_revisions: [] });
    await expect(c.submit()).rejects.toBeDefined();
    expect(await retained()).toEqual(before);
    await c.submit();
    expect(await retained()).toBeUndefined();
  });
  it.each(['source', 'trip', 'layer', 'account', 'logout', 'disposed'])(
    'holds intent across %s change while a reply is pending',
    async (kind) => {
      let resolve!: (r: unknown) => void;
      rpc.mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          })
      );
      const c = channel(),
        pending = c.submit();
      await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
      const original = await retained();
      if (kind === 'source') source = 'https://other.fixture.invalid';
      if (kind === 'trip') useTripStore.setState({ trip: { id: native + 1 } as never });
      if (kind === 'layer') repo.setLayer(packet.command.scope.trip_id, 'myDraft');
      if (kind === 'account') session = { ...session, personId: id(400) };
      if (kind === 'logout') invalidateOfflineSession();
      if (kind === 'disposed') current = false;
      resolve(ack(packet));
      await expect(pending).rejects.toBeDefined();
      if (kind !== 'logout') expect(await retained()).toEqual(original);
    }
  );
  it('unknown receipt preserves the original without any execute', async () => {
    await retainPackingIntent(captureWriteSession(), packet, native);
    const before = await retained();
    await expect(channel().reconcile()).resolves.toBe('unknown');
    expect(await retained()).toEqual(before);
    expect(calls).toHaveLength(0);
  });
  it.each(['visible', 'redacted'] as const)('uses a current authorized %s commitment without replay', async (value) => {
    await retainPackingIntent(captureWriteSession(), packet, native);
    proof = value;
    await expect(channel().reconcile()).resolves.toBe('committed');
    expect(await retained()).toBeUndefined();
    expect(calls).toHaveLength(0);
  });
  it('startup recovery is receipt-first, preserves unknown and explicitly retries the unchanged original', async () => {
    await retainPackingIntent(captureWriteSession(), packet, native);
    const observed = await recover().inspect();
    expect(observed).not.toBeNull();
    await expect(required(observed).check()).resolves.toBe('unknown');
    expect(calls).toHaveLength(0);
    await expect(required(observed).retry()).resolves.toBe('committed');
    expect(calls).toEqual([packet.command]);
    expect(await retained()).toBeUndefined();
  });
  it('startup redacted recovery never executes or publishes native rows', async () => {
    await retainPackingIntent(captureWriteSession(), packet, native);
    proof = 'redacted';
    const before = useTripStore.getState().packingItems;
    const observed = await recover().inspect();
    await expect(required(observed).retry()).resolves.toBe('committed');
    expect(calls).toHaveLength(0);
    expect(useTripStore.getState().packingItems).toBe(before);
  });
  it('unknown receipt in another domain never falls back to the item receipt or execute', async () => {
    await retainPackingIntent(captureWriteSession(), packet, native);
    rpc.mockResolvedValueOnce({ kind: 'packing-group' });
    await expect(channel().reconcile()).rejects.toBeDefined();
    expect(await retained()).toBeDefined();
    expect(calls).toHaveLength(0);
  });
  it('retains changed queue metadata rather than acknowledging a newer row', async () => {
    await retainPackingIntent(captureWriteSession(), packet, native);
    const row = await retained();
    await offlineDb.mutationQueue.update(packet.command.operation_id, { attempts: 1 });
    await expect(acknowledgePackingIntent(captureWriteSession(), packet, native, row)).rejects.toBeDefined();
    expect(await retained()).toBeDefined();
  });
  it('leaves unsupported retained bodies inspectable/exportable and rejects mismatched typed URL', async () => {
    await retainPackingIntent(captureWriteSession(), packet, native);
    await offlineDb.mutationQueue.update(packet.command.operation_id, {
      url: packingIntentUrl(packet).replace('category-commands', 'group-commands'),
    });
    expect(await recover().inspect()).toBeNull();
    await mutationQueue.flush();
    expect(await retained()).toBeDefined();
    expect(calls).toHaveLength(0);
  });
  it('parks definitive refusal while preserving all original intent fields', async () => {
    allowed = false;
    await expect(channel().submit()).rejects.toBeDefined();
    const row = await retained();
    expect(row?.status).toBe('failed');
    expect(row?.body).toEqual(packet);
  });
});
describe('category cohort ownership and one canonical publication', () => {
  it('old item-only observations cannot invent category identity', () => {
    const c = cohort(false);
    expect(c.categorySnapshot()).toBeNull();
    expect(() => c.observeCategory(native, packet.command.observed_category.id)).toThrow('Refresh category metadata');
  });
  it('explicitly refreshes a single coupled snapshot before binding', async () => {
    const c = cohort(false);
    await c.loadCategories();
    expect(c.categorySnapshot()).toEqual(canonical);
    expect(rpc).toHaveBeenCalledWith('get_family_trip_packing_with_categories_v1', {
      p_trip_id: packet.command.scope.trip_id,
    });
  });
  it('publishes current category/item/ancillary facts together after the acknowledgement', async () => {
    const c = cohort(),
      original = c.observeCategory(native, packet.command.observed_category.id);
    await original.submit({ action: 'category-rename', values: { name: 'Renamed' } });
    expect(c.categorySnapshot()).toEqual(canonical);
    expect(c.snapshot()?.items.map((r) => r.category)).toEqual(['Renamed', 'Renamed']);
    expect(useTripStore.getState().packingItems).toEqual(c.snapshot()?.items);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('a later render never rebases a captured original or pending operation', async () => {
    const c = cohort(),
      origin = c.observeCategory(native, packet.command.observed_category.id),
      original = structuredClone(canonical);
    setForcedOffline(true);
    await expect(origin.submit({ action: 'category-rename', values: { name: 'Frozen' } })).rejects.toBeDefined();
    const row = (await offlineDb.mutationQueue.toArray())[0];
    canonical.categories[0].name = 'New render';
    canonical.packing.items.forEach((r) => {
      r.category = 'New render';
    });
    canonical.collection_revision++;
    canonical.packing.collection_revision++;
    c.publish(
      canonical.packing,
      projectPacking(canonical.packing, required(repo.knownViews()).ids, []),
      true,
      canonical
    );
    await expect(origin.submit({ action: 'category-rename', values: { name: 'Other intent' } })).rejects.toThrow(
      'original category command'
    );
    expect((row.body as PackingCategoryEnvelope).command.observed_category).toEqual(original.categories[0]);
    expect((await offlineDb.mutationQueue.toArray())[0]).toEqual(row);
  });
  it('ignores a slow coupled read when a newer item/category generation publishes first', async () => {
    const c = cohort();
    let release!: (p: unknown) => void;
    rpc.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = r;
        })
    );
    const pending = c.loadCategories();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const newer = structuredClone(canonical);
    newer.categories[0].name = 'Newer';
    newer.packing.items.forEach((r) => {
      r.category = 'Newer';
    });
    c.publish(newer.packing, projectPacking(newer.packing, required(repo.knownViews()).ids, []), true, newer);
    release(canonical);
    await expect(pending).rejects.toBeDefined();
    expect(c.categorySnapshot()?.categories[0].name).toBe('Newer');
  });
  it('clears metadata when an old snapshot is published rather than retaining mismatched IDs', () => {
    const c = cohort();
    c.publish(canonical.packing, projectPacking(canonical.packing, required(repo.knownViews()).ids, []));
    expect(c.categorySnapshot()).toBeNull();
  });
  it('refuses a category ID not actually present in the coupled reader', () => {
    expect(() => cohort().observeCategory(native, id(400))).toThrow();
  });
  it('refuses mixed category and v1 snapshots before publishing either', () => {
    const c = cohort(),
      before = c.categorySnapshot(),
      p = structuredClone(canonical);
    p.packing.collection_revision++;
    expect(() =>
      c.publish(p.packing, projectPacking(p.packing, required(repo.knownViews()).ids, []), true, canonical)
    ).toThrow();
    expect(c.categorySnapshot()).toEqual(before);
  });
});

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Required test observation missing');
  return value;
}
