import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'fake-indexeddb/auto';
import { http, passthrough } from 'msw';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api from '../../api/client';
import { offlineDb } from '../../db/offlineDb';
import { PACKING_TERMINAL_ARCHIVE_KEY as KEY } from '../../db/packingTerminalArchive';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode } from '../../sync/networkMode';
import { installFamilyCommandRetention } from '../../sync/retainedCommand';
import { captureWriteSession } from '../../sync/writeSession';
import { createPackingBagCommandHandler } from './packingBagCommandHandler';
import { packingBagEnvelope, type PackingBagEnvelope } from './packingBagContract';
import { PackingBagDependency } from './packingBagDependency';
import { createPackingBagTransport } from './packingBagTransport';
import { PackingCategoryAggregateCommandSession } from './packingCategoryAggregateCommandSession';
import { packingCategoryAggregateEnvelope } from './packingCategoryAggregateContract';
import { createPackingCategoryAggregateTransport } from './packingCategoryAggregateTransport';
import { createPackingCategoryV2Transport } from './packingCategoryV2Transport';
import { packingEnvelope } from './packingCommandContract';
import { PackingCommandSession } from './packingCommandSession';
import { createPackingCommandTransport } from './packingCommandTransport';
import { retainPackingIntent } from './packingIntentQueue';
import { packingRestoreRequest, type PackingRestoreEnvelope } from './packingTerminalContract';
import { PackingTerminalSettlement } from './packingTerminalSettlement';
import { createPackingTerminalTransport } from './packingTerminalTransport';
import { createPackingTransport } from './packingTransport';
import { createFamilyPlannerCohort } from './plannerCohort';
import { PlannerCohortPacking } from './plannerCohortPacking';
import { projectPacking } from './plannerPacking';
import { createPlannerPackingRecovery } from './plannerPackingRecovery';
import { FamilyFrontendRepository } from './repository';
import { createFamilyAxiosAdapter } from './transport';
const file = process.env.FAMILY_NATIVE_PACKING_FIXTURE;
const live = file
  ? (JSON.parse(readFileSync(file, 'utf8')) as {
      api: string;
      anon_key: string;
      access_token: string;
      trip_ids: string[];
      family_id: string;
      user_id: string;
      person_id: string;
      editor_person_id: string;
    })
  : null;
