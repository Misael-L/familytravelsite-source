import { getSupabaseBrowserClient } from '@family/backend/supabase/client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../src/api/client';
import { requireNativeCollection } from '../../src/integrations/family/collectionNativeViews';
import { createCollectionReadSession } from '../../src/integrations/family/collectionReadSession';
import {
  createCollectionTransport,
  normalizeCollectionIntent,
} from '../../src/integrations/family/collectionTransport';
import { FamilyIdentityRegistry } from '../../src/integrations/family/identity';
import { createFamilyAxiosAdapter } from '../../src/integrations/family/transport';
import { useCollectionStore } from '../../src/store/collectionStore';
type Token = { access_token: string; refresh_token: string };
type Fixture = {
  source: string;
  directory: string;
  bridge: string;
  anon_key: string;
  family_id: string;
  root_ids: string[];
  sources: Record<string, string>;
  sessions: Record<string, { user_id: string; person_id: string; session: Token }>;
};
export function registerCollectionReadsLive() {
  const file = process.env.FAMILY_COLLECTION_READS_FIXTURE;
  if (!file) return;
  const f = JSON.parse(readFileSync(file, 'utf8')) as Fixture;
  if (
    f.source !== 'https://fixture.invalid' ||
    !resolve(file).startsWith('/private/tmp/') ||
    resolve(f.bridge) !== resolve(f.directory, 'bridge.py')
  )
    throw Error('Explicit owned local fixture required');
  let sdk: SupabaseClient,
    index = 20,
    collection = '',
    key = 'owner',
    ids: FamilyIdentityRegistry;
  let reads: ReturnType<typeof createCollectionReadSession>,
    afterLibrary: (() => void) | null = null;
  const savedAdapter = api.defaults.adapter,
    savedStore = useCollectionStore.getState();
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
          fail(Error('Invalid owned bridge response'));
        }
      });
      p.stdin.end(JSON.stringify(data));
    });
  }
  function actor() {
    const u = f.sessions[key],
      payload = JSON.parse(atob(u.session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
        session_id: string;
      };
    return {
      version: 1 as const,
      family_id: f.family_id,
      user_id: u.user_id,
      person_id: u.person_id,
      session_id: payload.session_id,
    };
  }
  async function signIn(next = 'owner') {
    key = next;
    sdk = createClient(f.source, f.anon_key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: {
        fetch: async (input, init) => {
          const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
          if (url.origin !== f.source || url.search || url.hash) throw Error('External request refused');
          if (url.pathname !== '/auth/v1/user' && !/^\/rest\/v1\/rpc\/[a-z0-9_]+$/.test(url.pathname))
            throw Error('Non-RPC request refused');
          const result = await bridge({
            path: url.pathname,
            method: init?.method ?? 'GET',
            body: init?.body ? JSON.parse(String(init.body)) : null,
            headers: Object.fromEntries(new Headers(init?.headers).entries()),
          });
          if (url.pathname.endsWith('/get_family_collection_library_v1')) afterLibrary?.();
          return new Response(JSON.stringify(result.body), {
            status: result.status,
            headers: { 'content-type': 'application/json' },
          });
        },
      },
    });
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(sdk);
    const r = await sdk.auth.setSession(f.sessions[key].session);
    if (r.error) throw Error('Owned Auth session unavailable');
    ids = new FamilyIdentityRegistry(actor().user_id);
    reads = createCollectionReadSession({ scope: actor(), source_url: f.source, ids, assertCurrent: () => {} });
  }
  async function save(kind: string) {
    const api = createCollectionTransport(f.source),
      a = { ...actor(), collection_id: collection };
    const intent = normalizeCollectionIntent(
      kind === 'manual'
        ? {
            action: 'create_manual',
            body: {
              content: {
                name: 'SDK manual',
                description: 'Manual description',
                latitude: null,
                longitude: null,
                address: null,
                website: null,
                phone: null,
                family_place_category_id: null,
                cover_media_id: null,
              },
              notes: 'Personal manual',
              status: 'idea',
            },
          }
        : {
            action: 'create_reference',
            body: { source: { kind, id: f.sources[kind] }, notes: 'Personal ' + kind, status: 'idea' },
          }
    );
    let target: Parameters<ReturnType<typeof createCollectionTransport>['context']>[1] = {};
    if ('source' in intent.body) target = { source: intent.body.source };
    const ctx = await api.context(a, target, () => {}),
      req = { scope: ctx.scope, operation_id: crypto.randomUUID(), intent, observation: ctx.observation },
      p = await api.prepare(req, () => {});
    await api.execute(a, req.operation_id, p.original, () => {});
  }
  describe('native Collection reads through actual SDK/Auth/REST', () => {
    beforeEach(async () => {
      collection = f.root_ids[index++];
      if (!collection) throw Error('Synthetic fixture exhausted');
      afterLibrary = null;
      await signIn();
    });
    afterEach(async () => {
      afterLibrary = null;
      reads.retire();
      await sdk.auth.stopAutoRefresh();
      api.defaults.adapter = savedAdapter;
      useCollectionStore.setState(savedStore, true);
    });
    it('loads all nine typed items into the actual native Collection store', async () => {
      for (const kind of ['country', 'place', 'food', 'hotel', 'experience', 'airport', 'airline', 'guide', 'manual'])
        await save(kind);
      api.defaults.adapter = createFamilyAxiosAdapter(async (request) => {
        if (request.pathname === '/addons/collections') {
          const r = await reads.list();
          return { collections: r.collections.map(requireNativeCollection), incomingInvites: [] };
        }
        const r = await reads.detail(request.pathname.split('/').pop() ?? '');
        return { collection: requireNativeCollection(r.root), places: r.items.map((x) => x.native) };
      });
      await useCollectionStore.getState().loadAll();
      await useCollectionStore.getState().setActive(ids.register('collection', collection));
      expect(useCollectionStore.getState().places).toHaveLength(9);
      const detail = await reads.detail(collection);
      expect(detail.items.filter((x) => !x.canonical.native_location_compatible)).toHaveLength(4);
      const food = detail.items.find((x) => x.canonical.kind === 'food');
      if (!food) throw Error('Food missing');
      expect(food.native.lat).toBe(21.12345678);
      expect(food.native.notes).toBe('Personal food');
      expect(food.native.description).toBe('Catalog description');
      expect((await reads.editor(collection, food.native.id)).item.canonical.id).toBe(food.canonical.id);
    }, 60000);
    it('reads exact canonical membership with actual database item identity', async () => {
      await save('food');
      const m = await reads.membership({ kind: 'food', id: f.sources.food });
      expect(m.native.saved).toBe(true);
      const row = m.canonical.lists.find((x) => x.collection_id === collection);
      if (!row) throw Error('Saved membership missing');
      expect(
        ids.uuid(
          'collectionItem',
          m.native.lists.find((x) => x.collection_id === ids.register('collection', collection))?.place_id ?? 0
        )
      ).toBe(row.item_id);
    });
    it('keeps another member outside the private Collection', async () => {
      await signIn('member');
      await expect(reads.detail(collection)).rejects.toMatchObject({ status: 404 });
    });
    it('refuses an expired real session rather than publishing an empty library', async () => {
      await bridge({ action: 'expire' });
      try {
        await expect(reads.list()).rejects.toMatchObject({ code: '42501' });
      } finally {
        await bridge({ action: 'restore_session' });
      }
    });
    it('refuses retirement after an actual database response before native publication', async () => {
      afterLibrary = () => reads.retire();
      await expect(reads.list()).rejects.toMatchObject({ status: 409 });
      expect(useCollectionStore.getState().places).toEqual(savedStore.places);
    });
  });
}
