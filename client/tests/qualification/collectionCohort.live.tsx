import { getSupabaseBrowserClient } from '@family/backend/supabase/client';
import { collectionRpc, type CollectionRpc } from '@family/backend/supabase/collectionRpc';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../src/api/client';
import { collectionsApi } from '../../src/api/collections';
import CollectionPlaceDetail from '../../src/components/Collections/CollectionPlaceDetail';
import MSaveToCollectionSheet from '../../src/components/Collections/MSaveToCollectionSheet';
import SaveToCollectionModal from '../../src/components/Collections/SaveToCollectionModal';
import { useAddPlaceToCollection } from '../../src/components/Collections/useAddPlaceToCollection';
import { offlineDb } from '../../src/db/offlineDb';
import { createFamilyApplicationHandler } from '../../src/integrations/family/applicationHandler';
import { CollectionCohort } from '../../src/integrations/family/collectionCohort';
import {
  beginFamilyCollectionEdit,
  bindCollectionCohort,
  getFamilyCollectionCohort,
  installFamilyCollectionStore,
} from '../../src/integrations/family/collectionRuntime';
import { createCollectionTransport } from '../../src/integrations/family/collectionTransport';
import { FamilyCollectionTools } from '../../src/integrations/family/FamilyCollectionTools';
import { FamilyIdentityRegistry } from '../../src/integrations/family/identity';
import { familyAuthStore, familyFrontend } from '../../src/integrations/family/repository';
import { activateFamilyFrontend } from '../../src/integrations/family/runtime';
import { createFamilyAxiosAdapter } from '../../src/integrations/family/transport';
import MCollPlaceSheet from '../../src/mobile/screens/collections/MCollPlaceSheet';
import { useCollectionStore } from '../../src/store/collectionStore';
import { useSaveToCollectionStore } from '../../src/store/saveToCollectionStore';
import { collectionDevice, commandActor, commandManual } from '../helpers/collectionCommandFixture';
import { render as renderNative } from '../helpers/render';
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
export function registerCollectionCohortLive() {
  const file = process.env.FAMILY_COLLECTION_COHORT_FIXTURE;
  if (!file) return;
  const f = JSON.parse(readFileSync(file, 'utf8')) as Fixture;
  if (
    f.source !== 'https://fixture.invalid' ||
    !resolve(file).startsWith('/private/tmp/') ||
    resolve(f.bridge) !== resolve(f.directory, 'bridge.py')
  )
    throw Error('Explicit owned fixture required');
  let sdk: SupabaseClient,
    device: Awaited<ReturnType<typeof collectionDevice>>,
    cohort: CollectionCohort,
    root: string,
    index = 0,
    scope = commandActor,
    release: () => void = () => {},
    unbind: () => void = () => {},
    epoch = 0;
  let drop: string | null = null,
    pause: string | null = null,
    pauseParent: string | null = null,
    resume: (() => void) | null = null;
  const calls: string[] = [],
    clients: SupabaseClient[] = [];
  const adapter = api.defaults.adapter,
    originalStore = useCollectionStore.getState(),
    originalAuth = familyAuthStore.getState();
  const bridge = (data: unknown): Promise<{ status: number; body: unknown }> =>
    new Promise((ok, fail) => {
      const p = spawn('python3', [f.bridge], {
        env: { ...process.env, FAMILY_COLLECTION_RECOVERY_FIXTURE_DIR: f.directory },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let out = '';
      p.stdout.on('data', (b) => (out += String(b)));
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
  async function client(who: string) {
    const c = createClient(f.source, f.anon_key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
        storageKey: 'cohort-' + crypto.randomUUID(),
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
          const body = init?.body ? JSON.parse(String(init.body)) : null;
          const r = await bridge({
            path: u.pathname,
            method: init?.method ?? 'GET',
            body,
            headers: Object.fromEntries(new Headers(init?.headers).entries()),
          });
          if (pause && u.pathname.endsWith('/' + pause) && (!pauseParent || body?.p_collection_id === pauseParent))
            await new Promise<void>((r) => {
              resume = r;
            });
          if (drop && u.pathname.endsWith('/' + drop)) throw Error('Actual response lost');
          return new Response(JSON.stringify(r.body), {
            status: r.status,
            headers: { 'content-type': 'application/json' },
          });
        },
      },
    });
    clients.push(c);
    if ((await c.auth.setSession(f.sessions[who].session)).error) throw Error('Local Auth unavailable');
    return c;
  }
  const current = () => {
    if (epoch !== 0) throw Error('Original cohort lifetime retired');
  };
  async function seed(kind = 'manual', parent = root) {
    const session = cohort.commands(parent);
    const intent =
      kind === 'manual'
        ? commandManual()
        : {
            action: 'create_reference',
            body: { source: { kind, id: f.sources[kind] }, notes: 'Independent notes', status: 'idea' },
          };
    const result = await session.run(await session.retainContent(intent), 'retry');
    if (!('view' in result) || !('items' in result.view)) throw Error('Expected current items');
    return result.view.items[result.view.items.length - 1].id;
  }
  async function load(parent = root) {
    await useCollectionStore.getState().loadAll();
    await useCollectionStore.getState().setActive(cohort.owner.ids.register('collection', parent));
    return useCollectionStore.getState().places;
  }
  async function otherEdit(item: string) {
    const c = await client('member'),
      claims = JSON.parse(
        atob(f.sessions.member.session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
      );
    const actor = {
      ...scope,
      user_id: f.sessions.member.user_id,
      person_id: f.sessions.member.person_id,
      session_id: claims.session_id,
    };
    const rpc: CollectionRpc = async (name, args) => {
      const r = await c.rpc(name, args);
      if (r.error) throw r.error;
      return r.data;
    };
    const t = createCollectionTransport(f.source, rpc),
      context = await t.context(actor, { item_id: item }, () => {}),
      operation_id = crypto.randomUUID();
    const p = await t.prepare(
      {
        scope: context.scope,
        operation_id,
        intent: { action: 'edit', body: { item_id: item, changes: { notes: 'Other member notes' } } },
        observation: context.observation,
      },
      () => {}
    );
    await t.execute(actor, operation_id, p.original, () => {});
  }
  describe('actual native Collection handler/store/ports SDK cohort', () => {
    beforeEach(async () => {
      index++;
      root = expect.getState().currentTestName?.includes('other member') ? f.shared_root : f.root_ids[index];
      epoch = 0;
      drop = pause = pauseParent = null;
      resume = null;
      calls.length = 0;
      sdk = await client('owner');
      vi.mocked(getSupabaseBrowserClient).mockReturnValue(sdk);
      const claims = JSON.parse(
        atob(f.sessions.owner.session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
      );
      scope = {
        version: 1,
        user_id: f.sessions.owner.user_id,
        person_id: f.sessions.owner.person_id,
        family_id: f.family_id,
        session_id: claims.session_id,
        collection_id: root,
      };
      device = await collectionDevice(scope);
      familyAuthStore.setState({
        isAuthenticated: true,
        authCheckFailed: false,
        authGate: 'ok',
        authUserId: scope.user_id,
        personId: scope.person_id,
        familyId: scope.family_id,
      });
      familyFrontend.clear();
      familyFrontend.acceptSession({
        userId: scope.user_id,
        personId: scope.person_id,
        familyId: scope.family_id,
        user: { username: 'Local owner', email: 'fixture@example.invalid', avatar_url: null, created_at: '2026-11-15' },
      });
      const { collection_id: _id, ...actor } = scope;
      const ids = familyFrontend.knownViews()?.ids ?? new FamilyIdentityRegistry(scope.user_id);
      const rpc: CollectionRpc = (name, args, context) => collectionRpc(name, args, context);
      cohort = new CollectionCohort({ scope: actor, source_url: f.source, ids, assertCurrent: current }, rpc);
      unbind = bindCollectionCohort(familyFrontend, cohort);
      api.defaults.adapter = createFamilyAxiosAdapter(createFamilyApplicationHandler(familyFrontend));
      activateFamilyFrontend();
      release = installFamilyCollectionStore(familyFrontend);
    });
    afterEach(async () => {
      cleanup();
      drop = pause = null;
      resume?.();
      release();
      unbind();
      cohort.retire();
      familyFrontend.clear();
      api.defaults.adapter = adapter;
      useCollectionStore.setState(originalStore, true);
      familyAuthStore.setState(originalAuth, true);
      for (const c of clients.splice(0)) await c.auth.stopAutoRefresh();
      await device.close();
      vi.restoreAllMocks();
    });
    it('opens a native edit with the production verified runtime owner', async () => {
      unbind();
      unbind = () => {};
      cohort = await getFamilyCollectionCohort(familyFrontend);
      await seed('manual');
      const rows = await load();
      const editor = await beginFamilyCollectionEdit(rows[0].id);
      expect(editor.initial.canonical.content.name).toBe(rows[0].name);
      editor.retire();
    });
    it('projects all nine typed records through actual native GET and store without a geographic substitute', async () => {
      for (const kind of ['country', 'place', 'food', 'hotel', 'experience', 'airport', 'airline', 'guide', 'manual'])
        await seed(kind);
      const rows = await load();
      expect(rows).toHaveLength(9);
      expect(
        cohort
          .getSnapshot()
          .items.map((x) => x.canonical.kind)
          .sort()
      ).toEqual(['country', 'place', 'food', 'hotel', 'experience', 'airport', 'airline', 'guide', 'manual'].sort());
      for (const kind of ['country', 'airline', 'guide']) {
        const item = cohort.getSnapshot().items.find((x) => x.canonical.kind === kind);
        expect(item?.native.lat).toBeNull();
        expect(item?.native.lng).toBeNull();
      }
      expect(rows.every((x) => (x as unknown as { family_identity?: unknown }).family_identity)).toBe(true);
    }, 60000);
    it('roundtrips native edit fields and distinct notes through handler/store and the retained editor', async () => {
      await seed();
      const rows = await load(),
        port = await beginFamilyCollectionEdit(rows[0].id);
      await useCollectionStore.getState().updatePlace(rows[0].id, {
        name: 'Native saved',
        description: 'Separate description',
        notes: 'Separate notes',
        links: [],
        label_ids: [],
      } as never);
      expect(useCollectionStore.getState().places[0]).toMatchObject({
        id: rows[0].id,
        name: 'Native saved',
        description: 'Separate description',
        notes: 'Separate notes',
      });
      expect((await collectionsApi.get(cohort.owner.ids.register('collection', root))).places[0].notes).toBe(
        'Separate notes'
      );
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      port.retire();
    }, 60000);
    it('refuses a stale other member edit and retains the exact original instead of overwriting', async () => {
      const id = await seed();
      const rows = await load();
      await beginFamilyCollectionEdit(rows[0].id);
      await otherEdit(id);
      await expect(useCollectionStore.getState().updatePlace(rows[0].id, { notes: 'Old draft' })).rejects.toMatchObject(
        { status: 409 }
      );
      expect(await offlineDb.mutationQueue.count()).toBe(1);
      await cohort.commands(root).run((await offlineDb.mutationQueue.toArray())[0].id, 'cancel');
      expect((await collectionsApi.get(cohort.owner.ids.register('collection', root))).places[0].notes).toBe(
        'Other member notes'
      );
    }, 60000);
    it('recovers an actual lost reply from the same still-open native form without duplicating', async () => {
      await seed();
      const rows = await load();
      await beginFamilyCollectionEdit(rows[0].id);
      drop = 'execute_family_collection_content_v1';
      await expect(
        useCollectionStore.getState().updatePlace(rows[0].id, { notes: 'Retained draft' })
      ).rejects.toBeDefined();
      const op = (await offlineDb.mutationQueue.toArray())[0].id;
      drop = null;
      await useCollectionStore.getState().updatePlace(rows[0].id, { notes: 'Retained draft' });
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect(useCollectionStore.getState().places[0].notes).toBe('Retained draft');
      expect(calls.filter((p) => p.endsWith('/execute_family_collection_content_v1'))).toHaveLength(2);
      expect(op).toEqual(expect.any(String));
    }, 60000);
    it('rejects unsupported populated fields and edits without an opened native form before writes', async () => {
      await seed();
      const rows = await load();
      const count = calls.length;
      await expect(useCollectionStore.getState().updatePlace(rows[0].id, { notes: 'No editor' })).rejects.toMatchObject(
        { status: 409 }
      );
      await beginFamilyCollectionEdit(rows[0].id);
      const observed = calls.length;
      await expect(
        useCollectionStore.getState().updatePlace(rows[0].id, { links: [{ url: 'https://example.invalid' }] })
      ).rejects.toMatchObject({ status: 422 });
      expect(calls).toHaveLength(observed);
      expect(observed).toBeGreaterThan(count);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }, 60000);
    it('normalizes native reference defaults before notes save and refuses detail changes before queueing', async () => {
      await seed('food');
      const rows = await load(),
        id = rows[0].id;
      const editor = await beginFamilyCollectionEdit(id);
      await useCollectionStore.getState().updatePlace(id, {
        name: rows[0].name,
        description: rows[0].description,
        notes: 'Reference personal notes',
        address: rows[0].address,
        lat: rows[0].lat,
        lng: rows[0].lng,
        category_id: rows[0].category_id ?? null,
        links: [],
        label_ids: [],
      });
      editor.retire();
      expect(useCollectionStore.getState().places[0].notes).toBe('Reference personal notes');
      expect(useCollectionStore.getState().places[0].description).toBe(rows[0].description);
      const next = await beginFamilyCollectionEdit(id);
      await expect(
        useCollectionStore.getState().updatePlace(id, { description: 'Not a catalog edit' })
      ).rejects.toMatchObject({ status: 422, code: 'collection_snapshot_required' });
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      next.retire();
    });
    it('keeps manual, reference and snapshot creations behind displayed immutable selection', async () => {
      await cohort.library();
      for (const mode of ['create_manual', 'create_reference', 'create_snapshot']) {
        const draft = await cohort.openCreate(
          root,
          mode === 'create_manual'
            ? {}
            : {
                source: {
                  kind: mode === 'create_reference' ? 'food' : 'place',
                  id: mode === 'create_reference' ? f.sources.food : f.sources.place,
                },
              }
        );
        const intent =
          mode === 'create_manual'
            ? commandManual()
            : {
                action: mode,
                body: {
                  source: {
                    kind: mode === 'create_reference' ? 'food' : 'place',
                    id: mode === 'create_reference' ? f.sources.food : f.sources.place,
                  },
                  notes: 'Personal',
                  status: 'idea',
                },
              };
        await draft.save(intent);
        draft.retire();
      }
      const rows = await load();
      expect(rows.map((x) => x.name)).toContain('Manual');
      expect(cohort.getSnapshot().items.map((x) => x.canonical.content_mode)).toContain('snapshot');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }, 60000);
    it('allows exact identity membership consumers without fuzzy matches or cross-superseding', async () => {
      await seed('food');
      await cohort.library();
      const a = await cohort.membership({ kind: 'food', id: f.sources.food }),
        b = await cohort.membership({ kind: 'food', id: f.sources.food });
      expect(a.current()).toBe(true);
      expect(b.current()).toBe(true);
      expect(a.native.saved).toBe(true);
      expect(a.native.lists[0].place_id).toBe(b.native.lists[0].place_id);
      a.retire();
      expect(b.current()).toBe(true);
      b.retire();
      await expect(collectionsApi.membership({ name: 'Transport fixture restaurant' })).rejects.toMatchObject({
        response: { status: 400 },
      });
    }, 60000);
    it('supports observed item Trash and selected Restore without using raw DELETE', async () => {
      const id = await seed();
      const rows = await load();
      await useCollectionStore.getState().deletePlace(rows[0].id);
      expect(useCollectionStore.getState().places).toHaveLength(0);
      const session = cohort.commands(root),
        trash = await session.trash('item');
      expect(trash.items[0].id).toBe(id);
      await session.run(await session.retainLifecycle('restore', id, 'active', trash.items[0]), 'retry');
      expect(useCollectionStore.getState().places[0].id).toBe(rows[0].id);
      await expect(collectionsApi.deletePlace(rows[0].id)).rejects.toMatchObject({
        response: { status: 422, data: { code: 'collection_recovery_unavailable' } },
      });
    }, 60000);
    it('reorders complete native identities and materializes the selected reference explicitly', async () => {
      await seed('food');
      await seed();
      const rows = await load(),
        order = await cohort.openOrder(cohort.owner.ids.register('collection', root));
      await order.save(rows.map((x) => x.id).reverse());
      expect(useCollectionStore.getState().places.map((x) => x.id)).toEqual(rows.map((x) => x.id).reverse());
      const item = useCollectionStore.getState().places.find((x) => x.id === rows[0].id);
      const editor = await cohort.editor(item?.id ?? 0);
      await editor.materialize();
      expect(cohort.getSnapshot().items.find((x) => x.native.id === item?.id)?.canonical.content_mode).toBe('snapshot');
    }, 60000);
    it('does not publish an overtaken B read into A after an A-to-B-to-A view change', async () => {
      await seed();
      await seed('food', f.root_ids[30]);
      await load();
      pause = 'get_family_collection_page_v1';
      pauseParent = f.root_ids[30];
      const pending = useCollectionStore.getState().setActive(cohort.owner.ids.register('collection', f.root_ids[30]));
      await vi.waitFor(() => expect(resume).not.toBeNull(), { timeout: 15000 });
      await useCollectionStore.getState().setActive(cohort.owner.ids.register('collection', root));
      pause = null;
      resume?.();
      await pending;
      expect(useCollectionStore.getState().activeId).toBe(cohort.owner.ids.register('collection', root));
      expect(useCollectionStore.getState().places[0].name).toBe('Manual');
      expect(useCollectionStore.getState().placesLoading).toBe(false);
    }, 60000);
    it.each(['desktop', 'phone'])(
      'saves independent fields through the actual %s native detail form',
      async (variant) => {
        await seed();
        await load();
        const id = useCollectionStore.getState().places[0].id;
        function Detail() {
          const place = useCollectionStore((s) => s.places.find((p) => p.id === id));
          if (!place) return null;
          const props = {
            place,
            canEdit: true,
            canDelete: true,
            categories: [],
            labels: [],
            onClose: () => {},
            onSetStatus: () => {},
            onSave: (patch: Parameters<ReturnType<typeof useCollectionStore.getState>['updatePlace']>[1]) =>
              useCollectionStore.getState().updatePlace(id, patch),
            onCopyToTrip: () => {},
            onRemove: () => {},
            t: (key: string) => key,
          };
          return variant === 'desktop' ? <CollectionPlaceDetail {...props} /> : <MCollPlaceSheet {...props} />;
        }
        renderNative(<Detail />);
        fireEvent.click(screen.getByRole('button', { name: 'common.edit' }));
        await screen.findByRole('textbox', { name: 'Personal notes' });
        fireEvent.change(screen.getByPlaceholderText('collections.descriptionPlaceholder'), {
          target: { value: 'Native description' },
        });
        fireEvent.change(screen.getByRole('textbox', { name: 'Personal notes' }), {
          target: { value: 'Native private notes' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
        await waitFor(
          () =>
            expect(useCollectionStore.getState().places[0]).toMatchObject({
              description: 'Native description',
              notes: 'Native private notes',
            }),
          { timeout: 15000 }
        );
        expect(await offlineDb.mutationQueue.count()).toBe(0);
      },
      60000
    );
    it('creates from the real shared native add hook after its displayed context loads', async () => {
      await load();
      const added = vi.fn(),
        h = renderHook(() =>
          useAddPlaceToCollection({
            variant: 'dialog',
            open: true,
            collectionId: cohort.owner.ids.register('collection', root),
            collectionName: 'Fixture',
            t: (key) => key,
            onClose: () => {},
            onAdded: added,
            normalizeLinkUrl: (s) => s,
          })
        );
      await waitFor(() => expect(h.result.current.family.ready).toBe(true), { timeout: 15000 });
      act(() => {
        h.result.current.setName('Created through native add');
        h.result.current.setDescription('Native add description');
      });
      await act(async () => {
        await h.result.current.save();
      });
      expect(added).toHaveBeenCalledTimes(1);
      const d = await collectionsApi.get(cohort.owner.ids.register('collection', root));
      expect(d.places[0]).toMatchObject({
        name: 'Created through native add',
        description: 'Native add description',
        notes: null,
      });
      h.unmount();
    }, 60000);
    it('retires the native add hook during a delayed preparation without executing or losing recovery', async () => {
      await load();
      const added = vi.fn(),
        h = renderHook(() =>
          useAddPlaceToCollection({
            variant: 'dialog',
            open: true,
            collectionId: cohort.owner.ids.register('collection', root),
            collectionName: 'Fixture',
            t: (key) => key,
            onClose: () => {},
            onAdded: added,
            normalizeLinkUrl: (s) => s,
          })
        );
      await waitFor(() => expect(h.result.current.family.ready).toBe(true), { timeout: 15000 });
      act(() => h.result.current.setName('Retired add'));
      pause = 'prepare_family_collection_content_v1';
      let saving: Promise<void> = Promise.resolve();
      act(() => {
        saving = h.result.current.save();
      });
      await waitFor(() => expect(resume).not.toBeNull(), { timeout: 15000 });
      h.unmount();
      pause = null;
      resume?.();
      await saving;
      expect(added).not.toHaveBeenCalled();
      expect(calls.filter((x) => x.endsWith('/execute_family_collection_content_v1'))).toHaveLength(0);
      const row = (await offlineDb.mutationQueue.toArray())[0];
      expect(row).toBeDefined();
      await cohort.commands(root).run(row.id, 'cancel');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }, 60000);
    it('makes native root Trash reachable through shared recovery and restores that exact Collection', async () => {
      await seed();
      await load();
      render(<FamilyCollectionTools />);
      fireEvent.click(screen.getByRole('button', { name: 'Collection recovery and saved items' }));
      await screen.findByRole('combobox', { name: 'Recovery Collection' });
      await waitFor(() => expect(screen.getByRole('button', { name: 'Move Collection to Trash' })).not.toBeDisabled(), {
        timeout: 15000,
      });
      fireEvent.click(screen.getByRole('button', { name: 'Move Collection to Trash' }));
      await screen.findByText('Collection change confirmed.', {}, { timeout: 15000 });
      fireEvent.click(screen.getByRole('button', { name: 'Load deleted Collections' }));
      const restore = await screen.findByRole('button', { name: 'Restore Collection' }, { timeout: 15000 });
      await waitFor(() => expect(restore).not.toBeDisabled(), { timeout: 15000 });
      fireEvent.click(restore);
      await screen.findByText('Original save confirmed.', {}, { timeout: 15000 });
      await waitFor(
        () =>
          expect(
            useCollectionStore
              .getState()
              .collections.some((x) => x.id === cohort.owner.ids.register('collection', root))
          ).toBe(true),
        { timeout: 15000 }
      );
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }, 60000);
    it.each(['desktop', 'phone'])(
      'uses actual %s picker identities to save and remove with reachable recovery',
      async (variant) => {
        await load();
        const list = useCollectionStore
          .getState()
          .collections.find((row) => row.id === cohort.owner.ids.register('collection', root));
        if (!list) throw Error('Expected target Collection');
        act(() =>
          useSaveToCollectionStore
            .getState()
            .open({ name: 'Catalog restaurant', family_identity: { kind: 'food', id: f.sources.food } })
        );
        renderNative(variant === 'desktop' ? <SaveToCollectionModal /> : <MSaveToCollectionSheet />);
        const button = await screen.findByRole('button', { name: new RegExp(list.name) }, { timeout: 15000 });
        await waitFor(() => expect(button).not.toBeDisabled(), { timeout: 15000 });
        fireEvent.click(button);
        await waitFor(() => expect(useCollectionStore.getState().places).toHaveLength(1), { timeout: 15000 });
        const saved = await screen.findByRole('button', { name: new RegExp(list.name) }, { timeout: 15000 });
        await waitFor(() => expect(saved).toHaveAttribute('aria-pressed', 'true'), { timeout: 15000 });
        await waitFor(() => expect(saved).not.toBeDisabled(), { timeout: 15000 });
        fireEvent.click(saved);
        await waitFor(() => expect(useCollectionStore.getState().places).toHaveLength(0), { timeout: 15000 });
        expect((await cohort.commands(root).trash('item')).items).toHaveLength(1);
        expect(await offlineDb.mutationQueue.count()).toBe(0);
        act(() => useSaveToCollectionStore.getState().close());
      },
      60000
    );
  });
}
