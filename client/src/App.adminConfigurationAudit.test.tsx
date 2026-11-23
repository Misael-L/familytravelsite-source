import { AxiosError } from 'axios';
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAdmin, buildCategory } from '../tests/helpers/factories';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '../tests/helpers/render';
import { resetAllStores } from '../tests/helpers/store';
import App from './App';
import { apiClient } from './api/client';
import FamilyAdminPage from './integrations/family/FamilyAdminPage';
import { installFamilyFrontend } from './integrations/family/bootstrap';
import { apiClient as copiedClient } from './integrations/family/legacy/api/client';
import { useAddonStore as useCopiedAddonStore } from './integrations/family/legacy/store/addonStore';
import { familyAuthStore } from './integrations/family/repository';
import { activateFamilyFrontend, isFamilyFrontendActive } from './integrations/family/runtime';
import { useAddonStore } from './store/addonStore';
import { useAuthStore } from './store/authStore';
import { usePluginStore } from './store/pluginStore';
import { useSettingsStore } from './store/settingsStore';

const fixture = vi.hoisted(() => ({ phone: false, familyActive: false, rpc: vi.fn(), copiedReads: vi.fn() }));
vi.mock('./mobile/useIsPhone', () => ({ useIsPhone: () => fixture.phone }));
// Use the same router context for both import paths in Vitest, as the web build does.
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
  listFamilyAdminMembers: async () => [],
  listPendingAccessRequests: async () => [],
  loadFamilyAdminStats: async () => ({ totalUsers: 0, totalTrips: 0, totalPlaces: 0, totalFiles: 0 }),
}));
vi.mock('@family/backend/supabase/client', async (original) => ({
  ...(await original<typeof import('@family/backend/supabase/client')>()),
  getSupabaseBrowserClient: () => ({ rpc: fixture.rpc }),
}));

const nativeAdapter = apiClient.defaults.adapter;
const copiedAdapter = copiedClient.defaults.adapter;
const initialFamily = familyAuthStore.getState();
const familyId = '0b930000-0000-4000-8000-000000000051';
const templateId = '0b930000-0000-4000-8000-000000000052';
const categoryId = '0b930000-0000-4000-8000-000000000053';
const item = {
  id: '0b930000-0000-4000-8000-000000000054',
  name: 'Raincoat',
  category: 'Clothing',
  quantity: 2,
  weight_grams: 230,
  sort_order: 0,
};
const template = { id: templateId, family_id: familyId, name: 'Family template', items: [item] };
const category = {
  id: categoryId,
  family_id: familyId,
  name: 'Family category',
  color_hex: '#10b981',
  icon_key: 'MapPin',
  sort_order: 0,
};
const unlinkedUserId = '0b930000-0000-4000-8000-000000000058';
const rosterPersonId = '0b930000-0000-4000-8000-000000000059';
const packingPath = '/admin/packing-templates';
const pluginPath = '/admin/plugins';
const pluginId = 'fixture-notifier';
const pluginActivatePath = pluginPath + '/' + pluginId + '/activate';
const pluginName = 'Fixture notifier';
const pluginRegistryPath = pluginPath + '/registry';
const registryFixture = {
  id: 'fixture-detail',
  name: 'Fixture registry detail',
  author: 'Fixture author',
  description: 'Synthetic registry entry',
  repo: 'example/fixture-detail',
  type: 'integration',
  latest: '1.0.0',
  latestCompatible: '1.0.0',
  homepage: 'mailto:fixture@example.test',
};
const pluginDetailPath = pluginRegistryPath + '/' + registryFixture.id;
const notificationPath = '/admin/notification-preferences';
const permissionPath = '/admin/permissions';
const jwtRotatePath = '/admin/rotate-jwt-secret';
const jwtSettingsTitle = 'Rotate JWT Secret';
const jwtConfirmLabel = 'Rotate & Log out';
let jwtRoutes = false;
let copiedJwtPosts = 0;
const versionCheckPath = '/admin/version-check';
const demoBaselinePath = '/admin/save-demo-baseline';
const fixtureUpdate = { update_available: true, current: '0.48.0', latest: '0.49.0', is_docker: true };
let updateRoutes = false;
let updateAppConfig: { managed?: boolean; demo_mode?: boolean } = {};
let copiedBaselineSaves = 0;
const instanceAuditPath = '/admin/audit-log';
const familyAuditRpc = 'list_family_audit_events';
const auditTime = '2026-07-01T02:00:00Z';
const instanceEntry = {
  id: 13,
  username: 'Standalone audit actor',
  created_at: auditTime,
  user_id: 13,
  action: 'trip_update',
  user_email: null,
  resource: 'trip',
  details: null,
  ip: null,
};
const earlierInstanceEntry = { ...instanceEntry, id: 12, username: 'Earlier standalone actor' };
const familyAuditActorId = '0b930000-0000-4000-8000-000000000061';
const familyAuditOtherActorId = '0b930000-0000-4000-8000-000000000062';
const familyAuditFirstId = '0b930000-0000-4000-8000-000000000063';
const familyAuditNextId = '0b930000-0000-4000-8000-000000000064';
const instanceAuditReads: unknown[] = [];
const readFamilyAuditArgs = {
  p_family_id: familyId,
  p_limit: 40,
  p_before_created_at: null,
  p_before_id: null,
  p_actor_person_id: null,
  p_capability_key: null,
  p_outcome: null,
};
let auditRoutes = false;

function auditPage(name: string, next = false) {
  return {
    data: {
      events: [
        {
          id: next ? familyAuditFirstId : familyAuditNextId,
          family_id: familyId,
          trip_id: null,
          actor_person_id: familyAuditActorId,
          actor_display_name: name,
          capability_key: 'trip.archive',
          outcome: 'direct',
          resource_type: 'trip',
          resource_id: null,
          operation: 'archive',
          context: {},
          created_at: auditTime,
        },
      ],
      next_cursor: next ? { id: familyAuditFirstId, created_at: auditTime } : null,
    },
    error: null,
  };
}

type AuditRpcArgs = { p_before_id?: string | null; p_actor_person_id?: string | null };
type AuditFixturePage = ReturnType<typeof auditPage>;

function mockFamilyAudit(read: (args: AuditRpcArgs) => AuditFixturePage | Promise<AuditFixturePage>) {
  const other = fixture.rpc.getMockImplementation();
  assert(other, 'Expected the default Family RPC fixture to be installed');
  fixture.rpc.mockImplementation((name: string, args: AuditRpcArgs) =>
    name === familyAuditRpc ? read(args) : other(name, args)
  );
}
const devNotificationsPath = '/admin/dev/test-notification';
const devNotificationsUrl = '/admin?tab=dev-notifications';
const devTabName = 'Dev: Notifications';
const devTrips = [
  { id: 31, title: 'Fixture first trip' },
  { id: 47, title: 'Fixture second trip' },
];
let devAppConfig: Promise<{ dev_mode: boolean }> | null = null;
let devNotificationRoutes = false;
const adminAddonsPath = '/admin/addons';
const adminBagTrackingPath = '/admin/bag-tracking';
const adminCollabFeaturesPath = '/admin/collab-features';
const todoAddon = {
  id: 'todo',
  name: 'Todo List',
  description: 'Track tasks',
  icon: 'ListChecks',
  type: 'trip',
  enabled: false,
};
const tripAddons = [
  todoAddon,
  { ...todoAddon, id: 'packing', name: 'Lists', enabled: true },
  { ...todoAddon, id: 'collab', name: 'Collab', enabled: true },
];
const collabDefaults = { chat: true, notes: false, links: true, polls: false, whatsnext: true };
let addonRoutes = false;
let permissionRoutes = false;
const savedBackup = { filename: 'fixture-backup.zip', created_at: '2026-07-01T02:00:00Z', size: 1024 };
const backupListPath = '/backup/list';
const backupSchedulePath = '/backup/auto-settings';
const defaultSchedule = { enabled: false, interval: 'daily', keep_days: 7, hour: 2, day_of_week: 0, day_of_month: 1 };
let backupRoutes = false;
const mcpAddon = { id: 'mcp', name: 'MCP', type: 'mcp', icon: '', enabled: true };
const mcpTokensPath = '/admin/mcp-tokens';
const oauthSessionsPath = '/admin/oauth-sessions';
const mockDate = '2026-07-01T02:00:00Z';
const savedToken = {
  id: 81,
  name: 'Fixture token',
  token_prefix: 'fixture',
  username: 'fixture-user',
  user_id: 91,
  created_at: mockDate,
  last_used_at: null,
};
const savedSession = {
  id: 82,
  client_id: 'fixture-client',
  client_name: 'Fixture OAuth client',
  username: 'fixture-user',
  user_id: 91,
  scopes: ['trips:read'],
  created_at: mockDate,
  access_token_expires_at: mockDate,
  refresh_token_expires_at: mockDate,
};
const nativeMcpRequests: string[] = [];
let mcpRoutes = false;
const githubReleasesPath = '/admin/github-releases';
const firstRelease = 'v0.50.10';
const prerelease = 'v0.50.11-preview';
const olderRelease = 'v0.49.0';
const releaseNote = 'Fixture notes for the standalone release';
const stableReleases = Array.from({ length: 9 }, (_, index) => ({
  id: index + 1,
  tag_name: `v0.50.${10 - index}`,
  prerelease: false,
  created_at: mockDate,
  body: index === 0 ? releaseNote : null,
}));
const githubPages = [
  [{ id: 10, tag_name: prerelease, prerelease: true, created_at: mockDate }, ...stableReleases],
  [{ id: 11, tag_name: olderRelease, prerelease: false, created_at: mockDate }],
];
const githubRequests: Array<{ method: string | undefined; params: unknown }> = [];
const notificationMatrix = {
  event_types: ['version_available'],
  channels: [{ id: 'email', active: true }],
  implemented_combos: { version_available: ['email'] },
  preferences: { version_available: { email: true } },
};
const proposalCreated = 'proposal.created';
const defaultEventName = 'Trip proposal created';
const fileTypesPlaceholder = 'jpg,png,pdf,doc,docx,xls,xlsx,txt,csv';
let pluginDetailAvailable = false;
const nativeReads: string[] = [];
const nativeWrites: Array<{ url: string; data: unknown }> = [];
const newPacking = 'Updated packing list';
const newCategory = 'Updated place category';

