import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'fake-indexeddb/auto';
import { http, passthrough } from 'msw';
import { readFileSync, writeFileSync } from 'node:fs';
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
import { createPackingCategoryV2CommandHandler } from './packingCategoryV2CommandHandler';
import { PackingCategoryV2CommandSession } from './packingCategoryV2CommandSession';
import { packingCategoryV2Envelope, type PackingCategoryV2 } from './packingCategoryV2Contract';
import { createPackingCategoryV2Transport, type PackingCategoryV2Rpc } from './packingCategoryV2Transport';
import { createFamilyPlannerCohort } from './plannerCohort';
import { createPlannerPackingRecovery } from './plannerPackingRecovery';
import { FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter } from './transport';

const file = process.env.FAMILY_PACKING_CATEGORY_V2_FIXTURE;
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
if (live && live.api !== 'http://127.0.0.1:55631') throw Error('Refusing non-disposable category v2 API');
const f = () => {
  if (!live) throw Error('Local fixture required');
  return live;
};
let sdk: SupabaseClient, repo: FamilyFrontendRepository, stop: () => void;
const oldAdapter = api.defaults.adapter;
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:55631' }));
const identity = () => ({
  trip_id: f().trip_id,
  family_id: f().family_id,
  user_id: f().user_id,
  person_id: f().person_id,
});
const transport = () => createPackingCategoryV2Transport();
async function createCategory(visibility: 'common' | 'personal' = 'common', name = 'SDK ' + crypto.randomUUID()) {
  const p = await transport().list(identity());
  const original = packingCategoryV2Envelope.parse({
    version: 2,
    source_url: f().api,
    view_layer: 'published',
    command: {
      version: 2,
      kind: 'packing-category-lifecycle',
      action: 'category-create',
      target_id: crypto.randomUUID(),
      operation_id: crypto.randomUUID(),
      scope: p.scope,
      expected_collection_revision: p.collection_revision,
      observed_category: null,
      values: { name, visibility },
    },
  });
  return { original, ack: await transport().execute(original) };
}
async function life(
  category: PackingCategoryV2,
  action: 'category-retain' | 'category-dismiss-empty' | 'category-restore-empty'
) {
  const p = await transport().list(identity());
  return packingCategoryV2Envelope.parse({
    version: 2,
    source_url: f().api,
    view_layer: 'published',
    command: {
      version: 2,
      kind: 'packing-category-lifecycle',
      action,
      target_id: category.id,
      operation_id: crypto.randomUUID(),
      scope: p.scope,
      expected_collection_revision: p.collection_revision,
      observed_category: category,
      values: {},
    },
  });
}
async function item(category: PackingCategoryV2, previous?: { item: unknown; categoryId: string }) {
  const p = await transport().list(identity());
  return packingCategoryV2Envelope.parse({
    version: 2,
    source_url: f().api,
    view_layer: 'published',
    original_item: previous?.item ?? null,
    original_category_id: previous?.categoryId ?? null,
    command: {
      version: 2,
      kind: 'packing-category-item',
      action: previous ? 'category-item-move' : 'category-item-create',
      target_id: previous ? (previous.item as { id: string }).id : crypto.randomUUID(),
      operation_id: crypto.randomUUID(),
      expected_revision: previous ? (previous.item as { revision: number }).revision : null,
      scope: p.scope,
      expected_collection_revision: p.collection_revision,
      category_id: category.id,
      observed_category: category,
      values: previous ? {} : { name: '  Actual SDK ...  ', quantity: 3, packed_quantity: 2, weight_grams: 75 },
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
    user: { username: 'Actual SDK124', email: 'sdk@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  }));
  await repo.session();
  const native = (await repo.views()).ids.register('trip', live.trip_id);
  useTripStore.setState({ trip: { id: native, title: 'Synthetic local124 SDK', user_id: 0 } as never });
  api.defaults.adapter = createFamilyAxiosAdapter(
    createFamilyPlannerCohort(repo, { source: () => live.api, reportError: () => {} }).handle
  );
  stop = installFamilyCommandRetention();
});
afterEach(async () => {
  if (!live) return;
  stop();
  api.defaults.adapter = oldAdapter;
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
describe.skipIf(!live)('real guarded124 Auth/TOTP/PostgREST v2 SDK', () => {
  it('creates empty common/own categories with identical names and reads exact owner lanes', async () => {
    const label = 'Same ' + crypto.randomUUID(),
      a = await createCategory('common', label),
      b = await createCategory('personal', label);
    const p = await transport().list(identity());
    expect(p.categories.filter((x) => x.name === label)).toHaveLength(2);
    expect((await transport().lookup(identity(), 'common', label)).category).toEqual(a.ack.category);
    expect((await transport().lookup(identity(), 'personal', label)).category).toEqual(b.ack.category);
    expect(await transport().receipt(a.original)).toMatchObject({ status: 'committed', result: a.ack });
  });
  it('dismisses/restores the same empty ID with bounded original Trash observations', async () => {
    const a = await createCategory(),
      dismiss = await life(a.ack.category, 'category-dismiss-empty'),
      d = await transport().execute(dismiss);
    expect(d.category.deleted_at).not.toBeNull();
    expect((await transport().trash(identity(), 100)).categories.some((c) => c.id === d.category.id)).toBe(true);
    const r = await transport().execute(await life(d.category, 'category-restore-empty'));
    expect(r.category.id).toBe(a.ack.category.id);
    expect(r.category.deleted_at).toBeNull();
    expect((await transport().receipt(dismiss)).result).toEqual(d);
  });
  it('retains an already-retained empty category as a true no-op', async () => {
    const a = await createCategory(),
      p = await life(a.ack.category, 'category-retain'),
      r = await transport().execute(p);
    expect(r.changed).toBe(false);
    expect(r.category).toEqual(a.ack.category);
  });
  it('creates category-bound items, preserves packed counts and deduplicates exact retries', async () => {
    const a = await createCategory(),
      p = await item(a.ack.category),
      r = await transport().execute(p);
    expect(r.kind).toBe('packing-category-item');
    if (r.kind !== 'packing-category-item') throw Error();
    expect(r.item).toMatchObject({
      name: 'Actual SDK ...',
      quantity: 3,
      packed_quantity: 2,
      checked: false,
      weight_grams: 75,
    });
    expect(await transport().execute(p)).toEqual(r);
    expect((await transport().list(identity())).packing.items.filter((x) => x.id === r.item.id)).toHaveLength(1);
    expect((await transport().receipt(p)).result).toEqual(r);
  });
  it('moves between explicit categories preserving all content then recognizes a same-ID no-op', async () => {
    const a = await createCategory(),
      b = await createCategory();
    const r = await transport().execute(await item(a.ack.category));
    if (r.kind !== 'packing-category-item') throw Error();
    const original = await item(b.ack.category, { item: r.item, categoryId: a.ack.category.id });
    const moved = await transport().execute(original);
    if (moved.kind !== 'packing-category-item') throw Error();
    expect(moved.item.name).toBe(r.item.name);
    expect(moved.item.revision).toBe(r.item.revision + 1);
    const noop = await transport().execute(
      await item(moved.category, { item: moved.item, categoryId: moved.category.id })
    );
    expect(noop.changed).toBe(false);
  });
  it('refuses stale collections and domain collisions rather than creating replacement intent', async () => {
    const a = await createCategory(),
      stale = await item(a.ack.category);
    await createCategory();
    await expect(transport().execute(stale)).rejects.toMatchObject({ status: 409 });
    const collision = await item(a.ack.category);
    collision.command.operation_id = a.original.command.operation_id;
    await expect(transport().execute(collision)).rejects.toMatchObject({ status: 409 });
  });
  it('gates AAL1 and invalid sessions using the actual endpoint, without fallback', async () => {
    const p = (await createCategory()).original;
    for (const [token, status] of [
      [f().aal1_token, 403],
      ['invalid-expired-session', 401],
    ] as const) {
      const rpc: PackingCategoryV2Rpc = async (name, args) => {
        const response = await fetch(f().api + '/rest/v1/rpc/' + name, {
          method: 'POST',
          headers: { apikey: f().anon_key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        });
        const raw = await response.json();
        if (!response.ok) throw raw;
        return raw;
      };
      await expect(createPackingCategoryV2Transport(rpc).execute(p)).rejects.toMatchObject({ status });
    }
  });
  it('reconciles a real lost reply through current-authority receipt and retained original queue', async () => {
    const a = await createCategory(),
      original = await item(a.ack.category);
    let lost = false;
    const rpc: PackingCategoryV2Rpc = async (name, args) => {
      const { data, error } = await sdk.rpc(name, args);
      if (error) throw error;
      if (name.startsWith('execute') && !lost) {
        lost = true;
        throw Error('Synthetic loss after real commit');
      }
      return data;
    };
    api.defaults.adapter = createFamilyAxiosAdapter(
      createPackingCategoryV2CommandHandler(
        repo,
        () => f().api,
        () => false,
        rpc
      )
    );
    const c = new PackingCategoryV2CommandSession(
      repo,
      { source: () => f().api, disposed: () => false },
      original,
      createPackingCategoryV2Transport(rpc)
    );
    await expect(c.submit()).rejects.toBeDefined();
    const before = await offlineDb.mutationQueue.get(original.command.operation_id);
    expect(before?.body).toEqual(original);
    const recovery = createPlannerPackingRecovery(
      repo,
      f().trip_id,
      { source: () => f().api, current: () => true },
      undefined,
      { categoryV2Rpc: rpc }
    );
    const observed = await recovery.inspect();
    expect(observed).not.toBeNull();
    expect(await required(observed).check()).toBe('committed');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    if (file) writeFileSync(file + '.historical-original.json', JSON.stringify(original), { mode: 0o600 });
  });
  it('reconciles original commitment after real root recovery without replaying the stale scope', async () => {
    if (!file) throw Error('Private local original required');
    const original = packingCategoryV2Envelope.parse(
      JSON.parse(readFileSync(file + '.root-recovered-original.json', 'utf8'))
    );
    const receipt = await transport().receipt(original);
    expect(receipt.status).toBe('committed');
    expect(receipt.scope.trip_lifecycle_revision).toBeGreaterThan(original.command.scope.trip_lifecycle_revision);
    expect(receipt.result?.scope).toEqual(original.command.scope);
    await expect(transport().execute(original)).rejects.toMatchObject({ status: 409 });
  });
});

function required<T>(value: T | null | undefined): T {
  if (value == null) throw Error('Required original observation missing');
  return value;
}
