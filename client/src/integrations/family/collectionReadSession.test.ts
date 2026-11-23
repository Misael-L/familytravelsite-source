vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: vi.fn() }));
vi.mock('@family/backend/supabase/env', () => ({ getSupabaseUrl: () => 'https://fixture.invalid' }));
import type { LibraryPage, LibraryRoot } from '@family/backend/supabase/collectionLibrary';
import type { CollectionRpc } from '@family/backend/supabase/collectionRpc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCollectionReadsLive } from '../../../tests/qualification/collectionReads.live';
import api from '../../api/client';
import { useCollectionStore } from '../../store/collectionStore';
import { requireNativeCollection } from './collectionNativeViews';
import { createCollectionReadSession } from './collectionReadSession';
import { FamilyIdentityRegistry } from './identity';
import { createFamilyAxiosAdapter } from './transport';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = '2026-11-15T00:00:00.123456Z',
  hash = 'a'.repeat(64),
  source = 'https://fixture.invalid';
const actor = { version: 1 as const, family_id: id(1), user_id: id(2), person_id: id(3), session_id: id(4) };
const cover = { id: null, availability: 'absent' as const, thumb_url: null, hero_url: null };
type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

function fixtures() {
  const root: Mutable<LibraryRoot> = {
    id: id(10),
    family_id: actor.family_id,
    owner_person_id: actor.person_id,
    visibility: 'private',
    revision: 1,
    lifecycle_revision: 0,
    archived_at: null,
    deleted_at: null,
    name: 'Family collection',
    description: 'List description',
    color: null,
    sort_order: 0,
    cover,
  };
  const entry = {
    collection: root,
    content_revision: 9,
    active_item_count: 9,
    can_edit_items: true,
    can_admin: true,
    is_owner: true,
    created_at: at,
    updated_at: at,
  };
  const kinds = ['country', 'place', 'food', 'hotel', 'experience', 'airport', 'airline', 'guide', 'manual'];
  const items = kinds.map((kind, i) => ({
    id: id(20 + i),
    collection_id: root.id,
    kind,
    source: { kind, id: kind === 'manual' ? null : id(40 + i) },
    revision: 1,
    status: 'idea',
    sort_order: i,
    deleted_at: null,
    content_mode: kind === 'manual' ? 'snapshot' : 'reference',
    content: {
      name: 'Same name',
      description: 'Description ' + kind,
      latitude: 10 + i,
      longitude: 20 + i,
      address: null,
      website: null,
      phone: null,
    },
    notes: 'Personal ' + kind,
    category: null,
    geography: null,
    source_observation:
      kind === 'manual' ? null : { kind, id: id(40 + i), updated_at: null, digest: hash, archived: false },
    cover,
    native_location_compatible: ['place', 'food', 'hotel', 'experience', 'manual'].includes(kind),
    added_at: at,
  }));
  const scope = { ...actor, collection_id: root.id, lifecycle_revision: 0 };
  const library: Mutable<LibraryPage> = {
    version: 1,
    scope: actor,
    state: 'active',
    library_digest: hash,
    total_count: 1,
    offset: 0,
    collections: [entry],
    next_cursor: null,
  };
  const page = { version: 1, scope, collection: root, content_revision: 9, items, next_cursor: null };
  const membership = {
    version: 1,
    identity: { kind: 'food', id: id(42) },
    source_observation: { kind: 'food', id: id(42), digest: hash },
    saved: true,
    lists: [
      {
        collection_id: root.id,
        item_id: items[2].id,
        name: root.name,
        color: null,
        archived_at: null,
        status: 'idea',
        can_edit: true,
      },
    ],
  };
  const rpc = vi.fn<CollectionRpc>(async (name) => {
    if (name === 'get_family_collection_library_v1') return structuredClone(library);
    if (name === 'get_family_collection_page_v1') return structuredClone(page);
    if (name === 'get_family_collection_membership_v1') return structuredClone(membership);
    if (name === 'get_family_collection_editor_v1')
      return {
        ...structuredClone(page),
        items: undefined,
        item: structuredClone(items[2]),
        observation: {
          version: 1,
          collection_revision: 1,
          content_revision: 9,
          lifecycle_revision: 0,
          item_revision: 1,
          item_digest: hash,
          source_digest: hash,
        },
      };
    throw Error('Unsupported fixture request');
  });
  const ids = new FamilyIdentityRegistry(actor.user_id);
  let live = true;
  const session = createCollectionReadSession(
    {
      scope: actor,
      source_url: source,
      ids,
      assertCurrent: () => {
        if (!live) throw Error('retired owner');
      },
    },
    rpc
  );
  return {
    root,
    entry,
    items,
    library,
    page,
    membership,
    rpc,
    ids,
    session,
    retire: () => {
      live = false;
    },
  };
}
const originalAdapter = api.defaults.adapter,
  originalStore = useCollectionStore.getState();
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  useCollectionStore.setState(originalStore, true);
});
describe('native Collection read/identity session', () => {
  it('maps a complete library without fabricating native roles, labels or providers', async () => {
    const f = fixtures(),
      r = await f.session.list(),
      n = requireNativeCollection(r.collections[0]);
    expect(n.id).toBe(f.ids.register('collection', f.root.id));
    expect(n.place_count).toBe(9);
    expect(n.owner_id).toBe(f.ids.register('person', actor.person_id));
    expect(n.members).toBeUndefined();
    expect(n.labels).toBeUndefined();
    expect(r.current()).toBe(true);
    expect(Object.isFrozen(n)).toBe(true);
  });
  it('keeps all nine typed records visible, with distinct own item and source identities', async () => {
    const f = fixtures(),
      d = await f.session.detail(f.root.id);
    expect(d.items).toHaveLength(9);
    expect(new Set(d.items.map((i) => i.native.id)).size).toBe(9);
    expect(d.items.every((i) => i.native.name === 'Same name')).toBe(true);
    expect(d.items[2].native.lat).toBe(12);
    expect(d.items[1].native.lat).toBe(11);
    expect(
      d.items
        .filter((i) => !i.canonical.native_location_compatible)
        .every((i) => i.native.lat === null && i.native.lng === null)
    ).toBe(true);
    for (const row of d.items) {
      expect(row.native.description).toBe('Description ' + row.canonical.kind);
      expect(row.native.notes).toBe('Personal ' + row.canonical.kind);
      expect(row.native.google_place_id).toBeUndefined();
      expect(row.native.source_place_id).toBeUndefined();
      expect(row.canonical.source.id).not.toBe(row.canonical.id);
    }
  });
  it('does not enlarge a ready thumbnail when no hero exists', async () => {
    const f = fixtures();
    Object.assign(f.items[2], {
      cover: {
        id: id(100),
        availability: 'ready_variants',
        thumb_url: source + '/storage/v1/object/public/catalog/variants/v1/x/thumb-a.webp',
        hero_url: null,
      },
    });
    const d = await f.session.detail(f.root.id);
    expect(d.items[2].native.image_url).toBeNull();
    expect(d.items[2].thumbnail_url).toContain('/thumb-');
  });
  it('uses the stored hero and real Family category in the native detail', async () => {
    const f = fixtures();
    Object.assign(f.items[2], {
      cover: {
        id: id(100),
        availability: 'ready_variants',
        thumb_url: source + '/storage/v1/object/public/catalog/variants/v1/x/thumb-a.webp',
        hero_url: source + '/storage/v1/object/public/catalog/variants/v1/x/hero-a.webp',
      },
      category: { id: id(101), name: 'Restaurant', color: '#123456', icon: 'utensils' },
    });
    const d = await f.session.detail(f.root.id);
    expect(d.items[2].native.image_url).toContain('/hero-');
    expect(d.items[2].native.category?.name).toBe('Restaurant');
    expect(d.items[2].native.category_id).toBe(f.ids.register('category', id(101)));
  });
  it('preserves unlinked owner metadata with an explicit native compatibility refusal', async () => {
    const f = fixtures();
    f.root.owner_person_id = null;
    f.entry.is_owner = false;
    const register = vi.spyOn(f.ids, 'register');
    const r = await f.session.list();
    expect(r.collections).toHaveLength(1);
    expect(r.collections[0]).toMatchObject({
      canonical: { collection: { owner_person_id: null } },
      native: null,
      unavailable: 'unlinked_owner',
    });
    expect(register.mock.calls.some(([kind]) => kind === 'person')).toBe(false);
    expect(() => requireNativeCollection(r.collections[0])).toThrow('no linked owner');
  });
  it('keeps global nullable person identity and actual read-only flags', async () => {
    const f = fixtures();
    f.library.scope = { ...actor, person_id: null };
    f.entry.is_owner = false;
    f.entry.can_edit_items = false;
    f.entry.can_admin = false;
    const s = createCollectionReadSession(
      { scope: f.library.scope, source_url: source, ids: f.ids, assertCurrent: () => {} },
      f.rpc
    );
    const r = await s.list();
    expect(r.canonical.scope).toEqual({ ...actor, person_id: null });
    expect(r.collections[0].canonical).toMatchObject({ is_owner: false, can_edit_items: false, can_admin: false });
    expect(requireNativeCollection(r.collections[0]).owner_id).toBe(f.ids.register('person', actor.person_id));

    f.entry.is_owner = true;
    await expect(s.list()).rejects.toMatchObject({ code: 'collection_library_contract' });
  });
  it.each(['name', 'lat', 'google_place_id'])(
    'refuses the fuzzy membership selector %s before any RPC',
    async (key) => {
      const f = fixtures();
      await expect(f.session.membership({ [key]: 'Same name' } as never)).rejects.toMatchObject({ status: 400 });
      expect(f.rpc).not.toHaveBeenCalled();
    }
  );
  it('uses exact membership item/list UUIDs and flags in native membership', async () => {
    const f = fixtures(),
      r = await f.session.membership({ kind: 'food', id: id(42) });
    expect(r.native.saved).toBe(true);
    expect(r.native.lists[0].place_id).toBe(f.ids.register('collectionItem', f.items[2].id));
    expect(r.native.lists[0].collection_id).toBe(f.ids.register('collection', f.root.id));
    expect(r.canonical.identity).toEqual({ kind: 'food', id: id(42) });
  });
  it('passes saved Trip location identity unchanged without substituting a city', async () => {
    const f = fixtures(),
      target = { trip_id: id(80), location_id: id(81) };
    Object.assign(f.membership, {
      identity: target,
      source_observation: { ...target, location_revision: 1, kind: 'food', id: id(42), digest: hash },
    });
    await f.session.membership(target);
    expect(f.rpc.mock.calls[0][1].p_identity).toEqual(target);
  });
  it('passes Collection item identity without name/provider guessing', async () => {
    const f = fixtures(),
      target = { collection_id: f.root.id, item_id: f.items[2].id };
    Object.assign(f.membership, { identity: target, source_observation: { ...target, item_revision: 1 } });
    await f.session.membership(target);
    expect(f.rpc.mock.calls[0][1].p_identity).toEqual(target);
  });
  it('preserves a membership refusal rather than returning not saved', async () => {
    const f = fixtures();
    f.rpc.mockRejectedValueOnce({ code: '42501' });
    await expect(f.session.membership({ kind: 'food', id: id(42) })).rejects.toMatchObject({ status: 403 });
  });
  it('preserves a library network error rather than returning an empty list', async () => {
    const f = fixtures();
    f.rpc.mockRejectedValueOnce(Error('offline'));
    await expect(f.session.list()).rejects.toThrow('offline');
  });
  it('refuses a malformed or partial library', async () => {
    const f = fixtures();
    f.library.total_count = 2;
    await expect(f.session.list()).rejects.toThrow('complete Collection library');
  });
  it('refuses detail metadata changed between index and content reads', async () => {
    const f = fixtures();
    f.rpc.mockImplementation(async (name) =>
      name === 'get_family_collection_library_v1'
        ? structuredClone(f.library)
        : { ...structuredClone(f.page), content_revision: 10 }
    );
    await expect(f.session.detail(f.root.id)).rejects.toMatchObject({ status: 409 });
  });
  it('refuses a mismatched aggregate item count instead of dropping records', async () => {
    const f = fixtures();
    f.entry.active_item_count = 8;
    await expect(f.session.detail(f.root.id)).rejects.toMatchObject({ status: 409 });
  });
  it('does not publish a detail absent from the complete authorized library', async () => {
    const f = fixtures();
    f.library.collections = [];
    f.library.total_count = 0;
    await expect(f.session.detail(f.root.id)).rejects.toMatchObject({ status: 404 });
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it('requires an observed parent association before editor reads', async () => {
    const f = fixtures();
    await expect(f.session.editor(f.root.id, f.items[2].id)).rejects.toMatchObject({ status: 409 });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it('reads an exact observed editor item and prevents another parent', async () => {
    const f = fixtures();
    await f.session.detail(f.root.id);
    await expect(f.session.editor(id(11), f.items[2].id)).rejects.toMatchObject({ status: 409 });
    f.rpc.mockImplementation(async (name) => {
      if (name === 'get_family_collection_library_v1') return structuredClone(f.library);
      const { items, next_cursor: _nextCursor, ...base } = structuredClone(f.page);
      return {
        ...base,
        item: items[2],
        observation: {
          version: 1,
          collection_revision: 1,
          content_revision: 9,
          lifecycle_revision: 0,
          item_revision: 1,
          item_digest: hash,
          source_digest: hash,
        },
      };
    });
    const r = await f.session.editor(f.root.id, f.ids.register('collectionItem', f.items[2].id));
    expect(r.item.canonical.id).toBe(f.items[2].id);
  });
  it('rejects another account registry before any request', () => {
    const f = fixtures();
    expect(() =>
      createCollectionReadSession(
        { scope: actor, source_url: source, ids: new FamilyIdentityRegistry(id(999)), assertCurrent: () => {} },
        f.rpc
      )
    ).toThrow('context changed');
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it('retiring invalidates already returned snapshots and later dispatch', async () => {
    const f = fixtures(),
      r = await f.session.list();
    f.session.retire();
    expect(r.current()).toBe(false);
    await expect(f.session.list()).rejects.toMatchObject({ status: 409 });
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it('external context retirement invalidates reads without touching another owner', async () => {
    const f = fixtures(),
      r = await f.session.list();
    f.retire();
    expect(r.current()).toBe(false);
    await expect(f.session.list()).rejects.toThrow('retired owner');
  });
  it('refuses a delayed callback from a retired session', async () => {
    const f = fixtures();
    let release: (v: unknown) => void = () => {};
    f.rpc.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = r;
        })
    );
    const pending = f.session.list();
    f.session.retire();
    release(structuredClone(f.library));
    await expect(pending).rejects.toMatchObject({ status: 409 });
  });
  it('a newer library request supersedes an earlier reply', async () => {
    const f = fixtures();
    let release: (v: unknown) => void = () => {};
    f.rpc.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = r;
        })
    );
    const old = f.session.list(),
      r = await f.session.list();
    release(structuredClone(f.library));
    await expect(old).rejects.toMatchObject({ status: 409 });
    expect(r.current()).toBe(true);
  });
  it('a newer membership target invalidates a previously returned result', async () => {
    const f = fixtures(),
      a = await f.session.membership({ kind: 'food', id: id(42) });
    await f.session.membership({ kind: 'food', id: id(42) });
    expect(a.current()).toBe(false);
  });
  it('freezes a cloned target before awaiting its actual response', async () => {
    const f = fixtures(),
      target = { kind: 'food' as const, id: id(42) },
      pending = f.session.membership(target);
    target.id = id(999);
    const r = await pending;
    expect(r.canonical.identity).toEqual({ kind: 'food', id: id(42) });
  });
  it('preserves an archived read and false editability', async () => {
    const f = fixtures();
    f.root.archived_at = at;
    f.library.state = 'archived';
    f.entry.can_edit_items = false;
    const r = await f.session.detail(f.root.id, 'archived');
    expect(r.root.canonical).toMatchObject({ can_edit_items: false, can_admin: true });
    expect(r.canonical.collection.archived_at).toBe(at);
    expect(r.items).toHaveLength(9);
    expect(f.rpc.mock.calls.map(([name, args]) => [name, args.p_state])).toEqual([
      ['get_family_collection_library_v1', 'archived'],
      ['get_family_collection_page_v1', 'archived'],
    ]);
  });
  it('refuses an archived library entry that claims item edit permission before reading detail', async () => {
    const f = fixtures();
    f.root.archived_at = at;
    f.library.state = 'archived';
    expect(f.entry.can_edit_items).toBe(true);

    await expect(f.session.detail(f.root.id, 'archived')).rejects.toMatchObject({
      code: 'collection_library_contract',
    });
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(['get_family_collection_library_v1']);
  });
  it('loads actual native Collection store list/detail through the real adapter contract', async () => {
    const f = fixtures();
    api.defaults.adapter = createFamilyAxiosAdapter(async (request) => {
      if (request.method === 'GET' && request.pathname === '/addons/collections') {
        const r = await f.session.list();
        return { collections: r.collections.map(requireNativeCollection), incomingInvites: [] };
      }
      const r = await f.session.detail(request.pathname.split('/').pop() ?? '');
      return { collection: requireNativeCollection(r.root), places: r.items.map((i) => i.native) };
    });
    await useCollectionStore.getState().loadAll();
    const n = useCollectionStore.getState().collections[0].id;
    await useCollectionStore.getState().setActive(n);
    expect(useCollectionStore.getState().places).toHaveLength(9);
    expect(useCollectionStore.getState().places[2].notes).toBe('Personal food');
    expect(useCollectionStore.getState().placesLoading).toBe(false);
  });
});
registerCollectionReadsLive();
