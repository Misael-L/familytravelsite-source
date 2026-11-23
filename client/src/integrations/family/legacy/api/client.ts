import {
  channelTestResultSchema,
  inAppListResultSchema,
  mapsAutocompleteResultSchema,
  mapsPlaceDetailsResultSchema,
  mapsPlacePhotoResultSchema,
  mapsResolveUrlResultSchema,
  mapsReverseResultSchema,
  mapsSearchResultSchema,
  unreadCountResultSchema,
  weatherResultSchema,
  type ChangePasswordRequest,
  type CollabMessageCreateRequest,
  type CollabNoteCreateRequest,
  type CollabNoteUpdateRequest,
  type CollabPollCreateRequest,
  type CollabPollVoteRequest,
  type CollabReactionRequest,
  type CreateCategoryRequest,
  type CreateTagRequest,
  type ForgotPasswordRequest,
  type InAppListResult,
  type JourneyAddTripRequest,
  type JourneyCreateRequest,
  type JourneyProviderPhotosRequest,
  type JourneyReorderEntriesRequest,
  type JourneyShareLinkRequest,
  type LoginRequest,
  type McpTokenCreateRequest,
  type MfaEnableRequest,
  type MfaVerifyLoginRequest,
  type NotificationRespondRequest,
  type RegisterRequest,
  type ResetPasswordRequest,
  type SettingUpsertRequest,
  type SettingsBulkRequest,
  type UnreadCountResult,
  type UpdateCategoryRequest,
  type UpdateTagRequest,
  type WeatherResult,
} from '@family/shared-compat';
import { apiClient, checkInDev, parseInDev, postMultipart, type UploadOptions } from './transport';

export {
  accommodationsApi,
  assignmentsApi,
  budgetApi,
  dayNotesApi,
  daysApi,
  filesApi,
  packingApi,
  placesApi,
  reservationsApi,
  todoApi,
  tripsApi,
} from './planner';

export { apiClient, isAuthPublicPath, parseInDev, postMultipart } from './transport';
export type { UploadOptions } from './transport';

export const authApi = {
  register: (data: RegisterRequest) => apiClient.post('/auth/register', data).then((r) => r.data),
  validateInvite: (token: string) => apiClient.get(`/auth/invite/${token}`).then((r) => r.data),
  login: (data: LoginRequest) => apiClient.post('/auth/login', data).then((r) => r.data),
  verifyMfaLogin: (data: MfaVerifyLoginRequest) => apiClient.post('/auth/mfa/verify-login', data).then((r) => r.data),
  mfaSetup: () => apiClient.post('/auth/mfa/setup', {}).then((r) => r.data),
  mfaEnable: (data: MfaEnableRequest) =>
    apiClient
      .post('/auth/mfa/enable', data)
      .then((r) => r.data as { success: boolean; mfa_enabled: boolean; backup_codes?: string[] }),
  mfaDisable: (data: { password: string; code: string }) =>
    apiClient.post('/auth/mfa/disable', data).then((r) => r.data),
  me: () => apiClient.get('/auth/me').then((r) => r.data),
  updateMapsKey: (key: string | null) => apiClient.put('/auth/me/maps-key', { maps_api_key: key }).then((r) => r.data),
  updateApiKeys: (data: Record<string, string | null>) => apiClient.put('/auth/me/api-keys', data).then((r) => r.data),
  updateSettings: (data: Record<string, unknown>) => apiClient.put('/auth/me/settings', data).then((r) => r.data),
  getSettings: () => apiClient.get('/auth/me/settings').then((r) => r.data),
  listUsers: () => apiClient.get('/auth/users').then((r) => r.data),
  uploadAvatar: (formData: FormData) => postMultipart('/auth/avatar', formData),
  deleteAvatar: () => apiClient.delete('/auth/avatar').then((r) => r.data),
  getAppConfig: () => apiClient.get('/auth/app-config').then((r) => r.data),
  updateAppSettings: (data: Record<string, unknown>) => apiClient.put('/auth/app-settings', data).then((r) => r.data),
  validateKeys: () => apiClient.get('/auth/validate-keys').then((r) => r.data),
  travelStats: () => apiClient.get('/auth/travel-stats').then((r) => r.data),
  changePassword: (data: ChangePasswordRequest) => apiClient.put('/auth/me/password', data).then((r) => r.data),
  forgotPassword: (data: ForgotPasswordRequest) =>
    apiClient.post('/auth/forgot-password', data).then((r) => r.data as { ok: true }),
  resetPassword: (data: ResetPasswordRequest) =>
    apiClient.post('/auth/reset-password', data).then((r) => r.data as { success?: true; mfa_required?: true }),
  deleteOwnAccount: () => apiClient.delete('/auth/me').then((r) => r.data),
  demoLogin: () => apiClient.post('/auth/demo-login').then((r) => r.data),
  mcpTokens: {
    list: () => apiClient.get('/auth/mcp-tokens').then((r) => r.data),
    create: (name: string) =>
      apiClient.post('/auth/mcp-tokens', { name } satisfies McpTokenCreateRequest).then((r) => r.data),
    delete: (id: number) => apiClient.delete(`/auth/mcp-tokens/${id}`).then((r) => r.data),
  },
  passkey: {
    registerOptions: (password: string) =>
      apiClient.post('/auth/passkey/register/options', { password }).then((r) => r.data),
    registerVerify: (attestationResponse: unknown, name?: string) =>
      apiClient.post('/auth/passkey/register/verify', { attestationResponse, name }).then((r) => r.data),
    loginOptions: () => apiClient.post('/auth/passkey/login/options', {}).then((r) => r.data),
    loginVerify: (assertionResponse: unknown) =>
      apiClient
        .post('/auth/passkey/login/verify', { assertionResponse })
        .then((r) => r.data as { token: string; user: Record<string, unknown> }),
    list: () => apiClient.get('/auth/passkey/credentials').then((r) => r.data as { credentials: PasskeyCredential[] }),
    rename: (id: number, name: string) =>
      apiClient.patch(`/auth/passkey/credentials/${id}`, { name }).then((r) => r.data),
    delete: (id: number, password: string) =>
      apiClient.delete(`/auth/passkey/credentials/${id}`, { data: { password } }).then((r) => r.data),
  },
};

