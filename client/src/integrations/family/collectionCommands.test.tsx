vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: vi.fn() }));
vi.mock('@family/backend/supabase/env', () => ({ getSupabaseUrl: () => 'https://fixture.invalid' }));
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Blob as NativeBlob, File as NativeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cid,
  collectionDevice,
  collectionEngine,
  commandActor,
  commandManual,
} from '../../../tests/helpers/collectionCommandFixture';
import { registerCollectionCommandsLive } from '../../../tests/qualification/collectionCommands.live';
import { deleteCurrentUserDb, offlineDb, reopenForUser } from '../../db/offlineDb';
import { isSupportedMutationFormat } from '../../db/queueFormat';
import { installReadOnlySession } from '../../db/readOnlySession';
import { isProtectedQueueWork, isRetainedCommand } from '../../db/retainedCommand';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { setForcedOffline } from '../../sync/networkMode';
import { prepareOriginalWorkExport } from '../../sync/originalWorkExport';
import { parseCollectionCommand } from './collectionCommandContract';
import { parseCollectionQueueRow } from './collectionCommandQueue';
import { CollectionCommandSession } from './collectionCommandSession';
import type { CollectionIdentity } from './collectionContract';
import { FamilyCollectionRecovery } from './FamilyCollectionRecovery';
let device: Awaited<ReturnType<typeof collectionDevice>>,
  engine: ReturnType<typeof collectionEngine>,
  session: CollectionCommandSession,
  live = true;
const publish = vi.fn(),
  active: CollectionCommandSession[] = [];
function open(scope: CollectionIdentity = commandActor) {
  const s = new CollectionCommandSession(
    {
      scope,
      source_url: 'https://fixture.invalid',
      assertCurrent: () => {
        if (!live) throw Error('Owner retired');
      },
      publish,
    },
    engine.rpc
  );
  active.push(s);
  return s;
}

const names = () => engine.rpc.mock.calls.map((c) => c[0]);
async function one() {
  return (await offlineDb.mutationQueue.toArray())[0];
}
const drop = (name: string) =>
  engine.after((method) => {
    if (method === name) throw Error('Lost reply');
  });
