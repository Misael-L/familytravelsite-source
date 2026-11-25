import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { _resetNetworkMode } from '../../sync/networkMode';
import { FamilyPlannerTaskRecovery } from './FamilyPlannerTaskRecovery';
import type { PlannerTaskRecovery, RetainedTask } from './plannerTaskRecovery';
let task: RetainedTask | null, recovery: PlannerTaskRecovery, current: boolean;
const cancel = vi.fn(),
  replacement = vi.fn(),
  confirmReplacement = vi.fn(),
  parent = vi.fn(),
  prepareParent = vi.fn(),
  reload = vi.fn();
beforeEach(() => {
  resetAllStores();
  _resetNetworkMode();
  current = true;
  vi.clearAllMocks();
  task = {
    domain: 'packing',
    action: 'restore',
    name: 'Original restore',
    check: async () => 'unknown',
    retry: async () => 'unknown',
    terminal: {
      operations: [{ id: 'original', action: 'restore' }],
      prepare: async () => ({ original: {} as never, check: async () => 'unknown', cancel }),
      replacement: async () => ({ original: {} as never, submit: confirmReplacement }),
    },
    parents: { list: async () => [{ id: 'bag', name: 'Cabin' }], prepare: prepareParent },
  };
  recovery = { inspect: async () => task, export: async () => {}, replacement };
  cancel.mockImplementation(async () => {
    task = null;
    return 'cancelled';
  });
  replacement.mockResolvedValue({ original: {} as never, submit: confirmReplacement });
  confirmReplacement.mockResolvedValue('committed');
  prepareParent.mockResolvedValue({ status: 'prepared', original: {} as never, submit: parent });
  parent.mockResolvedValue('committed');
  reload.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

async function mount() {
  return render(<FamilyPlannerTaskRecovery problem={{ current: () => current, retry: reload }} recovery={recovery} />);
}
it('rediscovers cancelled list restores after unmount without using local settled state', async () => {
  task = null;
  recovery.replacements = async () => ({
    items: [{ id: 'original', action: 'category-restore-batch' }],
    next_offset: null,
  });
  const first = await mount();
  await screen.findByRole('button', { name: 'Prepare new restore · list' });
  first.unmount();
  await mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Prepare new restore · list' }));
  await screen.findByRole('alertdialog');
  expect(confirmReplacement).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(confirmReplacement).toHaveBeenCalledTimes(1));
});
it('requires separate confirmation to cancel a bag change and refreshes current data', async () => {
  task!.action = 'bag-trash-empty';
  task!.terminal!.operations = [{ id: 'original', action: 'bag-trash-empty' }];
  recovery.replacements = async () => ({ items: [], next_offset: null });
  await mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel saved bag change' }));
  await screen.findByRole('alertdialog', { name: 'Cancel this saved bag change?' });
  expect(cancel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('button', { name: /Prepare new restore/ })).not.toBeInTheDocument();
});
it('does not label a committed bag change as a cancelled restore', async () => {
  task!.action = 'bag-update';
  task!.terminal!.operations = [{ id: 'original', action: 'bag-update' }];
  cancel.mockImplementation(async () => {
    task = null;
    return 'committed';
  });
  await mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel saved bag change' }));
  await screen.findByRole('alertdialog');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await screen.findByText('The earlier bag change already committed. Refresh the Trip to see its current state.');
});
it('loads a bounded next page only after a user request', async () => {
  task = null;
  const pages = vi.fn(async (_current: unknown, offset?: number) => ({
    items: [{ id: offset ? 'second' : 'first', action: offset ? 'bag-restore' : 'restore' }],
    next_offset: offset ? null : 20,
  }));
  recovery.replacements = pages;
  await mount();
  await screen.findByRole('button', { name: 'Prepare new restore · item' });
  expect(pages).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'More saved restores' }));
  await screen.findByRole('button', { name: 'Prepare new restore · bag' });
  expect(pages.mock.calls[1][1]).toBe(20);
  expect(screen.queryByRole('button', { name: 'More saved restores' })).not.toBeInTheDocument();
});
it('does not show a saved replacement on failed authenticated discovery', async () => {
  task = null;
  recovery.replacements = async () => {
    throw Error('Current permission refused');
  };
  await mount();
  await screen.findByText('Current permission refused');
  expect(screen.queryByRole('button', { name: /Prepare new restore/ })).not.toBeInTheDocument();
});