type AdminRpcArgs = {
  p_name?: string;
  p_patch?: Record<string, unknown>;
  p_policies?: { direct_scope: string }[];
};

function seedFamily(role: 'patriarch' | 'parent', canManage: boolean, initialPushEnabled = true) {
  vi.stubEnv('VITE_DATA_PLANE', 'supabase');
  activateFamilyFrontend();
  familyAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    authCheckFailed: false,
    authGate: 'ok',
    isSuperAdmin: false,
    familyId,
    membershipRole: role,
    authUserId: '0b930000-0000-4000-8000-000000000055',
    personId: '0b930000-0000-4000-8000-000000000056',
  });

  let personLinked = false;
  let proposalPushEnabled = initialPushEnabled;
  let proposalDefaultSource = 'catalog';
  let displayCurrency: string | null = null;
  let directScope = 'patriarch';
  const policies = () =>
    permissionRoutes
      ? [
          {
            key: 'trip.archive',
            group: 'lifecycle',
            context: 'trip',
            display_order: 1,
            configurable: true,
            default_direct_scope: 'patriarch',
            default_propose_scope: null,
            effective_direct_scope: directScope,
            effective_propose_scope: null,
            allowed_direct_scopes: ['patriarch', 'reviewers'],
            allowed_propose_scopes: [],
            is_custom: directScope !== 'patriarch',
          },
        ]
      : [];
  fixture.rpc.mockImplementation(async (name: string, args: AdminRpcArgs) => {
    const scope = { family_id: familyId, can_manage: canManage };
    switch (name) {
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
      case 'get_family_preference_defaults':
        return { data: { ...scope, defaults: { display_currency: displayCurrency } }, error: null };
      case 'update_family_preference_defaults': {
        if (!canManage) throw new Error('Editing defaults requires a managing Family role');
        const currency = args.p_patch?.display_currency;
        if (typeof currency === 'string') displayCurrency = currency;
        else if (currency === null) displayCurrency = null;
        else throw new Error('Expected a display currency');
        return { data: { ...scope, defaults: { display_currency: displayCurrency } }, error: null };
      }
      case 'get_family_notification_defaults':
        return {
          data: {
            ...scope,
            in_app_mandatory: true,
            defaults: [
              {
                event_key: proposalCreated,
                destination_kind: 'proposal',
                display_order: 20,
                push_enabled: proposalPushEnabled,
                source: proposalDefaultSource,
              },
            ],
            health: { active_ios_devices: 2 },
          },
          error: null,
        };
      case 'update_family_notification_defaults': {
        if (!canManage) throw new Error('Editing notification defaults requires a managing Family role');
        const pushEnabled = args.p_patch?.[proposalCreated];
        if (typeof pushEnabled === 'boolean') proposalPushEnabled = pushEnabled;
        proposalDefaultSource = 'family';
        return { data: { ok: true }, error: null };
      }
      case 'get_family_file_policy':
        return { data: { ...scope, retention_days: 45, trip_file_max_bytes: 42 * 1024 * 1024 }, error: null };
      case 'link_family_member_person':
        if (!canManage) throw new Error('Identity link requires a managing Family role');
        personLinked = true;
        return { data: { ok: true }, error: null };
      case 'list_family_permission_policies':
        return { data: { ...scope, policies: policies() }, error: null };
      case 'update_family_permission_policies':
        if (!canManage || args.p_policies?.length !== 1) throw new Error('Expected one authorized permission update');
        directScope = args.p_policies[0].direct_scope;
        return { data: { ...scope, policies: policies() }, error: null };
      case 'list_family_packing_templates':
        return { data: { ...scope, templates: [template] }, error: null };
      case 'list_family_place_categories':
        return { data: { ...scope, categories: [category] }, error: null };
      case 'upsert_family_packing_template':
        return { data: { template: { ...template, name: args.p_name } }, error: null };
      case 'upsert_family_place_category':
        return { data: { category: { ...category, name: args.p_name } }, error: null };
      default:
        throw new Error('Unexpected Admin fixture RPC ' + name);
    }
  });
}

async function openAdminTab(
  label:
    | 'Personalization'
    | 'Settings'
    | 'Notifications'
    | 'Plugins'
    | 'User Defaults'
    | 'Users'
    | 'Backup'
    | 'MCP Access'
    | 'GitHub'
    | 'Addons'
    | typeof devTabName
    | 'Audit',
  phone = false
) {
  if (phone) {
    fireEvent.click(await screen.findByRole('button', { name: 'Administration' }));
    fireEvent.click(await screen.findByRole('button', { name: label }));
  } else {
    fireEvent.click(await screen.findByText(label, { selector: 'nav button span' }));
  }
}

