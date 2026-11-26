import { describe, expect, it, vi } from 'vitest';
import type { CollectionCommandSession } from './collectionCommandSession';
import {
  openCollectionNativeEditor,
  openCollectionNativeOrder,
  type CollectionNativeEditOwner,
} from './collectionNativeEdits';
import { nativeCollectionItem } from './collectionNativeViews';
import type { createCollectionReadSession } from './collectionReadSession';
import { FamilyIdentityRegistry } from './identity';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture() {
  const scope = {
      version: 1 as const,
      user_id: id(1),
      person_id: id(2),
      family_id: id(3),
      session_id: id(4),
      collection_id: id(10),
    },
    ids = new FamilyIdentityRegistry(scope.user_id);
  let active = true;
  const item = {
    id: id(77),
    collection_id: id(10),
    kind: 'manual' as const,
    source: { kind: 'manual' as const, id: null },
    revision: 1,
    status: 'idea' as const,
    sort_order: 0,
    deleted_at: null,
    content_mode: 'snapshot' as const,
    content: {
      name: 'Seen name',
      description: 'Seen description',
      latitude: null,
      longitude: null,
      address: null,
      website: null,
      phone: null,
    },
    notes: 'Personal notes',
    category: null,
    geography: null,
    source_observation: null,
    cover: { id: null, availability: 'absent' as const, thumb_url: null, hero_url: null },
    native_location_compatible: true,
    added_at: '2026-11-15T00:00:00Z',
  };
  const root = {
    native: { id: ids.register('collection', id(10)) } as { id: number } | null,
    canonical: { can_edit_items: true },
  };
  const canonical = {
    scope: { ...scope, lifecycle_revision: 0 },
    observation: {
      version: 1,
      collection_revision: 1,
      content_revision: 1,
      lifecycle_revision: 0,
      item_revision: 1,
      item_digest: 'a'.repeat(64),
      source_digest: null,
    },
    item,
    collection: { id: id(10), revision: 1 },
    content_revision: 1,
  };
  const frame = { root, canonical, item: nativeCollectionItem(item, ids), current: () => active };
  const reads = {
    editor: vi.fn().mockResolvedValue(frame),
    detail: vi.fn().mockResolvedValue({ ...frame, items: [frame.item], canonical: { ...canonical, items: [item] } }),
  };
  const commands = {
    scope,
    scoped: vi.fn(),
    retire: vi.fn(),
    retainContent: vi.fn().mockResolvedValue(id(900)),
    run: vi.fn().mockResolvedValue({ status: 'committed', view: { items: [item] } }),
  };
  commands.scoped.mockImplementation(() => commands);
  const owner = {
    reads: reads as unknown as ReturnType<typeof createCollectionReadSession>,
    commands: commands as unknown as CollectionCommandSession,
    ids,
    assertCurrent: () => {
      if (!active) throw Error('Owner ended');
    },
  } satisfies CollectionNativeEditOwner;
  return {
    scope,
    ids,
    item,
    root,
    canonical,
    frame,
    reads,
    commands,
    owner,
    retire() {
      active = false;
    },
  };
}
describe('native Collection editor display-bound commands', () => {
  it('keeps displayed description/notes and passes the exact editor observation', async () => {
    const f = fixture(),
      editor = await openCollectionNativeEditor(f.owner, id(10), id(77));
    expect(editor.initial.native.description).toBe('Seen description');
    expect(editor.initial.native.notes).toBe('Personal notes');
    await editor.save({ description: 'Changed description', notes: 'Changed notes' });
    expect(f.commands.retainContent).toHaveBeenCalledWith(
      {
        action: 'edit',
        body: { item_id: id(77), changes: { description: 'Changed description', notes: 'Changed notes' } },
      },
      editor.selection
    );
    expect(f.commands.run).toHaveBeenCalledWith(id(900), 'retry');
  });
  it('maps a real native category through its scoped registry and preserves explicit clearing', async () => {
    const f = fixture(),
      category = f.ids.register('category', id(99)),
      editor = await openCollectionNativeEditor(f.owner, id(10), id(77));
    await editor.save({ category_id: category, name: null, notes: null });
    expect(f.commands.retainContent.mock.calls[0][0].body.changes).toEqual({
      family_place_category_id: id(99),
      name: null,
      notes: null,
    });
  });
  it.each([
    { price: 100 },
    { currency: 'USD' },
    { image_url: 'https://example.invalid/image.webp' },
    { source_place_id: 42 },
    { description: undefined },
    {},
  ])('refuses unsupported/lossy patch %# before persistence', async (patch) => {
    const f = fixture(),
      editor = await openCollectionNativeEditor(f.owner, id(10), id(77));
    await expect(editor.save(patch)).rejects.toMatchObject({ status: 400 });
    expect(f.commands.retainContent).not.toHaveBeenCalled();
  });
  it('requires a coordinate pair rather than silently carrying an old coordinate', async () => {
    const f = fixture(),
      editor = await openCollectionNativeEditor(f.owner, id(10), id(77));
    await expect(editor.save({ lat: 1 })).rejects.toBeDefined();
    expect(f.commands.retainContent).not.toHaveBeenCalled();
  });
  it('retries a lost reply with the same retained UUID and refuses a replacement body', async () => {
    const f = fixture(),
      editor = await openCollectionNativeEditor(f.owner, id(10), id(77));
    f.commands.run.mockRejectedValueOnce(Error('Lost reply'));
    await expect(editor.save({ notes: 'Draft' })).rejects.toThrow('Lost reply');
    expect(editor.operationId).toBe(id(900));
    await expect(editor.save({ notes: 'Replacement' })).rejects.toMatchObject({ status: 409 });
    await editor.save({ notes: 'Draft' });
    expect(f.commands.retainContent).toHaveBeenCalledTimes(1);
    expect(f.commands.run.mock.calls).toEqual([
      [id(900), 'retry'],
      [id(900), 'retry'],
    ]);
  });
  it('does not treat a second save on a completed editor as another deliberate edit', async () => {
    const f = fixture(),
      editor = await openCollectionNativeEditor(f.owner, id(10), id(77));
    await editor.save({ notes: 'Draft' });
    await expect(editor.save({ notes: 'Draft' })).rejects.toMatchObject({ status: 409 });
    expect(f.commands.run).toHaveBeenCalledTimes(1);
  });
  it('retirement prevents submission without losing the displayed draft values', async () => {
    const f = fixture(),
      editor = await openCollectionNativeEditor(f.owner, id(10), id(77));
    editor.retire();
    await expect(editor.save({ notes: 'Draft' })).rejects.toMatchObject({ status: 409 });
    expect(editor.initial.native.notes).toBe('Personal notes');
    expect(f.commands.retainContent).not.toHaveBeenCalled();
  });
  it('does not return a late native result to a retired editor', async () => {
    const f = fixture();
    let done!: (v: unknown) => void;
    f.commands.run.mockReturnValue(
      new Promise((r) => {
        done = r;
      })
    );
    const editor = await openCollectionNativeEditor(f.owner, id(10), id(77)),
      save = editor.save({ notes: 'Draft' });
    await vi.waitFor(() => expect(f.commands.run).toHaveBeenCalledTimes(1));
    editor.retire();
    done({ status: 'committed', view: { items: [f.item] } });
    await expect(save).rejects.toMatchObject({ status: 409 });
  });
  it('requires actual edit permission without inventing member roles', async () => {
    const f = fixture();
    f.root.canonical.can_edit_items = false;
    await expect(openCollectionNativeEditor(f.owner, id(10), id(77))).rejects.toMatchObject({ status: 403 });
    expect(f.commands.retainContent).not.toHaveBeenCalled();
  });
  it('preserves an unlinked owner as an explicit compatibility refusal', async () => {
    const f = fixture();
    f.root.native = null;
    await expect(openCollectionNativeEditor(f.owner, id(10), id(77))).rejects.toMatchObject({ status: 422 });
  });
  it('refuses an editor snapshot from a different actor/session', async () => {
    const f = fixture();
    f.canonical.scope.session_id = id(999);
    await expect(openCollectionNativeEditor(f.owner, id(10), id(77))).rejects.toMatchObject({ status: 409 });
  });
  it('status and materialization use the same displayed observation', async () => {
    for (const action of ['status', 'materialize']) {
      const f = fixture(),
        editor = await openCollectionNativeEditor(f.owner, id(10), id(77));
      await (action === 'status' ? editor.setStatus('visited') : editor.materialize());
      expect(f.commands.retainContent.mock.calls[0][1]).toEqual(editor.selection);
      expect(f.commands.retainContent.mock.calls[0][0].action).toBe(action);
    }
  });
  it('order retains complete displayed identities and revision without another context read', async () => {
    const f = fixture(),
      order = await openCollectionNativeOrder(f.owner, id(10));
    await order.save([f.frame.item.native.id]);
    expect(f.commands.retainContent.mock.calls[0][0]).toEqual({ action: 'reorder', body: { ordered_ids: [id(77)] } });
    expect(f.commands.retainContent.mock.calls[0][1]).toMatchObject({
      observation: { collection_revision: 1, content_revision: 1, item_revision: null },
      target: {},
    });
  });
  it.each([{ ids: [] }, { ids: [1] }, { ids: [1, 1] }])(
    'refuses partial/foreign/duplicate displayed order $ids',
    async ({ ids }) => {
      const f = fixture(),
        order = await openCollectionNativeOrder(f.owner, id(10));
      await expect(order.save(ids)).rejects.toMatchObject({ status: 409 });
      expect(f.commands.retainContent).not.toHaveBeenCalled();
    }
  );
});
