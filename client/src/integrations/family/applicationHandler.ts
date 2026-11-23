// organize-imports-ignore
// sort-imports-ignore
// Preserve the existing Family Auth/settings import-cycle evaluation order.
import { fetchFamilyAtlasStats as fetchFamilyAtlasStatsBackend } from './atlasStats';
import countryGeoUrl from '../../../../server/assets/atlas/admin0.geojson.gz?url';
import { captureFamilyActor } from './actorContext';
import { handleFamilyCatalogMap } from './catalogMapHandler';
import { onFamilyActorChange } from './actorEvents';
import { familyImportStatus, startFamilyImport } from './bookingImportJobs';
import { handleFamilyBudget } from './budgetHandler';
import { handleFamilyCollection } from './collectionHandler';
import { expenseDraft, expenseRates } from './expenseDraft';
import { handleFamilyFile } from './fileHandler';
import { readObservedFile } from './filePreview';
import { FamilyIdentityRegistry, type IdentityKind } from './identity';
import { handleFamilyJourney } from './journeyHandler';
import { projectFamilyDayTimeline, schedulePairMove } from './legacy/components/Planner/family/familyDayTimeline';
import * as authBackend from './legacy/data/supabase/auth';
import * as notesBackend from './legacy/data/supabase/dayNotes';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import {
  updateFamilyDisplayName as updateFamilyDisplayNameBackend,
  updateFamilyEmail as updateFamilyEmailBackend,
} from './legacy/data/supabase/familySettings';
import {
  clearPersonAvatar as clearPersonAvatarBackend,
  uploadPersonAvatar as uploadPersonAvatarBackend,
} from './legacy/data/supabase/personAvatars';
import * as scheduleBackend from './legacy/data/supabase/scheduleItems';
import { fetchFamilyTravelStats as fetchFamilyTravelStatsBackend } from './legacy/data/supabase/travelStats';
import * as changesBackend from './legacy/data/supabase/tripChangeRequests';
import * as expensesBackend from './legacy/data/supabase/tripExpenses';
import * as placesBackend from './legacy/data/supabase/tripPlaces';
import { duplicateTrip as duplicateTripBackend } from './legacy/data/supabase/tripProposals';
import * as reservationsBackend from './legacy/data/supabase/tripReservations';
import * as familyTripsBackend from './legacy/data/supabase/trips';
import { searchUnsplash as searchUnsplashBackend } from './legacy/data/supabase/unsplash';
import { useFamilyFeatureStore } from './legacy/store/familyFeatureStore';
import { useFamilyMapStore } from './legacy/store/familyMapStore';
import type { Settings } from './legacy/types';
import { handleFamilyList, NOT_HANDLED } from './listHandler';
import { acceptNativeSourceOwner } from './nativeSourceOwnership';
import { handleFamilyNotifications } from './notificationHandler';
import { handleFamilyPlanApi } from './planApiHandler';
import { readFamilyApplicationSettings } from './applicationSettings';
import { assertFamilyMapSettingsPatch, isNativeFamilyPublicMap, nativeFamilyMapSettings } from './familyMapProjection';
import {
  FamilyApiError,
  familyAuthStore,
  familyFrontend,
  familySettingsStore,
  type FamilyFrontendRepository,
} from './repository';
import { scopedFamilyRequest, scopeFamilyOperations } from './requestContext';
import { familyReadHandler, type FamilyHandler, type FamilyRequest } from './transport';
import { transportLegDrafts } from './transportDraft';
import { isFamilyRoutePlanningPreview, isRoutePlanningFixture } from './routePlanningPreview';
import { handlePreviewTour, previewTourPath } from './previewTourReads';
import { handlePreviewJournalLink } from './previewJournalReads';
import { handlePreviewCollabNotes } from './previewCollabNotes';
import { handlePreviewCollabLinks } from './previewCollabLinks';
import { handlePreviewCollabChat } from './previewCollabChat';
import { handlePreviewCollabPolls } from './previewCollabPolls';
import { handleRoutePreview } from './routePreferences';
import { handleFamilyTripRecovery } from './tripRecovery';
import {
  getDetailedWeather as getDetailedWeatherBackend,
  getWeather as getWeatherBackend,
} from './upstream/weatherService';
import { handleFamilyVacay } from './vacayHandler';
import { handleFamilyTripResourceMutation } from './tripResourceMutations';
import {
  ApplicationRoutes,
  TripApplicationRoutes,
  nativeApplicationAddons,
  weatherLocation,
  applicationSettingsPatch,
  observedFileMime,
  visitUpdateProposal,
  assignmentAddProposal,
  assignmentRemoveProposal,
  assignmentMoveProposal,
  noteRemoveProposal,
  noteSaveProposal,
} from './applicationRouteConditions';

type CountryFeatureCollection = { type: 'FeatureCollection'; features: unknown[] };

let countryGeoTask: Promise<CountryFeatureCollection> | null = null;

