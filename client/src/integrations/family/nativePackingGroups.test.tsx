import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildPackingItem, buildTrip, buildUser } from '../../../tests/helpers/factories';
import { buildPlanner } from '../../../tests/helpers/mobileTrip';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { tripsApi } from '../../api/client';
import PackingListPanel from '../../components/Packing/PackingListPanel';
import { createPackingGroupActions } from '../../components/Packing/usePackingGroupActions';
import { invalidateOfflineSession } from '../../db/offlineDb';
import { useTranslation } from '../../i18n';
import MPackingListTab from '../../mobile/screens/trip/tabs/MPackingListTab';
import {
  installPlannerPackingPort,
  packingActionAvailable,
  packingGroupActionsAvailable,
  type PackingGroupIntent,
  type PackingGroupSelection,
  type PlannerPackingPort,
} from '../../repo/plannerPackingPort';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import type { PackingItem } from '../../types';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock('../../components/shared/Toast', () => ({ useToast: () => toast }));
let rows: PackingItem[], stop: () => void, canEdit: boolean;
const submit = vi.fn<(intent: PackingGroupIntent) => Promise<void>>();
const observed: { selector: PackingGroupSelection; rows: PackingItem[]; close: ReturnType<typeof vi.fn> }[] = [];
const raw = vi.fn(async () => {});
let port: PlannerPackingPort;
beforeEach(() => {
  resetAllStores();
  canEdit = true;
  observed.length = 0;
  submit.mockReset().mockResolvedValue();
  raw.mockClear();
  toast.error.mockClear();
  rows = [
    buildPackingItem({ id: 1, name: 'Partial socks', category: '', quantity: 4, packed_quantity: 2 }),
    buildPackingItem({ id: 2, name: 'Packed coat', category: 'Other', checked: 1 }),
    buildPackingItem({ id: 3, name: 'Open charger', category: 'Gear' }),
    buildPackingItem({ id: 4, name: 'Private diary', category: 'Other', is_private: 1, checked: 1 }),
  ];
  useTripStore.setState({ trip: buildTrip({ id: 1 }), packingItems: rows, togglePackingItem: raw });
  useAuthStore.setState({ user: buildUser({ id: 1 }), isAuthenticated: true });
  vi.spyOn(tripsApi, 'getMembers').mockResolvedValue({ owner: null, members: [] } as never);
  port = {
    observeGroup: (trip, selector, members) => {
      expect(trip).toBe(1);
      const close = vi.fn();
      observed.push({ selector: structuredClone(selector), rows: structuredClone(members), close });
      return { current: () => !close.mock.calls.length, close, submit };
    },
    bind: () => ({ current: () => true, close: vi.fn(), save: vi.fn(), trash: vi.fn() }),
    packed: raw,
    reorder: raw,
    snapshot: () => null,
    subscribe: () => () => {},
    trashPage: vi.fn(),
    restore: raw,
    reconcile: async () => 'none',
  };
  stop = installPlannerPackingPort(port);
});
afterEach(() => {
  cleanup();
  stop();
  vi.restoreAllMocks();
});

