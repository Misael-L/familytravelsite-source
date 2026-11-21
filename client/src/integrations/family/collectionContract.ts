import { z } from 'zod';
import { FamilyApiError } from './errors';

export const collectionId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const collectionCounter = z.number().int().nonnegative().safe();
const revision = collectionCounter.min(1),
  rank = z.number().int().min(-2147483648).max(2147483647);
export const collectionTimestamp = z
  .string()
  .datetime({ offset: true })
  .regex(/(?:Z|[+-]\d{2}:\d{2})$/)
  .refine((s) => Number.isFinite(Date.parse(s)) && !/\.\d{7}/.test(s));
export const collectionDigest = z.string().regex(/^[a-f0-9]{64}$/);
export const collectionStatus = z.enum(['idea', 'want', 'visited']);
export const collectionCatalogKind = z.enum([
  'country',
  'place',
  'food',
  'hotel',
  'experience',
  'airport',
  'airline',
  'guide',
]);
const locationKind = z.enum(['place', 'food', 'hotel', 'experience']);
export const collectionSource = z.object({ kind: collectionCatalogKind, id: collectionId }).strict();
export const collectionScope = z
  .object({
    version: z.literal(1),
    family_id: collectionId,
    collection_id: collectionId,
    user_id: collectionId,
    person_id: collectionId.nullable(),
    session_id: collectionId,
    lifecycle_revision: collectionCounter,
  })
  .strict();
export const collectionIdentity = collectionScope.omit({ lifecycle_revision: true });
export type CollectionIdentity = z.infer<typeof collectionIdentity>;
export type CollectionScope = z.infer<typeof collectionScope>;
export const collectionRoot = z
  .object({
    id: collectionId,
    family_id: collectionId,
    owner_person_id: collectionId.nullable(),
    visibility: z.enum(['private', 'family']),
    revision,
    lifecycle_revision: collectionCounter,
    archived_at: collectionTimestamp.nullable(),
    deleted_at: collectionTimestamp.nullable(),
  })
  .strict();
export const collectionCover = z
  .object({
    id: collectionId.nullable(),
    availability: z.enum(['absent', 'unavailable', 'private_unavailable', 'placeholder', 'ready_variants']),
    thumb_url: z.string().nullable(),
    hero_url: z.string().nullable(),
  })
  .strict()
  .refine((c) =>
    c.availability === 'ready_variants'
      ? c.id !== null && (c.thumb_url !== null || c.hero_url !== null)
      : c.thumb_url === null && c.hero_url === null
  )
  .refine((c) => (['absent', 'unavailable'].includes(c.availability) ? c.id === null : c.id !== null));
export const collectionDisplayRoot = collectionRoot
  .extend({
    name: z.string(),
    description: z.string().nullable(),
    color: z.string().nullable(),
    sort_order: rank,
    cover: collectionCover,
  })
  .strict();
const coordinates = {
  latitude: z.number().finite().min(-90).max(90).nullable(),
  longitude: z.number().finite().min(-180).max(180).nullable(),
};
const contact = { address: z.string().nullable(), website: z.string().nullable(), phone: z.string().nullable() };
export const collectionLocationContent = z
  .object({ name: z.string(), description: z.string().nullable(), ...coordinates, ...contact })
  .strict();
const manualFields = z
  .object({
    name: z.string(),
    description: z.string().nullable(),
    ...coordinates,
    ...contact,
    family_place_category_id: collectionId.nullable(),
    cover_media_id: collectionId.nullable(),
  })
  .strict();
export const collectionManualContent = manualFields.refine((c) => (c.latitude === null) === (c.longitude === null));
const itemFields = z
  .object({
    id: collectionId,
    collection_id: collectionId,
    kind: z.enum([...collectionCatalogKind.options, 'manual']),
    source: z
      .object({ kind: z.enum([...collectionCatalogKind.options, 'manual']), id: collectionId.nullable() })
      .strict(),
    revision,
    status: collectionStatus,
    sort_order: rank,
    deleted_at: collectionTimestamp.nullable(),
  })
  .strict();
export const collectionItemMetadata = itemFields.refine(
  (i) => i.source.kind === i.kind && (i.source.id === null) === (i.kind === 'manual')
);
const category = z
  .object({ id: collectionId, name: z.string(), color: z.string().nullable(), icon: z.string().nullable() })
  .strict();
const geography = z
  .object({
    context_place_id: collectionId.nullable(),
    context_place_name: z.string().nullable(),
    country_id: collectionId.nullable(),
    country_name: z.string().nullable(),
    country_code: z.string().nullable(),
    time_zone: z.string().nullable(),
    source_type_label: z.string().nullable(),
  })
  .strict();
