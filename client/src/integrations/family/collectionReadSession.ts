import {
  createCollectionLibraryReader,
  type LibraryEntry,
  type LibraryScope,
} from '@family/backend/supabase/collectionLibrary';
import { collectionRpc, type CollectionRpc } from '@family/backend/supabase/collectionRpc';
import { z } from 'zod';
import * as c from './collectionContract';
import { nativeCollectionItem, nativeCollectionMembership, nativeCollectionRoot } from './collectionNativeViews';
import { collectionActor, createCollectionTransport } from './collectionTransport';
import { FamilyApiError } from './errors';
import type { FamilyIdentityRegistry } from './identity';

type State = 'active' | 'archived';
export type CollectionReadOwner = Readonly<{
  scope: LibraryScope;
  source_url: string;
  ids: FamilyIdentityRegistry;
  /** Must capture repository generation plus source/account/Family/person/session, including A→B→A. */
  assertCurrent: () => void;
}>;
const conflict = () =>
  new FamilyApiError(409, 'collection_read_changed', 'The Collection read context changed. Reload before continuing.');
const root = (rows: readonly LibraryEntry[], id: string) => {
  const entry = rows.find((row) => row.collection.id === id);
  if (!entry) throw new FamilyApiError(404, 'collection_unavailable', 'This Collection is unavailable.');
  return entry;
};
const coherent = (entry: LibraryEntry, page: { collection: unknown; content_revision: number }) => {
  if (
    c.collectionJson(entry.collection) !== c.collectionJson(page.collection) ||
    entry.content_revision !== page.content_revision
  )
    throw conflict();
};

function collectionCurrent(fence: () => void) {
  const current = () => {
    try {
      fence();
      return true;
    } catch {
      return false;
    }
  };
  return current;
}

function collectionLibrary(scope: LibraryScope, libraryReader: ReturnType<typeof createCollectionLibraryReader>) {
  async function library(state: State, fence: () => void) {
    const view = c.collectionParse(z.enum(['active', 'archived']), state);
    try {
      const result = await libraryReader.all({ scope, state: view }, fence);
      fence();
      return result;
    } catch (error) {
      fence();
      throw error;
    }
  }
  return library;
}

function collectionGateway(rpc: CollectionRpc, check: () => void) {
  const gateway: CollectionRpc = async (name, args, context) => {
    check();
    try {
      const raw = await rpc(name, args, context);
      check();
      return raw;
    } catch (error) {
      check();
      throw error;
    }
  };
  return gateway;
}

/** A coordinated read facade, not an activated handler or a mutation authority. */
export function createCollectionReadSession(owner: CollectionReadOwner, rpc: CollectionRpc = collectionRpc) {
  const scope: LibraryScope = Object.freeze(c.collectionParse(collectionActor, owner.scope)) as LibraryScope;
  const ids = owner.ids,
    source = new URL(owner.source_url).origin,
    assertOwner = owner.assertCurrent;
  // The transport validates the complete configured URL before any RPC.
  const transport = createCollectionTransport(owner.source_url, rpc);
  if (!ids.isScopedTo(scope.user_id)) throw conflict();
  let retired = false;
  const sequences = new Map<string, number>(),
    bindings = new Map<string, string>();
  const check = () => {
    assertOwner();
    if (retired || !ids.isScopedTo(scope.user_id)) throw conflict();
  };
  const begin = (resource: string) => {
    check();
    const seq = (sequences.get(resource) ?? 0) + 1;
    sequences.set(resource, seq);
    return () => {
      check();
      if (sequences.get(resource) !== seq) throw conflict();
    };
  };
  const gateway = collectionGateway(rpc, check);
  const libraryReader = createCollectionLibraryReader(
    (name, args) => gateway(name, args, { source_url: source, user_id: scope.user_id, session_id: scope.session_id }),
    owner.source_url
  );
  const identity = (value: number | string): c.CollectionIdentity => {
    check();
    return { ...scope, collection_id: ids.uuid('collection', value) };
  };
  const library = collectionLibrary(scope, libraryReader);
  const bind = (rows: readonly { id: string; collection_id: string }[]) => {
    // Validate the whole result before changing the association map.
    for (const row of rows)
      if (bindings.has(row.id) && bindings.get(row.id) !== row.collection_id) c.collectionInvalid();
    for (const row of rows) bindings.set(row.id, row.collection_id);
  };

  return {
    retire() {
      retired = true;
      bindings.clear();
    },
    assertCurrent: check,
    async list(state: State = 'active') {
      const fence = begin('library'),
        p = await library(state, fence);
      const collections = Object.freeze(p.collections.map((row) => nativeCollectionRoot(row, ids)));
      fence();
      return Object.freeze({
        canonical: p,
        collections,
        current: collectionCurrent(fence),
      });
    },
    async detail(value: number | string, state: State = 'active') {
      const actor = identity(value),
        fence = begin('detail:' + actor.collection_id),
        index = await library(state, fence),
        entry = root(index.collections, actor.collection_id);
      const page = await transport.all(actor, state, fence);
      coherent(entry, page);
      if (page.items.length !== entry.active_item_count) throw conflict();
      const items = Object.freeze(page.items.map((item) => nativeCollectionItem(item, ids)));
      fence();
      bind(page.items);
      return Object.freeze({
        root: nativeCollectionRoot(entry, ids),
        items,
        canonical: page,
        current: collectionCurrent(fence),
      });
    },
    async editor(collection: number | string, item: number | string, state: State = 'active') {
      const actor = identity(collection),
        itemId = ids.uuid('collectionItem', item);
      if (bindings.get(itemId) !== actor.collection_id)
        throw new FamilyApiError(409, 'collection_item_unobserved', 'Reload this Collection before editing its item.');
      const fence = begin('editor:' + itemId),
        index = await library(state, fence),
        entry = root(index.collections, actor.collection_id);
      const page = await transport.editor(actor, itemId, state, fence);
      coherent(entry, page);
      fence();
      return Object.freeze({
        root: nativeCollectionRoot(entry, ids),
        item: nativeCollectionItem(page.item, ids),
        canonical: page,
        current: collectionCurrent(fence),
      });
    },
    async membership(rawTarget: z.infer<typeof c.collectionMembershipIdentity>) {
      // A full exact selector is required. Names, coordinates and provider labels never qualify.
      let target: z.infer<typeof c.collectionMembershipIdentity>;
      try {
        target = c.collectionParse(c.collectionMembershipIdentity, rawTarget);
      } catch {
        throw new FamilyApiError(
          400,
          'collection_membership_identity',
          'Use the canonical catalog, saved Trip location or Collection item identity.'
        );
      }
      const fence = begin('membership'),
        p = await transport.membership(scope, target, fence);
      const view = nativeCollectionMembership(p, ids);
      fence();
      bind(p.lists.map((row) => ({ id: row.item_id, collection_id: row.collection_id })));
      return Object.freeze({
        ...view,
        current: collectionCurrent(fence),
      });
    },
  };
}