function Surface({ phone, revision = 0 }: { phone: boolean; revision?: number }) {
  const { t } = useTranslation();
  const items = useTripStore((s) => s.packingItems);
  const planner = buildPlanner({ tripId: 1, packingItems: items, t, toast, can: () => canEdit });
  void revision;
  return phone ? <MPackingListTab planner={planner} /> : <PackingListPanel tripId={1} items={items} />;
}
function editPhone(phone: boolean) {
  if (phone && screen.queryByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
}
function category(label = 'Other') {
  const title = screen.getAllByText(label, { exact: true }).find((el) => el.tagName === 'SPAN');
  if (!title?.parentElement) throw Error('Native category title missing');
  return title.parentElement;
}
function menu() {
  fireEvent.click(within(category()).getByRole('button', { name: 'List options' }));
}
function choose(label: string) {
  fireEvent.click(screen.getByText(label, { exact: true }));
}
async function confirmPhone(phone: boolean) {
  if (phone) {
    const d = await screen.findByRole('dialog');
    fireEvent.click(within(d).getByRole('button', { name: 'Delete' }));
  }
}
for (const phone of [false, true]) {
  const surface = phone ? 'phone' : 'desktop';
  it.each([
    ['Check All', { action: 'group-packed-state', values: { checked: true } }],
    ['Uncheck All', { action: 'group-packed-state', values: { checked: false } }],
    ['Delete List', { action: 'group-trash', values: {} }],
  ] as const)(surface + ' native %s submits the complete observed raw-label collision once', async (label, intent) => {
    render(<Surface phone={phone} />);
    editPhone(phone);
    menu();
    expect(observed).toHaveLength(1);
    expect(observed[0].selector).toEqual({ view: 'common', status: 'all', categories: ['', 'Other'] });
    expect(observed[0].rows.map((r) => r.id)).toEqual([1, 2]);
    expect(screen.queryByText('Rename', { exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: /Assign members/i })).toBeNull();
    choose(label);
    if (intent.action === 'group-trash') await confirmPhone(phone);
    await waitFor(() => expect(submit).toHaveBeenCalledExactlyOnceWith(intent));
    expect(raw).not.toHaveBeenCalled();
    expect(packingGroupActionsAvailable()).toBe(false);
  });
  it(
    surface + ' selects the displayed open group, including partial counts, without private or done rows',
    async () => {
      render(<Surface phone={phone} />);
      editPhone(phone);
      choose('Open');
      menu();
      choose('Check All');
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
      expect(observed[0].selector.status).toBe('open');
      expect(observed[0].rows.map((r) => [r.id, r.packed_quantity])).toEqual([[1, 2]]);
      expect(raw).not.toHaveBeenCalled();
    }
  );
  it(surface + ' My list selects only the personal view and keeps unsupported actions hidden', async () => {
    render(<Surface phone={phone} />);
    editPhone(phone);
    fireEvent.click(screen.getByRole('button', { name: /^My list/ }));
    menu();
    choose('Uncheck All');
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(observed[0].selector).toEqual({ view: 'personal', status: 'all', categories: ['Other'] });
    expect(observed[0].rows.map((r) => r.id)).toEqual([4]);
    expect(raw).not.toHaveBeenCalled();
  });
  it(surface + ' clear confirmation captures the entire view even while Open is selected', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Surface phone={phone} />);
    choose('Open');
    if (phone) fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    choose('Remove 1 checked');
    await confirmPhone(phone);
    await waitFor(() => expect(submit).toHaveBeenCalledExactlyOnceWith({ action: 'clear-completed', values: {} }));
    expect(observed[0].selector).toEqual({ view: 'common', status: 'all', categories: null });
    expect(observed[0].rows.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(raw).not.toHaveBeenCalled();
  });
  it(surface + ' cancelled clear changes nothing and retires the unused observation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Surface phone={phone} />);
    if (phone) fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    choose('Remove 1 checked');
    if (phone) {
      const d = await screen.findByRole('dialog');
      fireEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    }
    expect(submit).not.toHaveBeenCalled();
    expect(raw).not.toHaveBeenCalled();
    expect(observed[0].close).toHaveBeenCalledTimes(1);
  });
  it(surface + ' rerender and close/reopen during a slow reply keep one original and one submit', async () => {
    let release!: () => void;
    submit.mockImplementation(
      () =>
        new Promise<void>((r) => {
          release = r;
        })
    );
    const view = render(<Surface phone={phone} />);
    editPhone(phone);
    menu();
    choose('Check All');
    view.rerender(<Surface phone={phone} revision={1} />);
    menu();
    choose('Check All');
    expect(observed).toHaveLength(1);
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
    });
    expect(raw).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
}
it('an unqualified port never exposes supported or unsupported native group authoring', () => {
  stop();
  delete port.observeGroup;
  stop = installPlannerPackingPort(port);
  expect(packingActionAvailable('trash')).toBe(false);
  render(<Surface phone={true} />);
  editPhone(true);
  expect(screen.queryByRole('button', { name: 'List options' })).toBeNull();
  expect(packingGroupActionsAvailable()).toBe(false);
});
it('an uncertain reply retains the exact original and action across reopen; a different action is refused', async () => {
  const owner = createPackingGroupActions(1, 'common', 'all');
  submit.mockRejectedValueOnce(new Error('Lost reply'));
  owner.beginCategory('Other', rows.slice(0, 2), rows, 'Other');
  await expect(owner.packed('Other', true)).rejects.toThrow('Lost reply');
  owner.cancelCategory('Other');
  owner.beginCategory('Other', [], [], 'Other');
  await expect(owner.trash('Other')).rejects.toThrow('original packing group');
  await owner.packed('Other', true);
  expect(observed).toHaveLength(1);
  expect(submit.mock.calls).toEqual([
    [{ action: 'group-packed-state', values: { checked: true } }],
    [{ action: 'group-packed-state', values: { checked: true } }],
  ]);
  owner.dispose();
});
it.each([null, undefined])('refuses a missing stored category (%s) before capturing a default group', (category) => {
  const owner = createPackingGroupActions(1, 'common', 'all');
  const staleRows = [{ ...rows[0], category }, ...rows.slice(1)];

  expect(() => owner.beginCategory('Other', staleRows.slice(0, 2), staleRows, 'Other')).toThrow(
    'The original packing group ended'
  );
  expect(observed).toHaveLength(0);
  expect(submit).not.toHaveBeenCalled();

  owner.beginCategory('Other', rows.slice(0, 2), rows, 'Other');
  expect(observed[0].selector.categories).toEqual(['', 'Other']);
  expect(observed[0].rows.map((row) => row.id)).toEqual([1, 2]);
  owner.dispose();
});
it.each(['owner', 'port', 'logout'] as const)(
  'changed %s refuses an original without submitting or borrowing rows',
  async (kind) => {
    const owner = createPackingGroupActions(1, 'common', 'all');
    owner.beginClear(rows);
    if (kind === 'owner') owner.dispose();
    if (kind === 'port') stop();
    if (kind === 'logout') invalidateOfflineSession();
    await expect(owner.clear()).rejects.toThrow('original packing group');
    expect(submit).not.toHaveBeenCalled();
    owner.dispose();
  }
);

it('desktop keeps the menu anchored to the clicked native button across canonical rerenders', () => {
  const geometry = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(120, 400, 20, 20));
  const view = render(<Surface phone={false} />);
  menu();
  const panel = screen.getByText('Uncheck All').closest('button')?.parentElement;
  expect(panel).toHaveStyle({ position: 'fixed', top: '426px' });
  geometry.mockReturnValue(new DOMRect(0, 0, 0, 0));
  view.rerender(<Surface phone={false} revision={2} />);
  expect(panel).toHaveStyle({ top: '426px' });
  expect(submit).not.toHaveBeenCalled();
});
