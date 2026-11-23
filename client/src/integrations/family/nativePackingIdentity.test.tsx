import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildTrip, buildUser } from '../../../tests/helpers/factories';
import { canonicalPackingRow, packingFixtureId as id } from '../../../tests/helpers/familyPacking';
import { categoryV2, snapshotV2 } from '../../../tests/helpers/familyPackingCategoryV2';
import { buildPlanner } from '../../../tests/helpers/mobileTrip';
import { cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
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
const headers = () => screen.getAllByText('Other', { exact: true }).filter((e) => e.tagName === 'SPAN');
for (const phone of [false, true]) {
  const surface = phone ? 'phone' : 'desktop';
  it(surface + ' renders two empty ID cards with the same label and no synthetic item row', () => {
    render(<Surface phone={phone} />);
    expect(headers()).toHaveLength(2);
    expect(useTripStore.getState().packingItems).toEqual([]);
    expect(screen.queryByText('...', { exact: true })).toBeNull();
    expect(raw).not.toHaveBeenCalled();
  });
  it(surface + ' fill captures the selected ID rather than the duplicate display label', async () => {
    render(<Surface phone={phone} />);
    edit(phone);
    const add = screen.getAllByRole('button', { name: 'Add item' });
    expect(add).toHaveLength(2);
    fireEvent.click(add[1]);
    expect(fill).toHaveBeenCalledExactlyOnceWith('packing-category:' + id(21));
    const field = screen.getAllByRole('textbox').find((e) => e === document.activeElement);
    if (!field) throw Error('Native composer did not focus an input');
    fireEvent.change(field, { target: { value: 'Real socks' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(fill).toHaveBeenCalledWith('Real socks'));
    expect(raw).not.toHaveBeenCalled();
  });
  it(surface + ' real ellipsis item stays visible and editable', () => {
    const rows = [
      canonicalPackingRow({
        name: '...',
        category: '',
        is_private: false,
        owner_person_id: null,
        bag_id: null,
        recipient_person_ids: [],
        contributor_person_ids: [],
      }),
    ];
    packet.packing.items = rows;
    packet.item_categories = [{ item_id: rows[0].id, category_id: id(20) }];
    const projected = projectPacking(packet.packing, new FamilyIdentityRegistry(packet.scope.user_id), [], packet);
    port.snapshot = () => ({ ...projected, unassigned_weight_grams: 0 });
    // Stable snapshot, as in the actual publisher.
    const stable = port.snapshot();
    port.snapshot = () => stable;
    useTripStore.setState({ packingItems: projected.items });
    render(<Surface phone={phone} />);
    expect(screen.getByText('...', { exact: true })).toBeVisible();
    expect(useTripStore.getState().packingItems).toHaveLength(1);
  });
  it(surface + ' saved read-only lease hides all category authoring', () => {
    releaseRead = installReadOnlySession();
    render(<Surface phone={phone} />);
    edit(phone);
    expect(headers()).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Add item' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'List options' })).toBeNull();
    expect(fill).not.toHaveBeenCalled();
    expect(raw).not.toHaveBeenCalled();
  });
}
