import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUser } from '../tests/helpers/factories';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '../tests/helpers/render';
import { resetAllStores } from '../tests/helpers/store';
import App from './App';
import { apiClient } from './api/client';
import FamilyAdminPage from './integrations/family/FamilyAdminPage';
import { installFamilyFrontend } from './integrations/family/bootstrap';
import { apiClient as oldClient } from './integrations/family/legacy/api/client';
import { isSupabaseDataPlane } from './integrations/family/legacy/data/supabase/auth';
import { familyAuthStore } from './integrations/family/repository';
import { activateFamilyFrontend, isFamilyFrontendActive } from './integrations/family/runtime';
import { useAddonStore } from './store/addonStore';
import { useAuthStore } from './store/authStore';
import { usePluginStore } from './store/pluginStore';
import { useSettingsStore } from './store/settingsStore';

const fixture = vi.hoisted(() => ({ phone: false, adminRpc: vi.fn(), oldDefaults: vi.fn() }));
vi.mock('./mobile/useIsPhone', () => ({ useIsPhone: () => fixture.phone }));
vi.mock('./pages/AdminPage', async () => {
  const { default: Defaults } = await import('./components/Admin/DefaultUserSettingsTab');
  return {
    default: () => (
      <section aria-label="Standalone desktop defaults">
        <Defaults />
      </section>
    ),
  };
});
vi.mock('./mobile/screens/admin/MAdmin', async () => {
  const { default: Defaults } = await import('./mobile/screens/admin/MAdminDefaultUserSettings');
  return {
    default: () => (
      <section aria-label="Standalone phone defaults">
        <Defaults />
      </section>
    ),
  };
});
vi.mock('./integrations/family/legacy/pages/admin/useAdmin', () => ({
  useAdmin: () => ({ activeTab: 'defaults', supabasePlane: isSupabaseDataPlane(), setActiveTab: vi.fn() }),
}));
vi.mock('./integrations/family/legacy/pages/admin/AdminUserModals', () => ({ default: () => null }));
vi.mock('./integrations/family/legacy/components/Layout/PageShell', () => ({
  default: ({ children }: PropsWithChildren) => children,
}));
vi.mock('./hooks/useInAppNotificationListener.ts', () => ({ useInAppNotificationListener: vi.fn() }));
vi.mock('./hooks/useGeolocation', () => ({
  useGeolocation: () => ({ position: null, mode: 'off', error: null, errorCode: null, cycleMode: vi.fn() }),
}));
vi.mock('@family/backend/supabase/client', async (original) => ({
  ...(await original<typeof import('@family/backend/supabase/client')>()),
  getSupabaseBrowserClient: () => ({ rpc: fixture.adminRpc }),
}));

const template = 'https://tiles.fixture.invalid/street/{z}/{x}/{y}.png?layer=city';
const priorTemplate = 'https://tile.openstreetmap.de/{z}/{x}/{y}.png';
const familyId = '0b930000-0000-4000-8000-000000000041';
const nativeAdapter = apiClient.defaults.adapter;
const legacyAdapter = oldClient.defaults.adapter;
const oldFamily = familyAuthStore.getState();
const writes: unknown[] = [];

function seedFamily(role: 'patriarch' | 'parent') {
  activateFamilyFrontend();
  familyAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    authCheckFailed: false,
    authGate: 'ok',
    familyId,
    membershipRole: role,
    authUserId: '0b930000-0000-4000-8000-000000000042',
    personId: '0b930000-0000-4000-8000-000000000043',
  });
}

function resetField(label: string) {
  const field = screen.getAllByText(label).find((node) => node.tagName === 'LABEL');
  if (!field) throw new Error('Missing defaults field ' + label);
  return within(field).getByRole('button');
}

beforeEach(() => {
  resetAllStores();
  fixture.phone = false;
  fixture.adminRpc.mockReset();
  fixture.oldDefaults.mockReset();
  writes.length = 0;
  useAuthStore.setState({
    user: buildUser({ role: 'admin', mfa_enabled: true }),
    isAuthenticated: true,
    isLoading: false,
    appRequireMfa: false,
    loadUser: vi.fn(async () => {}),
  });
  useAddonStore.setState({ loaded: true, loadAddons: vi.fn(async () => {}) });
  usePluginStore.setState({ loadPlugins: vi.fn(async () => {}) });
  useSettingsStore.setState({ loadSettings: vi.fn(async () => {}) });
  let defaults: { map_provider: string; map_tile_url?: string } = {
    map_provider: 'leaflet',
    map_tile_url: priorTemplate,
  };
  apiClient.defaults.adapter = (config) => {
    let data: unknown = config.url === '/system-notices/active' ? [] : {};
    if (config.url === '/admin/default-user-settings') {
      if (config.method === 'put') {
        const patch = JSON.parse(config.data);
        writes.push(patch);
        defaults = { ...defaults, ...patch };
        if (patch.map_tile_url === null) delete defaults.map_tile_url;
      }
      data = { ...defaults };
    }
    return Promise.resolve({ config, data, status: 200, statusText: 'OK', headers: {} });
  };
  oldClient.defaults.adapter = (config) => {
    if (config.url === '/admin/default-user-settings') fixture.oldDefaults();
    return Promise.resolve({ config, data: {}, status: 200, statusText: 'OK', headers: {} });
  };
});