beforeEach(() => {
  resetAllStores();
  fixture.phone = false;
  fixture.familyActive = false;
  fixture.rpc.mockReset();
  fixture.copiedReads.mockReset();
  permissionRoutes = false;
  backupRoutes = false;
  mcpRoutes = false;
  addonRoutes = false;
  auditRoutes = false;
  updateRoutes = false;
  jwtRoutes = false;
  copiedJwtPosts = 0;
  updateAppConfig = {};
  copiedBaselineSaves = 0;
  instanceAuditReads.length = 0;
  devAppConfig = null;
  devNotificationRoutes = false;
  nativeMcpRequests.length = 0;
  githubRequests.length = 0;
  useCopiedAddonStore.setState({ addons: [] });
  pluginDetailAvailable = false;
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

  const starter = { id: 7, name: 'Standalone template', item_count: 0, category_count: 0 };
  const templates = [starter];
  const categories = [buildCategory({ id: 8, name: 'Standalone category' })];
  let allowedFileTypes = 'jpg,png';
  let pluginEnabled = false;
  let adminNotificationPrefs = notificationMatrix.preferences;
  let instancePermission = 'admin';
  let backupSchedule = defaultSchedule;
  let todoEnabled = false;
  let bagTracking = false;
  let collabFeatures = collabDefaults;
  let mcpTokens = [savedToken];
  let oauthSessions = [savedSession];
  apiClient.defaults.adapter = async (config) => {
    const url = config.url ?? '';
    let data: unknown = { users: [], invites: [], trips: [], countries: [], regions: [] };
    if (url === '/system-notices/active') data = [];
    if (jwtRoutes && url === jwtRotatePath && config.method === 'post') {
      nativeWrites.push({ url, data: config.data });
      data = { success: true };
    }
    if (updateRoutes && url === versionCheckPath) {
      nativeReads.push(url);
      data = fixtureUpdate;
    }
    if (updateRoutes && url === demoBaselinePath && config.method === 'post') {
      nativeWrites.push({ url, data: config.data });
      data = { success: true };
    }
    if (auditRoutes && url === instanceAuditPath) {
      instanceAuditReads.push(config.params);
      data = { entries: [config.params.offset === 0 ? instanceEntry : earlierInstanceEntry], total: 2 };
    }
    if (devNotificationRoutes && url === '/trips') {
      nativeReads.push(url);
      data = { trips: devTrips };
    }
    if (url === devNotificationsPath && config.method === 'post') {
      nativeWrites.push({ url, data: JSON.parse(config.data) });
      data = { success: true };
    }
    if (addonRoutes && url === adminAddonsPath) {
      nativeReads.push(url);
      data = { addons: [{ ...todoAddon, enabled: todoEnabled }, ...tripAddons.slice(1)] };
    }
    if (addonRoutes && url === `${adminAddonsPath}/todo` && config.method === 'put') {
      const input = JSON.parse(config.data);
      nativeWrites.push({ url, data: input });
      todoEnabled = input.enabled;
      data = { addon: { ...todoAddon, enabled: todoEnabled } };
    }
    if (addonRoutes && url === adminBagTrackingPath) {
      if (config.method === 'put') {
        const input = JSON.parse(config.data);
        nativeWrites.push({ url, data: input });
        bagTracking = input.enabled;
      } else {
        nativeReads.push(url);
      }
      data = { enabled: bagTracking };
    }
    if (addonRoutes && url === adminCollabFeaturesPath) {
      if (config.method === 'put') {
        const input = JSON.parse(config.data);
        nativeWrites.push({ url, data: input });
        collabFeatures = { ...collabFeatures, ...input };
      } else {
        nativeReads.push(url);
      }
      data = collabFeatures;
    }
    if (url === githubReleasesPath) {
      githubRequests.push({ method: config.method, params: config.params });
      data = githubPages[config.params.page - 1] ?? [];
    }
    if (mcpRoutes) {
      if (url === mcpTokensPath && config.method === 'get') {
        nativeMcpRequests.push(`GET ${url}`);
        data = { tokens: mcpTokens };
      }
      if (url === oauthSessionsPath && config.method === 'get') {
        nativeMcpRequests.push(`GET ${url}`);
        data = { sessions: oauthSessions };
      }
      if (config.method === 'delete' && url === `${mcpTokensPath}/${savedToken.id}`) {
        nativeMcpRequests.push(`DELETE ${url}`);
        mcpTokens = [];
        data = { success: true };
      }
      if (config.method === 'delete' && url === `${oauthSessionsPath}/${savedSession.id}`) {
        nativeMcpRequests.push(`DELETE ${url}`);
        oauthSessions = [];
        data = { success: true };
      }
    }
    if (backupRoutes && url === backupListPath) {
      nativeReads.push(url);
      data = { backups: [savedBackup] };
    }
    if (backupRoutes && url === backupSchedulePath) {
      if (config.method === 'put') {
        backupSchedule = JSON.parse(config.data);
        nativeWrites.push({ url, data: backupSchedule });
      } else {
        nativeReads.push(url);
      }
      data = { settings: backupSchedule, timezone: 'UTC' };
    }
    if (url === permissionPath) {
      data = { permissions: [] };
      if (permissionRoutes && config.method === 'put') {
        const input = JSON.parse(config.data);
        nativeWrites.push({ url, data: input });
        instancePermission = input.permissions.trip_create;
        data = { permissions: { trip_create: instancePermission }, skipped: [] };
      } else if (permissionRoutes) {
        nativeReads.push(url);
        data = {
          permissions: [
            {
              key: 'trip_create',
              level: instancePermission,
              defaultLevel: 'admin',
              allowedLevels: ['admin', 'everybody'],
            },
          ],
        };
      }
    }
    if (url === '/notifications/in-app/unread-count') data = { count: 0 };
    if (url === '/admin/transit-provider') data = { provider: 'transitous', googleKeySource: null };
    if (url === notificationPath) {
      if (config.method === 'put') {
        adminNotificationPrefs = JSON.parse(config.data);
        nativeWrites.push({ url, data: adminNotificationPrefs });
      } else {
        nativeReads.push(url);
      }
      data = { ...notificationMatrix, preferences: adminNotificationPrefs };
    }
    if (url === '/admin/notification-preferences/defaults') {
      data = { event_types: [], channels: [], implemented_combos: {}, defaults: {} };
    }
    if (url === pluginPath) {
      nativeReads.push(url);
      data = {
        enabled: true,
        devLink: false,
        plugins: [
          {
            id: pluginId,
            name: pluginName,
            description: 'Synthetic plugin row',
            type: 'integration',
            version: '1.0.0',
            status: pluginEnabled ? 'active' : 'inactive',
            enabled: pluginEnabled ? 1 : 0,
            permissions: '[]',
            capabilities: '{}',
          },
        ],
      };
    }
    if (url === pluginRegistryPath) data = [registryFixture];
    if (url === pluginDetailPath) {
      nativeReads.push(url);
      if (!pluginDetailAvailable) {
        throw new AxiosError('Plugin detail unavailable', 'ERR_BAD_REQUEST', config);
      }
      data = {
        ...registryFixture,
        compatible: false,
        latestCompatible: '0.9.0',
        trek: '>=5.0.0',
        hostVersion: '4.0.0',
      };
    }
    if (url === pluginActivatePath && config.method === 'post') {
      const input = JSON.parse(config.data);
      nativeWrites.push({ url, data: input });
      if (input.consent !== true) {
        throw new AxiosError('Explicit consent required', 'ERR_BAD_REQUEST', config, undefined, {
          config,
          data: { code: 'CONSENT_REQUIRED', newPermissions: ['db:read:trips'], newEgress: [] },
          status: 409,
          statusText: 'Conflict',
          headers: {},
        });
      }
      pluginEnabled = true;
      data = { ok: true };
    }
    if (url === '/auth/app-config') {
      const devSettings = devAppConfig === null ? {} : await devAppConfig;
      data = { allowed_file_types: allowedFileTypes, ...updateAppConfig, ...devSettings };
    }
    if (url === '/auth/app-settings' && config.method === 'put') {
      const input = JSON.parse(config.data);
      nativeWrites.push({ url, data: input });
      allowedFileTypes = input.allowed_file_types;
      data = { allowed_file_types: allowedFileTypes };
    }
    if (url === packingPath || url === '/categories') {
      if (config.method === 'post') {
        const input = JSON.parse(config.data);
        nativeWrites.push({ url, data: input });
        if (url === packingPath) {
          const created = { ...starter, id: 70, name: input.name };
          templates.push(created);
          data = { template: created };
        } else {
          const created = buildCategory({ id: 80, ...input });
          categories.push(created);
          data = { category: created };
        }
      } else {
        nativeReads.push(url);
        data = url === packingPath ? { templates: templates.slice() } : { categories: categories.slice() };
      }
    } else if (url.startsWith(packingPath + '/')) {
      data = { categories: [], items: [] };
    }
    return { config, data, status: 200, statusText: 'OK', headers: {} };
  };
  copiedClient.defaults.adapter = async (config) => {
    if (jwtRoutes && config.url === jwtRotatePath && config.method === 'post') {
      copiedJwtPosts++;
      return { config, data: { success: true }, status: 200, statusText: 'OK', headers: {} };
    }
    if (updateRoutes && config.url === versionCheckPath) {
      fixture.copiedReads(config.url);
      return { config, data: fixtureUpdate, status: 200, statusText: 'OK', headers: {} };
    }
    if (updateRoutes && config.url === demoBaselinePath && config.method === 'post') {
      copiedBaselineSaves++;
      return { config, data: { success: true }, status: 200, statusText: 'OK', headers: {} };
    }
    if (auditRoutes && config.url === instanceAuditPath) {
      fixture.copiedReads(config.url);
      return { config, data: { entries: [instanceEntry], total: 1 }, status: 200, statusText: 'OK', headers: {} };
    }
    const url = config.url ?? '';
    if (devNotificationRoutes && url === '/trips') {
      fixture.copiedReads(url);
      return { config, data: { trips: devTrips }, status: 200, statusText: 'OK', headers: {} };
    }
    if (addonRoutes && [adminAddonsPath, adminBagTrackingPath, adminCollabFeaturesPath].includes(url)) {
      fixture.copiedReads(url);
      const data =
        url === adminAddonsPath
          ? { addons: tripAddons }
          : url === adminBagTrackingPath
            ? { enabled: false }
            : collabDefaults;
      return { config, data, status: 200, statusText: 'OK', headers: {} };
    }
    if (config.url === githubReleasesPath) {
      fixture.copiedReads(config.url);
      return { config, data: githubPages[0], status: 200, statusText: 'OK', headers: {} };
    }
    const backupEndpoint = backupRoutes && [backupListPath, backupSchedulePath].includes(config.url ?? '');
    const mcpEndpoint = mcpRoutes && [mcpTokensPath, oauthSessionsPath].includes(config.url ?? '');
    if (
      config.url === packingPath ||
      config.url === '/categories' ||
      config.url === notificationPath ||
      config.url === pluginPath ||
      (permissionRoutes && config.url === permissionPath) ||
      backupEndpoint ||
      mcpEndpoint
    ) {
      fixture.copiedReads(config.url);
    }
    const data = mcpEndpoint
      ? { sessions: [savedSession], tokens: [savedToken] }
      : backupEndpoint
        ? { backups: [savedBackup], settings: defaultSchedule, timezone: 'UTC' }
        : config.url === notificationPath
          ? notificationMatrix
          : { users: [], invites: [], trips: [], templates: [], categories: [], permissions: [], enabled: false };
    return {
      config,
      data,
      status: 200,
      statusText: 'OK',
      headers: {},
    };
  };
});

afterEach(() => {
  cleanup();
  useCopiedAddonStore.setState({ addons: [] });
  familyAuthStore.setState(initialFamily, true);
  apiClient.defaults.adapter = nativeAdapter;
  copiedClient.defaults.adapter = copiedAdapter;
  vi.unstubAllEnvs();
});