const sourceObservation = z
  .object({
    kind: collectionCatalogKind,
    id: collectionId,
    updated_at: collectionTimestamp.nullable(),
    digest: collectionDigest,
    archived: z.boolean(),
  })
  .strict();
// Derive metadata fields without dropping its source/kind refinement below.
export const collectionItem = itemFields
  .extend({
    content_mode: z.enum(['reference', 'snapshot']),
    content: collectionLocationContent,
    notes: z.string().nullable(),
    category: category.nullable(),
    geography: geography.nullable(),
    source_observation: sourceObservation.nullable(),
    cover: collectionCover,
    native_location_compatible: z.boolean(),
    added_at: collectionTimestamp,
  })
  .strict()
  .refine((i) => i.deleted_at === null && i.source.kind === i.kind && (i.source.id === null) === (i.kind === 'manual'))
  .refine((i) => i.native_location_compatible === ['place', 'food', 'hotel', 'experience', 'manual'].includes(i.kind))
  .refine((i) =>
    i.kind === 'manual'
      ? i.content_mode === 'snapshot' && i.source_observation === null && i.geography === null
      : i.source_observation?.kind === i.kind && i.source_observation.id === i.source.id
  );
export type CollectionItem = z.infer<typeof collectionItem>;
export const collectionObservation = z
  .object({
    version: z.literal(1),
    collection_revision: revision,
    content_revision: collectionCounter,
    lifecycle_revision: collectionCounter,
    item_revision: revision.nullable(),
    item_digest: collectionDigest.nullable(),
    source_digest: collectionDigest.nullable(),
  })
  .strict()
  .refine((o) => (o.item_revision === null) === (o.item_digest === null));
export const collectionPageCursor = z
  .object({
    version: z.literal(1),
    collection_id: collectionId,
    state: z.enum(['active', 'archived']),
    revision,
    content_revision: collectionCounter,
    lifecycle_revision: collectionCounter,
    sort_order: rank,
    id: collectionId,
  })
  .strict();
const readBase = {
  version: z.literal(1),
  scope: collectionScope,
  collection: collectionDisplayRoot,
  content_revision: collectionCounter,
};
export const collectionPage = z
  .object({ ...readBase, items: z.array(collectionItem).max(100), next_cursor: collectionPageCursor.nullable() })
  .strict();
export const collectionEditor = z
  .object({ ...readBase, item: collectionItem, observation: collectionObservation })
  .strict();

export const collectionMembershipIdentity = z.union([
  z.object({ kind: locationKind, id: collectionId }).strict(),
  z.object({ trip_id: collectionId, location_id: collectionId }).strict(),
  z.object({ collection_id: collectionId, item_id: collectionId }).strict(),
]);
export const collectionMembership = z
  .object({
    version: z.literal(1),
    identity: collectionMembershipIdentity,
    source_observation: z.union([
      z.object({ kind: locationKind, id: collectionId, digest: collectionDigest }).strict(),
      z
        .object({
          trip_id: collectionId,
          location_id: collectionId,
          location_revision: revision,
          kind: locationKind,
          id: collectionId,
          digest: collectionDigest,
        })
        .strict(),
      z.object({ collection_id: collectionId, item_id: collectionId, item_revision: revision }).strict(),
    ]),
    saved: z.boolean(),
    lists: z
      .array(
        z
          .object({
            collection_id: collectionId,
            name: z.string(),
            color: z.string().nullable(),
            archived_at: collectionTimestamp.nullable(),
            item_id: collectionId,
            status: collectionStatus,
            can_edit: z.boolean(),
          })
          .strict()
      )
      .max(200),
  })
  .strict()
  .refine((p) => p.saved === p.lists.length > 0)
  .refine((p) => new Set(p.lists.map((r) => r.collection_id)).size === p.lists.length)
  .refine((p) => p.lists.every((r) => r.archived_at === null || !r.can_edit));

