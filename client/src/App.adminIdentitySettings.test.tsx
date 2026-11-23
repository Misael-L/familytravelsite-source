import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAdmin } from '../tests/helpers/factories';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '../tests/helpers/render';
import { resetAllStores } from '../tests/helpers/store';
import App from './App';
import { apiClient } from './api/client';
import FamilyAdminPage from './integrations/family/FamilyAdminPage';
import { apiClient as copiedClient } from './integrations/family/legacy/api/client';
import { ToastContainer as FamilyToasts } from './integrations/family/legacy/components/shared/Toast';
import { useFamilyFeatureStore } from './integrations/family/legacy/store/familyFeatureStore';
import { familyAuthStore } from './integrations/family/repository';
import { activateFamilyFrontend } from './integrations/family/runtime';
import { useAddonStore } from './store/addonStore';
import { useAuthStore } from './store/authStore';
import { usePluginStore } from './store/pluginStore';
import { useSettingsStore } from './store/settingsStore';

const memberAdmin = vi.hoisted(() => ({
  members: vi.fn(),
  requests: vi.fn(),
  stats: vi.fn(),
  approve: vi.fn(),
  deny: vi.fn(),
  updateRole: vi.fn(),
  updateName: vi.fn(),
  from: vi.fn(),
  invoke: vi.fn(),
}));

const fixture = vi.hoisted(() => ({ phone: false, familyActive: false, rpc: vi.fn(), copiedReads: vi.fn() }));
vi.mock('./mobile/useIsPhone', () => ({ useIsPhone: () => fixture.phone }));
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: (await import('react-router')).useNavigate,
}));
vi.mock('./integrations/family/runtime', () => ({
  isFamilyFrontendActive: () => fixture.familyActive,
  activateFamilyFrontend: () => {
    fixture.familyActive = true;
  },
}));
vi.mock('./hooks/useInAppNotificationListener.ts', () => ({ useInAppNotificationListener: vi.fn() }));
vi.mock('./integrations/family/legacy/data/supabase/familyAdmin', async (original) => ({
  ...(await original<typeof import('./integrations/family/legacy/data/supabase/familyAdmin')>()),
  listFamilyAdminMembers: memberAdmin.members,
  listPendingAccessRequests: memberAdmin.requests,
  loadFamilyAdminStats: memberAdmin.stats,
  approveAccessRequest: memberAdmin.approve,
  denyAccessRequest: memberAdmin.deny,
  updateFamilyMemberRole: memberAdmin.updateRole,
  updateFamilyMemberDisplayName: memberAdmin.updateName,
}));
vi.mock('@family/backend/supabase/client', async (original) => ({
  ...(await original<typeof import('@family/backend/supabase/client')>()),
  getSupabaseBrowserClient: () => ({
    rpc: fixture.rpc,
    from: memberAdmin.from,
    functions: { invoke: memberAdmin.invoke },
  }),
}));

vi.mock('./integrations/family/legacy/hooks/useCountUp', () => ({ useCountUp: (value: number) => value }));

const nativeAdapter = apiClient.defaults.adapter;
const copiedAdapter = copiedClient.defaults.adapter;
const initialFamily = familyAuthStore.getState();
const familyId = '0b930000-0000-4000-8000-000000000051';
const unlinkedUserId = '0b930000-0000-4000-8000-000000000058';
const rosterPersonId = '0b930000-0000-4000-8000-000000000059';
const instanceOidcPath = '/admin/oidc';
const instanceOidcTitle = 'Single Sign-On (OIDC)';
const savedOidc = {
  issuer: 'https://fixture-idp.example.test',
  client_id: 'fixture-oidc-client',
  display_name: 'Fixture sign-on',
  discovery_url: '',
  client_secret: '',
  client_secret_set: true,
};
const updatedOidcName = 'Updated fixture sign-on';
const instanceKeysPath = '/auth/me/settings';
const saveKeysPath = '/auth/me/api-keys';
const validateKeysPath = '/auth/validate-keys';
const appSettingsPath = '/auth/app-settings';
const smtpTestPath = '/notifications/test-smtp';
const storedSmtpHost = 'mail.fixture.test';
const updatedSmtpHost = 'replacement-mail.fixture.test';
const storedRpId = 'trek.fixture.test';
const updatedRpId = 'updated-trek.fixture.test';
const appSettingsMask = '••••••••';
const storedUnsplash = 'fixture-photo-value';
const updatedUnsplash = 'fixture-replaced-photo-value';
const mapKeys = {
  family_id: familyId,
  can_manage: true,
  default_option_id: 'osm',
  enabled_option_ids: ['osm', 'osm-de'],
  mapbox_configured: false,
  carto_configured: false,
};
const nativeReads: string[] = [];
const nativeWrites: Array<{ url: string; data: unknown }> = [];
let updateAppConfig: { managed?: boolean } = {};
let pendingSmtpSave: Promise<void> | null = null;

function seedFamily() {
  vi.stubEnv('VITE_DATA_PLANE', 'supabase');
  activateFamilyFrontend();
  familyAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    authCheckFailed: false,
    authGate: 'ok',
    isSuperAdmin: false,
    familyId,
    membershipRole: 'patriarch',
    authUserId: '0b930000-0000-4000-8000-000000000055',
    personId: '0b930000-0000-4000-8000-000000000056',
  });

  let personLinked = false;
  fixture.rpc.mockImplementation(async (name: string) => {
    const scope = { family_id: familyId, can_manage: true };
    switch (name) {
      case 'get_family_map_settings':
      case 'get_my_effective_map_settings':
        return { data: mapKeys, error: null };
      case 'get_family_notification_defaults':
        return { data: { ...scope, defaults: [], health: { active_ios_devices: 2 } }, error: null };
      case 'get_family_identity_assurance':
        return {
          data: {
            ...scope,
            members: [
              {
                member_id: '0b930000-0000-4000-8000-000000000057',
                user_id: unlinkedUserId,
                person_id: personLinked ? rosterPersonId : null,
                role: 'guest',
                status: 'active',
                email_confirmed: true,
                person_linked: personLinked,
                providers: ['email'],
              },
            ],
            unlinked_people: personLinked ? [] : [{ person_id: rosterPersonId, display_name: 'Fixture roster person' }],
            pending_requests: [],
          },
          error: null,
        };
      case 'get_family_file_policy':
        return { data: { ...scope, retention_days: 45, trip_file_max_bytes: 42 * 1024 * 1024 }, error: null };
      case 'list_family_permission_policies':
        return { data: { ...scope, policies: [] }, error: null };
      case 'link_family_member_person':
        personLinked = true;
        return { data: { ok: true }, error: null };
      default:
        throw new Error('Unexpected Admin fixture RPC ' + name);
    }
  });
}

async function openAdminTab(phone = false, name = 'Settings') {
  if (phone) {
    fireEvent.click(await screen.findByRole('button', { name: 'Administration' }));
    fireEvent.click(await screen.findByRole('button', { name }));
  } else {
    fireEvent.click(await screen.findByText(name, { selector: 'nav button span' }));
  }
}

