import { getSupabaseBrowserClient } from '@family/backend/supabase/client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CollectionIdentity,
  CollectionLifecycleOriginal,
  CollectionPreparation,
} from '../../src/integrations/family/collectionContract';
import {
  createCollectionTransport,
  normalizeCollectionIntent,
} from '../../src/integrations/family/collectionTransport';

type Session = { access_token: string; refresh_token: string };
type Fixture = {
  source: string;
  directory: string;
  bridge: string;
  anon_key: string;
  family_id: string;
  root_ids: string[];
  sources: Record<string, string>;
  private_media_id: string;
  sessions: Record<string, { user_id: string; person_id: string; session: Session }>;
  fresh: Session;
};
export function registerCollectionTransportLive() {
  const file = process.env.FAMILY_COLLECTION_TRANSPORT_FIXTURE;
  if (!file) return;
  const f = JSON.parse(readFileSync(file, 'utf8')) as Fixture;
  if (
    f.source !== 'https://fixture.invalid' ||
    !resolve(file).startsWith('/private/tmp/') ||
    resolve(f.bridge) !== resolve(f.directory, 'bridge.py')
  )
    throw Error('Explicit owned compact fixture required');
  let sdk: SupabaseClient,
    index = 0,
    collection = '',
    currentKey = 'owner',
    fresh = false;
  let drop: ((path: string, body: Record<string, unknown>) => boolean) | null = null;
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
      p.on('error', () => fail(Error('Owned SDK bridge failed')));
      p.on('close', (code) => {
        if (code !== 0) return fail(Error('Owned SDK bridge failed'));
        try {
          ok(JSON.parse(out));
        } catch {
          fail(Error('Invalid owned SDK bridge response'));
        }
      });
      p.stdin.end(JSON.stringify(data));
    });
  }
  const actor = (): CollectionIdentity => {
    const u = f.sessions[currentKey],
      session = fresh ? f.fresh : u.session;
    const claims = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
      session_id: string;
    };
    return {
      version: 1,
      family_id: f.family_id,
      collection_id: collection,
      user_id: u.user_id,
      person_id: currentKey === 'global_admin' ? null : u.person_id,
      session_id: claims.session_id,
    };
  };
  const api = () => createCollectionTransport(f.source),
    fence = () => {};
  async function signIn(key = 'owner', useFresh = false) {
    currentKey = key;
    fresh = useFresh;
    sdk = createClient(f.source, f.anon_key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: {
        fetch: async (input, init) => {
          const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
          if (url.origin !== f.source || url.search || url.hash) throw Error('External SDK request refused');
          const method = init?.method ?? 'GET',
            body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
          if (url.pathname !== '/auth/v1/user' && !/^\/rest\/v1\/rpc\/[a-z0-9_]+$/.test(url.pathname))
            throw Error('Non-RPC SDK request refused');
          const result = await bridge({
            path: url.pathname,
            method,
            body,
            headers: Object.fromEntries(new Headers(init?.headers).entries()),
          });
          if (body && drop?.(url.pathname, body)) throw Error('Simulated lost response after real database commit');
          return new Response(JSON.stringify(result.body), {
            status: result.status,
            headers: { 'content-type': 'application/json' },
          });
        },
      },
    });
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(sdk);
    const session = useFresh ? f.fresh : f.sessions[key].session;
    const result = await sdk.auth.setSession(session);
    if (result.error) throw Error('Real owned Auth session could not be installed');
  }
  async function request(intent: ReturnType<typeof normalizeCollectionIntent>): Promise<CollectionPreparation> {
    let target: Parameters<ReturnType<typeof createCollectionTransport>['context']>[1] = {};
    if ('source' in intent.body) target = { source: intent.body.source };
    else if ('item_id' in intent.body) target = { item_id: intent.body.item_id };
    const ctx = await api().context(actor(), target, fence);
    return { scope: ctx.scope, operation_id: crypto.randomUUID(), intent, observation: ctx.observation };
  }
  function manual(extra: Record<string, unknown> = {}) {
    return normalizeCollectionIntent({
      action: 'create_manual',
      body: {
        content: {
          name: 'SDK manual',
          description: 'Independent description',
          latitude: null,
          longitude: null,
          address: null,
          website: null,
          phone: null,
          family_place_category_id: null,
          cover_media_id: null,
          ...extra,
        },
        notes: 'Personal note',
        status: 'idea',
      },
    });
  }
  async function save(intent = manual()) {
    const req = await request(intent);
    const p = await api().prepare(req, fence);
    const result = await api().execute(actor(), req.operation_id, p.original, fence);
    return { req, original: p.original, result };
  }
  async function lifecycle(item: string | null, action: 'trash' | 'restore'): Promise<CollectionLifecycleOriginal> {
    const ctx = await api().recoveryContext(
      actor(),
      item === null && action === 'restore' ? 'trash' : 'active',
      item,
      fence
    );
    return item === null
      ? {
          target_kind: 'collection',
          collection_id: collection,
          scope: ctx.scope,
          action,
          expected_revision: ctx.collection_revision,
        }
      : {
          target_kind: 'item',
          collection_id: collection,
          scope: ctx.scope,
          action,
          expected_revision: ctx.item!.revision,
          item_id: item,
          expected_collection_revision: ctx.content_revision,
        };
  }
  describe('real Collection SDK to owned GoTrue/REST/database', () => {
    beforeEach(async () => {
      collection = f.root_ids[index++];
      if (!collection) throw Error('Synthetic Collection fixture exhausted');
      drop = null;
      await signIn();
    });
    afterEach(async () => {
      drop = null;
      await sdk?.auth.stopAutoRefresh();
    });
    it('reads all eight typed catalog kinds with source identity intact', async () => {
      for (const kind of ['country', 'place', 'food', 'hotel', 'experience', 'airport', 'airline', 'guide'] as const) {
        await save(
          normalizeCollectionIntent({
            action: 'create_reference',
            body: { source: { kind, id: f.sources[kind] }, notes: 'Own notes', status: 'idea' },
          })
        );
      }
      const p = await api().all(actor(), 'active', fence);
      expect(p.items).toHaveLength(8);
      expect(p.items.map((x) => x.kind).sort()).toEqual(Object.keys(f.sources).sort());
      expect(p.items.filter((x) => !x.native_location_compatible)).toHaveLength(4);
      const food = p.items.find((x) => x.kind === 'food')!;
      expect(food.content.latitude).toBe(21.12345678);
      expect(food.content.latitude).not.toBe(p.items.find((x) => x.kind === 'place')!.content.latitude);
      expect(food.notes).toBe('Own notes');
    }, 60000);
    it('creates/edits a manual item and keeps description separate from personal notes', async () => {
      const a = await save(
        manual({ website: 'https://example.invalid', latitude: 1.123456789, longitude: 2.123456789 })
      );
      const row = (await api().editor(actor(), a.original.target_item_id!, 'active', fence)).item;
      expect(row.content.website).toBe('https://example.invalid/');
      expect(row.content.latitude).toBe(1.12345679);
      await save(
        normalizeCollectionIntent({
          action: 'edit',
          body: { item_id: row.id, changes: { description: '', notes: null, address: null } },
        })
      );
      const changed = (await api().editor(actor(), row.id, 'active', fence)).item;
      expect(changed.content.description).toBe('');
      expect(changed.notes).toBeNull();
    });
    it('materializes a reference, preserves notes and supports an observed no-op', async () => {
      const a = await save(
        normalizeCollectionIntent({
          action: 'create_reference',
          body: { source: { kind: 'food', id: f.sources.food }, notes: 'Personal', status: 'want' },
        })
      );
      const item = a.original.target_item_id!;
      await save(normalizeCollectionIntent({ action: 'materialize', body: { item_id: item } }));
      const p = (await api().editor(actor(), item, 'active', fence)).item;
      expect(p.content_mode).toBe('snapshot');
      expect(p.content.description).toBe('Catalog description');
      expect(p.notes).toBe('Personal');
      const noop = await save(normalizeCollectionIntent({ action: 'materialize', body: { item_id: item } }));
      expect(noop.result.changed).toBe(false);
    });
    it('creates a server-derived snapshot and exact canonical membership', async () => {
      const a = await save(
        normalizeCollectionIntent({
          action: 'create_snapshot',
          body: { source: { kind: 'food', id: f.sources.food }, notes: 'Snapshot notes', status: 'want' },
        })
      );
      expect((await api().editor(actor(), a.original.target_item_id!, 'active', fence)).item.content_mode).toBe(
        'snapshot'
      );
      const { collection_id: _collection, ...owner } = actor();
      const m = await api().membership(owner, { kind: 'food', id: f.sources.food }, fence);
      expect(m.saved).toBe(true);
      expect(m.lists.some((x) => x.collection_id === collection && x.item_id === a.original.target_item_id)).toBe(true);
    });
    it('changes status, no-ops identical status and requires complete order', async () => {
      const a = await save(),
        b = await save();
      await save(
        normalizeCollectionIntent({
          action: 'status',
          body: { item_id: a.original.target_item_id!, status: 'visited' },
        })
      );
      const noop = await save(
        normalizeCollectionIntent({
          action: 'status',
          body: { item_id: a.original.target_item_id!, status: 'visited' },
        })
      );
      expect(noop.result.changed).toBe(false);
      await save(
        normalizeCollectionIntent({
          action: 'reorder',
          body: { ordered_ids: [b.original.target_item_id!, a.original.target_item_id!] },
        })
      );
      expect((await api().all(actor(), 'active', fence)).items.map((x) => x.id)).toEqual([
        b.original.target_item_id,
        a.original.target_item_id,
      ]);
    });
    it('recovers the exact original after a real preparation reply is lost', async () => {
      const req = await request(manual());
      drop = (p, b) => p.endsWith('/prepare_family_collection_content_v1') && b.p_operation_id === req.operation_id;
      await expect(api().prepare(req, fence)).rejects.toBeDefined();
      drop = null;
      const found = await api().outcome(actor(), req.operation_id, fence);
      if (found.status !== 'prepared') throw Error('Prepared original missing');
      const retry = await api().prepare(req, fence);
      expect(retry.original).toEqual(found.original);
      await api().execute(actor(), req.operation_id, retry.original, fence);
      expect((await api().all(actor(), 'active', fence)).items).toHaveLength(1);
    });
    it('discovers one commit after a real execution reply is lost', async () => {
      const req = await request(manual()),
        p = await api().prepare(req, fence);
      drop = (path, b) =>
        path.endsWith('/execute_family_collection_content_v1') && b.p_operation_id === req.operation_id;
      await expect(api().execute(actor(), req.operation_id, p.original, fence)).rejects.toBeDefined();
      drop = null;
      expect((await api().outcome(actor(), req.operation_id, fence, p.original)).status).toBe('committed');
      await api().execute(actor(), req.operation_id, p.original, fence);
      expect((await api().all(actor(), 'active', fence)).items).toHaveLength(1);
    });
    it('supports fresh-session discovery/cancellation, refusing old-session execution', async () => {
      const req = await request(manual()),
        p = await api().prepare(req, fence);
      await signIn('owner', true);
      expect((await api().outcome(actor(), req.operation_id, fence, p.original)).status).toBe('prepared');
      await expect(api().execute(actor(), req.operation_id, p.original, fence)).rejects.toMatchObject({ status: 409 });
      expect((await api().cancel(actor(), req.operation_id, p.original, fence)).status).toBe('cancelled');
      expect((await api().all(actor(), 'active', fence)).items).toHaveLength(0);
    });
    it('refuses a stale observed edit and preserves the newer saved content', async () => {
      const a = await save(),
        item = a.original.target_item_id!;
      const req = await request(
        normalizeCollectionIntent({ action: 'edit', body: { item_id: item, changes: { notes: 'Old intent' } } })
      );
      const p = await api().prepare(req, fence);
      await save(
        normalizeCollectionIntent({ action: 'edit', body: { item_id: item, changes: { notes: 'Newer saved' } } })
      );
      await expect(api().execute(actor(), req.operation_id, p.original, fence)).rejects.toMatchObject({ status: 409 });
      expect((await api().editor(actor(), item, 'active', fence)).item.notes).toBe('Newer saved');
    });
    it('refuses changed catalog source facts after preparing a snapshot', async () => {
      const req = await request(
          normalizeCollectionIntent({
            action: 'create_snapshot',
            body: { source: { kind: 'food', id: f.sources.food }, notes: null, status: 'idea' },
          })
        ),
        p = await api().prepare(req, fence);
      await bridge({ action: 'source_edit' });
      try {
        await expect(api().execute(actor(), req.operation_id, p.original, fence)).rejects.toMatchObject({
          status: 409,
        });
      } finally {
        await bridge({ action: 'source_restore' });
      }
    });
    it('refuses an expired actual session rather than returning an empty Collection', async () => {
      await bridge({ action: 'expire' });
      try {
        await expect(api().all(actor(), 'active', fence)).rejects.toMatchObject({ status: 403 });
      } finally {
        await bridge({ action: 'restore_session' });
      }
    });
    it('refuses another member on a private Collection', async () => {
      await signIn('member');
      await expect(api().all(actor(), 'active', fence)).rejects.toMatchObject({ status: 403 });
    });
    it('preserves nullable person identity for a real global reader', async () => {
      await signIn('global_admin');
      expect((await api().all(actor(), 'active', fence)).scope.person_id).toBeNull();
    });
    it('keeps private cover IDs explicitly unavailable without any byte request', async () => {
      const a = await save(manual({ cover_media_id: f.private_media_id }));
      const p = (await api().editor(actor(), a.original.target_item_id!, 'active', fence)).item.cover;
      expect(p.id).toBe(f.private_media_id);
      expect(p.availability).toBe('private_unavailable');
      expect(p.hero_url).toBeNull();
    });
    it('trashes/restores an item through observed lifecycle and reads its retained history', async () => {
      const a = await save(),
        item = a.original.target_item_id!,
        o = await lifecycle(item, 'trash'),
        op = crypto.randomUUID();
      await api().lifecycle(actor(), op, o, false, fence);
      expect((await api().all(actor(), 'active', fence)).items).toHaveLength(0);
      const trash = await api().trash(actor(), 'item', 1, null, fence);
      expect(trash.items[0].id).toBe(item);
      const versions = await api().versions(actor(), item, 1, null, fence);
      expect(versions.items[0].snapshot.id).toBe(item);
      expect((await api().lifecycleOutcome(actor(), op, o, fence)).status).toBe('committed');
      const restore = await lifecycle(item, 'restore');
      await api().lifecycle(actor(), crypto.randomUUID(), restore, false, fence);
      expect((await api().all(actor(), 'active', fence)).items[0].id).toBe(item);
    });
    it('trashes/restores a root and truthfully cancels a separate lifecycle original', async () => {
      const o = await lifecycle(null, 'trash'),
        cancelOp = crypto.randomUUID();
      expect((await api().lifecycle(actor(), cancelOp, o, true, fence)).status).toBe('cancelled');
      const op = crypto.randomUUID();
      await api().lifecycle(actor(), op, o, false, fence);
      const p = await api().trash(actor(), 'collection', 100, null, fence);
      expect(p.items.some((x) => x.id === collection)).toBe(true);
      const restore = await lifecycle(null, 'restore');
      await api().lifecycle(actor(), crypto.randomUUID(), restore, false, fence);
      expect((await api().recoveryContext(actor(), 'active', null, fence)).collection.id).toBe(collection);
    });
  });
}
