import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cid, collectionDevice, collectionEngine, commandActor } from '../../../tests/helpers/collectionCommandFixture';
import { offlineDb } from '../../db/offlineDb';
import { parseCollectionQueueRow } from './collectionCommandQueue';
import { CollectionCommandSession } from './collectionCommandSession';
import type { CollectionContentSelection } from './collectionContract';
let device: Awaited<ReturnType<typeof collectionDevice>>,
  engine: ReturnType<typeof collectionEngine>,
  session: CollectionCommandSession;
const selection = (): CollectionContentSelection => ({
  scope: { ...commandActor, lifecycle_revision: 0 },
  target: { item_id: cid(77) },
  observation: {
    version: 1,
    collection_revision: 1,
    content_revision: 0,
    lifecycle_revision: 0,
    item_revision: 1,
    item_digest: 'a'.repeat(64),
    source_digest: null,
  },
});
beforeEach(async () => {
  device = await collectionDevice();
  engine = collectionEngine();
  session = new CollectionCommandSession(
    { scope: commandActor, source_url: 'https://fixture.invalid', assertCurrent: () => {}, publish: () => {} },
    engine.rpc
  );
});
afterEach(async () => {
  session.retire();
  await device.close();
  vi.restoreAllMocks();
});
describe('displayed Collection observations', () => {
  it.each([
    { action: 'edit', body: { item_id: cid(77), changes: { notes: 'Draft' } } },
    { action: 'status', body: { item_id: cid(77), status: 'visited' } },
    { action: 'materialize', body: { item_id: cid(77) } },
    { action: 'reorder', body: { ordered_ids: [] } },
  ])('requires displayed facts before existing content mutation $action', async (intent) => {
    await expect(session.retainContent(intent)).rejects.toMatchObject({
      status: 400,
      code: 'collection_observation_required',
    });
    expect(engine.rpc).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('retains the displayed revision instead of fetching a replacement at submit', async () => {
    const selected = selection();
    engine.root.revision = 2;
    await session.retainContent(
      { action: 'edit', body: { item_id: cid(77), changes: { notes: 'My draft' } } },
      selected
    );
    const packet = parseCollectionQueueRow((await offlineDb.mutationQueue.toArray())[0]).packet;
    expect(packet.kind).toBe('content');
    if (packet.kind !== 'content') throw Error('Expected content');
    expect(packet.preparation.observation).toEqual(selected.observation);
    expect(packet.preparation.scope).toEqual(selected.scope);
    expect(engine.rpc).not.toHaveBeenCalled();
  });
  it('clones and freezes the submitted displayed facts before asynchronous persistence', async () => {
    const selected = selection();
    const saved = session.retainContent(
      { action: 'edit', body: { item_id: cid(77), changes: { notes: 'My draft' } } },
      selected
    );
    selected.observation.collection_revision = 99;
    await saved;
    const p = parseCollectionQueueRow((await offlineDb.mutationQueue.toArray())[0]).packet;
    expect(p.kind === 'content' && p.preparation.observation.collection_revision).toBe(1);
  });
  it.each(['user_id', 'family_id', 'person_id', 'session_id', 'collection_id'] as const)(
    'refuses a selected %s from another owner without dispatch',
    async (key) => {
      const selected = selection();
      selected.scope[key] = cid(999);
      await expect(
        session.retainContent({ action: 'edit', body: { item_id: cid(77), changes: { notes: 'Draft' } } }, selected)
      ).rejects.toMatchObject({ status: 409 });
      expect(engine.rpc).not.toHaveBeenCalled();
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
  it('refuses changing the selected item identity', async () => {
    await expect(
      session.retainContent({ action: 'edit', body: { item_id: cid(78), changes: { notes: 'Draft' } } }, selection())
    ).rejects.toMatchObject({ status: 409 });
    expect(engine.rpc).not.toHaveBeenCalled();
  });
  it('refuses a mismatched lifecycle observation', async () => {
    const p = selection();
    p.scope.lifecycle_revision = 1;
    await expect(
      session.retainContent({ action: 'edit', body: { item_id: cid(77), changes: { notes: 'Draft' } } }, p)
    ).rejects.toBeDefined();
    expect(engine.rpc).not.toHaveBeenCalled();
  });
  it('observes explicitly when the order view is opened, then retains that exact snapshot', async () => {
    const selected = await session.observeContent({});
    expect(Object.isFrozen(selected.selection)).toBe(true);
    engine.root.revision = 2;
    await session.retainContent({ action: 'reorder', body: { ordered_ids: [] } }, selected.selection);
    expect(engine.rpc.mock.calls.map((row) => row[0])).toEqual(['get_family_collection_authoring_context_v1']);
    const p = parseCollectionQueueRow((await offlineDb.mutationQueue.toArray())[0]).packet;
    expect(p.kind === 'content' && p.preparation.observation.collection_revision).toBe(1);
  });
});

describe('editor-scoped command retirement', () => {
  it('stops after a delayed preparation reply and leaves the exact original recoverable by its parent', async () => {
    const child = session.scoped(() => {});
    const op = await child.retainContent(
      { action: 'reorder', body: { ordered_ids: [] } },
      (await child.observeContent({})).selection
    );
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    engine.after(async (name) => {
      if (name === 'prepare_family_collection_content_v1') await gate;
    });
    const saving = child.run(op, 'retry');
    const rejected = expect(saving).rejects.toMatchObject({ status: 409 });
    await vi.waitFor(() => expect(engine.originals.size).toBe(1));
    child.retire();
    release();
    await rejected;
    engine.after(null);
    expect(engine.rpc.mock.calls.map((row) => row[0])).not.toContain('execute_family_collection_content_v1');
    expect((await session.pending()).map((row) => row.packet.operation_id)).toContain(op);
    expect((await session.run(op, 'cancel')).status).toBe('cancelled');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('retiring a parent also fences its still-mounted child', async () => {
    const child = session.scoped(() => {});
    session.retire();
    await expect(child.observeContent()).rejects.toMatchObject({ status: 409 });
    expect(engine.rpc).not.toHaveBeenCalled();
  });
});
