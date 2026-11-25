import { http, HttpResponse } from 'msw';
import { lazy, type ComponentProps, type ComponentType } from 'react';
import { buildTrip, buildUser } from '../../../tests/helpers/factories';
import { server } from '../../../tests/helpers/msw/server';
import { act, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores, seedStore } from '../../../tests/helpers/store';
import TodoListPanel from '../../components/Todo/TodoListPanel';
import { useAuthStore } from '../../store/authStore';
import { usePermissionsStore } from '../../store/permissionsStore';
import { useTripStore } from '../../store/tripStore';
import { ListsContainer } from './ListsContainer';

const delayed = vi.hoisted(() => ({
  Panel: null as ComponentType<ComponentProps<typeof TodoListPanel>> | null,
  release: () => {},
}));
vi.mock('./plannerLazy', () => ({
  PackingListPanel: () => <div>Packing fixture</div>,
  TodoListPanel: (props: ComponentProps<typeof TodoListPanel>) => {
    const Panel = delayed.Panel;
    if (!Panel) throw new Error('Delayed native panel was not configured');
    return <Panel {...props} />;
  },
}));
beforeEach(() => {
  resetAllStores();
  sessionStorage.clear();
  Object.defineProperty(window, 'innerWidth', { value: 1440, writable: true, configurable: true });
  seedStore(useAuthStore, { user: buildUser({ id: 9, role: 'admin' }), isAuthenticated: true });
  seedStore(useTripStore, { trip: buildTrip({ id: 31, user_id: 9 }) });
  server.use(
    http.get('/api/trips/:id/members', () => HttpResponse.json({ owner: null, members: [], current_user_id: 9 }))
  );
  delayed.Panel = lazy(
    () =>
      new Promise<{ default: typeof TodoListPanel }>((resolve) => {
        delayed.release = () => resolve({ default: TodoListPanel });
      })
  );
});
function lists(tripId = 31) {
  return <ListsContainer tripId={tripId} packingItems={[]} todoItems={[]} />;
}
function requestBeforeLoad() {
  fireEvent.click(screen.getByRole('button', { name: /To-Do/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Add new task' }));
  expect(screen.queryByPlaceholderText('Task name')).not.toBeInTheDocument();
}
async function finishLoad() {
  await act(async () => delayed.release());
}
async function closeForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByPlaceholderText('Task name')).not.toBeInTheDocument());
}
describe('actual native task request across a delayed panel mount', () => {
  it('opens the requested form when the To-Do chunk becomes ready', async () => {
    render(lists());
    requestBeforeLoad();
    await finishLoad();
    expect(await screen.findByPlaceholderText('Task name')).toBeVisible();
  });
  it('consumes the request so returning to the tab does not reopen a closed form', async () => {
    render(lists());
    requestBeforeLoad();
    await finishLoad();
    await screen.findByPlaceholderText('Task name');
    await closeForm();
    fireEvent.click(screen.getByRole('button', { name: /Packing List/ }));
    fireEvent.click(screen.getByRole('button', { name: /To-Do/ }));
    await screen.findByText('No tasks yet. Add a task to get started!');
    expect(screen.queryByPlaceholderText('Task name')).not.toBeInTheDocument();
  });
  it('allows another deliberate request after the first was consumed', async () => {
    render(lists());
    requestBeforeLoad();
    await finishLoad();
    await screen.findByPlaceholderText('Task name');
    await closeForm();
    fireEvent.click(screen.getByRole('button', { name: 'Add new task' }));
    expect(await screen.findByPlaceholderText('Task name')).toBeVisible();
  });
  it('does not open an old Trip request on a successor Trip', async () => {
    const view = render(lists());
    requestBeforeLoad();
    seedStore(useTripStore, { trip: buildTrip({ id: 32, user_id: 9 }) });
    view.rerender(lists(32));
    await finishLoad();
    await screen.findByText('No tasks yet. Add a task to get started!');
    expect(screen.queryByPlaceholderText('Task name')).not.toBeInTheDocument();
  });
  it('does not revive an unconsumed request after a Trip A-to-B-to-A switch', async () => {
    const view = render(lists());
    requestBeforeLoad();
    seedStore(useTripStore, { trip: buildTrip({ id: 32, user_id: 9 }) });
    view.rerender(lists(32));
    seedStore(useTripStore, { trip: buildTrip({ id: 31, user_id: 9 }) });
    view.rerender(lists(31));
    await finishLoad();
    await screen.findByText('No tasks yet. Add a task to get started!');
    expect(screen.queryByPlaceholderText('Task name')).not.toBeInTheDocument();
  });

  it('does not defer a withdrawn permission into a later permission grant', async () => {
    render(lists());
    requestBeforeLoad();
    act(() => {
      seedStore(useAuthStore, { user: buildUser({ id: 9, role: 'user' }) });
      seedStore(useTripStore, { trip: buildTrip({ id: 31, user_id: 1 }) });
      seedStore(usePermissionsStore, { permissions: { packing_edit: 'admin' } });
    });
    expect(screen.queryByRole('button', { name: 'Add new task' })).not.toBeInTheDocument();
    await finishLoad();
    await screen.findByText('No tasks yet. Add a task to get started!');
    act(() => {
      seedStore(useAuthStore, { user: buildUser({ id: 9, role: 'admin' }) });
    });
    expect(screen.queryByPlaceholderText('Task name')).not.toBeInTheDocument();
  });
});