/** TREK's bundled admin-0 borders, decompressed in the browser. Nest serves the same gzip. */
function familyCountryGeo(): Promise<CountryFeatureCollection> {
  if (countryGeoTask == null) {
    countryGeoTask = (async () => {
      const response = await fetch(countryGeoUrl);
      if (!response.ok) throw new Error(`Country borders did not load (${response.status}).`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const gzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
      const text = gzip
        ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
        : new TextDecoder().decode(bytes);
      const geo = JSON.parse(text) as CountryFeatureCollection;
      if (geo?.type !== 'FeatureCollection' || !Array.isArray(geo.features) || geo.features.length === 0) {
        throw new Error('Country borders were empty.');
      }
      return geo;
    })();
    void countryGeoTask.catch(() => {
      countryGeoTask = null;
    });
  }
  return countryGeoTask;
}

type Body = Record<string, unknown>;
function object(value: unknown): Body {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Body;
  return {};
}
function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}
function optionalText(value: unknown) {
  return typeof value === 'string' && value !== '' ? value : null;
}
function number(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function unsupported(message: string): never {
  throw new FamilyApiError(422, 'family_action_unavailable', message);
}
const APP_CONFIG = {
  managed: true,
  has_users: true,
  setup_complete: true,
  allow_registration: false,
  password_login: true,
  passkey_login: false,
  passkey_configured: false,
  password_registration: false,
  oidc_login: false,
  oidc_registration: false,
  oidc_configured: false,
  oidc_only_mode: false,
  demo_mode: false,
  dev_mode: false,
  is_prerelease: false,
  version: __TREK_UI_VERSION__,
  has_maps_key: false,
  has_amap_key: false,
  places_provider: 'openstreetmap',
  require_mfa: false,
  trip_reminders_enabled: true,
  // Canonical Family covers are supplied on each DTO; no coordinate-based Nest photo enrichment.
  places_photos_enabled: false,
  places_autocomplete_enabled: true,
  places_details_enabled: true,
  places_enrich_enabled: true,
  place_shadow_enabled: false,
  max_upload_mb: 50,
};

async function resolveAuthView(repo: FamilyFrontendRepository) {
  const loading = captureFamilyActor(),
    before = familyAuthStore.getState();
  await familyAuthStore.getState().loadUser({ silent: true });
  const state = familyAuthStore.getState();
  loading.assertSourceCurrent();
  if (state.authCheckFailed)
    throw new FamilyApiError(503, 'family_validation_pending', 'Family access is still being checked. Try again.');
  if (!state.isAuthenticated || !state.authUserId || !state.user)
    throw new FamilyApiError(401, 'session_required', 'Sign in to Family Travel.');
  // A persisted identity has no validated gate yet. Its first same-identity
  // membership result may initialize that gate; cached fields grant no access.
  const initializedCache =
    before.isAuthenticated &&
    before.authGate === null &&
    before.authUserId !== null &&
    state.isAuthenticated &&
    state.authUserId === before.authUserId &&
    state.personId === before.personId &&
    state.familyId === before.familyId;
  if (before.authUserId && !initializedCache) loading.assertCurrent();
  else loading.assertSourceCurrent();
  const context = captureFamilyActor();
  if (state.authGate === null)
    throw new FamilyApiError(503, 'family_validation_pending', 'Family access is still being checked. Try again.');
  if (state.authGate !== 'ok' || !state.familyId || !state.personId) {
    const ids = new FamilyIdentityRegistry(
      state.authUserId,
      typeof localStorage === 'undefined' ? undefined : localStorage
    );
    return {
      user: {
        ...state.user,
        id: ids.register('auth', state.authUserId),
        role: 'user',
        family_gate: state.authGate,
      },
    };
  }
  const s = {
    userId: state.authUserId,
    personId: state.personId,
    familyId: state.familyId,
    user: state.user,
  };
  repo.acceptSession(s);
  const v = await context.perform(() => repo.views());
  familySettingsStore.getState().hydrateSupabasePlaneSettings();
  await context.perform(() =>
    Promise.all([
      familySettingsStore.getState().hydrateFamilyPreferences(s.familyId),
      useFamilyFeatureStore.getState().hydrate(s.familyId),
      useFamilyMapStore.getState().hydrate(s.familyId),
    ])
  );
  context.assertCurrent();
  acceptNativeSourceOwner(
    {
      format: 'family.native-owner.v1',
      source: getSupabaseUrl(),
      user_id: s.userId,
      family_id: s.familyId,
      person_id: s.personId,
      native_user: v.ids.register('person', s.personId),
    },
    context
  );
  return {
    user: {
      ...s.user,
      id: v.ids.register('person', s.personId),
      role: 'user',
      maps_api_key: null,
      mfa_enabled: state.user.mfa_enabled ?? false,
    },
  };
}

const setupFactors = new Map<string, string>();
onFamilyActorChange(() => setupFactors.clear());
const authTasks = new WeakMap<
  FamilyFrontendRepository,
  {
    context: ReturnType<typeof captureFamilyActor>;
    task: Promise<Awaited<ReturnType<typeof resolveAuthView>>>;
  }
>();
function authView(repo: FamilyFrontendRepository) {
  const existing = authTasks.get(repo);
  if (existing?.context.current()) return existing.task;
  const context = captureFamilyActor();
  const task = resolveAuthView(repo).finally(() => {
    release();
    if (authTasks.get(repo)?.task === task) authTasks.delete(repo);
  });
  // SDK refresh can retire the repository without changing the Family actor.
  // A new validation must not inherit that repository's pending auth flight.
  const release = repo.subscribeContext((tripId) => {
    if (tripId !== undefined) return;
    if (authTasks.get(repo)?.task === task) authTasks.delete(repo);
    release();
  });
  authTasks.set(repo, { context, task });
  return task;
}
async function staged(
  repo: FamilyFrontendRepository,
  tripId: string,
  input: Omit<changesBackend.UpsertTripChangeDraftOpInput, 'tripId'>
): Promise<never> {
  await repo.stage({ tripId, ...input });
  // Reject the published CRUD continuation: a draft must not optimistically
  // remove, insert or update a published row in the upstream store.
  throw new FamilyApiError(409, 'family_draft_staged', '[family:draft]Change added to My draft.');
}
function metadata(value: unknown): Record<string, string> {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new FamilyApiError(422, 'invalid_metadata', 'Invalid reservation metadata.');
    }
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(object(raw))) if (typeof value === 'string') result[key] = value;
  return result;
}

