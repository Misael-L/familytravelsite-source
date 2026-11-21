// organize-imports-ignore
// sort-imports-ignore
// Preserve existing module evaluation order during formatting.
import { installFamilyOperationContext } from '@family/backend/supabase/operationContext';
import { apiClient } from '../../api/client';
import { installRealtimeDriver } from '../../api/websocket';
import { invalidateOfflineSession } from '../../db/offlineDb';
import { installFilePreviewPort } from '../../repo/filePreview';
import { useAddonStore } from '../../store/addonStore';
import { useAuthStore } from '../../store/authStore';
import { useBackgroundTasksStore } from '../../store/backgroundTasksStore';
import { useInAppNotificationStore } from '../../store/inAppNotificationStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useTripStore } from '../../store/tripStore';
import { isAuthed } from '../../sync/authGate';
import { captureFamilyActor, observeFamilyActor } from './actorContext';
import { onFamilyActorChange } from './actorEvents';
import { createFamilyApplicationHandler } from './applicationHandler';
import { assertCoreHttpsTaskRequest, coreHttpsTaskFetch } from './coreHttpsTaskBoundary';
import { assertCoreHttpsPlannerPackingRequest, coreHttpsPlannerPackingFetch } from './coreHttpsPlannerPackingBoundary';
import { clearFamilyImportJobs } from './bookingImportJobs';
import { createFamilyFilePreviewPort } from './filePreview';
import { subscribeNativeFamilyMapSettings } from './familyMapProjection';
import { FamilyIdentityRegistry } from './identity';
import { onSupabaseAuthStateChange } from './legacy/data/supabase/auth';
import { getDataPlane, getSupabaseAnonKey, getSupabaseUrl } from './legacy/data/supabase/env';
import { useFamilyFeatureStore } from './legacy/store/familyFeatureStore';
import { useFamilyMapStore } from './legacy/store/familyMapStore';
import { NOT_HANDLED } from './listHandler';
import { installFamilyNativeSourceOwnership } from './nativeSourceOwnership';
import { installFamilyOfflineDatabaseGuard } from './offlineDatabaseGuard';
import { offlineTripRequest } from './offlineTripSession';
import { capturePlannerAuthRefresh, continuePlannerAuthRefresh } from './plannerAuthRefresh';
import { installFamilyPlanner } from './plannerBootstrap';
import { installPlannerCacheRetirement } from './plannerCacheRetirement';
import { installFamilyPrivateCacheRetirement } from './privateWorkerCaches';
import { createFamilyRealtimeDriver } from './realtimeBridge';
import { createFamilyReleaseObserver } from './releaseObserver';
import { familyAuthStore, familyFrontend } from './repository';
import { activateFamilyFrontend } from './runtime';
import { installFamilyCollectionStore, retireFamilyCollections } from './collectionRuntime';
import { createFamilyAxiosAdapter, createFamilyFetch } from './transport';

let uninstall: (() => void) | undefined;

function installPlannerCaches() {
  // Observe a prior persisted owner before validation can replace its Person/Family.
  // This only targets an existing generation for cleanup; cached identity grants no access.
  const rememberedOwner = (() => {
    const family = familyAuthStore.getState(),
      native = useAuthStore.getState();
    try {
      if (
        !family.isAuthenticated ||
        !native.isAuthenticated ||
        !native.user ||
        !family.authUserId ||
        !family.familyId ||
        !family.personId ||
        new FamilyIdentityRegistry(family.authUserId).register('person', family.personId) !== native.user.id
      )
        return null;
      return {
        source: getSupabaseUrl(),
        user_id: family.authUserId,
        family_id: family.familyId,
        person_id: family.personId,
      };
    } catch {
      return null;
    }
  })();
  return installPlannerCacheRetirement(
    getSupabaseUrl,
    () => {
      const family = familyAuthStore.getState(),
        native = useAuthStore.getState();
      if (
        !isAuthed() ||
        !native.isAuthenticated ||
        native.authCheckFailed ||
        family.authGate !== 'ok' ||
        family.authCheckFailed ||
        !family.isAuthenticated ||
        !family.authUserId ||
        !family.familyId ||
        !family.personId
      )
        return null;
      return {
        source: getSupabaseUrl(),
        user_id: family.authUserId,
        family_id: family.familyId,
        person_id: family.personId,
      };
    },
    (changed) => {
      const stopFamily = familyAuthStore.subscribe(changed),
        stopNative = useAuthStore.subscribe(changed);
      return () => {
        stopFamily();
        stopNative();
      };
    },
    rememberedOwner && {
      identity: rememberedOwner,
      isStale: () => {
        const current = familyAuthStore.getState();
        return (
          !current.isAuthenticated ||
          current.authUserId !== rememberedOwner.user_id ||
          current.familyId !== rememberedOwner.family_id ||
          current.personId !== rememberedOwner.person_id ||
          getSupabaseUrl() !== rememberedOwner.source ||
          (current.authGate !== null && current.authGate !== 'ok')
        );
      },
    }
  );
}

