import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'fake-indexeddb/auto';
import { http, passthrough } from 'msw';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api from '../../api/client';
import { offlineDb } from '../../db/offlineDb';
import { installPlannerPackingPort, packingGroupActionsAvailable } from '../../repo/plannerPackingPort';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode } from '../../sync/networkMode';
import { acquireQueueLock } from '../../sync/queueLock';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { captureWriteSession } from '../../sync/writeSession';
import { packingCommand } from './packingCommandContract';
import { createPackingCommandTransport } from './packingCommandTransport';
import { PackingGroupCommandSession } from './packingGroupCommandSession';
import {
  packingGroupEnvelope,
  selectedPackingRows,
  type PackingGroupCommand,
  type PackingGroupEnvelope,
} from './packingGroupContract';
import { createPackingGroupTransport } from './packingGroupTransport';
import { retainPackingIntent } from './packingIntentQueue';
import { createPackingTransport } from './packingTransport';
import { createFamilyPlannerCohort } from './plannerCohort';
import { PlannerCohortPacking } from './plannerCohortPacking';
import { projectPacking } from './plannerPacking';
import { createPlannerPackingRecovery } from './plannerPackingRecovery';
import { FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter } from './transport';
const qualified122 = process.env.FAMILY_PACKING_GROUP_122_FIXTURE;
if (qualified122 && process.env.FAMILY_PACKING_GROUP_FIXTURE)
  throw Error('Choose one explicit group SDK fixture target');
const file = qualified122 ?? process.env.FAMILY_PACKING_GROUP_FIXTURE;
const live = file
  ? (JSON.parse(readFileSync(file, 'utf8')) as {
      api: string;
      schema?: number;
      project_id?: string;
      anon_key: string;
      access_token: string;
      low_access_token: string;
      trip_id: string;
      family_id: string;
      user_id: string;
      person_id: string;
      redacted_packet: PackingGroupEnvelope;
      lifecycle_packet: PackingGroupEnvelope;
    })
  : null;
if (
  live &&
  (qualified122
    ? live.api !== 'http://127.0.0.1:55431' ||
      live.schema !== 122 ||
      live.project_id !== 'family-modernization-20261111-c2a'
    : live.api !== 'http://127.0.0.1:55331')
)
  throw Error('Refusing unqualified group API');