export interface PasskeyCredential {
  id: number;
  name: string | null;
  device_type: string | null;
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
}

export const oauthApi = {
  /** Validate OAuth authorize params — called by consent page on load */
  validate: (params: {
    response_type: string;
    client_id: string;
    redirect_uri: string;
    scope: string;
    state?: string;
    code_challenge: string;
    code_challenge_method: string;
    resource?: string;
  }) => apiClient.get('/oauth/authorize/validate', { params }).then((r) => r.data),

  /** Submit user consent (approve or deny) */
  authorize: (body: {
    client_id: string;
    redirect_uri: string;
    scope: string;
    state?: string;
    code_challenge: string;
    code_challenge_method: string;
    approved: boolean;
    resource?: string;
  }) => apiClient.post('/oauth/authorize', body).then((r) => r.data),

  clients: {
    list: () => apiClient.get('/oauth/clients').then((r) => r.data),
    create: (data: {
      name: string;
      redirect_uris?: string[];
      allowed_scopes: string[];
      allows_client_credentials?: boolean;
    }) => apiClient.post('/oauth/clients', data).then((r) => r.data),
    rotate: (id: string) => apiClient.post(`/oauth/clients/${id}/rotate`).then((r) => r.data),
    delete: (id: string) => apiClient.delete(`/oauth/clients/${id}`).then((r) => r.data),
  },

  sessions: {
    list: () => apiClient.get('/oauth/sessions').then((r) => r.data),
    revoke: (id: number) => apiClient.delete(`/oauth/sessions/${id}`).then((r) => r.data),
  },
};

export const tagsApi = {
  list: () => apiClient.get('/tags').then((r) => r.data),
  create: (data: CreateTagRequest) => apiClient.post('/tags', data).then((r) => r.data),
  update: (id: number, data: UpdateTagRequest) => apiClient.put(`/tags/${id}`, data).then((r) => r.data),
  delete: (id: number) => apiClient.delete(`/tags/${id}`).then((r) => r.data),
};

export const categoriesApi = {
  list: () => apiClient.get('/categories').then((r) => r.data),
  create: (data: CreateCategoryRequest) => apiClient.post('/categories', data).then((r) => r.data),
  update: (id: number, data: UpdateCategoryRequest) => apiClient.put(`/categories/${id}`, data).then((r) => r.data),
  delete: (id: number) => apiClient.delete(`/categories/${id}`).then((r) => r.data),
};