if (live && live.api !== 'http://127.0.0.1:55931') throw Error('Refusing a non-disposable127 API');
const f = () => {
  if (!live) throw Error('Explicit local127 fixture required');
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
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:55931' }));
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
      values: action === 'bag-create' ? { name: 'Équipage 東京 🧳' } : {},
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
    auth: { persistSession: false, autoRefreshToken: false, storageKey: 'native-bags-' + trip },
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
  useTripStore.setState({ trip: { id: native, title: 'Local127 dependency', user_id: 0 } as never });
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

const terminal = () => new PackingTerminalSettlement(repo, trip, { source: () => f().api, current: () => current });
async function retain(p: PackingRestoreEnvelope) {
  const native = repo.knownViews()!.ids.register('trip', trip);
  await retainPackingIntent(captureWriteSession(), p, native);
  await offlineDb.mutationQueue.update(p.command.operation_id, {
    status: 'conflict',
    lastError: 'Synthetic retained original',
  });
  return (await offlineDb.mutationQueue.get(p.command.operation_id))!;
}
async function plain(domain: 'item' | 'bag' | 'batch') {
  if (domain === 'bag') {
    const b = await bags().execute(await bagCommand('bag-create'));
    await bags().execute(await bagCommand('bag-trash-empty', b.bag.id));
    return await bagCommand('bag-restore', b.bag.id);
  }
  if (domain === 'item') {
    const i = await items().execute(
      (await itemCommand('create', crypto.randomUUID(), null, { name: 'Café 東京 ☕' })).command
    );
    if (!i.item) throw Error();
    const t = await items().execute((await itemCommand('trash', i.item.id, i.item.revision)).command);
    if (!t.item) throw Error();
    return await itemCommand('restore', t.item.id, t.item.revision);
  }
  const i = await items().execute(
    (await itemCommand('create', crypto.randomUUID(), null, { name: 'Équipement', category: 'Équipage 東京' })).command
  );
  if (!i.item) throw Error();
  const c = (await createPackingCategoryV2Transport().list(identity())).categories.find(
    (x) => x.name === 'Équipage 東京'
  );
  if (!c) throw Error();
  const o = await aggregates().observation(identity(), c.id);
  await aggregates().execute(
    packingCategoryAggregateEnvelope.parse({
      version: 3,
      source_url: f().api,
      view_layer: 'published',
      command: {
        version: 3,
        kind: 'packing-category-aggregate',
        operation_id: crypto.randomUUID(),
        scope: o.scope,
        action: 'category-trash-batch',
        target_id: c.id,
        expected_collection_revision: o.collection_revision,
        observed: o,
        values: {},
      },
    })
  );
  const d = await aggregates().observation(identity(), c.id, true);
  return packingCategoryAggregateEnvelope.parse({
    version: 3,
    source_url: f().api,
    view_layer: 'published',
    command: {
      version: 3,
      kind: 'packing-category-aggregate',
      operation_id: crypto.randomUUID(),
      scope: d.scope,
      action: 'category-restore-batch',
      target_id: c.id,
      expected_collection_revision: d.collection_revision,
      observed: d,
      values: {},
    },
  });
}
async function execute(p: PackingRestoreEnvelope) {
  const b = packingBagEnvelope.safeParse(p),
    a = packingCategoryAggregateEnvelope.safeParse(p);
  return b.success
    ? bags().execute(b.data)
    : a.success
      ? aggregates().execute(a.data)
      : items().execute(packingEnvelope.parse(p).command);
}
const C = 'supabase_db_family-modernization-20261112-d2c1b';
const sqlQuote = (s: string) => "'" + s.split("'").join("''") + "'";
const sqlValue = (v: unknown) =>
  v === null
    ? 'null'
    : typeof v === 'number'
      ? String(v)
      : typeof v === 'object'
        ? sqlQuote(JSON.stringify(v)) + '::jsonb'
        : sqlQuote(String(v));
function q(statement: string) {
  return execFileSync(
    'docker',
    ['exec', '-i', C, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1'],
    { input: statement, encoding: 'utf8' }
  ).trim();
}
async function hold(statement: string) {
  const claims = {
    sub: f().user_id,
    role: 'authenticated',
    aal: 'aal2',
    session_id: JSON.parse(Buffer.from(f().access_token.split('.')[1], 'base64url').toString()).session_id,
  };
  const p = spawn(
    'docker',
    ['exec', '-i', C, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1'],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  let output = '',
    errors = '';
  p.stderr.on('data', (b) => {
    errors += String(b);
  });
  const ready = new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      p.kill();
      reject(Error('Local SQL barrier timed out'));
    }, 15000);
    p.stdout.on('data', (b) => {
      output += String(b);
      const m = output.match(/held:(\d+)/);
      if (m) {
        clearTimeout(timeout);
        resolve(Number(m[1]));
      }
    });
    p.on('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    p.on('exit', (code) => {
      if (!output.includes('held:')) {
        clearTimeout(timeout);
        reject(Error('Local SQL barrier failed: ' + code + errors.slice(0, 100)));
      }
    });
  });
  p.stdin.write(
    "begin;select set_config('request.jwt.claims'," +
      sqlQuote(JSON.stringify(claims)) +
      ',true);set local role authenticated;do $held$begin perform ' +
      statement.replace(/^select /, '') +
      ";end $held$;select 'held:'||pg_backend_pid();\n"
  );
  const pid = await ready;
  return {
    pid,
    async release(commit = true) {
      const done = new Promise<void>((resolve, reject) =>
        p.on('exit', (code) => (code === 0 ? resolve() : reject(Error('Local transaction failed: ' + code))))
      );
      p.stdin.end((commit ? 'commit;' : 'rollback;') + '\n\\q\n');
      await done;
    },
  };
}
async function waiting(operation: string, blocker: number) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (
      q(
        'select exists(select 1 from pg_stat_activity where position(' +
          sqlQuote(operation) +
          'in query)>0 and ' +
          blocker +
          '=any(pg_blocking_pids(pid)))'
      ) === 't'
    )
      return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw Error('Competing real SDK request did not wait on the transaction');
}
function executeSql(p: PackingRestoreEnvelope) {
  const r = packingRestoreRequest(p),
    name =
      r.protocol === 'packing-item-v1'
        ? 'execute_family_trip_packing_v1'
        : r.protocol === 'packing-bag-v1'
          ? 'execute_family_trip_packing_bag_v1'
          : 'execute_family_trip_packing_category_aggregate_v3';
  return 'select public.' + name + '(' + Object.values(r.args).map(sqlValue).join(',') + ')';
}
function cancelSql(p: PackingRestoreEnvelope) {
  const r = packingRestoreRequest(p);
  return (
    'select public.cancel_family_trip_packing_restore_v1(' +
    [trip, p.command.operation_id, r.protocol, r.args].map(sqlValue).join(',') +
    ')'
  );
}
describe.skipIf(!live)('strict127 real terminal settlement SDK/Auth/TOTP', () => {
  for (const domain of ['item', 'bag', 'batch'] as const) {
    it(
      domain + ': permanently cancels a valid original, preserving Unicode server digest and original export',
      async () => {
        const p = await plain(domain),
          row = await retain(p);
        expect(await (await terminal().prepare(row.id)).cancel()).toBe('cancelled');
        expect(await offlineDb.mutationQueue.count()).toBe(0);
        const a = (await offlineDb.syncMeta.get(KEY))!.familyPackingTerminalArchive as {
          entries: Array<{ row: unknown }>;
        };
        expect(a.entries[0].row).toEqual(row);
        await expect(execute(p)).rejects.toMatchObject({ status: 409 });
      }
    );
    it(domain + ': original execution wins the actual shared transaction lock', async () => {
      const p = await plain(domain),
        row = await retain(p),
        held = await hold(executeSql(p));
      let done = false;
      const result = (await terminal().prepare(row.id)).cancel().then((x) => {
        done = true;
        return x;
      });
      try {
        await waiting('cancel_family_trip_packing_restore_v1', held.pid);
        expect(done).toBe(false);
      } finally {
        await held.release();
      }
      expect(await result).toBe('committed');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    });
    it(domain + ': cancellation wins and the delayed actual SDK execution rolls back', async () => {
      const p = await plain(domain),
        row = await retain(p),
        held = await hold(cancelSql(p));
      const result = execute(p).then(
        () => ({ ok: true }),
        (e) => ({ ok: false, status: e.status })
      );
      try {
        await waiting(
          packingRestoreRequest(p).protocol === 'packing-item-v1'
            ? 'execute_family_trip_packing_v1'
            : packingRestoreRequest(p).protocol === 'packing-bag-v1'
              ? 'execute_family_trip_packing_bag_v1'
              : 'execute_family_trip_packing_category_aggregate_v3',
          held.pid
        );
      } finally {
        await held.release();
      }
      expect(await result).toEqual({ ok: false, status: 409 });
      expect(await (await terminal().prepare(row.id)).check()).toBe('cancelled');
    });
  }
  it('replaces a stale category-batch restore only after terminal cancellation and a fresh explicit command', async () => {
    const x = await batchFixture(),
      draft = await dep().prepare(x.bag);
    if (draft.status !== 'prepared') throw Error();
    await draft.submit();
    await expect(aggregates().execute(x.child)).rejects.toMatchObject({ status: 409 });
    expect(await (await terminal().prepare(x.child.command.operation_id)).cancel()).toBe('cancelled');
    const replacement = await terminal().prepareReplacement(x.child.command.operation_id);
    expect(replacement.original.command.operation_id).not.toBe(x.child.command.operation_id);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(await replacement.submit()).toBe('committed');
    expect((await reads().list(identity())).items.some((i) => i.name === 'Batch dependent item')).toBe(true);
  });
  it('settles a cancelled dependency parent without removing the refused child', async () => {
    const x = await itemFixture(),
      draft = await dep().prepare(x.bag);
    if (draft.status !== 'prepared') throw Error();
    api.defaults.adapter = createFamilyAxiosAdapter(
      createPackingBagCommandHandler(
        repo,
        () => f().api,
        () => !current,
        async () => {
          throw Error('Before parent send');
        }
      )
    );
    await expect(draft.submit()).rejects.toThrow();
    const parent = (await offlineDb.mutationQueue.toArray()).find((r) => r.familyPackingDependency)!;
    expect(await (await terminal().prepare(parent.id)).cancel()).toBe('cancelled');
    expect(await offlineDb.mutationQueue.toArray()).toEqual([x.row]);
  });
  it('recovers a lost server cancellation response using lookup alone after restart', async () => {
    const p = await plain('bag'),
      row = await retain(p);
    let writes = 0;
    const transport = createPackingTerminalTransport(async (name, args) => {
      const { data, error } = await sdk.rpc(name, args);
      if (error) throw error;
      if (name.startsWith('cancel')) {
        writes++;
        throw Error('Lost terminal reply');
      }
      return data;
    });
    const m = new PackingTerminalSettlement(
      repo,
      trip,
      { source: () => f().api, current: () => current },
      { terminal: transport }
    );
    await expect((await m.prepare(row.id)).cancel()).rejects.toThrow('Lost terminal reply');
    expect(await offlineDb.mutationQueue.toArray()).toEqual([row]);
    expect(await (await recovery().inspect())?.check()).toBe('cancelled');
    expect(writes).toBe(1);
  });
  it('retains a postcommit owner-retired original and permits fresh-owner terminal recovery', async () => {
    const p = await plain('item'),
      row = await retain(p);
    const transport = createPackingTerminalTransport(async (name, args) => {
      const { data, error } = await sdk.rpc(name, args);
      if (error) throw error;
      if (name.startsWith('cancel')) current = false;
      return data;
    });
    const m = new PackingTerminalSettlement(
      repo,
      trip,
      { source: () => f().api, current: () => current },
      { terminal: transport }
    );
    await expect((await m.prepare(row.id)).cancel()).rejects.toBeDefined();
    expect(await offlineDb.mutationQueue.toArray()).toEqual([row]);
    current = true;
    expect(await (await terminal().pending())?.check()).toBe('cancelled');
  });
  it('refuses cancellation under a genuinely expired Auth session while retaining its original and pending decision', async () => {
    const p = await plain('item'),
      row = await retain(p);
    const sid = JSON.parse(Buffer.from(f().access_token.split('.')[1], 'base64url').toString()).session_id;
    try {
      q("update auth.sessions set not_after=clock_timestamp()-interval '1 second'where id=" + sqlQuote(sid));
      await expect((await terminal().prepare(row.id)).cancel()).rejects.toMatchObject({ status: 403 });
      expect(await offlineDb.mutationQueue.toArray()).toEqual([row]);
    } finally {
      q('update auth.sessions set not_after=null where id=' + sqlQuote(sid));
    }
  });
});

