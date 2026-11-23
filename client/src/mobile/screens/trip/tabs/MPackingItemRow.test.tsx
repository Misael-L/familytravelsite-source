import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildPackingItem, buildUser } from '../../../../../tests/helpers/factories';
import { buildPlanner } from '../../../../../tests/helpers/mobileTrip';
import { act, fireEvent, render, screen, within } from '../../../../../tests/helpers/render';
import { resetAllStores, seedStore } from '../../../../../tests/helpers/store';
import { packingApi } from '../../../../api/client';
import { useAddonStore } from '../../../../store/addonStore';
import { useAuthStore } from '../../../../store/authStore';
import MPackingListTab from './MPackingListTab';

beforeEach(() => {
  resetAllStores();
  seedStore(useAuthStore, { user: buildUser({ id: 7 }) });
  seedStore(useAddonStore, { bagTracking: true });
  vi.spyOn(packingApi, 'listBags').mockResolvedValue({ bags: [] });
  vi.spyOn(packingApi, 'listTemplates').mockResolvedValue({ templates: [] });
  vi.spyOn(packingApi, 'getCategoryAssignees').mockResolvedValue({ assignees: {} });
});
afterEach(() => vi.restoreAllMocks());

it('keeps the native item row DOM and open bag-name draft across a planner rerender', async () => {
  const item = buildPackingItem({ id: 3, trip_id: 3, name: 'Socks', category: 'Clothing' });
  const planner = buildPlanner({ tripId: 3, packingItems: [item] });
  const create = vi.spyOn(packingApi, 'createBag');
  const view = render(<MPackingListTab planner={planner} />);
  const checkbox = await screen.findByRole('button', { name: 'Socks' });
  const row = checkbox.parentElement;
  if (!row) throw new Error('The native packing item must have a row');
  fireEvent.click(within(row).getByRole('button', { name: 'packing.bags' }));
  fireEvent.click(screen.getByRole('button', { name: 'packing.addBag' }));
  const input = screen.getByPlaceholderText('packing.bagName');
  fireEvent.change(input, { target: { value: 'Carry-on' } });

  await act(async () => {
    view.rerender(<MPackingListTab planner={{ ...planner, packingItems: [{ ...item, name: 'Updated socks' }] }} />);
  });
  expect(screen.getByRole('button', { name: 'Updated socks' })).toBe(checkbox);
  expect(screen.getByPlaceholderText('packing.bagName')).toBe(input);
  expect(input).toHaveValue('Carry-on');
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByPlaceholderText('packing.bagName')).not.toBeInTheDocument();
  expect(create).not.toHaveBeenCalled();
  expect(planner.tripActions.updatePackingItem).not.toHaveBeenCalled();
});
