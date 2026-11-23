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
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { captureWriteSession } from '../../sync/writeSession';
import { PackingCategoryCommandSession } from './packingCategoryCommandSession';
import {
  observePackingCategory,
  packingCategoryEnvelope,
  type PackingCategoryEnvelope,
  type PackingCategoryIntent,
} from './packingCategoryContract';
import { createPackingCategoryTransport } from './packingCategoryTransport';
import { packingCommand } from './packingCommandContract';
import { createPackingCommandTransport } from './packingCommandTransport';
import { retainPackingIntent } from './packingIntentQueue';
import { createFamilyPlannerCohort } from './plannerCohort';
import { PlannerCohortPacking } from './plannerCohortPacking';
import { projectPacking } from './plannerPacking';
import { createPlannerPackingRecovery } from './plannerPackingRecovery';
import { FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const file = process.env.FAMILY_PACKING_CATEGORY_FIXTURE;
const live = file
  ? (JSON.parse(readFileSync(file, 'utf8')) as {
      api: string;
      anon_key: string;
      access_token: string;
      low_access_token: string;
      trip_id: string;
      family_id: string;
      user_id: string;
      person_id: string;
      guest_person_id: string;
      lifecycle_packet: PackingCategoryEnvelope;
    })
  : null;
if (live && live.api !== 'http://127.0.0.1:55431') throw Error('Refusing non-disposable category API');
const fixture = () => {
  if (!live) throw Error('Local fixture required');
  return live;
};
let sdk: SupabaseClient, repo: FamilyFrontendRepository, native: number, stop: () => void;
const oldAdapter = api.defaults.adapter;
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:55431' }));
const identity = () => ({
  trip_id: fixture().trip_id,
  family_id: fixture().family_id,
  user_id: fixture().user_id,
  person_id: fixture().person_id,
});
async function original(intent?: PackingCategoryIntent, privateItem = false) {
  const f = fixture(),
    p = await createPackingCategoryTransport().list(identity()),
    label = 'SDK ' + crypto.randomUUID();
  const item = (
    await createPackingCommandTransport().execute(
      packingCommand.parse({
        version: 1,
        scope: p.scope,
        operation_id: crypto.randomUUID(),
        action: 'create',
        target_id: crypto.randomUUID(),
        expected_revision: null,
        expected_collection_revision: null,
        values: { name: 'Actual category SDK item', category: label, visibility: privateItem ? 'personal' : 'common' },
      })
    )
  ).item;
  if (!item) throw Error('Missing created SDK item');
  const current = await createPackingCategoryTransport().list(identity());
  const id = required(current.item_categories.find((x) => x.item_id === item.id)).category_id,
    observed = observePackingCategory(current, id);
  return packingCategoryEnvelope.parse({
    version: 1,
    source_url: f.api,
    view_layer: 'published',
    original_items: observed.items,
    command: {
      version: 1,
      kind: 'packing-category',
      operation_id: crypto.randomUUID(),
      scope: current.scope,
      expected_collection_revision: current.collection_revision,
      observed_category: observed.category,
      ...(intent ?? { action: 'category-rename', values: { name: label + ' renamed' } }),
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
    user: {
      username: 'Actual local category SDK',
      email: 'local@fixture.invalid',
      avatar_url: null,
      created_at: '2026-01-01',
    },
  }));
  await repo.session();
  native = (await repo.views()).ids.register('trip', live.trip_id);
  useTripStore.setState({ trip: { id: native, title: 'Local SDK', user_id: 0 } as never });
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
describe.skipIf(!live)('actual122 SDK/Auth/TOTP/PostgREST category adapter', () => {
  it('renames once with concurrent identical submits and a strict historical acknowledgement', async () => {
    const p = await original(),
      t = createPackingCategoryTransport(),
      [a, b] = await Promise.all([t.execute(p), t.execute(p)]);
    expect(a).toEqual(b);
    expect(a.category.id).toBe(p.command.observed_category.id);
    expect(a.changed_item_revisions[0].revision).toBe(p.original_items[0].revision + 1);
    expect((await t.receipt(p)).result).toEqual(a);
  });
  it('keeps exact raw Unicode/reserved labels and refuses stale collection originals', async () => {
    const p = await original({
      action: 'category-rename',
      values: { name: '__proto__ ' + crypto.randomUUID() + ' é e\u0301 😀' },
    });
    const a = await createPackingCategoryTransport().execute(p);
    expect(a.category.name).toEqual('name' in p.command.values ? p.command.values.name : '');
    await expect(
      createPackingCategoryTransport().execute({ ...p, command: { ...p.command, operation_id: crypto.randomUUID() } })
    ).rejects.toMatchObject({ status: 409 });
  });
  it('assigns an eligible Auth-less guest with server provenance and a no-op exact set', async () => {
    const p = await original({ action: 'category-assignees', values: { person_ids: [fixture().guest_person_id] } });
    const t = createPackingCategoryTransport(),
      a = await t.execute(p);
    expect(a.category.assignments[0]).toMatchObject({
      person_id: fixture().guest_person_id,
      assigned_by_person_id: fixture().person_id,
    });
    const current = await t.list(identity()),
      originalSet = observePackingCategory(current, a.category.id);
    const noop = packingCategoryEnvelope.parse({
      ...p,
      original_items: originalSet.items,
      command: {
        ...p.command,
        operation_id: crypto.randomUUID(),
        expected_collection_revision: current.collection_revision,
        observed_category: originalSet.category,
      },
    });
    expect((await t.execute(noop)).category).toEqual(a.category);
  });
  it('supports own-personal rename without assigning that category', async () => {
    const p = await original(undefined, true),
      a = await createPackingCategoryTransport().execute(p);
    expect(a.category.owner_person_id).toBe(fixture().person_id);
  });
  it('retains a genuine lost reply after server commit, then reconciles the same receipt without replay', async () => {
    const p = await original(),
      before = useTripStore.getState().packingItems,
      delegate = api.defaults.adapter;
    let drop = true;
    api.defaults.adapter = async (config) => {
      const out = await (delegate as (c: typeof config) => Promise<unknown>)(config);
      if (drop && String(config.url).endsWith('category-commands')) {
        drop = false;
        throw Error('Actual reply lost after commit');
      }
      return out as never;
    };
    const channel = new PackingCategoryCommandSession(repo, { source: () => fixture().api, disposed: () => false }, p);
    await expect(channel.submit()).rejects.toThrow();
    expect(await offlineDb.mutationQueue.get(p.command.operation_id)).toBeDefined();
    const recovery = createPlannerPackingRecovery(repo, p.command.scope.trip_id, {
      source: () => fixture().api,
      current: () => true,
    });
    const retained = await recovery.inspect();
    await expect(required(retained).check()).resolves.toBe('committed');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(useTripStore.getState().packingItems).toBe(before);
  });
  it('keeps an actual unknown offline original intact through generic flush', async () => {
    const p = await original();
    setForcedOffline(true);
    const c = new PackingCategoryCommandSession(repo, { source: () => fixture().api, disposed: () => false }, p);
    await expect(c.submit()).rejects.toBeDefined();
    const before = await offlineDb.mutationQueue.get(p.command.operation_id);
    setForcedOffline(false);
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.get(p.command.operation_id)).toEqual(before);
    await expect(c.reconcile()).resolves.toBe('unknown');
    await c.submit();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('reads a historical post-restore commitment while rejecting execution in the old lifecycle', async () => {
    const p = fixture().lifecycle_packet;
    native = required(repo.knownViews()).ids.register('trip', p.command.scope.trip_id);
    useTripStore.setState({ trip: { id: native } as never });
    await retainPackingIntent(captureWriteSession(), p, native);
    const c = new PackingCategoryCommandSession(repo, { source: () => fixture().api, disposed: () => false }, p);
    await expect(c.reconcile()).resolves.toBe('committed');
    await expect(createPackingCategoryTransport().execute(p)).rejects.toMatchObject({ status: 409 });
  });
  it('rejects a real AAL1 owner session and raw category DML', async () => {
    const p = await original(),
      f = fixture(),
      low = createClient(f.api, f.anon_key, {
        global: { headers: { Authorization: 'Bearer ' + f.low_access_token } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
    const high = sdk;
    sdk = low;
    try {
      await expect(createPackingCategoryTransport().execute(p)).rejects.toMatchObject({ status: 403 });
    } finally {
      sdk = high;
    }
    const { error } = await sdk.from('packing_categories').insert({ trip_id: f.trip_id, name: 'Raw bypass' });
    expect(error?.code).toBe('42501');
  });
  it('publishes fresh item/category state together through the actual cohort after commitment', async () => {
    const p = await original(),
      before = await createPackingCategoryTransport().list(identity()),
      ids = required(repo.knownViews()).ids,
      projection = projectPacking(before.packing, ids, []);
    useTripStore.setState({ packingItems: projection.items });
    const c = new PlannerCohortPacking(repo, {
      source: () => fixture().api,
      disposed: () => false,
      allowed: () => true,
    });
    c.publish(before.packing, projection, true, before);
    await c
      .observeCategory(native, p.command.observed_category.id)
      .submit({ action: 'category-rename', values: { name: 'Cohort ' + crypto.randomUUID() } });
    expect(c.categorySnapshot()).toEqual(await createPackingCategoryTransport().list(identity()));
    expect(useTripStore.getState().packingItems).toEqual(required(c.snapshot()).items);
  });
  it('opts resource readers into a single coupled protocol without a second v1 packing fetch', async () => {
    const f = fixture(),
      calls = vi.spyOn(sdk, 'rpc');
    const c = createFamilyPlannerCohort(repo, { source: () => f.api, reportError: () => {}, categoryMetadata: true });
    const result = await c.handle({
      method: 'GET',
      pathname: `/trips/${f.trip_id}/packing`,
      query: new URLSearchParams(),
      body: undefined,
    });
    expect(result).toHaveProperty('items');
    expect(calls).toHaveBeenCalledWith('get_family_trip_packing_with_categories_v1', { p_trip_id: f.trip_id });
    expect(calls.mock.calls.some(([name]) => name === 'get_family_trip_packing_v1')).toBe(false);
  });
});

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Required test observation missing');
  return value;
}
