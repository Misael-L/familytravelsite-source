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
import { createPackingBagCommandHandler } from './packingBagCommandHandler';
import { PackingBagCommandSession } from './packingBagCommandSession';
import { packingBagEnvelope, type PackingBagEnvelope } from './packingBagContract';
import { createPackingBagTransport, type PackingBagRpc } from './packingBagTransport';
import { createFamilyPlannerCohort } from './plannerCohort';
import { createPlannerPackingRecovery } from './plannerPackingRecovery';
import { FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter } from './transport';
const file = process.env.FAMILY_PACKING_BAG_FIXTURE;
const live = file
  ? (JSON.parse(readFileSync(file, 'utf8')) as {
      api: string;
      anon_key: string;
      access_token: string;
      aal1_token: string;
      trip_ids: string[];
      hidden_bags: Record<string, string>;
      family_id: string;
      user_id: string;
      person_id: string;
      editor_person_id: string;
      viewer_person_id: string;
    })
  : null;
if (live && live.api !== 'http://127.0.0.1:55831') throw Error('Refusing a non-disposable126 API');
const f = () => {
  if (!live) throw Error('Explicit local126 fixture required');
  return live;
};
let sdk: SupabaseClient,
  repo: FamilyFrontendRepository,
  stop: () => void,
  trip: string,
  index = 0;
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:55831' }));
const previous = api.defaults.adapter;
const identity = () => ({ trip_id: trip, family_id: f().family_id, user_id: f().user_id, person_id: f().person_id });
const transport = () => createPackingBagTransport();
const rawRpc: PackingBagRpc = async (name, args) => {
  const { data, error } = await sdk.rpc(name, args);
  if (error) throw error;
  return data;
};
function connect(token: string) {
  return createClient(f().api, f().anon_key, {
    global: { headers: { Authorization: 'Bearer ' + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function original(
  action: PackingBagEnvelope['command']['action'] = 'bag-create',
  id: string = crypto.randomUUID(),
  values: Record<string, unknown> = { name: 'SDK bag' }
) {
  const p = await transport().list(identity()),
    o = action === 'bag-create' ? null : await transport().observation(identity(), id, action === 'bag-restore');
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
      values,
    },
  });
}
async function create(name = 'SDK bag') {
  return transport().execute(await original('bag-create', crypto.randomUUID(), { name }));
}
beforeEach(async () => {
  if (!live) return;
  trip = live.trip_ids[index++];
  if (!trip) throw Error('Fresh synthetic Trip required');
  server.use(http.all(live.api + '/*', () => passthrough()));
  resetAllStores();
  await resetOfflineTestDatabase();
  installTestLocks();
  _resetNetworkMode();
  setAuthed(true);
  sdk = connect(live.access_token);
  repo = new FamilyFrontendRepository(
    async () => ({
      userId: live.user_id,
      familyId: live.family_id,
      personId: live.person_id,
      user: { username: 'Synthetic126 SDK', email: 'sdk@fixture.invalid', avatar_url: null, created_at: '2026-11-12' },
    }),
    undefined,
    () => ({ userId: live.user_id, familyId: live.family_id, personId: live.person_id, source: live.api })
  );
  await repo.session();
  const native = (await repo.views()).ids.register('trip', trip);
  useTripStore.setState({ trip: { id: native, title: 'Synthetic126', user_id: 0 } as never });
  api.defaults.adapter = createFamilyAxiosAdapter(
    createPackingBagCommandHandler(
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
describe.skipIf(!live)('strict126 real bag SDK/Auth/TOTP/PostgREST', () => {
  it('round-trips all five actions, clears, differential members, exact receipts and no-ops', async () => {
    const c = await create(),
      id = c.bag.id;
    const u = await transport().execute(
      await original('bag-update', id, { name: 'Updated bag', color: '#112233', weight_limit_grams: 1000 })
    );
    expect(u.bag.color).toBe('#112233');
    const clear = await transport().execute(
      await original('bag-update', id, { color: null, weight_limit_grams: null })
    );
    expect(clear.bag.name).toBe('Updated bag');
    expect(clear.bag.color).toBeNull();
    const people = [f().person_id, f().editor_person_id].sort(),
      p = await original('bag-members', id, { person_ids: people }),
      a = await transport().execute(p);
    expect(a.member_person_ids).toEqual(people);
    expect((await transport().receipt(p)).result).toEqual(a);
    expect(await transport().execute(p)).toEqual(a);
    expect((await transport().execute(await original('bag-members', id, { person_ids: people }))).changed).toBe(false);
    await transport().execute(await original('bag-members', id, { person_ids: [f().editor_person_id] }));
    await transport().execute(await original('bag-trash-empty', id, {}));
    expect((await transport().list(identity())).bags.some((o) => o.bag.id === id)).toBe(false);
    expect((await transport().trash(identity())).bags.some((o) => o.bag.id === id)).toBe(true);
    const restored = await transport().execute(await original('bag-restore', id, {}));
    expect(restored.bag.deleted_at).toBeNull();
    expect(restored.member_person_ids).toEqual([f().editor_person_id]);
  });
  it('preserves duplicate labels as distinct identities', async () => {
    const a = await create('Same bag'),
      b = await create('Same bag');
    expect(a.bag.id).not.toBe(b.bag.id);
    expect((await transport().list(identity())).bags.filter((o) => o.bag.name === 'Same bag')).toHaveLength(2);
  });
  it('publishes coherent bag/category snapshots through normal planner composition and routes owned commands', async () => {
    const cohort = createFamilyPlannerCohort(repo, { source: () => f().api, reportError: () => {} });
    try {
      api.defaults.adapter = createFamilyAxiosAdapter(cohort.handle);
      const before = await cohort.packingBags.load(trip, true);
      expect(before.categories?.collection_revision).toBe(before.bags.collection_revision);
      const a = await cohort.packingBags.submit(await original()),
        after = cohort.packingBags.snapshot();
      expect(after?.bags.bags.some((o) => o.bag.id === a.bag.id)).toBe(true);
      expect(after?.categories?.collection_revision).toBe(after?.bags.collection_revision);
      expect(Object.isFrozen(after?.bags)).toBe(true);
    } finally {
      cohort.dispose();
    }
  });
  it('keeps peer personal items hidden while preserving aggregate weight and refusing nonempty Trash', async () => {
    const p = await transport().list(identity()),
      id = f().hidden_bags[trip];
    expect(p.packing.items.some((i) => i.name === 'D2b hidden peer contents')).toBe(false);
    expect(p.packing.bags.find((b) => b.id === id)?.total_weight_grams).toBe(350);
    const before = await transport().observation(identity(), id),
      command = await original('bag-trash-empty', id, {});
    await expect(transport().execute(command)).rejects.toMatchObject({ status: 409 });
    expect(await transport().observation(identity(), id)).toEqual(before);
    expect((await transport().receipt(command)).status).toBe('unknown');
  });
  it('recovers a real committed response loss through typed receipt without another write', async () => {
    const p = await original();
    let writes = 0;
    const rpc: PackingBagRpc = async (name, args) => {
      const out = await rawRpc(name, args);
      if (name.startsWith('execute')) {
        writes++;
        throw Error('Synthetic lost reply');
      }
      return out;
    };
    api.defaults.adapter = createFamilyAxiosAdapter(
      createPackingBagCommandHandler(
        repo,
        () => f().api,
        () => false,
        rpc
      )
    );
    await expect(
      new PackingBagCommandSession(repo, { source: () => f().api, disposed: () => false }, p).submit()
    ).rejects.toBeDefined();
    expect((await offlineDb.mutationQueue.get(p.command.operation_id))?.body).toEqual(p);
    const pending = await createPlannerPackingRecovery(
      repo,
      trip,
      { source: () => f().api, current: () => true },
      undefined,
      { bagRpc: rawRpc }
    ).inspect();
    if (!pending) throw Error('Original bag recovery required');
    expect(await pending.check()).toBe('committed');
    expect(writes).toBe(1);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('rejects changed payload retry and cross-domain operation reuse', async () => {
    const p = await original();
    await transport().execute(p);
    const changed = structuredClone(p);
    if (changed.command.action !== 'bag-create') throw Error();
    changed.command.values.name = 'Another intent';
    await expect(transport().execute(changed)).rejects.toMatchObject({ status: 409 });
    const { error } = await sdk.rpc('execute_family_trip_packing_v1', {
      p_trip_id: trip,
      p_operation_id: p.command.operation_id,
      p_scope: p.command.scope,
      p_action: 'create',
      p_target_id: crypto.randomUUID(),
      p_expected_revision: null,
      p_expected_collection_revision: null,
      p_values: { name: 'Wrong domain' },
    });
    expect(error?.code).toBe('PT409');
    const receipt = await sdk.rpc('get_family_trip_packing_receipt_v1', {
      p_trip_id: trip,
      p_operation_id: p.command.operation_id,
    });
    expect(receipt.error).not.toBeNull();
  });
  it('rejects stale observations and leaves their receipt unknown', async () => {
    const a = await create(),
      p = await original('bag-update', a.bag.id, { name: 'Original intent' });
    await create();
    await expect(transport().execute(p)).rejects.toMatchObject({ status: 409 });
    expect((await transport().receipt(p)).status).toBe('unknown');
  });
  it('requires real reviewer assurance for reads, commands and receipts', async () => {
    const p = await original(),
      qualified = sdk;
    sdk = connect(f().aal1_token);
    try {
      await expect(transport().list(identity())).rejects.toBeDefined();
      await expect(transport().execute(p)).rejects.toBeDefined();
      await expect(transport().receipt(p)).rejects.toBeDefined();
    } finally {
      sdk = qualified;
    }
    expect((await transport().receipt(p)).status).toBe('unknown');
  });
  it('preserves original intent after real commit and owner disposal, then reconciles under fresh owner', async () => {
    const p = await original();
    let disposed = false,
      writes = 0;
    const rpc: PackingBagRpc = async (name, args) => {
      const out = await rawRpc(name, args);
      if (name.startsWith('execute')) {
        writes++;
        disposed = true;
      }
      return out;
    };
    api.defaults.adapter = createFamilyAxiosAdapter(
      createPackingBagCommandHandler(
        repo,
        () => f().api,
        () => disposed,
        rpc
      )
    );
    await expect(
      new PackingBagCommandSession(repo, { source: () => f().api, disposed: () => disposed }, p).submit()
    ).rejects.toBeDefined();
    expect((await offlineDb.mutationQueue.get(p.command.operation_id))?.body).toEqual(p);
    expect(
      await new PackingBagCommandSession(repo, { source: () => f().api, disposed: () => false }, p).reconcile()
    ).toBe('committed');
    expect(writes).toBe(1);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('round-trips bounded keyset Trash pages with database microseconds and exact IDs', async () => {
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const a = await create();
      ids.push(a.bag.id);
      await transport().execute(await original('bag-trash-empty', a.bag.id, {}));
    }
    const seen: string[] = [];
    let before = null;
    for (let i = 0; i < 4; i++) {
      const p = await transport().trash(identity(), 1, before);
      seen.push(...p.bags.map((o) => o.bag.id));
      if (!p.next_cursor) break;
      before = p.next_cursor;
    }
    expect(seen.sort()).toEqual(ids.sort());
    expect(new Set(seen).size).toBe(3);
  });
});
