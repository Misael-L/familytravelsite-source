import { z } from 'zod';
import * as c from './collectionContract';
import { normalizeCollectionIntent } from './collectionTransport';

/** Dedicated protected format; generic replay still interprets only formats1/2. */
export const COLLECTION_QUEUE_FORMAT = 3;
const state = z.enum(['active', 'archived', 'trash']);
const common = {
  version: z.literal(1),
  source_url: z.string(),
  operation_id: c.collectionId,
  scope: c.collectionIdentity,
  decision: z.enum(['execute', 'cancel']),
  before_state: state,
  after_state: state,
};
const envelope = z.discriminatedUnion('kind', [
  z
    .object({
      ...common,
      kind: z.literal('content'),
      preparation: c.collectionPreparation,
      original: c.collectionContentOriginal.nullable(),
    })
    .strict(),
  z.object({ ...common, kind: z.literal('lifecycle'), original: c.collectionLifecycleOriginal }).strict(),
]);
export type CollectionCommand = z.infer<typeof envelope>;
const identity = (s: c.CollectionScope) => {
  const { lifecycle_revision: _revision, ...actor } = s;
  return actor;
};
export function matchesCollectionPreparation(p: c.CollectionPreparation, o: c.CollectionOriginal): boolean {
  if (
    c.collectionJson(p.scope) !== c.collectionJson(o.scope) ||
    c.collectionJson(p.observation) !== c.collectionJson(o.observed) ||
    p.intent.action !== o.action
  )
    return false;
  const { content: _content, already_snapshot: _snapshot, ...base } = o.body as Record<string, unknown>;
  return (
    c.collectionJson(p.intent.body) ===
    c.collectionJson(o.action === 'create_snapshot' || o.action === 'materialize' ? base : o.body)
  );
}
function checkCollectionCommandSource(p: CollectionCommand) {
  const u = new URL(p.source_url);
  if (
    !['https:', 'http:'].includes(u.protocol) ||
    u.origin !== p.source_url ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    c.collectionInvalid();
}

export function parseCollectionCommand(raw: unknown): CollectionCommand {
  const p = c.collectionParse(envelope, raw, 786432);
  checkCollectionCommandSource(p);
  if (p.kind === 'content') {
    if (
      p.operation_id !== p.preparation.operation_id ||
      c.collectionJson(p.scope) !== c.collectionJson(identity(p.preparation.scope)) ||
      p.before_state !== 'active' ||
      p.after_state !== 'active'
    )
      c.collectionInvalid();
    if (c.collectionJson(normalizeCollectionIntent(p.preparation.intent)) !== c.collectionJson(p.preparation.intent))
      c.collectionInvalid();
    if (p.original && !matchesCollectionPreparation(p.preparation, p.original)) c.collectionInvalid();
  } else {
    const o = p.original;
    if (c.collectionJson(p.scope) !== c.collectionJson(identity(o.scope))) c.collectionInvalid();
    if (
      o.target_kind === 'item'
        ? p.before_state === 'trash' || p.before_state !== p.after_state
        : o.action === 'trash'
          ? p.before_state === 'trash' || p.after_state !== 'trash'
          : p.before_state !== 'trash' || p.after_state === 'trash'
    )
      c.collectionInvalid();
  }
  return p;
}
export const collectionCommandUrl = (p: Pick<CollectionCommand, 'scope'>) =>
  `/family/collections/${p.scope.collection_id}/commands/v1`;
export function collectionCommandParent(url: string): string | null {
  return url.match(/^\/family\/collections\/([0-9a-f-]{36})\/commands\/v1$/)?.[1] ?? null;
}
export function collectionCommandBelongs(p: CollectionCommand, scope: c.CollectionIdentity, source: string) {
  const { session_id: _old, ...original } = p.scope,
    { session_id: _current, ...actor } = scope;
  return p.source_url === source && c.collectionJson(original) === c.collectionJson(actor);
}
