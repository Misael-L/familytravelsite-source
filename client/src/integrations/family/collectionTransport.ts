import { normalizeCollectionLocationFields } from '@family/backend/supabase/collectionAuthoringInput';
import { collectionRpc, type CollectionRpc, type CollectionRpcContext } from '@family/backend/supabase/collectionRpc';
import { z } from 'zod';
import * as c from './collectionContract';
import { FamilyApiError } from './errors';

type Fence = () => void;
type Identity = c.CollectionIdentity;
export const collectionActor = c.collectionIdentity.omit({ collection_id: true });
export type CollectionActor = z.infer<typeof collectionActor>;
type State = 'active' | 'archived';
const limitSchema = z.number().int().min(1).max(100),
  json = c.collectionJson,
  parse = c.collectionParse;
const invalid: () => never = c.collectionInvalid;
function input<S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> {
  try {
    return parse(schema, raw);
  } catch {
    throw new FamilyApiError(400, 'collection_request_invalid', 'Use an exact supported Collection request.');
  }
}
function sameActor(scope: c.CollectionScope, actor: CollectionActor | Identity, fresh = false) {
  if (
    scope.family_id !== actor.family_id ||
    scope.user_id !== actor.user_id ||
    scope.person_id !== actor.person_id ||
    (!fresh && scope.session_id !== actor.session_id) ||
    ('collection_id' in actor && scope.collection_id !== actor.collection_id)
  )
    invalid();
}
function originalActor(scope: c.CollectionScope, actor: Identity, fresh = false) {
  try {
    sameActor(scope, actor, fresh);
  } catch {
    throw new FamilyApiError(
      409,
      'collection_original_context',
      'Recover the original Collection operation in its own account and Family.'
    );
  }
}
function cover(raw: z.infer<typeof c.collectionCover>, source: string) {
  for (const value of [raw.thumb_url, raw.hero_url]) {
    if (value === null) continue;
    try {
      const u = new URL(value);
      if (
        u.protocol !== 'https:' ||
        u.origin !== source ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        u.href !== value ||
        !/^\/storage\/v1\/object\/public\/catalog\/variants\/v1\/[A-Za-z0-9/_-]+\.webp$/.test(u.pathname)
      )
        invalid();
    } catch {
      invalid();
    }
  }
}
function checkRoot(
  p: z.infer<typeof c.collectionPage> | z.infer<typeof c.collectionEditor>,
  actor: Identity,
  state: State,
  source: string
) {
  sameActor(p.scope, actor);
  if (
    p.collection.id !== actor.collection_id ||
    p.collection.family_id !== actor.family_id ||
    p.collection.lifecycle_revision !== p.scope.lifecycle_revision ||
    p.collection.deleted_at !== null ||
    (p.collection.archived_at === null) !== (state === 'active')
  )
    invalid();
  cover(p.collection.cover, source);
}
function checkItem(item: c.CollectionItem, actor: Identity, source: string) {
  if (item.collection_id !== actor.collection_id) invalid();
  cover(item.cover, source);
}
function checkObservation(
  obs: z.infer<typeof c.collectionObservation>,
  scope: c.CollectionScope,
  rootRevision?: number,
  contentRevision?: number,
  item?: c.CollectionItem
) {
  if (
    obs.lifecycle_revision !== scope.lifecycle_revision ||
    (rootRevision !== undefined && obs.collection_revision !== rootRevision) ||
    (contentRevision !== undefined && obs.content_revision !== contentRevision)
  )
    invalid();
  if (
    item &&
    (obs.item_revision !== item.revision ||
      obs.item_digest === null ||
      obs.source_digest !== (item.source_observation?.digest ?? null))
  )
    invalid();
}
function ordered(a: { sort_order: number; id: string }, b: { sort_order: number; id: string }) {
  return a.sort_order > b.sort_order || (a.sort_order === b.sort_order && a.id > b.id);
}
function mapError(error: unknown): never {
  if (error instanceof FamilyApiError) throw error;
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (['collection_rpc_session', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code))
    throw new FamilyApiError(401, 'collection_session_required', 'Sign in again before continuing.');
  if (code === '42501')
    throw new FamilyApiError(403, 'collection_access_denied', 'This Collection operation is not authorized.');
  if (['PT409', '40001', 'collection_rpc_context'].includes(code))
    throw new FamilyApiError(
      409,
      'collection_conflict',
      'The original Collection context changed. Reload or recover the original operation.'
    );
  if (code === '54000')
    throw new FamilyApiError(413, 'collection_service_bound', 'The Collection operation exceeds its supported bound.');
  if (code === '22023')
    throw new FamilyApiError(400, 'collection_request_invalid', 'The Collection request is invalid.');
  if (['0A000', '23503', '23514'].includes(code))
    throw new FamilyApiError(
      422,
      'collection_operation_unavailable',
      'This Collection action or relationship is unavailable.'
    );
  throw error; // A transport failure is not a successful empty read or a cancelled write.
}
function normalizeInput(value: unknown, partial = false) {
  try {
    return normalizeCollectionLocationFields(value, partial);
  } catch {
    throw new FamilyApiError(400, 'collection_location_invalid', 'Use supported Collection location details.');
  }
}
/** Normalize BEFORE asking for an observation. Preparation refuses to normalize afterward. */
export function normalizeCollectionIntent(raw: unknown): z.infer<typeof c.collectionIntent> {
  const intent = input(c.collectionIntent, raw);
  if (intent.action === 'create_manual')
    return input(c.collectionIntent, {
      ...intent,
      body: { ...intent.body, content: normalizeInput(intent.body.content) },
    });
  if (intent.action === 'edit') {
    const { notes, ...fields } = intent.body.changes;
    const { name, ...other } = fields;
    const normalized = normalizeInput(name === null ? other : fields, true);
    return input(c.collectionIntent, {
      ...intent,
      body: {
        ...intent.body,
        changes: {
          ...normalized,
          ...(name === null ? { name: null } : {}),
          ...('notes' in intent.body.changes ? { notes } : {}),
        },
      },
    });
  }
  return intent;
}
function checkCommittedContentReceipt(
  p: Extract<z.infer<typeof c.collectionContentReceipt>, { status: 'committed' }>,
  original?: c.CollectionOriginal
) {
  if ((p.action === 'reorder') !== (p.item_revision === null)) invalid();
  if (
    original &&
    (p.collection_revision < original.observed.collection_revision ||
      p.content_revision < original.observed.content_revision ||
      (p.changed && p.content_revision <= original.observed.content_revision))
  )
    invalid();
  if (
    original &&
    original.observed.item_revision !== null &&
    (p.item_revision === null ||
      p.item_revision < original.observed.item_revision ||
      (p.changed && p.item_revision <= original.observed.item_revision))
  )
    invalid();
}

