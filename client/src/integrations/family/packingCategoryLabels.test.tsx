import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildPackingItem, buildTrip, buildUser } from '../../../tests/helpers/factories';
import { buildPlanner } from '../../../tests/helpers/mobileTrip';
import { cleanup, fireEvent, render, screen } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { packingApi, tripsApi } from '../../api/client';
import PackingListPanel from '../../components/Packing/PackingListPanel';
import { useTranslation } from '../../i18n';
import MPackingListTab from '../../mobile/screens/trip/tabs/MPackingListTab';
import { useAuthStore } from '../../store/authStore';
import { useTripStore } from '../../store/tripStore';
import type { PackingItem } from '../../types';

beforeEach(() => {
  resetAllStores();
  localStorage.clear();
  useAuthStore.setState({ user: buildUser({ id: 1 }), isAuthenticated: true });
  useTripStore.setState({ trip: buildTrip({ id: 1, user_id: 1 }) });
  vi.spyOn(tripsApi, 'getMembers').mockResolvedValue({ owner: null, members: [] } as never);
  vi.spyOn(packingApi, 'getCategoryAssignees').mockResolvedValue({ assignees: {} });
  vi.spyOn(packingApi, 'listTemplates').mockResolvedValue({ templates: [] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function Surface({ phone, rows }: { phone: boolean; rows: PackingItem[] }) {
  const { t } = useTranslation();
  return phone ? (
    <MPackingListTab planner={buildPlanner({ tripId: 1, packingItems: rows, t })} />
  ) : (
    <PackingListPanel tripId={1} items={rows} />
  );
}
for (const phone of [false, true]) {
  const surface = phone ? 'phone' : 'desktop';
  it.each(['__proto__', 'constructor', 'toString', ' hasOwnProperty '])(
    surface + ' displays category %j and its items without interpreting the label as an object property',
    (label) => {
      const rows = [buildPackingItem({ id: 1, category: label, name: 'Visible category item' })];
      render(<Surface phone={phone} rows={rows} />);
      expect(screen.getByText(label, { normalizer: (value) => value })).toBeVisible();
      expect(screen.getByText('Visible category item')).toBeVisible();
      if (phone) {
        fireEvent.click(screen.getByText(label, { normalizer: (value) => value }));
        expect(screen.queryByText('Visible category item')).toBeNull();
        fireEvent.click(screen.getByText(label, { normalizer: (value) => value }));
        expect(screen.getByText('Visible category item')).toBeVisible();
      }
    }
  );
  it(surface + ' keeps reserved-label items scoped to the selected view and status', () => {
    const rows = [
      buildPackingItem({ id: 1, category: '__proto__', name: 'Open common socks' }),
      buildPackingItem({ id: 2, category: '__proto__', name: 'Packed common coat', checked: 1 }),
      buildPackingItem({ id: 3, category: '__proto__', name: 'Private diary', is_private: 1, owner_id: 1 }),
    ];
    render(<Surface phone={phone} rows={rows} />);
    expect(screen.getByText('Open common socks')).toBeVisible();
    expect(screen.queryByText('Private diary')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.queryByText('Packed common coat')).toBeNull();
    expect(screen.getByText('Open common socks')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /^My list/ }));
    expect(screen.queryByText('Open common socks')).toBeNull();
    expect(screen.getByText('Private diary')).toBeVisible();
  });
}