beforeEach(() => {
  resetAllStores();
  memberAdmin.from.mockReset();
  memberAdmin.invoke.mockReset();
  memberAdmin.members.mockReset().mockResolvedValue([]);
  memberAdmin.requests.mockReset().mockResolvedValue([]);
  memberAdmin.stats.mockReset().mockResolvedValue({ totalUsers: 0, totalTrips: 0, totalPlaces: 0, totalFiles: 0 });
  for (const command of [memberAdmin.approve, memberAdmin.deny, memberAdmin.updateRole, memberAdmin.updateName]) {
    command.mockReset().mockResolvedValue(undefined);
  }
  fixture.phone = false;
  fixture.familyActive = false;
  fixture.rpc.mockReset();
  fixture.copiedReads.mockReset();
  updateAppConfig = {};
  pendingSmtpSave = null;
  nativeReads.length = 0;
  nativeWrites.length = 0;
  vi.stubEnv('VITE_DATA_PLANE', 'nest');
  useAuthStore.setState({
    user: buildAdmin({ mfa_enabled: true }),
    isAuthenticated: true,
    isLoading: false,
    appRequireMfa: false,
    loadUser: vi.fn(async () => {}),
  });
  useAddonStore.setState({ loaded: true, loadAddons: vi.fn(async () => {}) });
  usePluginStore.setState({ loadPlugins: vi.fn(async () => {}) });
  useSettingsStore.setState({ loadSettings: vi.fn(async () => {}) });

  let displayName = savedOidc.display_name;
  let unsplashValue = storedUnsplash;
  let appSettings = {
    smtp_host: storedSmtpHost,
    smtp_port: '587',
    smtp_pass: appSettingsMask,
    notification_channels: 'email',
    webauthn_rp_id: storedRpId,
    webauthn_origins: 'https://' + storedRpId,
  };
  apiClient.defaults.adapter = async (config) => {
    const url = config.url ?? '';
    let data: unknown = { users: [], invites: [], trips: [], countries: [], regions: [] };
    if (url === '/system-notices/active') data = [];
    if (url === '/auth/app-config') data = { allowed_file_types: 'jpg,png', ...updateAppConfig };
    if (url === '/admin/permissions') data = { permissions: [] };
    if (url === '/notifications/in-app/unread-count') data = { count: 0 };
    if (url === appSettingsPath) {
      if (config.method === 'put') {
        const input = JSON.parse(config.data);
        nativeWrites.push({ url, data: input });
        if ('smtp_host' in input && pendingSmtpSave !== null) await pendingSmtpSave;
        appSettings = { ...appSettings, ...input };
        data = { success: true };
      } else {
        nativeReads.push(url);
        data = updateAppConfig.managed ? { notification_channels: 'email' } : appSettings;
      }
    }
    if (url === '/admin/notification-preferences') {
      data = { event_types: [], channels: [], implemented_combos: {}, preferences: {} };
    }
    if (url === '/admin/notification-preferences/defaults') {
      data = { event_types: [], channels: [], implemented_combos: {}, defaults: {} };
    }
    if (url === smtpTestPath && config.method === 'post') {
      nativeWrites.push({ url, data: JSON.parse(config.data) });
      data = { success: true };
    }
    if (url === instanceKeysPath) {
      nativeReads.push(url);
      data = {
        settings: updateAppConfig.managed
          ? { maps_api_key: null, unsplash_api_key: null, amap_api_key: null }
          : { maps_api_key: null, unsplash_api_key: unsplashValue, env_keys: { maps_api_key: 'PLACES_API_KEY' } },
      };
    }
    if (url === saveKeysPath && config.method === 'put') {
      const input = JSON.parse(config.data);
      nativeWrites.push({ url, data: input });
      unsplashValue = input.unsplash_api_key ?? unsplashValue;
      data = { success: true, user: buildAdmin({ mfa_enabled: true }) };
    }
    if (url === validateKeysPath) {
      nativeReads.push(url);
      data = { maps: true };
    }
    if (url === instanceOidcPath) {
      if (config.method === 'put') {
        const input = JSON.parse(config.data);
        nativeWrites.push({ url, data: input });
        displayName = input.display_name;
        data = { success: true };
      } else {
        nativeReads.push(url);
        data = { ...savedOidc, display_name: displayName };
      }
    }
    return { config, data, status: 200, statusText: 'OK', headers: {} };
  };
  copiedClient.defaults.adapter = async (config) => {
    const oidc = config.url === instanceOidcPath;
    if (oidc || config.url === instanceKeysPath || config.url === appSettingsPath) fixture.copiedReads(config.url);
    const data = oidc ? savedOidc : { users: [], invites: [], trips: [], permissions: [], enabled: false };
    return { config, data, status: 200, statusText: 'OK', headers: {} };
  };
});

afterEach(() => {
  cleanup();
  familyAuthStore.setState(initialFamily, true);
  apiClient.defaults.adapter = nativeAdapter;
  copiedClient.defaults.adapter = copiedAdapter;
  vi.unstubAllEnvs();
});

describe('Website Admin instance OIDC routing', () => {
  it.each([false, true])('loads and saves standalone OIDC settings on phone=%s', async (phone) => {
    fixture.phone = phone;
    const view = render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab(phone);
    const displayName = await screen.findByDisplayValue(savedOidc.display_name);
    const card = displayName.closest(phone ? '[class*="--m-sheetop"]' : 'section');
    if (!card) throw new Error('Missing OIDC settings card');

    const settings = within(card as HTMLElement);
    expect(settings.getByText(instanceOidcTitle)).toBeInTheDocument();
    expect(settings.getByPlaceholderText('••••••••')).toHaveValue('');
    fireEvent.change(displayName, { target: { value: updatedOidcName } });
    fireEvent.click(settings.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(nativeWrites).toEqual([
        {
          url: instanceOidcPath,
          data: {
            issuer: savedOidc.issuer,
            client_id: savedOidc.client_id,
            display_name: updatedOidcName,
            discovery_url: savedOidc.discovery_url,
          },
        },
      ])
    );

    view.unmount();
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab(phone);
    expect(await screen.findByDisplayValue(updatedOidcName)).toBeInTheDocument();
    expect(nativeReads.filter((url) => url === instanceOidcPath)).toHaveLength(2);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it.each([false, true])('omits standalone OIDC on a known-managed install on phone=%s', async (phone) => {
    fixture.phone = phone;
    updateAppConfig = { managed: true };
    useAuthStore.setState({ managed: true });
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab(phone);
    expect(screen.queryByText(instanceOidcTitle)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(savedOidc.display_name)).not.toBeInTheDocument();
    expect(nativeReads).not.toContain(instanceOidcPath);
    expect(nativeWrites).toEqual([]);
  });

  it.each([false, true])(
    'loads installed Family identity settings without an OIDC request on phone=%s',
    async (phone) => {
      fixture.phone = phone;
      seedFamily();
      render(<App />, { initialEntries: ['/admin'] });
      await openAdminTab();
      expect(await screen.findByRole('heading', { name: 'Identity and file policy' })).toBeInTheDocument();
      expect(fixture.rpc).toHaveBeenCalledWith('get_family_identity_assurance', { p_family_id: familyId });
      expect(fixture.rpc).toHaveBeenCalledWith('get_family_file_policy', { p_family_id: familyId });
      expect(screen.queryByText(instanceOidcTitle)).not.toBeInTheDocument();
      expect(nativeReads).not.toContain(instanceOidcPath);
      expect(nativeWrites).toEqual([]);
      expect(fixture.copiedReads).not.toHaveBeenCalled();
    }
  );

  it('skips the copied OIDC request when the Family wrapper is mounted on Nest', async () => {
    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    await openAdminTab();
    expect(screen.queryByText(instanceOidcTitle)).not.toBeInTheDocument();
    expect(fixture.copiedReads).not.toHaveBeenCalledWith(instanceOidcPath);
    expect(nativeReads).not.toContain(instanceOidcPath);
    expect(nativeWrites).toEqual([]);
  });
});

describe('Family identity settings session routing', () => {
  function signOutAndReturn() {
    act(() => {
      familyAuthStore.setState({ isAuthenticated: false });
      familyAuthStore.setState({ isAuthenticated: true, membershipRole: 'parent' });
    });
  }

  it('discards pending Family identity data when the same account returns with different access', async () => {
    seedFamily();
    const other = fixture.rpc.getMockImplementation();
    if (!other) throw new Error('Missing Family adapter');
    let finishFirstRead = () => {};
    const firstRead = new Promise<void>((resolve) => {
      finishFirstRead = resolve;
    });
    let identityReads = 0;
    fixture.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      const result = await other(name, args);
      if (name !== 'get_family_identity_assurance') return result;
      if (++identityReads === 1) {
        await firstRead;
        return result;
      }
      return { ...result, data: { ...result.data, can_manage: false } };
    });

    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    await openAdminTab();
    await waitFor(() => expect(identityReads).toBe(1));
    signOutAndReturn();
    await act(async () => {
      finishFirstRead();
    });

    expect(screen.queryByRole('button', { name: 'Link account' })).not.toBeInTheDocument();
    expect(await screen.findByText(/view only.*head of family/i)).toBeInTheDocument();
    expect(identityReads).toBe(2);
  });

  it('ignores a late identity-link completion after the Family access context changes', async () => {
    seedFamily();
    const other = fixture.rpc.getMockImplementation();
    if (!other) throw new Error('Missing Family adapter');
    let finishLink = () => {};
    const pendingLink = new Promise<void>((resolve) => {
      finishLink = resolve;
    });
    let identityReads = 0;
    fixture.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'link_family_member_person') await pendingLink;
      const result = await other(name, args);
      if (name !== 'get_family_identity_assurance' || ++identityReads === 1) return result;
      return { ...result, data: { ...result.data, can_manage: false } };
    });

    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    await openAdminTab();
    await screen.findByRole('heading', { name: 'Identity and file policy' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: rosterPersonId } });
    fireEvent.click(screen.getByRole('button', { name: 'Link account' }));
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith('link_family_member_person', {
        p_family_id: familyId,
        p_person_id: rosterPersonId,
        p_user_id: unlinkedUserId,
      })
    );

    signOutAndReturn();
    expect(await screen.findByText(/view only.*head of family/i)).toBeInTheDocument();
    await act(async () => {
      finishLink();
    });
    expect(identityReads).toBe(2);
    expect(screen.queryByRole('button', { name: 'Link account' })).not.toBeInTheDocument();
  });
});