function checkContentReceipt(raw: unknown, actor: Identity, op: string, original?: c.CollectionOriginal) {
  const p = parse(c.collectionContentReceipt, raw);
  if (p.operation_id !== op) invalid();
  if (p.status === 'prepared') {
    sameActor(p.original.scope, actor, true);
    if (original && json(p.original) !== json(original)) invalid();
    return p;
  }
  if (p.status === 'unknown') return p;
  if (p.collection_id !== actor.collection_id || (p.action === 'reorder') !== (p.item_id === null)) invalid();
  if (original && (p.action !== original.action || p.item_id !== original.target_item_id)) invalid();
  if (p.status === 'committed') {
    checkCommittedContentReceipt(p, original);
  }
  return p; // Historical receipt only, never a replacement current item.
}
function checkLifecycleReceipt(raw: unknown, op: string, original?: c.CollectionLifecycleOriginal) {
  const p = parse(c.collectionLifecycleReceipt, raw, 65536);
  if (p.operation_id !== op) invalid();
  if (p.status !== 'unknown' && original) {
    if (
      p.target_kind !== original.target_kind ||
      p.target_id !== (original.target_kind === 'item' ? original.item_id : original.collection_id) ||
      p.action !== original.action
    )
      invalid();
    if (
      p.status === 'committed' &&
      (p.revision < original.expected_revision ||
        (p.changed && p.revision <= original.expected_revision) ||
        (original.target_kind === 'item' && p.content_revision < original.expected_collection_revision))
    )
      invalid();
  }
  return p;
}
function trashOrder(
  items: { id: string; deleted_at?: string | null }[],
  cursor: z.infer<typeof c.collectionTrashCursor> | null
) {
  let before = cursor ? { id: cursor.before_id, deleted_at: cursor.before_deleted_at } : null;
  for (const item of items) {
    if (item.deleted_at == null) invalid();
    if (
      before &&
      !(
        c.collectionMicros(item.deleted_at) < c.collectionMicros(before.deleted_at) ||
        (c.collectionMicros(item.deleted_at) === c.collectionMicros(before.deleted_at) && item.id > before.id)
      )
    )
      invalid();
    before = { id: item.id, deleted_at: item.deleted_at };
  }
}

