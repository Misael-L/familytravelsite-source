import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import 'fake-indexeddb/auto';
import { http, passthrough } from 'msw';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireTaskValue as taskValue } from '../../../tests/helpers/familyTasks';
import { buildPlanner, buildTripActions } from '../../../tests/helpers/mobileTrip';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import api from '../../api/client';
import TodoListPanel from '../../components/Todo/TodoListPanel';
import { offlineDb } from '../../db/offlineDb';
import type { TripPlanner } from '../../mobile/screens/trip/MTripShell';
import MTodoListTab from '../../mobile/screens/trip/tabs/MTodoListTab';
import { todoRepo } from '../../repo/todoRepo';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { createFamilyPlannerCohort } from './plannerCohort';
import type { NativeTask } from './plannerTasks';
import { FamilyFrontendRepository } from './repository';
import { activateFamilyFrontend } from './runtime';
import type { TaskList } from './taskContract';
import { createTaskTransport } from './taskTransport';
import { createFamilyAxiosAdapter } from './transport';
import { useFamilyUiPermissions } from './uiPermissions';

const path = process.env.FAMILY_TASK_READER_FIXTURE;
const live = path
  ? (JSON.parse(readFileSync(path, 'utf8')) as {
      api: string;
      anon_key: string;
      access_token: string;
      user_id: string;
      person_id: string;
      family_id: string;
      trip_id: string;
      assignee_person_id: string;
      tasks: TaskList;
      trash_id: string;
      command_trip_id: string;
    })
  : null;