/** Browser integration only: all Family persistence remains in the existing adapters. */
function createFamilyApplicationHandler(
  repo: FamilyFrontendRepository = familyFrontend,
  releaseVersion?: (signal?: AbortSignal) => Promise<string | null>
): FamilyHandler {
  const read = familyReadHandler(repo);
  return async (request) => {
    if (/^\/shared(?:\/|$)/.test(request.pathname) || /^\/trips\/[^/]+\/share-link(?:\/|$)/.test(request.pathname))
      throw new FamilyApiError(501, 'family_sharing_unavailable', 'Public Trip sharing is not available.');
    const operations = captureApplicationOperations(repo, request);
    const { pathname: p, method: m } = request;
    const b = object(request.body);
    const routes = new ApplicationRoutes(p, m);
    return handleApplicationEntry({ ...operations, repo, read, releaseVersion, request, p, m, b, routes });
  };
}

/** Bind non-auth requests to their original repository context, including follow-up writes. */
export function scopedApplicationHandler(
  repo: FamilyFrontendRepository = familyFrontend,
  releaseVersion?: (signal?: AbortSignal) => Promise<string | null>
): FamilyHandler {
  return scopedFamilyRequest(repo, (scoped) => createFamilyApplicationHandler(scoped, releaseVersion));
}

export { scopedApplicationHandler as createFamilyApplicationHandler };

