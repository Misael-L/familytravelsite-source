import Dexie from 'dexie';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalTask,
  canonicalTaskScope,
  taskFixtureId as id,
  requireTaskValue as required,
  taskFixtureAt,
} from '../../../tests/helpers/familyTasks';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { invalidateOfflineSession, offlineDb } from '../../db/offlineDb';
import { installPlannerReadPort } from '../../repo/plannerReadPort';
import { todoRepo } from '../../repo/todoRepo';
import { setAuthed } from '../../sync/authGate';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { captureReadSession } from '../../sync/readSession';
import { PlannerReadGuard } from './plannerReadGuard';
import { createPlannerTaskHandler, createPlannerTaskReader } from './plannerTasks';
import { FamilyFrontendRepository, type FamilySession } from './repository';
import { createTaskTransport } from './taskTransport';

const scope = canonicalTaskScope(),
  snapshot = () => ({
    version: 1,
    scope: structuredClone(scope),
    collection_revision: 7,
    tasks: [canonicalTask()],
    trash_count: 1,
  });
let repo: FamilyFrontendRepository, source: string, disposed: boolean;
const session: FamilySession = {
  userId: scope.user_id,
  personId: scope.person_id,
  familyId: scope.family_id,
  user: { username: 'Task fixture', email: 'tasks@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
};
beforeEach(async () => {
  resetAllStores();
  await resetOfflineTestDatabase();
  _resetNetworkMode();
  setAuthed(true);
  source = 'local-source';
  disposed = false;
  repo = new FamilyFrontendRepository(async () => session);
  await repo.session();
});
afterEach(async () => {
  vi.restoreAllMocks();
  _resetNetworkMode();
  setAuthed(false);
  await resetOfflineTestDatabase();
});
const reader = (rpc = vi.fn(async () => snapshot())) => ({
  rpc,
  ...createPlannerTaskReader(
    repo,
    () => disposed,
    () => source,
    createTaskTransport(rpc)
  ),
});
const req = (pathname: string, method = 'GET', signal?: AbortSignal) => ({
  pathname,
  method,
  signal,
  body: undefined,
  query: new URLSearchParams(),
});
function deferred<T>() {
  let resolve!: (x: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('canonical tasks in the native planner reader', () => {
  it('preserves native numeric identity and canonical UUID/revision/scope separately', async () => {
    const ids = (await repo.views()).ids,
      result = await reader().read(scope.trip_id),
      item = result.items[0];
    expect(ids.uuid('todo', item.id)).toBe(id(5));
    expect(ids.uuid('trip', item.trip_id)).toBe(scope.trip_id);
    expect(ids.uuid('person', required(item.assigned_user_id))).toBe(id(6));
    expect(item.created_at).toBe(taskFixtureAt);
    expect(item.updated_at).toBe(taskFixtureAt);
    expect(item.family_task).toEqual({
      version: 1,
      id: id(5),
      trip_id: scope.trip_id,
      revision: 3,
      scope,
      collection_revision: 7,
      assigned_person_id: id(6),
    });
    expect(item).toMatchObject({
      checked: 0,
      category: 'Preparation',
      description: '  Family notes\nline two  ',
      due_date: '2027-04-01',
      reminded_at: null,
    });
    expect(await offlineDb.todoItems.count()).toBe(0);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('accepts a registered native Trip selector', async () => {
    const native = (await repo.views()).ids.register('trip', scope.trip_id);
    expect((await reader().read(native)).items).toHaveLength(1);
  });
  it('rejects an unknown numeric Trip selector without issuing RPC', async () => {
    const r = reader();
    await expect(r.read(999)).rejects.toMatchObject({ code: 'unknown_view_key' });
    expect(r.rpc).not.toHaveBeenCalled();
  });
  it('reads published Trip tasks while the itinerary is My Draft without changing their scope or writing private cache', async () => {
    repo.setLayer(scope.trip_id, 'myDraft');
    const result = await reader().read(scope.trip_id);
    expect(result.packet.scope.layer).toBe('published');
    expect(repo.getLayer(scope.trip_id)).toBe('myDraft');
    expect(await offlineDb.todoItems.count()).toBe(0);
  });
  it('does not use the legacy task reader or a native persistent-cache fallback', async () => {
    const old = vi
      .spyOn(repo.readers.todos, 'listTodoItems')
      .mockRejectedValue(new Error('Legacy task rows must not load'));
    await offlineDb.todoItems.put({
      id: 98,
      trip_id: 99,
      name: 'Stale cache task',
      checked: 0,
      category: null,
      sort_order: 0,
      due_date: null,
      description: null,
      assigned_user_id: null,
      priority: 0,
    });
    const out = await reader().read(scope.trip_id);
    expect(out.items.map((x) => x.name)).toEqual(['Check museum hours']);
    expect(old).not.toHaveBeenCalled();
    expect(await offlineDb.todoItems.count()).toBe(1);
  });
  it('offline reads fail visibly without returning an old task cache', async () => {
    setForcedOffline(true);
    const r = reader();
    await expect(r.read(scope.trip_id)).rejects.toMatchObject({ code: 'task_view_offline' });
    expect(r.rpc).not.toHaveBeenCalled();
  });
  it('refuses pending local intent before reading any canonical task state', async () => {
    const native = (await repo.views()).ids.register('trip', scope.trip_id);
    await offlineDb.mutationQueue.add({
      id: 'pending',
      tripId: native,
      method: 'PUT',
      url: `/trips/${native}/todo/42`,
      body: { name: 'Pending' },
      entityId: 42,
      resource: 'todoItems',
      status: 'pending',
      retryCount: 0,
      timestamp: Date.now(),
      schemaVersion: 1,
    } as never);
    const r = reader();
    await expect(r.read(scope.trip_id)).rejects.toMatchObject({ code: 'task_local_work' });
    expect(r.rpc).not.toHaveBeenCalled();
    expect(await offlineDb.mutationQueue.count()).toBe(1);
  });
  it('stops before the task RPC if cancellation arrives during the inherited queue check', async () => {
    const ids = (await repo.views()).ids;
    const trip = { uuid: scope.trip_id, native: ids.register('trip', scope.trip_id) };
    const guard = new PlannerReadGuard(captureReadSession(), trip, '', () => new Error('Queue changed'));
    const controller = new AbortController();
    vi.spyOn(guard, 'check').mockImplementation(() => {
      controller.abort();
      return Dexie.Promise.resolve();
    });
    const r = reader();

    await expect(r.read(trip.uuid, controller.signal, guard)).rejects.toMatchObject({ name: 'AbortError' });
    expect(r.rpc).not.toHaveBeenCalled();
  });
  for (const change of [
    'source',
    'disposed',
    'actor',
    'family',
    'person',
    'clear',
    'layer',
    'layerABA',
    'logout',
    'privateEpoch',
    'invalidate',
    'abort',
  ] as const)
    it(`fences late success after ${change} before any task identity or cache publication`, async () => {
      const held = deferred<unknown>(),
        started = deferred<void>(),
        rpc = vi.fn(async () => {
          started.resolve();
          return held.promise;
        }),
        ids = (await repo.views()).ids,
        register = vi.spyOn(ids, 'register');
      const r = createPlannerTaskReader(
          repo,
          () => disposed,
          () => source,
          createTaskTransport(rpc)
        ),
        abort = new AbortController(),
        pending = r.read(scope.trip_id, abort.signal),
        rejected = expect(pending).rejects.toBeDefined();
      await started.promise;
      if (change === 'source') source = 'another-source';
      if (change === 'disposed') disposed = true;
      if (change === 'actor') repo.acceptSession({ ...session, userId: id(91) });
      if (change === 'family') repo.acceptSession({ ...session, familyId: id(92) });
      if (change === 'person') repo.acceptSession({ ...session, personId: id(93) });
      if (change === 'clear') repo.clear();
      if (change === 'layer' || change === 'layerABA') {
        repo.setLayer(scope.trip_id, 'myDraft');
        if (change === 'layerABA') repo.setLayer(scope.trip_id, 'published');
      }
      if (change === 'logout') setAuthed(false);
      if (change === 'privateEpoch') invalidateOfflineSession();
      if (change === 'invalidate') repo.invalidate(scope.trip_id);
      if (change === 'abort') abort.abort();
      held.resolve(snapshot());
      await rejected;
      expect(register.mock.calls.filter(([kind]) => kind === 'todo')).toHaveLength(0);
      expect(await offlineDb.todoItems.count()).toBe(0);
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    });
  it('retains an actual backend denial and does not register task view IDs', async () => {
    const failure = { code: '42501', message: 'Task read forbidden' },
      rpc = vi.fn().mockRejectedValue(failure),
      r = createPlannerTaskReader(
        repo,
        () => false,
        () => source,
        createTaskTransport(rpc)
      );
    await expect(r.read(scope.trip_id)).rejects.toMatchObject({ status: 403, code: 'task_access_denied' });
    expect(await offlineDb.todoItems.count()).toBe(0);
  });
  it('refuses a late denial after logout as the retired owner instead of leaking its error', async () => {
    const held = deferred<unknown>(),
      started = deferred<void>(),
      rpc = vi.fn(async () => {
        started.resolve();
        await held.promise;
        throw new Error('Private backend message');
      });
    const r = createPlannerTaskReader(
        repo,
        () => false,
        () => source,
        createTaskTransport(rpc)
      ),
      pending = r.read(scope.trip_id),
      rejected = expect(pending).rejects.toMatchObject({ name: 'ReadSessionChanged' });
    await started.promise;
    setAuthed(false);
    held.resolve(null);
    await rejected;
  });
  it('returns through the actual task GET handler with original scope and Trash count', async () => {
    const r = reader(),
      handle = createPlannerTaskHandler(r),
      result = await handle(req(`/trips/${scope.trip_id}/todo`));
    expect(result).toMatchObject({
      items: [expect.objectContaining({ name: 'Check museum hours' })],
      family_task_scope: scope,
      collection_revision: 7,
      trash_count: 1,
    });
  });
  for (const suffix of ['/category-assignees', '/42', '/'])
    it(`does not fall back to legacy unsupported task suffix ${suffix}`, async () => {
      const r = reader(),
        handle = createPlannerTaskHandler(r);
      await expect(handle(req(`/trips/${scope.trip_id}/todo${suffix}`))).rejects.toMatchObject({
        code: 'task_read_unavailable',
      });
      expect(r.rpc).not.toHaveBeenCalled();
    });
  it('refuses filtering that would conceal the complete observed list', async () => {
    const r = req(`/trips/${scope.trip_id}/todo`);
    r.query.set('checked', '1');
    await expect(createPlannerTaskHandler(reader())(r)).rejects.toMatchObject({ code: 'task_read_unavailable' });
  });
  for (const method of ['POST', 'PUT', 'DELETE'])
    it(`refuses raw native ${method} task authoring`, async () => {
      const r = reader();
      await expect(createPlannerTaskHandler(r)(req(`/trips/${scope.trip_id}/todo`, method))).rejects.toMatchObject({
        code: 'task_writer_not_cut_over',
      });
      expect(r.rpc).not.toHaveBeenCalled();
    });
  it('routes todoRepo.list through the installed read port without cache writes', async () => {
    const items = (await reader().read(scope.trip_id)).items,
      todos = vi.fn(async () => ({ items })),
      stop = installPlannerReadPort({ todos, places: async () => ({ places: [] }), days: async () => ({ days: [] }) });
    try {
      expect(await todoRepo.list(scope.trip_id)).toEqual({ items });
      expect(todos).toHaveBeenCalledWith(scope.trip_id);
      expect(await offlineDb.todoItems.count()).toBe(0);
    } finally {
      stop();
    }
  });
  it('a partial read port cannot fall through to the legacy task repository', async () => {
    const stop = installPlannerReadPort({ places: async () => ({ places: [] }), days: async () => ({ days: [] }) });
    try {
      await expect(todoRepo.list(scope.trip_id)).rejects.toThrow('Canonical task reads are not connected');
    } finally {
      stop();
    }
  });
});