export const adminApi = {
  users: () => apiClient.get('/admin/users').then((r) => r.data),
  createUser: (data: Record<string, unknown>) => apiClient.post('/admin/users', data).then((r) => r.data),
  updateUser: (id: number, data: Record<string, unknown>) =>
    apiClient.put(`/admin/users/${id}`, data).then((r) => r.data),
  deleteUser: (id: number) => apiClient.delete(`/admin/users/${id}`).then((r) => r.data),
  resetUserPasskeys: (id: number) => apiClient.delete(`/admin/users/${id}/passkeys`).then((r) => r.data),
  stats: () => apiClient.get('/admin/stats').then((r) => r.data),
  saveDemoBaseline: () => apiClient.post('/admin/save-demo-baseline').then((r) => r.data),
  getOidc: () => apiClient.get('/admin/oidc').then((r) => r.data),
  updateOidc: (data: Record<string, unknown>) => apiClient.put('/admin/oidc', data).then((r) => r.data),
  addons: () => apiClient.get('/admin/addons').then((r) => r.data),
  updateAddon: (id: number | string, data: Record<string, unknown>) =>
    apiClient.put(`/admin/addons/${id}`, data).then((r) => r.data),
  plugins: () => apiClient.get('/admin/plugins').then((r) => r.data),
  pluginBrowse: (refresh?: boolean) =>
    apiClient.get('/admin/plugins/registry', { params: refresh ? { refresh: 1 } : undefined }).then((r) => r.data),
  pluginDetail: (id: string) => apiClient.get(`/admin/plugins/registry/${encodeURIComponent(id)}`).then((r) => r.data),
  pluginInstall: (id: string, opts?: { version?: string; constraint?: string; withDependencies?: boolean }) =>
    apiClient.post('/admin/plugins/install', { id, ...opts }).then((r) => r.data),
  pluginActivate: (id: string, consent?: boolean) =>
    apiClient.post(`/admin/plugins/${id}/activate`, consent ? { consent: true } : {}).then((r) => r.data),
  pluginDeactivate: (id: string) => apiClient.post(`/admin/plugins/${id}/deactivate`).then((r) => r.data),
  pluginUpdate: (id: string) => apiClient.post(`/admin/plugins/${id}/update`).then((r) => r.data),
  // Re-trust a ROTATED author signing key and update, in ONE call. `publicKey` is the
  // full key the admin was shown (not a fingerprint): the server compares it exactly, so
  // it can refuse if the registry entry was re-keyed again since the dialog rendered.
  pluginRetrust: (id: string, version: string, publicKey: string) =>
    apiClient.post(`/admin/plugins/${id}/retrust`, { version, publicKey }).then((r) => r.data),
  pluginUninstall: (id: string, deleteData: boolean) =>
    apiClient.post(`/admin/plugins/${id}/uninstall`, { deleteData }).then((r) => r.data),
  pluginRescan: () => apiClient.post('/admin/plugins/rescan').then((r) => r.data),
  pluginUpload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return postMultipart('/admin/plugins/upload', fd);
  },
  // Dev-link (dev-only): register a plugin from a local built dir + hot-reload it.
  pluginLink: (path: string) => apiClient.post('/admin/plugins/link', { path }).then((r) => r.data),
  pluginReload: (id: string) => apiClient.post(`/admin/plugins/${id}/reload`).then((r) => r.data),
  // Operator-supplied egress hosts: a plugin talking to a SELF-HOSTED service can't name
  // the operator's hostname in its manifest, so the admin adds it here. Saving re-spawns
  // the plugin with the widened allow-list.
  pluginEgressHosts: (id: string): Promise<{ supported: boolean; hosts: string[] }> =>
    apiClient.get(`/admin/plugins/${id}/egress-hosts`).then((r) => r.data),
  pluginSetEgressHosts: (id: string, hosts: string[]): Promise<{ hosts: string[] }> =>
    apiClient.put(`/admin/plugins/${id}/egress-hosts`, { hosts }).then((r) => r.data),
  pluginErrors: (id: string) => apiClient.get(`/admin/plugins/${id}/errors`).then((r) => r.data),
  pluginAudit: (id: string) => apiClient.get(`/admin/plugins/${id}/audit`).then((r) => r.data),
  // Local LLM (Ollama) management for the AI-parsing addon.
  llmLocalModels: (baseUrl: string): Promise<{ models: { name: string; size: number }[] }> =>
    apiClient.get('/admin/llm/local/models', { params: { baseUrl } }).then((r) => r.data),
  /** Pull a model, streaming Ollama's NDJSON progress to `onProgress`. */
  llmLocalPull: async (
    baseUrl: string,
    model: string,
    onProgress: (p: { status?: string; total?: number; completed?: number; error?: string }) => void
  ): Promise<void> => {
    const res = await fetch('/api/admin/llm/local/pull', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl, model }),
    });
    if (!res.ok || !res.body) {
      let msg = `Pull failed (${res.status})`;
      try {
        msg = (await res.json())?.error ?? msg;
      } catch {
        /* non-json */
      }
      throw new Error(msg);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          onProgress(JSON.parse(line));
        } catch {
          /* skip partial */
        }
      }
    }
  },
  checkVersion: () => apiClient.get('/admin/version-check').then((r) => r.data),
  getBagTracking: () => apiClient.get('/admin/bag-tracking').then((r) => r.data),
  updateBagTracking: (enabled: boolean) => apiClient.put('/admin/bag-tracking', { enabled }).then((r) => r.data),
  getPlacesPhotos: () => apiClient.get('/admin/places-photos').then((r) => r.data),
  updatePlacesPhotos: (enabled: boolean) => apiClient.put('/admin/places-photos', { enabled }).then((r) => r.data),
  getPlacesAutocomplete: () => apiClient.get('/admin/places-autocomplete').then((r) => r.data),
  updatePlacesAutocomplete: (enabled: boolean) =>
    apiClient.put('/admin/places-autocomplete', { enabled }).then((r) => r.data),
  getPlacesDetails: () => apiClient.get('/admin/places-details').then((r) => r.data),
  updatePlacesDetails: (enabled: boolean) => apiClient.put('/admin/places-details', { enabled }).then((r) => r.data),
  getCollabFeatures: () => apiClient.get('/admin/collab-features').then((r) => r.data),
  updateCollabFeatures: (features: Record<string, boolean>) =>
    apiClient.put('/admin/collab-features', features).then((r) => r.data),
  packingTemplates: () => apiClient.get('/admin/packing-templates').then((r) => r.data),
  getPackingTemplate: (id: number) => apiClient.get(`/admin/packing-templates/${id}`).then((r) => r.data),
  createPackingTemplate: (data: { name: string }) =>
    apiClient.post('/admin/packing-templates', data).then((r) => r.data),
  updatePackingTemplate: (id: number, data: { name: string }) =>
    apiClient.put(`/admin/packing-templates/${id}`, data).then((r) => r.data),
  deletePackingTemplate: (id: number) => apiClient.delete(`/admin/packing-templates/${id}`).then((r) => r.data),
  addTemplateCategory: (templateId: number, data: { name: string }) =>
    apiClient.post(`/admin/packing-templates/${templateId}/categories`, data).then((r) => r.data),
  updateTemplateCategory: (templateId: number, catId: number, data: { name: string }) =>
    apiClient.put(`/admin/packing-templates/${templateId}/categories/${catId}`, data).then((r) => r.data),
  deleteTemplateCategory: (templateId: number, catId: number) =>
    apiClient.delete(`/admin/packing-templates/${templateId}/categories/${catId}`).then((r) => r.data),
  addTemplateItem: (templateId: number, catId: number, data: { name: string }) =>
    apiClient.post(`/admin/packing-templates/${templateId}/categories/${catId}/items`, data).then((r) => r.data),
  updateTemplateItem: (templateId: number, itemId: number, data: { name: string }) =>
    apiClient.put(`/admin/packing-templates/${templateId}/items/${itemId}`, data).then((r) => r.data),
  deleteTemplateItem: (templateId: number, itemId: number) =>
    apiClient.delete(`/admin/packing-templates/${templateId}/items/${itemId}`).then((r) => r.data),
  listInvites: () => apiClient.get('/admin/invites').then((r) => r.data),
  listInviteTrips: () => apiClient.get('/admin/invites/trips').then((r) => r.data),
  createInvite: (data: { max_uses: number; expires_in_days?: number; trip_id?: number | null }) =>
    apiClient.post('/admin/invites', data).then((r) => r.data),
  deleteInvite: (id: number) => apiClient.delete(`/admin/invites/${id}`).then((r) => r.data),
  auditLog: (params?: { limit?: number; offset?: number }) =>
    apiClient.get('/admin/audit-log', { params }).then((r) => r.data),
  mcpTokens: () => apiClient.get('/admin/mcp-tokens').then((r) => r.data),
  deleteMcpToken: (id: number) => apiClient.delete(`/admin/mcp-tokens/${id}`).then((r) => r.data),
  oauthSessions: () => apiClient.get('/admin/oauth-sessions').then((r) => r.data),
  revokeOAuthSession: (id: number) => apiClient.delete(`/admin/oauth-sessions/${id}`).then((r) => r.data),
  getPermissions: () => apiClient.get('/admin/permissions').then((r) => r.data),
  updatePermissions: (permissions: Record<string, string>) =>
    apiClient.put('/admin/permissions', { permissions }).then((r) => r.data),
  rotateJwtSecret: () => apiClient.post('/admin/rotate-jwt-secret').then((r) => r.data),
  sendTestNotification: (data: Record<string, unknown>) =>
    apiClient.post('/admin/dev/test-notification', data).then((r) => r.data),
  getNotificationPreferences: () => apiClient.get('/admin/notification-preferences').then((r) => r.data),
  updateNotificationPreferences: (prefs: Record<string, Record<string, boolean>>) =>
    apiClient.put('/admin/notification-preferences', prefs).then((r) => r.data),
  getDefaultUserSettings: () => apiClient.get('/admin/default-user-settings').then((r) => r.data),
  updateDefaultUserSettings: (settings: Record<string, unknown>) =>
    apiClient.put('/admin/default-user-settings', settings).then((r) => r.data),
};

