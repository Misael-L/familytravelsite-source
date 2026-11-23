import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildPackingItem, buildTrip, buildUser } from '../../../tests/helpers/factories';
import { buildPlanner } from '../../../tests/helpers/mobileTrip';
import { cleanup, fireEvent, render, screen, waitFor, within } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { tripsApi } from '../../api/client';
import PackingListPanel from '../../components/Packing/PackingListPanel';
import { useTranslation } from '../../i18n';
import MPackingListTab from '../../mobile/screens/trip/tabs/MPackingListTab';
import {
  installPlannerPackingPort,
  packingGroupActionsAvailable,
  type PackingCategoryAccess,
  type PlannerPackingPort,
} from '../../repo/plannerPackingPort';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('../../components/shared/Toast', () => ({ useToast: () => toast }));
let stop: () => void, access: PackingCategoryAccess | null, canEdit: boolean, port: PlannerPackingPort;
const rename = vi.fn<(name: string) => Promise<void>>(),
  assign = vi.fn<(ids: number[]) => Promise<void>>(),
  raw = vi.fn(async () => {}),
  bind = vi.fn();
beforeEach(() => {
  resetAllStores();
  canEdit = true;
  rename.mockReset().mockResolvedValue();
  assign.mockReset().mockResolvedValue();
  raw.mockClear();
  bind.mockReset();
  toast.error.mockClear();
  const rows = [
    buildPackingItem({ id: 1, category: 'Gear', name: 'Coat' }),
    buildPackingItem({ id: 2, category: 'Gear', name: 'Socks' }),
  ];
  useTripStore.setState({
    trip: buildTrip({ id: 1 }),
    packingItems: rows,
    updatePackingItem: async () => {
      await raw();
      return rows[0];
    },
  });
  useAuthStore.setState({ user: buildUser({ id: 1 }), isAuthenticated: true });
  vi.spyOn(tripsApi, 'getMembers').mockResolvedValue({ owner: null, members: [] } as never);
  access = {
    id: 'category-id',
    name: 'Gear',
    canRename: true,
    canAssign: true,
    assignees: [{ user_id: 9, username: 'Historical traveler', eligible: false }],
  };
  port = {
    bind: vi.fn(),
    packed: raw,
    reorder: raw,
    snapshot: () => null,
    subscribe: () => () => {},
    trashPage: vi.fn(),
    restore: raw,
    reconcile: async () => 'none',
    categoryAccess: () => access,
    categoryMembers: async () => [{ id: 7, username: 'Guest traveler', is_guest: true, eligible: true }],
    bindCategory: (trip, id) => {
      bind(trip, id);
      return { current: () => true, close: vi.fn(), rename, assign };
    },
    observeGroup: () => ({ current: () => true, close: vi.fn(), submit: vi.fn() }),
  };
  stop = installPlannerPackingPort(port);
});
afterEach(() => {
  cleanup();
  stop();
  vi.restoreAllMocks();
});
function Surface({ phone, revision = 0 }: { phone: boolean; revision?: number }) {
  const { t } = useTranslation(),
    items = useTripStore((s) => s.packingItems);
  void revision;
  return phone ? (
    <MPackingListTab planner={buildPlanner({ tripId: 1, packingItems: items, t, toast, can: () => canEdit })} />
  ) : (
    <PackingListPanel tripId={1} items={items} />
  );
}
function edit(phone: boolean) {
  if (phone && screen.queryByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
}
function header() {
  const label = screen.getAllByText('Gear', { exact: true }).find((x) => x.tagName === 'SPAN');
  if (!label?.parentElement) throw Error('Missing native category');
  return label.parentElement;
}
function openRename() {
  fireEvent.click(within(header()).getByRole('button', { name: 'List options' }));
  fireEvent.click(screen.getByText('Rename', { exact: true }));
}
function input() {
  const fields = screen.getAllByRole('textbox').filter((x) => !x.hasAttribute('inputmode'));
  if (fields.length !== 1) throw Error('Expected one native category input');
  return fields[0];
}
function openAssignments(phone: boolean) {
  if (phone) fireEvent.click(screen.getByRole('button', { name: 'Assign members' }));
  else {
    const h = header();
    const button = h.querySelector('svg.lucide-user-plus')?.closest('button');
    if (!button) throw Error('Missing native assignee trigger');
    fireEvent.click(button);
  }
}
for (const phone of [false, true]) {
  const name = phone ? 'phone' : 'desktop';
  it(name + ' native rename binds one category and coalesces Enter/blur while a save is slow', async () => {
    let release: () => void = () => {};
    rename.mockImplementation(
      () =>
        new Promise<void>((r) => {
          release = r;
        })
    );
    render(<Surface phone={phone} />);
    edit(phone);
    openRename();
    const field = input();
    fireEvent.change(field, { target: { value: '  Exact é e\u0301 😀  ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.blur(field);
    await waitFor(() => expect(rename).toHaveBeenCalledExactlyOnceWith('  Exact é e\u0301 😀  '));
    expect(bind).toHaveBeenCalledExactlyOnceWith(1, 'category-id');
    expect(raw).not.toHaveBeenCalled();
    expect(packingGroupActionsAvailable()).toBe(false);
    expect(screen.getByRole('button', { name: 'List options' })).toBeDisabled();
    release();
  });
  it(name + ' assignment offers eligible guests and removal-only historical assignees', async () => {
    render(<Surface phone={phone} />);
    edit(phone);
    openAssignments(phone);
    const guest = await screen.findByRole('button', { name: /Guest traveler/ });
    fireEvent.click(guest);
    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith([7, 9]));
    expect(bind).toHaveBeenCalledExactlyOnceWith(1, 'category-id');
    expect(raw).not.toHaveBeenCalled();
  });
  it(name + ' ambiguous displayed categories keep rename and assignment gated', () => {
    access = null;
    render(<Surface phone={phone} />);
    edit(phone);
    fireEvent.click(within(header()).getByRole('button', { name: 'List options' }));
    expect(screen.queryByText('Rename', { exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Assign members' })).toBeNull();
    expect(bind).not.toHaveBeenCalled();
  });
  it(name + ' own personal category can rename but cannot assign responsibilities', () => {
    if (!access) throw Error('fixture');
    access.canAssign = false;
    render(<Surface phone={phone} />);
    edit(phone);
    openRename();
    expect(input()).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Assign members' })).toBeNull();
  });
  it(name + ' stale rerenders cannot replace an original unresolved rename', async () => {
    rename.mockRejectedValue(new Error('uncertain'));
    const view = render(<Surface phone={phone} />);
    edit(phone);
    openRename();
    fireEvent.change(input(), { target: { value: 'First original' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(rename).toHaveBeenCalledTimes(1));
    view.rerender(<Surface phone={phone} revision={1} />);
    edit(phone);
    if (!screen.queryAllByRole('textbox').some((x) => !x.hasAttribute('inputmode'))) openRename();
    fireEvent.change(input(), { target: { value: 'Changed intent' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(rename).toHaveBeenCalledTimes(1);
    expect(bind).toHaveBeenCalledTimes(1);
  });
  it(name + ' readonly role exposes neither category writer', () => {
    canEdit = false;
    render(<Surface phone={phone} />);
    edit(phone);
    expect(screen.queryByText('Rename', { exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Assign members' })).toBeNull();
    expect(bind).not.toHaveBeenCalled();
  });
  it(name + ' Escape cancels an unused original without saving', () => {
    render(<Surface phone={phone} />);
    edit(phone);
    openRename();
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(rename).not.toHaveBeenCalled();
    expect(raw).not.toHaveBeenCalled();
  });
}
