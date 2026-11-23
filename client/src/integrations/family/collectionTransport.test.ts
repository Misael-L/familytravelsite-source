vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: vi.fn() }));
vi.mock('@family/backend/supabase/env', () => ({ getSupabaseUrl: () => 'https://fixture.invalid' }));
import type { CollectionRpc } from '@family/backend/supabase/collectionRpc';
import { describe, expect, it, vi } from 'vitest';
import { registerCollectionTransportLive } from '../../../tests/qualification/collectionTransport.live';
import * as c from './collectionContract';
import { createCollectionTransport, normalizeCollectionIntent } from './collectionTransport';
export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const source = 'https://fixture.invalid',
  date = '2026-11-14T12:00:00.123456Z',
  hash = 'a'.repeat(64),
  fence = () => {};
export const actor = {
  version: 1 as const,
  family_id: id(1),
  user_id: id(2),
  person_id: id(3),
  session_id: id(4),
  collection_id: id(10),
};
export const scope = { ...actor, lifecycle_revision: 0 };
export const content = {
  name: 'Manual',
  description: 'Description',
  latitude: null,
  longitude: null,
  address: null,
  website: null,
  phone: null,
  family_place_category_id: null,
  cover_media_id: null,
};
const cover = { id: null, availability: 'absent' as const, thumb_url: null, hero_url: null };
export const root = {
  id: actor.collection_id,
  family_id: actor.family_id,
  owner_person_id: actor.person_id,
  visibility: 'private' as const,
  revision: 1,
  lifecycle_revision: 0,
  archived_at: null,
  deleted_at: null,
  name: 'Collection',
  description: null,
  color: null,
  sort_order: 0,
  cover,
};
function item(n = 0) {
  const { family_place_category_id: _category, cover_media_id: _cover, ...display } = content;
  return {
    id: id(20 + n),
    collection_id: actor.collection_id,
    kind: 'manual' as const,
    source: { kind: 'manual' as const, id: null },
    revision: 1,
    status: 'idea' as const,
    sort_order: n,
    deleted_at: null,
    content_mode: 'snapshot' as const,
    content: display,
    notes: null,
    category: null,
    geography: null,
    source_observation: null,
    cover,
    native_location_compatible: true,
    added_at: date,
  };
}
function page(offset = 0, count = 1, limit = 100) {
  const items = Array.from({ length: Math.min(count - offset, limit) }, (_, i) => item(offset + i)),
    last = items[items.length - 1];
  return {
    version: 1 as const,
    scope,
    collection: root,
    content_revision: 0,
    items,
    next_cursor:
      offset + items.length < count && last
        ? {
            version: 1 as const,
            collection_id: actor.collection_id,
            state: 'active' as const,
            revision: 1,
            content_revision: 0,
            lifecycle_revision: 0,
            sort_order: last.sort_order,
            id: last.id,
          }
        : null,
  };
}
export const observation = {
  version: 1 as const,
  collection_revision: 1,
  content_revision: 0,
  lifecycle_revision: 0,
  item_revision: null,
  item_digest: null,
  source_digest: null,
};
export const original = {
  version: 1 as const,
  scope,
  action: 'create_manual' as const,
  target_item_id: id(20),
  body: { content, notes: null, status: 'idea' as const },
  observed: observation,
};
export const prepare = {
  scope,
  operation_id: id(30),
  intent: { action: 'create_manual' as const, body: original.body },
  observation,
};
const committed = {
  version: 1 as const,
  operation_id: id(30),
  status: 'committed' as const,
  collection_id: actor.collection_id,
  action: 'create_manual' as const,
  item_id: id(20),
  item_revision: 1,
  collection_revision: 1,
  content_revision: 1,
  changed: true,
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const mock = (data: unknown) => {
  const rpc = vi.fn<CollectionRpc>().mockResolvedValue(data);
  return { rpc, api: createCollectionTransport(source, rpc) };
};
describe('Collection JSON and exact schemas', () => {
  it.each([
    undefined,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    new Date(),
    { value: undefined },
    [undefined],
    Object.create({ inherited: 1 }),
  ])('refuses unsafe non-JSON or unsafe integer %#', (value) => expect(() => c.collectionJson(value)).toThrow());
  it('refuses cycles, sparse arrays and accessors without invoking them', () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => c.collectionJson(a)).toThrow();
    expect(() => c.collectionJson(Array(2))).toThrow();
    const getter = vi.fn();
    const value = {};
    Object.defineProperty(value, 'field', { get: getter, enumerable: true });
    expect(() => c.collectionJson(value)).toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('keeps supplementary characters and freezes clones', () => {
    const raw = { ...page(), items: [{ ...item(), notes: '東京 🧳' }] };
    const p = c.collectionParse(c.collectionPage, raw);
    expect(p.items[0].notes).toBe('東京 🧳');
    expect(Object.isFrozen(p.items[0].content)).toBe(true);
    expect(Object.isFrozen(raw.items[0].content)).toBe(false);
  });
  it('preserves arbitrary historical JSON keys as data', () => {
    const raw = JSON.parse(
      '{"version":1,"items":[{"revision":1,"schema_version":1,"recorded_at":"2026-11-14T12:00:00Z","snapshot":{"__proto__":{"text":"retained"}},"location_snapshot":null}],"next_cursor":null}'
    );
    const p = c.collectionParse(c.collectionVersions, raw);
    expect(Object.prototype.hasOwnProperty.call(p.items[0].snapshot, '__proto__')).toBe(true);
  });
  it('retains six-digit timestamp order', () => {
    expect(c.collectionMicros('2026-11-14T12:00:00.000002Z') - c.collectionMicros('2026-11-14T12:00:00.000001Z')).toBe(
      1n
    );
    expect(c.collectionMicros('2026-11-14T13:00:00.000001+01:00')).toBe(
      c.collectionMicros('2026-11-14T12:00:00.000001Z')
    );
  });
});
describe('Collection complete reads and membership', () => {
  it('passes exact scoped arguments and keeps notes separate', async () => {
    const { api, rpc } = mock(page());
    const p = await api.page(actor, 'active', 100, null, fence);
    expect(p.items[0].notes).toBeNull();
    expect(p.items[0].content.description).toBe('Description');
    expect(rpc).toHaveBeenCalledWith(
      'get_family_collection_page_v1',
      { p_collection_id: actor.collection_id, p_state: 'active', p_limit: 100, p_cursor: null },
      { source_url: source, user_id: actor.user_id, session_id: actor.session_id }
    );
  });
  it.each(['family_id', 'user_id', 'person_id', 'session_id', 'collection_id'] as const)(
    'refuses a mismatched %s',
    async (key) => {
      const p = clone(page());
      p.scope[key] = id(99);
      await expect(mock(p).api.page(actor, 'active', 100, null, fence)).rejects.toMatchObject({ status: 502 });
    }
  );
  it('refuses missing fields and unsafe revisions', async () => {
    await expect(mock({ ...page(), extra: true }).api.page(actor, 'active', 100, null, fence)).rejects.toThrow();
    const p = clone(page());
    p.items[0].revision = Number.MAX_SAFE_INTEGER + 1;
    await expect(mock(p).api.page(actor, 'active', 100, null, fence)).rejects.toThrow();
  });
  it('refuses unordered, foreign and truncated pages', async () => {
    const p = page(0, 2);
    p.items.reverse();
    await expect(mock(p).api.page(actor, 'active', 100, null, fence)).rejects.toThrow();
    const f = page();
    f.items[0].collection_id = id(99);
    await expect(mock(f).api.page(actor, 'active', 100, null, fence)).rejects.toThrow();
    await expect(mock(page(0, 3, 2)).api.page(actor, 'active', 100, null, fence)).rejects.toThrow();
  });
  it('requires an exact last-item cursor', async () => {
    const p = page(0, 101);
    if (!p.next_cursor) throw Error();
    p.next_cursor.id = id(99);
    await expect(mock(p).api.page(actor, 'active', 100, null, fence)).rejects.toThrow();
  });
  it('assembles complete pages and refuses a failed later page', async () => {
    const rpc = vi.fn<CollectionRpc>().mockResolvedValueOnce(page(0, 101)).mockResolvedValueOnce(page(100, 101));
    expect((await createCollectionTransport(source, rpc).all(actor, 'active', fence)).items).toHaveLength(101);
    const error = { code: 'PT409' };
    rpc.mockReset().mockResolvedValueOnce(page(0, 101)).mockRejectedValueOnce(error);
    await expect(createCollectionTransport(source, rpc).all(actor, 'active', fence)).rejects.toMatchObject({
      status: 409,
    });
  });
  it('refuses changed source metadata across complete pages', async () => {
    const rpc = vi
      .fn<CollectionRpc>()
      .mockResolvedValueOnce(page(0, 101))
      .mockResolvedValueOnce({ ...page(100, 101), collection: { ...root, name: 'Changed' } });
    await expect(createCollectionTransport(source, rpc).all(actor, 'active', fence)).rejects.toThrow();
  });
  it('has an explicit full-read bound rather than partial success', async () => {
    const rpc = vi.fn<CollectionRpc>();
    for (let i = 0; i < 20; i++) rpc.mockResolvedValueOnce(page(i * 100, 2001));
    await expect(createCollectionTransport(source, rpc).all(actor, 'active', fence)).rejects.toMatchObject({
      status: 413,
    });
    expect(rpc).toHaveBeenCalledTimes(20);
  });
  it('allows ready variants only on the configured ordinary object path', async () => {
    const p = clone(page());
    const ready = {
      id: id(60),
      availability: 'ready_variants',
      thumb_url: source + '/storage/v1/object/public/catalog/variants/v1/a/thumb.webp',
      hero_url: null,
    };
    await expect(
      mock({ ...p, collection: { ...root, cover: ready } }).api.page(actor, 'active', 100, null, fence)
    ).resolves.toBeDefined();
    for (const url of [
      source + '/storage/v1/render/image/public/catalog/a',
      'https://other.invalid/storage/v1/object/public/catalog/variants/v1/a.webp',
    ])
      await expect(
        mock({ ...p, collection: { ...root, cover: { ...ready, thumb_url: url } } }).api.page(
          actor,
          'active',
          100,
          null,
          fence
        )
      ).rejects.toThrow();
  });
  it('retains private unavailable covers without inventing URLs', async () => {
    const p = page();
    const data = {
      ...p,
      collection: {
        ...root,
        cover: { id: id(60), availability: 'private_unavailable', thumb_url: null, hero_url: null },
      },
    };
    expect((await mock(data).api.page(actor, 'active', 100, null, fence)).collection.cover.availability).toBe(
      'private_unavailable'
    );
  });
  it('returns exact canonical membership and rejects false saved data', async () => {
    const { collection_id: _id, ...owner } = actor;
    const identity = { kind: 'food' as const, id: id(80) },
      data = { version: 1, identity, source_observation: { ...identity, digest: hash }, saved: false, lists: [] };
    expect((await mock(data).api.membership(owner, identity, fence)).saved).toBe(false);
    await expect(mock({ ...data, saved: true }).api.membership(owner, identity, fence)).rejects.toThrow();
    await expect(
      mock({ ...data, identity: { ...identity, id: id(99) } }).api.membership(owner, identity, fence)
    ).rejects.toThrow();
  });
  it('refuses a name/provider-only membership query before calling the backend', async () => {
    const { collection_id: _id, ...owner } = actor;
    const { api, rpc } = mock({});
    await expect(api.membership(owner, { name: 'Guess' } as never, fence)).rejects.toMatchObject({ status: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('validates an editor observation against the exact item/root', async () => {
    const obs = { ...observation, item_revision: 1, item_digest: hash },
      data = { ...page(), item: item(), observation: obs };
    const { items: _items, next_cursor: _cursor, ...editor } = data;
    expect((await mock(editor).api.editor(actor, id(20), 'active', fence)).observation.item_revision).toBe(1);
    await expect(
      mock({ ...editor, observation: { ...obs, item_revision: 2 } }).api.editor(actor, id(20), 'active', fence)
    ).rejects.toThrow();
  });
});
describe('Collection original preparation/execution/recovery', () => {
  it('normalizes before observation and preserves explicit null/empty', () => {
    const p = normalizeCollectionIntent({
      action: 'create_manual',
      body: {
        content: {
          ...content,
          name: '  Saved  ',
          website: 'https://example.invalid',
          latitude: 1.123456789,
          longitude: 2.123456789,
        },
        notes: '',
        status: 'idea',
      },
    });
    expect(p.body).toMatchObject({
      content: { name: 'Saved', website: 'https://example.invalid/', latitude: 1.12345679 },
      notes: '',
    });
    const e = normalizeCollectionIntent({
      action: 'edit',
      body: { item_id: id(20), changes: { name: null, notes: '', description: null } },
    });
    expect(e.body).toMatchObject({ changes: { name: null, notes: '', description: null } });
  });
  it('rejects unnormalized preparation without issuing it', async () => {
    const { api, rpc } = mock({});
    await expect(
      api.prepare(
        {
          ...prepare,
          intent: { ...prepare.intent, body: { ...original.body, content: { ...content, name: '  Saved ' } } },
        },
        fence
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('checks and freezes the immutable original from preparation', async () => {
    const { api } = mock({ version: 1, operation_id: id(30), status: 'prepared', original });
    const p = await api.prepare(prepare, fence);
    expect(p.original).toEqual(original);
    expect(Object.isFrozen(p.original.body)).toBe(true);
  });
  it('refuses a substituted prepared body or scope', async () => {
    for (const value of [
      { ...original, body: { ...original.body, notes: 'Changed' } },
      { ...original, scope: { ...scope, session_id: id(99) } },
    ])
      await expect(
        mock({ version: 1, operation_id: id(30), status: 'prepared', original: value }).api.prepare(prepare, fence)
      ).rejects.toThrow();
  });
  it('accepts a minimal historical commit without turning it into current content', async () => {
    const p = await mock(committed).api.execute(actor, id(30), original, fence);
    expect(p.status).toBe('committed');
    expect(p).not.toHaveProperty('item');
  });
  it.each(['operation_id', 'collection_id', 'item_id'] as const)(
    'refuses a substituted acknowledgement %s',
    async (key) => {
      await expect(mock({ ...committed, [key]: id(99) }).api.execute(actor, id(30), original, fence)).rejects.toThrow();
    }
  );
  it('cannot execute an old session but may discover/cancel it', async () => {
    const fresh = { ...actor, session_id: id(99) },
      { api, rpc } = mock({
        version: 1,
        operation_id: id(30),
        status: 'cancelled',
        collection_id: actor.collection_id,
        action: 'create_manual',
        item_id: id(20),
      });
    await expect(api.execute(fresh, id(30), original, fence)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    expect((await api.cancel(fresh, id(30), original, fence)).status).toBe('cancelled');
  });
  it('keeps unknown outcomes unknown and requires an exact recovered original', async () => {
    expect(
      (await mock({ version: 1, operation_id: id(30), status: 'unknown' }).api.outcome(actor, id(30), fence)).status
    ).toBe('unknown');
    const data = { version: 1, operation_id: id(30), status: 'prepared', original };
    expect((await mock(data).api.outcome({ ...actor, session_id: id(99) }, id(30), fence, original)).status).toBe(
      'prepared'
    );
    await expect(
      mock({ ...data, original: { ...original, target_item_id: id(99) } }).api.outcome(actor, id(30), fence, original)
    ).rejects.toThrow();
  });
  it('validates command context shape and complete order', async () => {
    const ctx = { version: 1, scope, observation, order_complete: true, ordered_items: [] };
    expect((await mock(ctx).api.context(actor, {}, fence)).observation).toEqual(observation);
    await expect(
      mock({
        ...ctx,
        ordered_items: [
          { id: id(20), revision: 1, sort_order: 0 },
          { id: id(20), revision: 1, sort_order: 0 },
        ],
      }).api.context(actor, {}, fence)
    ).rejects.toThrow();
  });
});
describe('Collection lifecycle/history paging and session fence', () => {
  const life = {
    target_kind: 'item' as const,
    collection_id: actor.collection_id,
    item_id: id(20),
    scope,
    action: 'trash' as const,
    expected_revision: 1,
    expected_collection_revision: 0,
  };
  const receipt = {
    version: 1,
    operation_id: id(30),
    status: 'committed',
    action: 'trash',
    target_kind: 'item',
    target_id: id(20),
    revision: 2,
    collection_revision: 1,
    content_revision: 1,
    changed: true,
  };
  it('binds lifecycle receipt identity and sends aggregate content revision', async () => {
    const { api, rpc } = mock(receipt);
    expect((await api.lifecycle(actor, id(30), life, false, fence)).status).toBe('committed');
    expect(rpc.mock.calls[0][1].p_expected_collection_revision).toBe(0);
    await expect(
      mock({ ...receipt, target_id: id(99) }).api.lifecycle(actor, id(30), life, false, fence)
    ).rejects.toThrow();
  });
  it('refuses old-session execution but supports fresh cancellation/discovery', async () => {
    const fresh = { ...actor, session_id: id(99) },
      { api, rpc } = mock({ ...receipt, status: 'cancelled', revision: undefined });
    await expect(api.lifecycle(fresh, id(30), life, false, fence)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    const p = {
      version: 1,
      operation_id: id(30),
      status: 'cancelled',
      action: 'trash',
      target_kind: 'item',
      target_id: id(20),
    };
    expect((await mock(p).api.lifecycle(fresh, id(30), life, true, fence)).status).toBe('cancelled');
    expect(
      (
        await mock({ version: 1, operation_id: id(30), status: 'unknown' }).api.lifecycleOutcome(
          fresh,
          id(30),
          life,
          fence
        )
      ).status
    ).toBe('unknown');
  });
  it('keeps microsecond Trash order and validates the last cursor', async () => {
    const data = {
      version: 1,
      items: [
        { ...item(), deleted_at: '2026-11-14T12:00:00.000002Z' },
        { ...item(1), deleted_at: '2026-11-14T12:00:00.000001Z' },
      ],
      next_cursor: null,
    };
    const items = data.items.map(({ id, collection_id, kind, source, revision, status, sort_order, deleted_at }) => ({
      id,
      collection_id,
      kind,
      source,
      revision,
      status,
      sort_order,
      deleted_at,
    }));
    expect((await mock({ ...data, items }).api.trash(actor, 'item', 2, null, fence)).items).toHaveLength(2);
    await expect(
      mock({ ...data, items: items.slice().reverse() }).api.trash(actor, 'item', 2, null, fence)
    ).rejects.toThrow();
  });
  it('retains history snapshots and refuses cross-Collection history', async () => {
    const data = {
      version: 1,
      items: [
        {
          revision: 1,
          schema_version: 1,
          recorded_at: date,
          snapshot: { id: id(20), revision: 1, list_id: actor.collection_id, notes: 'Personal' },
          location_snapshot: null,
        },
      ],
      next_cursor: null,
    };
    expect((await mock(data).api.versions(actor, id(20), 25, null, fence)).items[0].snapshot.notes).toBe('Personal');
    data.items[0].snapshot.revision = 2;
    await expect(mock(data).api.versions(actor, id(20), 25, null, fence)).rejects.toThrow();
    data.items[0].snapshot.revision = 1;
    data.items[0].snapshot.list_id = id(99);
    await expect(mock(data).api.versions(actor, id(20), 25, null, fence)).rejects.toThrow();
  });
  it.each([
    ['42501', 403],
    ['PT409', 409],
    ['54000', 413],
    ['0A000', 422],
    ['22023', 400],
    ['collection_rpc_session', 401],
  ])('maps refusal %s without success fallback', async (code, status) => {
    const rpc = vi.fn<CollectionRpc>().mockRejectedValue({ code });
    await expect(createCollectionTransport(source, rpc).page(actor, 'active', 100, null, fence)).rejects.toMatchObject({
      status,
    });
  });
  it('refuses before dispatch when context changed', async () => {
    const { api, rpc } = mock(page());
    await expect(
      api.page(actor, 'active', 100, null, () => {
        throw Error('session changed');
      })
    ).rejects.toThrow('session changed');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('drops a delayed response or error after a context switch', async () => {
    for (const fail of [false, true]) {
      let current = true;
      const rpc: CollectionRpc = async () => {
        current = false;
        if (fail) throw Error('network');
        return page();
      };
      await expect(
        createCollectionTransport(source, rpc).page(actor, 'active', 100, null, () => {
          if (!current) throw Error('changed');
        })
      ).rejects.toThrow('changed');
    }
  });
});

registerCollectionTransportLive();

describe('exact retained preparation recovery V2', () => {
  const cancelled = {
    version: 2,
    operation_id: prepare.operation_id,
    collection_id: actor.collection_id,
    action: 'create_manual',
    status: 'cancelled',
    resolution: 'unprepared',
    result: null,
  };
  it('accepts a never-prepared receipt after a fresh session without a fake item', async () => {
    const f = mock(cancelled);
    expect(await f.api.resolvePreparation({ ...actor, session_id: id(999) }, prepare, true, fence)).toEqual(cancelled);
    expect(f.rpc.mock.calls[0][0]).toBe('cancel_family_collection_preparation_v2');
    expect(f.rpc.mock.calls[0][1]).toEqual({ p_preparation: prepare });
  });
  it.each([
    { ...cancelled, version: 1 },
    { ...cancelled, item_id: id(20) },
    { ...cancelled, operation_id: id(99) },
    { ...cancelled, collection_id: id(99) },
    { ...cancelled, action: 'status' },
    { ...cancelled, status: 'committed' },
    { ...cancelled, status: 'unknown' },
    { ...cancelled, resolution: 'prepared' },
    { ...cancelled, result: committed },
    { ...cancelled, status: 'committed', resolution: 'prepared', result: { ...committed, status: 'cancelled' } },
  ])('rejects malformed/misbound or fabricated terminal receipts %#', async (raw) => {
    await expect(mock(raw).api.resolvePreparation(actor, prepare, true, fence)).rejects.toBeDefined();
  });
  it('requires an existing original to resolve through the prepared dialect', async () => {
    await expect(mock(cancelled).api.resolvePreparation(actor, prepare, true, fence, original)).rejects.toBeDefined();
  });
  it('rejects a prepared original with a changed retained body', async () => {
    const raw = {
      ...cancelled,
      status: 'prepared',
      resolution: 'prepared',
      result: {
        version: 1,
        operation_id: prepare.operation_id,
        status: 'prepared',
        original: { ...original, body: { ...original.body, notes: 'Another request' } },
      },
    };
    await expect(mock(raw).api.resolvePreparation(actor, prepare, false, fence)).rejects.toBeDefined();
  });
  it('reports an actual winning commit while cancelling', async () => {
    const raw = { ...cancelled, status: 'committed', resolution: 'prepared', result: committed };
    expect((await mock(raw).api.resolvePreparation(actor, prepare, true, fence)).status).toBe('committed');
  });
});