export const addonsApi = {
  enabled: () => apiClient.get('/addons').then((r) => r.data),
};

/** A host-rendered column/action a plugin contributes into a native planner view
 * (reservations/places/day) via the tableContributor hook. Every field is bounded +
 * normalized server-side; a column url is guaranteed http/https/mailto. */
export type ViewContribution =
  | {
      kind: 'column';
      pluginId: string;
      entityId: number;
      id: string;
      label: string;
      value?: string;
      url?: string;
      icon?: string;
      tone: 'default' | 'success' | 'warn' | 'danger';
    }
  | {
      kind: 'action';
      pluginId: string;
      entityId: number;
      id: string;
      label: string;
      icon?: string;
      target: { kind: 'frame'; sub: string } | { kind: 'route'; method: 'GET' | 'POST'; sub: string };
    };

/** A badge a plugin adds to a dashboard trip card via the tripCardProvider hook.
 * Bounded + normalized server-side; the url is guaranteed http/https/mailto. */
export interface TripCardBadge {
  pluginId: string;
  tripId: number;
  id: string;
  label: string;
  value?: string;
  icon?: string;
  tone: 'default' | 'success' | 'warn' | 'danger';
  url?: string;
}

export interface PluginMapMarker {
  pluginId: string;
  id: string;
  lat: number;
  lng: number;
  label?: string;
  popupText?: string;
  url?: string;
  icon?: string;
  tone: 'default' | 'success' | 'warn' | 'danger';
}

/** A text-only section a pdfSectionProvider plugin appends to the trip PDF export.
 * Server-normalized: counts + lengths are capped, cells are plain strings. */
export interface PluginPdfSection {
  pluginId: string;
  title: string;
  paragraphs: string[];
  table?: { headers: string[]; rows: string[][] };
}

/** A country tint layer an atlasLayerProvider plugin draws over the Atlas map for
 * the signed-in user. Codes are ISO alpha-2 (server-validated), tone enum-whitelisted. */
export interface PluginAtlasLayer {
  pluginId: string;
  id: string;
  name?: string;
  countries: Array<{ code: string; tone: 'default' | 'success' | 'warn' | 'danger'; label?: string }>;
}

export interface PluginUserSettingField {
  key: string;
  label?: string | null;
  input_type?: string;
  placeholder?: string | null;
  hint?: string | null;
  required?: boolean;
  secret?: boolean;
  options?: Array<{ value: string; label: string }>;
}

/** A button a plugin contributes to its own settings page ("Test connection"). */
export interface PluginAction {
  key: string;
  label: string;
  hint?: string;
  danger: boolean;
}