if (live && live.api !== 'http://127.0.0.1:55331') throw new Error('Refusing non-disposable task reader endpoint');
let sdk: SupabaseClient, repo: FamilyFrontendRepository, stop: (() => void) | undefined;
const original = api.defaults.adapter;
vi.mock('./legacy/data/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('@family/backend/supabase/client', () => ({ getSupabaseBrowserClient: () => sdk }));
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => live?.api ?? 'http://127.0.0.1:55331' }));
function required() {
  if (!live) throw new Error('Task fixture required');
  return live;
}
function transport() {
  return createTaskTransport(async (name, args) => {
    const { data, error } = await sdk.rpc(name, args);
    if (error) throw error;
    return data;
  });
}
beforeEach(async () => {
  if (!live) return;
  server.use(http.all(live.api + '/*', () => passthrough()));
  resetAllStores();
  await resetOfflineTestDatabase();
  setAuthed(true);
  activateFamilyFrontend();
  sdk = createClient(live.api, live.anon_key, {
    global: { headers: { Authorization: 'Bearer ' + live.access_token } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  repo = new FamilyFrontendRepository(async () => ({
    userId: live.user_id,
    personId: live.person_id,
    familyId: live.family_id,
    user: { username: 'Local task reader', email: 'local@fixture.invalid', avatar_url: null, created_at: '2026-01-01' },
  }));
  await repo.session();
  const cohort = createFamilyPlannerCohort(repo, { source: () => live.api, reportError: () => {} });
  stop = cohort.install();
  api.defaults.adapter = createFamilyAxiosAdapter(cohort.handle);
});
afterEach(async () => {
  cleanup();
  stop?.();
  stop = undefined;
  api.defaults.adapter = original;
  useFamilyUiPermissions.setState({ controller: null });
  setAuthed(false);
  await resetOfflineTestDatabase();
});

describe.skipIf(!live)('real disposable Auth/PostgREST task adapters and native readers', () => {
  it('the actual native repository uses the installed canonical task handler and preserves both repeated-name tasks', async () => {
    const f = required(),
      result = await todoRepo.list(f.trip_id),
      ids = (await repo.views()).ids,
      items = result.items as NativeTask[];
    expect(items).toHaveLength(2);
    expect(new Set(items.map((r) => r.id)).size).toBe(2);
    expect(items.map((r) => r.name)).toEqual(['Check museum hours', 'Check museum hours']);
    expect(items.map((r) => ids.uuid('todo', r.id))).toEqual(f.tasks.tasks.map((r) => r.id));
    expect(items[0]).toMatchObject({
      description: '  Real local task notes\nKeep every line  ',
      due_date: '2027-04-01',
      checked: 0,
      family_task: { revision: 1, scope: f.tasks.scope },
    });
    expect(ids.uuid('person', taskValue(items[0].assigned_user_id))).toBe(f.assignee_person_id);
    expect(items[1].checked).toBe(1);
    expect(await offlineDb.todoItems.count()).toBe(0);
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('the typed real task Trash RPC exposes the retained task without mixing it into the native active list', async () => {
    const f = required(),
      page = await transport().trash(f.tasks.scope);
    expect(page.tasks.map((r) => r.id)).toEqual([f.trash_id]);
    expect(page.tasks[0].description).toBe('Recover me');
    expect(page.next_cursor).toBeNull();
    expect((await todoRepo.list(f.trip_id)).items).toHaveLength(2);
  });
  it('the real receipt RPC retains unknown as unresolved without a replacement command', async () => {
    const f = required(),
      r = await transport().receipt(f.tasks.scope, crypto.randomUUID());
    expect(r.status).toBe('unknown');
    expect(r.result).toBeNull();
  });
  it('a wrong expected Family is rejected by the adapter, not returned as an empty list', async () => {
    const f = required();
    await expect(
      transport().list({
        trip_id: f.trip_id,
        family_id: crypto.randomUUID(),
        user_id: f.user_id,
        person_id: f.person_id,
      })
    ).rejects.toMatchObject({ code: 'invalid_task_response' });
  });
  it('validates real typed command acknowledgements and original retries on a separate synthetic Trip', async () => {
    const f = required(),
      t = transport(),
      identity = { trip_id: f.command_trip_id, family_id: f.family_id, user_id: f.user_id, person_id: f.person_id },
      initial = await t.list(identity);
    const create = {
      version: 1 as const,
      scope: initial.scope,
      action: 'create' as const,
      operation_id: crypto.randomUUID(),
      target_id: crypto.randomUUID(),
      expected_revision: null,
      expected_collection_revision: null,
      values: { name: '  Typed café  ', description: 'Preserve me', due_date: '2027-04-01' },
    };
    const first = await t.execute(create);
    expect(await t.execute(create)).toEqual(first);
    expect((await t.list(identity)).tasks).toHaveLength(initial.tasks.length + 1);
    expect(taskValue(first.task).name).toBe('Typed café');
    const common = {
      version: 1 as const,
      scope: initial.scope,
      target_id: taskValue(first.task).id,
      expected_collection_revision: null,
    };
    const edited = await t.execute({
      ...common,
      action: 'update',
      operation_id: crypto.randomUUID(),
      expected_revision: taskValue(first.task).revision,
      values: { description: null },
    });
    const completed = await t.execute({
      ...common,
      action: 'completion',
      operation_id: crypto.randomUUID(),
      expected_revision: taskValue(edited.task).revision,
      values: { checked: true },
    });
    const trashed = await t.execute({
      ...common,
      action: 'trash',
      operation_id: crypto.randomUUID(),
      expected_revision: taskValue(completed.task).revision,
      values: {},
    });
    expect((await t.list(identity)).tasks).toHaveLength(initial.tasks.length);
    expect((await t.trash(identity)).tasks.map((row) => row.id)).toContain(taskValue(first.task).id);
    const restored = await t.execute({
      ...common,
      action: 'restore',
      operation_id: crypto.randomUUID(),
      expected_revision: taskValue(trashed.task).revision,
      values: {},
    });
    const read = await t.list(identity),
      reordered = await t.execute({
        version: 1,
        scope: initial.scope,
        action: 'reorder',
        operation_id: crypto.randomUUID(),
        target_id: null,
        expected_revision: null,
        expected_collection_revision: read.collection_revision,
        values: { ids: read.tasks.map((row) => row.id) },
      });
    expect(reordered.ordered_ids).toEqual(read.tasks.map((row) => row.id));
    expect((await t.receipt(identity, create.operation_id)).result).toEqual(first);
    expect((await t.list(identity)).tasks.find((row) => row.id === taskValue(first.task).id)).toMatchObject({
      checked: true,
      description: null,
      revision: taskValue(restored.task).revision,
    });
    expect(await offlineDb.mutationQueue.count()).toBe(0);
  });
  it('anonymous local RPC denial remains an explicit access failure', async () => {
    const f = required(),
      anonymous = createClient(f.api, f.anon_key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
    const t = createTaskTransport(async (name, args) => {
      const { data, error } = await anonymous.rpc(name, args);
      if (error) throw error;
      return data;
    });
    await expect(t.list(f.tasks.scope)).rejects.toMatchObject({ status: 403, code: 'task_access_denied' });
  });
  it.each(['desktop', 'phone'] as const)(
    'the actual %s task consumer renders canonical local DB rows with authoring unavailable',
    async (surface) => {
      const f = required(),
        rows = (await todoRepo.list(f.trip_id)).items,
        id = (await repo.views()).ids.register('trip', f.trip_id);
      useTripStore.setState({
        todoItems: rows,
        trip: { id, title: 'Local task reader', user_id: 0, is_owner: 0 } as never,
      });
      if (surface === 'desktop') {
        render(<TodoListPanel tripId={id} items={rows} />);
        await waitFor(() => expect(screen.getAllByText('Check museum hours').length).toBeGreaterThan(0));
        expect(screen.queryByRole('button', { name: /^(New task|Add task|Add item)$/i })).not.toBeInTheDocument();
        fireEvent.click(screen.getAllByText('Check museum hours')[0]);
        await waitFor(() => expect(screen.getByDisplayValue('Check museum hours')).toBeDisabled());
      } else {
        const actions = buildTripActions(),
          planner = buildPlanner({
            tripId: id,
            todoItems: rows,
            can: () => false,
            tripActions: actions as unknown as TripPlanner['tripActions'],
          });
        render(<MTodoListTab planner={planner} />);
        expect(screen.getAllByText('Check museum hours').length).toBeGreaterThan(0);
        const toggles = screen.getAllByRole('button', { name: 'Check museum hours' });
        toggles.forEach((t) => expect(t).toBeDisabled());
        fireEvent.click(toggles[0]);
        expect(actions.toggleTodoItem).not.toHaveBeenCalled();
      }
      expect(await offlineDb.mutationQueue.count()).toBe(0);
    }
  );
  it.each(['create', 'update', 'delete', 'reorder'] as const)(
    'raw native %s remains blocked before an actual database write',
    async (method) => {
      const f = required(),
        rows = (await todoRepo.list(f.trip_id)).items;
      const run =
        method === 'create'
          ? () => todoRepo.create(f.trip_id, { name: 'Not installed' })
          : method === 'update'
            ? () => todoRepo.update(f.trip_id, rows[0].id, { name: 'Not installed' })
            : method === 'delete'
              ? () => todoRepo.delete(f.trip_id, rows[0].id)
              : () => todoRepo.reorder(f.trip_id, rows.map((r) => r.id).reverse());
      await expect(run()).rejects.toThrow('Native planner writes are not cut over');
      expect(await offlineDb.mutationQueue.count()).toBe(0);
      expect((await transport().list(f.tasks.scope)).tasks).toEqual(f.tasks.tasks);
    }
  );
});
