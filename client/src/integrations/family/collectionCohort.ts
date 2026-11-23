import type { CollectionRpc } from '@family/backend/supabase/collectionRpc';
import { CollectionCommandSession, type CollectionCurrentView } from './collectionCommandSession';
import * as c from './collectionContract';
import { createCollectionImageLease } from './collectionImageLease';
import { openCollectionNativeEditor, openCollectionNativeOrder } from './collectionNativeEdits';
import { nativeCollectionItem, type NativeCollectionRoot } from './collectionNativeViews';
import { createCollectionReadSession, type CollectionReadOwner } from './collectionReadSession';
import { createCollectionTransport, normalizeCollectionIntent } from './collectionTransport';
import { FamilyApiError } from './errors';

type Detail = Awaited<ReturnType<ReturnType<typeof createCollectionReadSession>['detail']>>;
export type CollectionCohortSnapshot = Readonly<{
  revision: number;
  roots: readonly NativeCollectionRoot[];
  items: readonly ReturnType<typeof nativeCollectionItem>[];
  active: number | 'all' | null;
  error: string | null;
}>;
export const collectionUnavailable = (): never => {
  throw new FamilyApiError(
    422,
    'collection_feature_unavailable',
    'This Collection action is not connected yet. Nothing was changed.'
  );
};
const conflict = () =>
  new FamilyApiError(
    409,
    'collection_view_changed',
    'The Collection view changed. Reload before continuing; original work is retained.'
  );
