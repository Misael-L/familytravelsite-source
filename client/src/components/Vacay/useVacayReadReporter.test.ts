import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '../../../tests/helpers/render';
import { useVacayReadReporter } from './useVacayReadReporter';
const state = vi.hoisted(() => ({ epoch: 0, error: vi.fn() }));
vi.mock('../shared/Toast', () => ({ useToast: () => ({ error: state.error }) }));
vi.mock('../../sync/readSession', () => ({
  captureReadSession: () => {
    const epoch = state.epoch;
    return { current: () => epoch === state.epoch };
  },
}));
beforeEach(() => {
  state.epoch = 0;
  state.error.mockReset();
});
afterEach(cleanup);
function delayed() {
  let reject!: (error: Error) => void;
  const pending = new Promise<void>((_resolve, fail) => {
    reject = fail;
  });
  return { read: vi.fn(() => pending), reject };
}
describe('Vacay background reads report failures to their current owner', () => {
  it('reports an unavailable read without replacing it with empty successful data', async () => {
    const error = new Error('Shared calendars are unavailable');
    const { result } = renderHook(useVacayReadReporter);
    act(() =>
      result.current(async () => {
        throw error;
      })
    );
    await waitFor(() => expect(state.error).toHaveBeenCalledWith(error.message));
    expect(state.error).toHaveBeenCalledTimes(1);
  });
  it('keeps successful background reads quiet', async () => {
    const read = vi.fn(async () => {}),
      { result } = renderHook(useVacayReadReporter);
    await act(async () => {
      result.current(read);
      await Promise.resolve();
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(state.error).not.toHaveBeenCalled();
  });
  it('does not report a late failure after the calendar unmounts', async () => {
    const f = delayed(),
      { result, unmount } = renderHook(useVacayReadReporter);
    await act(async () => {
      result.current(f.read);
      await Promise.resolve();
    });
    expect(f.read).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      f.reject(new Error('Late failure'));
      await Promise.resolve();
    });
    expect(state.error).not.toHaveBeenCalled();
  });
  it('does not report a previous account/session failure into a replacement session', async () => {
    const f = delayed(),
      { result } = renderHook(useVacayReadReporter);
    await act(async () => {
      result.current(f.read);
      await Promise.resolve();
    });
    expect(f.read).toHaveBeenCalledTimes(1);
    state.epoch++;
    await act(async () => {
      f.reject(new Error('Retired source'));
      await Promise.resolve();
    });
    expect(state.error).not.toHaveBeenCalled();
  });
});