const catalogCommon = {
  source: collectionSource,
  name: z.string(),
  description: z.string().nullable(),
  ...coordinates,
  ...contact,
  source_archived: z.boolean(),
  context_place_id: collectionId.nullable(),
  country_id: collectionId.nullable(),
  cover_media_id: collectionId.nullable(),
  updated_at: collectionTimestamp.nullable(),
  digest: collectionDigest,
};
export const collectionCatalogFacts = z.union([
  z
    .object({
      ...catalogCommon,
      is_located: z.boolean(),
      context_place_name: z.string().nullable(),
      country_name: z.string().nullable(),
      country_code: z.string().nullable(),
      time_zone: z.string().nullable(),
      source_type_label: z.string().nullable(),
    })
    .strict()
    .refine((f) => ['place', 'food', 'hotel', 'experience'].includes(f.source.kind)),
  z
    .object(catalogCommon)
    .strict()
    .refine((f) => !['place', 'food', 'hotel', 'experience'].includes(f.source.kind)),
]);
export const collectionTarget = z.union([
  z.object({}).strict(),
  z.object({ item_id: collectionId }).strict(),
  z.object({ source: collectionSource }).strict(),
]);
/** Displayed facts carried into a new command; never re-observed at submit. */
export const collectionContentSelection = z
  .object({ scope: collectionScope, observation: collectionObservation, target: collectionTarget })
  .strict()
  .refine((s) => s.scope.lifecycle_revision === s.observation.lifecycle_revision);
export type CollectionContentSelection = z.infer<typeof collectionContentSelection>;
const authorBase = { version: z.literal(1), scope: collectionScope, observation: collectionObservation };
const orderedItems = z.array(z.object({ id: collectionId, revision, sort_order: rank }).strict()).max(100);
export const collectionAuthorContext = z.union([
  z.object({ ...authorBase, order_complete: z.literal(true), ordered_items: orderedItems }).strict(),
  z.object({ ...authorBase, order_complete: z.literal(false), ordered_items: z.null() }).strict(),
  z.object({ ...authorBase, item: collectionItem }).strict(),
  z.object({ ...authorBase, source: collectionCatalogFacts }).strict(),
]);
const notes = z
  .string()
  .refine((s) => Array.from(s).length <= 20000)
  .nullable();
const changes = manualFields
  .partial()
  .extend({ name: z.string().nullable().optional(), notes: notes.optional() })
  .strict()
  .refine((c) => Object.keys(c).length > 0 && Object.values(c).every((v) => v !== undefined))
  .refine((c) => 'latitude' in c === 'longitude' in c)
  .refine((c) => !('latitude' in c) || (c.latitude === null) === (c.longitude === null));
const uniqueIds = z
  .array(collectionId)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length);
export const collectionIntent = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create_reference'),
      body: z.object({ source: collectionSource, notes, status: collectionStatus }).strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal('create_snapshot'),
      body: z
        .object({
          source: z.object({ kind: locationKind, id: collectionId }).strict(),
          notes,
          status: collectionStatus,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal('create_manual'),
      body: z.object({ content: collectionManualContent, notes, status: collectionStatus }).strict(),
    })
    .strict(),
  z.object({ action: z.literal('materialize'), body: z.object({ item_id: collectionId }).strict() }).strict(),
  z.object({ action: z.literal('edit'), body: z.object({ item_id: collectionId, changes }).strict() }).strict(),
  z
    .object({
      action: z.literal('status'),
      body: z.object({ item_id: collectionId, status: collectionStatus }).strict(),
    })
    .strict(),
  z.object({ action: z.literal('reorder'), body: z.object({ ordered_ids: uniqueIds }).strict() }).strict(),
]);
export const collectionPreparation = z
  .object({
    scope: collectionScope,
    operation_id: collectionId,
    intent: collectionIntent,
    observation: collectionObservation,
  })
  .strict();
