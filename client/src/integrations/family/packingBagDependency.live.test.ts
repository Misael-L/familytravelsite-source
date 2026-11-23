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
import { _resetNetworkMode } from '../../sync/networkMode';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { createPackingBagCommandHandler } from './packingBagCommandHandler';
import { packingBagEnvelope, type PackingBagEnvelope } from './packingBagContract';
import { PackingBagDependency } from './packingBagDependency';
import { createPackingBagTransport, type PackingBagRpc } from './packingBagTransport';
import { PackingCategoryAggregateCommandSession } from './packingCategoryAggregateCommandSession';
import { packingCategoryAggregateEnvelope } from './packingCategoryAggregateContract';
import { createPackingCategoryAggregateTransport } from './packingCategoryAggregateTransport';
import { createPackingCategoryV2Transport } from './packingCategoryV2Transport';
import { packingEnvelope } from './packingCommandContract';
import { PackingCommandSession } from './packingCommandSession';
import { createPackingCommandTransport } from './packingCommandTransport';
import { createPackingTransport } from './packingTransport';
import { createFamilyPlannerCohort } from './plannerCohort';
import { PlannerCohortPacking } from './plannerCohortPacking';
import { projectPacking } from './plannerPacking';
import { createPlannerPackingRecovery } from './plannerPackingRecovery';
import { FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter } from './transport';
const file = process.env.FAMILY_PACKING_DEPENDENCY_FIXTURE;
const live = file
  ? (JSON.parse(readFileSync(file, 'utf8')) as {
      api: string;
      anon_key: string;
      access_token: string;
      trip_ids: string[];
      family_id: string;
      user_id: string;
      person_id: string;
    })
  : null;
if (live && live.api !== 'http://127.0.0.1:55831') throw Error('Refusing a non-disposable126 API');
const f = () => {
  if (!live) throw Error('Explicit local126 fixture required');
  return live;
};
let sdk: SupabaseClient,
  repo: FamilyFrontendRepository,
  trip: string,
  index = 0,
  current: boolean,
  stop: () => void,
  dispose: () => void;
const previous = api.defaults.adapter;
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:55831' }));
const identity = () => ({ trip_id: trip, family_id: f().family_id, user_id: f().user_id, person_id: f().person_id });
const bags = () => createPackingBagTransport(),
  items = () => createPackingCommandTransport(),
  reads = () => createPackingTransport(),
  aggregates = () => createPackingCategoryAggregateTransport();
