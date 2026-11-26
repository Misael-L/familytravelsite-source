// FE-PAGE-JOIN-001 to FE-PAGE-JOIN-011
import { act, renderHook, waitFor } from '@testing-library/react';
import { tripInviteApi } from '../../api/client';
import { useJoinTrip } from './useJoinTrip';
import { useAuthStore } from '../../store/authStore';
import { buildUser } from '../../../tests/helpers/factories';

const navigate = vi.fn();
let params: { token?: string } = { token: 'inv-1' };

vi.mock('react-router', async (original) => ({
  ...(await original<typeof import('react-router')>()),
  useNavigate: () => navigate,
  useParams: () => params,
}));

const addToast = vi.fn();
const initialAuth = useAuthStore.getState();

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((onSuccess, onError) => {
    resolve = onSuccess;
    reject = onError;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  navigate.mockClear();
  addToast.mockClear();
  window.__addToast = addToast;
  params = { token: 'inv-1' };
  useAuthStore.setState({ user: buildUser({ id: 11 }), isAuthenticated: true });
  vi.spyOn(tripInviteApi, 'preview').mockResolvedValue({ title: 'Japan 2026' } as never);
  vi.spyOn(tripInviteApi, 'accept').mockResolvedValue({ trip_id: 42 } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState(initialAuth, true);
  delete window.__addToast;
});

describe('useJoinTrip', () => {
  it('FE-PAGE-JOIN-001: resolves the invite to a trip title', async () => {
    const { result } = renderHook(() => useJoinTrip());
    expect(result.current.state).toBe('loading');

    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.title).toBe('Japan 2026');
    expect(tripInviteApi.preview).toHaveBeenCalledWith('inv-1');
  });

  it('FE-PAGE-JOIN-002: goes straight to invalid without a token in the URL', async () => {
    params = {};
    const { result } = renderHook(() => useJoinTrip());

    expect(result.current.state).toBe('invalid');
    expect(tripInviteApi.preview).not.toHaveBeenCalled();
  });

  it('FE-PAGE-JOIN-003: marks a rejected invite invalid', async () => {
    vi.mocked(tripInviteApi.preview).mockRejectedValue(new Error('expired'));
    const { result } = renderHook(() => useJoinTrip());

    await waitFor(() => expect(result.current.state).toBe('invalid'));
    expect(result.current.title).toBe('');
  });

  it('FE-PAGE-JOIN-004: accepting opens the trip and replaces the invite URL', async () => {
    const { result } = renderHook(() => useJoinTrip());
    await waitFor(() => expect(result.current.state).toBe('ready'));

    await act(() => { result.current.accept(); return Promise.resolve(); });

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/trips/42', { replace: true }));
    expect(tripInviteApi.accept).toHaveBeenCalledWith('inv-1');
  });

  it('FE-PAGE-JOIN-005: shows the joining state while the invite is redeemed', async () => {
    let release: (() => void) | undefined;
    vi.mocked(tripInviteApi.accept).mockReturnValue(
      new Promise(res => { release = () => res({ trip_id: 7 } as never); }) as never,
    );

    const { result } = renderHook(() => useJoinTrip());
    await waitFor(() => expect(result.current.state).toBe('ready'));

    act(() => result.current.accept());
    expect(result.current.state).toBe('joining');

    await act(async () => { release!(); });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/trips/7', { replace: true }));
  });

  it('FE-PAGE-JOIN-006: falls back to invalid when the invite itself is gone', async () => {
    vi.mocked(tripInviteApi.accept).mockRejectedValue({ response: { status: 404, data: { error: 'Invalid or expired invite link' } } });
    const { result } = renderHook(() => useJoinTrip());
    await waitFor(() => expect(result.current.state).toBe('ready'));

    act(() => result.current.accept());
    await waitFor(() => expect(result.current.state).toBe('invalid'));
    expect(navigate).not.toHaveBeenCalled();
  });

  // GHSA-wr4c-964p-39jg: somebody another member took off the trip is told so,
  // not offered a join that fails.
  it('FE-PAGE-JOIN-012: a removed user sees the removal instead of the join prompt', async () => {
    vi.mocked(tripInviteApi.preview).mockRejectedValue({ response: { status: 403, data: { error: 'removed', removed: true } } });
    const { result } = renderHook(() => useJoinTrip());
    await waitFor(() => expect(result.current.state).toBe('removed'));
  });

  it('FE-PAGE-JOIN-013: a removal refused at accept also shows the removal', async () => {
    vi.mocked(tripInviteApi.accept).mockRejectedValue({ response: { status: 403, data: { error: 'removed', removed: true } } });
    const { result } = renderHook(() => useJoinTrip());
    await waitFor(() => expect(result.current.state).toBe('ready'));

    act(() => result.current.accept());
    await waitFor(() => expect(result.current.state).toBe('removed'));
    expect(navigate).not.toHaveBeenCalled();
    expect(addToast).not.toHaveBeenCalled();
  });

  it('FE-PAGE-JOIN-014: any other 403 at preview stays an unavailable invite', async () => {
    vi.mocked(tripInviteApi.preview).mockRejectedValue({ response: { status: 403, data: { error: 'MFA required' } } });
    const { result } = renderHook(() => useJoinTrip());
    await waitFor(() => expect(result.current.state).toBe('invalid'));
  });

  // A rate limit or a 500 is not an expired invite: saying so burns a link that
  // still works, and the invalid screen offers no way back.
  it('FE-PAGE-JOIN-010: a server failure reports itself and leaves the invite retryable', async () => {
    vi.mocked(tripInviteApi.accept).mockRejectedValue({ response: { status: 429, data: { error: 'Too many attempts. Please try again later.' } } });
    const { result } = renderHook(() => useJoinTrip());
    await waitFor(() => expect(result.current.state).toBe('ready'));

    act(() => result.current.accept());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(addToast).toHaveBeenCalledWith('Too many attempts. Please try again later.', 'error', undefined);
    expect(navigate).not.toHaveBeenCalled();

    // And the second press really does go out again.
    vi.mocked(tripInviteApi.accept).mockResolvedValue({ trip_id: 42 } as never);
    await act(() => { result.current.accept(); return Promise.resolve(); });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/trips/42', { replace: true }));
  });

  it('FE-PAGE-JOIN-011: a network failure with no status is reported, not called invalid', async () => {
    vi.mocked(tripInviteApi.accept).mockRejectedValue(new Error('Network Error'));
    const { result } = renderHook(() => useJoinTrip());
    await waitFor(() => expect(result.current.state).toBe('ready'));

    act(() => result.current.accept());
    await waitFor(() => expect(addToast).toHaveBeenCalled());
    expect(result.current.state).toBe('ready');
  });

  it('FE-PAGE-JOIN-007: accept is a no-op without a token', () => {
    params = {};
    const { result } = renderHook(() => useJoinTrip());

    act(() => result.current.accept());
    expect(tripInviteApi.accept).not.toHaveBeenCalled();
    expect(result.current.state).toBe('invalid');
  });

  it('FE-PAGE-JOIN-008: the dashboard escape hatch replaces the invite URL too', async () => {
    const { result } = renderHook(() => useJoinTrip());
    await waitFor(() => expect(result.current.state).toBe('ready'));

    act(() => result.current.goToDashboard());
    expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('FE-PAGE-JOIN-009: a preview landing after unmount does not update state', async () => {
    let release: ((v: { title: string }) => void) | undefined;
    vi.mocked(tripInviteApi.preview).mockReturnValue(
      new Promise(res => { release = res as (v: { title: string }) => void; }) as never,
    );

    const { result, unmount } = renderHook(() => useJoinTrip());
    unmount();

    await act(async () => { release!({ title: 'Too late' }); });
    expect(result.current.state).toBe('loading');
  });

  it('discards the first title and click handler when the invite changes', async () => {
    const next = pending<{ title: string }>();
    vi.mocked(tripInviteApi.preview).mockResolvedValueOnce({ title: 'Prior trip' }).mockReturnValueOnce(next.promise);
    const { result, rerender } = renderHook(() => useJoinTrip());
    await waitFor(() => expect(result.current.title).toBe('Prior trip'));
    const acceptFirst = result.current.accept;

    params = { token: 'inv-2' };
    rerender();
    expect(result.current).toMatchObject({ state: 'loading', title: '' });
    act(() => { acceptFirst(); result.current.accept(); });
    expect(tripInviteApi.accept).not.toHaveBeenCalled();

    await act(async () => next.resolve({ title: 'New trip' }));
    expect(result.current).toMatchObject({ state: 'ready', title: 'New trip' });
    expect(tripInviteApi.preview).toHaveBeenLastCalledWith('inv-2');
  });

  it('waits until sign-in and discards a preview from a replaced account', async () => {
    const first = pending<{ title: string }>();
    vi.mocked(tripInviteApi.preview).mockReturnValueOnce(first.promise).mockResolvedValueOnce({ title: 'Current account' });
    useAuthStore.setState({ user: null, isAuthenticated: false });
    const { result } = renderHook(() => useJoinTrip());
    expect(tripInviteApi.preview).not.toHaveBeenCalled();

    await act(async () => { useAuthStore.setState({ user: buildUser({ id: 12 }), isAuthenticated: true }); });
    expect(tripInviteApi.preview).toHaveBeenCalledTimes(1);
    await act(async () => { useAuthStore.setState({ user: buildUser({ id: 13 }) }); });
    await waitFor(() => expect(result.current.title).toBe('Current account'));
    await act(async () => first.resolve({ title: 'Prior account' }));

    expect(result.current).toMatchObject({ state: 'ready', title: 'Current account' });
    expect(tripInviteApi.preview).toHaveBeenCalledTimes(2);
  });

  it('sends at most one acceptance when the same click handler runs twice before a render', async () => {
    const reply = pending<{ trip_id: number }>();
    vi.mocked(tripInviteApi.accept).mockReturnValue(reply.promise);
    const { result } = renderHook(() => useJoinTrip());
    await waitFor(() => expect(result.current.state).toBe('ready'));

    act(() => {
      result.current.accept();
      result.current.accept();
    });
    expect(tripInviteApi.accept).toHaveBeenCalledExactlyOnceWith('inv-1');
    await act(async () => reply.resolve({ trip_id: 42 }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/trips/42', { replace: true });
  });

  it.each(['cancel', 'unmount'])('ignores a late acceptance success after %s', async (exit) => {
    const reply = pending<{ trip_id: number }>();
    vi.mocked(tripInviteApi.accept).mockReturnValue(reply.promise);
    const { result, unmount } = renderHook(() => useJoinTrip());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    act(() => result.current.accept());

    if (exit === 'cancel') act(() => result.current.goToDashboard());
    else unmount();
    await act(async () => reply.resolve({ trip_id: 42 }));

    expect(navigate.mock.calls).toEqual(exit === 'cancel' ? [['/dashboard', { replace: true }]] : []);
  });

  it('ignores a stale acceptance error after an account change', async () => {
    const reply = pending<{ trip_id: number }>();
    vi.mocked(tripInviteApi.accept).mockReturnValue(reply.promise);
    vi.mocked(tripInviteApi.preview).mockResolvedValueOnce({ title: 'Prior account' }).mockResolvedValueOnce({ title: 'Current account' });
    const { result } = renderHook(() => useJoinTrip());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    act(() => result.current.accept());
    await act(async () => { useAuthStore.setState({ user: buildUser({ id: 21 }) }); });
    await waitFor(() => expect(result.current.title).toBe('Current account'));

    await act(async () => reply.reject(new Error('Previous request failed')));
    expect(result.current).toMatchObject({ state: 'ready', title: 'Current account' });
    expect(navigate).not.toHaveBeenCalled();
    expect(addToast).not.toHaveBeenCalled();
  });
});
