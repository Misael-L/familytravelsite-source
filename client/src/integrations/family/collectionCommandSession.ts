import type { CollectionRpc } from '@family/backend/supabase/collectionRpc';
import { collectionRpc } from '@family/backend/supabase/collectionRpc';
import { z } from 'zod';
import type { QueuedMutation } from '../../db/offlineDb';
import { offlineSourceOwner } from '../../db/offlineDb';
import { SOURCE_OWNER_KEY, sourceDatabaseName } from '../../db/sourceDatabase';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { acquireQueueLock } from '../../sync/queueLock';
import { captureWriteSession } from '../../sync/writeSession';
import {
  collectionCommandBelongs,
  matchesCollectionPreparation,
  parseCollectionCommand,
  type CollectionCommand,
} from './collectionCommandContract';
import { createCollectionCommandQueue, parseCollectionQueueRow } from './collectionCommandQueue';
import * as c from './collectionContract';
import { createCollectionTransport, normalizeCollectionIntent } from './collectionTransport';
import { coreHttpsPlannerPackingProfileEnabled } from './coreHttpsPlannerPackingProfile';
import { coreHttpsTaskProfileEnabled } from './coreHttpsTaskProfile';
import { FamilyApiError } from './errors';

type ViewState = 'active' | 'archived' | 'trash';
export type CollectionCurrentView =
  | Awaited<ReturnType<ReturnType<typeof createCollectionTransport>['all']>>
  | Awaited<ReturnType<ReturnType<typeof createCollectionTransport>['recoveryContext']>>;
export type CollectionCommandOwner = {
  timeoutMs?: number;
  scope: c.CollectionIdentity;
  source_url: string;
  assertCurrent: () => void;
  publish: (view: CollectionCurrentView, assertCurrent: () => void) => unknown;
};
type CollectionFinishReceipt =
  | z.infer<typeof c.collectionContentReceipt>
  | z.infer<typeof c.collectionLifecycleReceipt>
  | Extract<z.infer<typeof c.collectionPreparationResolution>, { resolution: 'unprepared' }>;

function checkCollectionContentFinish(r: CollectionFinishReceipt, p: CollectionCommand) {
  if (p.kind === 'content' && 'action' in r) {
    if (r.action !== p.preparation.intent.action || ('collection_id' in r && r.collection_id !== p.scope.collection_id))
      c.collectionInvalid();
    if (
      r.version === 1 &&
      'item_id' in p.preparation.intent.body &&
      (!('item_id' in r) || r.item_id !== p.preparation.intent.body.item_id)
    )
      c.collectionInvalid();
  }
}

