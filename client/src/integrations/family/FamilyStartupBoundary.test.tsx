import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../../../tests/helpers/factories';
import { resetAllStores } from '../../../tests/helpers/store';
import { useAuthStore } from '../../store/authStore';
import { _resetNetworkMode, setForcedOffline } from '../../sync/networkMode';
import { FamilyStartupBoundary } from './FamilyStartupBoundary';
import { familyAuthStore } from './repository';
vi.mock('./runtime', () => ({ isFamilyFrontendActive: () => true }));
const initialFamily = familyAuthStore.getState();
beforeEach(() => {
  resetAllStores();
  _resetNetworkMode();
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55331');
  familyAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    authGate: null,
    authCheckFailed: true,
    authUserId: '11111111-1111-4111-8111-111111111111',
    personId: '22222222-2222-4222-8222-222222222222',
    familyId: '33333333-3333-4333-8333-333333333333',
  });
  useAuthStore.setState({
    user: buildUser({ id: 811 }),
    isAuthenticated: true,
    isLoading: false,
    authCheckFailed: true,
  });
});
afterEach(() => {
  familyAuthStore.setState(initialFamily, true);
  _resetNetworkMode();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
});
function mount(child = <div>Protected child</div>) {
  return render(
    <MemoryRouter initialEntries={['/trips/fixture']}>
      <FamilyStartupBoundary>{child}</FamilyStartupBoundary>
    </MemoryRouter>
  );
}
function ready() {
  familyAuthStore.setState({ isAuthenticated: true, isLoading: false, authGate: 'ok', authCheckFailed: false });
  useAuthStore.setState({ isLoading: false, authCheckFailed: false });
}
describe('owned Family startup recovery', () => {
  it('recovers unavailable validation with incomplete display snapshots without inventing an account', () => {
    familyAuthStore.setState({
      isAuthenticated: false,
      authUserId: null,
      personId: null,
      familyId: null,
      authCheckFailed: true,
    });
    useAuthStore.setState({ isAuthenticated: false, user: null, authCheckFailed: true });
    mount();
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.queryByText('Protected child')).not.toBeInTheDocument();
  });

  it('keeps a cached identity outside protected children until actual validation is ready', () => {
    mount();
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.queryByText('Protected child')).not.toBeInTheDocument();
  });
  it('deduplicates the same recovery retry and opens children only after the validated answer', async () => {
    let complete!: () => void;
    const wait = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const load = vi.fn(async () => {
      useAuthStore.setState({ isLoading: true });
      await wait;
      ready();
    });
    useAuthStore.setState({ loadUser: load });
    mount();
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(load).toHaveBeenCalledOnce();
    expect(screen.queryByText('Protected child')).not.toBeInTheDocument();
    await act(async () => {
      complete();
      await wait;
    });
    expect(await screen.findByText('Protected child')).toBeVisible();
  });
  it('recovers once when the real browser goes online, using current validation rather than cached access', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false });
    const load = vi.fn(async () => ready());
    useAuthStore.setState({ loadUser: load });
    mount();
    expect(screen.getByText('You appear to be offline')).toBeVisible();
    expect(load).not.toHaveBeenCalled();
    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { value: true });
      window.dispatchEvent(new Event('online'));
    });
    expect(await screen.findByText('Protected child')).toBeVisible();
    expect(load).toHaveBeenCalledOnce();
  });
  it('does not lift forced offline when a browser online event arrives', async () => {
    setForcedOffline(true);
    const load = vi.fn(async () => ready());
    useAuthStore.setState({ loadUser: load });
    mount();
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(load).not.toHaveBeenCalled();
    await act(async () => {
      setForcedOffline(false);
    });
    await waitFor(() => expect(load).toHaveBeenCalledOnce());
  });
  it('keeps an admitted warm native form mounted while connectivity or revalidation fails', async () => {
    ready();
    mount(<input aria-label="Typed native work" defaultValue="original" />);
    const input = screen.getByLabelText('Typed native work');
    fireEvent.change(input, { target: { value: 'keep my exact text' } });
    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { value: false });
      window.dispatchEvent(new Event('offline'));
      familyAuthStore.setState({ authCheckFailed: true });
      useAuthStore.setState({ authCheckFailed: true });
    });
    expect(screen.getByLabelText('Typed native work')).toBe(input);
    expect(input).toHaveValue('keep my exact text');
  });
  it.each(['suspended', 'no_membership', 'mfa_challenge'] as const)(
    'leaves the current %s refusal to the native permission gate',
    (gate) => {
      familyAuthStore.setState({ authGate: gate, authCheckFailed: false });
      mount(<div>Native permission gate</div>);
      expect(screen.getByText('Native permission gate')).toBeVisible();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
  );
  it('leaves a sessionless account to the native sign-in route instead of resurrecting cached work', () => {
    familyAuthStore.setState({ isAuthenticated: false, authGate: null, authCheckFailed: false });
    useAuthStore.setState({ isAuthenticated: false, user: null, authCheckFailed: false });
    mount(<div>Native sign-in gate</div>);
    expect(screen.getByText('Native sign-in gate')).toBeVisible();
  });
  it('a new source cannot inherit the previous warm-screen admission while access is unavailable', async () => {
    ready();
    const view = mount();
    expect(screen.getByText('Protected child')).toBeVisible();
    await act(async () => {
      familyAuthStore.setState({ authCheckFailed: true });
      useAuthStore.setState({ authCheckFailed: true });
      vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55399');
    });
    view.rerender(
      <MemoryRouter>
        <FamilyStartupBoundary>
          <div>Protected child</div>
        </FamilyStartupBoundary>
      </MemoryRouter>
    );
    expect(screen.queryByText('Protected child')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeVisible();
  });
});
