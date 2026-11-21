import { createClient } from '@supabase/supabase-js';
import 'fake-indexeddb/auto';
import { http, passthrough } from 'msw';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlanner } from '../../../tests/helpers/mobileTrip';
import { server } from '../../../tests/helpers/msw/server';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { installTestLocks } from '../../../tests/helpers/webLocks';
import api from '../../api/client';
import TodoListPanel from '../../components/Todo/TodoListPanel';
import { offlineDb } from '../../db/offlineDb';
import MTaskSheet from '../../mobile/screens/trip/tabs/MTaskSheet';
import { installPlannerTaskPort } from '../../repo/plannerTaskPort';
import { useTripStore } from '../../store/tripStore';
import { setAuthed } from '../../sync/authGate';
import { mutationQueue } from '../../sync/mutationQueue';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { FamilyTaskTrash } from './FamilyTaskTrash';
import { plannerActionAvailable } from './plannerActionAvailability';
import { PlannerCohortTasks } from './plannerCohortTasks';
import { projectTask } from './plannerTasks';
import { FamilyFrontendRepository } from './repository';
import { activateFamilyFrontend } from './runtime';
import { createTaskCommandHandler } from './taskCommandHandler';
import type { TaskList } from './taskContract';
import { createTaskTransport, type TaskRpc } from './taskTransport';
import { createFamilyAxiosAdapter } from './transport';
import { useFamilyUiPermissions } from './uiPermissions';
type Fixture = {
  api: string;
  anon_key: string;
  access_token: string;
  user_id: string;
  person_id: string;
  family_id: string;
  command_trip_id: string;
};
const path = process.env.FAMILY_TASK_WRITER_FIXTURE;
const f: Fixture | null = path ? JSON.parse(readFileSync(path, 'utf8')) : null;
function fixture() {
  if (!f || f.api !== 'http://127.0.0.1:55331') throw new Error('Explicit marked disposable task fixture required');
  return f;
}
let repo: FamilyFrontendRepository,
  tasks: PlannerCohortTasks,
  rpc: TaskRpc,
  list: TaskList,
  native: number,
  restore: () => void,
  adapter: typeof api.defaults.adapter;