describe('Admin configuration data-plane routing', () => {
  it.each([false, true])('uses the native standalone controllers on phone=%s', async (phone) => {
    fixture.phone = phone;
    installFamilyFrontend();
    expect(isFamilyFrontendActive()).toBe(false);
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Personalization', phone);
    expect(await screen.findByText('Standalone template')).toBeInTheDocument();
    expect(await screen.findByText('Standalone category')).toBeInTheDocument();
    expect(nativeReads).toEqual(expect.arrayContaining([packingPath, '/categories']));

    fireEvent.click(screen.getByRole('button', { name: /new template/i }));
    const name = screen.getByPlaceholderText('Template name (e.g. Beach Holiday)');
    fireEvent.change(name, { target: { value: newPacking } });
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(await screen.findByText(newPacking)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /new category/i }));
    expect(screen.getByTitle('Bakery')).toBeInTheDocument();
    expect(screen.getByTitle('Groceries')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Category name'), { target: { value: newCategory } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(nativeWrites).toEqual([
        { url: packingPath, data: { name: newPacking } },
        { url: '/categories', data: expect.objectContaining({ name: newCategory }) },
      ])
    );
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it('routes Family edits through the Family IDs and retains the template items', async () => {
    seedFamily('patriarch', true);
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Personalization');
    const name = await screen.findByDisplayValue(template.name);
    expect(await screen.findByText(category.name)).toBeInTheDocument();
    expect(fixture.rpc).toHaveBeenCalledWith('list_family_packing_templates', { p_family_id: familyId });
    expect(fixture.rpc).toHaveBeenCalledWith('list_family_place_categories', { p_family_id: familyId });

    fireEvent.change(name, { target: { value: newPacking } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith('upsert_family_packing_template', {
        p_family_id: familyId,
        p_template_id: templateId,
        p_name: newPacking,
        p_items: [{ name: 'Raincoat', category: 'Clothing', quantity: 2, weight_grams: 230 }],
      })
    );
    expect(await screen.findByRole('button', { name: newPacking })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /edit category/i }));
    expect(screen.getByTitle('Cafe')).toBeInTheDocument();
    expect(screen.queryByTitle('Bakery')).toBeNull();
    expect(screen.queryByTitle('Groceries')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('Category name'), { target: { value: newCategory } });
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith('upsert_family_place_category', {
        p_family_id: familyId,
        p_category_id: categoryId,
        p_name: newCategory,
        p_color_hex: '#10b981',
        p_icon_key: 'MapPin',
        p_sort_order: null,
      })
    );
    expect(await screen.findByText(newCategory)).toBeInTheDocument();
    expect(nativeReads).toEqual([]);
    expect(nativeWrites).toEqual([]);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
  });

  it('lets an admitted Family reviewer inspect configuration without edit controls', async () => {
    seedFamily('parent', false);
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Personalization');
    fireEvent.click(await screen.findByRole('button', { name: template.name }));
    expect(await screen.findByText(category.name)).toBeInTheDocument();
    expect(screen.getByText(item.name)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /new template|new category|edit category|delete category|^save$/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(template.name)).not.toBeInTheDocument();
    expect(screen.getAllByText('View only')).toHaveLength(2);
    expect(fixture.rpc.mock.calls.map(([name]) => name).sort()).toEqual([
      'list_family_packing_templates',
      'list_family_permission_policies',
      'list_family_place_categories',
    ]);
    expect(nativeReads).toEqual([]);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
  });

  it('does not mount the fallback managers when the Family wrapper is directly rendered on Nest', async () => {
    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    const tab = await screen.findByRole('button', { name: 'Personalization' });
    await act(async () => {
      fireEvent.click(tab);
    });
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Packing Templates' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Categories' })).not.toBeInTheDocument();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
});

describe('Family Admin currency picker', () => {
  it('filters currency options and writes the selected value through the Family ID', async () => {
    seedFamily('patriarch', true);
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('User Defaults');
    fireEvent.click(await screen.findByRole('button', { name: 'Trip currency' }));
    fireEvent.change(screen.getByPlaceholderText('...'), { target: { value: 'MXN' } });
    fireEvent.click(screen.getByRole('button', { name: /^MXN/ }));
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith('update_family_preference_defaults', {
        p_family_id: familyId,
        p_patch: { display_currency: 'MXN' },
      })
    );
    expect(await screen.findByRole('button', { name: /^MXN/ })).toHaveAttribute('aria-expanded', 'false');
    expect(nativeWrites).toEqual([]);
  });

  it('dismisses the open Family Admin currency picker with Escape and returns focus', async () => {
    seedFamily('patriarch', true);
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('User Defaults');
    const trigger = await screen.findByRole('button', { name: 'Trip currency' });
    fireEvent.click(trigger);
    const search = screen.getByPlaceholderText('...');
    expect(search).toHaveFocus();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
    expect(screen.queryByPlaceholderText('...')).toBeNull();
    expect(fixture.rpc.mock.calls.some(([name]) => name === 'update_family_preference_defaults')).toBe(false);
  });

  it('keeps a read-only Family currency picker disabled', async () => {
    seedFamily('parent', false);
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('User Defaults');
    const trigger = await screen.findByRole('button', { name: 'Trip currency' });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByPlaceholderText('...')).toBeNull();
    expect(fixture.rpc.mock.calls.some(([name]) => name === 'update_family_preference_defaults')).toBe(false);
  });
});