describe('Website Admin instance API keys', () => {
  it.each([false, true])('loads and saves the native instance key form on phone=%s', async (phone) => {
    fixture.phone = phone;
    const view = render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab(phone);
    const unsplash = await screen.findByDisplayValue(storedUnsplash);
    const card = phone
      ? unsplash.closest('[class*="--m-sheetop"]')
      : screen.getByRole('heading', { name: 'API Keys' }).closest('section');
    if (!(card instanceof HTMLElement)) throw new Error('Missing the API keys card');
    const settings = within(card);
    expect(settings.getByText('API Keys')).toBeInTheDocument();
    expect(settings.getByPlaceholderText('Set via PLACES_API_KEY')).toBeDisabled();

    fireEvent.change(unsplash, { target: { value: updatedUnsplash } });
    fireEvent.click(settings.getByRole('button', { name: 'Test' }));
    await waitFor(() => expect(nativeReads).toContain(validateKeysPath));
    expect(nativeWrites).toEqual([
      {
        url: saveKeysPath,
        data: { unsplash_api_key: updatedUnsplash, openweather_api_key: '', amap_api_key: '' },
      },
    ]);

    view.unmount();
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab(phone);
    expect(await screen.findByDisplayValue(updatedUnsplash)).toBeInTheDocument();
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it.each([false, true])('hides instance API-key controls on a managed install on phone=%s', async (phone) => {
    fixture.phone = phone;
    updateAppConfig = { managed: true };
    useAuthStore.setState({ managed: true });
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab(phone);
    expect(screen.queryByText('API Keys')).not.toBeInTheDocument();
    expect(nativeReads).not.toContain(validateKeysPath);
    expect(nativeWrites).toEqual([]);
  });

  it.each([false, true])('loads Family Maps through its own API on phone=%s', async (phone) => {
    fixture.phone = phone;
    seedFamily();
    render(<App />, { initialEntries: ['/admin'] });
    fireEvent.click(await screen.findByText('Maps', { selector: 'nav button span' }));
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('osm'));
    expect(fixture.rpc).toHaveBeenCalledWith('get_family_map_settings', { p_family_id: familyId });
    expect(screen.queryByText('API Keys')).not.toBeInTheDocument();
    expect(fixture.copiedReads).not.toHaveBeenCalledWith(instanceKeysPath);
    expect(nativeReads).not.toContain(instanceKeysPath);
    expect(nativeWrites).toEqual([]);
  });

  it('skips the copied API-key request when the Family wrapper is mounted on Nest', async () => {
    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    await openAdminTab();
    expect(screen.queryByText('API Keys')).not.toBeInTheDocument();
    expect(fixture.copiedReads).not.toHaveBeenCalledWith(instanceKeysPath);
    expect(nativeReads).not.toContain(instanceKeysPath);
    expect(nativeWrites).toEqual([]);
  });
});

describe('Family Maps session routing', () => {
  async function openFamilyMaps() {
    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    fireEvent.click(await screen.findByText('Maps', { selector: 'nav button span' }));
  }

  function loseMapManagement() {
    act(() => {
      familyAuthStore.setState({ isAuthenticated: false });
      familyAuthStore.setState({ isAuthenticated: true, membershipRole: 'parent' });
    });
  }

  it('discards a map settings read from an earlier Family session', async () => {
    seedFamily();
    let releaseRead = () => {};
    const pendingRead = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let reads = 0;
    fixture.rpc.mockImplementation(async (name: string) => {
      if (name !== 'get_family_map_settings') throw new Error('Unexpected Maps fixture RPC ' + name);
      if (++reads === 1) {
        await pendingRead;
        return { data: mapKeys, error: null };
      }
      return { data: { ...mapKeys, can_manage: false }, error: null };
    });

    await openFamilyMaps();
    await waitFor(() => expect(reads).toBe(1));
    loseMapManagement();
    await act(async () => releaseRead());

    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    expect(await screen.findByText(/view only.*change map credentials/i)).toBeInTheDocument();
    expect(reads).toBe(2);
  });

  it('ignores a late map settings save after Family access changes', async () => {
    seedFamily();
    let releaseSave = () => {};
    const pendingSave = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    let reads = 0;
    fixture.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_family_map_settings') {
        return { data: { ...mapKeys, can_manage: ++reads === 1 }, error: null };
      }
      if (name === 'update_family_map_settings') await pendingSave;
      return { data: { ...mapKeys, default_option_id: 'osm-de' }, error: null };
    });

    await openFamilyMaps();
    await screen.findByRole('heading', { name: 'Family maps' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'osm-de' } });
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith('update_family_map_settings', {
        p_family_id: familyId,
        p_patch: { default_option_id: 'osm-de' },
      })
    );

    loseMapManagement();
    await act(async () => releaseSave());
    expect(screen.getByRole('combobox')).toHaveValue('osm');
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(fixture.rpc).not.toHaveBeenCalledWith('get_my_effective_map_settings', { p_family_id: familyId });
  });
});