function checkHistoryRevision(row: z.infer<typeof c.collectionVersions>['items'][number], upper: number | null) {
  if (row.snapshot.revision !== row.revision || (upper !== null && row.revision >= upper)) invalid();
}
function trashActor(identity: Identity | CollectionActor, kind: 'collection' | 'item') {
  const actor = 'collection_id' in identity ? input(c.collectionIdentity, identity) : input(collectionActor, identity);
  if (kind === 'item' && !('collection_id' in actor)) invalid();
  return { actor, parent: 'collection_id' in actor ? actor.collection_id : null };
}
function checkCollectionPageCursor(p: z.infer<typeof c.collectionPage>, actor: Identity, view: State) {
  if (p.next_cursor) {
    const last = p.items[p.items.length - 1],
      next = p.next_cursor;
    if (
      !last ||
      next.id !== last.id ||
      next.sort_order !== last.sort_order ||
      next.collection_id !== actor.collection_id ||
      next.state !== view ||
      next.revision !== p.collection.revision ||
      next.content_revision !== p.content_revision ||
      next.lifecycle_revision !== p.scope.lifecycle_revision
    )
      invalid();
  }
}

function checkPreparedResolution(
  r: Extract<z.infer<typeof c.collectionPreparationResolution>, { resolution: 'prepared' }>,
  p: c.CollectionPreparation,
  actor: Identity,
  original?: c.CollectionOriginal
) {
  const actual = checkContentReceipt(r.result, actor, p.operation_id, original);
  if (actual.status === 'unknown') invalid();
  if (actual.status === 'prepared') {
    const o = actual.original;
    const { content: _content, already_snapshot: _snapshot, ...base } = o.body as Record<string, unknown>;
    if (
      json(o.scope) !== json(p.scope) ||
      json(o.observed) !== json(p.observation) ||
      o.action !== p.intent.action ||
      json(p.intent.body) !== json(o.action === 'create_snapshot' || o.action === 'materialize' ? base : o.body)
    )
      invalid();
  } else if (
    actual.action !== p.intent.action ||
    ('item_id' in p.intent.body && actual.item_id !== p.intent.body.item_id)
  )
    invalid();
}

type CollectionCall = (
  name: Parameters<CollectionRpc>[0],
  args: Record<string, unknown>,
  actor: CollectionActor | Identity,
  fence: Fence
) => ReturnType<CollectionRpc>;

type CollectionPageReader = ReturnType<typeof collectionPageReader>;

function collectionPageReader(source: string, call: CollectionCall) {
  async function page(
    identity: Identity,
    state: State,
    limit: number,
    cursor: z.infer<typeof c.collectionPageCursor> | null,
    fence: Fence
  ) {
    const actor = input(c.collectionIdentity, identity),
      view = input(z.enum(['active', 'archived']), state),
      n = input(limitSchema, limit),
      after = cursor === null ? null : input(c.collectionPageCursor, cursor);
    if (after && (after.collection_id !== actor.collection_id || after.state !== view)) invalid();
    const p = parse(
      c.collectionPage,
      await call(
        'get_family_collection_page_v1',
        { p_collection_id: actor.collection_id, p_state: view, p_limit: n, p_cursor: after },
        actor,
        fence
      ),
      2097152
    );
    checkRoot(p, actor, view, source);
    if (
      after &&
      (after.revision !== p.collection.revision ||
        after.content_revision !== p.content_revision ||
        after.lifecycle_revision !== p.scope.lifecycle_revision)
    )
      invalid();
    if (p.items.length > n || (p.next_cursor !== null && p.items.length !== n)) invalid();
    let before: { id: string; sort_order: number } | null = after;
    for (const item of p.items) {
      checkItem(item, actor, source);
      if (before && !ordered(item, before)) invalid();
      before = item;
    }
    checkCollectionPageCursor(p, actor, view);
    return p;
  }
  return page;
}

