import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { Component, type PropsWithChildren } from 'react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FamilyIdentityRegistry } from './identity';
import { canonicalFamilyDestination, FamilyTripParamsBoundary } from './navigation';
import { FamilyApiError, familyAuthStore, type FamilyFrontendRepository } from './repository';
import { FamilyViews } from './views';
const trip = '00000000-0000-4000-8000-000000000002';
describe('Family canonical navigation boundary', () => {
  it('keeps a trip UUID in browser links and navigation while retaining tab query and hash', () => {
    const ids = new FamilyIdentityRegistry('00000000-0000-4000-8000-000000000001');
    const key = ids.register('trip', trip);
    expect(canonicalFamilyDestination(`/trips/${key}?tab=buchungen#booking`, ids)).toBe(
      `/trips/${trip}?tab=buchungen#booking`
    );
    expect(canonicalFamilyDestination({ pathname: `/trips/${key}`, search: '?tab=plan', hash: '#day' }, ids)).toEqual({
      pathname: `/trips/${trip}`,
      search: '?tab=plan',
      hash: '#day',
    });
    expect(canonicalFamilyDestination(`/trips/${trip}`, ids)).toBe(`/trips/${trip}`);
  });
  it('rejects an unrecognized numeric route instead of inventing a Family trip UUID', () => {
    const ids = new FamilyIdentityRegistry('00000000-0000-4000-8000-000000000001');
    expect(() => canonicalFamilyDestination('/trips/123', ids)).toThrow('unknown_view_key');
    expect(canonicalFamilyDestination('/login?redirect=%2Ftrips', ids)).toBe('/login?redirect=%2Ftrips');
  });
});

const initialAuth = familyAuthStore.getState();
const person = '00000000-0000-4000-8000-000000000003',
  family = '00000000-0000-4000-8000-000000000004';
function authorize(user = '00000000-0000-4000-8000-000000000001') {
  familyAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    authCheckFailed: false,
    authGate: 'ok',
    authUserId: user,
    personId: person,
    familyId: family,
  });
}
function held<T>() {
  let resolve!: (v: T) => void, reject!: (e: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
class CaptureRouteError extends Component<PropsWithChildren<{ failed: (e: Error) => void }>, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: Error) {
    this.props.failed(e);
  }
  render() {
    return this.state.failed ? <div>Current route error</div> : this.props.children;
  }
}
function mountRoute(views: ReturnType<typeof vi.fn>, failed = vi.fn()) {
  const repository = { views } as unknown as FamilyFrontendRepository;
  function NativeController() {
    return <div data-testid="native-id">{useParams().id}</div>;
  }
  render(
    <MemoryRouter initialEntries={['/trips/' + trip]}>
      <Routes>
        <Route
          path="/trips/:id"
          element={
            <CaptureRouteError failed={failed}>
              <FamilyTripParamsBoundary repository={repository}>
                <NativeController />
              </FamilyTripParamsBoundary>
            </CaptureRouteError>
          }
        />
      </Routes>
    </MemoryRouter>
  );
  return failed;
}
beforeEach(() => {
  authorize();
});
afterEach(() => {
  cleanup();
  familyAuthStore.setState(initialAuth, true);
  vi.restoreAllMocks();
});
describe('Family route-ID async ownership', () => {
  it('discards a delayed session-required failure after logout instead of raising a generic route error', async () => {
    const old = held<FamilyViews>(),
      views = vi.fn(() => old.promise),
      failed = mountRoute(views);
    expect(views).toHaveBeenCalledOnce();
    await act(async () => {
      familyAuthStore.setState({
        isAuthenticated: false,
        authUserId: null,
        personId: null,
        familyId: null,
        authGate: null,
      });
      old.reject(new FamilyApiError(401, 'session_required', 'Sign in to Family Travel.'));
    });
    expect(failed).not.toHaveBeenCalled();
    expect(screen.queryByTestId('native-id')).not.toBeInTheDocument();
    expect(views).toHaveBeenCalledOnce();
  });
  it('resolves a returned account afresh and discards its pre-logout ABA lookup failure', async () => {
    const old = held<FamilyViews>(),
      current = new FamilyViews(new FamilyIdentityRegistry('00000000-0000-4000-8000-000000000001'));
    const key = current.ids.register('trip', trip),
      views = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(current),
      failed = mountRoute(views);
    await act(async () => {
      familyAuthStore.setState({ isAuthenticated: false, authGate: null });
      authorize();
    });
    await waitFor(() => expect(screen.getByTestId('native-id')).toHaveTextContent(String(key)));
    await act(async () => {
      old.reject(new FamilyApiError(401, 'session_required', 'Retired request'));
    });
    expect(views).toHaveBeenCalledTimes(2);
    expect(failed).not.toHaveBeenCalled();
    expect(screen.getByTestId('native-id')).toHaveTextContent(String(key));
  });
  it('discards a delayed old-account ID mapping and waits for the new account mapping', async () => {
    const old = held<FamilyViews>(),
      next = held<FamilyViews>(),
      views = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise),
      failed = mountRoute(views);
    await act(async () => {
      authorize('00000000-0000-4000-8000-000000000009');
    });
    await act(async () => {
      old.resolve(new FamilyViews(new FamilyIdentityRegistry('00000000-0000-4000-8000-000000000001')));
    });
    expect(screen.queryByTestId('native-id')).not.toBeInTheDocument();
    const current = new FamilyViews(new FamilyIdentityRegistry('00000000-0000-4000-8000-000000000009')),
      key = current.ids.register('trip', trip);
    await act(async () => {
      next.resolve(current);
    });
    expect(screen.getByTestId('native-id')).toHaveTextContent(String(key));
    expect(failed).not.toHaveBeenCalled();
  });
  it('still exposes a genuine failure belonging to the currently authorized route', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Current mapping unavailable'),
      failed = mountRoute(vi.fn().mockRejectedValue(error));
    await waitFor(() => expect(failed).toHaveBeenCalledWith(error));
    expect(screen.getByText('Current route error')).toBeVisible();
  });
});
