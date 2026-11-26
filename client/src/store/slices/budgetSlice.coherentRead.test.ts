import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBudgetItem } from '../../../tests/helpers/factories';
import { resetOfflineTestDatabase } from '../../../tests/helpers/offlineDb';
import { resetAllStores } from '../../../tests/helpers/store';
import { budgetRepo } from '../../repo/budgetRepo';
import { installPlannerReadPort, type PlannerReadPort } from '../../repo/plannerReadPort';
import { useTripStore } from '../tripStore';
let release = () => {};
beforeEach(async () => {
  await resetOfflineTestDatabase();
  resetAllStores();
});
afterEach(() => {
  release();
  vi.restoreAllMocks();
});
function install(reloadBudget?: PlannerReadPort['reloadBudget']) {
  release = installPlannerReadPort({
    places: async () => ({ places: [] }),
    days: async () => ({ days: [] }),
    reloadBudget,
  });
  return vi.spyOn(budgetRepo, 'list').mockResolvedValue({ items: [buildBudgetItem({ id: 99 })] });
}
describe('native Costs refresh preserves cohort ownership', () => {
  it('cannot replace the visible budget before the complete read settles', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const reload = vi.fn(() => pending),
      legacy = install(reload);
    const before = [buildBudgetItem({ id: 1 })];
    useTripStore.setState({ budgetItems: before });
    const task = useTripStore.getState().loadBudgetItems(1);
    expect(reload).toHaveBeenCalledWith(1);
    expect(useTripStore.getState().budgetItems).toBe(before);
    finish();
    await task;
    expect(useTripStore.getState().budgetItems).toBe(before);
    expect(legacy).not.toHaveBeenCalled();
  });
  it('retains a refused refresh without a raw-read fallback or local replacement', async () => {
    const legacy = install(async () => {
      throw new Error('Retained local work');
    });
    const before = [buildBudgetItem({ id: 1 })];
    useTripStore.setState({ budgetItems: before });
    await expect(useTripStore.getState().loadBudgetItems(1)).resolves.toBeUndefined();
    expect(useTripStore.getState().budgetItems).toBe(before);
    expect(legacy).not.toHaveBeenCalled();
  });
  it('refuses an incomplete installed contract instead of calling the legacy reader', async () => {
    const legacy = install();
    await expect(useTripStore.getState().loadBudgetItems(1)).rejects.toThrow('Coherent cost refresh');
    expect(legacy).not.toHaveBeenCalled();
  });
  it('does not repaint a newer current view when an older refresh resolves', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const legacy = install(() => pending);
    const task = useTripStore.getState().loadBudgetItems(1);
    const newer = [buildBudgetItem({ id: 2, trip_id: 2 })];
    useTripStore.setState({ budgetItems: newer });
    finish();
    await task;
    expect(useTripStore.getState().budgetItems).toBe(newer);
    expect(legacy).not.toHaveBeenCalled();
  });
});