afterEach(() => {
  cleanup();
  familyAuthStore.setState(oldFamily, true);
  apiClient.defaults.adapter = nativeAdapter;
  oldClient.defaults.adapter = legacyAdapter;
  vi.unstubAllEnvs();
});

describe('actual App Admin defaults routing', () => {
  it('standalone desktop renders Leaflet, saves a custom template and resets through the native defaults endpoint', async () => {
    vi.stubEnv('VITE_DATA_PLANE', 'nest');
    const fixtureAdapter = apiClient.defaults.adapter;
    installFamilyFrontend();
    expect(apiClient.defaults.adapter).toBe(fixtureAdapter);
    expect(isFamilyFrontendActive()).toBe(false);
    const { container } = render(<App />, { initialEntries: ['/admin'] });
    await screen.findByRole('region', { name: 'Standalone desktop defaults' });
    const field = await screen.findByDisplayValue(priorTemplate);
    fireEvent.change(field, { target: { value: template } });
    await waitFor(() =>
      expect(container.querySelector('.leaflet-tile[src*="tiles.fixture.invalid/street/"]')).not.toBeNull()
    );
    expect(screen.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/copyright'
    );
    fireEvent.blur(field);
    await waitFor(() => expect(writes).toEqual([{ map_tile_url: template }]));
    fireEvent.click(resetField('Map Template'));
    await waitFor(() => expect(writes).toEqual([{ map_tile_url: template }, { map_tile_url: null }]));
    expect(fixture.adminRpc).not.toHaveBeenCalled();
    expect(fixture.oldDefaults).not.toHaveBeenCalled();
  });

  it('standalone phone takes the native Defaults route', async () => {
    vi.stubEnv('VITE_DATA_PLANE', 'nest');
    fixture.phone = true;
    installFamilyFrontend();
    render(<App />, { initialEntries: ['/admin'] });
    expect(await screen.findByRole('region', { name: 'Standalone phone defaults' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue(priorTemplate)).toBeInTheDocument();
    expect(fixture.oldDefaults).not.toHaveBeenCalled();
  });

  it('standalone never opens the copied defaults endpoint through a direct Family Admin mount', async () => {
    vi.stubEnv('VITE_DATA_PLANE', 'nest');
    await act(async () => {
      render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    });
    expect(fixture.oldDefaults).not.toHaveBeenCalled();
    expect(fixture.adminRpc).not.toHaveBeenCalled();
  });

  it('Family Admin reads, saves and resets preference defaults through the Family RPC', async () => {
    vi.stubEnv('VITE_DATA_PLANE', 'supabase');
    seedFamily('patriarch');
    fixture.adminRpc.mockImplementation((name: string, args: { p_patch?: Record<string, unknown> }) =>
      Promise.resolve({
        data: {
          family_id: familyId,
          can_manage: true,
          defaults: name === 'get_family_preference_defaults' ? { temperature_unit: 'celsius' } : args.p_patch,
        },
        error: null,
      })
    );
    render(<App />, { initialEntries: ['/admin'] });
    const choice = await screen.findByRole('button', { name: /fahrenheit/i });
    expect(fixture.adminRpc).toHaveBeenCalledWith('get_family_preference_defaults', { p_family_id: familyId });
    fireEvent.click(choice);
    await waitFor(() => expect(choice).toHaveClass('border-accent'));
    fireEvent.click(resetField('Temperature Unit'));
    await waitFor(() =>
      expect(fixture.adminRpc).toHaveBeenLastCalledWith('update_family_preference_defaults', {
        p_family_id: familyId,
        p_patch: { temperature_unit: null },
      })
    );
    expect(fixture.adminRpc).toHaveBeenCalledWith('update_family_preference_defaults', {
      p_family_id: familyId,
      p_patch: { temperature_unit: 'fahrenheit' },
    });
    expect(fixture.oldDefaults).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('Family Admin honors read-only defaults for an admitted admin reviewer', async () => {
    vi.stubEnv('VITE_DATA_PLANE', 'supabase');
    seedFamily('parent');
    fixture.adminRpc.mockResolvedValue({
      data: { family_id: familyId, can_manage: false, defaults: { temperature_unit: 'celsius' } },
      error: null,
    });
    render(<App />, { initialEntries: ['/admin'] });
    const choice = await screen.findByRole('button', { name: /fahrenheit/i });
    expect(choice).toBeDisabled();
    fireEvent.click(choice);
    expect(fixture.adminRpc).toHaveBeenCalledExactlyOnceWith('get_family_preference_defaults', {
      p_family_id: familyId,
    });
    expect(fixture.oldDefaults).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});
