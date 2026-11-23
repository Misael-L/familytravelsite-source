import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  taskFixtureAt as at,
  canonicalTask,
  canonicalTaskScope,
  taskFixtureId as id,
} from '../../../tests/helpers/familyTasks';
import { buildPlanner } from '../../../tests/helpers/mobileTrip';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api from '../../api/client';
import TodoListPanel from '../../components/Todo/TodoListPanel';
import { useTaskForm } from '../../components/Todo/useTaskForm';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import MTaskSheet from '../../mobile/screens/trip/tabs/MTaskSheet';
import { installPlannerTaskPort } from '../../repo/plannerTaskPort';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { WriteSessionChanged } from '../../sync/writeSession';
import { FamilyTaskTrash } from './FamilyTaskTrash';
import { plannerActionAvailable } from './plannerActionAvailability';
import { PlannerCohortTasks } from './plannerCohortTasks';
import { projectTask, type NativeTask } from './plannerTasks';
import { FamilyApiError, FamilyFrontendRepository, type FamilySession } from './repository';
import { activateFamilyFrontend } from './runtime';
import { createTaskCommandHandler } from './taskCommandHandler';
import { trimTaskName, type TaskAck, type TaskCommand, type TaskList, type TaskRow } from './taskContract';
import type { TaskRpc } from './taskTransport';
import { createFamilyAxiosAdapter } from './transport';
import { familyCanDo, useFamilyUiPermissions } from './uiPermissions';
const scope = canonicalTaskScope();
const session: FamilySession = {
  userId: scope.user_id,
  personId: scope.person_id,
  familyId: scope.family_id,
  user: { username: 'Task writer', email: 'task@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
};
let repo: FamilyFrontendRepository,
  tasks: PlannerCohortTasks,
  data: TaskList,
  trash: TaskRow[],
  source: string,
  disposed: boolean,
  allowed: boolean,
  native: number;
let release: (() => void) | undefined, deactivate: (() => void) | undefined, adapter: typeof api.defaults.adapter;
const receipts = new Map<string, { command: string; ack: TaskAck }>();
const rpc = vi.fn<TaskRpc>();
function item() {
  const row = useTripStore.getState().todoItems[0];
  if (!row) throw new Error('Missing task');
  return row as NativeTask;
}
async function publish() {
  const ids = (await repo.views()).ids;
  useTripStore.setState({
    trip: { id: native, title: 'Task writer', user_id: 0 } as never,
    todoItems: data.tasks.map((r) => projectTask(r, data.scope, data.collection_revision, ids)),
  });
  tasks.publish(data);
}
async function dispatch(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'get_family_trip_tasks_v1') return structuredClone(data);
  if (name === 'list_family_trip_task_trash_v1')
    return {
      version: 1,
      scope: structuredClone(data.scope),
      collection_revision: data.collection_revision,
      tasks: structuredClone(trash),
      next_cursor: null,
    };
  if (name === 'get_family_trip_task_receipt_v1') {
    const receipt = receipts.get(String(args.p_operation_id));
    return {
      version: 1,
      trip_id: scope.trip_id,
      operation_id: args.p_operation_id,
      scope: structuredClone(data.scope),
      status: receipt ? 'committed' : 'unknown',
      result: receipt?.ack ?? null,
    };
  }
  if (name !== 'execute_family_trip_task_v1') throw new Error('Unexpected RPC ' + name);
  const c = {
    version: 1,
    scope: args.p_scope,
    operation_id: args.p_operation_id,
    action: args.p_action,
    target_id: args.p_target_id,
    expected_revision: args.p_expected_revision,
    expected_collection_revision: args.p_expected_collection_revision,
    values: args.p_values,
  } as TaskCommand;
  if (!allowed) throw new FamilyApiError(403, 'denied', 'Denied');
  if (c.scope.trip_lifecycle_revision !== data.scope.trip_lifecycle_revision)
    throw new FamilyApiError(409, 'lifecycle', 'Parent changed');
  const prior = receipts.get(c.operation_id);
  if (prior) {
    if (prior.command !== JSON.stringify(c)) throw new FamilyApiError(409, 'changed', 'Changed intent');
    return structuredClone(prior.ack);
  }
  let row: TaskRow | null = null;
  if (c.action === 'create') {
    row = canonicalTask({
      id: c.target_id,
      assigned_person_id: null,
      description: null,
      due_date: null,
      priority: 0,
      category: '',
      ...c.values,
      name: trimTaskName(c.values.name),
      revision: 1,
      sort_order: data.tasks.length,
    });
    data.tasks.push(row);
  } else if (c.action === 'reorder') {
    if (c.expected_collection_revision !== data.collection_revision || c.values.ids.length !== data.tasks.length)
      throw new FamilyApiError(409, 'order', 'Changed order');
    const order = c.values.ids;
    data.tasks = order.map((key, index) => {
      const r = data.tasks.find((t) => t.id === key);
      if (!r) throw new Error('Unknown id');
      return { ...r, sort_order: index, revision: r.revision + 1 };
    });
  } else {
    const rows = c.action === 'restore' ? trash : data.tasks,
      found = rows.find((t) => t.id === c.target_id);
    if (!found || found.revision !== c.expected_revision) throw new FamilyApiError(409, 'stale', 'Changed revision');
    row = { ...found, ...c.values, revision: found.revision + 1 };
    if (c.action === 'trash') {
      data.tasks = data.tasks.filter((t) => t.id !== row?.id);
      row.deleted_at = at;
      row.deleted_by_person_id = scope.person_id;
      trash.push(row);
    } else if (c.action === 'restore') {
      trash = trash.filter((t) => t.id !== row?.id);
      row.deleted_at = null;
      row.deleted_by_person_id = null;
      row.sort_order = Math.max(-1, ...data.tasks.map((r) => r.sort_order)) + 1;
      data.tasks.push(row);
    } else data.tasks = data.tasks.map((t) => (t.id === row?.id ? row : t));
  }
  data.collection_revision++;
  data.trash_count = trash.length;
  const ack: TaskAck = {
    version: 1,
    trip_id: scope.trip_id,
    operation_id: c.operation_id,
    action: c.action,
    target_id: c.target_id,
    scope: structuredClone(scope),
    collection_revision: data.collection_revision,
    task: row,
    ordered_ids: c.action === 'reorder' ? c.values.ids : null,
  };
  receipts.set(c.operation_id, { command: JSON.stringify(c), ack: structuredClone(ack) });
  return ack;
}
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  installTestLocks();
  _resetNetworkMode();
  setAuthed(true);
  receipts.clear();
  rpc.mockReset().mockImplementation(dispatch);
  source = 'http://127.0.0.1:55331';
  disposed = false;
  allowed = true;
  trash = [];
  repo = new FamilyFrontendRepository(async () => session);
  await repo.session();
  native = (await repo.views()).ids.register('trip', scope.trip_id);
  data = {
    version: 1,
    scope: structuredClone(scope),
    collection_revision: 7,
    tasks: [canonicalTask()],
    trash_count: 0,
  };
  tasks = new PlannerCohortTasks(repo, { source: () => source, disposed: () => disposed, allowed: () => allowed }, rpc);
  adapter = api.defaults.adapter;
  api.defaults.adapter = createFamilyAxiosAdapter(
    createTaskCommandHandler(
      repo,
      () => source,
      () => disposed,
      rpc
    )
  );
  await publish();
});
afterEach(async () => {
  cleanup();
  release?.();
  release = undefined;
  deactivate?.();
  deactivate = undefined;
  api.defaults.adapter = adapter;
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
describe('observed native task writer and original-intent replay', () => {
  it('creates from a checked empty list without fabricating scope or a temporary ID', async () => {
    data.tasks = [];
    await publish();
    const name = '  \tNew task\t  ';
    const saved = await tasks.bind(null).save({ name });
    expect(rpc.mock.calls.find(([procedure]) => procedure === 'execute_family_trip_task_v1')?.[1]).toMatchObject({
      p_values: { name },
    });
    expect(saved.id).toBeGreaterThan(0);
    expect((saved as NativeTask).family_task.scope).toEqual(scope);
    expect(saved.name).toBe('\tNew task\t');
    expect(data.tasks).toMatchObject([{ name: '\tNew task\t' }]);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(await offlineDb.todoItems.count()).toBe(0);
  });
  it('allows deliberate same-name tasks as separate creates', async () => {
    await tasks.bind(null).save({ name: 'Same task' });
    await tasks.bind(null).save({ name: 'Same task' });
    expect(data.tasks.filter((r) => r.name === 'Same task')).toHaveLength(2);
    expect(new Set([...receipts.keys()]).size).toBe(2);
  });
  it('maps explicit clears, date-only values and Person identity without modifying catalog data', async () => {
    const ids = (await repo.views()).ids;
    const saved = await tasks.bind(item()).save({
      name: 'Edited',
      category: null,
      description: null,
      due_date: '2027-04-02',
      assigned_user_id: ids.register('person', id(12)),
      priority: 0,
    });
    expect(saved).toMatchObject({
      name: 'Edited',
      category: '',
      description: null,
      due_date: '2027-04-02',
      assigned_user_id: ids.register('person', id(12)),
    });
    expect(data.tasks[0].assigned_person_id).toBe(id(12));
  });
  it('keeps omitted fields, clears assignee and refuses mixed completion/content', async () => {
    const origin = tasks.bind(item());
    await expect(origin.save({ name: 'No', checked: true })).rejects.toBeDefined();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    await origin.save({ assigned_user_id: null });
    expect(item().name).toBe('Check museum hours');
    expect(data.tasks[0].assigned_person_id).toBeNull();
  });
  it('completes explicitly, reorders the full observed set, moves to Trash and restores the same identity', async () => {
    await tasks.bind(null).save({ name: 'Second' });
    const before = item();
    await tasks.completion(native, before, true);
    expect(item().checked).toBe(1);
    const rows = useTripStore.getState().todoItems;
    await tasks.reorder(native, rows, rows.map((r) => r.id).reverse());
    const origin = tasks.bind(item()),
      key = item().family_task.id;
    await origin.trash();
    expect(data.tasks.map((t) => t.id)).not.toContain(key);
    const page = await tasks.trashPage();
    expect(page.tasks[0].id).toBe(key);
    await tasks.restore(page.tasks[0]);
    expect(data.tasks[data.tasks.length - 1]?.id).toBe(key);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('keeps an uncertain create identity and retries the original after a lost acknowledgement', async () => {
    let lose = true;
    rpc.mockImplementation(async (n, a) => {
      const out = await dispatch(n, a);
      if (n === 'execute_family_trip_task_v1' && lose) {
        lose = false;
        throw new Error('Lost response');
      }
      return out;
    });
    const old = useTripStore.getState().todoItems,
      origin = tasks.bind(null);
    await expect(origin.save({ name: 'Only once' })).rejects.toThrow('Lost response');
    expect(useTripStore.getState().todoItems).toBe(old);
    const queued = (await offlineDb.mutationQueue.toArray())[0];
    expect(queued.retentionPolicy).toBe('family-original-v1');
    expect(queued.resource).toBeUndefined();
    await expect(origin.save({ name: 'Changed intent' })).rejects.toMatchObject({ code: 'task_pending_intent' });
    await origin.save({ name: 'Only once' });
    expect(data.tasks.filter((r) => r.name === 'Only once')).toHaveLength(1);
    expect(receipts.size).toBe(1);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('retains an offline command without claiming a save, then actual queue replay sends that original', async () => {
    setForcedOffline(true);
    const before = useTripStore.getState().todoItems,
      origin = tasks.bind(null);
    await expect(origin.save({ name: 'Offline task' })).rejects.toMatchObject({ code: 'task_queued' });
    const queued = structuredClone((await offlineDb.mutationQueue.toArray())[0]);
    expect(queued.tempId).toBeUndefined();
    expect(useTripStore.getState().todoItems).toBe(before);
    expect(rpc).not.toHaveBeenCalled();
    setForcedOffline(false);
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(data.tasks.filter((r) => r.name === 'Offline task')).toHaveLength(1);
    expect(receipts.has(queued.id)).toBe(true);
    expect(await offlineDb.todoItems.count()).toBe(0);
    await origin.save({ name: 'Offline task' });
    expect(data.tasks.filter((r) => r.name === 'Offline task')).toHaveLength(1);
    expect(item().family_task.scope).toEqual(scope);
  });
  it('confirms a lost acknowledgement after parent recovery without replaying its obsolete lifecycle', async () => {
    rpc.mockImplementation(async (n, a) => {
      const out = await dispatch(n, a);
      if (n === 'execute_family_trip_task_v1') throw new Error('Lost response');
      return out;
    });
    await expect(tasks.bind(null).save({ name: 'Committed before recovery' })).rejects.toBeDefined();
    data.scope.trip_lifecycle_revision++;
    expect(await tasks.reconcile()).toBe('committed');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(useTripStore.getState().todoItems.some((r) => r.name === 'Committed before recovery')).toBe(true);
    expect(rpc.mock.calls.filter(([n]) => n === 'execute_family_trip_task_v1')).toHaveLength(1);
  });
  it('an unknown receipt retains the whole original command without claiming failure or issuing another write', async () => {
    setForcedOffline(true);
    await expect(tasks.bind(null).save({ name: 'Unknown command' })).rejects.toBeDefined();
    const before = await offlineDb.mutationQueue.toArray();
    setForcedOffline(false);
    expect(await tasks.reconcile()).toBe('unknown');
    expect(await offlineDb.mutationQueue.toArray()).toEqual(before);
    expect(rpc.mock.calls.some(([n]) => n === 'execute_family_trip_task_v1')).toBe(false);
  });
  it('an account epoch change during retention aborts the original transaction before any queued write', async () => {
    const table = offlineDb.mutationQueue;
    const read: typeof table.toArray = table.toArray.bind(table);
    const post = vi.spyOn(api, 'post');
    const queueRead = vi.spyOn(table, 'toArray').mockImplementationOnce(() =>
      read().then((rows) => {
        invalidateOfflineSession();
        return rows;
      })
    );
    const result = await tasks
      .bind(null)
      .save({ name: 'Retired during retention' })
      .catch((error: unknown) => error);
    expect(post).not.toHaveBeenCalled();
    expect(queueRead).toHaveBeenCalledOnce();
    expect(result).toBeInstanceOf(WriteSessionChanged);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('a task observed while My Draft is selected still uses the published task scope', async () => {
    repo.setLayer(scope.trip_id, 'myDraft');
    await publish();
    await tasks.bind(null).save({ name: 'Published task while viewing draft' });
    expect(item().family_task.scope.layer).toBe('published');
    expect(repo.getLayer(scope.trip_id)).toBe('myDraft');
  });
  it('a missing complete task snapshot cannot borrow lifecycle or list revision zero', async () => {
    const unready = new PlannerCohortTasks(
      repo,
      { source: () => source, disposed: () => false, allowed: () => true },
      rpc
    );
    await expect(unready.bind(null).save({ name: 'Unobserved' })).rejects.toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('does not send or delete an original retained in a newer queue format', async () => {
    setForcedOffline(true);
    const origin = tasks.bind(null);
    await expect(origin.save({ name: 'Future retained task' })).rejects.toBeDefined();
    const row = (await offlineDb.mutationQueue.toArray())[0];
    await offlineDb.mutationQueue.update(row.id, { schemaVersion: 99 });
    setForcedOffline(false);
    await expect(origin.save({ name: 'Future retained task' })).rejects.toMatchObject({ code: 'task_queue_changed' });
    expect(rpc).not.toHaveBeenCalled();
    expect((await offlineDb.mutationQueue.get(row.id))?.schemaVersion).toBe(99);
  });
  it('does not replace a parked original with a second form or a newer revision', async () => {
    setForcedOffline(true);
    await expect(tasks.bind(null).save({ name: 'Original' })).rejects.toBeDefined();
    const before = await offlineDb.mutationQueue.toArray();
    await expect(tasks.bind(null).save({ name: 'Different' })).rejects.toMatchObject({ code: 'task_older_work' });
    expect(await offlineDb.mutationQueue.toArray()).toEqual(before);
  });
  it('parks a stale server observation as conflict and does not optimistically rewrite the native row', async () => {
    const before = useTripStore.getState().todoItems,
      origin = tasks.bind(item());
    data.tasks[0].revision++;
    await expect(origin.save({ name: 'Stale' })).rejects.toMatchObject({ status: 409 });
    expect(useTripStore.getState().todoItems).toBe(before);
    expect((await offlineDb.mutationQueue.toArray())[0].status).toBe('conflict');
  });
  it('retains the original when permission is revoked before queue replay', async () => {
    setForcedOffline(true);
    await expect(tasks.bind(null).save({ name: 'Held' })).rejects.toBeDefined();
    const original = (await offlineDb.mutationQueue.toArray())[0].body;
    allowed = false;
    setForcedOffline(false);
    await mutationQueue.flush();
    const row = (await offlineDb.mutationQueue.toArray())[0];
    expect(row.status).toBe('failed');
    expect(row.body).toEqual(original);
    expect(receipts.size).toBe(0);
  });
  it('refuses invalid or incomplete reorder before retaining anything', async () => {
    await expect(tasks.reorder(native, [item()], [])).rejects.toBeDefined();
    await expect(tasks.reorder(native, [item()], [999])).rejects.toBeDefined();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('refuses a malformed acknowledgement before clearing retained intent', async () => {
    rpc.mockImplementation(async (n, a) => {
      const out = await dispatch(n, a);
      return n === 'execute_family_trip_task_v1' ? { ...(out as object), operation_id: id(99) } : out;
    });
    const before = useTripStore.getState().todoItems;
    await expect(tasks.bind(null).save({ name: 'Malformed acknowledgement' })).rejects.toBeDefined();
    expect(await offlineDb.mutationQueue.count()).toBe(1);
    expect(useTripStore.getState().todoItems).toBe(before);
  });
  it('does not borrow a later snapshot for a stale form', async () => {
    const origin = tasks.bind(item());
    data.tasks[0].revision++;
    await publish();
    await expect(origin.save({ name: 'Old form' })).rejects.toMatchObject({ status: 409 });
    expect(data.tasks[0].name).toBe('Check museum hours');
  });
  it.each([
    'closed',
    'source',
    'disposed',
    'actor',
    'family',
    'person',
    'layerABA',
    'logout',
    'privateEpoch',
    'reset',
  ] as const)('refuses %s form work before queue/network effects', async (change) => {
    const origin = tasks.bind(item());
    if (change === 'closed') origin.close();
    if (change === 'source') source = 'other';
    if (change === 'disposed') disposed = true;
    if (change === 'actor') repo.acceptSession({ ...session, userId: id(90) });
    if (change === 'family') repo.acceptSession({ ...session, familyId: id(91) });
    if (change === 'person') repo.acceptSession({ ...session, personId: id(92) });
    if (change === 'layerABA') {
      repo.setLayer(scope.trip_id, 'myDraft');
      repo.setLayer(scope.trip_id, 'published');
    }
    if (change === 'logout') setAuthed(false);
    if (change === 'privateEpoch') invalidateOfflineSession();
    if (change === 'reset') tasks.reset();
    await expect(origin.save({ name: 'Retired' })).rejects.toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('rechecks the original source after an issued command without publishing into its successor', async () => {
    const old = useTripStore.getState().todoItems;
    rpc.mockImplementation(async (n, a) => {
      const out = await dispatch(n, a);
      if (n === 'execute_family_trip_task_v1') source = 'other-source';
      return out;
    });
    await expect(tasks.bind(null).save({ name: 'May commit' })).rejects.toBeDefined();
    expect(useTripStore.getState().todoItems).toBe(old);
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });
  it('rejects altered replay headers, source, actor and unknown versions before executing', async () => {
    const h = createTaskCommandHandler(
        repo,
        () => source,
        () => disposed,
        rpc
      ),
      command = {
        version: 1,
        operation_id: crypto.randomUUID(),
        scope,
        action: 'create',
        target_id: crypto.randomUUID(),
        expected_revision: null,
        expected_collection_revision: null,
        values: { name: 'No' },
      };
    const base = {
      method: 'POST',
      pathname: `/trips/${scope.trip_id}/family/tasks/commands`,
      query: new URLSearchParams(),
      body: { version: 1, source_url: source, view_layer: 'published', command },
      headers: { 'x-idempotency-key': command.operation_id },
    };
    for (const request of [
      { ...base, headers: {} },
      { ...base, body: { ...base.body, version: 2 } },
      { ...base, body: { ...base.body, source_url: 'other' } },
      { ...base, body: { ...base.body, command: { ...command, scope: { ...scope, user_id: id(90) } } } },
    ])
      await expect(h(request)).rejects.toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('direct task authorization is independent from packing and never grants propose or draft task writes', () => {
    release = installPlannerTaskPort(tasks);
    const controller = {
      gov: {
        layer: 'myDraft',
        canMutate: false,
        actionOutcomes: { 'trip.todos.manage': 'direct', 'trip.packing.manage': 'deny' },
      },
      supportsAction: plannerActionAvailable,
      isCurrent: () => true,
    } as never;
    expect(familyCanDo('todo_edit', controller)).toBe(true);
    expect(familyCanDo('packing_edit', controller)).toBe(false);
    for (const mode of ['deny', 'propose', 'draft'])
      expect(
        familyCanDo('todo_edit', {
          ...(controller as object),
          gov: { layer: 'myDraft', canMutate: true, actionOutcomes: { 'trip.todos.manage': mode } },
        } as never)
      ).toBe(false);
  });
  it('denies task changes before local or network effects when only packing may be edited', async () => {
    allowed = false;
    await expect(tasks.bind(null).save({ name: 'Forbidden' })).rejects.toMatchObject({ status: 403 });
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('the native form keeps a dirty field and its old observation across a newer row publication', async () => {
    release = installPlannerTaskPort(tasks);
    const hook = renderHook(({ row }) => useTaskForm(row), { initialProps: { row: item() } });
    act(() => hook.result.current.setName('Dirty edit'));
    data.tasks[0].revision++;
    await publish();
    hook.rerender({ row: item() });
    act(() => hook.result.current.load(item()));
    expect(hook.result.current.name).toBe('Dirty edit');
    await expect(hook.result.current.taskOrigin?.save({ name: hook.result.current.name })).rejects.toMatchObject({
      status: 409,
    });
  });
  it('closed/unmounted native form origins cannot be used by a later callback', async () => {
    release = installPlannerTaskPort(tasks);
    const hook = renderHook(() => useTaskForm(item())),
      origin = hook.result.current.taskOrigin;
    hook.unmount();
    await expect(origin?.save({ name: 'Unmounted' })).rejects.toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('the actual desktop native detail form saves through the observed port', async () => {
    release = installPlannerTaskPort(tasks);
    activateFamilyFrontend();
    useFamilyUiPermissions.setState({
      controller: {
        gov: { layer: 'published', actionOutcomes: { 'trip.todos.manage': 'direct' } },
        supportsAction: plannerActionAvailable,
        isCurrent: () => true,
      } as never,
    });
    render(<TodoListPanel tripId={native} items={useTripStore.getState().todoItems} />);
    fireEvent.click(screen.getAllByText('Check museum hours')[0]);
    const name = await screen.findByDisplayValue('Check museum hours');
    fireEvent.change(name, { target: { value: 'Native detail saved' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save(?: changes)?$|^todo.detail.save$/ }));
    await waitFor(() => expect(data.tasks[0].name).toBe('Native detail saved'));
    await waitFor(() => expect(useTripStore.getState().todoItems[0].name).toBe('Native detail saved'));
  });
  it('the actual phone native sheet saves through the observed port', async () => {
    release = installPlannerTaskPort(tasks);
    const planner = buildPlanner({
      tripId: native,
      todoItems: useTripStore.getState().todoItems,
      can: () => true,
      tripActions: useTripStore.getState() as never,
    });
    const close = vi.fn();
    render(<MTaskSheet planner={planner} open itemId={item().id} categories={[]} members={[]} onClose={close} />);
    const input = screen.getByDisplayValue('Check museum hours');
    fireEvent.change(input, { target: { value: 'Phone saved' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save(?: changes)?$|^todo.detail.save$/ }));
    await waitFor(() => expect(data.tasks[0].name).toBe('Phone saved'));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
  it('task Trash lists and restores through the actual recovery control', async () => {
    release = installPlannerTaskPort(tasks);
    activateFamilyFrontend();
    useFamilyUiPermissions.setState({
      controller: {
        gov: { layer: 'published', actionOutcomes: { 'trip.todos.manage': 'direct' } },
        supportsAction: plannerActionAvailable,
        isCurrent: () => true,
      } as never,
    });
    await tasks.bind(item()).trash();
    render(<FamilyTaskTrash />);
    fireEvent.click(screen.getByRole('button', { name: /To-Do.*Trash/ }));
    await screen.findByText('Check museum hours');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(data.tasks).toHaveLength(1));
    await waitFor(() => expect(useTripStore.getState().todoItems).toHaveLength(1));
  });
  it('U03-D12 the actual phone sheet retains its draft across a deliberate observation reset and requires explicit reopen', async () => {
    release = installPlannerTaskPort(tasks);
    const toast = buildPlanner().toast;
    const planner = () =>
      buildPlanner({
        toast,
        tripId: native,
        todoItems: useTripStore.getState().todoItems,
        can: () => true,
        tripActions: useTripStore.getState() as never,
      });
    const close = vi.fn();
    const sheet = render(
      <MTaskSheet planner={planner()} open itemId={null} categories={[]} members={[]} onClose={close} />
    );
    const input = screen.getByPlaceholderText('todo.namePlaceholder');
    fireEvent.change(input, { target: { value: 'Keep my second task' } });
    tasks.reset();
    await publish();
    sheet.rerender(<MTaskSheet planner={planner()} open itemId={null} categories={[]} members={[]} onClose={close} />);
    expect(screen.getByPlaceholderText('todo.namePlaceholder')).toBe(input);
    expect(input).toHaveValue('Keep my second task');
    fireEvent.click(screen.getByRole('button', { name: 'todo.detail.create' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(close).not.toHaveBeenCalled();
    expect(input).toHaveValue('Keep my second task');
    expect(rpc).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    sheet.rerender(
      <MTaskSheet planner={planner()} open={false} itemId={null} categories={[]} members={[]} onClose={close} />
    );
    sheet.rerender(<MTaskSheet planner={planner()} open itemId={null} categories={[]} members={[]} onClose={close} />);
    expect(screen.getByPlaceholderText('todo.namePlaceholder')).toHaveValue('');
    fireEvent.change(screen.getByPlaceholderText('todo.namePlaceholder'), {
      target: { value: 'Explicit new observation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'todo.detail.create' }));
    await waitFor(() => expect(data.tasks.some((row) => row.name === 'Explicit new observation')).toBe(true));
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
});
