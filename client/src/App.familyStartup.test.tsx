import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../tests/helpers/factories';
import { resetAllStores } from '../tests/helpers/store';
import App from './App';
import { useInAppNotificationListener } from './hooks/useInAppNotificationListener';
import { familyAuthStore } from './integrations/family/repository';
import { useAddonStore } from './store/addonStore';
import { useAuthStore } from './store/authStore';
import { usePluginStore } from './store/pluginStore';
import { useSettingsStore } from './store/settingsStore';

const initialFamilyAuth = familyAuthStore.getState();
const family = vi.hoisted(() => ({ active: false }));
vi.mock('./integrations/family/runtime', () => ({ isFamilyFrontendActive: () => family.active }));
vi.mock('./integrations/family/legacy/pages/RequestAccessPage', () => ({
  default: () => <div>Current Family access refusal</div>,
}));
vi.mock('./pages/LoginPage', () => ({ default: () => <div>Sign-in route</div> }));
vi.mock('./pages/DashboardPage', () => ({ default: () => <div>Validated dashboard</div> }));
vi.mock('./hooks/useInAppNotificationListener.ts', () => ({ useInAppNotificationListener: vi.fn() }));

afterEach(() => {
  familyAuthStore.setState(initialFamilyAuth, true);
});

beforeEach(() => {
  resetAllStores();
  vi.clearAllMocks();
  family.active = false;
});

function mount(route = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>
  );
}

describe('actual App startup auth gate', () => {
  it.each(['mfa_challenge', 'suspended'] as const)('keeps the native %s gate active after validation', async (gate) => {
    family.active = true;
    familyAuthStore.setState({ isAuthenticated: true, isLoading: false, authGate: gate, authCheckFailed: false });
    useAuthStore.setState({
      user: buildUser(),
      isAuthenticated: true,
      isLoading: false,
      loadUser: vi.fn(async () => {}),
    });
    mount();
    expect(
      await screen.findByText(gate === 'mfa_challenge' ? 'Sign-in route' : 'Current Family access refusal')
    ).toBeVisible();
    expect(screen.queryByText('Validated dashboard')).not.toBeInTheDocument();
  });

  it('holds a settled cached Family identity at owned recovery when current access is unknown', async () => {
    family.active = true;
    familyAuthStore.setState({ isAuthenticated: true, isLoading: false, authGate: null, authCheckFailed: true });
    const loadUser = vi.fn(async () => {
      useAuthStore.setState({ isLoading: false, authCheckFailed: true });
    });
    useAuthStore.setState({ user: buildUser(), isAuthenticated: true, isLoading: false, loadUser });
    mount();
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByText('Validated dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(useInAppNotificationListener).toHaveBeenLastCalledWith(false);
  });

  it('holds a cached Family identity until current membership/session validation completes', async () => {
    family.active = true;
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const loadUser = vi.fn(async () => {
      useAuthStore.setState({ isLoading: true });
      await pending;
      familyAuthStore.setState({ isAuthenticated: true, isLoading: false, authGate: 'ok', authCheckFailed: false });
      useAuthStore.setState({ isLoading: false });
    });
    useAuthStore.setState({ user: buildUser(), isAuthenticated: true, isLoading: true, loadUser });
    mount();
    expect(loadUser).toHaveBeenCalledExactlyOnceWith();
    expect(screen.queryByText('Validated dashboard')).not.toBeInTheDocument();
    await act(async () => {
      complete();
      await pending;
    });
    await waitFor(() => expect(screen.getByText('Validated dashboard')).toBeInTheDocument());
  });

  it('does not expose the cached Family dashboard when validation reports a signed-out session', async () => {
    family.active = true;
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const loadUser = vi.fn(async () => {
      useAuthStore.setState({ isLoading: true });
      await pending;
      useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
    });
    useAuthStore.setState({ user: buildUser(), isAuthenticated: true, isLoading: true, loadUser });
    mount();
    expect(loadUser).toHaveBeenCalledExactlyOnceWith();
    expect(screen.queryByText('Validated dashboard')).not.toBeInTheDocument();
    await act(async () => {
      complete();
      await pending;
    });
    await waitFor(() => expect(screen.getByText('Sign-in route')).toBeInTheDocument());
    expect(screen.queryByText('Validated dashboard')).not.toBeInTheDocument();
  });

  it('retains native cookie-mode immediate rendering with silent validation', async () => {
    const loadUser = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ user: buildUser(), isAuthenticated: true, isLoading: true, loadUser });
    mount();
    expect(loadUser).toHaveBeenCalledExactlyOnceWith({ silent: true });
    await waitFor(() => expect(screen.getByText('Validated dashboard')).toBeInTheDocument());
  });
  it('defers account data and widgets until cached Family membership and native validation are ready', async () => {
    family.active = true;
    familyAuthStore.setState({
      isAuthenticated: true,
      isLoading: true,
      authGate: null,
      loadUser: vi.fn(async () => {}),
    });
    const settings = vi.fn(async () => {}),
      addons = vi.fn(async () => {}),
      plugins = vi.fn(async () => {});
    useSettingsStore.setState({ loadSettings: settings });
    useAddonStore.setState({ loadAddons: addons });
    usePluginStore.setState({ loadPlugins: plugins });
    useAuthStore.setState({
      user: buildUser(),
      isAuthenticated: true,
      isLoading: true,
      loadUser: vi.fn(async () => {}),
    });
    mount();
    expect(settings).not.toHaveBeenCalled();
    expect(addons).not.toHaveBeenCalled();
    expect(plugins).not.toHaveBeenCalled();
    await act(async () => {
      useAuthStore.setState({ isLoading: false });
    });
    expect(settings).not.toHaveBeenCalled();
    expect(screen.queryByText('Validated dashboard')).not.toBeInTheDocument();
    expect(useInAppNotificationListener).toHaveBeenLastCalledWith(false);
    await act(async () => {
      familyAuthStore.setState({ authGate: 'ok', isLoading: false });
    });
    await waitFor(() => expect(screen.getByText('Validated dashboard')).toBeInTheDocument());
    expect(settings).toHaveBeenCalledOnce();
    expect(addons).toHaveBeenCalledOnce();
    expect(plugins).toHaveBeenCalledOnce();
    expect(useInAppNotificationListener).toHaveBeenLastCalledWith(true);
  });
  it('validates a cached Family identity even when the document opens at login', () => {
    family.active = true;
    const loadUser = vi.fn(async () => {});
    useAuthStore.setState({ user: buildUser(), isAuthenticated: true, isLoading: true, loadUser });
    mount('/login');
    expect(loadUser).toHaveBeenCalledExactlyOnceWith();
  });
});