export const pluginsApi = {
  // Active plugins the client renders (page nav entries, dashboard widgets).
  active: () => apiClient.get('/plugins').then((r) => r.data),
  // Extra place info contributed by placeDetailProvider plugins (#1429). Fail-safe:
  // the server skips any slow/failing provider, so this only ever adds rows.
  placeDetails: (placeId: number) =>
    apiClient.get(`/place-details/${placeId}`).then(
      (r) =>
        r.data as {
          providers: Array<{ pluginId: string; items: Array<{ label: string; value?: string; url?: string }> }>;
        }
    ),
  // Validation/warning contributions from warningProvider plugins (#1429). Fail-safe.
  tripWarnings: (tripId: number) =>
    apiClient.get(`/trip-warnings/${tripId}`).then(
      (r) =>
        r.data as {
          warnings: Array<{
            pluginId: string;
            level: 'info' | 'warning' | 'error';
            message: string;
            dayId?: number;
            placeId?: number;
          }>;
        }
    ),
  // Host-rendered columns/actions plugins add into a native planner view via the
  // tableContributor hook. Fetched once per view, keyed by entityId; fail-safe.
  viewContributions: (
    view: 'reservations' | 'transports' | 'places' | 'day' | 'costs' | 'packing' | 'files' | 'todos',
    tripId: number | string
  ) =>
    apiClient.get(`/view-contributions/${view}/${tripId}`).then((r) => r.data as { contributions: ViewContribution[] }),
  // Bounded markers plugins overlay on the trip map via the mapMarkerProvider hook
  // (#587). Host-normalized + range-checked; fail-safe (skips slow/failing providers).
  mapMarkers: (tripId: number | string) =>
    apiClient.get(`/map-markers/${tripId}`).then((r) => r.data as { markers: PluginMapMarker[] }),
  // Text-only sections plugins append to the trip PDF export via the
  // pdfSectionProvider hook. Host-normalized (counts + lengths capped); fail-safe.
  pdfSections: (tripId: number | string) =>
    apiClient.get(`/pdf-sections/${tripId}`).then((r) => r.data as { sections: PluginPdfSection[] }),
  // Country tint layers plugins draw over the Atlas map for the signed-in user via
  // the atlasLayerProvider hook. No tripId — user-scoped server-side; fail-safe.
  atlasLayers: () => apiClient.get('/atlas-layers').then((r) => r.data as { layers: PluginAtlasLayer[] }),
  // Extra rows plugins add under a journal entry via the journalEntryProvider hook.
  // Same shape + hardening as placeDetails (label/value/allowlisted url); fail-safe.
  journalEntryRows: (entryId: number) =>
    apiClient.get(`/journal-entry-rows/${entryId}`).then(
      (r) =>
        r.data as {
          providers: Array<{ pluginId: string; items: Array<{ label: string; value?: string; url?: string }> }>;
        }
    ),
  // Badges plugins add to the dashboard trip cards via the tripCardProvider hook.
  // One call for all visible cards; host access-checks each tripId + bounds every
  // field (label/value/tone/allowlisted url); fail-safe.
  tripCardContributions: (tripIds: Array<number | string>) =>
    apiClient
      .get(`/trip-card-contributions?tripIds=${tripIds.join(',')}`)
      .then((r) => r.data as { contributions: TripCardBadge[] }),
  // The signed-in user's OWN plugin activity log — every host-mediated action a
  // plugin took bound to them, across all plugins, newest first. The user-facing
  // half of the capability audit; what makes the broad read grants accountable.
  myActivity: (limit = 200) =>
    apiClient.get(`/plugin-activity?limit=${limit}`).then(
      (r) =>
        r.data as {
          activity: Array<{
            ts: string;
            plugin_id: string;
            plugin_name: string | null;
            method: string;
            resource: string | null;
            code: string;
          }>;
        }
    ),
  // A user's OWN scope:'user' settings for a plugin (API key, prefs). Secrets are
  // masked; the write only accepts declared user-scope keys.
  userSettings: (id: string) =>
    apiClient.get(`/plugin-settings/${id}`).then(
      (r) =>
        r.data as {
          fields: PluginUserSettingField[];
          config: Record<string, unknown>;
          actions: PluginAction[];
        }
    ),
  // Run a settings-page action the plugin declared ("Test connection"). It runs AS the
  // caller, so it reads the caller's own settings.
  runAction: (id: string, key: string) =>
    apiClient
      .post(`/plugin-settings/${id}/actions/${encodeURIComponent(key)}`)
      .then((r) => r.data as { ok: boolean; message?: string }),
  saveUserSettings: (id: string, config: Record<string, unknown>) =>
    apiClient.post(`/plugin-settings/${id}`, { config }).then((r) => r.data as { config: Record<string, unknown> }),
  // Host-brokered outbound OAuth (the host owns the tokens; the plugin only triggers).
  oauthStatus: (id: string) =>
    apiClient.get(`/plugin-oauth/${id}/status`).then((r) => r.data as { configured: boolean; connected: boolean }),
  oauthConnect: (id: string) =>
    apiClient.post(`/plugin-oauth/${id}/connect`).then((r) => r.data as { authorizeUrl: string }),
  oauthDisconnect: (id: string) =>
    apiClient.post(`/plugin-oauth/${id}/disconnect`).then((r) => r.data as { connected: boolean }),
  // Call one of a plugin's own declared routes through the host proxy. `sub` is
  // supplied by untrusted plugin code (the trekBridge forwards it verbatim), so it
  // MUST stay inside the plugin's own /plugins/:id/ namespace. We resolve it with
  // the URL parser — which normalizes `../`, encoded traversal and backslashes the
  // same way the browser would before sending — and reject anything that escapes
  // the prefix or points off-origin. Without this a plugin could send
  // sub='/../../auth/me' and drive arbitrary authenticated /api routes as the user.
  invoke: (id: string, sub: string, init?: { method?: string; body?: unknown }) => {
    const prefix = `/api/plugins/${id}/`;
    let resolved: URL;
    try {
      resolved = new URL(String(sub).replace(/^\/+/, ''), window.location.origin + prefix);
    } catch {
      return Promise.reject(new Error('invalid plugin route'));
    }
    if (resolved.origin !== window.location.origin || !resolved.pathname.startsWith(prefix)) {
      return Promise.reject(new Error('plugin route escapes its namespace'));
    }
    const url = resolved.pathname.slice('/api'.length) + resolved.search;
    return apiClient.request({ url, method: init?.method || 'GET', data: init?.body }).then((r) => r.data);
  },
};

export const airtrailApi = {
  getSettings: () => apiClient.get('/integrations/airtrail/settings').then((r) => r.data),
  saveSettings: (data: { url: string; apiKey?: string; allowInsecureTls?: boolean; writeEnabled?: boolean }) =>
    apiClient.put('/integrations/airtrail/settings', data).then((r) => r.data),
  status: () => apiClient.get('/integrations/airtrail/status').then((r) => r.data),
  test: (data: { url?: string; apiKey?: string; allowInsecureTls?: boolean }) =>
    apiClient.post('/integrations/airtrail/test', data).then((r) => r.data),
  sync: (): Promise<{ changed: number }> => apiClient.post('/integrations/airtrail/sync').then((r) => r.data),
  // flights + import are added with the trip-planner import (P2)
  flights: () => apiClient.get('/integrations/airtrail/flights').then((r) => r.data),
  import: (tripId: number, flightIds: string[], connections?: string[][]) =>
    apiClient
      .post(
        `/trips/${tripId}/reservations/import/airtrail`,
        connections?.length ? { flightIds, connections } : { flightIds }
      )
      .then((r) => r.data),
};

