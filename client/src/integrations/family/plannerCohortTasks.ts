import type { TodoCreateItemRequest, TodoUpdateItemRequest } from '@trek/shared';
import api from '../../api/client';
import type { PlannerTaskPort, TaskEditOrigin } from '../../repo/plannerTaskPort';
import { useTripStore } from '../../store/tripStore';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { acquireQueueLock } from '../../sync/queueLock';
import { captureWriteSession } from '../../sync/writeSession';
import type { TodoItem } from '../../types';
import { locationRpc } from './planLocations';
import { projectTask, type NativeTask } from './plannerTasks';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import { taskEnvelope, type TaskEnvelope } from './taskCommandHandler';
import { taskCommand, taskList, type TaskCommand, type TaskCursor, type TaskList, type TaskRow } from './taskContract';
import { acknowledgeTaskIntent, parkTaskRefusal, retainTaskIntent, taskIntentUrl, taskJson } from './taskIntentQueue';
import { checkTaskAcknowledgement, createTaskTransport, type TaskRpc } from './taskTransport';

type Environment = { source: () => string; disposed: () => boolean; allowed: () => boolean };
/** Owns checked task observations, not a second task database. It never borrows a newer revision for an old form. */
export class PlannerCohortTasks implements PlannerTaskPort {
  private snapshot: TaskList | null = null;
  private epoch = 0;
  private transport;
  constructor(
    private repo: FamilyFrontendRepository,
    private environment: Environment,
    rpc: TaskRpc = locationRpc
  ) {
    this.transport = createTaskTransport(rpc);
  }
  reset() {
    this.epoch++;
    this.snapshot = null;
  }
  publish(packet: TaskList) {
    this.snapshot = taskList.parse(packet);
  }
  private changed(): never {
    throw new FamilyApiError(
      409,
      'task_observation_changed',
      'The original task view changed. Reopen it before editing.'
    );
  }
  private capture() {
    const packet = this.snapshot,
      epoch = this.epoch,
      owner = captureWriteSession(),
      source = this.environment.source(),
      ids = this.repo.knownViews()?.ids;
    if (!packet || !ids) return this.changed();
    const context = this.repo.captureContext(packet.scope.trip_id, { revision: false }),
      layer = this.repo.getLayer(packet.scope.trip_id),
      native = ids.register('trip', packet.scope.trip_id);
    const check = () => {
      owner.assertCurrent();
      context.assertCurrent();
      if (
        this.environment.disposed() ||
        epoch !== this.epoch ||
        source !== this.environment.source() ||
        ids !== this.repo.knownViews()?.ids ||
        this.repo.getLayer(packet.scope.trip_id) !== layer ||
        String(useTripStore.getState().trip?.id) !== String(native)
      )
        this.changed();
    };
    const fence = async () => {
      check();
      const now = await this.repo.session();
      check();
      if (
        now.userId !== packet.scope.user_id ||
        now.familyId !== packet.scope.family_id ||
        now.personId !== packet.scope.person_id
      )
        this.changed();
    };
    check();
    return { packet: structuredClone(packet), owner, ids, source, native, layer, check, fence };
  }
  private row(c: ReturnType<PlannerCohortTasks['capture']>, item: TodoItem) {
    const meta = (item as NativeTask).family_task;
    const row = meta && c.packet.tasks.find((r) => r.id === meta.id);
    if (
      !row ||
      meta.trip_id !== c.packet.scope.trip_id ||
      row.revision !== meta.revision ||
      taskJson(meta.scope) !== taskJson(c.packet.scope) ||
      taskJson(projectTask(row, c.packet.scope, c.packet.collection_revision, c.ids)) !== taskJson(item)
    )
      this.changed();
    return row;
  }
  bind(item: TodoItem | null, trip?: number | string): TaskEditOrigin {
    // A form may mount before its Trip has loaded. It remains refused rather than borrowing a later context.
    try {
      const c = this.capture();
      if (trip !== undefined && String(trip) !== String(c.native) && trip !== c.packet.scope.trip_id) this.changed();
      let row = item ? this.row(c, item) : null,
        closed = false,
        intent: TaskEnvelope | null = null,
        flight: Promise<TodoItem> | null = null;
      const check = () => {
        c.check();
        if (closed) this.changed();
      };
      const write = async (action: 'create' | 'update' | 'trash', values: TaskCommand['values']) => {
        check();
        if (!this.environment.allowed())
          throw new FamilyApiError(403, 'task_access_denied', 'Task editing is not authorized.');
        const target = row?.id ?? intent?.command.target_id ?? crypto.randomUUID();
        const command = taskCommand.parse({
          version: 1,
          scope: c.packet.scope,
          operation_id: intent?.command.operation_id ?? crypto.randomUUID(),
          action,
          target_id: target,
          expected_revision: row?.revision ?? null,
          expected_collection_revision: null,
          values,
        });
        if (intent && taskJson(intent.command) !== taskJson(command))
          throw new FamilyApiError(
            409,
            'task_pending_intent',
            'The original task save is unresolved. Retry it unchanged before starting another edit.'
          );
        intent ??= { version: 1, source_url: c.source, view_layer: c.layer, command };
        if (flight !== null) return flight;
        const packet = intent;
        const run = async () => {
          const current = await this.send(c, packet, check);
          check();
          const saved = current.tasks.find((r) => r.id === target);
          if (action !== 'trash' && !saved) this.changed();
          const shown = saved ?? row;
          if (!shown) this.changed();
          const native = projectTask(shown, current.scope, current.collection_revision, c.ids);
          row = saved ?? row;
          c.packet = structuredClone(current);
          intent = null;
          return native;
        };
        flight = run();
        try {
          return await flight;
        } finally {
          flight = null;
        }
      };
      return {
        close: () => {
          closed = true;
        },
        save: async (data) => {
          check();
          return write(row ? 'update' : 'create', taskValues(data, c.ids));
        },
        trash: async () => {
          if (!row) this.changed();
          await write('trash', {});
        },
      };
    } catch (error) {
      return {
        close: () => {},
        save: async () => {
          throw error;
        },
        trash: async () => {
          throw error;
        },
      };
    }
  }
  async completion(trip: number | string, item: TodoItem, checked: boolean) {
    const c = this.capture(),
      row = this.row(c, item);
    if (String(trip) !== String(c.native) && trip !== c.packet.scope.trip_id) this.changed();
    const command = taskCommand.parse({
      version: 1,
      operation_id: crypto.randomUUID(),
      scope: c.packet.scope,
      action: 'completion',
      target_id: row.id,
      expected_revision: row.revision,
      expected_collection_revision: null,
      values: { checked },
    });
    await this.send(c, { version: 1, source_url: c.source, view_layer: c.layer, command }, c.check);
  }
  async reorder(trip: number | string, rows: TodoItem[], order: number[]) {
    const c = this.capture();
    if ((String(trip) !== String(c.native) && trip !== c.packet.scope.trip_id) || rows.length !== c.packet.tasks.length)
      this.changed();
    const byId = new Map(rows.map((item) => [item.id, this.row(c, item).id]));
    const ids = order.map((id) => {
      const value = byId.get(id);
      if (!value) this.changed();
      return value;
    });
    if (ids.length !== c.packet.tasks.length || new Set(ids).size !== ids.length) this.changed();
    const command = taskCommand.parse({
      version: 1,
      operation_id: crypto.randomUUID(),
      scope: c.packet.scope,
      action: 'reorder',
      target_id: null,
      expected_revision: null,
      expected_collection_revision: c.packet.collection_revision,
      values: { ids },
    });
    await this.send(c, { version: 1, source_url: c.source, view_layer: c.layer, command }, c.check);
  }
  async trashPage(before: TaskCursor | null = null) {
    const c = this.capture();
    await c.fence();
    if (isEffectivelyOffline()) throw new FamilyApiError(503, 'task_trash_offline', 'Reconnect to inspect task Trash.');
    const page = await this.transport.trash(c.packet.scope, 50, before);
    await c.fence();
    if (taskJson(page.scope) !== taskJson(c.packet.scope)) this.changed();
    return page;
  }
  async restore(row: TaskRow) {
    const c = this.capture();
    if (row.trip_id !== c.packet.scope.trip_id || row.deleted_at === null) this.changed();
    const command = taskCommand.parse({
      version: 1,
      operation_id: crypto.randomUUID(),
      scope: c.packet.scope,
      action: 'restore',
      target_id: row.id,
      expected_revision: row.revision,
      expected_collection_revision: null,
      values: {},
    });
    await this.send(c, { version: 1, source_url: c.source, view_layer: c.layer, command }, c.check);
  }
  async reconcile(): Promise<'committed' | 'unknown' | 'none'> {
    const c = this.capture();
    await c.fence();
    if (isEffectivelyOffline())
      throw new FamilyApiError(503, 'task_receipt_offline', 'Reconnect to check the retained task save.');
    const release = await acquireQueueLock(c.owner, 'exclusive', true);
    if (!release) this.changed();
    try {
      await c.fence();
      const rows = await c.owner.db.mutationQueue.toArray();
      c.check();
      const pending = rows.filter((row) => row.url === `/trips/${c.packet.scope.trip_id}/family/tasks/commands`);
      if (!pending.length) return 'none';
      if (pending.length !== 1)
        throw new FamilyApiError(
          409,
          'task_receipt_ambiguous',
          'More than one original task command is retained. Nothing was removed.'
        );
      const row = pending[0],
        p = taskEnvelope.parse(row.body);
      if (
        p.source_url !== c.source ||
        p.command.operation_id !== row.id ||
        p.command.scope.trip_id !== c.packet.scope.trip_id ||
        p.command.scope.user_id !== c.packet.scope.user_id ||
        p.command.scope.family_id !== c.packet.scope.family_id ||
        p.command.scope.person_id !== c.packet.scope.person_id
      )
        this.changed();
      const receipt = await this.transport.receipt(c.packet.scope, row.id);
      await c.fence();
      if (receipt.status === 'unknown' || !receipt.result) return 'unknown'; // Not proof of failure; never allocate a replacement UUID.
      checkTaskAcknowledgement(receipt.result, p.command);
      await acknowledgeTaskIntent(c.owner, p);
      await this.refresh(c, c.check, false);
      return 'committed';
    } finally {
      release();
    }
  }
  private async refresh(c: ReturnType<PlannerCohortTasks['capture']>, check: () => void, sameLifecycle = true) {
    const before = useTripStore.getState().todoItems,
      fresh = await this.transport.list(c.packet.scope);
    await c.fence();
    check();
    if (sameLifecycle && taskJson(fresh.scope) !== taskJson(c.packet.scope)) this.changed();
    const items = fresh.tasks.map((row) => projectTask(row, fresh.scope, fresh.collection_revision, c.ids));
    await c.owner.db.transaction('r!', c.owner.db.mutationQueue, async () => {
      const pending = await c.owner.db.mutationQueue.toArray();
      check();
      if (
        pending.some((r) => r.tripId === c.native || r.url.startsWith(`/trips/${c.packet.scope.trip_id}/`)) ||
        before !== useTripStore.getState().todoItems
      )
        this.changed();
      this.publish(fresh);
      useTripStore.setState({ todoItems: items });
    });
    check();
    return fresh;
  }
  private async send(c: ReturnType<PlannerCohortTasks['capture']>, packet: TaskEnvelope, check: () => void) {
    check();
    await c.fence();
    check();
    if (!this.environment.allowed())
      throw new FamilyApiError(403, 'task_access_denied', 'Task editing is not authorized.');
    const release = await acquireQueueLock(c.owner, 'exclusive', true);
    try {
      check();
      await c.fence();
      check();
      await retainTaskIntent(c.owner, packet, c.native);
      check();
      if (!release || isEffectivelyOffline())
        throw new FamilyApiError(
          503,
          'task_queued',
          'Task save retained locally. Reconnect to confirm it; it has not been shown as saved.'
        );
      try {
        const response = await api.post(taskIntentUrl(packet), packet, {
          headers: { 'X-Idempotency-Key': packet.command.operation_id },
        });
        checkTaskAcknowledgement(response.data, packet.command);
      } catch (error) {
        check();
        await parkTaskRefusal(c.owner, packet, error);
        throw error;
      }
      check();
      await c.fence();
      check();
      await acknowledgeTaskIntent(c.owner, packet);
      check();
      // Fresh canonical list only, under the same exclusive replay lease. No nested shared lock.
      return await this.refresh(c, check);
    } finally {
      release?.();
    }
  }
}
function taskValues(
  data: TodoCreateItemRequest | TodoUpdateItemRequest,
  ids: import('./identity').FamilyIdentityRegistry
) {
  const { assigned_user_id, category, ...rest } = data;
  const values: Record<string, unknown> = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined)
  );
  if ('checked' in values)
    throw new FamilyApiError(400, 'task_completion_separate', 'Use the explicit task completion command.');
  if (category !== undefined) values.category = category ?? '';
  if (assigned_user_id !== undefined)
    values.assigned_person_id = assigned_user_id === null ? null : ids.uuid('person', assigned_user_id);
  return values;
}
