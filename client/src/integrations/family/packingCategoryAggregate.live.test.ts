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
import { _resetNetworkMode } from '../../sync/networkMode';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { createPackingCategoryAggregateCommandHandler } from './packingCategoryAggregateCommandHandler';
import { PackingCategoryAggregateCommandSession } from './packingCategoryAggregateCommandSession';
import { packingCategoryAggregateEnvelope } from './packingCategoryAggregateContract';
import {
  createPackingCategoryAggregateTransport,
  type PackingCategoryAggregateRpc,
} from './packingCategoryAggregateTransport';
import { packingCategoryV2Envelope } from './packingCategoryV2Contract';
import { createPackingCategoryV2Transport } from './packingCategoryV2Transport';
import { createPackingCommandTransport } from './packingCommandTransport';
import { createPlannerPackingRecovery } from './plannerPackingRecovery';
import { FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const file = process.env.FAMILY_PACKING_AGGREGATE_FIXTURE;
const live = file
  ? (JSON.parse(readFileSync(file, 'utf8')) as {
      api: string;
      anon_key: string;
      access_token: string;
      aal1_token: string;
      trip_id: string;
      family_id: string;
      user_id: string;
      person_id: string;
    })
  : null;
if (live && live.api !== 'http://127.0.0.1:55731') throw Error('Refusing a non-disposable125 API');
const f = () => {
  if (!live) throw Error('Explicit local125 fixture required');
  return live;
};
let sdk: SupabaseClient, repo: FamilyFrontendRepository, stop: () => void;
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:55731' }));
const previous = api.defaults.adapter;
const identity = () => ({
  trip_id: f().trip_id,
  family_id: f().family_id,
  user_id: f().user_id,
  person_id: f().person_id,
});
const transport = () => createPackingCategoryAggregateTransport();
const v2 = () => createPackingCategoryV2Transport();
async function category(name = 'Aggregate ' + crypto.randomUUID(), personal = false) {
  const p = await v2().list(identity());
  const a = await v2().execute(
    packingCategoryV2Envelope.parse({
      version: 2,
      source_url: f().api,
      view_layer: 'published',
      command: {
        version: 2,
        kind: 'packing-category-lifecycle',
        action: 'category-create',
        operation_id: crypto.randomUUID(),
        target_id: crypto.randomUUID(),
        scope: p.scope,
        expected_collection_revision: p.collection_revision,
        observed_category: null,
        values: { name, visibility: personal ? 'personal' : 'common' },
      },
    })
  );
  return a.category;
}
async function item(id: string) {
  const p = await v2().list(identity()),
    c = p.categories.find((c) => c.id === id);
  if (!c) throw Error('Synthetic category missing');
  const a = await v2().execute(
    packingCategoryV2Envelope.parse({
      version: 2,
      source_url: f().api,
      view_layer: 'published',
      original_item: null,
      original_category_id: null,
      command: {
        version: 2,
        kind: 'packing-category-item',
        action: 'category-item-create',
        operation_id: crypto.randomUUID(),
        target_id: crypto.randomUUID(),
        expected_revision: null,
        scope: p.scope,
        expected_collection_revision: p.collection_revision,
        category_id: id,
        observed_category: c,
        values: { name: 'Real ...', quantity: 3, packed_quantity: 2, weight_grams: 75 },
      },
    })
  );
  if (a.kind !== 'packing-category-item') throw Error();
  return a.item;
}
async function original(id: string, restore = false) {
  const o = await transport().observation(identity(), id, restore);
  return packingCategoryAggregateEnvelope.parse({
    version: 3,
    source_url: f().api,
    view_layer: 'published',
    command: {
      version: 3,
      kind: 'packing-category-aggregate',
      action: restore ? 'category-restore-batch' : 'category-trash-batch',
      operation_id: crypto.randomUUID(),
      target_id: id,
      scope: o.scope,
      expected_collection_revision: o.collection_revision,
      observed: o,
      values: {},
    },
  });
}
function rawRpc(): PackingCategoryAggregateRpc {
  return async (name, args) => {
    const { data, error } = await sdk.rpc(name, args);
    if (error) throw error;
    return data;
  };
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
    auth: { persistSession: false, autoRefreshToken: false },
  });
  repo = new FamilyFrontendRepository(
    async () => ({
      userId: live.user_id,
      familyId: live.family_id,
      personId: live.person_id,
      user: { username: 'Synthetic125 SDK', email: 'sdk@fixture.invalid', avatar_url: null, created_at: '2026-11-12' },
    }),
    undefined,
    () => ({ userId: live.user_id, familyId: live.family_id, personId: live.person_id, source: live.api })
  );
  await repo.session();
  const native = (await repo.views()).ids.register('trip', live.trip_id);
  useTripStore.setState({ trip: { id: native, title: 'Synthetic125', user_id: 0 } as never });
  api.defaults.adapter = createFamilyAxiosAdapter(
    createPackingCategoryAggregateCommandHandler(
      repo,
      () => live.api,
      () => false
    )
  );
  stop = installFamilyCommandRetention();
});
afterEach(async () => {
  if (!live) return;
  stop();
  api.defaults.adapter = previous;
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
describe.skipIf(!live)('strict125 real SDK/Auth/TOTP/PostgREST', () => {
  it('reads complete common/own lanes including empty categories with equal raw labels', async () => {
    const name = 'Other ' + crypto.randomUUID(),
      a = await category(name),
      b = await category(name, true);
    const common = await transport().lane(identity(), 'common'),
      own = await transport().lane(identity(), 'personal');
    expect(common.categories.some((c) => c.id === a.id)).toBe(true);
    expect(own.categories.some((c) => c.id === b.id)).toBe(true);
    expect(common.categories.some((c) => c.id === b.id)).toBe(false);
  });
  it('reorders the whole lane and records a genuine no-op on exact unchanged order', async () => {
    await category();
    await category();
    const o = await transport().lane(identity(), 'common');
    const p = packingCategoryAggregateEnvelope.parse({
      version: 3,
      source_url: f().api,
      view_layer: 'published',
      command: {
        version: 3,
        kind: 'packing-category-aggregate',
        action: 'category-reorder',
        operation_id: crypto.randomUUID(),
        scope: o.scope,
        target_id: null,
        expected_collection_revision: o.collection_revision,
        observed: o,
        values: { ordered_ids: o.categories.map((c) => c.id).reverse() },
      },
    });
    expect((await transport().execute(p)).changed).toBe(true);
    expect((await transport().receipt(p)).result).toEqual(await transport().execute(p));
    const latest = await transport().lane(identity(), 'common');
    const noop = packingCategoryAggregateEnvelope.parse({
      ...p,
      command: {
        ...p.command,
        operation_id: crypto.randomUUID(),
        observed: latest,
        expected_collection_revision: latest.collection_revision,
        values: { ordered_ids: latest.categories.map((c) => c.id) },
      },
    });
    expect((await transport().execute(noop)).changed).toBe(false);
    expect((await transport().lane(identity(), 'common')).collection_revision).toBe(latest.collection_revision);
  });
  it('retains independent prior Trash and restores only the original manifest children', async () => {
    const c = await category(),
      earlier = await item(c.id),
      keep = await item(c.id),
      s = await v2().list(identity());
    await createPackingCommandTransport().execute({
      version: 1,
      operation_id: crypto.randomUUID(),
      scope: s.scope,
      action: 'trash',
      target_id: earlier.id,
      expected_revision: earlier.revision,
      expected_collection_revision: null,
      values: {},
    });
    const p = await original(c.id),
      a = await transport().execute(p);
    if (a.action === 'category-reorder') throw Error();
    expect(a.items.map((r) => r.id)).toEqual([keep.id]);
    expect(
      (await transport().batches(identity())).categories.some((r) => r.category.id === c.id && r.item_count === 1)
    ).toBe(true);
    const restore = await original(c.id, true),
      restored = await transport().execute(restore);
    if (restored.action === 'category-reorder') throw Error();
    expect(restored.items[0].id).toBe(keep.id);
    expect(restored.items[0].quantity).toBe(keep.quantity);
    const current = await v2().list(identity());
    expect(current.packing.items.some((r) => r.id === keep.id)).toBe(true);
    expect(current.packing.items.some((r) => r.id === earlier.id)).toBe(false);
    expect((await transport().receipt(restore)).result).toEqual(restored);
  });
  it('rejects an original after another item changes its complete observation', async () => {
    const c = await category();
    await item(c.id);
    const p = await original(c.id);
    await item(c.id);
    await expect(transport().execute(p)).rejects.toMatchObject({ status: 409 });
    expect((await transport().receipt(p)).status).toBe('unknown');
  });
  it('shares the operation namespace and rejects the wrong receipt domain', async () => {
    const c = await category();
    await item(c.id);
    const p = await original(c.id);
    await transport().execute(p);
    const { error } = await sdk.rpc('get_family_trip_packing_receipt_v1', {
      p_trip_id: f().trip_id,
      p_operation_id: p.command.operation_id,
    });
    expect(error).not.toBeNull();
    const changed = structuredClone(p);
    changed.command.expected_collection_revision++;
    changed.command.observed.collection_revision++;
    await expect(transport().execute(changed)).rejects.toMatchObject({ status: 409 });
  });
  it('requires actual reviewer assurance and an active authenticated session', async () => {
    const c = await category();
    const p = await original(c.id);
    for (const token of [f().aal1_token, 'invalid']) {
      const client = createClient(f().api, f().anon_key, {
        global: { headers: { Authorization: 'Bearer ' + token } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await client.rpc('get_family_trip_packing_category_aggregate_v3', {
        p_trip_id: f().trip_id,
        p_category_id: c.id,
        p_include_deleted: false,
      });
      expect(error).not.toBeNull();
    }
    expect((await transport().receipt(p)).status).toBe('unknown');
  });
  it('recovers a real lost reply through the retained original without a duplicate execution', async () => {
    const c = await category();
    await item(c.id);
    const p = await original(c.id),
      actual = rawRpc();
    let writes = 0;
    const rpc: PackingCategoryAggregateRpc = async (name, args) => {
      const result = await actual(name, args);
      if (name.startsWith('execute')) {
        writes++;
        throw Error('Synthetic lost reply');
      }
      return result;
    };
    api.defaults.adapter = createFamilyAxiosAdapter(
      createPackingCategoryAggregateCommandHandler(
        repo,
        () => f().api,
        () => false,
        rpc
      )
    );
    await expect(
      new PackingCategoryAggregateCommandSession(repo, { source: () => f().api, disposed: () => false }, p).submit()
    ).rejects.toBeDefined();
    const retained = await offlineDb.mutationQueue.get(p.command.operation_id);
    expect(retained?.body).toEqual(p);
    const recovery = createPlannerPackingRecovery(
      repo,
      f().trip_id,
      { source: () => f().api, current: () => true },
      undefined,
      { categoryAggregateRpc: actual }
    );
    const pending = await recovery.inspect();
    expect(pending).not.toBeNull();
    if (!pending) throw Error('Original recovery required');
    expect(await pending.check()).toBe('committed');
    expect(writes).toBe(1);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
});