function collectionReadOperations(source: string, call: CollectionCall, page: CollectionPageReader) {
  return {
    async all(identity: Identity, state: State, fence: Fence) {
      const actor = input(c.collectionIdentity, identity);
      const items: c.CollectionItem[] = [];
      let after: z.infer<typeof c.collectionPageCursor> | null = null,
        first: z.infer<typeof c.collectionPage> | null = null,
        bytes = 0;
      for (let i = 0; i < 20; i++) {
        const p = await page(actor, state, 100, after, fence);
        bytes += new TextEncoder().encode(json(p, 2097152)).byteLength;
        if (
          bytes > 16777216 ||
          (first &&
            (json(p.collection) !== json(first.collection) ||
              p.content_revision !== first.content_revision ||
              json(p.scope) !== json(first.scope)))
        )
          invalid();
        first ??= p;
        items.push(...p.items);
        after = p.next_cursor;
        if (after === null) {
          if (new Set(items.map((x) => x.id)).size !== items.length) invalid();
          fence();
          return Object.freeze({ ...first, items: Object.freeze(items), next_cursor: null });
        }
      }
      throw new FamilyApiError(
        413,
        'collection_native_read_bound',
        'Complete Collection reads exceed the supported native bound.'
      );
    },
    async editor(identity: Identity, itemId: string, state: State, fence: Fence) {
      const actor = input(c.collectionIdentity, identity),
        item = input(c.collectionId, itemId),
        view = input(z.enum(['active', 'archived']), state);
      const p = parse(
        c.collectionEditor,
        await call(
          'get_family_collection_editor_v1',
          { p_collection_id: actor.collection_id, p_item_id: item, p_state: view },
          actor,
          fence
        )
      );
      checkRoot(p, actor, view, source);
      checkItem(p.item, actor, source);
      if (p.item.id !== item) invalid();
      checkObservation(p.observation, p.scope, p.collection.revision, p.content_revision, p.item);
      return p;
    },
    async membership(
      identity: CollectionActor,
      rawIdentity: z.infer<typeof c.collectionMembershipIdentity>,
      fence: Fence
    ) {
      const actor = input(collectionActor, identity),
        target = input(c.collectionMembershipIdentity, rawIdentity);
      const p = parse(
        c.collectionMembership,
        await call(
          'get_family_collection_membership_v1',
          { p_family_id: actor.family_id, p_identity: target },
          actor,
          fence
        ),
        2097152
      );
      if (json(p.identity) !== json(target)) invalid();
      const observed = p.source_observation;
      if (
        'kind' in target
          ? !('kind' in observed) || observed.kind !== target.kind || observed.id !== target.id
          : 'trip_id' in target
            ? !('trip_id' in observed) ||
              observed.trip_id !== target.trip_id ||
              observed.location_id !== target.location_id
            : !('collection_id' in observed) ||
              observed.collection_id !== target.collection_id ||
              observed.item_id !== target.item_id
      )
        invalid();
      return p;
    },
  };
}