export type ApplicationFileObservation = Awaited<ReturnType<FamilyFrontendRepository['observeFile']>>;
export type ApplicationStageProposal = Parameters<typeof staged>[2];
type ApplicationContext = ReturnType<typeof captureApplicationOperations> & {
  repo: FamilyFrontendRepository;
  read: FamilyHandler;
  releaseVersion?: (signal?: AbortSignal) => Promise<string | null>;
  request: FamilyRequest;
  p: string;
  m: string;
  b: Record<string, unknown>;
  routes: ApplicationRoutes;
};
type TripRequestContext = ApplicationContext & { tripId: string; suffix: string; tripRoutes: TripApplicationRoutes };
type TripViewContext = TripRequestContext & {
  views: Awaited<ReturnType<FamilyFrontendRepository['views']>>;
} & ReturnType<typeof createTripIdentity>;
export type TripDataContext = TripViewContext & { c: Awaited<ReturnType<FamilyFrontendRepository['core']>> };
type AssignmentContext = TripDataContext & {
  dayId: string;
  day: TripDataContext['c']['days'][number];
  assignmentRoute: RegExpMatchArray;
};
function captureApplicationOperations(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const actor = captureFamilyActor({ allowMfaTransition: /^\/auth\/mfa\/(enable|disable)$/.test(request.pathname) });
  const auth = scopeFamilyOperations(repo, authBackend, actor);
  const {
    searchUnsplash,
    duplicateTrip,
    getWeather,
    getDetailedWeather,
    updateFamilyDisplayName,
    updateFamilyEmail,
    uploadPersonAvatar,
    clearPersonAvatar,
    fetchFamilyTravelStats,
    fetchFamilyAtlasStats,
  } = scopeFamilyOperations(
    repo,
    {
      searchUnsplash: searchUnsplashBackend,
      duplicateTrip: duplicateTripBackend,
      getWeather: getWeatherBackend,
      getDetailedWeather: getDetailedWeatherBackend,
      updateFamilyDisplayName: updateFamilyDisplayNameBackend,
      updateFamilyEmail: updateFamilyEmailBackend,
      uploadPersonAvatar: uploadPersonAvatarBackend,
      clearPersonAvatar: clearPersonAvatarBackend,
      fetchFamilyTravelStats: fetchFamilyTravelStatsBackend,
      fetchFamilyAtlasStats: fetchFamilyAtlasStatsBackend,
    },
    request.pathname.startsWith('/auth/') ? actor : undefined
  );
  const familyTrips = scopeFamilyOperations(repo, familyTripsBackend),
    changes = scopeFamilyOperations(repo, changesBackend),
    reservations = scopeFamilyOperations(repo, reservationsBackend),
    notes = scopeFamilyOperations(repo, notesBackend),
    schedule = scopeFamilyOperations(repo, scheduleBackend),
    places = scopeFamilyOperations(repo, placesBackend),
    expenses = scopeFamilyOperations(repo, expensesBackend);
  return {
    actor,
    auth,
    searchUnsplash,
    duplicateTrip,
    getWeather,
    getDetailedWeather,
    updateFamilyDisplayName,
    updateFamilyEmail,
    uploadPersonAvatar,
    clearPersonAvatar,
    fetchFamilyTravelStats,
    fetchFamilyAtlasStats,
    familyTrips,
    changes,
    reservations,
    notes,
    schedule,
    places,
    expenses,
  };
}
async function handleApplicationEntry(context: ApplicationContext) {
  const { repo, releaseVersion, request, b, routes, auth, fetchFamilyTravelStats } = context;
  const fileId = routes.fileOpenId();
  if (fileId) {
    const observation = await repo.observeFile(fileId);
    const blob = await readObservedFile(repo, observation, fetch, request.signal);
    const bytes = await observation.perform(() => blob.arrayBuffer());
    return new Response(bytes, {
      headers: { 'content-type': observedFileMime(blob, observation) },
    });
  }
  if (routes.appConfig())
    return { ...APP_CONFIG, version: (await releaseVersion?.(request.signal)) ?? __TREK_UI_VERSION__ };
  if (routes.config()) return { defaultLanguage: familySettingsStore.getState().settings.language };
  if (routes.meRead()) return authView(repo);
  if (routes.login()) {
    repo.clear();
    const result = await familyAuthStore.getState().login(text(b.email), text(b.password), Boolean(b.remember_me));
    if ('mfa_required' in result) return { mfa_required: true, mfa_token: result.mfa_token };
    return authView(repo);
  }
  if (routes.verifyLogin()) {
    await familyAuthStore.getState().completeMfaLogin(text(b.mfa_token), text(b.code));
    repo.clear();
    return authView(repo);
  }
  if (routes.logout()) {
    await familyAuthStore.getState().logout();
    repo.clear();
    return { success: true };
  }
  if (routes.forgotPassword()) {
    await auth.requestPasswordRecovery(text(b.email));
    return { ok: true };
  }
  if (routes.resetPassword()) {
    const next = text(b.new_password) || text(b.password);
    try {
      await auth.updateRecoveredPassword(next);
    } catch (err) {
      if (err instanceof authBackend.PasswordChangeError) {
        throw new FamilyApiError(422, err.code, err.message || 'Could not update the password.');
      }
      throw err;
    }
    return { success: true };
  }
  if (routes.travelStats()) return fetchFamilyTravelStats((await repo.session()).familyId);
  if (routes.notices()) return [];
  if (routes.register()) unsupported('Family Travel uses its existing membership and invitation process.');
  return handleApplicationMfa(context);
}
async function handleApplicationMfa(context: ApplicationContext) {
  const { repo, b, routes, actor, auth } = context;
  if (routes.mfaSetup()) {
    const user = familyAuthStore.getState().authUserId;
    if (!user) throw new FamilyApiError(401, 'session_required', 'Sign in first.');
    const factor = await auth.enrollTotpFactor();
    setupFactors.set(actor.key, factor.factorId);
    return {
      qr_svg: factor.qrCode,
      qr: factor.qrCode,
      qr_code: factor.qrCode,
      secret: factor.secret,
    };
  }
  if (routes.mfaEnable()) {
    const user = familyAuthStore.getState().authUserId;
    const factor = user && setupFactors.get(actor.key);
    if (!factor) throw new FamilyApiError(409, 'mfa_setup_required', 'Start authenticator setup again.');
    await auth.verifyTotpFactor(factor, text(b.code));
    setupFactors.delete(actor.key);
    repo.clear();
    return { success: true, mfa_enabled: true };
  }
  if (routes.mfaDisable()) {
    const factor = (await auth.listTotpFactors()).find((f) => f.status === 'verified');
    if (!factor) throw new FamilyApiError(409, 'mfa_factor_unavailable', 'No verified authenticator found.');
    await auth.reauthenticateWithPassword(text(b.password));
    await auth.verifyTotpFactor(factor.id, text(b.code));
    await auth.unenrollTotpFactor(factor.id);
    repo.clear();
    return { success: true, mfa_enabled: false };
  }
  if (routes.password()) {
    await auth.changePassword({
      email: familyAuthStore.getState().user?.email,
      currentPassword: text(b.current_password),
      newPassword: text(b.new_password),
      confirmPassword: text(b.new_password),
    });
    return { success: true };
  }
  return handleApplicationAccount(context);
}
async function handleApplicationAccount(context: ApplicationContext) {
  const {
    repo,
    request,
    p,
    m,
    b,
    routes,
    actor,
    updateFamilyDisplayName,
    updateFamilyEmail,
    uploadPersonAvatar,
    clearPersonAvatar,
  } = context;
  if (routes.profile()) {
    const session = await repo.session();
    if (b.username !== undefined)
      await updateFamilyDisplayName({
        userId: session.userId,
        personId: session.personId,
        displayName: text(b.username),
      });
    if (b.email !== undefined && b.email !== session.user.email)
      await updateFamilyEmail({
        email: text(b.email),
        currentPassword: text(b.current_password),
        personId: session.personId,
      });
    repo.clear();
    return authView(repo);
  }
  if (routes.avatar()) {
    const session = await repo.session();
    if (m === 'DELETE') await clearPersonAvatar({ personId: session.personId });
    else if (m === 'POST') {
      const file = request.body instanceof FormData ? request.body.get('avatar') : null;
      if (!(file instanceof File)) throw new FamilyApiError(422, 'avatar_required', 'Select an avatar.');
      await uploadPersonAvatar({ familyId: session.familyId, personId: session.personId, file });
    }
    repo.clear();
    return { avatar_url: (await authView(repo)).user.avatar_url };
  }
  if (routes.settings()) {
    const { familyId } = await repo.session();
    if (m === 'GET') return readFamilyApplicationSettings(familyId, actor);
    const patch = applicationSettingsPatch(p, b, object, text);
    assertFamilyMapSettingsPatch(patch);
    await actor.perform(() => familySettingsStore.getState().updateSettings(patch as Partial<Settings>));
    return {
      settings: {
        ...familySettingsStore.getState().settings,
        ...nativeFamilyMapSettings(familyId, isNativeFamilyPublicMap()),
      },
    };
  }
  if (routes.passkeys()) {
    await repo.session();
    return { credentials: [] };
  }
  if (routes.llm()) {
    await repo.session();
    return { images: false };
  }
  return handleApplicationMap(context);
}
async function handleApplicationMap(context: ApplicationContext) {
  const { repo, request, p, routes, getWeather, getDetailedWeather } = context;
  const mapContributions = routes.mapContributions();
  if (mapContributions) {
    await repo.tripHeader(mapContributions[2]);
    // Native TREK plugin contributions. Family has no plugin providers;
    // these endpoints do not represent the trip's destination pins or data layers.
    return mapContributions[1] === 'map-markers' ? { markers: [] } : { layers: [] };
  }
  if (routes.dayContributions()) {
    await repo.tripHeader(p.split('/')[2]);
    // No Family plugin providers are configured. These are contributions, not itinerary records.
    return p.startsWith('/day-tints/') ? { tints: [] } : { items: [] };
  }
  if (routes.weather()) {
    await repo.session();
    const detailed = p.endsWith('/detailed'),
      location = weatherLocation(request.query, detailed);
    if (!location) throw new FamilyApiError(422, 'invalid_weather_location', 'Choose a valid location and date.');
    const { lat, lng, date } = location,
      lang = request.query.get('lang') ?? 'en';
    return detailed && date
      ? getDetailedWeather(lat, lng, date, lang)
      : getWeather(lat, lng, date, lang, request.query.get('time') ?? undefined);
  }
  if (routes.plugins()) return { plugins: [] };
  if (routes.addons()) {
    await repo.session();
    const f = useFamilyFeatureStore.getState();
    // Desktop Navbar, phone BottomNav, and the mobile dock only mount
    // type "global". Trip tools stay "core". Tours stays off until its backend exists.
    return nativeApplicationAddons(f, isFamilyRoutePlanningPreview());
  }
  return handleApplicationDiscovery(context);
}
async function handleApplicationDiscovery(context: ApplicationContext) {
  const { repo, request, p, routes, searchUnsplash } = context;
  const catalogResult = await handleFamilyCatalogMap(repo, request);
  if (catalogResult !== NOT_HANDLED) return catalogResult;
  if (routes.tags()) return { tags: [] };
  if (routes.health()) return { bookingImport: false, aiParsing: false };
  if (routes.viewContributions())
    return p.startsWith('/trip-warnings')
      ? { warnings: [] }
      : p.startsWith('/place-details')
        ? { providers: [] }
        : { contributions: [] };
  if (routes.coverSearch()) {
    await repo.session();
    return { photos: await searchUnsplash(request.query.get('query') ?? '') };
  }
  if (routes.activeTrip()) {
    const list = (await repo.listTrips(false)).trips,
      today = new Date().toISOString().slice(0, 10);
    const trip =
      list.find((t) => t.start_date && t.end_date && t.start_date <= today && t.end_date >= today) ??
      list
        .filter((t) => t.start_date && t.start_date >= today)
        .sort((a, b) => a.start_date!.localeCompare(b.start_date!))[0] ??
      list[list.length - 1] ??
      null;
    return { trip };
  }
  if (routes.upcoming()) {
    const today = new Date().toISOString().slice(0, 10),
      trips = (await repo.listTrips(false)).trips;
    const lists = await Promise.all(
      trips.map(async (trip) =>
        (await repo.reservationList(trip.id)).reservations.map((row) => ({ ...row, trip_title: trip.title }))
      )
    );
    return {
      reservations: lists
        .flat()
        .filter((row) => row.reservation_time && row.reservation_time.slice(0, 10) >= today)
        .sort((a, b) => a.reservation_time!.localeCompare(b.reservation_time!))
        .slice(0, 20),
    };
  }
  return handleApplicationGlobals(context);
}
async function handleApplicationGlobals(context: ApplicationContext) {
  const { repo, request, p, routes, fetchFamilyAtlasStats } = context;
  const vacay = await handleFamilyVacay(repo, request);
  if (vacay !== NOT_HANDLED) return vacay;
  const notification = await handleFamilyNotifications(repo, request);
  if (notification !== NOT_HANDLED) return notification;
  const collection = await handleFamilyCollection(repo, request);
  if (collection !== NOT_HANDLED) return collection;
  const journal = await handleFamilyJourney(repo, request);
  if (journal !== NOT_HANDLED) return journal;
  const planApi = await handleFamilyPlanApi(repo, request);
  if (planApi !== NOT_HANDLED) return planApi;
  const tripRecovery = await handleFamilyTripRecovery(repo, request);
  if (tripRecovery !== NOT_HANDLED) return tripRecovery;
  if (routes.atlasStats()) {
    return fetchFamilyAtlasStats((await repo.session()).familyId);
  }
  if (routes.countryGeo()) {
    await repo.session();
    return familyCountryGeo();
  }
  if (routes.atlasUnavailable()) {
    await repo.session();
    const section =
      p === '/atlas-layers'
        ? 'layers'
        : p.includes('/regions')
          ? 'regions'
          : p.includes('/country/')
            ? 'country'
            : 'bucket';
    throw new FamilyApiError(501, `family_atlas_${section}_unavailable`, 'This Atlas section is not available yet.');
  }
  return handleApplicationTrip(context);
}
async function handleApplicationTrip(context: ApplicationContext) {
  const { repo, read, request, p, m, b } = context;
  const match = p.match(/^\/trips\/([^/]+)(?:\/(.*))?$/);
  if (!match) return read(request);
  const tripId = await repo.tripUuid(match[1]);
  const suffix = match[2] ?? '';
  const tripRoutes = new TripApplicationRoutes(suffix, m, b);
  return handleTripPreflight({ ...context, tripId, suffix, tripRoutes });
}
async function handleTripPreflight(context: TripRequestContext) {
  const { repo, request, b, duplicateTrip, familyTrips, tripId, suffix, tripRoutes } = context;
  if (isRoutePlanningFixture(tripId) && (['family/route-preferences','family/route-waypoints'].includes(suffix) || suffix.startsWith('roadtrip/')))
    return handleRoutePreview(repo, tripId, suffix, request);
  if (isRoutePlanningFixture(tripId) && previewTourPath(suffix))
    return handlePreviewTour(repo, tripId, suffix, request);
  if (isRoutePlanningFixture(tripId) && /^family\/collab\/polls(?:\/\d+\/(?:vote|close|trash|restore))?$/.test(suffix))
    return handlePreviewCollabPolls(repo, tripId, suffix, request);
  if (isRoutePlanningFixture(tripId) && (suffix === 'collab/messages' ||
    /^family\/collab\/messages(?:\/(?:updates|trash|\d+\/(?:trash|restore|react)))?$/.test(suffix)))
    return handlePreviewCollabChat(repo, tripId, suffix.replace(/^family\//, ''), request);
  if (isRoutePlanningFixture(tripId) && suffix === 'collab/links')
    return handlePreviewCollabLinks(repo, tripId, suffix, request);
  if (isRoutePlanningFixture(tripId) && /^family\/collab\/links(?:\/\d+(?:\/(?:pin|unpin|trash|restore))?)?$/.test(suffix))
    return handlePreviewCollabLinks(repo, tripId, suffix.slice('family/'.length), request);
  if (isRoutePlanningFixture(tripId) && /^collab(?:\/|$)/.test(suffix))
    return handlePreviewCollabNotes(repo, tripId, suffix, request);
  if (isRoutePlanningFixture(tripId) && /^family\/collab\/notes(?:\/\d+(?:\/(?:trash|restore))?)?$/.test(suffix))
    return handlePreviewCollabNotes(repo, tripId, suffix.slice('family/'.length), request);
  if (isRoutePlanningFixture(tripId) && /^journal(?:\/|$)/.test(suffix)) {
    if (suffix === 'journal') return handlePreviewJournalLink(repo, tripId, request);
    throw new FamilyApiError(404, 'journal_preview_unavailable', 'This Journal operation is unavailable in the preview.');
  }
  if (tripRoutes.unsupported()) {
    await repo.tripHeader(tripId);
    throw new FamilyApiError(
      501,
      'family_action_unavailable',
      'This Trip operation is not connected to the Family backend.'
    );
  }
  if (tripRoutes.bookingImport()) {
    if (!(request.body instanceof FormData))
      throw new FamilyApiError(422, 'files_required', 'Choose booking documents.');
    if (request.body.get('mode') === 'force-ai') unsupported('AI extraction is not configured.');
    return startFamilyImport(
      repo,
      tripId,
      request.body.getAll('files').filter((file): file is File => file instanceof File)
    );
  }
  if (tripRoutes.importStatus())
    return familyImportStatus(repo, tripId, suffix.split('/')[suffix.split('/').length - 1]);
  if (tripRoutes.duplicate()) {
    const result = await duplicateTrip(tripId);
    return repo.trip(result.tripId);
  }
  if (tripRoutes.archive()) {
    await repo.write(tripId, 'trip.archive', () =>
      b.is_archived ? familyTrips.archiveTrip(tripId) : familyTrips.unarchiveTrip(tripId)
    );
    return repo.trip(tripId);
  }
  if (tripRoutes.docsync()) {
    await repo.tripHeader(tripId);
    // The Family installation has no document-sync providers or bindings.
    return suffix.endsWith('/status') ? { items: {}, links: [] } : [];
  }
  if (tripRoutes.staysUnavailable())
    throw new FamilyApiError(
      503,
      'family_stays_unavailable',
      'Lodging data is unavailable in this view. Reopen the Trip before continuing.'
    );
  return handleTripReads(context);
}
function createTripIdentity(views: Awaited<ReturnType<FamilyFrontendRepository['views']>>) {
  const id = (kind: IdentityKind, value: unknown) =>
    views.ids.uuid(kind, typeof value === 'number' ? value : text(value));
  const ref = (kind: IdentityKind, value: unknown) => (value == null || value === '' ? null : id(kind, value));
  return { id, ref };
}
async function handleTripReads(context: TripRequestContext) {
  const { repo } = context;
  const views = await repo.views();
  const frame = { ...context, views, ...createTripIdentity(views) };
  return handleTripReadDelegates(frame);
}
async function handleTripReadDelegates(context: TripViewContext) {
  const { repo, read, request, m, tripId, suffix, tripRoutes } = context;
  const budgetResult = await handleFamilyBudget(repo, request, tripId, suffix);
  if (budgetResult !== NOT_HANDLED) return budgetResult;
  const fileResult = await handleFamilyFile(repo, request, tripId, suffix);
  if (fileResult !== NOT_HANDLED) return fileResult;
  const listResult = await handleFamilyList(repo, request, tripId, suffix);
  if (listResult !== NOT_HANDLED) return listResult;
  if (tripRoutes.tourDraft()) {
    await repo.tripHeader(tripId);
    return { draft: null };
  }
  if (tripRoutes.tours()) return { tours: [] };
  if (m === 'GET') return read(request);
  const c = await repo.core(tripId);
  return handleLegacyPlan({ ...context, c });
}
async function handleLegacyPlan(context: TripDataContext) {
  const { repo, b, tripId, suffix, tripRoutes, views, id, c } = context;
  const dayRoute = tripRoutes.dayTitle();
  if (dayRoute) {
    const dayId = id('day', dayRoute[1]);
    if (!c.days.some((x) => x.id === dayId)) throw new FamilyApiError(404, 'day_unavailable', 'Trip day unavailable.');
    if (Object.keys(b).some((k) => k !== 'title')) unsupported('Family trip days follow the recorded civil-day spine.');
    await repo.write(tripId, 'trip.schedule.manage', () =>
      repo.readers.days.updateTripDayTitle(dayId, optionalText(b.title))
    );
    return {
      day: (await repo.dayList(tripId)).days.find((x) => views.ids.uuid('day', x.id) === dayId),
    };
  }
  const visitAction = tripRoutes.visitTiming();
  if (visitAction) return handleVisitTiming(context, visitAction);
  const assignmentRoute = suffix.match(/^days\/([^/]+)\/assignments(?:\/([^/]+))?$/);
  if (assignmentRoute) return handleDayAssignments(context, assignmentRoute);
  return handleDayNotes(context);
}
async function handleVisitTiming(context: TripDataContext, visitAction: RegExpMatchArray) {
  const { repo, b, schedule, tripId, views, id, c } = context;
  const rowId = id('assignment', visitAction[1]),
    before = c.schedule.find((row) => row.id === rowId);
  if (!before) throw new FamilyApiError(404, 'assignment_unavailable', 'This visit is unavailable.');
  let day = c.days.find((day) => day.civilDay === schedule.utcCivilDay(before.startsAt));
  let startsAt: typeof before.startsAt,
    endsAt: typeof before.endsAt,
    sortOrder = before.sortOrder;
  if (visitAction[2] === 'time') {
    if (!day) unsupported('Assign this visit to a trip day before editing its time.');
    const clock = (value: unknown) =>
      value == null || value === ''
        ? null
        : typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
          ? value
          : unsupported('Enter a valid clock in HH:mm format.');
    const start = clock(b.place_time),
      end = clock(b.end_time);
    startsAt = start ? `${day.civilDay}T${start}:00.000Z` : schedule.civilDayToUtcMidnightIso(day.civilDay);
    endsAt = end ? `${day.civilDay}T${end}:00.000Z` : null;
  } else {
    day = c.days.find((day) => day.id === id('day', b.new_day_id));
    if (!day) throw new FamilyApiError(404, 'day_unavailable', 'This trip day is unavailable.');
    const target = c.schedule.filter((row) => row.id !== rowId && schedule.utcCivilDay(row.startsAt) === day!.civilDay);
    if (b.order_index != null && b.order_index !== target.length)
      unsupported('Move the visit to the end of the day, then use an available move control.');
    const oldCivil = schedule.utcCivilDay(before.startsAt);
    const delta = oldCivil ? Date.parse(day.civilDay) - Date.parse(oldCivil) : 0;
    startsAt =
      before.startsAt && oldCivil
        ? new Date(Date.parse(before.startsAt) + delta).toISOString()
        : schedule.civilDayToUtcMidnightIso(day.civilDay);
    endsAt = before.endsAt && oldCivil ? new Date(Date.parse(before.endsAt) + delta).toISOString() : null;
    sortOrder = Math.max(-1, ...target.map((row) => row.sortOrder)) + 1;
  }
  const draft = { ...before, startsAt, endsAt, sortOrder };
  const saved = await repo.write(
    tripId,
    'trip.schedule.manage',
    () => schedule.updateScheduleTiming(tripId, rowId, draft),
    () => staged(repo, tripId, visitUpdateProposal(context, { rowId, day, draft }))
  );
  return { assignment: views.assignment(saved, day!, c.places) };
}
async function handleAssignmentDeleteAll(context: AssignmentContext) {
  const { repo, schedule, tripId, views, c, dayId, day } = context;
  const rows = c.schedule.filter((row) => schedule.utcCivilDay(row.startsAt) === day.civilDay);
  await repo.write(
    tripId,
    'trip.schedule.manage',
    async () => {
      for (const row of rows) await schedule.deleteScheduleItem(row.id);
    },
    async () => {
      for (const row of rows) await repo.stage(assignmentRemoveProposal(context, { day, rowId: row.id, dayId }));
      throw new FamilyApiError(409, 'family_draft_staged', '[family:draft]Changes added to My draft.');
    }
  );
  return { success: true, removedIds: rows.map((row) => views.ids.register('assignment', row.id)) };
}
async function handleAssignmentCreate(context: AssignmentContext) {
  const { repo, b, schedule, tripId, views, id, c, dayId, day } = context;
  const placeId = id('place', b.place_id);
  const place = c.places.find((x) => x.id === placeId);
  if (!place) throw new FamilyApiError(404, 'place_unavailable', 'Trip place unavailable.');
  const sortOrder =
    Math.max(
      -1,
      ...c.schedule.filter((x) => schedule.utcCivilDay(x.startsAt) === day.civilDay).map((x) => x.sortOrder)
    ) + 1;
  const draft = {
    activity: place.name,
    placeId,
    startsAt: schedule.civilDayToUtcMidnightIso(day.civilDay),
    sortOrder,
  };
  const result = await repo.write(
    tripId,
    'trip.schedule.manage',
    () => schedule.insertScheduleItem({ tripId, ...draft }),
    () => staged(repo, tripId, assignmentAddProposal(context, { day, draft, dayId }))
  );
  return { assignment: views.assignment(result, day, c.places) };
}
async function handleAssignmentDelete(context: AssignmentContext, rowId: string) {
  const { repo, schedule, tripId, c, day, dayId } = context;
  const row = c.schedule.find((x) => x.id === rowId);
  if (!row || row.tripId !== tripId || schedule.utcCivilDay(row.startsAt) !== day.civilDay)
    throw new FamilyApiError(404, 'assignment_unavailable', 'Trip occurrence unavailable.');
  await repo.write(
    tripId,
    'trip.schedule.manage',
    async () => {
      if (!(await schedule.deleteScheduleItemForDay(rowId, tripId, day.civilDay)))
        throw new FamilyApiError(409, 'assignment_changed', 'This visit changed. Reload the day before removing it.');
    },
    () => staged(repo, tripId, assignmentRemoveProposal(context, { day, dayId, rowId }))
  );
  return { success: true };
}
async function handleAssignmentReorder(context: AssignmentContext) {
  const { repo, b, reservations, schedule, tripId, id, c, day } = context;
  const current = c.schedule
    .filter((x) => schedule.utcCivilDay(x.startsAt) === day.civilDay)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const ordered = array(b.orderedIds).map((x) => id('assignment', x));
  if (
    ordered.length !== current.length ||
    new Set(ordered).size !== current.length ||
    ordered.some((x) => !current.some((r) => r.id === x))
  )
    unsupported('The day changed. Reload before reordering.');
  const previous = current.map((x) => x.id);
  const changed = previous.map((x, i) => (x === ordered[i] ? -1 : i)).filter((i) => i >= 0);
  if (!changed.length) return { success: true };
  if (
    changed.length !== 2 ||
    changed[1] !== changed[0] + 1 ||
    ordered[changed[0]] !== previous[changed[1]] ||
    ordered[changed[1]] !== previous[changed[0]]
  )
    unsupported('Move one adjacent occurrence at a time.');
  const a = current[changed[0]],
    z = current[changed[1]];
  const [bookings, transports] = await Promise.all([
    reservations.listTripBookings(tripId),
    reservations.listTripTransports(tripId),
  ]);
  const projected = projectFamilyDayTimeline({
    days: c.days,
    scheduleItems: c.schedule,
    notes: c.notes,
    bookings,
    transports,
    placesById: new Map(c.places.map((p) => [p.id, p])),
  });
  const rows = projected.find((p) => p.dayId === day.id)?.rows ?? [];
  const updates = schedulePairMove(rows, a.id, 1);
  if (!updates || !updates.some((u) => u.id === z.id))
    unsupported('This move would cross a reservation or leave the visible order unchanged.');
  await repo.write(
    tripId,
    'trip.schedule.manage',
    () => schedule.updateScheduleSortOrders(updates),
    async () => {
      for (const u of updates) {
        const item = current.find((r) => r.id === u.id)!;
        await repo.stage(assignmentMoveProposal(context, { day, item, u }));
      }
      throw new FamilyApiError(409, 'family_draft_staged', '[family:draft]Move added to My draft.');
    }
  );
  return { success: true };
}
async function handleDayAssignments(context: TripDataContext, assignmentRoute: RegExpMatchArray) {
  const { m, id, c } = context;
  const dayId = id('day', assignmentRoute[1]);
  const day = c.days.find((x) => x.id === dayId);
  if (!day) throw new FamilyApiError(404, 'day_unavailable', 'Trip day unavailable.');
  const rowId = assignmentRoute[2] && assignmentRoute[2] !== 'reorder' ? id('assignment', assignmentRoute[2]) : null;
  const frame = { ...context, dayId, day, assignmentRoute };
  if (m === 'DELETE' && !assignmentRoute[2]) return handleAssignmentDeleteAll(frame);
  if (m === 'POST' && !assignmentRoute[2]) return handleAssignmentCreate(frame);
  if (rowId && m === 'DELETE') return handleAssignmentDelete(frame, rowId);
  if (assignmentRoute[2] === 'reorder' && m === 'PUT') return handleAssignmentReorder(frame);
  return handleDayNotes(context);
}
async function handleDayNotes(context: TripDataContext) {
  const { repo, m, b, changes, reservations, notes, places, expenses, tripId, suffix, views, id, ref, c } = context;
  const noteRoute = suffix.match(/^days\/([^/]+)\/notes(?:\/([^/]+))?$/);
  if (noteRoute) {
    const dayId = id('day', noteRoute[1]);
    const day = c.days.find((x) => x.id === dayId);
    if (!day) throw new FamilyApiError(404, 'day_unavailable', 'Trip day unavailable.');
    const noteId = noteRoute[2] ? id('note', noteRoute[2]) : null;
    if (noteId && !c.notes.some((n) => n.id === noteId && n.civilDay === day.civilDay))
      throw new FamilyApiError(404, 'note_unavailable', 'Day note unavailable.');
    if (m === 'DELETE' && noteId) {
      await repo.write(
        tripId,
        'trip.schedule.manage',
        () => notes.deleteDayNote(noteId),
        () => staged(repo, tripId, noteRemoveProposal(context, { day, noteId }))
      );
      return { success: true };
    }
    if (m === 'POST' || m === 'PUT') {
      const body = text(b.text);
      const result = await repo.write(
        tripId,
        'trip.schedule.manage',
        () => notes.upsertDayNote({ tripId, civilDay: day.civilDay, body, noteId }),
        () => staged(repo, tripId, noteSaveProposal(context, { day, noteId, body }))
      );
      return {
        note: {
          id: views.ids.register('note', result.id),
          day_id: views.ids.register('day', day.id),
          text: result.body,
          icon: result.icon,
          sort_order: result.sortOrder,
        },
      };
    }
  }
  return handleFamilyTripResourceMutation(
    { repo, tripId, suffix, m, b, c, views, id, ref },
    {
      places,
      reservations,
      expenses,
      changes,
      staged,
      metadata,
      transportLegDrafts,
      expenseDraft,
      expenseRates,
      object,
      text,
      optionalText,
      number,
      array,
      unsupported,
    }
  );
}
