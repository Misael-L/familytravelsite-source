import { getSupabaseBrowserClient } from '@family/backend/supabase/client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { offlineDb } from '../../src/db/offlineDb';
import { CollectionCommandSession } from '../../src/integrations/family/collectionCommandSession';
import { createCollectionTransport } from '../../src/integrations/family/collectionTransport';
import { FamilyCollectionRecovery } from '../../src/integrations/family/FamilyCollectionRecovery';
import { collectionDevice, commandActor } from '../helpers/collectionCommandFixture';
type Token = { access_token: string; refresh_token: string };
type Fixture = {
  source: string;
  directory: string;
  bridge: string;
  anon_key: string;
  family_id: string;
  root_ids: string[];
  sessions: Record<string, { user_id: string; person_id: string; session: Token }>;
  fresh: Token;
  sources: Record<string, string>;
  recovery: {
    collection_id: string;
    item_ids: string[];
    root_ids: string[];
    history_collection_id: string;
    history_item_id: string;
    root_revisions: number[];
    item_revisions: number[];
  };
};
export function registerCollectionRecoveryLive() {
  const file = process.env.FAMILY_COLLECTION_RECOVERY_FIXTURE;
  if (!file) return;
  const f = JSON.parse(readFileSync(file, 'utf8')) as Fixture;
  if (
    f.source !== 'https://fixture.invalid' ||
    !resolve(file).startsWith('/private/tmp/') ||
    resolve(f.bridge) !== resolve(f.directory, 'bridge.py')
  )
    throw Error('Explicit owned local fixture required');
  let sdk: SupabaseClient,
    device: Awaited<ReturnType<typeof collectionDevice>>,
    session: CollectionCommandSession,
    scope = commandActor;
  let drop: string | null = null;
  let pause: { path: string; seen: () => void; wait: Promise<void> } | null = null;
  const publish = vi.fn();
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
  async function signIn(fresh = false) {
    sdk = createClient(f.source, f.anon_key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: {
        fetch: async (input, init) => {
          const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
          if (
            u.origin !== f.source ||
            u.search ||
            u.hash ||
            (u.pathname !== '/auth/v1/user' && !/^\/rest\/v1\/rpc\/[a-z0-9_]+$/.test(u.pathname))
          )
            throw Error('External/non-RPC request refused');
          const r = await bridge({
            path: u.pathname,
            method: init?.method ?? 'GET',
            body: init?.body ? JSON.parse(String(init.body)) : null,
            headers: Object.fromEntries(new Headers(init?.headers).entries()),
          });
          if (pause && u.pathname.endsWith('/' + pause.path)) {
            pause.seen();
            await pause.wait;
          }
          if (drop && u.pathname.endsWith('/' + drop)) throw Error('Reply lost after actual server response');
          return new Response(JSON.stringify(r.body), {
            status: r.status,
            headers: { 'content-type': 'application/json' },
          });
        },
      },
    });
    vi.mocked(getSupabaseBrowserClient).mockReturnValue(sdk);
    const token = fresh ? f.fresh : f.sessions.owner.session,
      r = await sdk.auth.setSession(token);
    if (r.error) throw Error('Actual local Auth unavailable');
    const claims = JSON.parse(atob(token.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as {
      session_id: string;
    };
    scope = {
      version: 1,
      user_id: f.sessions.owner.user_id,
      person_id: f.sessions.owner.person_id,
      family_id: f.family_id,
      session_id: claims.session_id,
      collection_id: f.recovery.collection_id,
    };
  }
  function open() {
    return new CollectionCommandSession({ scope, source_url: f.source, assertCurrent: () => {}, publish });
  }

  const select = (id: string) => {
    session.retire();
    scope = { ...scope, collection_id: id };
    session = open();
  };
  const click = async (name: string) => {
    await waitFor(() => expect(screen.getByRole('button', { name })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name }));
  };
  const finish = async () =>
    waitFor(() => expect(screen.getByRole('button', { name: 'Load deleted items' })).not.toBeDisabled());
  describe('actual recovery paging and observed Restore SDK flows', () => {
    beforeEach(async () => {
      drop = null;
      pause = null;
      publish.mockReset();
      publish.mockReturnValue(undefined);
      await signIn();
      device = await collectionDevice(scope);
      session = open();
    });
    afterEach(async () => {
      cleanup();
      pause = null;
      session.retire();
      await sdk.auth.stopAutoRefresh();
      await device.close();
    });
    it('traverses all55 root records by microsecond cursor, then restores only the selected parent through the mounted boundary', async () => {
      select(f.recovery.root_ids[54]);
      let cursor = null;
      const ids: string[] = [];
      for (let n = 0; n < 3; n++) {
        const p = await session.trash('collection', 25, cursor);
        ids.push(...p.items.map((row) => row.id));
        cursor = p.next_cursor;
      }
      expect(ids).toEqual(f.recovery.root_ids);
      expect(cursor).toBeNull();
      render(<FamilyCollectionRecovery session={session} />);
      await click('Load deleted Collections');
      await finish();
      expect(screen.queryByRole('button', { name: 'Restore Collection' })).toBeNull();
      await click('More deleted records');
      await finish();
      await click('More deleted records');
      await screen.findByRole('button', { name: 'Restore Collection' });
      await click('Restore Collection');
      await screen.findByText('Original save confirmed.');
      await finish();
      expect(screen.queryByRole('button', { name: 'Restore Collection' })).toBeNull();
      expect(publish.mock.calls[0][0].collection.id).toBe(scope.collection_id);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    });
    it('loads55 saved records without omissions and restores a selected deletion with its notes/description intact', async () => {
      render(<FamilyCollectionRecovery session={session} />);
      await click('Load deleted items');
      await finish();
      await click('More deleted records');
      await finish();
      await click('More deleted records');
      await waitFor(() => expect(screen.getAllByRole('button', { name: 'Restore item' })).toHaveLength(55));
      await finish();
      fireEvent.click(screen.getAllByRole('button', { name: 'Restore item' })[54]);
      await screen.findByText('Original save confirmed.');
      await finish();
      expect(screen.getAllByRole('button', { name: 'Restore item' })).toHaveLength(25);
      const view = publish.mock.calls[0][0];
      expect(view.items[0].id).toBe(f.recovery.item_ids[54]);
      expect(view.items[0].notes).toBe('Saved personal note');
      expect(view.items[0].content.description).toBe('Synthetic independent description');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    });
    it('shows all56 root versions and57 item versions through mounted history paging, retaining independent notes and content', async () => {
      select(f.recovery.history_collection_id);
      await session.run(await session.retainLifecycle('trash', f.recovery.history_item_id, 'active'), 'retry');
      render(<FamilyCollectionRecovery session={session} />);
      await click('Collection history');
      await finish();
      await click('More history');
      await finish();
      await click('More history');
      await finish();
      expect(screen.getByRole('region', { name: 'Collection history' }).querySelectorAll('article')).toHaveLength(
        f.recovery.root_revisions.length
      );
      expect(screen.queryByRole('button', { name: 'More history' })).toBeNull();
      await click('Load deleted items');
      await finish();
      await click('Item history');
      await finish();
      await click('More history');
      await finish();
      await click('More history');
      await finish();
      const history = screen.getByRole('region', { name: 'Saved item history' });
      expect(history.querySelectorAll('article')).toHaveLength(f.recovery.item_revisions.length + 1);
      expect(screen.getAllByText('History note 55').length).toBeGreaterThan(0);
      expect(screen.getAllByText('History description 55').length).toBeGreaterThan(0);
      expect(screen.getByText('History note 0')).toBeDefined();
    });
    it('refuses an old selected deletion after another session restores and trashes it again', async () => {
      render(<FamilyCollectionRecovery session={session} />);
      await click('Load deleted items');
      await finish();
      const target = f.recovery.item_ids[0],
        side = open();
      await side.run(await side.retainLifecycle('restore', target, 'active'), 'retry');
      await side.run(await side.retainLifecycle('trash', target, 'active'), 'retry');
      side.retire();
      fireEvent.click(screen.getAllByRole('button', { name: 'Restore item' })[0]);
      await screen.findByText('This deleted record changed. Reload deleted records before restoring it.');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      const api = createCollectionTransport(f.source);
      const current = await api.recoveryContext(scope, 'active', target, () => {});
      expect(current.item?.deleted_at).not.toBeNull();
    });
    it('does not publish real history data or late errors into a replacement Collection owner', async () => {
      select(f.recovery.history_collection_id);
      let release!: () => void, seen!: () => void;
      const started = new Promise<void>((r) => {
        seen = r;
      });
      pause = {
        path: 'list_family_collection_versions_v1',
        seen: () => seen(),
        wait: new Promise<void>((r) => {
          release = r;
        }),
      };
      const ui = render(<FamilyCollectionRecovery session={session} />);
      await click('Collection history');
      await started;
      select(f.root_ids[0]);
      ui.rerender(<FamilyCollectionRecovery session={session} />);
      await act(async () => release());
      await finish();
      expect(screen.queryByRole('region', { name: 'Collection history' })).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();
      pause = null;
    });
    it('reports actual expired-session refusal after the first page and clears protected records', async () => {
      render(<FamilyCollectionRecovery session={session} />);
      await click('Load deleted items');
      await finish();
      await bridge({ action: 'expire' });
      try {
        await click('More deleted records');
        await screen.findByText('This Collection operation is not authorized.');
        expect(screen.queryByRole('button', { name: 'Restore item' })).toBeNull();
      } finally {
        await bridge({ action: 'restore_session' });
      }
    });
  });
}