function collectionAuthoringOperations(source: string, call: CollectionCall) {
  return {
    async resolvePreparation(
      identity: Identity,
      request: c.CollectionPreparation,
      cancel: boolean,
      fence: Fence,
      original?: c.CollectionOriginal
    ) {
      const actor = input(c.collectionIdentity, identity),
        p = input(c.collectionPreparation, request);
      input(z.boolean(), cancel);
      originalActor(p.scope, actor, true);
      checkObservation(p.observation, p.scope);
      if (json(normalizeCollectionIntent(p.intent)) !== json(p.intent)) invalid();
      const r = parse(
        c.collectionPreparationResolution,
        await call(
          cancel ? 'cancel_family_collection_preparation_v2' : 'get_family_collection_preparation_outcome_v2',
          { p_preparation: p },
          actor,
          fence
        )
      );
      if (
        r.operation_id !== p.operation_id ||
        r.collection_id !== actor.collection_id ||
        r.action !== p.intent.action ||
        (cancel && (r.status === 'unknown' || r.status === 'prepared'))
      )
        invalid();
      if (r.resolution === 'prepared') {
        checkPreparedResolution(r, p, actor, original);
      }
      if (original && r.resolution !== 'prepared') invalid();
      return r;
    },
    async context(identity: Identity, rawTarget: z.infer<typeof c.collectionTarget>, fence: Fence) {
      const actor = input(c.collectionIdentity, identity),
        target = input(c.collectionTarget, rawTarget);
      const p = parse(
        c.collectionAuthorContext,
        await call(
          'get_family_collection_authoring_context_v1',
          { p_collection_id: actor.collection_id, p_target: target },
          actor,
          fence
        )
      );
      sameActor(p.scope, actor);
      checkObservation(p.observation, p.scope);
      if ('item_id' in target) {
        if (!('item' in p) || p.item.id !== target.item_id) invalid();
        checkItem(p.item, actor, source);
        checkObservation(p.observation, p.scope, undefined, undefined, p.item);
      } else if ('source' in target) {
        if (
          !('source' in p) ||
          json(p.source.source) !== json(target.source) ||
          p.observation.source_digest !== p.source.digest ||
          p.observation.item_revision !== null
        )
          invalid();
      } else {
        if (!('order_complete' in p) || p.observation.item_revision !== null || p.observation.source_digest !== null)
          invalid();
        if (p.ordered_items) {
          if (new Set(p.ordered_items.map((x) => x.id)).size !== p.ordered_items.length) invalid();
          for (let i = 1; i < p.ordered_items.length; i++)
            if (!ordered(p.ordered_items[i], p.ordered_items[i - 1])) invalid();
        }
      }
      return p;
    },
  };
}

function collectionCommitOperations(call: CollectionCall) {
  return {
    async prepare(request: c.CollectionPreparation, fence: Fence) {
      const p = input(c.collectionPreparation, request);
      sameActor(p.scope, p.scope);
      checkObservation(p.observation, p.scope);
      if (json(normalizeCollectionIntent(p.intent)) !== json(p.intent))
        throw new FamilyApiError(
          400,
          'collection_normalize_before_observation',
          'Normalize Collection input before observing it.'
        );
      const result = parse(
        c.collectionPrepared,
        await call(
          'prepare_family_collection_content_v1',
          {
            p_collection_id: p.scope.collection_id,
            p_operation_id: p.operation_id,
            p_action: p.intent.action,
            p_body: p.intent.body,
            p_observation: p.observation,
          },
          p.scope,
          fence
        )
      );
      const o = result.original;
      if (
        result.operation_id !== p.operation_id ||
        json(o.scope) !== json(p.scope) ||
        o.action !== p.intent.action ||
        json(o.observed) !== json(p.observation)
      )
        invalid();
      const { content: _content, already_snapshot: _already, ...base } = o.body as Record<string, unknown>;
      const body = o.action === 'create_snapshot' || o.action === 'materialize' ? base : o.body;
      if (json(body) !== json(p.intent.body)) invalid();
      return result;
    },
    async execute(identity: Identity, operation: string, original: c.CollectionOriginal, fence: Fence) {
      const actor = input(c.collectionIdentity, identity),
        op = input(c.collectionId, operation),
        o = input(c.collectionContentOriginal, original);
      originalActor(o.scope, actor);
      const p = checkContentReceipt(
        await call(
          'execute_family_collection_content_v1',
          { p_collection_id: actor.collection_id, p_operation_id: op, p_original: o },
          actor,
          fence
        ),
        actor,
        op,
        o
      );
      if (p.status !== 'committed') invalid();
      return p;
    },
  };
}