async function publish() {
  const ids = (await repo.views()).ids;
  list = await createTaskTransport(rpc).list({
    trip_id: fixture().command_trip_id,
    family_id: fixture().family_id,
    user_id: fixture().user_id,
    person_id: fixture().person_id,
  });
  useTripStore.setState({
    trip: { id: native, title: 'Local task writer', user_id: 0 } as never,
    todoItems: list.tasks.map((row) => projectTask(row, list.scope, list.collection_revision, ids)),
  });
  tasks.publish(list);
}
function row() {
  const item = useTripStore.getState().todoItems[0];
  if (!item) throw new Error('Missing actual task');
  return item;
}
function install() {
  restore = installPlannerTaskPort(tasks);
  activateFamilyFrontend();
  useFamilyUiPermissions.setState({
    controller: {
      gov: { layer: 'published', actionOutcomes: { 'trip.todos.manage': 'direct' } },
      supportsAction: plannerActionAvailable,
      isCurrent: () => true,
    } as never,
  });
}
const suite = describe.runIf(Boolean(path));
suite('native task writing through real disposable Auth MFA and SQL', () => {
  beforeEach(async () => {
    const f = fixture();
    server.use(http.all('http://127.0.0.1:55331/*', () => passthrough()));
    resetAllStores();
    await resetOfflineTestDatabase();
    installTestLocks();
    _resetNetworkMode();
    setAuthed(true);
    const client = createClient(f.api, f.anon_key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${f.access_token}` } },
    });
    rpc = async (name, args) => {
      const out = await client.rpc(name, args);
      if (out.error) throw out.error;
      return out.data;
    };
    repo = new FamilyFrontendRepository(async () => ({
      userId: f.user_id,
      personId: f.person_id,
      familyId: f.family_id,
      user: {
        username: 'Local task writer',
        email: 'writer@fixture.invalid',
        avatar_url: null,
        created_at: '2026-01-01',
      },
    }));
    await repo.session();
    native = (await repo.views()).ids.register('trip', f.command_trip_id);
    tasks = new PlannerCohortTasks(repo, { source: () => f.api, disposed: () => false, allowed: () => true }, rpc);
    adapter = api.defaults.adapter;
    api.defaults.adapter = createFamilyAxiosAdapter(
      createTaskCommandHandler(
        repo,
        () => f.api,
        () => false,
        rpc
      )
    );
    restore = () => {};
    await publish();
  });
  afterEach(async () => {
    cleanup();
    restore();
    api.defaults.adapter = adapter;
    vi.restoreAllMocks();
    _resetNetworkMode();
    setAuthed(false);
    await resetOfflineTestDatabase();
  });
  it('creates deliberate same-name tasks separately with observed real SQL revisions', async () => {
    const name = 'Actual native duplicate ' + crypto.randomUUID();
    const a = await tasks.bind(null).save({ name }),
      b = await tasks.bind(null).save({ name });
    expect(a.id).not.toBe(b.id);
    expect((await createTaskTransport(rpc).list(list.scope)).tasks.filter((t) => t.name === name)).toHaveLength(2);
  });
  it('maps native null category, clears and date-only scheduling through actual SQL', async () => {
    const saved = await tasks
      .bind(row())
      .save({ category: null, description: null, due_date: '2027-04-03', assigned_user_id: null, priority: 3 });
    expect(saved).toMatchObject({
      category: '',
      description: null,
      due_date: '2027-04-03',
      assigned_user_id: null,
      priority: 3,
    });
  });
  it('completes, reorders, trashes and restores the same real task identity', async () => {
    await tasks.completion(native, row(), true);
    expect(row().checked).toBe(1);
    const rows = useTripStore.getState().todoItems;
    await tasks.reorder(native, rows, rows.map((t) => t.id).reverse());
    const target = row().id;
    await tasks.bind(row()).trash();
    const page = await tasks.trashPage(),
      t = page.tasks.find((t) => repo.knownViews()?.ids.register('todo', t.id) === target);
    if (!t) throw new Error('Missing actual tombstone');
    await tasks.restore(t);
    expect(useTripStore.getState().todoItems.some((i) => i.id === target)).toBe(true);
    expect(await offlineDb.todoItems.count()).toBe(0);
  });
  it('actual offline queue replay preserves create identity and SQL rejects no-op duplication', async () => {
    setForcedOffline(true);
    const origin = tasks.bind(null),
      name = 'Real offline ' + crypto.randomUUID();
    await expect(origin.save({ name })).rejects.toMatchObject({ code: 'task_queued' });
    const pending = (await offlineDb.mutationQueue.toArray())[0];
    setForcedOffline(false);
    await mutationQueue.flush();
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    await origin.save({ name });
    expect((await createTaskTransport(rpc).list(list.scope)).tasks.filter((t) => t.name === name)).toHaveLength(1);
    expect((await createTaskTransport(rpc).receipt(list.scope, pending.id)).status).toBe('committed');
  });
  it('a stale real SQL revision is a retained conflict with no native overwrite', async () => {
    const before = useTripStore.getState().todoItems,
      a = tasks.bind(row()),
      b = tasks.bind(row());
    await a.save({ description: 'First real editor' });
    await expect(b.save({ description: 'Stale real editor' })).rejects.toMatchObject({ status: 409 });
    expect((await offlineDb.mutationQueue.toArray())[0].status).toBe('conflict');
    expect(useTripStore.getState().todoItems[0].description).not.toBe('Stale real editor');
    expect(before[0].id).toBe(row().id);
  });
  it('lost real SQL acknowledgement is reconciled by receipt without a replacement command', async () => {
    const execute = rpc;
    let lost = false;
    rpc = async (n, a) => {
      const result = await execute(n, a);
      if (n === 'execute_family_trip_task_v1' && !lost) {
        lost = true;
        throw new Error('Lost local response after commit');
      }
      return result;
    };
    api.defaults.adapter = createFamilyAxiosAdapter(
      createTaskCommandHandler(
        repo,
        () => fixture().api,
        () => false,
        rpc
      )
    );
    const name = 'Real receipt ' + crypto.randomUUID();
    await expect(tasks.bind(null).save({ name })).rejects.toBeDefined();
    expect(await offlineDb.mutationQueue.count()).toBe(1);
    expect(await tasks.reconcile()).toBe('committed');
    expect(await offlineDb.mutationQueue.count()).toBe(0);
    expect(useTripStore.getState().todoItems.filter((t) => t.name === name)).toHaveLength(1);
  });
  it('actual desktop native edit form commits to local SQL', async () => {
    install();
    render(<TodoListPanel tripId={native} items={useTripStore.getState().todoItems} />);
    fireEvent.click(screen.getAllByText(row().name)[0]);
    const input = screen.getByDisplayValue(row().name),
      name = 'Real desktop ' + crypto.randomUUID();
    fireEvent.change(input, { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: /^Save changes$/ }));
    await waitFor(() => expect(useTripStore.getState().todoItems.some((t) => t.name === name)).toBe(true));
    expect((await createTaskTransport(rpc).list(list.scope)).tasks.some((t) => t.name === name)).toBe(true);
  });
  it('actual phone native create sheet commits and returns a canonical SQL row', async () => {
    install();
    const close = vi.fn(),
      planner = buildPlanner({
        tripId: native,
        todoItems: useTripStore.getState().todoItems,
        can: () => true,
        tripActions: useTripStore.getState() as never,
      });
    render(<MTaskSheet planner={planner} open itemId={null} categories={[]} members={[]} onClose={close} />);
    const name = 'Real phone ' + crypto.randomUUID();
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: /Create|todo.detail.create/ }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect((await createTaskTransport(rpc).list(list.scope)).tasks.some((t) => t.name === name)).toBe(true);
  });
  it('actual task Trash control restores local SQL data', async () => {
    install();
    const name = row().name;
    await tasks.bind(row()).trash();
    render(<FamilyTaskTrash />);
    fireEvent.click(screen.getByRole('button', { name: /To-Do.*Trash/ }));
    await screen.findByText(name);
    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0]);
    await waitFor(() => expect(useTripStore.getState().todoItems.some((t) => t.name === name)).toBe(true));
  });
});