describe('Website Admin mail and passkey settings', () => {
  it.each([false, true])('loads and saves standalone SMTP settings on phone=%s', async (phone) => {
    fixture.phone = phone;
    const view = render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab(phone, 'Notifications');
    const host = await screen.findByDisplayValue(storedSmtpHost);
    const card = host.closest(phone ? '[class*="--m-sheetop"]' : 'section');
    if (!(card instanceof HTMLElement)) throw new Error('Missing SMTP card');
    const fields = within(card);
    expect(fields.getByText('Email (SMTP)')).toBeInTheDocument();
    expect(fields.getByPlaceholderText(appSettingsMask)).toHaveValue('');

    fireEvent.change(host, { target: { value: updatedSmtpHost } });
    fireEvent.click(fields.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(nativeWrites).toEqual([
        { url: appSettingsPath, data: { smtp_host: updatedSmtpHost, smtp_port: '587', smtp_pass: appSettingsMask } },
      ])
    );
    view.unmount();
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab(phone, 'Notifications');
    expect(await screen.findByDisplayValue(updatedSmtpHost)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(appSettingsMask, { exact: true })).toHaveValue('');
    expect(nativeReads.filter((url) => url === appSettingsPath)).toHaveLength(2);
  });

  it.each([false, true])('loads and saves native WebAuthn settings on phone=%s', async (phone) => {
    fixture.phone = phone;
    const view = render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab(phone);
    const rpId = await screen.findByDisplayValue(storedRpId);
    const origins = screen.getByDisplayValue('https://' + storedRpId);
    const card = rpId.closest(phone ? '[class*="--m-sheetop"]' : 'section');
    if (!(card instanceof HTMLElement)) throw new Error('Missing passkey card');
    fireEvent.change(rpId, { target: { value: updatedRpId } });
    fireEvent.change(origins, { target: { value: 'https://' + updatedRpId } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(nativeWrites).toEqual([
        { url: appSettingsPath, data: { webauthn_rp_id: updatedRpId, webauthn_origins: 'https://' + updatedRpId } },
      ])
    );
    view.unmount();
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab(phone);
    expect(await screen.findByDisplayValue(updatedRpId)).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://' + updatedRpId)).toBeInTheDocument();
  });

  it.each([false, true])('hides operator SMTP controls on managed phone=%s', async (phone) => {
    fixture.phone = phone;
    updateAppConfig = { managed: true };
    useAuthStore.setState({ managed: true });
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab(phone, 'Notifications');
    expect(await screen.findByText('Trip Reminders')).toBeInTheDocument();
    expect(screen.queryByText('Email (SMTP)')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('mail.example.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send test email/i })).not.toBeInTheDocument();
    expect(nativeWrites).toEqual([]);
  });

  it.each([false, true])('stops SMTP test dispatch if managed mode arrives during save on phone=%s', async (phone) => {
    fixture.phone = phone;
    let releaseSave = () => {};
    pendingSmtpSave = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab(phone, 'Notifications');
    const host = await screen.findByDisplayValue(storedSmtpHost);
    const card = host.closest(phone ? '[class*="--m-sheetop"]' : 'section');
    if (!(card instanceof HTMLElement)) throw new Error('Missing SMTP card');
    fireEvent.click(within(card).getByRole('button', { name: /send test email/i }));
    await waitFor(() => expect(nativeWrites.map(({ url }) => url)).toEqual([appSettingsPath]));
    updateAppConfig = { managed: true };
    await act(async () => {
      useAuthStore.setState({ managed: true });
      releaseSave();
    });
    expect(nativeWrites.map(({ url }) => url)).toEqual([appSettingsPath]);
  });

  it.each([false, true])(
    'loads Family notification defaults without instance configuration on phone=%s',
    async (phone) => {
      fixture.phone = phone;
      seedFamily();
      render(<App />, { initialEntries: ['/admin'] });
      await openAdminTab(false, 'Notifications');
      expect(await screen.findByRole('heading', { name: 'Family notifications' })).toBeInTheDocument();
      expect(fixture.rpc).toHaveBeenCalledWith('get_family_notification_defaults', { p_family_id: familyId });
      await openAdminTab();
      expect(await screen.findByRole('heading', { name: 'Identity and file policy' })).toBeInTheDocument();
      expect(nativeReads).not.toContain(appSettingsPath);
      expect(nativeWrites).toEqual([]);
      expect(fixture.copiedReads).not.toHaveBeenCalledWith(appSettingsPath);
    }
  );

  it('skips unused SMTP and WebAuthn configuration when the Family wrapper is mounted on Nest', async () => {
    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    await openAdminTab(false, 'Notifications');
    expect(screen.queryByText('Email (SMTP)')).not.toBeInTheDocument();
    await openAdminTab();
    expect(screen.queryByPlaceholderText('trek.example.org')).not.toBeInTheDocument();
    expect(fixture.copiedReads).not.toHaveBeenCalledWith(appSettingsPath);
  });
});

describe('Family notification defaults session routing', () => {
  const readCommand = 'get_family_notification_defaults';
  const saveCommand = 'update_family_notification_defaults';
  const eventKey = 'proposal.created';
  const eventLabel = 'Trip proposal created';
  const anotherFamilyId = '0b930000-0000-4000-8000-000000000061';

  function defaultsReply(currentFamilyId: string, canManage: boolean, pushEnabled = canManage) {
    return {
      data: {
        family_id: currentFamilyId,
        can_manage: canManage,
        defaults: [
          {
            event_key: eventKey,
            destination_kind: 'proposal',
            display_order: 20,
            push_enabled: pushEnabled,
            source: 'family',
          },
        ],
        health: { active_ios_devices: canManage ? 7 : 2 },
      },
      error: null,
    };
  }

  function pending() {
    let complete = () => {};
    const promise = new Promise<void>((resolve) => {
      complete = resolve;
    });
    return { promise, complete };
  }

  async function openNotifications() {
    render(
      <>
        <FamilyAdminPage />
        <FamilyToasts />
      </>,
      { initialEntries: ['/admin'] }
    );
    await openAdminTab(false, 'Notifications');
  }

  async function returnAsReviewer(currentFamilyId = familyId) {
    await act(async () => {
      familyAuthStore.setState({ isAuthenticated: false });
      familyAuthStore.setState({ isAuthenticated: true, membershipRole: 'parent', familyId: currentFamilyId });
    });
  }

  async function expectReviewerSettings() {
    expect(await screen.findByText(/view only.*change these defaults/i)).toBeInTheDocument();
    expect(screen.getByText(/2 active iOS devices/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: eventLabel })).not.toBeInTheDocument();
    expect(screen.queryByText('Notification default saved')).not.toBeInTheDocument();
  }

  it('discards a privileged defaults read after the same account returns with lower access', async () => {
    seedFamily();
    const previousRead = pending();
    const currentRead = pending();
    let reads = 0;
    fixture.rpc.mockImplementation(async (name: string) => {
      if (name !== readCommand) throw new Error('Unexpected Family notification fixture RPC ' + name);
      if (++reads === 1) {
        await previousRead.promise;
        return defaultsReply(familyId, true);
      }
      await currentRead.promise;
      return defaultsReply(familyId, false);
    });

    await openNotifications();
    await waitFor(() => expect(reads).toBe(1));
    await returnAsReviewer();
    await act(async () => previousRead.complete());
    expect(screen.queryByRole('button', { name: eventLabel })).not.toBeInTheDocument();
    expect(screen.queryByText(/7 active iOS devices/)).not.toBeInTheDocument();
    await act(async () => currentRead.complete());
    await expectReviewerSettings();
    expect(reads).toBe(2);
  });

  it('skips the follow-up read when a save finishes after switching Families', async () => {
    seedFamily();
    const previousSave = pending();
    fixture.rpc.mockImplementation(async (name: string, { p_family_id }: { p_family_id: string }) => {
      if (name === readCommand) return defaultsReply(p_family_id, p_family_id === familyId);
      if (name !== saveCommand) throw new Error('Unexpected Family notification fixture RPC ' + name);
      await previousSave.promise;
      return { data: { ok: true }, error: null };
    });

    await openNotifications();
    fireEvent.click(await screen.findByRole('button', { name: eventLabel }));
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith(saveCommand, { p_family_id: familyId, p_patch: { [eventKey]: false } })
    );
    await returnAsReviewer(anotherFamilyId);
    await expectReviewerSettings();
    await act(async () => previousSave.complete());

    expect(fixture.rpc.mock.calls.filter(([name]) => name === readCommand)).toEqual([
      [readCommand, { p_family_id: familyId }],
      [readCommand, { p_family_id: anotherFamilyId }],
    ]);
    await expectReviewerSettings();
  });

  it('discards an in-flight post-save refresh after access changes', async () => {
    seedFamily();
    const previousRefresh = pending();
    let reads = 0;
    fixture.rpc.mockImplementation(async (name: string) => {
      if (name === saveCommand) return { data: { ok: true }, error: null };
      if (name !== readCommand) throw new Error('Unexpected Family notification fixture RPC ' + name);
      if (++reads === 1) return defaultsReply(familyId, true);
      if (reads === 2) {
        await previousRefresh.promise;
        return defaultsReply(familyId, true, false);
      }
      return defaultsReply(familyId, false);
    });

    await openNotifications();
    fireEvent.click(await screen.findByRole('button', { name: eventLabel }));
    await waitFor(() => expect(reads).toBe(2));
    await returnAsReviewer();
    await act(async () => previousRefresh.complete());

    expect(screen.queryByText('Notification default saved')).not.toBeInTheDocument();
    await expectReviewerSettings();
    expect(reads).toBe(3);
  });
});

describe('Family preference defaults session routing', () => {
  const read = 'get_family_preference_defaults';
  const update = 'update_family_preference_defaults';
  const secondFamilyId = '0b930000-0000-4000-8000-000000000064';
  const savedNotice = 'Family default saved';

  function preferences(id: string, canManage: boolean, currency: string | null) {
    return { data: { family_id: id, can_manage: canManage, defaults: { display_currency: currency } }, error: null };
  }

  function pendingResponse() {
    let finish = () => {};
    const promise = new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { finish, promise };
  }

  async function openDefaults() {
    render(
      <>
        <div data-testid="preference-admin-view">
          <FamilyAdminPage />
        </div>
        <FamilyToasts />
      </>,
      { initialEntries: ['/admin'] }
    );
    await openAdminTab(false, 'User Defaults');
    return within(screen.getByTestId('preference-admin-view'));
  }

  async function changeAccess(currentFamilyId: string, membershipRole: 'parent' | 'patriarch') {
    await act(async () => {
      familyAuthStore.setState({ isAuthenticated: false });
      familyAuthStore.setState({ isAuthenticated: true, familyId: currentFamilyId, membershipRole });
    });
  }

  it('ignores a late manager read after the same account returns as a reviewer', async () => {
    seedFamily();
    const oldRead = pendingResponse();
    const nextRead = pendingResponse();
    let reads = 0;
    fixture.rpc.mockImplementation(async (name: string) => {
      if (name !== read) throw new Error('Unexpected Family preference fixture RPC ' + name);
      if (++reads === 1) {
        await oldRead.promise;
        return preferences(familyId, true, 'EUR');
      }
      await nextRead.promise;
      return preferences(familyId, false, 'CAD');
    });
    const view = await openDefaults();
    await waitFor(() => expect(reads).toBe(1));
    await changeAccess(familyId, 'parent');
    await act(async () => oldRead.finish());
    expect(view.queryByRole('button', { name: /^EUR/ })).not.toBeInTheDocument();
    await act(async () => nextRead.finish());
    expect(await view.findByRole('button', { name: /^CAD/ })).toBeDisabled();
    expect(screen.getByText(/view only.*change these defaults/i)).toBeInTheDocument();
    expect(view.queryByRole('button', { name: 'reset' })).not.toBeInTheDocument();
    expect(reads).toBe(2);
  });

  it('ignores a late save response after switching to another Family as a reviewer', async () => {
    seedFamily();
    const oldSave = pendingResponse();
    fixture.rpc.mockImplementation(async (name: string, { p_family_id: id }: { p_family_id: string }) => {
      if (name === read) return preferences(id, id === familyId, id === familyId ? 'EUR' : 'CAD');
      if (name !== update) throw new Error('Unexpected Family preference fixture RPC ' + name);
      await oldSave.promise;
      return preferences(id, true, 'EUR');
    });
    const view = await openDefaults();
    const option = await view.findByRole('button', { name: '°C Celsius' });
    await act(async () => {
      fireEvent.click(option);
    });
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith(update, {
        p_family_id: familyId,
        p_patch: { temperature_unit: 'celsius' },
      })
    );
    await changeAccess(secondFamilyId, 'parent');
    expect(await view.findByRole('button', { name: /^CAD/ })).toBeDisabled();
    await act(async () => oldSave.finish());
    expect(view.queryByRole('button', { name: /^EUR/ })).not.toBeInTheDocument();
    expect(view.getByRole('button', { name: /^CAD/ })).toBeDisabled();
    expect(screen.queryByText(savedNotice)).not.toBeInTheDocument();
  });

  it.each(['success', 'error'] as const)(
    'keeps a new Family save busy when the previous save returns %s',
    async (outcome) => {
      seedFamily();
      const oldSave = pendingResponse();
      const newSave = pendingResponse();
      const oldError = 'Previous Family save failed in fixture';
      fixture.rpc.mockImplementation(async (name: string, { p_family_id: id }: { p_family_id: string }) => {
        if (name === read) return preferences(id, true, id === familyId ? 'EUR' : 'CAD');
        if (name !== update) throw new Error('Unexpected Family preference fixture RPC ' + name);
        if (id === familyId) {
          await oldSave.promise;
          return outcome === 'success' ? preferences(id, true, 'EUR') : { data: null, error: new Error(oldError) };
        }
        await newSave.promise;
        return preferences(id, true, 'CAD');
      });

      const view = await openDefaults();
      const option = await view.findByRole('button', { name: '°C Celsius' });
      await act(async () => {
        fireEvent.click(option);
      });
      await waitFor(() =>
        expect(fixture.rpc).toHaveBeenCalledWith(update, {
          p_family_id: familyId,
          p_patch: { temperature_unit: 'celsius' },
        })
      );
      await changeAccess(secondFamilyId, 'patriarch');
      expect(await view.findByRole('button', { name: /^CAD/ })).toBeEnabled();
      await act(async () => {
        fireEvent.click(view.getByRole('button', { name: '°F Fahrenheit' }));
      });
      await waitFor(() =>
        expect(fixture.rpc).toHaveBeenCalledWith(update, {
          p_family_id: secondFamilyId,
          p_patch: { temperature_unit: 'fahrenheit' },
        })
      );

      await act(async () => oldSave.finish());
      expect(screen.queryByText(savedNotice)).not.toBeInTheDocument();
      expect(screen.queryByText(oldError)).not.toBeInTheDocument();
      expect(view.getByRole('button', { name: /^CAD/ })).toBeDisabled();
      expect(view.queryByRole('button', { name: /^EUR/ })).not.toBeInTheDocument();
      await act(async () => newSave.finish());
      expect(view.getByRole('button', { name: /^CAD/ })).toBeEnabled();
      expect(await screen.findByText(savedNotice)).toBeInTheDocument();
    }
  );

  it('saves an explicit null when a manager resets the Family currency', async () => {
    seedFamily();
    fixture.rpc.mockImplementation(async (name: string) => {
      if (name === read) return preferences(familyId, true, 'CAD');
      if (name === update) return preferences(familyId, true, null);
      throw new Error('Unexpected Family preference fixture RPC ' + name);
    });
    const view = await openDefaults();
    expect(await view.findByRole('button', { name: /^CAD/ })).toBeEnabled();
    await act(async () => {
      fireEvent.click(view.getByText('reset', { selector: 'button' }));
    });
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith(update, { p_family_id: familyId, p_patch: { display_currency: null } })
    );
    const fallback = await view.findByText('Trip currency');
    expect(fallback.closest('button')).toBeEnabled();
    expect(view.queryByRole('button', { name: 'reset' })).not.toBeInTheDocument();
  });
});