export const journeyApi = {
  list: () => apiClient.get('/journeys').then((r) => r.data),
  create: (data: JourneyCreateRequest) => apiClient.post('/journeys', data).then((r) => r.data),
  get: (id: number) => apiClient.get(`/journeys/${id}`).then((r) => r.data),
  update: (id: number, data: Record<string, unknown>) => apiClient.patch(`/journeys/${id}`, data).then((r) => r.data),
  delete: (id: number) => apiClient.delete(`/journeys/${id}`).then((r) => r.data),

  suggestions: () => apiClient.get('/journeys/suggestions').then((r) => r.data),
  availableTrips: () => apiClient.get('/journeys/available-trips').then((r) => r.data),

  // Trips (sync sources)
  addTrip: (id: number, tripId: number) =>
    apiClient.post(`/journeys/${id}/trips`, { trip_id: tripId } satisfies JourneyAddTripRequest).then((r) => r.data),
  removeTrip: (id: number, tripId: number) => apiClient.delete(`/journeys/${id}/trips/${tripId}`).then((r) => r.data),

  // Entries
  listEntries: (id: number) => apiClient.get(`/journeys/${id}/entries`).then((r) => r.data),
  createEntry: (id: number, data: Record<string, unknown>) =>
    apiClient.post(`/journeys/${id}/entries`, data).then((r) => r.data),
  updateEntry: (entryId: number, data: Record<string, unknown>) =>
    apiClient.patch(`/journeys/entries/${entryId}`, data).then((r) => r.data),
  deleteEntry: (entryId: number) => apiClient.delete(`/journeys/entries/${entryId}`).then((r) => r.data),
  reorderEntries: (journeyId: number, orderedIds: number[]) =>
    apiClient
      .put(`/journeys/${journeyId}/entries/reorder`, { orderedIds } satisfies JourneyReorderEntriesRequest)
      .then((r) => r.data),

  // Photos
  uploadPhotos: (entryId: number, formData: FormData, opts?: UploadOptions) =>
    postMultipart(`/journeys/entries/${entryId}/photos`, formData, opts),
  uploadGalleryPhotos: (journeyId: number, formData: FormData, opts?: UploadOptions) =>
    postMultipart(`/journeys/${journeyId}/gallery/photos`, formData, opts),
  uploadGalleryVideo: (journeyId: number, formData: FormData, opts?: UploadOptions) =>
    postMultipart(`/journeys/${journeyId}/gallery/video`, formData, opts),
  addProviderPhotosToGallery: (
    journeyId: number,
    provider: string,
    assetIds: string[],
    passphrase?: string,
    mediaTypes?: string[]
  ) =>
    apiClient
      .post(`/journeys/${journeyId}/gallery/provider-photos`, {
        provider,
        asset_ids: assetIds,
        ...(passphrase ? { passphrase } : {}),
        ...(mediaTypes ? { media_types: mediaTypes } : {}),
      } satisfies JourneyProviderPhotosRequest)
      .then((r) => r.data),
  addProviderPhoto: (entryId: number, provider: string, assetId: string, caption?: string, passphrase?: string) =>
    apiClient
      .post(`/journeys/entries/${entryId}/provider-photos`, {
        provider,
        asset_id: assetId,
        caption,
        ...(passphrase ? { passphrase } : {}),
      })
      .then((r) => r.data),
  addProviderPhotos: (
    entryId: number,
    provider: string,
    assetIds: string[],
    caption?: string,
    passphrase?: string,
    mediaTypes?: string[]
  ) =>
    apiClient
      .post(`/journeys/entries/${entryId}/provider-photos`, {
        provider,
        asset_ids: assetIds,
        caption,
        ...(passphrase ? { passphrase } : {}),
        ...(mediaTypes ? { media_types: mediaTypes } : {}),
      })
      .then((r) => r.data),
  linkPhoto: (entryId: number, journeyPhotoId: number) =>
    apiClient.post(`/journeys/entries/${entryId}/link-photo`, { journey_photo_id: journeyPhotoId }).then((r) => r.data),
  unlinkPhoto: (entryId: number, journeyPhotoId: number) =>
    apiClient.delete(`/journeys/entries/${entryId}/photos/${journeyPhotoId}`).then((r) => r.data),
  deleteGalleryPhoto: (journeyId: number, journeyPhotoId: number) =>
    apiClient.delete(`/journeys/${journeyId}/gallery/${journeyPhotoId}`).then((r) => r.data),
  updatePhoto: (photoId: number, data: Record<string, unknown>) =>
    apiClient.patch(`/journeys/photos/${photoId}`, data).then((r) => r.data),
  deletePhoto: (photoId: number) => apiClient.delete(`/journeys/photos/${photoId}`).then((r) => r.data),

  // Cover
  uploadCover: (id: number, formData: FormData) => postMultipart(`/journeys/${id}/cover`, formData),

  // Contributors
  addContributor: (id: number, userId: number, role: string) =>
    apiClient.post(`/journeys/${id}/contributors`, { user_id: userId, role }).then((r) => r.data),
  updateContributor: (id: number, userId: number, role: string) =>
    apiClient.patch(`/journeys/${id}/contributors/${userId}`, { role }).then((r) => r.data),
  removeContributor: (id: number, userId: number) =>
    apiClient.delete(`/journeys/${id}/contributors/${userId}`).then((r) => r.data),

  // Preferences
  updatePreferences: (id: number, data: { hide_skeletons?: boolean }) =>
    apiClient.patch(`/journeys/${id}/preferences`, data).then((r) => r.data),

  // Share
  getShareLink: (id: number) => apiClient.get(`/journeys/${id}/share-link`).then((r) => r.data),
  createShareLink: (id: number, perms: JourneyShareLinkRequest) =>
    apiClient.post(`/journeys/${id}/share-link`, perms).then((r) => r.data),
  deleteShareLink: (id: number) => apiClient.delete(`/journeys/${id}/share-link`).then((r) => r.data),
  getPublicJourney: (token: string) => apiClient.get(`/public/journey/${token}`).then((r) => r.data),
};