/** No ambient queue replay. Every action is owned, observed, persisted and explicitly resumed. */
export class CollectionCommandSession {
  readonly scope: c.CollectionIdentity;
  private readonly source: string;
  private readonly originalRpc: CollectionRpc;
  private readonly timeoutMs: number;
  private readonly capture = captureWriteSession();
  private readonly external: () => void;
  private readonly publish: CollectionCommandOwner['publish'];
  private retired = false;
  private readonly api: ReturnType<typeof createCollectionTransport>;
  private readonly queue: ReturnType<typeof createCollectionCommandQueue>;
  constructor(owner: CollectionCommandOwner, rpc: CollectionRpc = collectionRpc) {
    if (coreHttpsPlannerPackingProfileEnabled())
      throw new FamilyApiError(
        501,
        'isolated_planner_packing_only',
        'Collections remain read only in this planner and packing profile.'
      );
    if (coreHttpsTaskProfileEnabled())
      throw new FamilyApiError(501, 'isolated_task_profile_only', 'Collections remain read only in this task profile.');
    this.originalRpc = rpc;
    this.scope = c.collectionParse(c.collectionIdentity, owner.scope);
    this.source = owner.source_url;
    this.external = owner.assertCurrent.bind(owner);
    this.publish = owner.publish.bind(owner);
    const timeout = owner.timeoutMs ?? 30000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 30000)
      throw new FamilyApiError(400, 'collection_timeout', 'Use a bounded request deadline.');
    this.timeoutMs = timeout;
    const timed: CollectionRpc = (name, args, context) =>
      new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          settled = true;
          reject(
            new FamilyApiError(
              503,
              'collection_reply_unknown',
              'The response deadline ended. The original request remains retained.'
            )
          );
        }, timeout);
        Promise.resolve()
          .then(() => {
            this.check();
            return rpc(name, args, context);
          })
          .then(
            (value) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              try {
                this.check();
                resolve(value);
              } catch (error) {
                reject(error);
              }
            },
            (error) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              reject(error);
            }
          );
      });
    this.api = createCollectionTransport(this.source, timed);
    if (this.scope.person_id === null)
      throw new FamilyApiError(422, 'collection_person_unlinked', 'Collection writes need a linked Family person.');
    const captured = this.capture;
    this.queue = createCollectionCommandQueue(
      {
        ...captured,
        assertCurrent: this.check,
        current: () => {
          try {
            this.check();
            return true;
          } catch {
            return false;
          }
        },
      },
      this.scope,
      this.source
    );
    this.check();
  }
  private check = () => {
    this.external();
    this.capture.assertCurrent();
    const owner = offlineSourceOwner();
    if (
      this.retired ||
      !sourceDatabaseName(this.capture.db.name) ||
      !owner ||
      owner.source !== this.source ||
      owner.user_id !== this.scope.user_id ||
      owner.person_id !== this.scope.person_id ||
      owner.family_id !== this.scope.family_id
    )
      throw new FamilyApiError(
        409,
        'collection_command_context',
        'Open this Collection in its original verified source and account.'
      );
  };
  private network = () => {
    this.check();
    if (isEffectivelyOffline())
      throw new FamilyApiError(
        503,
        'collection_command_offline',
        'Reconnect to confirm the original Collection operation. It remains retained.'
      );
  };
  private async locked<T>(work: () => Promise<T>) {
    this.network();
    const release = await acquireQueueLock(
      {
        db: this.capture.db,
        current: () => {
          try {
            this.check();
            return true;
          } catch {
            return false;
          }
        },
      },
      'exclusive',
      true
    );
    if (!release)
      throw new FamilyApiError(409, 'collection_queue_lock', 'The original Collection queue lock is unavailable.');
    try {
      this.network();
      const marker = await this.capture.db.syncMeta.get(SOURCE_OWNER_KEY);
      this.check();
      if (c.collectionJson(marker?.sourceOwner) !== c.collectionJson(offlineSourceOwner()))
        throw new FamilyApiError(409, 'collection_source_owner', 'The retained work needs its verified source owner.');
      return await work();
    } finally {
      release();
    }
  }
  /** A form/view may retire without abandoning its parent's recoverable originals. */
  scoped(assertCurrent: () => void) {
    this.check();
    const check = () => {
      this.check();
      assertCurrent();
    };
    return new CollectionCommandSession(
      {
        scope: this.scope,
        source_url: this.source,
        timeoutMs: this.timeoutMs,
        assertCurrent: check,
        publish: (view, fence) => {
          check();
          return this.publish(view, fence);
        },
      },
      this.originalRpc
    );
  }
  retire() {
    this.retired = true;
  }
  async pending() {
    this.check();
    return this.queue.list();
  }
  /** Observe when opening the form or choosing its source, never as a save retry. */
  async observeContent(rawTarget: unknown = {}) {
    const target = c.collectionParse(c.collectionTarget, rawTarget);
    this.network();
    const context = await this.api.context(this.scope, target, this.check);
    this.network();
    const selection = c.collectionParse(c.collectionContentSelection, {
      scope: context.scope,
      observation: context.observation,
      target,
    });
    return Object.freeze({ context, selection });
  }
  async retainContent(raw: unknown, observed?: c.CollectionContentSelection) {
    const intent = normalizeCollectionIntent(raw);
    let target: c.CollectionContentSelection['target'] = {};
    if ('source' in intent.body) target = { source: intent.body.source };
    else if ('item_id' in intent.body) target = { item_id: intent.body.item_id };
    const selected = observed === undefined ? null : c.collectionParse(c.collectionContentSelection, observed);
    if (!selected && ['edit', 'status', 'materialize', 'reorder'].includes(intent.action))
      throw new FamilyApiError(
        400,
        'collection_observation_required',
        'Open the current Collection view before changing an existing record.'
      );
    if (selected) {
      const { lifecycle_revision: _revision, ...scope } = selected.scope;
      if (
        c.collectionJson(scope) !== c.collectionJson(this.scope) ||
        c.collectionJson(selected.target) !== c.collectionJson(target)
      )
        throw new FamilyApiError(
          409,
          'collection_selection_changed',
          'Use the displayed observation for this exact Collection and record.'
        );
    }
    return this.locked(async () => {
      const ctx = selected ?? (await this.api.context(this.scope, target, this.check));
      this.check();
      const operation_id = crypto.randomUUID();
      const p = parseCollectionCommand({
        version: 1,
        kind: 'content',
        source_url: this.source,
        operation_id,
        scope: this.scope,
        decision: 'execute',
        before_state: 'active',
        after_state: 'active',
        preparation: { scope: ctx.scope, operation_id, intent, observation: ctx.observation },
        original: null,
      });
      await this.queue.retain(p);
      return operation_id;
    });
  }
  async retainLifecycle(action: 'trash' | 'restore', item: string | null, state: ViewState, observed?: unknown) {
    const selected =
      observed === undefined
        ? null
        : c.collectionParse(item === null ? c.collectionRoot : c.collectionItemMetadata, observed, 65536);
    if (
      selected &&
      ((action === 'restore' ? selected.deleted_at === null : selected.deleted_at !== null) ||
        selected.id !== (item ?? this.scope.collection_id) ||
        ('collection_id' in selected
          ? selected.collection_id !== this.scope.collection_id
          : selected.family_id !== this.scope.family_id))
    )
      throw new FamilyApiError(
        400,
        'collection_restore_selection',
        'Choose the displayed record from this Collection.'
      );
    return this.locked(async () => {
      const ctx = await this.api.recoveryContext(this.scope, state, item, this.check);
      if (selected && c.collectionJson(selected) !== c.collectionJson(item === null ? ctx.collection : ctx.item))
        throw new FamilyApiError(
          409,
          'collection_recovery_changed',
          'This deleted record changed. Reload deleted records before restoring it.'
        );
      const operation_id = crypto.randomUUID();
      const original =
        item === null
          ? {
              target_kind: 'collection',
              collection_id: this.scope.collection_id,
              scope: ctx.scope,
              action,
              expected_revision: ctx.collection_revision,
            }
          : {
              target_kind: 'item',
              collection_id: this.scope.collection_id,
              scope: ctx.scope,
              action,
              item_id: item,
              expected_revision: ctx.item?.revision,
              expected_collection_revision: ctx.content_revision,
            };
      const after =
        item !== null
          ? state
          : action === 'trash'
            ? 'trash'
            : ctx.collection.archived_at === null
              ? 'active'
              : 'archived';
      await this.queue.retain(
        parseCollectionCommand({
          version: 1,
          kind: 'lifecycle',
          source_url: this.source,
          operation_id,
          scope: this.scope,
          decision: 'execute',
          before_state: state,
          after_state: after,
          original,
        })
      );
      return operation_id;
    });
  }
  async run(operation: string, mode: 'check' | 'retry' | 'cancel' = 'check', readState?: ViewState) {
    c.collectionParse(c.collectionId, operation);
    if (!['check', 'retry', 'cancel'].includes(mode))
      throw new FamilyApiError(400, 'collection_command_mode', 'Choose an explicit supported recovery action.');
    return this.locked(async () => {
      let { row, packet } = await this.queue.get(operation);
      this.check();
      if (mode === 'cancel' && packet.decision !== 'cancel') {
        row = await this.queue.replace(row, { ...packet, decision: 'cancel' });
        packet = parseCollectionQueueRow(row).packet;
      }
      const outcome = await this.outcome(packet);
      await this.queue.exact(row);
      if (outcome.status === 'committed' || outcome.status === 'cancelled')
        return this.finish(row, packet, outcome, readState);
      if (packet.kind === 'content' && outcome.status === 'prepared') {
        if (!matchesCollectionPreparation(packet.preparation, outcome.original)) c.collectionInvalid();
        row = await this.queue.replace(row, { ...packet, original: outcome.original });
        packet = parseCollectionQueueRow(row).packet;
      }
      if (mode === 'check') return Object.freeze({ status: outcome.status });
      if (packet.kind === 'content' && packet.decision === 'cancel') {
        const resolution = await this.api.resolvePreparation(
          this.scope,
          packet.preparation,
          true,
          this.check,
          packet.original ?? undefined
        );
        await this.queue.exact(row);
        return this.finish(
          row,
          packet,
          resolution.resolution === 'unprepared' ? resolution : resolution.result,
          readState
        );
      }
      if (packet.kind === 'content' && packet.original === null) {
        this.assertOriginalSession(packet);
        this.network();
        const prepared = await this.api.prepare(packet.preparation, this.check);
        await this.queue.exact(row);
        row = await this.queue.replace(row, { ...packet, original: prepared.original });
        packet = parseCollectionQueueRow(row).packet;
        if (prepared.status !== 'prepared') {
          const receipt = await this.outcome(packet);
          await this.queue.exact(row);
          if (receipt.status === 'committed' || receipt.status === 'cancelled')
            return this.finish(row, packet, receipt, readState);
          c.collectionInvalid();
        }
      }
      this.network();
      if (packet.decision === 'execute') this.assertOriginalSession(packet);
      const receipt =
        packet.kind === 'content'
          ? await this.contentExecution(packet)
          : await this.api.lifecycle(
              this.scope,
              packet.operation_id,
              packet.original,
              packet.decision === 'cancel',
              this.check
            );
      await this.queue.exact(row);
      return this.finish(row, packet, receipt, readState);
    });
  }
  private assertOriginalSession(packet: CollectionCommand) {
    if (packet.scope.session_id !== this.scope.session_id) throw this.oldSession();
  }
  private oldSession() {
    return new FamilyApiError(
      409,
      'collection_original_session',
      'This original belongs to an older session. Check or cancel it instead of executing it.'
    );
  }
  private async outcome(p: CollectionCommand) {
    this.network();
    if (p.kind === 'lifecycle') return this.api.lifecycleOutcome(this.scope, p.operation_id, p.original, this.check);
    const r = await this.api.resolvePreparation(this.scope, p.preparation, false, this.check, p.original ?? undefined);
    if (r.resolution === 'unprepared') return r;
    return r.result ?? { version: 1 as const, operation_id: p.operation_id, status: 'unknown' as const };
  }
  private async contentExecution(p: Extract<CollectionCommand, { kind: 'content' }>) {
    if (!p.original) c.collectionInvalid();
    return p.decision === 'cancel'
      ? this.api.cancel(this.scope, p.operation_id, p.original, this.check)
      : this.api.execute(this.scope, p.operation_id, p.original, this.check);
  }
  private async finish(row: QueuedMutation, p: CollectionCommand, receipt: unknown, override?: ViewState) {
    this.network();
    const unprepared = c.collectionPreparationResolution.safeParse(receipt);
    const r =
      p.kind === 'content' && unprepared.success && unprepared.data.resolution === 'unprepared'
        ? unprepared.data
        : p.kind === 'content'
          ? c.collectionParse(c.collectionContentReceipt, receipt)
          : c.collectionParse(c.collectionLifecycleReceipt, receipt);
    if (
      r.operation_id !== p.operation_id ||
      (r.status !== 'committed' && r.status !== 'cancelled') ||
      !collectionCommandBelongs(p, this.scope, this.source)
    )
      c.collectionInvalid();
    checkCollectionContentFinish(r, p);
    const state = c.collectionParse(
      z.enum(['active', 'archived', 'trash']),
      override ?? (r.status === 'committed' ? p.after_state : p.before_state)
    );
    const view =
      state === 'trash'
        ? await this.api.recoveryContext(this.scope, 'trash', null, this.check)
        : await this.api.all(this.scope, state, this.check);
    this.network();
    await this.queue.exact(row);
    if (
      r.status === 'committed' &&
      (view.collection.revision < r.collection_revision || view.content_revision < r.content_revision)
    )
      c.collectionInvalid();
    await this.queue.acknowledge(row, () => {
      this.check();
      const value = this.publish(view, this.check);
      this.check();
      return value;
    });
    return Object.freeze({
      status: r.status,
      view,
      current: () => {
        try {
          this.check();
          return true;
        } catch {
          return false;
        }
      },
    });
  }
  async trash(kind: 'collection' | 'item', limit = 25, cursor: Parameters<typeof this.api.trash>[3] = null) {
    this.network();
    return this.api.trash(this.scope, kind, limit, cursor, this.check);
  }
  async history(item: string | null, limit = 25, before: number | null = null) {
    this.network();
    return this.api.versions(this.scope, item, limit, before, this.check);
  }
}