describe('durable Collection command originals', () => {
  beforeEach(async () => {
    device = await collectionDevice();
    live = true;
    engine = collectionEngine();
    publish.mockReset();
    publish.mockReturnValue(undefined);
    session = open();
  });
  afterEach(async () => {
    cleanup();
    for (const s of active.splice(0)) s.retire();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await device.close();
  });
  it('retains a normalized exact request before prepare, without a fake Trip identity', async () => {
    const op = await session.retainContent(commandManual());
    const row = await one();
    expect(row.id).toBe(op);
    expect(row.tripId).toBe(0);
    expect(row.schemaVersion).toBe(3);
    expect(row.url).toBe('/family/collections/' + commandActor.collection_id + '/commands/v1');
    expect(parseCollectionQueueRow(row).packet.original).toBeNull();
    expect(names()).toEqual(['get_family_collection_authoring_context_v1']);
  });
  it('commits once, publishes fresh canonical data, and then acknowledges', async () => {
    const op = await session.retainContent(commandManual());
    const r = await session.run(op, 'retry');
    expect(r.status).toBe('committed');
    expect(publish.mock.calls[0][0].collection.name).toBe('Fresh current collection');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(names().filter((n) => n === 'execute_family_collection_content_v1')).toHaveLength(1);
  });
  it('keeps the same operation/request after a real-shaped lost preparation response', async () => {
    const op = await session.retainContent(commandManual()),
      before = await one();
    drop('prepare_family_collection_content_v1');
    await expect(session.run(op, 'retry')).rejects.toThrow('Lost reply');
    expect(await one()).toEqual(before);
    engine.after(null);
    const s = open();
    expect((await s.run(op, 'retry')).status).toBe('committed');
    expect(engine.originals.size).toBe(1);
  });
  it('discovers a committed lost reply without creating twice', async () => {
    const op = await session.retainContent(commandManual());
    drop('execute_family_collection_content_v1');
    await expect(session.run(op, 'retry')).rejects.toThrow();
    expect(parseCollectionQueueRow(await one()).packet.original).not.toBeNull();
    engine.after(null);
    expect((await open().run(op, 'retry')).status).toBe('committed');
    expect(names().filter((n) => n === 'execute_family_collection_content_v1')).toHaveLength(1);
  });
  it('persists cancellation before the cancellation RPC and retries that decision', async () => {
    const op = await session.retainContent(commandManual());
    drop('cancel_family_collection_preparation_v2');
    await expect(session.run(op, 'cancel')).rejects.toThrow();
    expect(parseCollectionQueueRow(await one()).packet.decision).toBe('cancel');
    engine.after(null);
    expect((await open().run(op, 'retry')).status).toBe('cancelled');
    expect(names()).not.toContain('execute_family_collection_content_v1');
  });
  it('reports commit truthfully when cancellation loses', async () => {
    const op = await session.retainContent(commandManual());
    drop('execute_family_collection_content_v1');
    await expect(session.run(op, 'retry')).rejects.toThrow();
    engine.after(null);
    expect((await open().run(op, 'cancel')).status).toBe('committed');
    expect(names()).not.toContain('cancel_family_collection_content_v1');
  });
  it('check discovers prepared work but never executes it', async () => {
    const op = await session.retainContent(commandManual());
    drop('prepare_family_collection_content_v1');
    await expect(session.run(op, 'retry')).rejects.toThrow();
    engine.after(null);
    expect((await open().run(op, 'check')).status).toBe('prepared');
    expect(names()).not.toContain('execute_family_collection_content_v1');
  });
  it('a fresh session may discover/cancel a prepared original but cannot execute it', async () => {
    const op = await session.retainContent(commandManual());
    drop('prepare_family_collection_content_v1');
    await expect(session.run(op, 'retry')).rejects.toThrow();
    engine.after(null);
    const fresh = open({ ...commandActor, session_id: cid(999) });
    await expect(fresh.run(op, 'retry')).rejects.toMatchObject({ status: 409 });
    expect((await fresh.run(op, 'cancel')).status).toBe('cancelled');
  });
  it('confirms a durable never-prepared cancellation after a fresh session', async () => {
    const op = await session.retainContent(commandManual()),
      fresh = open({ ...commandActor, session_id: cid(999) });
    expect((await fresh.run(op, 'cancel')).status).toBe('cancelled');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(engine.cancellations.has(op)).toBe(true);
    expect(names()).not.toContain('prepare_family_collection_content_v1');
  });
  it('keeps a cancelled never-prepared request until a fresh canonical read succeeds', async () => {
    const op = await session.retainContent(commandManual());
    drop('get_family_collection_page_v1');
    await expect(session.run(op, 'cancel')).rejects.toThrow();
    expect(parseCollectionQueueRow(await one()).packet.decision).toBe('cancel');
    expect(engine.cancellations.has(op)).toBe(true);
    expect(publish).not.toHaveBeenCalled();
    engine.after(null);
    expect((await open().run(op, 'check')).status).toBe('cancelled');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('retains cancellation after a failed local acknowledgement and resumes without preparation', async () => {
    const op = await session.retainContent(commandManual());
    publish.mockImplementationOnce(() => {
      throw Error('Publication failed');
    });
    await expect(session.run(op, 'cancel')).rejects.toThrow('Publication failed');
    expect(await offlineDb.mutationQueue.count()).toBe(1);
    expect(engine.cancellations.has(op)).toBe(true);
    publish.mockReturnValue(undefined);
    expect((await open().run(op, 'retry')).status).toBe('cancelled');
    expect(names()).not.toContain('prepare_family_collection_content_v1');
  });
  it('refuses a second same-Collection intent while the first remains unresolved', async () => {
    const op = await session.retainContent(commandManual());
    await expect(session.retainContent(commandManual('Another'))).rejects.toMatchObject({ status: 409 });
    expect((await one()).id).toBe(op);
  });
  it('allows another deliberate visit/save after the first is settled', async () => {
    const a = await session.retainContent(commandManual());
    await session.run(a, 'retry');
    const b = await session.retainContent(commandManual());
    expect(b).not.toBe(a);
    await session.run(b, 'retry');
    expect(engine.outcomes.size).toBe(2);
  });
  it('a quota failure before retention sends no prepare', async () => {
    vi.spyOn(offlineDb.mutationQueue, 'add').mockRejectedValueOnce(Error('Quota'));
    await expect(session.retainContent(commandManual())).rejects.toThrow('Quota');
    expect(names()).not.toContain('prepare_family_collection_content_v1');
  });
  it('a failure saving the returned original sends no execute and remains recoverable', async () => {
    const op = await session.retainContent(commandManual());
    vi.spyOn(offlineDb.mutationQueue, 'put').mockRejectedValueOnce(Error('Quota'));
    await expect(session.run(op, 'retry')).rejects.toThrow('Quota');
    expect(names()).not.toContain('execute_family_collection_content_v1');
    expect(parseCollectionQueueRow(await one()).packet.original).toBeNull();
    vi.restoreAllMocks();
    expect((await open().run(op, 'retry')).status).toBe('committed');
  });
  it('a failed canonical refresh retains a confirmed original for later settlement', async () => {
    const op = await session.retainContent(commandManual());
    drop('get_family_collection_page_v1');
    await expect(session.run(op, 'retry')).rejects.toThrow();
    expect(await offlineDb.mutationQueue.count()).toBe(1);
    expect(publish).not.toHaveBeenCalled();
    engine.after(null);
    await open().run(op, 'check');
    expect(names().filter((n) => n === 'execute_family_collection_content_v1')).toHaveLength(1);
  });
  it('a failed synchronous publication rolls back local acknowledgement', async () => {
    const op = await session.retainContent(commandManual());
    publish.mockImplementationOnce(() => {
      throw Error('Refresh host retired');
    });
    await expect(session.run(op, 'retry')).rejects.toThrow();
    expect(await offlineDb.mutationQueue.count()).toBe(1);
    await open().run(op, 'check');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('refuses an asynchronous publication contract', async () => {
    const op = await session.retainContent(commandManual());
    publish.mockReturnValueOnce(Promise.resolve());
    await expect(session.run(op, 'retry')).rejects.toMatchObject({ status: 409 });
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });
  it('retiring after preparation preserves the request instead of dispatching execution', async () => {
    const op = await session.retainContent(commandManual());
    engine.after((n) => {
      if (n === 'prepare_family_collection_content_v1') session.retire();
    });
    await expect(session.run(op, 'retry')).rejects.toMatchObject({ status: 409 });
    expect(await offlineDb.mutationQueue.count()).toBe(1);
    expect(names()).not.toContain('execute_family_collection_content_v1');
  });
  it('refuses a replaced queue row after awaiting a remote response', async () => {
    const op = await session.retainContent(commandManual());
    engine.after(async (n) => {
      if (n === 'prepare_family_collection_content_v1') await offlineDb.mutationQueue.update(op, { attempts: 7 });
    });
    await expect(session.run(op, 'retry')).rejects.toMatchObject({ status: 409 });
    expect((await one()).attempts).toBe(7);
    expect(names()).not.toContain('execute_family_collection_content_v1');
  });
  it('refuses source/account retirement before a delayed reply can publish', async () => {
    const op = await session.retainContent(commandManual());
    engine.after((n) => {
      if (n === 'execute_family_collection_content_v1') live = false;
    });
    await expect(session.run(op, 'retry')).rejects.toThrow('Owner retired');
    live = true;
    expect(await offlineDb.mutationQueue.count()).toBe(1);
    expect(publish).not.toHaveBeenCalled();
  });
  it('keeps requests intact while offline and generic replay sends nothing', async () => {
    const op = await session.retainContent(commandManual()),
      before = await one();
    setForcedOffline(true);
    await expect(session.run(op, 'retry')).rejects.toMatchObject({ status: 503 });
    setForcedOffline(false);
    engine.rpc.mockClear();
    await mutationQueue.flush();
    expect(await one()).toEqual(before);
    expect(engine.rpc).not.toHaveBeenCalled();
    expect(isProtectedQueueWork(before)).toBe(true);
    expect(isRetainedCommand(before)).toBe(true);
    expect(isSupportedMutationFormat(before)).toBe(false);
  });
  it('protects even a malformed older-format Collection locator from generic dispatch', async () => {
    const op = await session.retainContent(commandManual());
    await offlineDb.mutationQueue.update(op, { schemaVersion: 2, retentionPolicy: undefined });
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.count()).toBe(1);
    await expect(session.run(op, 'retry')).rejects.toThrow();
  });
  it('preserves originals through sign-out and reopens them only in the same source account', async () => {
    const op = await session.retainContent(commandManual()),
      before = await one();
    await deleteCurrentUserDb();
    setAuthed(false);
    await expect(session.run(op, 'retry')).rejects.toThrow();
    await reopenForUser(device.marker.native_user);
    setAuthed(true);
    expect((await one()).body).toEqual(before.body);
    expect((await open().pending())[0].packet.operation_id).toBe(op);
  });
  it('exports the protected Collection original using the existing source-owned format', async () => {
    vi.stubGlobal('Blob', NativeBlob);
    vi.stubGlobal('File', NativeFile);
    const op = await session.retainContent(commandManual());
    const exported = await prepareOriginalWorkExport();
    try {
      const data = JSON.parse(await exported.blob.text());
      expect(data.format).toBe('family.original-work.v3');
      expect(data.payload).toContain(op);
    } finally {
      exported.dispose();
    }
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });
  it('refuses a read-only saved session', () => {
    const release = installReadOnlySession();
    try {
      expect(() => open()).toThrow('read only');
    } finally {
      release();
    }
  });
  it('rejects fields added to an original rather than silently stripping them', async () => {
    await session.retainContent(commandManual());
    const r = await one();
    expect(() => parseCollectionCommand({ ...parseCollectionQueueRow(r).packet, other: true })).toThrow();
  });
  it('keeps lifecycle Trash/Restore originals and refreshes the matching root state', async () => {
    const trash = await session.retainLifecycle('trash', null, 'active');
    expect((await session.run(trash, 'retry')).status).toBe('committed');
    const deleted = { id: commandActor.collection_id, deleted_at: '2026-11-15T00:00:00.123456Z' };
    expect(publish.mock.calls[0][0].collection).toMatchObject(deleted);
    const page = await session.trash('collection');
    expect(page.items).toHaveLength(1);
    const [selected] = page.items;
    expect(selected).toMatchObject(deleted);

    const restore = await session.retainLifecycle('restore', null, 'trash', selected);
    expect((await session.run(restore, 'retry')).status).toBe('committed');
    expect(publish.mock.calls[1][0].collection).toMatchObject({ id: deleted.id, deleted_at: null });
    expect((await session.trash('collection')).items).toEqual([]);
  });
  it('can cancel an observed lifecycle before it executes', async () => {
    const op = await session.retainLifecycle('trash', null, 'active');
    expect((await session.run(op, 'cancel')).status).toBe('cancelled');
    expect(engine.root.deleted_at).toBeNull();
  });
  it('retains an item lifecycle with its aggregate content revision', async () => {
    const op = await session.retainLifecycle('trash', cid(90), 'active');
    const p = parseCollectionQueueRow(await one()).packet;
    expect(p.kind).toBe('lifecycle');
    if (p.kind !== 'lifecycle' || p.original.target_kind !== 'item') throw Error('Expected item');
    expect(p.original.expected_collection_revision).toBe(0);
    expect((await session.run(op, 'retry')).status).toBe('committed');
  });
  it('serializes two simultaneous attempts without dispatching the original twice', async () => {
    const op = await session.retainContent(commandManual());
    const results = await Promise.allSettled([session.run(op, 'retry'), session.run(op, 'retry')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(names().filter((n) => n === 'execute_family_collection_content_v1')).toHaveLength(1);
  });
  it('allows independent pending originals in two Collections without re-parenting', async () => {
    const a = await session.retainContent(commandManual());
    const other = { ...commandActor, collection_id: cid(12) },
      api = collectionEngine(other);
    const second = new CollectionCommandSession(
      { scope: other, source_url: 'https://fixture.invalid', assertCurrent: () => {}, publish },
      api.rpc
    );
    active.push(second);
    const b = await second.retainContent(commandManual());
    expect(await offlineDb.mutationQueue.count()).toBe(2);
    await session.run(a, 'retry');
    expect((await one()).id).toBe(b);
    await second.run(b, 'retry');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('refuses a different source or Family before dispatch', () => {
    expect(
      () =>
        new CollectionCommandSession(
          { scope: commandActor, source_url: 'https://other.invalid', assertCurrent: () => {}, publish },
          engine.rpc
        )
    ).toThrow('original verified source');
    expect(() => open({ ...commandActor, family_id: cid(777) })).toThrow('original verified source');
    expect(engine.rpc).not.toHaveBeenCalled();
  });
  it('refuses an unlinked write person while preserving read support separately', () => {
    expect(() => open({ ...commandActor, person_id: null })).toThrow('linked Family person');
    expect(engine.rpc).not.toHaveBeenCalled();
  });
  it('releases a stalled request without accepting its late callback as a save', async () => {
    const timed = new CollectionCommandSession(
      { scope: commandActor, source_url: 'https://fixture.invalid', assertCurrent: () => {}, publish, timeoutMs: 10 },
      engine.rpc
    );
    active.push(timed);
    const op = await timed.retainContent(commandManual());
    engine.after(async (name) => {
      if (name === 'prepare_family_collection_content_v1') await new Promise((r) => setTimeout(r, 40));
    });
    await expect(timed.run(op, 'retry')).rejects.toMatchObject({ status: 503 });
    expect(await offlineDb.mutationQueue.count()).toBe(1);
    expect(publish).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 50));
    engine.after(null);
    await open().run(op, 'retry');
    expect(names().filter((n) => n === 'execute_family_collection_content_v1')).toHaveLength(1);
  });
  it('presents retained work in the shared recovery boundary and retries the same operation', async () => {
    await session.retainContent(commandManual());
    render(<FamilyCollectionRecovery session={session} />);
    await screen.findByRole('button', { name: 'Retry original' });
    fireEvent.click(screen.getByRole('button', { name: 'Retry original' }));
    await screen.findByText('Original save confirmed.');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('never reuses this Collection restore action for another trashed root', async () => {
    const op = await session.retainLifecycle('trash', null, 'active');
    await session.run(op, 'retry');
    engine.after((name, _args, result) => {
      if (name === 'list_family_collection_trash_v1') {
        const page = result as { items: Array<Record<string, unknown>> };
        page.items.push({ ...page.items[0], id: cid(999) });
      }
    });
    render(<FamilyCollectionRecovery session={session} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load deleted Collections' }));
    await screen.findByRole('button', { name: 'Restore Collection' });
    expect(screen.getAllByRole('button', { name: 'Restore Collection' })).toHaveLength(1);
  });
  it('binds root Restore to the selected deletion and retains its revision', async () => {
    await session.run(await session.retainLifecycle('trash', null, 'active'), 'retry');
    const row = (await session.trash('collection')).items[0];
    const op = await session.retainLifecycle('restore', null, 'trash', row);
    const packet = parseCollectionQueueRow(await one()).packet;
    expect(packet.operation_id).toBe(op);
    expect(packet.original).toMatchObject({ expected_revision: row.revision });
    await session.run(op, 'retry');
    expect(engine.root.deleted_at).toBeNull();
  });
  it('does not replace a stale selected root deletion with a newly observed Restore', async () => {
    await session.run(await session.retainLifecycle('trash', null, 'active'), 'retry');
    const row = (await session.trash('collection')).items[0];
    engine.root.revision++;
    await expect(session.retainLifecycle('restore', null, 'trash', row)).rejects.toMatchObject({
      status: 409,
      code: 'collection_recovery_changed',
    });
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(engine.root.deleted_at).not.toBeNull();
  });
  it('refuses item Restore under an archived parent without retaining or executing a replacement', async () => {
    engine.root.archived_at = '2026-11-15T00:00:00.123456Z';
    const row = {
      id: cid(777),
      collection_id: commandActor.collection_id,
      kind: 'manual',
      source: { kind: 'manual', id: null },
      revision: 1,
      status: 'idea',
      sort_order: 0,
      deleted_at: '2026-11-15T00:00:00.123456Z',
    };
    engine.after((name, _args, value) => {
      if (name === 'get_family_collection_item_context_v1') (value as { item: unknown }).item = row;
    });
    await expect(session.retainLifecycle('restore', row.id, 'active', row)).rejects.toMatchObject({
      status: 409,
      code: 'collection_state_changed',
    });
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(names()).not.toContain('execute_family_collection_item_lifecycle_v1');
  });
  it('rejects an unscoped or active selected record before dispatch', async () => {
    const row = {
      id: cid(999),
      family_id: commandActor.family_id,
      owner_person_id: commandActor.person_id,
      visibility: 'private',
      revision: 1,
      lifecycle_revision: 0,
      archived_at: null,
      deleted_at: null,
    };
    await expect(session.retainLifecycle('restore', null, 'trash', row)).rejects.toMatchObject({ status: 400 });
    expect(engine.rpc).not.toHaveBeenCalled();
  });
  it('exposes root Trash and authorized Restore in the recovery boundary', async () => {
    const op = await session.retainLifecycle('trash', null, 'active');
    await session.run(op, 'retry');
    render(<FamilyCollectionRecovery session={session} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load deleted Collections' }));
    await screen.findByRole('button', { name: 'Restore Collection' });
    fireEvent.click(screen.getByRole('button', { name: 'Restore Collection' }));
    await screen.findByText('Original save confirmed.');
    expect(engine.root.deleted_at).toBeNull();
  });
});
registerCollectionCommandsLive();