describe('Admin Settings data-plane routing', () => {
  it.each([false, true])('loads and saves standalone file settings on phone=%s', async (phone) => {
    fixture.phone = phone;
    installFamilyFrontend();
    expect(isFamilyFrontendActive()).toBe(false);
    const view = render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Settings', phone);
    const fileTypes = await screen.findByDisplayValue('jpg,png');
    const card = fileTypes.closest(phone ? '[class*="--m-sheetop"]' : 'section');
    if (!card) throw new Error('Missing Allowed File Types card');
    fireEvent.change(fileTypes, { target: { value: 'jpg,png,pdf' } });
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(nativeWrites).toEqual([{ url: '/auth/app-settings', data: { allowed_file_types: 'jpg,png,pdf' } }])
    );
    view.unmount();
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Settings', phone);
    expect(await screen.findByDisplayValue('jpg,png,pdf')).toBeInTheDocument();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it('reads Family identity and file policy and saves the roster link with all three IDs', async () => {
    seedFamily('patriarch', true);
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Settings');
    expect(await screen.findByRole('heading', { name: 'Identity and file policy' })).toBeInTheDocument();
    expect(screen.getByText('42 MB')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(fixture.rpc).toHaveBeenCalledWith('get_family_identity_assurance', { p_family_id: familyId });
    expect(fixture.rpc).toHaveBeenCalledWith('get_family_file_policy', { p_family_id: familyId });
    const link = screen.getByRole('button', { name: 'Link account' });
    expect(link).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: rosterPersonId } });
    expect(link).toBeEnabled();
    fireEvent.click(link);
    await waitFor(() => expect(link).not.toBeInTheDocument());
    expect(fixture.rpc).toHaveBeenCalledWith('link_family_member_person', {
      p_family_id: familyId,
      p_person_id: rosterPersonId,
      p_user_id: unlinkedUserId,
    });
    expect(fixture.rpc.mock.calls.filter(([name]) => name === 'get_family_identity_assurance')).toHaveLength(2);
    expect(screen.queryByPlaceholderText(fileTypesPlaceholder)).not.toBeInTheDocument();
    expect(nativeWrites).toEqual([]);
  });

  it('shows the Family file policy to an admitted reviewer without enabling identity edits', async () => {
    seedFamily('parent', false);
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Settings');
    expect(await screen.findByText(/view only.*head of family/i)).toBeInTheDocument();
    expect(screen.getByText('Private files')).toBeInTheDocument();
    expect(screen.getByText('42 MB')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(fixture.rpc.mock.calls.map(([name]) => name).sort()).toEqual([
      'get_family_file_policy',
      'get_family_identity_assurance',
      'list_family_permission_policies',
    ]);
    expect(nativeWrites).toEqual([]);
  });

  it('does not mount the copied Settings form when the Family wrapper is directly rendered on Nest', async () => {
    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    const tab = await screen.findByRole('button', { name: 'Settings' });
    await act(async () => {
      fireEvent.click(tab);
    });
    expect(screen.queryByPlaceholderText(fileTypesPlaceholder)).not.toBeInTheDocument();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
});

describe('Admin Notifications data-plane routing', () => {
  it.each([false, true])('loads and saves standalone notification preferences on phone=%s', async (phone) => {
    fixture.phone = phone;
    installFamilyFrontend();
    expect(isFamilyFrontendActive()).toBe(false);
    const view = render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Notifications', phone);
    const role = phone ? 'switch' : 'button';
    const name = phone ? 'version_available email' : 'New version available, Email';
    const attribute = phone ? 'aria-checked' : 'aria-pressed';
    const toggle = await screen.findByRole(role, { name });
    expect(toggle).toHaveAttribute(attribute, 'true');
    expect(nativeReads).toEqual([notificationPath]);
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(nativeWrites).toEqual([{ url: notificationPath, data: { version_available: { email: false } } }])
    );
    view.unmount();
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Notifications', phone);
    expect(await screen.findByRole(role, { name })).toHaveAttribute(attribute, 'false');
    expect(nativeReads).toEqual([notificationPath, notificationPath]);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it('loads, updates and rereads Family defaults with the selected event and Family ID', async () => {
    seedFamily('patriarch', true);
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Notifications');
    expect(await screen.findByRole('heading', { name: 'Family notifications' })).toBeInTheDocument();
    expect(screen.getByText('Catalog default')).toBeInTheDocument();
    expect(screen.getByText(/2 active iOS devices/)).toBeInTheDocument();
    expect(screen.getByText(/in-app notifications are required/i)).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: defaultEventName, pressed: true });
    fireEvent.click(toggle);
    expect(await screen.findByText('Family default')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(fixture.rpc.mock.calls.filter(([name]) => /family_notification_defaults$/.test(name))).toEqual([
      ['get_family_notification_defaults', { p_family_id: familyId }],
      ['update_family_notification_defaults', { p_family_id: familyId, p_patch: { [proposalCreated]: false } }],
      ['get_family_notification_defaults', { p_family_id: familyId }],
    ]);
    expect(nativeReads).toEqual([]);
    expect(nativeWrites).toEqual([]);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
  });

  it.each([
    { pushEnabled: true, label: 'On' },
    { pushEnabled: false, label: 'Off' },
  ])('shows a Family reviewer the $label state without sending a write', async ({ pushEnabled, label }) => {
    seedFamily('parent', false, pushEnabled);
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Notifications');
    expect(await screen.findByText(/view only.*head of family/i)).toBeInTheDocument();
    const row = (await screen.findByText(defaultEventName)).parentElement?.parentElement;
    if (!row) throw new Error('Missing Family notification default row');
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    expect(within(row).queryByRole('switch')).not.toBeInTheDocument();
    expect(within(row).getByText(label)).toBeVisible();
    expect(within(row).getByText('Catalog default')).toBeVisible();
    expect(fixture.rpc.mock.calls.map(([name]) => name).sort()).toEqual([
      'get_family_notification_defaults',
      'list_family_permission_policies',
    ]);
    expect(nativeReads).toEqual([]);
    expect(nativeWrites).toEqual([]);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
  });

  it('does not mount copied Notifications when the Family wrapper is directly rendered on Nest', async () => {
    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    const tab = await screen.findByText('Notifications', { selector: 'nav button span' });
    await act(async () => {
      fireEvent.click(tab);
    });
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Family notifications' })).not.toBeInTheDocument();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
});

describe('Admin Plugins data-plane routing', () => {
  it.each([false, true])(
    'requires explicit plugin activation consent on the standalone route on phone=%s',
    async (phone) => {
      fixture.phone = phone;
      installFamilyFrontend();
      expect(isFamilyFrontendActive()).toBe(false);
      render(<App />, { initialEntries: ['/admin'] });
      await openAdminTab('Plugins', phone);
      expect(await screen.findByText(pluginName)).toBeInTheDocument();
      const role = phone ? 'switch' : 'button';
      const enable = screen.getByRole(role, { name: 'Enable plugin' });

      fireEvent.click(enable);
      expect(await screen.findByText('Read trips the acting user can access')).toBeInTheDocument();
      const firstAttempt = { url: pluginActivatePath, data: {} };
      expect(nativeWrites).toEqual([firstAttempt]);
      fireEvent.click(screen.getByRole('button', { name: 'Keep off for now' }));
      expect(screen.queryByRole('button', { name: 'Approve & turn on' })).not.toBeInTheDocument();
      expect(nativeWrites).toEqual([firstAttempt]);

      fireEvent.click(screen.getByRole(role, { name: 'Enable plugin' }));
      const approve = await screen.findByRole('button', { name: 'Approve & turn on' });
      const readsBeforeApproval = nativeReads.length;
      fireEvent.click(approve);
      const state = phone ? 'aria-checked' : 'aria-pressed';
      await waitFor(() => expect(screen.getByRole(role, { name: 'Enable plugin' })).toHaveAttribute(state, 'true'));
      expect(nativeWrites).toEqual([firstAttempt, firstAttempt, { url: pluginActivatePath, data: { consent: true } }]);
      expect(nativeReads.length).toBeGreaterThan(readsBeforeApproval);
      expect([...new Set(nativeReads)]).toEqual([pluginPath]);
      expect(fixture.copiedReads).not.toHaveBeenCalled();
      expect(fixture.rpc).not.toHaveBeenCalled();
    }
  );

  it.each([false, true])('loads plugin detail only when opened on phone=%s', async (phone) => {
    fixture.phone = phone;
    installFamilyFrontend();
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Plugins', phone);
    fireEvent.click(await screen.findByRole('tab', { name: /Discover/ }));
    const entry = await screen.findByText(registryFixture.name);
    expect(nativeReads).not.toContain(pluginDetailPath);
    fireEvent.click(entry);
    expect(await screen.findByText('Could not load plugin details.')).toBeInTheDocument();
    expect(nativeReads.filter((url) => url === pluginDetailPath)).toEqual([pluginDetailPath]);
    expect(screen.queryByRole('link', { name: /homepage/i })).not.toBeInTheDocument();
    expect(nativeWrites).toEqual([]);
  });

  it.each([false, true])('uses the fetched plugin compatibility offer on phone=%s', async (phone) => {
    fixture.phone = phone;
    pluginDetailAvailable = true;
    installFamilyFrontend();
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Plugins', phone);
    fireEvent.click(await screen.findByRole('tab', { name: /Discover/ }));
    const entry = await screen.findByText(registryFixture.name);
    expect(nativeReads).not.toContain(pluginDetailPath);
    fireEvent.click(entry);
    expect(await screen.findByRole('button', { name: /^install 0\.9\.0$/i })).toBeInTheDocument();
    expect(nativeReads.filter((url) => url === pluginDetailPath)).toEqual([pluginDetailPath]);
    expect(nativeWrites).toEqual([]);
  });

  it.each([false, true])('keeps Plugins hidden through the Family route on phone=%s', async (phone) => {
    fixture.phone = phone;
    seedFamily('patriarch', true);
    render(<App />, { initialEntries: ['/admin?tab=plugins'] });
    expect(await screen.findByText('Personalization', { selector: 'nav button span' })).toBeInTheDocument();
    expect(screen.queryByText('Plugins', { selector: 'nav button span' })).not.toBeInTheDocument();
    expect(nativeReads).toEqual([]);
    expect(nativeWrites).toEqual([]);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
  });

  it('does not expose copied Plugins when the Family wrapper is directly rendered on Nest', async () => {
    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    expect(await screen.findByText('Personalization', { selector: 'nav button span' })).toBeInTheDocument();
    const copiedTab = screen.queryByText('Plugins', { selector: 'nav button span' });
    if (copiedTab) {
      await act(async () => {
        fireEvent.click(copiedTab);
      });
    }
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(copiedTab).not.toBeInTheDocument();
  });
});

describe('Admin permissions data-plane routing', () => {
  it.each([false, true])('reads, saves and reloads standalone permissions on phone=%s', async (phone) => {
    permissionRoutes = true;
    fixture.phone = phone;
    installFamilyFrontend();
    expect(isFamilyFrontendActive()).toBe(false);
    const view = render(<App />, { initialEntries: ['/admin'] });
    if (phone) await openAdminTab('Users', true);
    expect(await screen.findByText('Create trips')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: /^Save$/i });
    expect(save).toBeDisabled();

    if (phone) {
      const control = screen.getByRole('combobox', { name: 'Create trips' });
      expect(control).toHaveValue('admin');
      fireEvent.change(control, { target: { value: 'everybody' } });
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Admin only' }));
      fireEvent.click(await screen.findByText('Everyone'));
    }
    fireEvent.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    expect(nativeWrites).toEqual([{ url: permissionPath, data: { permissions: { trip_create: 'everybody' } } }]);

    view.unmount();
    render(<App />, { initialEntries: ['/admin'] });
    if (phone) await openAdminTab('Users', true);
    if (phone) {
      expect(await screen.findByRole('combobox', { name: 'Create trips' })).toHaveValue('everybody');
    } else {
      expect(await screen.findByRole('button', { name: 'Everyone' })).toBeInTheDocument();
    }
    expect(nativeReads.filter((url) => url === permissionPath)).toHaveLength(2);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it('saves and reloads a Family manager policy through the Family route', async () => {
    permissionRoutes = true;
    seedFamily('patriarch', true);
    const view = render(<App />, { initialEntries: ['/admin'] });
    expect(await screen.findByRole('heading', { name: 'Family permissions' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Head of family' }));
    fireEvent.click(await screen.findByText('Reviewers'));
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith('update_family_permission_policies', {
        p_family_id: familyId,
        p_policies: [{ key: 'trip.archive', direct_scope: 'reviewers', propose_scope: null }],
      })
    );
    expect(await screen.findByRole('button', { name: 'Reviewers' })).toBeInTheDocument();

    view.unmount();
    render(<App />, { initialEntries: ['/admin'] });
    expect(await screen.findByRole('button', { name: 'Reviewers' })).toBeInTheDocument();
    expect(fixture.rpc.mock.calls.filter(([name]) => name === 'list_family_permission_policies')).toEqual([
      ['list_family_permission_policies', { p_family_id: familyId }],
      ['list_family_permission_policies', { p_family_id: familyId }],
    ]);
    expect(nativeReads).not.toContain(permissionPath);
    expect(nativeWrites).toEqual([]);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
  });

  it('shows a Family reviewer the policy without editing or reset controls', async () => {
    permissionRoutes = true;
    fixture.phone = true;
    seedFamily('parent', false);
    render(<App />, { initialEntries: ['/admin'] });
    expect(await screen.findByText('Archive trips')).toBeInTheDocument();
    expect(screen.getByText('Head of family')).toBeInTheDocument();
    expect(screen.getByText(/View only/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Head of family' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset to defaults' })).not.toBeInTheDocument();
    expect(fixture.rpc.mock.calls.some(([name]) => /^(update|reset)_family_permission_policies$/.test(name))).toBe(
      false
    );
    expect(nativeReads).not.toContain(permissionPath);
    expect(nativeWrites).toEqual([]);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
  });

  it('does not expose the copied instance permissions when the Family wrapper is mounted on Nest', async () => {
    permissionRoutes = true;
    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    await act(async () => {
      await screen.findByText('Users', { selector: 'nav button span' });
    });
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(screen.queryByText('Permission Settings')).not.toBeInTheDocument();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
});

describe('Website Admin backup routing', () => {
  it.each([false, true])('reads, saves and reloads the standalone backup schedule on phone=%s', async (phone) => {
    backupRoutes = true;
    fixture.phone = phone;
    installFamilyFrontend();
    expect(isFamilyFrontendActive()).toBe(false);
    const view = render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Backup', phone);
    expect(await screen.findByText(savedBackup.filename)).toBeInTheDocument();
    const role = phone ? 'switch' : 'button';
    const state = phone ? 'aria-checked' : 'aria-pressed';
    const enable = screen.getByRole(role, { name: 'Enable auto-backup' });
    expect(enable).toHaveAttribute(state, 'false');
    fireEvent.click(enable);
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    expect(await screen.findByText('Auto-backup settings saved')).toBeInTheDocument();
    expect(nativeWrites).toEqual([{ url: backupSchedulePath, data: { ...defaultSchedule, enabled: true } }]);

    view.unmount();
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Backup', phone);
    await waitFor(() => {
      expect(screen.getByRole(role, { name: 'Enable auto-backup' })).toHaveAttribute(state, 'true');
    });
    expect(nativeReads.filter((path) => path === backupListPath)).toHaveLength(2);
    expect(nativeReads.filter((path) => path === backupSchedulePath)).toHaveLength(2);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it.each([false, true])('keeps the backup tab and requests off the Family route on phone=%s', async (phone) => {
    backupRoutes = true;
    fixture.phone = phone;
    seedFamily('patriarch', true);
    render(<App />, { initialEntries: ['/admin?tab=backup'] });
    expect(await screen.findByRole('heading', { name: 'Family permissions' })).toBeInTheDocument();
    expect(screen.queryByText('Backup', { selector: 'nav button span' })).not.toBeInTheDocument();
    expect(screen.queryByText('Data Backup')).not.toBeInTheDocument();
    expect(nativeReads).toEqual([]);
    expect(nativeWrites).toEqual([]);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
  });

  it.each([false, true])('does not mount a known-managed backup shortcut on phone=%s', async (phone) => {
    backupRoutes = true;
    fixture.phone = phone;
    useAuthStore.setState({ managed: true });
    render(<App />, { initialEntries: ['/admin?tab=backup'] });
    if (phone) await screen.findByRole('button', { name: 'Administration' });
    expect(await screen.findByText('Permission Settings')).toBeInTheDocument();
    expect(screen.queryByText('Data Backup')).not.toBeInTheDocument();
    expect(nativeReads).toEqual([]);
    expect(nativeWrites).toEqual([]);
  });

  it('does not expose the copied backup tab when the Family wrapper is mounted directly on Nest', async () => {
    backupRoutes = true;
    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    await screen.findByText('Users', { selector: 'nav button span' });
    const copiedTab = screen.queryByText('Backup', { selector: 'nav button span' });
    if (copiedTab) {
      fireEvent.click(copiedTab);
      expect(await screen.findByText(savedBackup.filename)).toBeInTheDocument();
    }
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(copiedTab).not.toBeInTheDocument();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
});

describe('Website Admin MCP access routing', () => {
  it.each([false, true])('lists, revokes and reloads standalone MCP access on phone=%s', async (phone) => {
    mcpRoutes = true;
    fixture.phone = phone;
    useAddonStore.setState({ addons: [mcpAddon] });
    const view = render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('MCP Access', phone);
    expect(await screen.findByText(savedSession.client_name)).toBeInTheDocument();
    expect(await screen.findByText(savedToken.name)).toBeInTheDocument();
    expect(nativeMcpRequests.slice().sort()).toEqual([`GET ${mcpTokensPath}`, `GET ${oauthSessionsPath}`]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    await screen.findByText('Revoke Session');
    expect(nativeMcpRequests).toHaveLength(2);
    const sessionConfirm = phone
      ? within(await screen.findByRole('dialog', { name: 'Revoke Session' })).getByRole('button', { name: 'Delete' })
      : screen.getByText('Delete', { selector: 'button' });
    fireEvent.click(sessionConfirm);
    await waitFor(() => expect(screen.queryByText(savedSession.client_name)).not.toBeInTheDocument());
    expect(screen.getByText(savedToken.name)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    await screen.findByText('Delete Token');
    expect(nativeMcpRequests.slice(2)).toEqual([`DELETE ${oauthSessionsPath}/${savedSession.id}`]);
    const tokenConfirm = phone
      ? within(await screen.findByRole('dialog', { name: 'Delete Token' })).getByRole('button', { name: 'Delete' })
      : screen.getByText('Delete', { selector: 'button' });
    fireEvent.click(tokenConfirm);
    await waitFor(() => expect(screen.queryByText(savedToken.name)).not.toBeInTheDocument());
    expect(nativeMcpRequests.slice(2)).toEqual([
      `DELETE ${oauthSessionsPath}/${savedSession.id}`,
      `DELETE ${mcpTokensPath}/${savedToken.id}`,
    ]);

    view.unmount();
    render(<App />, { initialEntries: ['/admin?tab=mcp-tokens'] });
    expect(await screen.findByText('No MCP tokens have been created yet')).toBeInTheDocument();
    expect(screen.queryByText(savedSession.client_name)).not.toBeInTheDocument();
    expect(nativeMcpRequests.slice(4).sort()).toEqual([`GET ${mcpTokensPath}`, `GET ${oauthSessionsPath}`]);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it.each([false, true])('keeps MCP access off the Family route on phone=%s', async (phone) => {
    mcpRoutes = true;
    fixture.phone = phone;
    seedFamily('patriarch', true);
    useCopiedAddonStore.setState({ addons: [mcpAddon] });
    render(<App />, { initialEntries: ['/admin?tab=mcp-tokens'] });
    expect(await screen.findByRole('heading', { name: 'Family permissions' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'MCP Access' })).not.toBeInTheDocument();
    expect(screen.queryByText(savedToken.name)).not.toBeInTheDocument();
    expect(nativeMcpRequests).toEqual([]);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
  });

  it('does not expose copied MCP access when the Family wrapper is mounted on Nest', async () => {
    mcpRoutes = true;
    useCopiedAddonStore.setState({ addons: [mcpAddon] });
    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    await screen.findByText('Users', { selector: 'nav button span' });
    const copiedTab = screen.queryByRole('button', { name: 'MCP Access' });
    if (copiedTab) {
      fireEvent.click(copiedTab);
      expect(await screen.findByText(savedToken.name)).toBeInTheDocument();
    }
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(copiedTab).not.toBeInTheDocument();
    expect(nativeMcpRequests).toEqual([]);
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
});

describe('Website Admin GitHub routing', () => {
  it.each([false, true])('lists and pages through standalone release history on phone=%s', async (phone) => {
    fixture.phone = phone;
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('GitHub', phone);
    expect(await screen.findByText(firstRelease)).toBeInTheDocument();
    expect(screen.queryByText(prerelease)).not.toBeInTheDocument();
    expect(screen.queryByText(releaseNote)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }));
    expect(screen.getByText(releaseNote)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText(olderRelease)).toBeInTheDocument();
    expect(screen.getByText(firstRelease)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(githubRequests).toEqual([
      { method: 'get', params: { per_page: 10, page: 1 } },
      { method: 'get', params: { per_page: 10, page: 2 } },
    ]);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it.each([false, true])('keeps release history off the Family Admin route on phone=%s', async (phone) => {
    fixture.phone = phone;
    seedFamily('patriarch', true);
    render(<App />, { initialEntries: ['/admin?tab=github'] });
    expect(await screen.findByRole('heading', { name: 'Family permissions' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'GitHub' })).not.toBeInTheDocument();
    expect(screen.queryByText('Release History')).not.toBeInTheDocument();
    expect(githubRequests).toEqual([]);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
  });

  it.each([false, true])('does not load release history from a known-managed shortcut on phone=%s', async (phone) => {
    fixture.phone = phone;
    useAuthStore.setState({ managed: true });
    render(<App />, { initialEntries: ['/admin?tab=github'] });
    if (phone) await screen.findByRole('button', { name: 'Administration' });
    expect(await screen.findByText('Permission Settings')).toBeInTheDocument();
    expect(screen.queryByText('Release History')).not.toBeInTheDocument();
    expect(githubRequests).toEqual([]);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
  });

  it('does not expose copied GitHub history when the Family wrapper is mounted on Nest', async () => {
    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    await screen.findByText('Users', { selector: 'nav button span' });
    const copiedTab = screen.queryByRole('button', { name: 'GitHub' });
    if (copiedTab) {
      fireEvent.click(copiedTab);
      expect(await screen.findByText(firstRelease)).toBeInTheDocument();
    }
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(copiedTab).not.toBeInTheDocument();
    expect(githubRequests).toEqual([]);
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
});

describe('Website Admin Add-ons routing', () => {
  it.each([false, true])('reads, saves and reloads standalone addon controls on phone=%s', async (phone) => {
    addonRoutes = true;
    fixture.phone = phone;
    const view = render(<App />, { initialEntries: ['/admin'] });
    const role = phone ? 'switch' : 'button';
    const state = phone ? 'aria-checked' : 'aria-pressed';
    const showAddonControls = async () => {
      await openAdminTab('Addons', phone);
      if (!phone) fireEvent.click(await screen.findByRole('button', { name: /5 options/i, expanded: false }));
      return Promise.all([
        screen.findByRole(role, { name: 'Todo List' }),
        screen.findByRole(role, { name: 'Bag Tracking' }),
        screen.findByRole(role, { name: 'Notes' }),
      ]);
    };

    for (const toggle of await showAddonControls()) {
      expect(toggle).toHaveAttribute(state, 'false');
      fireEvent.click(toggle);
    }
    expect(await screen.findByText('Addon updated')).toBeInTheDocument();
    expect(nativeWrites).toEqual([
      { url: `${adminAddonsPath}/todo`, data: { enabled: true } },
      { url: adminBagTrackingPath, data: { enabled: true } },
      { url: adminCollabFeaturesPath, data: { notes: true } },
    ]);

    view.unmount();
    render(<App />, { initialEntries: ['/admin'] });
    const controls = await showAddonControls();
    await waitFor(() => {
      for (const toggle of controls) expect(toggle).toHaveAttribute(state, 'true');
    });
    for (const url of [adminAddonsPath, adminBagTrackingPath, adminCollabFeaturesPath]) {
      expect(nativeReads.filter((path) => path === url)).toHaveLength(2);
    }
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'shows Family feature controls without standalone addon requests on phone=%s',
    async (phone) => {
      addonRoutes = true;
      fixture.phone = phone;
      seedFamily('patriarch', true);
      render(<App />, { initialEntries: ['/admin?tab=addons'] });
      expect(await screen.findByRole('heading', { name: 'Family permissions' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Features' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Addons' })).not.toBeInTheDocument();
      expect(screen.queryByText('Todo List')).not.toBeInTheDocument();
      expect(nativeReads).toEqual([]);
      expect(nativeWrites).toEqual([]);
      expect(fixture.copiedReads).not.toHaveBeenCalled();
    }
  );

  it('does not load copied Add-ons or its settings when the Family wrapper is mounted on Nest', async () => {
    addonRoutes = true;
    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    await screen.findByText('Users', { selector: 'nav button span' });
    const copiedTab = screen.queryByRole('button', { name: 'Addons' });
    if (copiedTab) {
      fireEvent.click(copiedTab);
      expect(await screen.findByText('Todo List')).toBeInTheDocument();
    }
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(copiedTab).not.toBeInTheDocument();
    expect(nativeReads).toEqual([]);
    expect(nativeWrites).toEqual([]);
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
});

describe('Website Admin developer notifications routing', () => {
  beforeEach(() => {
    devNotificationRoutes = true;
  });

  async function waitForStandaloneAdmin(phone: boolean) {
    if (phone) await screen.findByRole('button', { name: 'Administration' });
    else await screen.findByText('Users', { selector: 'nav button span' });
  }

  it.each([false, true])(
    'dispatches a synthetic selected-trip notification in developer mode on phone=%s',
    async (phone) => {
      fixture.phone = phone;
      devAppConfig = Promise.resolve({ dev_mode: true });
      render(<App />, { initialEntries: ['/admin'] });
      await openAdminTab(devTabName, phone);

      const trip = await screen.findByRole('option', { name: devTrips[1].title });
      const tripSelect = trip.closest('select');
      assert(tripSelect, 'Expected the trip option to belong to a select');
      fireEvent.change(tripSelect, { target: { value: String(devTrips[1].id) } });
      fireEvent.click(screen.getByRole('button', { name: /^trip_reminder/ }));
      expect(await screen.findByText('Sent: trip_reminder')).toBeInTheDocument();
      expect(nativeReads).toContain('/trips');
      expect(nativeWrites).toEqual([
        {
          url: devNotificationsPath,
          data: {
            event: 'trip_reminder',
            scope: 'trip',
            targetId: devTrips[1].id,
            params: { trip: devTrips[1].title, tripId: String(devTrips[1].id) },
          },
        },
      ]);
      expect(fixture.copiedReads).not.toHaveBeenCalled();
    }
  );

  it.each([false, true])(
    'keeps disabled developer notifications out of bookmark renders on phone=%s',
    async (phone) => {
      fixture.phone = phone;
      devAppConfig = Promise.resolve({ dev_mode: false });
      render(<App />, { initialEntries: [devNotificationsUrl] });
      await waitForStandaloneAdmin(phone);
      expect(screen.queryByText('Type Testing')).not.toBeInTheDocument();
      expect(await screen.findByText('Permission Settings')).toBeInTheDocument();
      expect(nativeReads).not.toContain('/trips');
      expect(nativeWrites).toEqual([]);
      expect(fixture.copiedReads).not.toHaveBeenCalled();
    }
  );

  it.each([false, true])('honors a developer bookmark only after config resolves on phone=%s', async (phone) => {
    fixture.phone = phone;
    let resolveConfig!: (config: { dev_mode: boolean }) => void;
    devAppConfig = new Promise((resolve) => {
      resolveConfig = resolve;
    });
    render(<App />, { initialEntries: [devNotificationsUrl] });
    await waitForStandaloneAdmin(phone);
    expect(screen.queryByText('Type Testing')).not.toBeInTheDocument();
    expect(nativeReads).not.toContain('/trips');

    await act(async () => {
      resolveConfig({ dev_mode: true });
    });
    expect(await screen.findByText('Type Testing')).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: devTrips[0].title })).toBeInTheDocument();
    expect(nativeReads.filter((path) => path === '/trips')).toHaveLength(1);
    expect(nativeWrites).toEqual([]);
  });

  it.each([false, true])('keeps developer notifications off the installed Family route on phone=%s', async (phone) => {
    fixture.phone = phone;
    seedFamily('patriarch', true);
    familyAuthStore.setState({ devMode: true });
    render(<App />, { initialEntries: [devNotificationsUrl] });
    expect(await screen.findByRole('heading', { name: 'Family permissions' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: devTabName })).not.toBeInTheDocument();
    expect(screen.queryByText('Type Testing')).not.toBeInTheDocument();
    expect(nativeReads).not.toContain('/trips');
    expect(nativeWrites).toEqual([]);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
  });

  it('does not expose copied developer notifications when the Family wrapper is mounted on Nest', async () => {
    familyAuthStore.setState({ devMode: true });
    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    await screen.findByText('Users', { selector: 'nav button span' });
    const copiedTab = screen.queryByRole('button', { name: devTabName });
    if (copiedTab) {
      fireEvent.click(copiedTab);
      expect(await screen.findByRole('option', { name: devTrips[0].title })).toBeInTheDocument();
    }
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(copiedTab).not.toBeInTheDocument();
    expect(nativeReads).not.toContain('/trips');
    expect(nativeWrites).toEqual([]);
  });
});

describe('Website Admin audit-log routing', () => {
  beforeEach(() => {
    auditRoutes = true;
  });

  it.each([false, true])('loads and pages through standalone instance audit on phone=%s', async (phone) => {
    fixture.phone = phone;
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Audit', phone);
    expect(await screen.findByText(instanceEntry.username)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText(earlierInstanceEntry.username)).toBeInTheDocument();
    expect(screen.getByText(instanceEntry.username)).toBeInTheDocument();
    expect(instanceAuditReads).toEqual([
      { limit: 100, offset: 0 },
      { limit: 100, offset: 100 },
    ]);
    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(fixture.copiedReads).not.toHaveBeenCalled();
  });

  it.each([false, true])('uses the Family product audit and its cursor on phone=%s', async (phone) => {
    fixture.phone = phone;
    seedFamily('patriarch', true);
    mockFamilyAudit((args) =>
      args.p_before_id ? auditPage('Earlier Family audit actor') : auditPage('Family audit actor', true)
    );
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Audit');

    expect(await screen.findByRole('heading', { name: 'Family product audit' })).toBeInTheDocument();
    expect(await screen.findByText('Family audit actor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Earlier Family audit actor')).toBeInTheDocument();
    expect(screen.getByText('Family audit actor')).toBeInTheDocument();
    expect(fixture.rpc.mock.calls.filter(([name]) => name === familyAuditRpc)).toEqual([
      [familyAuditRpc, readFamilyAuditArgs],
      [familyAuditRpc, { ...readFamilyAuditArgs, p_before_created_at: auditTime, p_before_id: familyAuditFirstId }],
    ]);
    expect(instanceAuditReads).toEqual([]);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
  });

  it('does not replace filtered audit results with an older page', async () => {
    seedFamily('patriarch', true);
    let resolveOlder!: (page: AuditFixturePage) => void;
    const older = new Promise<AuditFixturePage>((resolve) => {
      resolveOlder = resolve;
    });
    mockFamilyAudit((args) =>
      args.p_before_id
        ? older
        : auditPage(args.p_actor_person_id ? 'Filtered audit actor' : 'Unfiltered audit actor', !args.p_actor_person_id)
    );
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Audit');
    expect(await screen.findByText('Unfiltered audit actor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() =>
      expect(fixture.rpc).toHaveBeenCalledWith(familyAuditRpc, {
        ...readFamilyAuditArgs,
        p_before_created_at: auditTime,
        p_before_id: familyAuditFirstId,
      })
    );

    fireEvent.change(screen.getByPlaceholderText('Actor person id (optional)'), {
      target: { value: familyAuditActorId },
    });
    expect(await screen.findByText('Filtered audit actor')).toBeInTheDocument();
    expect(fixture.rpc).toHaveBeenCalledWith(familyAuditRpc, {
      ...readFamilyAuditArgs,
      p_actor_person_id: familyAuditActorId,
    });
    await act(async () => {
      resolveOlder(auditPage('Stale earlier audit actor'));
    });
    expect(screen.queryByText('Stale earlier audit actor')).not.toBeInTheDocument();
    expect(screen.getByText('Filtered audit actor')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it.each([false, true])(
    'discards an older audit request after account transition, same identity=%s',
    async (sameIdentity) => {
      seedFamily('patriarch', true);
      let resolveOlder!: (page: AuditFixturePage) => void;
      const older = new Promise<AuditFixturePage>((resolve) => {
        resolveOlder = resolve;
      });
      let reads = 0;
      mockFamilyAudit(() => (reads++ === 0 ? older : auditPage('Current audit actor')));
      render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
      await openAdminTab('Audit');
      await waitFor(() => expect(fixture.rpc).toHaveBeenCalledWith(familyAuditRpc, readFamilyAuditArgs));

      act(() => {
        if (sameIdentity) {
          familyAuthStore.setState({ isAuthenticated: false });
          familyAuthStore.setState({ isAuthenticated: true });
        } else {
          familyAuthStore.setState({ authUserId: familyAuditOtherActorId, personId: familyAuditActorId });
        }
      });
      await act(async () => {
        resolveOlder(auditPage('Previous account audit actor', true));
      });
      expect(screen.queryByText('Previous account audit actor')).not.toBeInTheDocument();
      expect(await screen.findByText('Current audit actor')).toBeInTheDocument();
      expect(reads).toBe(2);
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    }
  );

  it('does not expose the copied instance audit when the Family wrapper is mounted on Nest', async () => {
    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    await screen.findByText('Users', { selector: 'nav button span' });
    const copiedTab = screen.queryByRole('button', { name: 'Audit' });
    if (copiedTab) {
      fireEvent.click(copiedTab);
      expect(await screen.findByText(instanceEntry.username)).toBeInTheDocument();
    }
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(copiedTab).not.toBeInTheDocument();
    expect(instanceAuditReads).toEqual([]);
    expect(fixture.rpc).not.toHaveBeenCalled();
  });
});

describe('Website Admin update and Demo Baseline routing', () => {
  beforeEach(() => {
    updateRoutes = true;
  });

  it.each([false, true])('shows update instructions and saves a synthetic demo baseline on phone=%s', async (phone) => {
    fixture.phone = phone;
    updateAppConfig = { demo_mode: true };
    render(<App />, { initialEntries: ['/admin'] });

    expect(await screen.findByText('Update available')).toBeInTheDocument();
    expect(screen.getByText(/v0\.49\.0.*v0\.48\.0/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Save Baseline' }));
    expect(await screen.findByText('Baseline saved! Resets will restore to this state.')).toBeInTheDocument();
    expect(nativeWrites).toEqual([{ url: demoBaselinePath, data: undefined }]);

    fireEvent.click(screen.getByRole('button', { name: phone ? 'Update' : 'How to Update' }));
    expect(await screen.findByText(/docker pull/i)).toBeInTheDocument();
    expect(nativeReads.filter((path) => path === versionCheckPath)).toHaveLength(1);
    expect(fixture.copiedReads).not.toHaveBeenCalled();
    expect(copiedBaselineSaves).toBe(0);
  });

  it.each([false, true])(
    'skips the Admin update check on an already-known managed install on phone=%s',
    async (phone) => {
      fixture.phone = phone;
      updateAppConfig = { managed: true };
      useAuthStore.setState({ managed: true });
      render(<App />, { initialEntries: ['/admin'] });
      if (phone) await screen.findByRole('button', { name: 'Administration' });
      expect(await screen.findByText('Permission Settings')).toBeInTheDocument();
      expect(screen.queryByText('Update available')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save Baseline' })).not.toBeInTheDocument();
      expect(nativeReads).not.toContain(versionCheckPath);
      expect(nativeWrites).toEqual([]);
    }
  );

  it.each([false, true])(
    'keeps host update and demo actions off the installed Family route on phone=%s',
    async (phone) => {
      fixture.phone = phone;
      seedFamily('patriarch', true);
      familyAuthStore.setState({ demoMode: true });
      updateAppConfig = { demo_mode: true };
      render(<App />, { initialEntries: ['/admin'] });
      expect(await screen.findByRole('heading', { name: 'Family permissions' })).toBeInTheDocument();
      expect(screen.queryByText('Update available')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save Baseline' })).not.toBeInTheDocument();
      expect(nativeReads).not.toContain(versionCheckPath);
      expect(nativeWrites).toEqual([]);
      expect(fixture.copiedReads).not.toHaveBeenCalled();
      expect(copiedBaselineSaves).toBe(0);
    }
  );

  it('keeps copied update and baseline operations off the direct Family wrapper on Nest', async () => {
    familyAuthStore.setState({ demoMode: true });
    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    await screen.findByText('Users', { selector: 'nav button span' });
    const copiedSave = screen.queryByRole('button', { name: 'Save Baseline' });
    if (copiedSave) {
      expect(await screen.findByText('Update available')).toBeInTheDocument();
      fireEvent.click(copiedSave);
      await waitFor(() => expect(copiedBaselineSaves).toBe(1));
    }
    expect({ reads: fixture.copiedReads.mock.calls, baselineSaves: copiedBaselineSaves }).toEqual({
      reads: [],
      baselineSaves: 0,
    });
    expect(copiedSave).not.toBeInTheDocument();
    expect(screen.queryByText('Update available')).not.toBeInTheDocument();
    expect(nativeReads).not.toContain(versionCheckPath);
    expect(nativeWrites).toEqual([]);
  });
});

describe('Website Admin JWT rotation routing', () => {
  const logout = vi.fn();

  beforeEach(() => {
    jwtRoutes = true;
    logout.mockReset();
    useAuthStore.setState({ logout });
  });

  it.each([false, true])('cancels and confirms synthetic standalone rotation on phone=%s', async (phone) => {
    fixture.phone = phone;
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Settings', phone);
    const findDialog = () => screen.findByRole('dialog', { name: jwtSettingsTitle });
    const openRotation = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Rotate' }));
      return findDialog();
    };

    const first = await openRotation();
    expect(within(first).getByText(/invalidate all sessions/i)).toBeInTheDocument();
    fireEvent.click(within(first).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: jwtSettingsTitle })).not.toBeInTheDocument());
    expect(nativeWrites).toEqual([]);
    expect(logout).not.toHaveBeenCalled();

    const confirmation = await openRotation();
    fireEvent.click(within(confirmation).getByRole('button', { name: jwtConfirmLabel }));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(nativeWrites).toEqual([{ url: jwtRotatePath, data: undefined }]);
    expect(copiedJwtPosts).toBe(0);
  });

  it.each([false, true])('hides rotation on a known-managed install on phone=%s', async (phone) => {
    fixture.phone = phone;
    updateAppConfig = { managed: true };
    useAuthStore.setState({ managed: true });
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Settings', phone);
    expect(screen.queryByText('Danger Zone')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rotate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: jwtSettingsTitle })).not.toBeInTheDocument();
    expect(nativeWrites).toEqual([]);
    expect(copiedJwtPosts).toBe(0);
  });

  it.each([false, true])('rejects an open confirmation when managed mode arrives on phone=%s', async (phone) => {
    fixture.phone = phone;
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Settings', phone);
    fireEvent.click(await screen.findByRole('button', { name: 'Rotate' }));
    const dialog = await screen.findByRole('dialog', { name: jwtSettingsTitle });
    const confirm = within(dialog).getByRole('button', { name: jwtConfirmLabel });

    await act(async () => {
      useAuthStore.setState({ managed: true });
      fireEvent.click(confirm);
    });

    expect(nativeWrites).toEqual([]);
    expect(logout).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: jwtSettingsTitle })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Rotate' })).not.toBeInTheDocument();
  });

  it.each([false, true])('closes an open rotation dialog when managed mode arrives on phone=%s', async (phone) => {
    fixture.phone = phone;
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Settings', phone);
    fireEvent.click(await screen.findByRole('button', { name: 'Rotate' }));
    expect(await screen.findByRole('dialog', { name: jwtSettingsTitle })).toBeInTheDocument();

    act(() => {
      useAuthStore.setState({ managed: true });
    });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: jwtSettingsTitle })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Rotate' })).not.toBeInTheDocument();
    expect(nativeWrites).toEqual([]);
    expect(logout).not.toHaveBeenCalled();
  });

  it.each([false, true])('keeps instance rotation off Family identity settings on phone=%s', async (phone) => {
    fixture.phone = phone;
    seedFamily('patriarch', true);
    render(<App />, { initialEntries: ['/admin'] });
    await openAdminTab('Settings');
    expect(await screen.findByRole('heading', { name: 'Identity and file policy' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rotate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: jwtSettingsTitle })).not.toBeInTheDocument();
    expect(nativeWrites).toEqual([]);
    expect(copiedJwtPosts).toBe(0);
    expect(logout).not.toHaveBeenCalled();
  });

  it('keeps instance rotation off the direct Family wrapper on Nest', async () => {
    render(<FamilyAdminPage />, { initialEntries: ['/admin'] });
    await openAdminTab('Settings');
    expect(screen.queryByRole('button', { name: 'Rotate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: jwtSettingsTitle })).not.toBeInTheDocument();
    expect(nativeWrites).toEqual([]);
    expect(copiedJwtPosts).toBe(0);
  });
});
