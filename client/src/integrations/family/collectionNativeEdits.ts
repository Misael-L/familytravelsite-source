import { z } from 'zod';
import type { CollectionCommandSession } from './collectionCommandSession';
import * as c from './collectionContract';
import { nativeCollectionItem } from './collectionNativeViews';
import type { createCollectionReadSession } from './collectionReadSession';
import { normalizeCollectionIntent } from './collectionTransport';
import { FamilyApiError } from './errors';
import type { FamilyIdentityRegistry } from './identity';

type Reads = ReturnType<typeof createCollectionReadSession>;
export type CollectionNativeEditOwner = {
  reads: Reads;
  commands: CollectionCommandSession;
  ids: FamilyIdentityRegistry;
  assertCurrent: () => void;
};
const changed = () =>
  new FamilyApiError(
    409,
    'collection_editor_changed',
    'Reload the Collection editor. Original pending work is retained.'
  );
const nativePatch = z
  .object({
    name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
    address: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    category_id: z.number().int().positive().safe().nullable().optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 0);
function sameScope(scope: c.CollectionScope, owner: CollectionNativeEditOwner) {
  const { lifecycle_revision: _revision, ...actor } = scope;
  if (c.collectionJson(actor) !== c.collectionJson(owner.commands.scope) || !owner.ids.isScopedTo(scope.user_id))
    throw changed();
}
function authorized(root: Awaited<ReturnType<Reads['detail']>>['root']) {
  if (root.native === null)
    throw new FamilyApiError(
      422,
      'collection_owner_unlinked',
      'This Collection has no linked owner. Its retained data is unchanged.'
    );
  if (!root.canonical.can_edit_items)
    throw new FamilyApiError(403, 'collection_access_denied', 'This Collection operation is not authorized.');
}
function submitter(owner: CollectionNativeEditOwner, selection: c.CollectionContentSelection, current: () => boolean) {
  let operation: string | null = null,
    intentKey: string | null = null,
    done = false,
    flight: Promise<Awaited<ReturnType<CollectionCommandSession['run']>>> | null = null;
  const check = () => {
    owner.assertCurrent();
    if (!current()) throw changed();
  };
  return {
    get operationId() {
      return operation;
    },
    check,
    async submit(raw: unknown) {
      check();
      if (done) throw changed();
      const intent = normalizeCollectionIntent(raw),
        key = c.collectionJson(intent);
      if (intentKey !== null && key !== intentKey) throw changed();
      intentKey = key;
      if (flight !== null) return flight;
      const execute = async () => {
        check();
        if (operation === null) operation = await owner.commands.retainContent(intent, selection);
        check();
        const result = await owner.commands.run(operation, 'retry');
        check();
        if (result.status !== 'committed' && result.status !== 'cancelled')
          throw new FamilyApiError(
            503,
            'collection_outcome_unknown',
            'The original Collection operation is retained. Check or cancel it before replacing this edit.'
          );
        done = true;
        return result;
      };
      flight = execute();
      try {
        return await flight;
      } finally {
        flight = null;
      }
    },
  };
}
/** Qualified editor prerequisite. Ordinary native hooks/handlers are not enabled by importing this port. */
export async function openCollectionNativeEditor(
  owner: CollectionNativeEditOwner,
  collection: number | string,
  item: number | string
) {
  owner.assertCurrent();
  const snapshot = await owner.reads.editor(collection, item);
  owner.assertCurrent();
  authorized(snapshot.root);
  sameScope(snapshot.canonical.scope, owner);
  const itemId = snapshot.item.canonical.id,
    selection = c.collectionParse(c.collectionContentSelection, {
      scope: snapshot.canonical.scope,
      observation: snapshot.canonical.observation,
      target: { item_id: itemId },
    });
  let retired = false;
  const current = () => !retired && snapshot.current();
  const commands = owner.commands.scoped(() => {
    owner.assertCurrent();
    if (!current()) throw changed();
  });
  const command = submitter({ ...owner, commands }, selection, current);
  const perform = async (intent: unknown) => {
    const result = await command.submit(intent);
    if (!('view' in result)) c.collectionInvalid();
    if (result.status === 'cancelled') return Object.freeze({ status: 'cancelled' as const, item: null, current });
    if (!('items' in result.view)) c.collectionInvalid();
    const canonical = result.view.items.find((row) => row.id === itemId);
    if (!canonical) c.collectionInvalid();
    return Object.freeze({ status: 'committed' as const, item: nativeCollectionItem(canonical, owner.ids), current });
  };
  return Object.freeze({
    initial: snapshot.item,
    selection,
    current,
    retire() {
      retired = true;
      commands.retire();
    },
    get operationId() {
      return command.operationId;
    },
    async save(raw: unknown) {
      command.check();
      let p: z.infer<typeof nativePatch>;
      try {
        p = c.collectionParse(nativePatch, raw);
      } catch {
        throw new FamilyApiError(
          400,
          'collection_patch_unsupported',
          'Use supported Collection item fields. No changes were saved.'
        );
      }
      const { lat, lng, category_id, ...rest } = p;
      const changes = {
        ...rest,
        ...('lat' in p ? { latitude: lat } : {}),
        ...('lng' in p ? { longitude: lng } : {}),
        ...(category_id !== undefined
          ? { family_place_category_id: category_id === null ? null : owner.ids.uuid('category', category_id) }
          : {}),
      };
      return perform({ action: 'edit', body: { item_id: itemId, changes } });
    },
    setStatus(status: unknown) {
      return perform({ action: 'status', body: { item_id: itemId, status } });
    },
    materialize() {
      return perform({ action: 'materialize', body: { item_id: itemId } });
    },
  });
}
/** A whole-list order is frozen from the complete coherent view the user saw. */
export async function openCollectionNativeOrder(owner: CollectionNativeEditOwner, collection: number | string) {
  owner.assertCurrent();
  const snapshot = await owner.reads.detail(collection);
  owner.assertCurrent();
  authorized(snapshot.root);
  sameScope(snapshot.canonical.scope, owner);
  const page = snapshot.canonical,
    selection = c.collectionParse(c.collectionContentSelection, {
      scope: page.scope,
      observation: {
        version: 1,
        collection_revision: page.collection.revision,
        content_revision: page.content_revision,
        lifecycle_revision: page.scope.lifecycle_revision,
        item_revision: null,
        item_digest: null,
        source_digest: null,
      },
      target: {},
    });
  let retired = false;
  const current = () => !retired && snapshot.current();
  const commands = owner.commands.scoped(() => {
    owner.assertCurrent();
    if (!current()) throw changed();
  });
  const command = submitter({ ...owner, commands }, selection, current);
  return Object.freeze({
    initial: snapshot.items,
    selection,
    current,
    retire() {
      retired = true;
      commands.retire();
    },
    get operationId() {
      return command.operationId;
    },
    async save(raw: unknown) {
      command.check();
      let ids: number[];
      try {
        ids = c.collectionParse(z.array(z.number().int().positive().safe()).max(100), raw);
      } catch {
        throw new FamilyApiError(400, 'collection_order_invalid', 'Use the complete displayed Collection order.');
      }
      const expected = new Set(snapshot.items.map((row) => row.native.id));
      if (ids.length !== expected.size || new Set(ids).size !== ids.length || ids.some((id) => !expected.has(id)))
        throw new FamilyApiError(409, 'collection_order_changed', 'Use the complete displayed Collection order.');
      return command.submit({
        action: 'reorder',
        body: { ordered_ids: ids.map((id) => owner.ids.uuid('collectionItem', id)) },
      });
    },
  });
}