const metadata = (item: c.CollectionItem) => {
  const { id, collection_id, kind, source, revision, status, sort_order, deleted_at } = item;
  return { id, collection_id, kind, source, revision, status, sort_order, deleted_at };
};
const rootMetadata = (root: ReturnType<typeof c.collectionRoot.parse>) => {
  const { id, family_id, owner_person_id, visibility, revision, lifecycle_revision, archived_at, deleted_at } = root;
  return { id, family_id, owner_person_id, visibility, revision, lifecycle_revision, archived_at, deleted_at };
};
/** One source/account/Family/person/session owner. UI leases never replace durable originals. */
export class CollectionCohort {
  private readonly images: ReturnType<typeof createCollectionImageLease>;
  readonly reads: ReturnType<typeof createCollectionReadSession>;
  private readonly transport: ReturnType<typeof createCollectionTransport>;
  private retired = false;
  private libraryReady = false;
  private epoch = 0;
  private sequence = 0;
  private readonly sessions = new Map<string, CollectionCommandSession>();
  private readonly details = new Map<string, Detail>();
  private snapshot: CollectionCohortSnapshot = Object.freeze({
    revision: 0,
    roots: [],
    items: [],
    active: null,
    error: null,
  });
  private listeners = new Set<() => void>();
  constructor(
    readonly owner: CollectionReadOwner,
    readonly rpc?: CollectionRpc
  ) {
    this.images = createCollectionImageLease(owner.source_url, this.assertCurrent);
    this.reads = createCollectionReadSession(owner, rpc);
    this.transport = createCollectionTransport(owner.source_url, rpc);
  }
  assertCurrent = () => {
    this.owner.assertCurrent();
    if (this.retired) throw conflict();
  };
  /** Empty is authoritative only after this owner's complete library succeeds. */
  isLibraryReady = () => {
    try {
      this.assertCurrent();
      return this.libraryReady;
    } catch {
      return false;
    }
  };
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private update(patch: Partial<CollectionCohortSnapshot>) {
    this.assertCurrent();
    this.snapshot = Object.freeze({ ...this.snapshot, ...patch, revision: this.snapshot.revision + 1 });
    for (const fn of this.listeners) fn();
  }
  retire() {
    if (this.retired) return;
    this.retired = true;
    this.libraryReady = false;
    this.images.retire();
    this.epoch++;
    this.reads.retire();
    for (const s of this.sessions.values()) s.retire();
    this.sessions.clear();
    this.details.clear();
    this.snapshot = Object.freeze({
      revision: this.snapshot.revision + 1,
      roots: [],
      items: [],
      active: null,
      error: 'The Collection account or session changed. Reload before continuing.',
    });
    for (const fn of this.listeners) fn();
  }
  private lease() {
    this.assertCurrent();
    const epoch = this.epoch;
    return () => {
      this.assertCurrent();
      if (epoch !== this.epoch) throw conflict();
    };
  }
  select(id: number | 'all' | null) {
    this.assertCurrent();
    this.epoch++;
    for (const s of this.sessions.values()) s.retire();
    this.sessions.clear();
    this.details.clear();
    this.update({ active: id, items: [], error: null });
  }
  private libraryFlight: Promise<Awaited<ReturnType<ReturnType<typeof createCollectionReadSession>['list']>>> | null =
    null;
  async library() {
    this.assertCurrent();
    if (this.libraryFlight !== null) return this.libraryFlight;
    const work = async () => {
      const result = await this.reads.list();
      this.assertCurrent();
      if (!result.current()) throw conflict();
      const allowed = new Set(result.collections.map((row) => row.canonical.collection.id));
      for (const id of this.details.keys()) if (!allowed.has(id)) this.details.delete(id);
      const active = this.snapshot.active;
      const items =
        typeof active === 'number' && !result.collections.some((row) => row.native?.id === active)
          ? []
          : this.snapshot.items.filter((row) => allowed.has(row.canonical.collection_id));
      this.libraryReady = true;
      this.update({ roots: result.collections, items, error: null });
      return result;
    };
    this.libraryFlight = work();
    try {
      return await this.libraryFlight;
    } finally {
      this.libraryFlight = null;
    }
  }
  async detail(id: number | string, state: 'active' | 'archived' = 'active') {
    const check = this.lease(),
      raw = await this.reads.detail(id, state),
      result = Object.freeze({ ...raw, items: Object.freeze(raw.items.map((row) => this.projectItem(row.canonical))) });
    check();
    if (!result.current()) throw conflict();
    this.details.set(result.canonical.collection.id, result);
    const found = this.snapshot.roots.some((row) => row.canonical.collection.id === result.canonical.collection.id);
    const roots = this.snapshot.roots.map((row) =>
      row.canonical.collection.id === result.canonical.collection.id && state === 'active' ? result.root : row
    );
    if (state === 'active' && !found) roots.push(result.root);
    this.update({
      roots,
      ...(this.snapshot.active === result.root.native?.id ? { items: result.items } : {}),
      error: null,
    });
    return result;
  }
  async union() {
    const check = this.lease(),
      index = await this.library();
    const rows = [];
    for (const root of index.collections) {
      if (root.native === null) continue;
      const page = await this.detail(root.native.id);
      check();
      rows.push(...page.items);
      if (rows.length > 2000)
        throw new FamilyApiError(
          413,
          'collection_union_bound',
          'Choose an individual Collection to load its complete contents.'
        );
    }
    check();
    this.update({ items: Object.freeze(rows), error: null });
    return rows;
  }
  parent(value: number | string) {
    return this.owner.ids.uuid('collection', value);
  }
  commands(value: number | string) {
    this.assertCurrent();
    const id = this.parent(value);
    let session = this.sessions.get(id);
    if (!session) {
      session = new CollectionCommandSession(
        {
          scope: { ...this.owner.scope, collection_id: id },
          source_url: this.owner.source_url,
          assertCurrent: this.assertCurrent,
          publish: (view, fence) => {
            fence();
            this.publish(id, view);
          },
        },
        this.rpc
      );
      this.sessions.set(id, session);
    }
    return session;
  }
  private projectItem(item: c.CollectionItem) {
    const projected = nativeCollectionItem(item, this.owner.ids);
    return Object.freeze({
      ...projected,
      native: this.images.tag(projected.native, {
        thumb_url: item.cover.thumb_url ?? null,
        hero_url: item.cover.hero_url ?? null,
      }),
    });
  }
  private publish(id: string, view: CollectionCurrentView) {
    this.assertCurrent();
    if (!('items' in view)) return;
    const rows = Object.freeze(view.items.map((row) => this.projectItem(row))),
      before = this.details.get(id);
    if (before) {
      const next = Object.freeze({
        ...before,
        canonical: view,
        items: rows,
        root: Object.freeze({
          ...before.root,
          canonical: {
            ...before.root.canonical,
            collection: view.collection,
            content_revision: view.content_revision,
            active_item_count: rows.length,
          },
        }),
      });
      this.details.set(id, next as Detail);
    }
    const nativeId = this.owner.ids.register('collection', id);
    this.update({
      items:
        this.snapshot.active === nativeId
          ? rows
          : this.snapshot.active === 'all'
            ? Object.freeze([...this.snapshot.items.filter((row) => row.canonical.collection_id !== id), ...rows])
            : this.snapshot.items,
      error: null,
    });
  }
  private displayed(item: number | string) {
    const id = this.owner.ids.uuid('collectionItem', item);
    for (const page of this.details.values()) {
      const row = page.items.find((x) => x.canonical.id === id);
      if (row) return { page, row };
    }
    throw conflict();
  }
  async editor(item: number | string, assertView: () => void = () => {}) {
    const base = this.lease();
    const check = () => {
      base();
      assertView();
    };
    const { page, row } = this.displayed(item),
      commands = this.commands(page.canonical.collection.id);
    const editor = await openCollectionNativeEditor(
      { reads: this.reads, commands, ids: this.owner.ids, assertCurrent: check },
      page.canonical.collection.id,
      item
    );
    check();
    if (
      c.collectionJson(editor.initial.canonical) !== c.collectionJson(row.canonical) ||
      editor.selection.observation.collection_revision !== page.canonical.collection.revision ||
      editor.selection.observation.content_revision !== page.canonical.content_revision
    ) {
      editor.retire();
      throw conflict();
    }
    return editor;
  }
  async status(item: number | string, status: unknown) {
    const editor = await this.editor(item);
    try {
      return await editor.setStatus(status);
    } finally {
      editor.retire();
    }
  }
  async trashItem(item: number | string) {
    const check = this.lease(),
      { page, row } = this.displayed(item);
    if (!page.root.canonical.can_edit_items)
      throw new FamilyApiError(403, 'collection_access_denied', 'This Collection operation is not authorized.');
    const session = this.commands(page.canonical.collection.id).scoped(check);
    const op = await session.retainLifecycle('trash', row.canonical.id, 'active', metadata(row.canonical));
    check();
    const result = await session.run(op, 'retry');
    check();
    return result;
  }
  async trashRoot(value: number | string, assertView: () => void = () => {}) {
    const base = this.lease();
    const check = () => {
      base();
      assertView();
    };
    const id = this.parent(value),
      root = this.snapshot.roots.find((row) => row.canonical.collection.id === id);
    if (!root?.canonical.can_admin)
      throw new FamilyApiError(403, 'collection_access_denied', 'This Collection operation is not authorized.');
    const session = this.commands(id).scoped(check);
    const op = await session.retainLifecycle('trash', null, 'active', rootMetadata(root.canonical.collection));
    const result = await session.run(op, 'retry');
    check();
    return result;
  }
  async create(value: number | string, raw: unknown, selected?: c.CollectionContentSelection) {
    const check = this.lease(),
      root = this.snapshot.roots.find((row) => row.canonical.collection.id === this.parent(value));
    if (!root?.canonical.can_edit_items || root.native === null)
      throw new FamilyApiError(403, 'collection_access_denied', 'Choose a writable Collection.');
    const intent = normalizeCollectionIntent(raw);
    if (!['create_manual', 'create_reference', 'create_snapshot'].includes(intent.action))
      return collectionUnavailable();
    const commands = this.commands(value).scoped(check);
    const op = await commands.retainContent(intent, selected);
    check();
    return commands.run(op, 'retry');
  }
  async openCreate(value: number | string, target: unknown = {}) {
    const check = this.lease(),
      commands = this.commands(value).scoped(check),
      observed = await commands.observeContent(target);
    check();
    let operation: string | null = null,
      key: string | null = null,
      flight: Promise<Awaited<ReturnType<CollectionCommandSession['run']>>> | null = null,
      done = false,
      active = true;
    const current = () => {
      check();
      if (!active) throw conflict();
    };
    return Object.freeze({
      selection: observed.selection,
      context: observed.context,
      retire() {
        active = false;
        commands.retire();
      },
      get operationId() {
        return operation;
      },
      async save(raw: unknown) {
        current();
        if (done) throw conflict();
        const intent = normalizeCollectionIntent(raw);
        if (!['create_manual', 'create_reference', 'create_snapshot'].includes(intent.action))
          return collectionUnavailable();
        const next = c.collectionJson(intent);
        if (key !== null && key !== next) throw conflict();
        key = next;
        if (flight !== null) return flight;
        flight = (async () => {
          if (operation === null) operation = await commands.retainContent(intent, observed.selection);
          current();
          const result = await commands.run(operation, 'retry');
          current();
          if (result.status !== 'committed' && result.status !== 'cancelled')
            throw new FamilyApiError(
              503,
              'collection_outcome_unknown',
              'Check the retained Collection save before replacing it.'
            );
          done = true;
          return result;
        })();
        try {
          return await flight;
        } finally {
          flight = null;
        }
      },
    });
  }
  async openOrder(value: number | string, assertView: () => void = () => {}) {
    const base = this.lease();
    const check = () => {
      base();
      assertView();
    };
    const id = this.parent(value),
      shown = this.details.get(id);
    if (!shown) throw conflict();
    const order = await openCollectionNativeOrder(
      { reads: this.reads, commands: this.commands(id), ids: this.owner.ids, assertCurrent: check },
      value
    );
    check();
    if (
      c.collectionJson(order.initial.map((x) => x.canonical)) !==
        c.collectionJson(shown.items.map((x) => x.canonical)) ||
      order.selection.observation.content_revision !== shown.canonical.content_revision
    ) {
      order.retire();
      throw conflict();
    }
    return order;
  }
  /** Each consumer owns a separate membership read/editor lifetime; one cannot supersede another. */
  async membership(raw: unknown, assertCurrent: () => void = () => {}) {
    const check = () => {
      this.assertCurrent();
      assertCurrent();
    };
    check();
    const reads = createCollectionReadSession({ ...this.owner, assertCurrent: check }, this.rpc);
    let active = true;
    const current = () => {
      check();
      if (!active) throw conflict();
    };
    const target = c.collectionParse(c.collectionMembershipIdentity, raw),
      thisCommands = this.commands.bind(this),
      ids = this.owner.ids;
    try {
      const result = await reads.membership(target);
      current();
      return Object.freeze({
        ...result,
        target,
        async editor(entry: (typeof result.canonical.lists)[number]) {
          current();
          const page = await reads.detail(entry.collection_id);
          current();
          const row = page.items.find((x) => x.canonical.id === entry.item_id);
          if (!row || row.canonical.status !== entry.status || !entry.can_edit) throw conflict();
          const editor = await openCollectionNativeEditor(
            { reads, commands: thisCommands(entry.collection_id), ids: ids, assertCurrent: current },
            entry.collection_id,
            entry.item_id
          );
          current();
          return editor;
        },
        retire() {
          active = false;
          reads.retire();
        },
      });
    } catch (e) {
      reads.retire();
      throw e;
    }
  }
  async trashObserved(item: c.CollectionItem, assertCurrent: () => void) {
    const check = () => {
      this.assertCurrent();
      assertCurrent();
    };
    check();
    const session = this.commands(item.collection_id).scoped(check);
    const op = await session.retainLifecycle('trash', item.id, 'active', metadata(item));
    check();
    return session.run(op, 'retry');
  }
  async deletedRoots(cursor: Parameters<ReturnType<typeof createCollectionTransport>['trash']>[3] = null) {
    const check = this.lease();
    const result = await this.transport.trash(this.owner.scope, 'collection', 100, cursor, check);
    check();
    return result;
  }
}
