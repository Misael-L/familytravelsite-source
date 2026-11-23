import { getSupabaseBrowserClient } from '@family/backend/supabase/client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { offlineDb } from '../../src/db/offlineDb';
import { parseCollectionQueueRow } from '../../src/integrations/family/collectionCommandQueue';
import { CollectionCommandSession } from '../../src/integrations/family/collectionCommandSession';
import { FamilyCollectionRecovery } from '../../src/integrations/family/FamilyCollectionRecovery';
import { collectionDevice, commandActor, commandManual } from '../helpers/collectionCommandFixture';
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
};
export function registerCollectionCommandsLive() {
  const file = process.env.FAMILY_COLLECTION_COMMAND_FIXTURE;
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
    scope = commandActor,
    index = 15;
  let drop: string | null = null;
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
      collection_id: f.root_ids[index],
    };
  }
  function open() {
    return new CollectionCommandSession({ scope, source_url: f.source, assertCurrent: () => {}, publish });
  }
  describe('actual Collection command/queue/recovery SDK flows', () => {
    beforeEach(async () => {
      index++;
      drop = null;
      publish.mockReset();
      publish.mockReturnValue(undefined);
      await signIn();
      device = await collectionDevice(scope);
      session = open();
    });
    afterEach(async () => {
      cleanup();
      drop = null;
      session.retire();
      await sdk.auth.stopAutoRefresh();
      await device.close();
    });
    it('retains then commits a manual save and publishes the actual fresh item', async () => {
      const op = await session.retainContent(commandManual());
      const r = await session.run(op, 'retry');
      expect(r.status).toBe('committed');
      const view = publish.mock.calls[0][0];
      expect(view.items).toHaveLength(1);
      expect(view.items[0].content.description).toBe('Description');
      expect(view.items[0].notes).toBe('Personal');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    });
    it('recovers a real lost preparation reply without changing the target', async () => {
      const op = await session.retainContent(commandManual());
      drop = 'prepare_family_collection_content_v1';
      await expect(session.run(op, 'retry')).rejects.toBeDefined();
      expect(parseCollectionQueueRow((await offlineDb.mutationQueue.toArray())[0]).packet.original).toBeNull();
      drop = null;
      session.retire();
      session = open();
      await session.run(op, 'retry');
      expect(publish.mock.calls[0][0].items).toHaveLength(1);
    });
    it('discovers an actual committed lost reply instead of creating twice', async () => {
      const op = await session.retainContent(commandManual());
      drop = 'execute_family_collection_content_v1';
      await expect(session.run(op, 'retry')).rejects.toBeDefined();
      drop = null;
      session.retire();
      session = open();
      await session.run(op, 'check');
      expect(publish.mock.calls[0][0].items).toHaveLength(1);
    });
    it('cancels the same prepared request after a fresh actual Auth session', async () => {
      const op = await session.retainContent(commandManual());
      drop = 'prepare_family_collection_content_v1';
      await expect(session.run(op, 'retry')).rejects.toBeDefined();
      drop = null;
      session.retire();
      await signIn(true);
      session = open();
      await expect(session.run(op, 'retry')).rejects.toMatchObject({ status: 409 });
      expect((await session.run(op, 'cancel')).status).toBe('cancelled');
      expect(publish.mock.calls[0][0].items).toHaveLength(0);
    });
    it('confirms never-prepared cancellation in a fresh actual Auth session', async () => {
      const op = await session.retainContent(commandManual());
      session.retire();
      await signIn(true);
      session = open();
      expect((await session.run(op, 'cancel')).status).toBe('cancelled');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect(publish.mock.calls[0][0].items).toHaveLength(0);
    });
    it('recovers a real lost never-prepared cancellation reply after restart', async () => {
      const op = await session.retainContent(commandManual());
      drop = 'cancel_family_collection_preparation_v2';
      await expect(session.run(op, 'cancel')).rejects.toBeDefined();
      expect(parseCollectionQueueRow((await offlineDb.mutationQueue.toArray())[0]).packet.decision).toBe('cancel');
      drop = null;
      session.retire();
      await signIn(true);
      session = open();
      expect((await session.run(op, 'retry')).status).toBe('cancelled');
      expect(publish.mock.calls[0][0].items).toHaveLength(0);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    });
    it('trashes/restores an actual item with the original identity', async () => {
      const op = await session.retainContent(commandManual());
      await session.run(op, 'retry');
      const item = publish.mock.calls[0][0].items[0].id;
      const del = await session.retainLifecycle('trash', item, 'active');
      await session.run(del, 'retry');
      const trash = await session.trash('item');
      expect(trash.items[0].id).toBe(item);
      expect((await session.history(item)).items[0].snapshot.id).toBe(item);
      const restore = await session.retainLifecycle('restore', item, 'active');
      await session.run(restore, 'retry');
      expect(publish.mock.calls[2][0].items[0].id).toBe(item);
    });
    it('runs reference/materialize/edit/status/order through the durable coordinator', async () => {
      let op = await session.retainContent({
        action: 'create_reference',
        body: { source: { kind: 'food', id: f.sources.food }, notes: 'Personal', status: 'idea' },
      });
      await session.run(op, 'retry');
      const item = publish.mock.calls[0][0].items[0].id;
      op = await session.retainContent(
        { action: 'materialize', body: { item_id: item } },
        (await session.observeContent({ item_id: item })).selection
      );
      await session.run(op, 'retry');
      op = await session.retainContent(
        {
          action: 'edit',
          body: { item_id: item, changes: { description: 'Edited description', notes: 'Edited notes' } },
        },
        (await session.observeContent({ item_id: item })).selection
      );
      await session.run(op, 'retry');
      op = await session.retainContent(
        { action: 'status', body: { item_id: item, status: 'visited' } },
        (await session.observeContent({ item_id: item })).selection
      );
      await session.run(op, 'retry');
      op = await session.retainContent(
        { action: 'reorder', body: { ordered_ids: [item] } },
        (await session.observeContent({})).selection
      );
      await session.run(op, 'retry');
      const latest = publish.mock.calls[publish.mock.calls.length - 1][0].items[0];
      expect(latest.id).toBe(item);
      expect(latest.content_mode).toBe('snapshot');
      expect(latest.content.description).toBe('Edited description');
      expect(latest.notes).toBe('Edited notes');
      expect(latest.status).toBe('visited');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    });
    it('exposes authorized root Restore through the actual recovery boundary', async () => {
      const op = await session.retainLifecycle('trash', null, 'active');
      await session.run(op, 'retry');
      render(<FamilyCollectionRecovery session={session} />);
      fireEvent.click(screen.getByRole('button', { name: 'Load deleted Collections' }));
      const restore = await screen.findByRole('button', { name: 'Restore Collection' });
      await waitFor(() => expect(restore).not.toBeDisabled(), { timeout: 15000 });
      fireEvent.click(restore);
      await screen.findByText('Original save confirmed.', {}, { timeout: 15000 });
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    });
  });
}