function collectionRecoveryOperations(call: CollectionCall) {
  return {
    async outcome(identity: Identity, operation: string, fence: Fence, known?: c.CollectionOriginal) {
      const actor = input(c.collectionIdentity, identity),
        op = input(c.collectionId, operation),
        o = known === undefined ? undefined : input(c.collectionContentOriginal, known);
      if (o) originalActor(o.scope, actor, true);
      return checkContentReceipt(
        await call(
          'get_family_collection_content_operation_v1',
          { p_collection_id: actor.collection_id, p_operation_id: op },
          actor,
          fence
        ),
        actor,
        op,
        o
      );
    },
    async cancel(identity: Identity, operation: string, original: c.CollectionOriginal, fence: Fence) {
      const actor = input(c.collectionIdentity, identity),
        op = input(c.collectionId, operation),
        o = input(c.collectionContentOriginal, original);
      originalActor(o.scope, actor, true);
      const p = checkContentReceipt(
        await call(
          'cancel_family_collection_content_v1',
          { p_collection_id: actor.collection_id, p_operation_id: op, p_original: o },
          actor,
          fence
        ),
        actor,
        op,
        o
      );
      if (p.status !== 'committed' && p.status !== 'cancelled') invalid();
      return p;
    },
    async recoveryContext(
      identity: Identity,
      state: 'active' | 'archived' | 'trash',
      itemId: string | null,
      fence: Fence
    ) {
      const actor = input(c.collectionIdentity, identity),
        item = itemId === null ? null : input(c.collectionId, itemId),
        view = input(z.enum(['active', 'archived', 'trash']), state);
      const p = parse(
        c.collectionRecoveryContext,
        await call(
          item ? 'get_family_collection_item_context_v1' : 'get_family_collection_context_v1',
          item
            ? { p_collection_id: actor.collection_id, p_item_id: item }
            : { p_collection_id: actor.collection_id, p_state: view },
          actor,
          fence
        ),
        65536
      );
      sameActor(p.scope, actor);
      if (
        p.collection.id !== actor.collection_id ||
        p.collection.family_id !== actor.family_id ||
        p.collection.revision !== p.collection_revision ||
        p.collection.lifecycle_revision !== p.scope.lifecycle_revision ||
        (item ? p.item?.id !== item || p.item.collection_id !== actor.collection_id : p.item !== undefined)
      )
        invalid();
      const actual =
        p.collection.deleted_at !== null ? 'trash' : p.collection.archived_at !== null ? 'archived' : 'active';
      if (actual !== view)
        throw new FamilyApiError(
          409,
          'collection_state_changed',
          item && view === 'active'
            ? 'Restore and unarchive the Collection before restoring saved items.'
            : 'The Collection state changed. Reload it before continuing.'
        );
      return p;
    },
  };
}

function collectionLifecycleOperations(call: CollectionCall) {
  return {
    async lifecycle(
      identity: Identity,
      operation: string,
      original: c.CollectionLifecycleOriginal,
      cancel: boolean,
      fence: Fence
    ) {
      const actor = input(c.collectionIdentity, identity),
        op = input(c.collectionId, operation),
        o = input(c.collectionLifecycleOriginal, original);
      input(z.boolean(), cancel);
      originalActor(o.scope, actor, cancel);
      const args = cancel
        ? { p_family_id: actor.family_id, p_operation_id: op, p_original: o }
        : {
            p_collection_id: actor.collection_id,
            p_operation_id: op,
            p_scope: o.scope,
            p_action: o.action,
            p_expected_revision: o.expected_revision,
            ...(o.target_kind === 'item'
              ? { p_item_id: o.item_id, p_expected_collection_revision: o.expected_collection_revision }
              : {}),
          };
      const p = checkLifecycleReceipt(
        await call(
          cancel
            ? 'cancel_family_collection_operation_v1'
            : o.target_kind === 'item'
              ? 'execute_family_collection_item_lifecycle_v1'
              : 'execute_family_collection_lifecycle_v1',
          args,
          actor,
          fence
        ),
        op,
        o
      );
      if (cancel ? p.status === 'unknown' : p.status !== 'committed') invalid();
      return p;
    },
    async lifecycleOutcome(
      identity: Identity,
      operation: string,
      original: c.CollectionLifecycleOriginal,
      fence: Fence
    ) {
      const actor = input(c.collectionIdentity, identity),
        op = input(c.collectionId, operation),
        o = input(c.collectionLifecycleOriginal, original);
      originalActor(o.scope, actor, true);
      return checkLifecycleReceipt(
        await call(
          'get_family_collection_operation_v1',
          { p_family_id: actor.family_id, p_operation_id: op },
          actor,
          fence
        ),
        op,
        o
      );
    },
  };
}

