import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '../../../tests/helpers/render';
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
  render(<FamilyPlannerTaskRecovery problem={{ current: () => current, retry: reload }} recovery={recovery} />);
  await screen.findByRole('button', { name: 'Cancel saved item restore' });
}
it('prepares and dismisses cancellation without sending it', async () => {
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel saved item restore' }));
  await screen.findByRole('alertdialog');
  expect(cancel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Keep current attempt' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(cancel).not.toHaveBeenCalled();
});
it('cancels only after confirmation and separates fresh replacement preparation from submission', async () => {
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel saved item restore' }));
  await screen.findByRole('alertdialog');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await screen.findByRole('button', { name: 'Prepare new restore' });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(reload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Prepare new restore' }));
  await screen.findByRole('alertdialog');
  expect(confirmReplacement).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(confirmReplacement).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
});
it('offers a missing parent by its real name and confirms its separate restore', async () => {
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Find parent bag' }));
  await screen.findByRole('button', { name: 'Restore parent bag · Cabin' });
  fireEvent.click(screen.getByRole('button', { name: 'Restore parent bag · Cabin' }));
  await screen.findByRole('alertdialog');
  expect(parent).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(parent).toHaveBeenCalledTimes(1));
  expect(reload).not.toHaveBeenCalled();
});
it('keeps lost cancellation replies armed and labels retry as cancellation', async () => {
  cancel.mockImplementation(async () => {
    task = { ...task!, intent: 'cancel-restore' };
    throw Error('Reply lost');
  });
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel saved item restore' }));
  await screen.findByRole('alertdialog');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await screen.findByRole('button', { name: 'Retry original cancellation' });
  expect(screen.queryByRole('button', { name: 'Prepare new restore' })).not.toBeInTheDocument();
  expect(reload).not.toHaveBeenCalled();
});
it('does not label an already committed restore as cancelled or offer another restore', async () => {
  cancel.mockImplementation(async () => {
    task = null;
    return 'committed';
  });
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel saved item restore' }));
  await screen.findByRole('alertdialog');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await screen.findByText('The earlier restore already committed. Refresh the Trip to see its current state.');
  expect(screen.queryByRole('button', { name: 'Prepare new restore' })).not.toBeInTheDocument();
});
it('refuses stale confirmation after the original Trip owner retires', async () => {
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel saved item restore' }));
  await screen.findByRole('alertdialog');
  current = false;
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirm' })));
  expect(cancel).not.toHaveBeenCalled();
});