function resetNativeActorState() {
  useTripStore.getState().resetTrip();
  useSettingsStore.getState().resetSettings();
  useAddonStore.getState().resetAddons();
  clearFamilyImportJobs();
  useBackgroundTasksStore.setState({ tasks: [] });
  useInAppNotificationStore.setState({
    notifications: [],
    unreadCount: 0,
    total: 0,
    isLoading: false,
    hasMore: false,
  });
}

/** Install backend connections before the copied frontend starts its boot probes. */
export function installFamilyFrontend() {
  if (getDataPlane() !== 'supabase') return;
  uninstall?.();
  const releaseSourceOwner = installFamilyNativeSourceOwnership();
  const releaseDatabaseGuard = installFamilyOfflineDatabaseGuard();
  const privateCaches = installFamilyPrivateCacheRetirement();
  const plannerCaches = installPlannerCaches();
  let disposed = false;
  const previousFetch = window.fetch,
    previousAdapter = apiClient.defaults.adapter;
  const nativeFetch = coreHttpsPlannerPackingFetch(coreHttpsTaskFetch(window.fetch.bind(window)));
  const release = createFamilyReleaseObserver(nativeFetch, getSupabaseUrl);
  const planner = installFamilyPlanner(
    familyFrontend,
    createFamilyApplicationHandler(familyFrontend, release.readVersion)
  );
  const handle: typeof planner.handle = async (request) => {
    assertCoreHttpsTaskRequest(request);
    assertCoreHttpsPlannerPackingRequest(request);
    if (request.pathname === '/health') {
      const response = await nativeFetch(`${getSupabaseUrl().replace(/\/$/, '')}/auth/v1/health`, {
        headers: { apikey: getSupabaseAnonKey() },
        signal: request.signal,
      });
      return new Response(await response.text(), {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    const cached = await offlineTripRequest(request);
    return cached === NOT_HANDLED ? planner.handle(request) : cached;
  };
  const adapter = createFamilyAxiosAdapter(handle),
    frontendFetch = createFamilyFetch(handle, nativeFetch, window.location.origin);
  apiClient.defaults.adapter = adapter;
  window.fetch = frontendFetch;
  const releasePreviews = installFilePreviewPort(
    createFamilyFilePreviewPort(familyFrontend, nativeFetch, window.location.origin)
  );
  const driver = createFamilyRealtimeDriver();
  observeFamilyActor();
  const releaseOperations = installFamilyOperationContext(() => captureFamilyActor());
  const releaseActor = onFamilyActorChange(() => {
    familyFrontend.clear();
    driver.disconnect();
    invalidateOfflineSession();
    resetNativeActorState();
    if (useAuthStore.getState().isAuthenticated) {
      const context = captureFamilyActor();
      queueMicrotask(() => {
        if (context.current())
          void useAuthStore
            .getState()
            .loadUser({ silent: true })
            .catch(() => {
              if (context.current()) useAuthStore.setState({ authCheckFailed: true });
            });
      });
    }
  });
  installRealtimeDriver(driver);
  const authSubscription = onSupabaseAuthStateChange((event, session) => {
    if (disposed) return;
    if (event !== 'INITIAL_SESSION') retireFamilyCollections(familyFrontend);
    if (
      event === 'TOKEN_REFRESHED' ||
      event === 'USER_UPDATED' ||
      event === 'SIGNED_OUT' ||
      (event === 'SIGNED_IN' && session?.user.id !== familyAuthStore.getState().authUserId)
    ) {
      const refreshPlanner = event === 'TOKEN_REFRESHED' ? capturePlannerAuthRefresh(() => !disposed) : null;
      familyFrontend.clear();
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
        clearFamilyImportJobs();
        useBackgroundTasksStore.setState({ tasks: [] });
        driver.disconnect();
        useFamilyMapStore.getState().reset();
        useFamilyFeatureStore.getState().reset();
      }
      continuePlannerAuthRefresh(refreshPlanner, () => !disposed);
    }
  });
  activateFamilyFrontend();
  const releaseCollections = installFamilyCollectionStore(familyFrontend);
  const releaseMap = subscribeNativeFamilyMapSettings((map) =>
    useSettingsStore.setState(({ settings }) => ({ settings: { ...settings, ...map } }))
  );
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    releaseCollections();
    releaseMap();
    release.dispose();
    planner.dispose();
    privateCaches.dispose();
    plannerCaches.dispose();
    releaseDatabaseGuard();
    releaseSourceOwner();
    releaseOperations();
    releaseActor();
    authSubscription.data.subscription.unsubscribe();
    driver.disconnect();
    releasePreviews();
    if (window.fetch === frontendFetch) window.fetch = previousFetch;
    if (apiClient.defaults.adapter === adapter) apiClient.defaults.adapter = previousAdapter;
    if (uninstall === dispose) uninstall = undefined;
  };
  uninstall = dispose;
  return dispose;
}