const originalBase = { version: z.literal(1), scope: collectionScope, observed: collectionObservation };
export const collectionContentOriginal = z
  .discriminatedUnion('action', [
    z
      .object({
        ...originalBase,
        action: z.literal('create_reference'),
        target_item_id: collectionId,
        body: z.object({ source: collectionSource, notes, status: collectionStatus }).strict(),
      })
      .strict(),
    z
      .object({
        ...originalBase,
        action: z.literal('create_snapshot'),
        target_item_id: collectionId,
        body: z
          .object({
            source: z.object({ kind: locationKind, id: collectionId }).strict(),
            notes,
            status: collectionStatus,
            content: collectionManualContent,
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...originalBase,
        action: z.literal('create_manual'),
        target_item_id: collectionId,
        body: z.object({ content: collectionManualContent, notes, status: collectionStatus }).strict(),
      })
      .strict(),
    z
      .object({
        ...originalBase,
        action: z.literal('materialize'),
        target_item_id: collectionId,
        body: z.union([
          z
            .object({ item_id: collectionId, already_snapshot: z.literal(false), content: collectionManualContent })
            .strict(),
          z.object({ item_id: collectionId, already_snapshot: z.literal(true), content: z.null() }).strict(),
        ]),
      })
      .strict(),
    z
      .object({
        ...originalBase,
        action: z.literal('edit'),
        target_item_id: collectionId,
        body: z.object({ item_id: collectionId, changes }).strict(),
      })
      .strict(),
    z
      .object({
        ...originalBase,
        action: z.literal('status'),
        target_item_id: collectionId,
        body: z.object({ item_id: collectionId, status: collectionStatus }).strict(),
      })
      .strict(),
    z
      .object({
        ...originalBase,
        action: z.literal('reorder'),
        target_item_id: z.null(),
        body: z.object({ ordered_ids: uniqueIds }).strict(),
      })
      .strict(),
  ])
  .refine((o) => o.scope.lifecycle_revision === o.observed.lifecycle_revision)
  .refine((o) => ('item_id' in o.body ? o.target_item_id === o.body.item_id : true));
export type CollectionOriginal = z.infer<typeof collectionContentOriginal>;
export type CollectionPreparation = z.infer<typeof collectionPreparation>;
const contentAction = z.enum([
  'create_reference',
  'create_snapshot',
  'create_manual',
  'materialize',
  'edit',
  'status',
  'reorder',
]);
export const collectionContentReceipt = z.union([
  z.object({ version: z.literal(1), operation_id: collectionId, status: z.literal('unknown') }).strict(),
  z
    .object({
      version: z.literal(1),
      operation_id: collectionId,
      status: z.literal('prepared'),
      original: collectionContentOriginal,
    })
    .strict(),
  z
    .object({
      version: z.literal(1),
      operation_id: collectionId,
      status: z.literal('cancelled'),
      collection_id: collectionId,
      action: contentAction,
      item_id: collectionId.nullable(),
    })
    .strict(),
  z
    .object({
      version: z.literal(1),
      operation_id: collectionId,
      status: z.literal('committed'),
      collection_id: collectionId,
      action: contentAction,
      item_id: collectionId.nullable(),
      item_revision: revision.nullable(),
      collection_revision: revision,
      content_revision: collectionCounter,
      changed: z.boolean(),
    })
    .strict(),
]);
/** V2 never-prepared cancellation has no executable original or fabricated item. */
export const collectionPreparationResolution = z.union([
  z
    .object({
      version: z.literal(2),
      operation_id: collectionId,
      collection_id: collectionId,
      action: contentAction,
      status: z.literal('unknown'),
      resolution: z.literal('none'),
      result: z.null(),
    })
    .strict(),
  z
    .object({
      version: z.literal(2),
      operation_id: collectionId,
      collection_id: collectionId,
      action: contentAction,
      status: z.literal('cancelled'),
      resolution: z.literal('unprepared'),
      result: z.null(),
    })
    .strict(),
  z
    .object({
      version: z.literal(2),
      operation_id: collectionId,
      collection_id: collectionId,
      action: contentAction,
      status: z.enum(['prepared', 'committed', 'cancelled']),
      resolution: z.literal('prepared'),
      result: collectionContentReceipt,
    })
    .strict()
    .refine((r) => r.result.status === r.status && r.result.operation_id === r.operation_id),
]);
export const collectionPrepared = z
  .object({
    version: z.literal(1),
    operation_id: collectionId,
    status: z.enum(['prepared', 'committed', 'cancelled']),
    original: collectionContentOriginal,
  })
  .strict();

export const collectionRecoveryContext = z
  .object({
    version: z.literal(1),
    scope: collectionScope,
    collection: collectionRoot,
    collection_revision: revision,
    content_revision: collectionCounter,
    item_counts: z.object({ active: collectionCounter, trash: collectionCounter }).strict(),
    item: collectionItemMetadata.optional(),
  })
  .strict();
export const collectionLifecycleOriginal = z
  .discriminatedUnion('target_kind', [
    z
      .object({
        target_kind: z.literal('collection'),
        collection_id: collectionId,
        scope: collectionScope,
        action: z.enum(['trash', 'restore']),
        expected_revision: revision,
      })
      .strict(),
    z
      .object({
        target_kind: z.literal('item'),
        collection_id: collectionId,
        scope: collectionScope,
        action: z.enum(['trash', 'restore']),
        expected_revision: revision,
        item_id: collectionId,
        expected_collection_revision: collectionCounter,
      })
      .strict(),
  ])
  .refine((o) => o.collection_id === o.scope.collection_id);
export type CollectionLifecycleOriginal = z.infer<typeof collectionLifecycleOriginal>;
export const collectionLifecycleReceipt = z.union([
  z.object({ version: z.literal(1), operation_id: collectionId, status: z.literal('unknown') }).strict(),
  z
    .object({
      version: z.literal(1),
      operation_id: collectionId,
      status: z.literal('cancelled'),
      action: z.enum(['trash', 'restore']),
      target_kind: z.enum(['collection', 'item']),
      target_id: collectionId,
    })
    .strict(),
  z
    .object({
      version: z.literal(1),
      operation_id: collectionId,
      status: z.literal('committed'),
      action: z.enum(['trash', 'restore']),
      target_kind: z.enum(['collection', 'item']),
      target_id: collectionId,
      revision,
      collection_revision: revision,
      content_revision: collectionCounter,
      changed: z.boolean(),
    })
    .strict(),
]);
export const collectionTrashCursor = z
  .object({ before_deleted_at: collectionTimestamp, before_id: collectionId })
  .strict();
export const collectionRootTrash = z
  .object({
    version: z.literal(1),
    items: z.array(collectionRoot).max(100),
    next_cursor: collectionTrashCursor.nullable(),
  })
  .strict();
export const collectionItemTrash = z
  .object({
    version: z.literal(1),
    items: z.array(collectionItemMetadata).max(100),
    next_cursor: collectionTrashCursor.nullable(),
  })
  .strict();
const retainedObject = z
  .preprocess(
    (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v) : undefined),
    z.array(z.tuple([z.string(), z.unknown()]))
  )
  .transform((entries) => Object.fromEntries(entries) as Record<string, unknown>);
export const collectionVersions = z
  .object({
    version: z.literal(1),
    items: z
      .array(
        z
          .object({
            revision,
            schema_version: z.literal(1),
            recorded_at: collectionTimestamp,
            snapshot: retainedObject,
            location_snapshot: retainedObject.nullable(),
          })
          .strict()
      )
      .max(100),
    next_cursor: z.object({ before_revision: revision }).strict().nullable(),
  })
  .strict();

export function collectionInvalid(): never {
  throw new FamilyApiError(
    502,
    'invalid_collection_contract',
    'The Collection response does not match the original request. Reload before retrying.'
  );
}
function checkedCollectionJsonProperty(v: object, key: string | symbol) {
  const d = Object.getOwnPropertyDescriptor(v, key);
  if (typeof key !== 'string' || !d || !('value' in d) || !d.enumerable) collectionInvalid();
  return d;
}

/** Plain finite JSON only, with accessors/undefined/cycles/unsafe integers refused before parsing. */
export function collectionJson(value: unknown, bound = 262144): string {
  const ancestors = new Set<object>();
  let nodes = 0;
  function visit(v: unknown, depth: number) {
    if (++nodes > 100000 || depth > 40) collectionInvalid();
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || (Number.isInteger(v) && !Number.isSafeInteger(v))) collectionInvalid();
      return;
    }
    if (typeof v !== 'object' || ancestors.has(v)) collectionInvalid();
    const proto = Object.getPrototypeOf(v);
    if (Array.isArray(v) ? proto !== Array.prototype : proto !== Object.prototype && proto !== null)
      collectionInvalid();
    ancestors.add(v);
    for (const key of Reflect.ownKeys(v)) {
      if (Array.isArray(v) && key === 'length') continue;
      const d = checkedCollectionJsonProperty(v, key);
      visit(d.value, depth + 1);
    }
    if (Array.isArray(v) && Object.keys(v).length !== v.length) collectionInvalid();
    ancestors.delete(v);
  }
  visit(value, 0);
  const json = JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
  if (new TextEncoder().encode(json).byteLength > bound) collectionInvalid();
  return json;
}
export function collectionParse<S extends z.ZodType>(schema: S, value: unknown, bound = 262144): z.infer<S> {
  const encoded = collectionJson(value, bound);
  const p = schema.safeParse(JSON.parse(encoded));
  if (!p.success) collectionInvalid();
  function freeze(v: unknown) {
    if (v && typeof v === 'object') {
      Object.values(v).forEach(freeze);
      Object.freeze(v);
    }
  }
  freeze(p.data);
  return p.data;
}
/** Preserve PostgreSQL microsecond order; Date.parse alone loses sub-millisecond ties. */
export function collectionMicros(value: string): bigint {
  const s = collectionParse(collectionTimestamp, value),
    fraction = /\.(\d+)(?:Z|[+-])/.exec(s)?.[1] ?? '';
  return BigInt(Date.parse(s.replace(/\.\d+(?=Z|[+-])/, ''))) * 1000n + BigInt(fraction.padEnd(6, '0'));
}
