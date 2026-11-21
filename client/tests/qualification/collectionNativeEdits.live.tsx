import { getSupabaseBrowserClient } from '@family/backend/supabase/client';
import type { CollectionRpc } from '@family/backend/supabase/collectionRpc';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { offlineDb } from '../../src/db/offlineDb';
import { parseCollectionQueueRow } from '../../src/integrations/family/collectionCommandQueue';
import { CollectionCommandSession } from '../../src/integrations/family/collectionCommandSession';
import {
  openCollectionNativeEditor,
  openCollectionNativeOrder,
} from '../../src/integrations/family/collectionNativeEdits';
import { createCollectionReadSession } from '../../src/integrations/family/collectionReadSession';
import { createCollectionTransport } from '../../src/integrations/family/collectionTransport';
import { FamilyIdentityRegistry } from '../../src/integrations/family/identity';
import { collectionDevice, commandActor, commandManual } from '../helpers/collectionCommandFixture';
type Token = { access_token: string; refresh_token: string };
type Fixture = {
  source: string;
  directory: string;
  bridge: string;
  anon_key: string;
  family_id: string;
  shared_root: string;
  root_ids: string[];
  sources: Record<string, string>;
  sessions: Record<string, { user_id: string; person_id: string; session: Token }>;
};
export function registerCollectionNativeEditsLive() {
  const file = process.env.FAMILY_COLLECTION_NATIVE_EDIT_FIXTURE;
  // Declare (but skip) the SDK cases in ordinary runs, rather than leaving an empty test file.
  const f: Fixture = file
    ? JSON.parse(readFileSync(file, 'utf8'))
    : {
        source: '',
        directory: '',
        bridge: '',
        anon_key: '',
        family_id: '',
        shared_root: '',
        root_ids: [],
        sources: {},
        sessions: {},
      };
  if (
    file &&
    (f.source !== 'https://fixture.invalid' ||
      !resolve(file).startsWith('/private/tmp/') ||
      resolve(f.bridge) !== resolve(f.directory, 'bridge.py'))
  )
    throw Error('Explicit owned fixture required');
  let sdk: SupabaseClient,
    device: Awaited<ReturnType<typeof collectionDevice>>,
    commands: CollectionCommandSession,
    reads: ReturnType<typeof createCollectionReadSession>,
    ids: FamilyIdentityRegistry,
    scope = commandActor,
    index = 0,
    epoch = 0;
  let drop: string | null = null,
    pause: string | null = null,
    release: (() => void) | null = null;
  const calls: string[] = [],
    clients: SupabaseClient[] = [];
  const assertCurrent = () => {
    if (epoch !== 0) throw Error('Original owner lifetime ended');
  };
  function bridge(data: unknown): Promise<{ status: number; body: unknown }> {
    return new Promise((ok, fail) => {
      const p = spawn('python3', [f.bridge], {
        env: { ...process.env, FAMILY_COLLECTION_RECOVERY_FIXTURE_DIR: f.directory },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let out = '';
      p.stdout.on('data', (b) => {
        out += String(b);
      });
      p.stderr.on('data', () => {});
      p.on('error', () => fail(Error('Owned bridge failed')));
      p.on('close', (code) => {
        if (code !== 0) return fail(Error('Owned bridge failed'));
        try {
          ok(JSON.parse(out));
        } catch {
          fail(Error('Invalid owned response'));
        }
      });
      p.stdin.end(JSON.stringify(data));
    });
  }
  async function client(who: string) {
    const s = createClient(f.source, f.anon_key, {
      auth: {
        autoRefreshToken: false,
        storageKey: `collection-native-fixture-${crypto.randomUUID()}`,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: async (input, init) => {
          const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
          if (
            u.origin !== f.source ||
            u.search ||
            u.hash ||
            (u.pathname !== '/auth/v1/user' && !/^\/rest\/v1\/rpc\/[a-z0-9_]+$/.test(u.pathname))
          )
            throw Error('Non-owned request refused');
          calls.push(u.pathname);
          const r = await bridge({
            path: u.pathname,
            method: init?.method ?? 'GET',
            body: init?.body ? JSON.parse(String(init.body)) : null,
            headers: Object.fromEntries(new Headers(init?.headers).entries()),
          });
          if (pause && u.pathname.endsWith('/' + pause))
            await new Promise<void>((r) => {
              release = r;
            });
          if (drop && u.pathname.endsWith('/' + drop)) throw Error('Reply lost after actual server response');
          return new Response(JSON.stringify(r.body), {
            status: r.status,
            headers: { 'content-type': 'application/json' },
          });
        },
      },
    });
    clients.push(s);
    if ((await s.auth.setSession(f.sessions[who].session)).error) throw Error('Local Auth unavailable');
    return s;
  }
  const retainedOperation = (value: string | null) => {
    if (value === null) throw Error('Expected retained original operation');
    return value;
  };
  const owner = () => ({ reads, commands, ids, assertCurrent });
  const open = async (item: string) => {
    await reads.detail(scope.collection_id);
    return openCollectionNativeEditor(owner(), scope.collection_id, item);
  };
  const fresh = async () => (await reads.detail(scope.collection_id)).items;
  const original = async () => parseCollectionQueueRow((await offlineDb.mutationQueue.toArray())[0]).packet;
  async function manual() {
    const op = await commands.retainContent(commandManual());
    const r = await commands.run(op, 'retry');
    if (!('view' in r) || !('items' in r.view)) throw Error('Expected content');
    return r.view.items[r.view.items.length - 1].id;
  }
  async function peerEdit(action: string, body: Record<string, unknown>, who = 'member') {
    const s = await client(who),
      claims = JSON.parse(
        atob(f.sessions[who].session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
      ) as { session_id: string };
    const actor = {
      ...scope,
      user_id: f.sessions[who].user_id,
      person_id: f.sessions[who].person_id,
      session_id: claims.session_id,
    };
    const rpc: CollectionRpc = async (name, args) => {
      const r = await s.rpc(name, args);
      if (r.error) throw r.error;
      return r.data;
    };
    const transport = createCollectionTransport(f.source, rpc);
    const target: Parameters<typeof transport.context>[1] = 'item_id' in body ? { item_id: String(body.item_id) } : {};
    const ctx = await transport.context(actor, target, () => {}),
      operation_id = crypto.randomUUID();
    const p = await transport.prepare(
      { scope: ctx.scope, operation_id, intent: { action, body }, observation: ctx.observation } as Parameters<
        typeof transport.prepare
      >[0],
      () => {}
    );
    await transport.execute(actor, operation_id, p.original, () => {});
  }
  describe.skipIf(!file)('actual SDK native editor observation and retirement prerequisite', () => {
    beforeEach(async () => {
      epoch = 0;
      drop = pause = null;
      release = null;
      calls.length = 0;
      index++;
      sdk = await client('owner');
      vi.mocked(getSupabaseBrowserClient).mockReturnValue(sdk);
      const claims = JSON.parse(
        atob(f.sessions.owner.session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
      ) as { session_id: string };
      scope = {
        version: 1,
        user_id: f.sessions.owner.user_id,
        person_id: f.sessions.owner.person_id,
        family_id: f.family_id,
        session_id: claims.session_id,
        collection_id: index === 1 ? f.shared_root : f.root_ids[index],
      };
      device = await collectionDevice(scope);
      ids = new FamilyIdentityRegistry(scope.user_id);
      const { collection_id: _id, ...actor } = scope;
      reads = createCollectionReadSession({ scope: actor, source_url: f.source, ids, assertCurrent });
      commands = new CollectionCommandSession({ scope, source_url: f.source, assertCurrent, publish: () => {} });
    });
    afterEach(async () => {
      drop = pause = null;
      release?.();
      commands.retire();
      reads.retire();
      for (const c of clients.splice(0)) await c.auth.stopAutoRefresh();
      await device.close();
      vi.restoreAllMocks();
    });
    it('refuses a genuinely stale other-member edit without replacing the displayed revision', async () => {
      const item = await manual(),
        editor = await open(item),
        seen = editor.selection;
      await peerEdit('edit', { item_id: item, changes: { notes: 'Peer changed' } });
      await expect(editor.save({ notes: 'My older draft' })).rejects.toMatchObject({ status: 409 });
      const op = retainedOperation(editor.operationId);
      const packet = await original();
      expect(packet.kind === 'content' && packet.preparation.observation).toEqual(seen.observation);
      await expect(editor.save({ notes: 'Replacement' })).rejects.toMatchObject({ status: 409 });
      expect(editor.operationId).toBe(op);
      expect((await fresh())[0].native.notes).toBe('Peer changed');
      expect((await commands.run(op, 'cancel')).status).toBe('cancelled');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }, 60000);
    it('conflicts against a changed complete order instead of observing at drop time', async () => {
      const a = await manual(),
        b = await manual(),
        order = await openCollectionNativeOrder(owner(), scope.collection_id);
      await peerEdit('reorder', { ordered_ids: [b, a] }, 'owner');
      await expect(order.save(order.initial.map((x) => x.native.id))).rejects.toMatchObject({ status: 409 });
      const p = await original();
      expect(p.kind === 'content' && p.preparation.observation).toEqual(order.selection.observation);
      expect((await fresh()).map((x) => x.canonical.id)).toEqual([b, a]);
      await commands.run(retainedOperation(order.operationId), 'cancel');
    }, 60000);
    it('maps supported native edit fields to the real saved result with description and notes independent', async () => {
      const item = await manual(),
        editor = await open(item);
      const r = await editor.save({
        name: 'Saved native name',
        description: 'Catalog-like description',
        notes: 'My personal notes',
        lat: 21.12345678,
        lng: -100.12345678,
        address: 'Venue street',
      });
      expect(r.item?.native).toMatchObject({
        name: 'Saved native name',
        description: 'Catalog-like description',
        notes: 'My personal notes',
        lat: 21.12345678,
        lng: -100.12345678,
        address: 'Venue street',
      });
      expect((await fresh())[0].native).toEqual(r.item?.native);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }, 60000);
    it('recovers a lost actual execute reply with one retained operation and refuses a replacement draft', async () => {
      const item = await manual(),
        editor = await open(item);
      drop = 'execute_family_collection_content_v1';
      await expect(editor.save({ notes: 'Original draft' })).rejects.toBeDefined();
      const op = retainedOperation(editor.operationId);
      await expect(editor.save({ notes: 'Replacement' })).rejects.toMatchObject({ status: 409 });
      drop = null;
      expect((await editor.save({ notes: 'Original draft' })).item?.native.notes).toBe('Original draft');
      expect(editor.operationId).toBe(op);
      expect(await fresh()).toHaveLength(1);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }, 60000);
    it('refuses a superseded editor before retaining or mutating', async () => {
      const item = await manual(),
        editor = await open(item);
      await reads.editor(scope.collection_id, item);
      const count = calls.length;
      await expect(editor.save({ notes: 'Old editor' })).rejects.toMatchObject({ status: 409 });
      expect(calls).toHaveLength(count);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect(editor.initial.native.notes).toBe('Personal');
    }, 60000);
    it('materializes the displayed reference then saves status only from a newly opened editor', async () => {
      const op = await commands.retainContent({
        action: 'create_reference',
        body: { source: { kind: 'food', id: f.sources.food }, notes: 'Personal', status: 'idea' },
      });
      const r = await commands.run(op, 'retry');
      if (!('view' in r) || !('items' in r.view)) throw Error('Expected items');
      const item = r.view.items[0].id;
      const editor = await open(item);
      expect((await editor.materialize()).item?.canonical.content_mode).toBe('snapshot');
      await expect(editor.setStatus('visited')).rejects.toMatchObject({ status: 409 });
      expect((await (await open(item)).setStatus('visited')).item?.native.status).toBe('visited');
    }, 60000);
    it('fences an A-to-B-to-A owner lifetime without losing the displayed values', async () => {
      const item = await manual(),
        editor = await open(item);
      epoch++;
      epoch++;
      const count = calls.length;
      await expect(editor.save({ notes: 'Late draft' })).rejects.toThrow('Original owner lifetime ended');
      expect(calls).toHaveLength(count);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect(editor.initial.native.notes).toBe('Personal');
    }, 60000);
    it('stops dispatch after an actual delayed prepare reply but permits parent recovery and cancellation', async () => {
      const item = await manual(),
        editor = await open(item);
      pause = 'prepare_family_collection_content_v1';
      const before = calls.filter((x) => x.endsWith('/execute_family_collection_content_v1')).length;
      const saving = editor.save({ notes: 'Retired draft' }),
        rejected = expect(saving).rejects.toMatchObject({ status: 409 });
      await vi.waitFor(() => expect(release).not.toBeNull(), { timeout: 15000 });
      editor.retire();
      pause = null;
      release?.();
      await rejected;
      expect(calls.filter((x) => x.endsWith('/execute_family_collection_content_v1'))).toHaveLength(before);
      const op = retainedOperation(editor.operationId);
      expect((await commands.pending()).map((x) => x.packet.operation_id)).toContain(op);
      await commands.run(op, 'check');
      expect((await commands.run(op, 'cancel')).status).toBe('cancelled');
      expect((await fresh())[0].native.notes).toBe('Personal');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }, 60000);
  });
}