describe('Family feature controls session routing', () => {
  const listControls = 'list_family_feature_controls';
  const listHistory = 'list_feature_rollout_events';
  const updateOverride = 'update_family_feature_overrides';
  const updateRollout = 'update_feature_rollout';
  const nextFamilyId = '0b930000-0000-4000-8000-000000000066';
  const historyHeading = 'Product rollout history';
  const earlierEvent = '2026-11-20T15:00:00.000Z';
  const currentEvent = '2026-11-20T16:00:00.000Z';
  const familyNotice = 'Family feature saved';
  const rolloutNotice = 'Product rollout saved';
  const originalRefresh = useFamilyFeatureStore.getState().refresh;
  const refresh = vi.fn(async () => {});

  function controls(
    id: string,
    canManage: boolean,
    superAdmin: boolean,
    familyMode = 'enabled',
    rolloutState = 'enabled'
  ) {
    return {
      data: {
        family_id: id,
        can_manage: canManage,
        is_super_admin: superAdmin,
        controls: [{ key: 'vacay', family_mode: familyMode, rollout_state: rolloutState }],
      },
      error: null,
    };
  }

  function event(timestamp: string) {
    return {
      data: {
        events: [
          { id: timestamp, feature_key: 'vacay', old_state: 'enabled', new_state: 'preview', created_at: timestamp },
        ],
      },
      error: null,
    };
  }

  function pendingFeatureResponse() {
    let finish = () => {};
    const promise = new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { finish, promise };
  }

  async function openFeatures() {
    render(
      <>
        <FamilyAdminPage />
        <FamilyToasts />
      </>,
      { initialEntries: ['/admin'] }
    );
    await openAdminTab(false, 'Features');
  }

  async function setAccess(currentFamilyId: string, isSuperAdmin: boolean) {
    await act(async () => {
      familyAuthStore.setState({
        familyId: currentFamilyId,
        isSuperAdmin,
        membershipRole: isSuperAdmin ? 'patriarch' : 'parent',
      });
    });
  }

  beforeEach(() => {
    seedFamily();
    refresh.mockClear();
    useFamilyFeatureStore.setState({ refresh });
  });

  afterEach(() => {
    useFamilyFeatureStore.setState({ refresh: originalRefresh });
  });

  it('skips rollout history when a delayed control read belongs to prior administrator access', async () => {
    await setAccess(familyId, true);
    const olderRead = pendingFeatureResponse();
    let reads = 0;
    fixture.rpc.mockImplementation(async (name: string) => {
      if (name === listHistory) return event(earlierEvent);
      if (name !== listControls) throw new Error('Unexpected Family feature fixture RPC ' + name);
      if (++reads !== 1) return controls(familyId, false, false, 'inherit');
      await olderRead.promise;
      return controls(familyId, true, true);
    });

    await openFeatures();
    await waitFor(() => expect(reads).toBe(1));
    await setAccess(familyId, false);
    await act(async () => olderRead.finish());
    expect(fixture.rpc).not.toHaveBeenCalledWith(listHistory, { p_limit: 40 });
    expect(await screen.findByLabelText('Family availability')).toBeDisabled();
    expect(screen.queryByLabelText('Product rollout')).not.toBeInTheDocument();
    expect(screen.queryByText(historyHeading)).not.toBeInTheDocument();
    expect(reads).toBe(2);
  });

  it('ignores an earlier history response after a different Family loads its history', async () => {
    await setAccess(familyId, true);
    const earlierHistory = pendingFeatureResponse();
    let historyReads = 0;
    fixture.rpc.mockImplementation(async (name: string, args: { p_family_id: string }) => {
      if (name === listControls) return controls(args.p_family_id, true, true);
      if (name !== listHistory) throw new Error('Unexpected Family feature fixture RPC ' + name);
      if (++historyReads !== 1) return event(currentEvent);
      await earlierHistory.promise;
      return event(earlierEvent);
    });

    await openFeatures();
    await waitFor(() => expect(historyReads).toBe(1));
    await setAccess(nextFamilyId, true);
    expect(await screen.findByText(currentEvent)).toBeInTheDocument();
    await act(async () => earlierHistory.finish());
    expect(screen.queryByText(earlierEvent)).not.toBeInTheDocument();
    expect(screen.getByText(currentEvent)).toBeInTheDocument();
  });

  it('ignores an old Family override completion and skips the availability refresh', async () => {
    const olderSave = pendingFeatureResponse();
    fixture.rpc.mockImplementation(async (name: string, args: { p_family_id: string }) => {
      if (name === listControls) return controls(args.p_family_id, args.p_family_id === familyId, false, 'inherit');
      if (name !== updateOverride) throw new Error('Unexpected Family feature fixture RPC ' + name);
      await olderSave.promise;
      return controls(args.p_family_id, true, false, 'disabled');
    });

    await openFeatures();
    fireEvent.change(await screen.findByLabelText('Family availability'), { target: { value: 'disabled' } });
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith(updateOverride, { p_family_id: familyId, p_patch: { vacay: false } })
    );
    await setAccess(nextFamilyId, false);
    await screen.findByText(/view only.*change these controls/i);
    await act(async () => olderSave.finish());
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Family availability')).toHaveValue('inherit');
    expect(screen.getByLabelText('Family availability')).toBeDisabled();
    expect(screen.queryByText(familyNotice)).not.toBeInTheDocument();
  });

  it('skips reload and feedback when a rollout save completes after losing administrator access', async () => {
    await setAccess(familyId, true);
    const oldRollout = pendingFeatureResponse();
    fixture.rpc.mockImplementation(async (name: string) => {
      const admin = familyAuthStore.getState().isSuperAdmin;
      if (name === listControls) return controls(familyId, admin, admin);
      if (name === listHistory) return event(earlierEvent);
      if (name !== updateRollout) throw new Error('Unexpected Family feature fixture RPC ' + name);
      await oldRollout.promise;
      return { data: { feature_key: 'vacay', state: 'preview' }, error: null };
    });
    await openFeatures();
    fireEvent.change(await screen.findByLabelText('Product rollout'), { target: { value: 'preview' } });
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith(updateRollout, { p_feature_key: 'vacay', p_state: 'preview' })
    );
    await setAccess(familyId, false);
    await act(async () => oldRollout.finish());
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText(rolloutNotice)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Product rollout')).not.toBeInTheDocument();
    expect(screen.queryByText(earlierEvent)).not.toBeInTheDocument();
    expect(fixture.rpc.mock.calls.filter(([name]) => name === listControls)).toHaveLength(2);
  });

  it('saves the rollout and explicit inheritance and refreshes the current Family availability', async () => {
    await setAccess(familyId, true);
    let rollout = 'enabled';
    fixture.rpc.mockImplementation(async (name: string) => {
      if (name === listControls) return controls(familyId, true, true, 'enabled', rollout);
      if (name === listHistory) return event(rollout === 'enabled' ? earlierEvent : currentEvent);
      if (name === updateRollout) {
        rollout = 'preview';
        return { data: { feature_key: 'vacay', state: rollout }, error: null };
      }
      if (name === updateOverride) return controls(familyId, true, true, 'inherit', rollout);
      throw new Error('Unexpected Family feature fixture RPC ' + name);
    });

    await openFeatures();
    expect(await screen.findByText(earlierEvent)).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Product rollout'), { target: { value: 'preview' } });
    });
    expect(await screen.findByText(currentEvent)).toBeInTheDocument();
    expect(screen.getByLabelText('Product rollout')).toHaveValue('preview');
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Family availability'), { target: { value: 'inherit' } });
    });
    expect(fixture.rpc).toHaveBeenCalledWith(updateRollout, { p_feature_key: 'vacay', p_state: 'preview' });
    expect(fixture.rpc).toHaveBeenCalledWith(updateOverride, { p_family_id: familyId, p_patch: { vacay: null } });
    expect(fixture.rpc.mock.calls.filter(([name]) => name === listHistory)).toHaveLength(2);
    expect(screen.getByLabelText('Family availability')).toHaveValue('inherit');
    expect(screen.getByLabelText('Family availability')).toBeEnabled();
    expect(screen.getByText(currentEvent)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe('Family place category session routing', () => {
  const read = 'list_family_place_categories';
  const upsert = 'upsert_family_place_category';
  const remove = 'delete_family_place_category';
  const otherFamily = '0b930000-0000-4000-8000-000000000067';
  const previousName = 'Previous family palette';
  const currentName = 'Current family palette';
  const olderCategory = '0b930000-0000-4000-8000-000000000068';
  const newerCategory = '0b930000-0000-4000-8000-000000000069';
  const draft = 'Draft from the previous Family';
  const currentDraft = 'New family category draft';
  const confirmation = 'Delete place category?';

  function category(id: string, name = id === familyId ? previousName : currentName) {
    return {
      id: id === familyId ? olderCategory : newerCategory,
      family_id: id,
      name,
      color_hex: '#10b981',
      icon_key: 'MapPin',
      sort_order: 1,
    };
  }

  function palette(id: string, canManage = true, name?: string) {
    return { data: { family_id: id, can_manage: canManage, categories: [category(id, name)] }, error: null };
  }

  function pendingCategoryResponse() {
    let finish = () => {};
    const promise = new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { finish, promise };
  }

  function categoryRpc(handle: (name: string, args: { p_family_id: string; p_name?: string }) => unknown) {
    fixture.rpc.mockImplementation(async (name: string, args: { p_family_id: string; p_name?: string }) => {
      if (name === 'list_family_packing_templates')
        return { data: { family_id: args.p_family_id, can_manage: false, templates: [] }, error: null };
      return handle(name, args);
    });
  }

  async function openCategories(strict = false) {
    const admin = <FamilyAdminPage />;
    render(
      <>
        {strict ? <StrictMode>{admin}</StrictMode> : admin}
        <FamilyToasts />
      </>,
      { initialEntries: ['/admin'] }
    );
    await openAdminTab(false, 'Personalization');
  }

  async function changeCategoryAccess(currentFamily: string, membershipRole: 'parent' | 'patriarch') {
    await act(async () => {
      familyAuthStore.setState({ familyId: currentFamily, membershipRole });
    });
  }

  beforeEach(() => seedFamily());

  it('ignores a delayed category read after the same Family loses edit access', async () => {
    let reads = 0;
    const managerRead = pendingCategoryResponse();
    categoryRpc(async (name) => {
      if (name !== read) throw new Error('Unexpected Family category fixture RPC ' + name);
      if (++reads > 1) return palette(familyId, false, currentName);
      await managerRead.promise;
      return palette(familyId);
    });
    await openCategories();
    await waitFor(() => expect(reads).toBe(1));
    await changeCategoryAccess(familyId, 'parent');
    await act(async () => managerRead.finish());
    expect(screen.queryByText(previousName)).not.toBeInTheDocument();
    expect(await screen.findByText(currentName)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Category' })).not.toBeInTheDocument();
  });

  it('clears the create draft when another Family becomes active', async () => {
    categoryRpc((name, args) => {
      if (name !== read) throw new Error('Unexpected Family category fixture RPC ' + name);
      return palette(args.p_family_id);
    });
    await openCategories();
    fireEvent.click(await screen.findByRole('button', { name: 'New Category' }));
    fireEvent.change(screen.getByPlaceholderText('Category name'), { target: { value: draft } });
    await changeCategoryAccess(otherFamily, 'patriarch');
    expect(await screen.findByText(currentName)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Category name')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New Category' }));
    expect(screen.getByPlaceholderText('Category name')).toHaveValue('');
    expect(fixture.rpc.mock.calls.some(([name]) => name === upsert)).toBe(false);
  });

  it('dismisses an unsubmitted delete confirmation when management access ends', async () => {
    categoryRpc((name, args) => {
      if (name !== read) throw new Error('Unexpected Family category fixture RPC ' + name);
      return palette(args.p_family_id, familyAuthStore.getState().membershipRole === 'patriarch');
    });
    await openCategories();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete category' }));
    expect(screen.getByText(confirmation)).toBeInTheDocument();
    await changeCategoryAccess(familyId, 'parent');
    expect(screen.queryByText(confirmation)).not.toBeInTheDocument();
    expect(await screen.findByText(previousName)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete category' })).not.toBeInTheDocument();
    expect(fixture.rpc.mock.calls.some(([name]) => name === remove)).toBe(false);
  });

  it('suppresses a late edit completion and keeps the new Family draft', async () => {
    const edit = pendingCategoryResponse();
    categoryRpc(async (name, args) => {
      if (name === read) return palette(args.p_family_id);
      if (name !== upsert) throw new Error('Unexpected Family category fixture RPC ' + name);
      await edit.promise;
      return { data: { category: category(args.p_family_id, args.p_name) }, error: null };
    });
    await openCategories();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit category' }));
    fireEvent.change(screen.getByPlaceholderText('Category name'), {
      target: { value: 'Renamed prior Family category' },
    });
    fireEvent.click(screen.getByText('Update', { selector: 'button' }));
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith(
        upsert,
        expect.objectContaining({ p_family_id: familyId, p_category_id: olderCategory })
      )
    );
    await changeCategoryAccess(otherFamily, 'patriarch');
    expect(await screen.findByText(currentName)).toBeInTheDocument();
    const create = screen.getByRole('button', { name: 'New Category' });
    if (!create.hasAttribute('disabled')) {
      fireEvent.click(create);
      fireEvent.change(screen.getByPlaceholderText('Category name'), { target: { value: currentDraft } });
    }
    await act(async () => edit.finish());
    expect(screen.queryByText('Category updated')).not.toBeInTheDocument();
    expect(screen.queryByText('Renamed prior Family category')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Category name')).toHaveValue(currentDraft);
  });

  it('suppresses a late delete completion after another Family is active', async () => {
    const deletion = pendingCategoryResponse();
    categoryRpc(async (name, args) => {
      if (name === read) return palette(args.p_family_id);
      if (name !== remove) throw new Error('Unexpected Family category fixture RPC ' + name);
      await deletion.promise;
      return { data: { ok: true }, error: null };
    });
    await openCategories();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete category' }));
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith(remove, { p_family_id: familyId, p_category_id: olderCategory })
    );
    await changeCategoryAccess(otherFamily, 'patriarch');
    expect(await screen.findByText(currentName)).toBeInTheDocument();
    await act(async () => deletion.finish());
    expect(screen.queryByText('Category deleted')).not.toBeInTheDocument();
    expect(screen.getByText(currentName)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Category' })).toBeEnabled();
  });

  it('edits and deletes the selected category through the current Family even under Strict Mode', async () => {
    const renamed = 'Current manager renamed category';
    categoryRpc((name, args) => {
      if (name === read) return palette(args.p_family_id);
      if (name === upsert) return { data: { category: category(args.p_family_id, args.p_name) }, error: null };
      if (name === remove) return { data: { ok: true }, error: null };
      throw new Error('Unexpected Family category fixture RPC ' + name);
    });
    await openCategories(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit category' }));
    fireEvent.change(screen.getByPlaceholderText('Category name'), { target: { value: renamed } });
    await act(async () => {
      fireEvent.click(screen.getByText('Update', { selector: 'button' }));
    });
    expect(fixture.rpc).toHaveBeenCalledWith(upsert, {
      p_family_id: familyId,
      p_category_id: olderCategory,
      p_name: renamed,
      p_color_hex: '#10b981',
      p_icon_key: 'MapPin',
      p_sort_order: null,
    });
    expect(await screen.findByText(renamed)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete category' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    });
    expect(fixture.rpc).toHaveBeenCalledWith(remove, { p_family_id: familyId, p_category_id: olderCategory });
    expect(screen.queryByText(renamed)).not.toBeInTheDocument();
    expect(screen.getByText('No categories yet')).toBeInTheDocument();
  });
});

describe('Family packing template session routing', () => {
  const read = 'list_family_packing_templates';
  const upsert = 'upsert_family_packing_template';
  const remove = 'delete_family_packing_template';
  const anotherFamily = '0b930000-0000-4000-8000-000000000070';
  const olderId = '0b930000-0000-4000-8000-000000000071';
  const newerId = '0b930000-0000-4000-8000-000000000072';
  const createdId = '0b930000-0000-4000-8000-000000000073';
  const olderName = 'Previous Family packing list';
  const newerName = 'Current Family packing list';
  const namePlaceholder = 'Template name (e.g. Beach Holiday)';
  const groupPlaceholder = 'Category name (e.g. Clothing)';
  const confirmTitle = 'Delete packing template?';
  const draftName = 'Unsaved template title';
  const groupDraft = 'Unsaved group title';
  const item = { id: 'item-fixture', name: 'Rain jacket', category: 'Clothing', quantity: 2, weight_grams: 450 };

  function template(family: string, name = family === familyId ? olderName : newerName) {
    return { id: family === familyId ? olderId : newerId, family_id: family, name, items: [item] };
  }

  function list(family: string, canManage = true) {
    return { data: { family_id: family, can_manage: canManage, templates: [template(family)] }, error: null };
  }

  function pendingTemplateResponse() {
    let release = () => {};
    const promise = new Promise<void>((complete) => {
      release = complete;
    });
    return { promise, release };
  }

  type Args = { p_family_id: string; p_template_id?: string | null; p_name?: string };
  function stubTemplates(handle: (name: string, args: Args) => unknown) {
    fixture.rpc.mockImplementation(async (name: string, args: Args) => {
      if (name === 'list_family_place_categories') {
        return { data: { family_id: args.p_family_id, can_manage: false, categories: [] }, error: null };
      }
      return handle(name, args);
    });
  }

  async function openTemplates(strict = false) {
    const admin = <FamilyAdminPage />;
    render(
      <>
        {strict ? <StrictMode>{admin}</StrictMode> : admin}
        <FamilyToasts />
      </>,
      { initialEntries: ['/admin'] }
    );
    await openAdminTab(false, 'Personalization');
  }

  async function changeTemplateAccess(family: string, membershipRole: 'parent' | 'patriarch') {
    await act(async () => {
      familyAuthStore.setState({ familyId: family, membershipRole });
    });
  }

  beforeEach(() => seedFamily());

  it('discards an earlier manager list after the same Family becomes read only', async () => {
    const pending = pendingTemplateResponse();
    let reads = 0;
    stubTemplates(async (name, args) => {
      if (name !== read) throw new Error('Unexpected template fixture command ' + name);
      if (++reads > 1) return list(args.p_family_id, false);
      await pending.promise;
      return list(args.p_family_id);
    });
    await openTemplates();
    await waitFor(() => expect(reads).toBe(1));
    await changeTemplateAccess(familyId, 'parent');
    await act(async () => pending.release());
    expect(screen.queryByRole('button', { name: 'New Template' })).not.toBeInTheDocument();
    expect(await screen.findByText(olderName)).toBeInTheDocument();
    expect(reads).toBe(2);
  });

  it('resets the create input, expanded row and group draft when access changes', async () => {
    stubTemplates((name, args) => {
      if (name !== read) throw new Error('Unexpected template fixture command ' + name);
      return list(args.p_family_id, familyAuthStore.getState().membershipRole === 'patriarch');
    });
    await openTemplates();
    fireEvent.click(await screen.findByRole('button', { name: olderName }));
    fireEvent.change(screen.getByDisplayValue(olderName), { target: { value: draftName } });
    fireEvent.click(screen.getByText('Add category', { selector: 'button' }));
    fireEvent.change(screen.getByPlaceholderText(groupPlaceholder), { target: { value: groupDraft } });
    fireEvent.click(screen.getByRole('button', { name: 'New Template' }));
    fireEvent.change(screen.getByPlaceholderText(namePlaceholder), { target: { value: 'Unsubmitted new template' } });

    await changeTemplateAccess(familyId, 'parent');
    await changeTemplateAccess(familyId, 'patriarch');
    const row = await screen.findByRole('button', { name: olderName });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByPlaceholderText(namePlaceholder)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue(olderName)).toBeInTheDocument();
    fireEvent.click(row);
    expect(screen.queryByPlaceholderText(groupPlaceholder)).not.toBeInTheDocument();
  });

  it('closes an unsubmitted template delete confirmation when edit access ends', async () => {
    stubTemplates((name, args) => {
      if (name !== read) throw new Error('Unexpected template fixture command ' + name);
      return list(args.p_family_id, familyAuthStore.getState().membershipRole === 'patriarch');
    });
    await openTemplates();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete template' }));
    expect(screen.getByText(confirmTitle)).toBeInTheDocument();
    await changeTemplateAccess(familyId, 'parent');
    expect(screen.queryByText(confirmTitle)).not.toBeInTheDocument();
    expect(fixture.rpc.mock.calls.some(([name]) => name === remove)).toBe(false);
  });

  it.each([
    { action: 'create', notice: 'Template created' },
    { action: 'save', notice: 'Template saved' },
    { action: 'delete', notice: 'Template deleted' },
  ])('ignores a late $action completion after switching Families', async ({ action, notice }) => {
    const pending = pendingTemplateResponse();
    stubTemplates(async (name, args) => {
      if (name === read) return list(args.p_family_id);
      await pending.promise;
      if (name === remove) return { data: { ok: true }, error: null };
      if (name === upsert)
        return {
          data: { template: { ...template(args.p_family_id, args.p_name), id: args.p_template_id ?? createdId } },
          error: null,
        };
      throw new Error('Unexpected template fixture command ' + name);
    });
    await openTemplates();
    await screen.findByRole('button', { name: olderName });
    if (action === 'create') {
      fireEvent.click(screen.getByRole('button', { name: 'New Template' }));
      const input = screen.getByPlaceholderText(namePlaceholder);
      fireEvent.change(input, { target: { value: draftName } });
      fireEvent.keyDown(input, { key: 'Enter' });
    } else if (action === 'save') {
      fireEvent.change(screen.getByDisplayValue(olderName), { target: { value: draftName } });
      fireEvent.click(screen.getByText('Save', { selector: 'button' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Delete template' }));
      fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    }
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith(
        action === 'delete' ? remove : upsert,
        expect.objectContaining({ p_family_id: familyId, p_template_id: action === 'create' ? null : olderId })
      )
    );
    await changeTemplateAccess(anotherFamily, 'patriarch');
    await screen.findByRole('button', { name: newerName });
    await act(async () => pending.release());
    expect(screen.queryByText(notice)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(draftName)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Template' })).toBeEnabled();
  });

  it('keeps repeat Enter from creating two templates while the first save is pending', async () => {
    const pending = pendingTemplateResponse();
    stubTemplates(async (name, args) => {
      if (name === read) return list(args.p_family_id);
      if (name !== upsert) throw new Error('Unexpected template fixture command ' + name);
      await pending.promise;
      return {
        data: { template: { ...template(args.p_family_id, args.p_name), id: createdId, items: [] } },
        error: null,
      };
    });
    await openTemplates();
    fireEvent.click(await screen.findByRole('button', { name: 'New Template' }));
    const input = screen.getByPlaceholderText(namePlaceholder);
    fireEvent.change(input, { target: { value: 'One template only' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith(upsert, {
        p_family_id: familyId,
        p_template_id: null,
        p_name: 'One template only',
        p_items: [],
      })
    );
    fireEvent.keyDown(input, { key: 'Enter' });
    const writes = fixture.rpc.mock.calls.filter(([name]) => name === upsert);
    await act(async () => pending.release());
    expect(writes).toHaveLength(1);
    expect(await screen.findByDisplayValue('One template only')).toBeInTheDocument();
  });

  it('saves existing items and deletes the selected template under Strict Mode', async () => {
    const renamed = 'Updated packing list';
    stubTemplates((name, args) => {
      if (name === read) return list(args.p_family_id);
      if (name === upsert) return { data: { template: template(args.p_family_id, args.p_name) }, error: null };
      if (name === remove) return { data: { ok: true }, error: null };
      throw new Error('Unexpected template fixture command ' + name);
    });
    await openTemplates(true);
    fireEvent.change(await screen.findByDisplayValue(olderName), { target: { value: renamed } });
    await act(async () => {
      fireEvent.click(screen.getByText('Save', { selector: 'button' }));
    });
    expect(fixture.rpc).toHaveBeenCalledWith(upsert, {
      p_family_id: familyId,
      p_template_id: olderId,
      p_name: renamed,
      p_items: [{ name: item.name, category: item.category, quantity: item.quantity, weight_grams: item.weight_grams }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete template' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    });
    expect(fixture.rpc).toHaveBeenCalledWith(remove, { p_family_id: familyId, p_template_id: olderId });
    expect(screen.getByText('No templates created yet')).toBeInTheDocument();
  });
});

describe('Family member administration session routing', () => {
  const nextFamily = '0b930000-0000-4000-8000-000000000311';
  const oldMember = {
    id: '0b930000-0000-4000-8000-000000000312',
    userId: '0b930000-0000-4000-8000-000000000313',
    personId: '0b930000-0000-4000-8000-000000000314',
    familyId,
    displayName: 'Previous roster member',
    email: 'previous-member@example.test',
    role: 'guest',
    status: 'active',
    createdAt: '2026-01-01',
    avatarUrl: null,
  };
  const newMember = { ...oldMember, familyId: nextFamily, displayName: 'Current roster member' };
  const oldRequest = {
    id: '0b930000-0000-4000-8000-000000000315',
    familyId,
    displayName: 'Previous access request',
    email: 'previous-request@example.test',
    relationNote: 'Fixture family member',
    createdAt: '2026-01-01',
  };
  const newRequest = { ...oldRequest, familyId: nextFamily, displayName: 'Current access request' };
  const stats = { totalUsers: 1, totalTrips: 21, totalPlaces: 30, totalFiles: 0 };

  const adapter = () =>
    vi.importActual<typeof import('./integrations/family/legacy/data/supabase/familyAdmin')>(
      './integrations/family/legacy/data/supabase/familyAdmin'
    );

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const result = new Promise<T>((done) => {
      resolve = done;
    });
    return { result, resolve };
  }

  function switchFamily() {
    act(() => familyAuthStore.setState({ familyId: nextFamily }));
  }

  beforeEach(() => {
    seedFamily();
    memberAdmin.members.mockImplementation(async ({ familyId: requestedFamily }) => [
      requestedFamily === nextFamily ? newMember : oldMember,
    ]);
    memberAdmin.requests.mockImplementation(async (requestedFamily) => [
      requestedFamily === nextFamily ? newRequest : oldRequest,
    ]);
    memberAdmin.stats.mockResolvedValue(stats);
  });

  it('stops a departed roster read before loading access requests', async () => {
    const pending = deferred<(typeof oldMember)[]>();
    memberAdmin.members.mockReturnValueOnce(pending.result);
    render(<FamilyAdminPage />);
    await waitFor(() => expect(memberAdmin.members).toHaveBeenCalledWith({ familyId, isSuperAdmin: false }));
    switchFamily();
    await act(async () => pending.resolve([oldMember]));
    expect(memberAdmin.requests).not.toHaveBeenCalledWith(familyId);
    expect(await screen.findByText(newMember.displayName)).toBeInTheDocument();
    expect(screen.getByText(newRequest.displayName)).toBeInTheDocument();
  });

  it('drops an older access-request response when Family access changes', async () => {
    const pending = deferred<(typeof oldRequest)[]>();
    memberAdmin.requests.mockReturnValueOnce(pending.result);
    render(<FamilyAdminPage />);
    await waitFor(() => expect(memberAdmin.requests).toHaveBeenCalledWith(familyId));
    switchFamily();
    await act(async () => pending.resolve([oldRequest]));
    expect(screen.queryByText(oldRequest.displayName)).not.toBeInTheDocument();
    expect(await screen.findByText(newRequest.displayName)).toBeInTheDocument();
    expect(memberAdmin.stats).not.toHaveBeenCalledWith({ familyId, isSuperAdmin: false, memberCount: 1 });
  });

  it('clears access requests immediately and ignores departed statistics', async () => {
    const pending = deferred<typeof stats>();
    memberAdmin.stats.mockReturnValueOnce(pending.result);
    render(<FamilyAdminPage />);
    expect(await screen.findByText(oldRequest.displayName)).toBeInTheDocument();
    switchFamily();
    expect(screen.queryByText(oldRequest.displayName)).not.toBeInTheDocument();
    expect(await screen.findByText(newMember.displayName)).toBeInTheDocument();
    await act(async () => pending.resolve({ ...stats, totalTrips: 9876 }));
    expect(screen.queryByText('9876')).not.toBeInTheDocument();
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.queryByText(oldMember.displayName)).not.toBeInTheDocument();
    expect(screen.queryByText(oldRequest.displayName)).not.toBeInTheDocument();
  });

  it('closes an old member editor even when the next Family displays the same membership fixture identity', async () => {
    render(<FamilyAdminPage />);
    const row = await screen.findByRole('row', { name: /Previous roster member/ });
    fireEvent.click(within(row).getByTitle('Edit User'));
    fireEvent.change(screen.getByDisplayValue(oldMember.displayName), { target: { value: 'Unsent member name' } });
    switchFamily();
    expect(screen.queryByDisplayValue('Unsent member name')).not.toBeInTheDocument();
    expect(await screen.findByText(newMember.displayName)).toBeInTheDocument();
    expect(memberAdmin.updateRole).not.toHaveBeenCalled();
  });

  it('does not issue a display-name change after the original role update finishes in another session', async () => {
    const pending = deferred<void>();
    memberAdmin.updateRole.mockReturnValueOnce(pending.result);
    render(
      <>
        <FamilyAdminPage />
        <FamilyToasts />
      </>
    );
    const row = await screen.findByRole('row', { name: /Previous roster member/ });
    fireEvent.click(within(row).getByTitle('Edit User'));
    fireEvent.change(screen.getByDisplayValue(oldMember.displayName), { target: { value: 'Submitted member name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(memberAdmin.updateRole).toHaveBeenCalledWith(oldMember.id, 'guest');
    switchFamily();
    await act(async () => pending.resolve());
    expect(memberAdmin.updateName).not.toHaveBeenCalled();
    expect(await screen.findByText(newMember.displayName)).toBeInTheDocument();
  });

  it('ignores a late access approval and refreshes only the new Family', async () => {
    const pending = deferred<void>();
    memberAdmin.approve.mockReturnValueOnce(pending.result);
    render(
      <>
        <FamilyAdminPage />
        <FamilyToasts />
      </>
    );
    expect(await screen.findByText(oldRequest.displayName)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Approve'));
    expect(memberAdmin.approve).toHaveBeenCalledWith(oldRequest.id, 'guest');
    switchFamily();
    await act(async () => pending.resolve());
    expect(memberAdmin.members.mock.calls.map(([options]) => options.familyId)).toEqual([familyId, nextFamily]);
    expect(await screen.findByText(newRequest.displayName)).toBeInTheDocument();
  });

  it('preserves global reviewer reads without a selected Family and current approvals under Strict Mode', async () => {
    familyAuthStore.setState({ familyId: null, isSuperAdmin: true, membershipRole: null });
    render(
      <StrictMode>
        <FamilyAdminPage />
      </StrictMode>
    );
    expect(await screen.findByText(oldRequest.displayName)).toBeInTheDocument();
    expect(memberAdmin.members).toHaveBeenCalledWith({ familyId: null, isSuperAdmin: true });
    expect(memberAdmin.requests).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByTitle('Approve'));
    await waitFor(() => expect(memberAdmin.approve).toHaveBeenCalledWith(oldRequest.id, 'guest'));
  });
  it('blocks an invitation approval when the request was created in a departed session', async () => {
    const { inviteFamilyMember } = await adapter();
    const pending = deferred<{ data: string; error: null }>();
    fixture.rpc.mockReturnValueOnce(pending.result);
    memberAdmin.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    let active = true;
    const result = inviteFamilyMember({
      familyId,
      email: oldRequest.email,
      displayName: oldRequest.displayName,
      role: 'guest',
      current: () => active,
    });
    expect(fixture.rpc).toHaveBeenCalledWith(
      'submit_access_request',
      expect.objectContaining({ p_family_id: familyId })
    );
    active = false;
    pending.resolve({ data: oldRequest.id, error: null });
    await result;
    expect(memberAdmin.invoke).not.toHaveBeenCalled();
  });

  it('blocks a profile update when the person update finished in a departed session', async () => {
    const { updateFamilyMemberDisplayName } = await adapter();
    const pending = deferred<{ error: null }>();
    memberAdmin.from.mockReturnValue({ update: () => ({ eq: () => pending.result }) });
    let active = true;
    const result = updateFamilyMemberDisplayName({
      personId: oldMember.personId,
      userId: oldMember.userId,
      displayName: 'Current saved name',
      current: () => active,
    });
    expect(memberAdmin.from).toHaveBeenCalledWith('people');
    active = false;
    pending.resolve({ error: null });
    await result;
    expect(memberAdmin.from).not.toHaveBeenCalledWith('profiles');
  });

  it('keeps both invitation and display-name steps for current sessions', async () => {
    const { inviteFamilyMember, updateFamilyMemberDisplayName } = await adapter();
    fixture.rpc.mockResolvedValueOnce({ data: oldRequest.id, error: null });
    memberAdmin.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const eq = vi.fn().mockResolvedValue({ error: null });
    memberAdmin.from.mockReturnValue({ update: () => ({ eq }) });
    const current = () => true;
    await inviteFamilyMember({
      familyId,
      email: oldRequest.email,
      displayName: oldRequest.displayName,
      role: 'parent',
      current,
    });
    expect(memberAdmin.invoke).toHaveBeenCalledWith('approve-access-request', {
      body: { request_id: oldRequest.id, role: 'parent' },
    });
    await updateFamilyMemberDisplayName({
      personId: oldMember.personId,
      userId: oldMember.userId,
      displayName: 'Current saved name',
      current,
    });
    expect(memberAdmin.from.mock.calls).toEqual([['people'], ['profiles']]);
    expect(eq.mock.calls).toEqual([
      ['id', oldMember.personId],
      ['id', oldMember.userId],
    ]);
  });
});