const recovery = () => createPlannerPackingRecovery(repo, trip, { source: () => f().api, current: () => current });
const dep = () => new PackingBagDependency(repo, trip, { source: () => f().api, current: () => current });
async function bagCommand(action: PackingBagEnvelope['command']['action'], id: string = crypto.randomUUID()) {
  const p = await bags().list(identity()),
    o = action === 'bag-create' ? null : await bags().observation(identity(), id, action === 'bag-restore');
  return packingBagEnvelope.parse({
    version: 1,
    source_url: f().api,
    view_layer: 'published',
    command: {
      version: 1,
      kind: 'packing-bag',
      action,
      operation_id: crypto.randomUUID(),
      target_id: id,
      scope: p.scope,
      expected_collection_revision: p.collection_revision,
      expected_revision: o?.bag.revision ?? null,
      observed: o,
      values: action === 'bag-create' ? { name: 'Dependency bag' } : {},
    },
  });
}
async function itemCommand(
  action: 'create' | 'trash' | 'restore',
  id: string = crypto.randomUUID(),
  revision: number | null = null,
  values: Record<string, unknown> = {}
) {
  const p = await reads().list(identity());
  return packingEnvelope.parse({
    version: 1,
    source_url: f().api,
    view_layer: 'published',
    command: {
      version: 1,
      action,
      operation_id: crypto.randomUUID(),
      target_id: id,
      scope: p.scope,
      expected_revision: revision,
      expected_collection_revision: null,
      values,
    },
  });
}
async function itemFixture() {
  const b = await bags().execute(await bagCommand('bag-create'));
  const i = await items().execute(
    (await itemCommand('create', crypto.randomUUID(), null, { name: 'Dependent item', bag_id: b.bag.id })).command
  );
  if (!i.item) throw Error();
  const t = await items().execute((await itemCommand('trash', i.item.id, i.item.revision)).command);
  if (!t.item) throw Error();
  await bags().execute(await bagCommand('bag-trash-empty', b.bag.id));
  const child = await itemCommand('restore', t.item.id, t.item.revision);
  await expect(
    new PackingCommandSession(repo, { source: () => f().api, disposed: () => !current }, child).submit()
  ).rejects.toBeDefined();
  return { bag: b.bag.id, child, row: await offlineDb.mutationQueue.get(child.command.operation_id) };
}
async function batchFixture() {
  const b = await bags().execute(await bagCommand('bag-create')),
    label = 'Batch ' + crypto.randomUUID();
  await items().execute(
    (
      await itemCommand('create', crypto.randomUUID(), null, {
        name: 'Batch dependent item',
        category: label,
        bag_id: b.bag.id,
      })
    ).command
  );
  const snapshot = await createPackingCategoryV2Transport().list(identity()),
    category = snapshot.categories.find((c) => c.name === label);
  if (!category) throw Error();
  const original = async (restore = false) => {
    const o = await aggregates().observation(identity(), category.id, restore);
    return packingCategoryAggregateEnvelope.parse({
      version: 3,
      source_url: f().api,
      view_layer: 'published',
      command: {
        version: 3,
        kind: 'packing-category-aggregate',
        action: restore ? 'category-restore-batch' : 'category-trash-batch',
        operation_id: crypto.randomUUID(),
        target_id: category.id,
        scope: o.scope,
        expected_collection_revision: o.collection_revision,
        observed: o,
        values: {},
      },
    });
  };
  await aggregates().execute(await original());
  await bags().execute(await bagCommand('bag-trash-empty', b.bag.id));
  const child = await original(true);
  await expect(
    new PackingCategoryAggregateCommandSession(
      repo,
      { source: () => f().api, disposed: () => !current },
      child
    ).submit()
  ).rejects.toBeDefined();
  return { bag: b.bag.id, child, row: await offlineDb.mutationQueue.get(child.command.operation_id) };
}
beforeEach(async () => {
  if (!live) return;
  trip = live.trip_ids[index++];
  if (!trip) throw Error('Fresh Trip required');
  current = true;
  server.use(http.all(live.api + '/*', () => passthrough()));
  resetAllStores();
  await resetOfflineTestDatabase();
  installTestLocks();
  _resetNetworkMode();
  setAuthed(true);
  sdk = createClient(live.api, live.anon_key, {
    global: { headers: { Authorization: 'Bearer ' + live.access_token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  repo = new FamilyFrontendRepository(
    async () => ({
      userId: live.user_id,
      familyId: live.family_id,
      personId: live.person_id,
      user: {
        username: 'Synthetic dependency',
        email: 'fixture@fixture.invalid',
        avatar_url: null,
        created_at: '2026-11-12',
      },
    }),
    undefined,
    () => ({ userId: live.user_id, familyId: live.family_id, personId: live.person_id, source: live.api })
  );
  await repo.session();
  const native = (await repo.views()).ids.register('trip', trip);
  useTripStore.setState({ trip: { id: native, title: 'Local126 dependency', user_id: 0 } as never });
  const cohort = createFamilyPlannerCohort(repo, { source: () => live.api, reportError: () => {} });
  api.defaults.adapter = createFamilyAxiosAdapter(cohort.handle);
  dispose = () => cohort.dispose();
  stop = installFamilyCommandRetention();
});
afterEach(async () => {
  if (!live) return;
  stop();
  dispose();
  api.defaults.adapter = previous;
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
describe.skipIf(!live)('strict126 real bag dependency SDK/Auth/TOTP', () => {
  it('restores parent through normal composition, then retries the exact original item restore', async () => {
    const x = await itemFixture(),
      draft = await dep().prepare(x.bag);
    if (draft.status !== 'prepared') throw Error();
    expect(await draft.submit()).toBe('committed');
    expect(await offlineDb.mutationQueue.toArray()).toEqual([x.row]);
    expect(await (await recovery().inspect())?.retry()).toBe('committed');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect((await reads().list(identity())).items.some((i) => i.id === x.child.command.target_id)).toBe(true);
  });
  it('keeps the exact category-batch restore when parent restoration makes its collection stale', async () => {
    const x = await batchFixture(),
      draft = await dep().prepare(x.bag);
    if (draft.status !== 'prepared') throw Error();
    await draft.submit();
    expect(await offlineDb.mutationQueue.toArray()).toEqual([x.row]);
    await expect((await recovery().inspect())!.retry()).rejects.toMatchObject({ response: { status: 409 } });
    expect((await offlineDb.mutationQueue.get(x.child.command.operation_id))?.body).toEqual(x.child);
    expect((await aggregates().receipt(x.child)).status).toBe('unknown');
    await expect(mutationQueue.resolveKeepServer(x.child.command.operation_id)).rejects.toBeDefined();
  });
  it('reconciles a lost committed parent reply without duplicate execution or child mutation', async () => {
    const x = await itemFixture(),
      draft = await dep().prepare(x.bag);
    if (draft.status !== 'prepared') throw Error();
    let writes = 0;
    const rpc: PackingBagRpc = async (name, args) => {
      const { data, error } = await sdk.rpc(name, args);
      if (error) throw error;
      if (name.startsWith('execute')) {
        writes++;
        throw Error('Synthetic lost parent reply');
      }
      return data;
    };
    api.defaults.adapter = createFamilyAxiosAdapter(
      createPackingBagCommandHandler(
        repo,
        () => f().api,
        () => !current,
        rpc
      )
    );
    await expect(draft.submit()).rejects.toBeDefined();
    expect(await offlineDb.mutationQueue.count()).toBe(2);
    expect(await (await recovery().inspect())?.check()).toBe('committed');
    expect(writes).toBe(1);
    expect(await offlineDb.mutationQueue.toArray()).toEqual([x.row]);
  });
  it('holds an uncertain pair until explicit retry and preserves original UUID after a before-send interruption', async () => {
    const x = await itemFixture(),
      draft = await dep().prepare(x.bag);
    if (draft.status !== 'prepared') throw Error();
    api.defaults.adapter = createFamilyAxiosAdapter(
      createPackingBagCommandHandler(
        repo,
        () => f().api,
        () => !current,
        async () => {
          throw Error('Before send');
        }
      )
    );
    await expect(draft.submit()).rejects.toBeDefined();
    const rows = await offlineDb.mutationQueue.toArray();
    expect(await (await recovery().inspect())?.check()).toBe('unknown');
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.toArray()).toEqual(rows);
    api.defaults.adapter = createFamilyAxiosAdapter(
      createPackingBagCommandHandler(
        repo,
        () => f().api,
        () => !current
      )
    );
    expect(await (await recovery().inspect())?.retry()).toBe('committed');
    expect(await offlineDb.mutationQueue.toArray()).toEqual([x.row]);
    expect((await bags().receipt(draft.original)).operation_id).toBe(draft.original.command.operation_id);
  });
  it('does not treat unknown receipt as cancellation: the same original can still commit later', async () => {
    const x = await itemFixture(),
      draft = await dep().prepare(x.bag);
    if (draft.status !== 'prepared') throw Error();
    await draft.submit();
    expect((await reads().receipt(x.child.command.scope, x.child.command.operation_id)).status).toBe('unknown');
    expect(await offlineDb.mutationQueue.toArray()).toEqual([x.row]);
    await items().execute(x.child.command);
    expect((await reads().receipt(x.child.command.scope, x.child.command.operation_id)).status).toBe('committed');
    expect(await (await recovery().inspect())?.check()).toBe('committed');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('retains a real postcommit owner-retired pair and permits only fresh-owner receipt recovery', async () => {
    const x = await itemFixture(),
      draft = await dep().prepare(x.bag);
    if (draft.status !== 'prepared') throw Error();
    const rpc: PackingBagRpc = async (name, args) => {
      const { data, error } = await sdk.rpc(name, args);
      if (error) throw error;
      if (name.startsWith('execute')) current = false;
      return data;
    };
    api.defaults.adapter = createFamilyAxiosAdapter(
      createPackingBagCommandHandler(
        repo,
        () => f().api,
        () => !current,
        rpc
      )
    );
    await expect(draft.submit()).rejects.toBeDefined();
    expect(await offlineDb.mutationQueue.count()).toBe(2);
    current = true;
    expect(await (await recovery().inspect())?.check()).toBe('committed');
    expect(await offlineDb.mutationQueue.toArray()).toEqual([x.row]);
  });
  it('reconciles only the parent through the ordinary planner writer while leaving the child unresolved', async () => {
    const x = await itemFixture(),
      draft = await dep().prepare(x.bag);
    if (draft.status !== 'prepared') throw Error();
    const snapshot = await reads().list(identity()),
      projection = projectPacking(snapshot, repo.knownViews()!.ids, []);
    const writer = new PlannerCohortPacking(repo, {
      source: () => f().api,
      disposed: () => !current,
      allowed: () => true,
    });
    writer.publish(snapshot, projection);
    const rpc: PackingBagRpc = async (name, args) => {
      const { data, error } = await sdk.rpc(name, args);
      if (error) throw error;
      if (name.startsWith('execute')) throw Error('Lost parent reply');
      return data;
    };
    api.defaults.adapter = createFamilyAxiosAdapter(
      createPackingBagCommandHandler(
        repo,
        () => f().api,
        () => !current,
        rpc
      )
    );
    await expect(draft.submit()).rejects.toBeDefined();
    expect(await writer.reconcile()).toBe('unknown');
    expect(await offlineDb.mutationQueue.toArray()).toEqual([x.row]);
  });
});