export const mapsApi = {
  search: (query: string, lang?: string) =>
    apiClient
      .post(`/maps/search?lang=${lang || 'en'}`, { query })
      .then((r) => checkInDev(mapsSearchResultSchema, r.data, 'maps.search')),
  autocomplete: (
    input: string,
    lang?: string,
    locationBias?: { low: { lat: number; lng: number }; high: { lat: number; lng: number } },
    signal?: AbortSignal
  ) =>
    apiClient
      .post('/maps/autocomplete', { input, lang, locationBias }, { signal })
      .then((r) => checkInDev(mapsAutocompleteResultSchema, r.data, 'maps.autocomplete')),
  details: (placeId: string, lang?: string) =>
    apiClient
      .get(`/maps/details/${encodeURIComponent(placeId)}`, { params: { lang } })
      .then((r) => checkInDev(mapsPlaceDetailsResultSchema, r.data, 'maps.details')),
  placePhoto: (placeId: string, lat?: number, lng?: number, name?: string) =>
    apiClient
      .get(`/maps/place-photo/${encodeURIComponent(placeId)}`, { params: { lat, lng, name } })
      .then((r) => checkInDev(mapsPlacePhotoResultSchema, r.data, 'maps.placePhoto')),
  reverse: (lat: number, lng: number, lang?: string) =>
    apiClient
      .get('/maps/reverse', { params: { lat, lng, lang } })
      .then((r) => checkInDev(mapsReverseResultSchema, r.data, 'maps.reverse')),
  resolveUrl: (url: string) =>
    apiClient
      .post('/maps/resolve-url', { url })
      .then((r) => checkInDev(mapsResolveUrlResultSchema, r.data, 'maps.resolveUrl')),
  // OSM-only POI explore: places of a category within the current map viewport bbox.
  // Overpass can be slow on a fresh (uncached) area, so this call gets a longer
  // timeout than the global default instead of aborting at 8s and showing nothing.
  pois: (category: string, bbox: { south: number; west: number; north: number; east: number }, signal?: AbortSignal) =>
    apiClient.get('/maps/pois', { params: { category, ...bbox }, signal, timeout: 20000 }).then(
      (r) =>
        r.data as {
          pois: import('../components/Map/poiCategories').Poi[];
          source: string;
          truncated: boolean;
          clamped?: boolean;
        }
    ),
};

export const airportsApi = {
  search: (q: string, signal?: AbortSignal) =>
    apiClient.get('/airports/search', { params: { q }, signal }).then((r) => r.data),
  byIata: (iata: string) => apiClient.get(`/airports/${encodeURIComponent(iata)}`).then((r) => r.data),
};

export const healthApi = {
  features: (): Promise<{ bookingImport: boolean; aiParsing: boolean }> =>
    apiClient.get('/health/features').then((r) => r.data),
};

export const weatherApi = {
  get: (lat: number, lng: number, date: string): Promise<WeatherResult> =>
    apiClient
      .get('/weather', { params: { lat, lng, date } })
      .then((r) => parseInDev(weatherResultSchema, r.data, 'weather.get')),
  getDetailed: (lat: number, lng: number, date: string, lang?: string): Promise<WeatherResult> =>
    apiClient
      .get('/weather/detailed', { params: { lat, lng, date, lang } })
      .then((r) => parseInDev(weatherResultSchema, r.data, 'weather.getDetailed')),
};

export const configApi = {
  getPublicConfig: (): Promise<{ defaultLanguage: string }> => apiClient.get('/config').then((r) => r.data),
};

export interface HelpNavItem {
  title: string;
  slug: string;
}
export interface HelpNavSection {
  title: string;
  pages: HelpNavItem[];
}
export interface HelpPageData {
  slug: string;
  title: string;
  markdown: string;
}

export const helpApi = {
  index: (): Promise<{ sections: HelpNavSection[] }> => apiClient.get('/help/index').then((r) => r.data),
  page: (slug: string): Promise<HelpPageData> =>
    apiClient.get(`/help/page/${encodeURIComponent(slug)}`).then((r) => r.data),
};

export const settingsApi = {
  get: () => apiClient.get('/settings').then((r) => r.data),
  set: (key: string, value: unknown) => {
    const body: SettingUpsertRequest = { key, value };
    return apiClient.put('/settings', body).then((r) => r.data);
  },
  setBulk: (settings: Record<string, unknown>) => {
    const body: SettingsBulkRequest = { settings };
    return apiClient.post('/settings/bulk', body).then((r) => r.data);
  },
};

export const collabApi = {
  getNotes: (tripId: number | string) => apiClient.get(`/trips/${tripId}/collab/notes`).then((r) => r.data),
  createNote: (tripId: number | string, data: CollabNoteCreateRequest) =>
    apiClient.post(`/trips/${tripId}/collab/notes`, data).then((r) => r.data),
  updateNote: (tripId: number | string, id: number, data: CollabNoteUpdateRequest) =>
    apiClient.put(`/trips/${tripId}/collab/notes/${id}`, data).then((r) => r.data),
  deleteNote: (tripId: number | string, id: number) =>
    apiClient.delete(`/trips/${tripId}/collab/notes/${id}`).then((r) => r.data),
  uploadNoteFile: (tripId: number | string, noteId: number, formData: FormData) =>
    postMultipart(`/trips/${tripId}/collab/notes/${noteId}/files`, formData),
  deleteNoteFile: (tripId: number | string, noteId: number, fileId: number) =>
    apiClient.delete(`/trips/${tripId}/collab/notes/${noteId}/files/${fileId}`).then((r) => r.data),
  getPolls: (tripId: number | string) => apiClient.get(`/trips/${tripId}/collab/polls`).then((r) => r.data),
  createPoll: (tripId: number | string, data: CollabPollCreateRequest) =>
    apiClient.post(`/trips/${tripId}/collab/polls`, data).then((r) => r.data),
  votePoll: (tripId: number | string, id: number, optionIndex: number) =>
    apiClient
      .post(`/trips/${tripId}/collab/polls/${id}/vote`, { option_index: optionIndex } satisfies CollabPollVoteRequest)
      .then((r) => r.data),
  closePoll: (tripId: number | string, id: number) =>
    apiClient.put(`/trips/${tripId}/collab/polls/${id}/close`).then((r) => r.data),
  deletePoll: (tripId: number | string, id: number) =>
    apiClient.delete(`/trips/${tripId}/collab/polls/${id}`).then((r) => r.data),
  getMessages: (tripId: number | string, before?: string) =>
    apiClient.get(`/trips/${tripId}/collab/messages${before ? `?before=${before}` : ''}`).then((r) => r.data),
  sendMessage: (tripId: number | string, data: CollabMessageCreateRequest) =>
    apiClient.post(`/trips/${tripId}/collab/messages`, data).then((r) => r.data),
  deleteMessage: (tripId: number | string, id: number) =>
    apiClient.delete(`/trips/${tripId}/collab/messages/${id}`).then((r) => r.data),
  reactMessage: (tripId: number | string, id: number, emoji: string) =>
    apiClient
      .post(`/trips/${tripId}/collab/messages/${id}/react`, { emoji } satisfies CollabReactionRequest)
      .then((r) => r.data),
  linkPreview: (tripId: number | string, url: string) =>
    apiClient.get(`/trips/${tripId}/collab/link-preview?url=${encodeURIComponent(url)}`).then((r) => r.data),
};