function collectionHistoryOperations(call: CollectionCall) {
  return {
    async trash(
      identity: Identity | CollectionActor,
      kind: 'collection' | 'item',
      limit: number,
      cursor: z.infer<typeof c.collectionTrashCursor> | null,
      fence: Fence
    ) {
      const target = input(z.enum(['collection', 'item']), kind),
        { actor, parent } = trashActor(identity, target),
        n = input(limitSchema, limit),
        after = cursor === null ? null : input(c.collectionTrashCursor, cursor);
      const raw = await call(
        target === 'collection' ? 'list_family_collection_trash_v1' : 'list_family_collection_item_trash_v1',
        {
          ...(target === 'collection' ? { p_family_id: actor.family_id } : { p_collection_id: parent }),
          p_limit: n,
          p_before_deleted_at: after?.before_deleted_at ?? null,
          p_before_id: after?.before_id ?? null,
        },
        actor,
        fence
      );
      const p =
        target === 'collection'
          ? parse(c.collectionRootTrash, raw, 8388608)
          : parse(c.collectionItemTrash, raw, 8388608);
      if (p.items.length > n || (p.next_cursor && p.items.length !== n)) invalid();
      trashOrder(p.items, after);
      for (const row of p.items)
        if ('family_id' in row ? row.family_id !== actor.family_id : row.collection_id !== parent) invalid();
      const last = p.items[p.items.length - 1];
      if (
        p.next_cursor &&
        (!last || p.next_cursor.before_deleted_at !== last.deleted_at || p.next_cursor.before_id !== last.id)
      )
        invalid();
      return p;
    },
    async versions(identity: Identity, itemId: string | null, limit: number, before: number | null, fence: Fence) {
      const actor = input(c.collectionIdentity, identity),
        item = itemId === null ? null : input(c.collectionId, itemId),
        n = input(limitSchema, limit),
        cursor = before === null ? null : input(c.collectionCounter.min(1), before);
      const p = parse(
        c.collectionVersions,
        await call(
          'list_family_collection_versions_v1',
          { p_collection_id: actor.collection_id, p_item_id: item, p_limit: n, p_before_revision: cursor },
          actor,
          fence
        ),
        8388608
      );
      if (p.items.length > n || (p.next_cursor && p.items.length !== n)) invalid();
      let revision = cursor;
      for (const row of p.items) {
        checkHistoryRevision(row, revision);
        revision = row.revision;
        if (
          row.snapshot.id !== (item ?? actor.collection_id) ||
          (item
            ? row.snapshot.list_id !== actor.collection_id
            : row.snapshot.family_id !== actor.family_id || row.location_snapshot !== null)
        )
          invalid();
        if (
          row.location_snapshot &&
          (row.location_snapshot.item_id !== item ||
            row.location_snapshot.list_id !== actor.collection_id ||
            row.location_snapshot.family_id !== actor.family_id)
        )
          invalid();
      }
      if (p.next_cursor && p.next_cursor.before_revision !== revision) invalid();
      return p;
    },
  };
}

export function createCollectionTransport(sourceUrl: string, rpc: CollectionRpc = collectionRpc) {
  let source: string;
  try {
    const u = new URL(sourceUrl);
    if (
      !['http:', 'https:'].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.pathname !== '/' ||
      u.search ||
      u.hash
    )
      throw new Error();
    source = u.origin;
  } catch {
    throw new FamilyApiError(400, 'collection_source_invalid', 'Use the configured Collection source.');
  }
  async function call(
    name: Parameters<CollectionRpc>[0],
    args: Record<string, unknown>,
    actor: CollectionActor | Identity,
    fence: Fence
  ) {
    const request = parse(z.record(z.string(), z.unknown()), JSON.parse(json(args, 300000)), 300000);
    const context: CollectionRpcContext = Object.freeze({
      source_url: source,
      user_id: actor.user_id,
      session_id: actor.session_id,
    });
    fence();
    try {
      const raw = await rpc(name, request, context);
      fence();
      return raw;
    } catch (error) {
      fence();
      mapError(error);
    }
  }
  const page = collectionPageReader(source, call);
  return {
    page,
    ...collectionReadOperations(source, call, page),
    ...collectionAuthoringOperations(source, call),
    ...collectionCommitOperations(call),
    ...collectionRecoveryOperations(call),
    ...collectionLifecycleOperations(call),
    ...collectionHistoryOperations(call),
  };
}