const fixture = () => {
  if (!live) throw Error('Local fixture required');
  return live;
};
let sdk: SupabaseClient, repo: FamilyFrontendRepository, native: number, stop: () => void;
const oldAdapter = api.defaults.adapter;
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:55331' }));
async function current() {
  const f = fixture();
  return createPackingTransport().list({
    trip_id: f.trip_id,
    family_id: f.family_id,
    user_id: f.user_id,
    person_id: f.person_id,
  });
}
async function create(category: string, values: Record<string, unknown> = {}) {
  const p = await current();
  const item = (
    await createPackingCommandTransport().execute(
      packingCommand.parse({
        version: 1,
        operation_id: crypto.randomUUID(),
        scope: p.scope,
        action: 'create',
        target_id: crypto.randomUUID(),
        expected_revision: null,
        expected_collection_revision: null,
        values: { name: 'Actual SDK group item', category, ...values },
      })
    )
  ).item;
  if (!item) throw Error('Local create returned no item');
  return item;
}
async function original(category: string, action: PackingGroupCommand['action'] = 'group-packed-state') {
  const p = await current(),
    selector = {
      view: 'common' as const,
      status: 'all' as const,
      categories: action === 'clear-completed' ? null : [category],
    };
  const items = selectedPackingRows(p.items, selector);
  return packingGroupEnvelope.parse({
    version: 1,
    source_url: fixture().api,
    view_layer: 'published',
    original_items: items,
    command: {
      version: 1,
      kind: 'packing-group',
      operation_id: crypto.randomUUID(),
      scope: p.scope,
      action,
      expected_collection_revision: p.collection_revision,
      selector,
      observed_items: items.map(({ id, revision, checked }) => ({ id, revision, checked })),
      values: action === 'group-packed-state' ? { checked: true } : {},
    },
  });
}
beforeEach(async () => {
  if (!live) return;
  server.use(http.all(live.api + '/*', () => passthrough()));
  resetAllStores();
  await resetOfflineTestDatabase();
  installTestLocks();
  _resetNetworkMode();
  setAuthed(true);
  sdk = createClient(live.api, live.anon_key, {
    global: { headers: { Authorization: 'Bearer ' + live.access_token } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  repo = new FamilyFrontendRepository(async () => ({
    userId: live.user_id,
    personId: live.person_id,
    familyId: live.family_id,
    user: { username: 'Local group SDK', email: 'local@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  }));
  await repo.session();
  native = (await repo.views()).ids.register('trip', live.trip_id);
  useTripStore.setState({ trip: { id: native, title: 'Local packing groups', user_id: 0 } as never });
  api.defaults.adapter = createFamilyAxiosAdapter(
    createFamilyPlannerCohort(repo, { source: () => live.api, reportError: () => {} }).handle
  );
  stop = installFamilyCommandRetention();
});
afterEach(async () => {
  stop?.();
  api.defaults.adapter = oldAdapter;
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
describe.skipIf(!live)('actual SDK/Auth/TOTP/PostgREST packing groups', () => {
  it('checks a real partial row, preserves a no-op row and returns the identical concurrent retry', async () => {
    const category = crypto.randomUUID();
    await create(category, { quantity: 4, packed_quantity: 2 });
    const unchanged = await create(category, { checked: true }),
      p = await original(category),
      t = createPackingGroupTransport();
    const results = await Promise.all([t.execute(p), t.execute(p)]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0].changed_ids).toHaveLength(1);
    expect(results[0].items.find((r) => r.id === unchanged.id)).toEqual(unchanged);
    expect(results[0].items.every((r) => r.checked && r.packed_quantity === null)).toBe(true);
    expect((await t.receipt(p)).result).toEqual(results[0]);
  });
  it('performs real atomic Trash and whole-view clear-completed with untouched unchecked rows', async () => {
    const category = crypto.randomUUID();
    await create(category);
    await create(category);
    const p = await original(category, 'group-trash'),
      out = await createPackingGroupTransport().execute(p);
    expect(out.changed_ids).toHaveLength(2);
    expect(out.items.every((r) => r.deleted_at !== null)).toBe(true);
    await create(category, { checked: true });
    const unchecked = await create(category, { quantity: 3, packed_quantity: 1 });
    const clear = await original(category, 'clear-completed'),
      result = await createPackingGroupTransport().execute(clear);
    expect(result.items.find((r) => r.id === unchecked.id)).toEqual(unchecked);
    expect(result.changed_ids).toEqual(clear.original_items.filter((r) => r.checked).map((r) => r.id));
  });
  it('accepts actual empty/no-op group receipts without advancing row/collection revisions', async () => {
    const p = await original(crypto.randomUUID());
    expect((await createPackingGroupTransport().execute(p)).collection_revision).toBe(
      p.command.expected_collection_revision
    );
    expect((await createPackingGroupTransport().receipt(p)).status).toBe('committed');
  });
  it('genuine response loss/reopen uses a receipt without a second execute or historical publication', async () => {
    const category = crypto.randomUUID();
    await create(category);
    const p = await original(category);
    const real = api.defaults.adapter as (c: never) => Promise<never>;
    api.defaults.adapter = async (config) => {
      await real(config as never);
      throw Error('Actual response lost after commit');
    };
    const c = new PackingGroupCommandSession(repo, { source: () => fixture().api, disposed: () => false }, p);
    await expect(c.submit()).rejects.toThrow('Actual response lost');
    const afterCommit = await current();
    expect(await offlineDb.mutationQueue.count()).toBe(1);
    api.defaults.adapter = real;
    offlineDb.close();
    await offlineDb.open();
    useTripStore.getState().resetTrip();
    const post = vi.spyOn(api, 'post'),
      recovery = createPlannerPackingRecovery(repo, p.command.scope.trip_id, {
        source: () => fixture().api,
        current: () => true,
      });
    expect(await (await recovery.inspect())?.check()).toBe('committed');
    expect(post).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect((await current()).items).toEqual(afterCommit.items);
    expect(useTripStore.getState().packingItems).toEqual([]);
  });
  it('unknown group work survives generic replay and explicit retry commits the original exactly once', async () => {
    const category = crypto.randomUUID();
    await create(category);
    const p = await original(category);
    await retainPackingIntent(captureWriteSession(), p, native);
    const before = await offlineDb.mutationQueue.toArray();
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.toArray()).toEqual(before);
    const recovery = createPlannerPackingRecovery(repo, p.command.scope.trip_id, {
      source: () => fixture().api,
      current: () => true,
    });
    const task = await recovery.inspect();
    expect(await task?.check()).toBe('unknown');
    expect(await task?.retry()).toBe('committed');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect((await createPackingGroupTransport().receipt(p)).result?.items.every((r) => r.checked)).toBe(true);
  });
  it.each(['redacted_packet', 'lifecycle_packet'] as const)(
    'proves actual historical %s without replaying it',
    async (key) => {
      const p = fixture()[key],
        trip = p.command.scope.trip_id,
        n = identities().register('trip', trip);
      await retainPackingIntent(captureWriteSession(), p, n);
      useTripStore.getState().resetTrip();
      const post = vi.spyOn(api, 'post');
      const recovery = createPlannerPackingRecovery(repo, trip, { source: () => fixture().api, current: () => true });
      const receipt = await createPackingGroupTransport().receipt(p);
      if (key === 'redacted_packet')
        expect(receipt).toMatchObject({ status: 'committed', result_redacted: true, result: null });
      else expect(receipt.scope.trip_lifecycle_revision).toBeGreaterThan(p.command.scope.trip_lifecycle_revision);
      expect(await (await recovery.inspect())?.retry()).toBe('committed');
      expect(post).not.toHaveBeenCalled();
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
  it('real AAL1 refuses both group writes and receipt inspection', async () => {
    const p = await original(crypto.randomUUID()),
      f = fixture();
    const low = createClient(f.api, f.anon_key, {
      global: { headers: { Authorization: 'Bearer ' + f.low_access_token } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const t = createPackingGroupTransport(async (name, args) => {
      const { data, error } = await low.rpc(name, args);
      if (error) throw error;
      return data;
    });
    await expect(t.execute(p)).rejects.toMatchObject({ status: 403 });
    await expect(t.receipt(p)).rejects.toMatchObject({ status: 403 });
  });
  it('the port publishes a fresh canonical full view and releases its lease before ancillary revalidation', async () => {
    const category = crypto.randomUUID();
    await create(category);
    const p = await current();
    const revalidate = vi.fn(async () => {
      const release = await acquireQueueLock(captureWriteSession(), 'exclusive', true);
      expect(release).not.toBeNull();
      release?.();
      throw Error('Ancillary refresh failed');
    });
    const writer = new PlannerCohortPacking(repo, {
      source: () => fixture().api,
      disposed: () => false,
      allowed: () => true,
      revalidate,
    });
    const projected = projectPacking(p, identities(), []);
    writer.publish(p, projected);
    useTripStore.setState({ packingItems: projected.items });
    const off = installPlannerPackingPort(writer);
    try {
      const group = writer.bindGroup(
        native,
        { view: 'common', status: 'all', categories: [category] },
        projected.items.filter((r) => r.category === category),
        { action: 'group-packed-state', values: { checked: true } }
      );
      await Promise.all([group.submit(), group.submit()]);
      expect(writer.snapshot()?.items).toEqual(useTripStore.getState().packingItems);
      expect(writer.snapshot()?.items.find((r) => r.category === category)?.checked).toBe(1);
      expect(revalidate).toHaveBeenCalledTimes(1);
      expect(group.current()).toBe(false);
      await expect(group.submit()).rejects.toBeDefined();
      expect(packingGroupActionsAvailable(true)).toBe(false);
      expect(await offlineDb.packingItems.count()).toBe(0);
    } finally {
      off();
    }
  });
});

function identities() {
  const views = repo.knownViews();
  if (!views) throw Error('Fixture identity registry missing');
  return views.ids;
}
