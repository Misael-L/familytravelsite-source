import type { CollectionRpc } from '@family/backend/supabase/collectionRpc';
import Dexie from 'dexie';
import { vi } from 'vitest';
import type { z } from 'zod';
import { detachOfflineDatabase, offlineDb, reopenAnonymous, reopenForUser } from '../../src/db/offlineDb';
import { installSourcePolicy, sourceOwnerName, type SourceDatabaseOwner } from '../../src/db/sourceDatabase';
import type { collectionDisplayRoot } from '../../src/integrations/family/collectionContract';
import { setAuthed } from '../../src/sync/authGate';
import { _resetNetworkMode } from '../../src/sync/networkMode';
export const cid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const commandActor = {
  version: 1 as const,
  user_id: cid(1),
  person_id: cid(2),
  family_id: cid(3),
  session_id: cid(4),
  collection_id: cid(10),
};
export const commandManual = (notes = 'Personal') => ({
  action: 'create_manual',
  body: {
    content: {
      name: 'Manual',
      description: 'Description',
      latitude: null,
      longitude: null,
      address: null,
      website: null,
      phone: null,
      family_place_category_id: null,
      cover_media_id: null,
    },
    notes,
    status: 'idea',
  },
});
export async function collectionDevice(scope = commandActor) {
  const marker: SourceDatabaseOwner = {
    format: 'family.native-owner.v1',
    source: 'https://fixture.invalid',
    user_id: scope.user_id,
    person_id: scope.person_id,
    family_id: scope.family_id,
    native_user: 191501,
  };
  const name = await sourceOwnerName(marker);
  let active = true;
  const release = installSourcePolicy({
    select: async () => ({
      name,
      owner: marker,
      current: () => active,
      writable: () => active,
      initialize: () => active,
    }),
    read: async () => ({ name, owner: marker, current: () => active, writable: () => false, initialize: () => false }),
  });
  detachOfflineDatabase();
  await reopenForUser(marker.native_user);
  setAuthed(true);
  _resetNetworkMode();
  return {
    marker,
    name,
    db: offlineDb,
    retire: () => {
      active = false;
    },
    async close() {
      active = true;
      setAuthed(false);
      release();
      await reopenAnonymous();
      await Dexie.delete(name);
    },
  };
}
export function collectionEngine(scope = commandActor) {
  const at = '2026-11-15T00:00:00.123456Z',
    cover = { id: null, availability: 'absent', thumb_url: null, hero_url: null } satisfies z.infer<
      typeof collectionDisplayRoot
    >['cover'];
  let revision = 0;
  const root: z.infer<typeof collectionDisplayRoot> = {
    id: scope.collection_id,
    family_id: scope.family_id,
    owner_person_id: scope.person_id,
    visibility: 'private',
    revision: 1,
    lifecycle_revision: 0,
    archived_at: null,
    deleted_at: null,
    name: 'Fresh current collection',
    description: null,
    color: null,
    sort_order: 0,
    cover,
  };
  const observation = () => ({
    version: 1,
    collection_revision: root.revision,
    content_revision: revision,
    lifecycle_revision: root.lifecycle_revision,
    item_revision: null,
    item_digest: null,
    source_digest: null,
  });
  let responseSession = scope.session_id;
  const baseScope = () => ({ ...scope, session_id: responseSession, lifecycle_revision: root.lifecycle_revision });
  const cancellations = new Map<string, unknown>();
  const originals = new Map<string, Record<string, unknown>>(),
    outcomes = new Map<string, Record<string, unknown>>();
  let after: ((name: string, args: Record<string, unknown>, result: unknown) => Promise<void> | void) | null = null;
  const rpc = vi.fn<CollectionRpc>(async (name, args, context) => {
    responseSession = context.session_id;
    const op = String(args.p_operation_id);
    let result: unknown;
    if (name === 'get_family_collection_authoring_context_v1')
      result = { version: 1, scope: baseScope(), observation: observation(), order_complete: true, ordered_items: [] };
    else if (
      name === 'get_family_collection_preparation_outcome_v2' ||
      name === 'cancel_family_collection_preparation_v2'
    ) {
      const p = args.p_preparation as {
        operation_id: string;
        scope: unknown;
        intent: { action: string };
        observation: unknown;
      };
      const id = p.operation_id,
        o = originals.get(id);
      let actual = outcomes.get(id);
      if (name === 'cancel_family_collection_preparation_v2' && !actual) {
        if (o) {
          actual = {
            version: 1,
            operation_id: id,
            status: 'cancelled',
            collection_id: root.id,
            action: o.action,
            item_id: o.target_item_id,
          };
          outcomes.set(id, actual);
        } else cancellations.set(id, structuredClone(p));
      }
      if (cancellations.has(id) && JSON.stringify(cancellations.get(id)) !== JSON.stringify(p))
        throw Error('Preparation identity conflict');
      result = {
        version: 2,
        operation_id: id,
        collection_id: root.id,
        action: p.intent.action,
        status: actual?.status ?? (o ? 'prepared' : cancellations.has(id) ? 'cancelled' : 'unknown'),
        resolution: o ? 'prepared' : cancellations.has(id) ? 'unprepared' : 'none',
        result: actual ?? (o ? { version: 1, operation_id: id, status: 'prepared', original: o } : null),
      };
    } else if (name === 'prepare_family_collection_content_v1') {
      if (cancellations.has(op)) throw Error('Cancelled before preparation');
      if (!originals.has(op))
        originals.set(op, {
          version: 1,
          scope: baseScope(),
          observed: structuredClone(args.p_observation),
          action: args.p_action,
          body: structuredClone(args.p_body),
          target_item_id: args.p_action === 'reorder' ? null : crypto.randomUUID(),
        });
      result = {
        version: 1,
        operation_id: op,
        status: outcomes.get(op)?.status ?? 'prepared',
        original: originals.get(op),
      };
    } else if (name === 'get_family_collection_content_operation_v1')
      result =
        outcomes.get(op) ??
        (originals.has(op)
          ? { version: 1, operation_id: op, status: 'prepared', original: originals.get(op) }
          : { version: 1, operation_id: op, status: 'unknown' });
    else if (name === 'execute_family_collection_content_v1' || name === 'cancel_family_collection_content_v1') {
      const o = originals.get(op);
      if (!o) throw Error('Missing fixture preparation');
      if (!outcomes.has(op))
        outcomes.set(
          op,
          name.startsWith('cancel')
            ? {
                version: 1,
                operation_id: op,
                status: 'cancelled',
                collection_id: root.id,
                action: o?.action,
                item_id: o?.target_item_id,
              }
            : {
                version: 1,
                operation_id: op,
                status: 'committed',
                collection_id: root.id,
                action: o?.action,
                item_id: o?.target_item_id,
                item_revision: 1,
                collection_revision: root.revision,
                content_revision: ++revision,
                changed: true,
              }
        );
      result = outcomes.get(op);
    } else if (name === 'get_family_collection_page_v1')
      result = {
        version: 1,
        scope: baseScope(),
        collection: root,
        content_revision: revision,
        items: [],
        next_cursor: null,
      };
    else if (name === 'get_family_collection_context_v1' || name === 'get_family_collection_item_context_v1')
      result = {
        version: 1,
        scope: baseScope(),
        collection: (({ name: _n, description: _d, color: _c, sort_order: _s, cover: _m, ...r }) => r)(root),
        collection_revision: root.revision,
        content_revision: revision,
        item_counts: { active: 0, trash: 0 },
        ...(args.p_item_id
          ? {
              item: {
                id: args.p_item_id,
                collection_id: root.id,
                kind: 'manual',
                source: { kind: 'manual', id: null },
                revision: 1,
                status: 'idea',
                sort_order: 0,
                deleted_at: null,
              },
            }
          : {}),
      };
    else if (name === 'get_family_collection_operation_v1')
      result = outcomes.get(op) ?? { version: 1, operation_id: op, status: 'unknown' };
    else if (
      name === 'execute_family_collection_lifecycle_v1' ||
      name === 'execute_family_collection_item_lifecycle_v1' ||
      name === 'cancel_family_collection_operation_v1'
    ) {
      const o = (args.p_original ?? {
        target_kind: args.p_item_id ? 'item' : 'collection',
        item_id: args.p_item_id,
        action: args.p_action,
      }) as Record<string, unknown>;
      if (!outcomes.has(op)) {
        if (name.startsWith('cancel'))
          outcomes.set(op, {
            version: 1,
            operation_id: op,
            status: 'cancelled',
            action: o?.action,
            target_kind: o.target_kind,
            target_id: o.item_id ?? root.id,
          });
        else {
          root.revision++;
          revision++;
          root.lifecycle_revision++;
          if (o.target_kind === 'collection') root.deleted_at = o?.action === 'trash' ? at : null;
          outcomes.set(op, {
            version: 1,
            operation_id: op,
            status: 'committed',
            action: o?.action,
            target_kind: o.target_kind,
            target_id: o.item_id ?? root.id,
            revision: root.revision,
            collection_revision: root.revision,
            content_revision: revision,
            changed: true,
          });
        }
      }
      result = outcomes.get(op);
    } else if (name === 'list_family_collection_trash_v1')
      result = {
        version: 1,
        items: root.deleted_at
          ? [(({ name: _n, description: _d, color: _c, sort_order: _s, cover: _m, ...r }) => r)(root)]
          : [],
        next_cursor: null,
      };
    else if (name === 'list_family_collection_item_trash_v1' || name === 'list_family_collection_versions_v1')
      result = { version: 1, items: [], next_cursor: null };
    else throw Error('Unsupported fixture RPC');
    const snapshot = structuredClone(result);
    await after?.(name, args, snapshot);
    return snapshot;
  });
  return {
    rpc,
    root,
    originals,
    outcomes,
    cancellations,
    after(fn: typeof after) {
      after = fn;
    },
  };
}
