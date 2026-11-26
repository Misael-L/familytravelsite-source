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
import { captureWriteSession } from '../../sync/writeSession';
import { packingCommand, type PackingCommand, type PackingEnvelope } from './packingCommandContract';
import { PackingCommandSession } from './packingCommandSession';
import { createPackingCommandTransport } from './packingCommandTransport';
import { retainPackingIntent } from './packingIntentQueue';
import { createPackingTransport } from './packingTransport';
import { plannerActionAvailable } from './plannerActionAvailability';
import { createFamilyPlannerCohort } from './plannerCohort';
import { FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter } from './transport';
const file = process.env.FAMILY_PACKING_COMMAND_FIXTURE;
const live = file
  ? (JSON.parse(readFileSync(file, 'utf8')) as {
      api: string;
      anon_key: string;
      access_token: string;
      low_access_token: string;
      user_id: string;
      person_id: string;
      family_id: string;
      trip_id: string;
      bag_id: string;
      hidden_item_id: string;
      redacted_command: PackingCommand;
    })
  : null;
if (live && live.api !== 'http://127.0.0.1:55331') throw new Error('Refusing non-disposable packing endpoint');
const originalAdapter = api.defaults.adapter;
let sdk: SupabaseClient, repo: FamilyFrontendRepository, native: number, stop: (() => void) | undefined;
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:55331' }));
function fixture() {
  if (!live) throw new Error('Packing fixture required');
  return live;
}
const reads = () => createPackingTransport();
const writes = () => createPackingCommandTransport();
async function current() {
  const f = fixture();
  return reads().list({ trip_id: f.trip_id, family_id: f.family_id, user_id: f.user_id, person_id: f.person_id });
}
async function create(values: Record<string, unknown> = { name: 'Web typed packing' }) {
  const view = await current();
  return packingCommand.parse({
    version: 1,
    operation_id: crypto.randomUUID(),
    scope: view.scope,
    action: 'create',
    target_id: crypto.randomUUID(),
    expected_revision: null,
    expected_collection_revision: null,
    values,
  });
}
function packet(command: PackingCommand): PackingEnvelope {
  return { version: 1, source_url: fixture().api, view_layer: 'published', command };
}
function channel(command: PackingCommand) {
  return new PackingCommandSession(repo, { source: () => fixture().api, disposed: () => false }, packet(command));
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
    user: { username: 'Packing commands', email: 'local@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  }));
  await repo.session();
  native = (await repo.views()).ids.register('trip', live.trip_id);
  useTripStore.setState({ trip: { id: native, title: 'Local packing', user_id: 0 } as never });
  const cohort = createFamilyPlannerCohort(repo, { source: () => live.api, reportError: () => {} });
  api.defaults.adapter = createFamilyAxiosAdapter(cohort.handle);
  stop = installFamilyCommandRetention();
});
afterEach(async () => {
  stop?.();
  stop = undefined;
  api.defaults.adapter = originalAdapter;
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
describe.skipIf(!live)('real disposable Auth/MFA packing command and original queue contract', () => {
  it('validates real create defaults, personal ownership, repeated names and original retry', async () => {
    const p = await create(),
      first = await writes().execute(p);
    expect(first.item).toMatchObject({
      revision: 1,
      name: 'Web typed packing',
      quantity: 1,
      checked: false,
      packed_quantity: null,
      owner_person_id: null,
      is_private: false,
    });
    expect(await writes().execute(p)).toEqual(first);
    const second = await writes().execute(await create({ name: 'Web typed packing', visibility: 'personal' }));
    expect(second.item?.id).not.toBe(first.item?.id);
    expect(second.item).toMatchObject({ owner_person_id: fixture().person_id, is_private: true });
  });
  it('uses actual revisions for quantity, weight, partial packing, Trash and same-identity restore', async () => {
    const p = await create({
      name: 'Socks',
      quantity: 3,
      packed_quantity: 1,
      weight_grams: 20,
      bag_id: fixture().bag_id,
    });
    let row = (await writes().execute(p)).item;
    if (!row) throw new Error('Missing item');
    for (const values of [{ checked: true }, { packed_quantity: 1 }, { packed_quantity: null }]) {
      const out = await writes().execute(
        packingCommand.parse({
          ...p,
          operation_id: crypto.randomUUID(),
          action: 'packed-state',
          expected_revision: row.revision,
          values,
        })
      );
      row = out.item;
      if (!row) throw new Error('Missing item');
    }
    const updated = await writes().execute(
      packingCommand.parse({
        ...p,
        action: 'update',
        operation_id: crypto.randomUUID(),
        expected_revision: row.revision,
        values: { weight_grams: null, bag_id: null, quantity: 1 },
      })
    );
    row = updated.item;
    if (!row) throw new Error('Missing item');
    expect(row).toMatchObject({ quantity: 1, weight_grams: null, bag_id: null, checked: false, packed_quantity: null });
    for (const action of ['trash', 'restore']) {
      const out = await writes().execute(
        packingCommand.parse({
          ...p,
          action,
          operation_id: crypto.randomUUID(),
          expected_revision: row.revision,
          values: {},
        })
      );
      row = out.item;
      if (!row) throw new Error('Missing item');
      expect(row.id).toBe(p.target_id);
      expect(row.deleted_at === null).toBe(action === 'restore');
    }
  });
  it('accepts a no-op complete order and refuses a filtered subset without changing the canonical list', async () => {
    const view = await current();
    const p = packingCommand.parse({
      version: 1,
      operation_id: crypto.randomUUID(),
      scope: view.scope,
      action: 'reorder',
      target_id: null,
      expected_revision: null,
      expected_collection_revision: view.collection_revision,
      values: { ids: view.items.map((r) => r.id) },
    });
    expect((await writes().execute(p)).collection_revision).toBe(view.collection_revision);
    const partial = packingCommand.parse({ ...p, operation_id: crypto.randomUUID(), values: { ids: [] } });
    await expect(writes().execute(partial)).rejects.toMatchObject({ status: 409 });
    expect((await current()).items).toEqual(view.items);
  });
  it('refuses stale row revisions, a changed retry body and another travelers private item', async () => {
    const p = await create(),
      first = await writes().execute(p);
    if (!first.item) throw new Error('Missing item');
    const edit = packingCommand.parse({
      ...p,
      action: 'update',
      operation_id: crypto.randomUUID(),
      expected_revision: first.item.revision,
      values: { name: 'Newer name' },
    });
    await writes().execute(edit);
    await expect(
      writes().execute(packingCommand.parse({ ...edit, operation_id: crypto.randomUUID() }))
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      writes().execute(packingCommand.parse({ ...p, values: { name: 'Changed original intent' } }))
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      writes().execute(
        packingCommand.parse({
          ...edit,
          operation_id: crypto.randomUUID(),
          target_id: fixture().hidden_item_id,
          expected_revision: 1,
        })
      )
    ).rejects.toMatchObject({ status: 403 });
  });
  it('retains a lost real commit and generic queue replay reuses it without another row or native cache publication', async () => {
    const p = await create(),
      c = channel(p),
      before = (await current()).items.length,
      state = useTripStore.getState().packingItems;
    const handler = api.defaults.adapter;
    const real = createFamilyAxiosAdapter(
      createFamilyPlannerCohort(repo, { source: () => fixture().api, reportError: () => {} }).handle
    );
    api.defaults.adapter = async (config) => {
      await real(config);
      throw new Error('Lost after commit');
    };
    await expect(c.submit()).rejects.toThrow('Lost after commit');
    api.defaults.adapter = handler;
    expect((await current()).items).toHaveLength(before + 1);
    expect(await offlineDb.mutationQueue.count()).toBe(1);
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect((await current()).items).toHaveLength(before + 1);
    expect(useTripStore.getState().packingItems).toBe(state);
    expect(await offlineDb.packingItems.count()).toBe(0);
  });
  it('reconciles an actually redacted committed receipt without replaying or revealing the hidden item', async () => {
    const p = fixture().redacted_command,
      e = packet(p);
    await retainPackingIntent(captureWriteSession(), e, native);
    const receipt = await reads().receipt(p.scope, p.operation_id);
    expect(receipt).toMatchObject({ status: 'committed', result_redacted: true, result: null });
    expect(await channel(p).reconcile()).toBe('committed');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect((await current()).items.map((r) => r.id)).not.toContain(p.target_id);
  });
  it('keeps a real unknown receipt unresolved without a replacement UUID or new row', async () => {
    const p = await create(),
      before = await current();
    await retainPackingIntent(captureWriteSession(), packet(p), native);
    expect(await channel(p).reconcile()).toBe('unknown');
    expect((await offlineDb.mutationQueue.get(p.operation_id))?.body).toEqual(packet(p));
    expect((await current()).items).toEqual(before.items);
  });
  it('requires real MFA assurance for command writes', async () => {
    const p = await create();
    const low = createClient(fixture().api, fixture().anon_key, {
      global: { headers: { Authorization: 'Bearer ' + fixture().low_access_token } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const t = createPackingCommandTransport(async (name, args) => {
      const { data, error } = await low.rpc(name, args);
      if (error) throw error;
      return data;
    });
    await expect(t.execute(p)).rejects.toMatchObject({ status: 403 });
  });
  it('keeps native authorship, defaults, sharing and templates refused before any raw write', async () => {
    expect(plannerActionAvailable('packing_edit')).toBe(false);
    for (const suffix of ['', '/ensure-defaults', '/apply-template', '/bags', '/category-assignees', '/123/sharing'])
      await expect(
        api.post(`/trips/${fixture().trip_id}/packing${suffix}`, { name: 'Not connected' })
      ).rejects.toBeDefined();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
});
