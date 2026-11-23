import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildTrip, buildUser } from '../../../tests/helpers/factories';
import { canonicalPackingRow, packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import { categoryV2, snapshotV2 } from '../../../tests/helpers/familyPackingCategoryV2';
import { buildPlanner } from '../../../tests/helpers/mobileTrip';
import { cleanup, fireEvent, render, screen, waitFor, within } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { tripsApi } from '../../api/client';
import PackingListPanel from '../../components/Packing/PackingListPanel';
import { installReadOnlySession } from '../../db/readOnlySession';
import { useTranslation } from '../../i18n';
import MPackingListTab from '../../mobile/screens/trip/tabs/MPackingListTab';
import { installPlannerPackingPort, type PlannerPackingPort } from '../../repo/plannerPackingPort';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import { FamilyIdentityRegistry } from './identity';
import { projectPacking } from './plannerPacking';
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('../../components/shared/Toast', () => ({ useToast: () => toast }));
let stop: () => void, releaseRead: (() => void) | undefined, port: PlannerPackingPort;
let packet = snapshotV2();
const order = vi.fn(async (_keys: string[]) => {}),
  boundOrder = vi.fn(),
  batch = vi.fn(async () => {});
const fill = vi.fn(async (_name: string) => {}),
  dismiss = vi.fn(async (_value: unknown) => {}),
  raw = vi.fn();
beforeEach(() => {
  resetAllStores();
  packet = snapshotV2();
  fill.mockClear();
  dismiss.mockClear();
  raw.mockClear();
  packet.categories = [categoryV2({ name: '' }), categoryV2({ id: id(21), name: 'Other', sort_order: 1 })];
  const projected = projectPacking(packet.packing, new FamilyIdentityRegistry(packet.scope.user_id), [], packet);
  useTripStore.setState({
    trip: buildTrip({ id: 1 }),
    packingItems: projected.items,
    addPackingItem: raw,
    updatePackingItem: raw,
    deletePackingItem: raw,
  });
  useAuthStore.setState({ user: buildUser({ id: 1 }), isAuthenticated: true });
  vi.spyOn(tripsApi, 'getMembers').mockResolvedValue({ owner: null, members: [] } as never);
  port = {
    bind: raw,
    packed: raw,
    reorder: raw,
    snapshot: () => ({ ...projected, unassigned_weight_grams: 0 }),
    subscribe: () => () => {},
    trashPage: raw,
    restore: raw,
    reconcile: async () => 'none',
    categoryIdentityMode: () => true,
    categoryGroupAvailable: (_trip, key, action) => key === 'packing-category:' + id(20) && action === 'trash',
    observeGroup: raw,
    observeIdentityCategory: (_trip, key) => {
      void dismiss(key);
      return {
        current: () => true,
        close: vi.fn(),
        submit: async (intent) => {
          await dismiss(intent);
        },
      };
    },
    bindCategoryItem: (_trip, key) => {
      void fill(key);
      return { current: () => true, close: vi.fn(), save: fill };
    },
    categoryAccess: (_trip, s) => {
      const c = packet.categories.find((c) => 'packing-category:' + c.id === s.label);
      return c ? { id: c.id, name: c.name, canRename: true, canAssign: false, assignees: [] } : null;
    },
    bindCategory: () => ({ current: () => true, close: vi.fn(), rename: raw, assign: raw }),
  };
  // useSyncExternalStore requires one stable canonical publication.
  const view = port.snapshot();
  port.snapshot = () => view;
  stop = installPlannerPackingPort(port);
});
afterEach(() => {
  cleanup();
  stop();
  releaseRead?.();
  releaseRead = undefined;
  vi.restoreAllMocks();
});
function Surface({ phone }: { phone: boolean }) {
  const { t } = useTranslation(),
    items = useTripStore((s) => s.packingItems);
  return phone ? (
    <MPackingListTab planner={buildPlanner({ tripId: 1, packingItems: items, t, toast, can: () => true })} />
  ) : (
    <PackingListPanel tripId={1} items={items} />
  );
}
function edit(phone: boolean) {
  if (phone && screen.queryByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
}

beforeEach(() => {
  packet.categories = [categoryV2({ name: 'Gear' }), categoryV2({ id: id(21), name: 'Other', sort_order: 1 })];
  packet.packing.items = [
    canonicalPackingRow({
      id: id(30),
      name: 'Real coat',
      category: 'Gear',
      is_private: false,
      owner_person_id: null,
      bag_id: null,
      recipient_person_ids: [],
      contributor_person_ids: [],
    }),
  ];
  packet.item_categories = [{ item_id: id(30), category_id: id(20) }];
  const projected = projectPacking(packet.packing, new FamilyIdentityRegistry(packet.scope.user_id), [], packet),
    stable = { ...projected, unassigned_weight_grams: 0 };
  port.snapshot = () => stable;
  useTripStore.setState({ packingItems: projected.items });
  port.categoryAggregateMode = () => true;
  port.categoryGroupAvailable = () => true;
  port.observeCategoryOrder = (_trip, view, keys) => {
    boundOrder(view, keys);
    return { current: () => true, close: vi.fn(), save: order };
  };
  port.observeIdentityCategory = (_trip, key, selector, rows) => {
    (dismiss as (...args: unknown[]) => unknown)(key, selector, rows);
    return { current: () => true, close: vi.fn(), submit: batch };
  };
  order.mockClear();
  boundOrder.mockClear();
  batch.mockClear();
  dismiss.mockClear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
function group(label = 'Gear') {
  const title = screen.getAllByText(label, { exact: true }).find((x) => x.tagName === 'SPAN');
  if (!title?.parentElement) throw Error('Native group missing');
  return title.parentElement;
}
for (const phone of [false, true]) {
  const surface = phone ? 'phone' : 'desktop';
  it(surface + ' native nonempty Delete List confirms and sends one owned batch, no raw item loop', async () => {
    render(<Surface phone={phone} />);
    edit(phone);
    fireEvent.click(within(group()).getByRole('button', { name: 'List options' }));
    expect(dismiss.mock.calls[0][0]).toBe('packing-category:' + id(20));
    expect((dismiss.mock.calls as unknown[][])[0][2]).toHaveLength(1);
    fireEvent.click(screen.getByText('Delete List', { exact: true }));
    if (phone) {
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('Gear');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    } else expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Gear'));
    await waitFor(() => expect(batch).toHaveBeenCalledExactlyOnceWith({ action: 'group-trash', values: {} }));
    expect(raw).not.toHaveBeenCalled();
  });
  it(surface + ' filtered list does not offer aggregate deletion of unseen items', async () => {
    render(<Surface phone={phone} />);
    edit(phone);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(within(group()).getByRole('button', { name: 'List options' }));
    expect(screen.queryByText('Delete List', { exact: true })).toBeNull();
    expect(batch).not.toHaveBeenCalled();
  });
  it(surface + ' saved lease refuses all aggregate authoring', () => {
    releaseRead = installReadOnlySession();
    render(<Surface phone={phone} />);
    edit(phone);
    expect(screen.queryByRole('button', { name: 'Drag to reorder the category' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'List options' })).toBeNull();
    expect(order).not.toHaveBeenCalled();
  });
}
it('desktop drag retains category UUIDs, complete empty cards and the original lane', async () => {
  render(<Surface phone={false} />);
  const grips = screen.getAllByRole('button', { name: 'Drag to reorder the category' }),
    data = new Map<string, string>();
  const transfer = {
    setData: (k: string, v: string) => data.set(k, v),
    getData: (k: string) => data.get(k) ?? '',
    types: ['application/x-trek-packing-category'],
  };
  fireEvent.dragStart(grips[1], { dataTransfer: transfer });
  expect(boundOrder).toHaveBeenCalledWith('common', ['packing-category:' + id(20), 'packing-category:' + id(21)]);
  expect(data.get('application/x-trek-packing-category')).toBe('packing-category:' + id(21));
  fireEvent.drop(grips[0], { dataTransfer: transfer });
  await waitFor(() => expect(order).toHaveBeenCalledWith(['packing-category:' + id(21), 'packing-category:' + id(20)]));
  expect(raw).not.toHaveBeenCalled();
});
it('desktop filtered and alphabetic views have no category reorder handles', () => {
  render(<Surface phone={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  expect(screen.queryByRole('button', { name: 'Drag to reorder the category' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  fireEvent.click(screen.getByRole('button', { name: 'A to Z' }));
  expect(screen.queryByRole('button', { name: 'Drag to reorder the category' })).toBeNull();
});
it('phone preserves native absence of category dragging while rendering the saved lane', () => {
  render(<Surface phone={true} />);
  edit(true);
  expect(screen.queryByRole('button', { name: 'Drag to reorder the category' })).toBeNull();
  expect(screen.getByText('Real coat')).toBeVisible();
});
it('a desktop drag callback cannot survive switching to the personal view', () => {
  render(<Surface phone={false} />);
  const grips = screen.getAllByRole('button', { name: 'Drag to reorder the category' }),
    data = new Map<string, string>(),
    transfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
      types: ['application/x-trek-packing-category'],
    };
  fireEvent.dragStart(grips[1], { dataTransfer: transfer });
  fireEvent.click(screen.getByRole('button', { name: /My list/ }));
  fireEvent.drop(grips[0], { dataTransfer: transfer });
  expect(order).not.toHaveBeenCalled();
});