export const backupApi = {
  list: () => apiClient.get('/backup/list').then((r) => r.data),
  create: () => apiClient.post('/backup/create').then((r) => r.data),
  download: async (filename: string): Promise<void> => {
    const res = await fetch(`/api/backup/download/${filename}`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
  delete: (filename: string) => apiClient.delete(`/backup/${filename}`).then((r) => r.data),
  restore: (filename: string) => apiClient.post(`/backup/restore/${filename}`).then((r) => r.data),
  uploadRestore: (file: File) => {
    const form = new FormData();
    form.append('backup', file);
    return postMultipart('/backup/upload-restore', form);
  },
  getAutoSettings: () => apiClient.get('/backup/auto-settings').then((r) => r.data),
  setAutoSettings: (settings: Record<string, unknown>) =>
    apiClient.put('/backup/auto-settings', settings).then((r) => r.data),
};

export const shareApi = {
  getLink: (tripId: number | string) => apiClient.get(`/trips/${tripId}/share-link`).then((r) => r.data),
  createLink: (tripId: number | string, perms?: Record<string, boolean>) =>
    apiClient.post(`/trips/${tripId}/share-link`, perms || {}).then((r) => r.data),
  deleteLink: (tripId: number | string) => apiClient.delete(`/trips/${tripId}/share-link`).then((r) => r.data),
  getSharedTrip: (token: string) => apiClient.get(`/shared/${token}`).then((r) => r.data),
};

// Public transit routing (#1065) — Transitous/MOTIS proxied through the server.
export const transitApi = {
  geocode: (q: string, opts?: { lang?: string; near?: string }) =>
    apiClient.get('/transit/geocode', { params: { q, lang: opts?.lang, near: opts?.near } }).then((r) => r.data),
  plan: (params: {
    from: string;
    to: string;
    time?: string;
    arriveBy?: boolean;
    modes?: string;
    maxTransfers?: number;
  }) => apiClient.get('/transit/plan', { params }).then((r) => r.data),
};

// Trip invite links (#1143) — join a trip as an existing, logged-in user.
export const tripInviteApi = {
  getLink: (tripId: number | string) => apiClient.get(`/trips/${tripId}/invite-link`).then((r) => r.data),
  createLink: (tripId: number | string, expires_in_days?: number | null) =>
    apiClient.post(`/trips/${tripId}/invite-link`, { expires_in_days: expires_in_days ?? null }).then((r) => r.data),
  deleteLink: (tripId: number | string) => apiClient.delete(`/trips/${tripId}/invite-link`).then((r) => r.data),
  preview: (token: string) => apiClient.get(`/trip-invites/${token}`).then((r) => r.data),
  accept: (token: string) => apiClient.post(`/trip-invites/${token}/accept`).then((r) => r.data),
};

export const notificationsApi = {
  getPreferences: () => apiClient.get('/notifications/preferences').then((r) => r.data),
  updatePreferences: (prefs: Record<string, Record<string, boolean>>) =>
    apiClient.put('/notifications/preferences', prefs).then((r) => r.data),
  testSmtp: (email?: string) =>
    apiClient
      .post('/notifications/test-smtp', { email })
      .then((r) => checkInDev(channelTestResultSchema, r.data, 'notifications.testSmtp')),
  testWebhook: (url?: string) =>
    apiClient
      .post('/notifications/test-webhook', { url })
      .then((r) => checkInDev(channelTestResultSchema, r.data, 'notifications.testWebhook')),
  testNtfy: (payload: { topic?: string; server?: string | null; token?: string | null }) =>
    apiClient
      .post('/notifications/test-ntfy', payload)
      .then((r) => checkInDev(channelTestResultSchema, r.data, 'notifications.testNtfy')),
  // Generic channel test — this is how a PLUGIN channel's "Send test" button works.
  testChannel: (channelId: string) =>
    apiClient
      .post(`/notifications/test/${encodeURIComponent(channelId)}`)
      .then((r) => checkInDev(channelTestResultSchema, r.data, 'notifications.testChannel')),
};

export const inAppNotificationsApi = {
  list: (params?: { limit?: number; offset?: number; unread_only?: boolean }): Promise<InAppListResult> =>
    apiClient
      .get('/notifications/in-app', { params })
      .then((r) => parseInDev(inAppListResultSchema, r.data, 'notifications.list')),
  unreadCount: (): Promise<UnreadCountResult> =>
    apiClient
      .get('/notifications/in-app/unread-count')
      .then((r) => parseInDev(unreadCountResultSchema, r.data, 'notifications.unreadCount')),
  markRead: (id: number) => apiClient.put(`/notifications/in-app/${id}/read`).then((r) => r.data),
  markUnread: (id: number) => apiClient.put(`/notifications/in-app/${id}/unread`).then((r) => r.data),
  markAllRead: () => apiClient.put('/notifications/in-app/read-all').then((r) => r.data),
  delete: (id: number) => apiClient.delete(`/notifications/in-app/${id}`).then((r) => r.data),
  deleteAll: () => apiClient.delete('/notifications/in-app/all').then((r) => r.data),
  respond: (id: number, response: NotificationRespondRequest['response']) =>
    apiClient.post(`/notifications/in-app/${id}/respond`, { response }).then((r) => r.data),
};

export default apiClient;