async function nativeWriter() {
  const p = await bags().list(identity());
  const w = new PlannerCohortPacking(repo, {
    bags: true,
    source: () => f().api,
    disposed: () => !current,
    allowed: () => true,
  });
  const projection = projectPacking(
    p.packing,
    repo.knownViews()!.ids,
    p.people.map((p) => ({ personId: p.id, displayName: p.display_name }))
  );
  w.publish(p.packing, projection);
  useTripStore.setState({ packingItems: projection.items });
  return w;
}
describe.skipIf(!live)('actual local127 native bag port and handlers', () => {
  it('creates duplicate-name bags with independent identities and saves metadata through original origins', async () => {
    const w = await nativeWriter(),
      n = repo.knownViews()!.ids.register('trip', trip);
    await w.bags!.bind(n, null).save({ name: 'Native cabin' });
    await w.bags!.bind(n, null).save({ name: 'Native cabin' });
    expect(w.snapshot()!.bags).toHaveLength(2);
    expect(new Set(w.snapshot()!.bags.map((b) => b.id)).size).toBe(2);
    await w
      .bags!.bind(n, w.snapshot()!.bags[0])
      .save({ name: 'Native renamed', color: '#112233', weight_limit_grams: 8000 });
    expect((await bags().list(identity())).packing.bags[0]).toMatchObject({
      name: 'Native renamed',
      color: '#112233',
      weight_limit_grams: 8000,
    });
  });
  it('differentially assigns actual Family People using the native identity registry', async () => {
    const w = await nativeWriter(),
      ids = repo.knownViews()!.ids,
      n = ids.register('trip', trip);
    await w.bags!.bind(n, null).save({ name: 'Carried' });
    const people = await w.bags!.people(n);
    expect(people.length).toBeGreaterThan(1);
    await w.bags!.bind(n, w.snapshot()!.bags[0]).members(people.filter((p) => p.eligible).map((p) => p.id));
    const b = (await bags().list(identity())).bags[0];
    expect(b.member_person_ids.length).toBe(people.filter((p) => p.eligible).length);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('uses empty-only Trash then paginated recovery to restore the same actual bag identity', async () => {
    const w = await nativeWriter(),
      n = repo.knownViews()!.ids.register('trip', trip);
    await w.bags!.bind(n, null).save({ name: 'Recoverable' });
    const b = w.snapshot()!.bags[0];
    await w.bags!.bind(n, b).trash();
    expect((await bags().list(identity())).bags).toEqual([]);
    const p = await w.bags!.trashPage();
    expect(p.bags).toHaveLength(1);
    await w.bags!.restore(p, 0);
    expect(w.snapshot()!.bags[0].id).toBe(b.id);
  });
  it('refuses nonempty deletion without unassigning the actual item or erasing the bag', async () => {
    const b = await bags().execute(await bagCommand('bag-create'));
    await items().execute(
      (await itemCommand('create', crypto.randomUUID(), null, { name: 'Keep bag link', bag_id: b.bag.id })).command
    );
    const w = await nativeWriter(),
      n = repo.knownViews()!.ids.register('trip', trip);
    await expect(w.bags!.bind(n, w.snapshot()!.bags[0]).trash()).rejects.toBeDefined();
    const p = await bags().list(identity());
    expect(p.bags[0].bag.id).toBe(b.bag.id);
    expect(p.packing.items[0].bag_id).toBe(b.bag.id);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('retires an actual stale editor rather than sending newer observed facts under its old identity', async () => {
    const w = await nativeWriter(),
      n = repo.knownViews()!.ids.register('trip', trip);
    await w.bags!.bind(n, null).save({ name: 'Before' });
    const o = w.bags!.bind(n, w.snapshot()!.bags[0]);
    const remote = await bagCommand('bag-trash-empty', (await bags().list(identity())).bags[0].bag.id);
    await bags().execute(
      packingBagEnvelope.parse({
        ...remote,
        command: { ...remote.command, action: 'bag-update', values: { name: 'Newer' } },
      })
    );
    await expect(o.save({ name: 'Stale' })).rejects.toBeDefined();
    expect((await bags().list(identity())).bags[0].bag.name).toBe('Newer');
  });
  it('lists the exact missing parent, restores it deliberately and leaves the child original intact', async () => {
    const pair = await itemFixture();
    await terminal().prepare(pair.row!.id);
    const choices = await dep().candidates();
    expect(choices).toEqual([{ id: pair.bag, name: expect.any(String) }]);
    const prepared = await dep().prepare(choices[0].id);
    if (prepared.status !== 'prepared') throw Error('Expected parent decision');
    await prepared.submit();
    expect((await offlineDb.mutationQueue.toArray())[0]).toEqual(pair.row);
  });
});

describe.skipIf(!live)('actual hidden occupancy remains protected', () => {
  it('refuses a zero-weight private occupant without leaking it or deleting/unassigning its bag', async () => {
    const b = await bags().execute(await bagCommand('bag-create'));
    q(
      'insert into public.packing_items(trip_id,name,bag_id,is_private,owner_person_id)values(' +
        sqlQuote(trip) +
        ",'Private hidden occupant'," +
        sqlQuote(b.bag.id) +
        ',true,' +
        sqlQuote(f().editor_person_id) +
        ')'
    );
    const w = await nativeWriter(),
      n = repo.knownViews()!.ids.register('trip', trip);
    expect(w.snapshot()!.items).toEqual([]);
    expect(w.snapshot()!.bags[0].total_weight_grams).toBe(0);
    await expect(w.bags!.bind(n, w.snapshot()!.bags[0]).trash()).rejects.toBeDefined();
    expect((await bags().list(identity())).bags[0].bag.deleted_at).toBeNull();
    expect(await offlineDb.mutationQueue.count()).toBe(1);
    expect(
      q('select count(*)from public.packing_items where trip_id=' + sqlQuote(trip) + 'and bag_id=' + sqlQuote(b.bag.id))
    ).toBe('1');
  });
});
