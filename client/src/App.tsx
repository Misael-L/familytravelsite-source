import React, { useEffect, ReactNode } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore, selectIsBlockedMembershipGate, selectIsFamilyMember, selectMayHydratePrivateFamily } from './store/authStore'
import { useSettingsStore } from './store/settingsStore'
import { applyAppearance } from './theme/applyAppearance'
import { useAddonStore } from './store/addonStore'
import { usePluginStore } from './store/pluginStore'
import PluginPage from './pages/PluginPage'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import RequestAccessPage from './pages/RequestAccessPage'
import DashboardPage from './pages/DashboardPage'
import TripPlannerPage from './pages/TripPlannerPage'
import FilesPage from './pages/FilesPage'
import AdminPage from './pages/AdminPage'
import SettingsPage from './pages/SettingsPage'
import VacayPage from './pages/VacayPage'
import HelpPage from './pages/HelpPage'
import AtlasPage from './pages/AtlasPage'
import JourneyPage from './pages/JourneyPage'
import JourneyDetailPage from './pages/JourneyDetailPage'
import CollectionsPage from './pages/CollectionsPage'
import JourneyPublicPage from './pages/JourneyPublicPage'
import SharedTripPage from './pages/SharedTripPage'
import JoinTripPage from './pages/JoinTripPage'
import InAppNotificationsPage from './pages/InAppNotificationsPage.tsx'
import OAuthAuthorizePage from './pages/OAuthAuthorizePage'
import { ToastContainer } from './components/shared/Toast'
import SaveToCollectionModal from './components/Collections/SaveToCollectionModal'
import BackgroundTasksWidget from './components/BackgroundTasks/BackgroundTasksWidget'
import BottomNav from './components/Layout/BottomNav'
import { TranslationProvider, useTranslation } from './i18n'
import { authApi } from './api/client'
import { usePermissionsStore, PermissionLevel } from './store/permissionsStore'
import { useInAppNotificationListener } from './hooks/useInAppNotificationListener.ts'
import { useFamilyFeatureStore } from './store/familyFeatureStore'
import type { FamilyFeatureKey } from './data/supabase/familyFeatures'
import FamilyFeatureUnavailable from './components/Layout/FamilyFeatureUnavailable'
import { useFamilyInboxRefresh } from './hooks/useFamilyInboxRefresh.ts'
import { registerSyncTriggers, unregisterSyncTriggers } from './sync/syncTriggers'
import OfflineBanner from './components/Layout/OfflineBanner'
import { SystemNoticeHost } from './components/SystemNotices/SystemNoticeHost.js'
import { isSupabaseDataPlane, onSupabaseAuthStateChange } from './data/supabase/auth'
import { canReviewFamilyAdmin } from './data/supabase/capabilities'
// Notice action registrations (side-effect imports):
import './pages/Trips/noticeActions.js'

interface ProtectedRouteProps {
  children: ReactNode
  adminRequired?: boolean
  addonId?: string
  familyFeature?: FamilyFeatureKey
}

function ProtectedRoute({ children, adminRequired = false, addonId, familyFeature }: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)
  const appRequireMfa = useAuthStore((s) => s.appRequireMfa)
  const membershipLoaded = useAuthStore((s) => s.membershipLoaded)
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin)
  const membershipRole = useAuthStore((s) => s.membershipRole)
  const membershipStatus = useAuthStore((s) => s.membershipStatus)
  const authGate = useAuthStore((s) => s.authGate)
  const addonStore = useAddonStore()
  const featureHydrated = useFamilyFeatureStore(s => s.hydrated)
  const featureEnabled = useFamilyFeatureStore(s => (familyFeature ? s.isEnabled(familyFeature) : true))
  const { t } = useTranslation()
  const location = useLocation()
  const supabasePlane = isSupabaseDataPlane()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div>
          <p className="text-slate-500 text-sm">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    const redirectParam = encodeURIComponent(location.pathname + location.search + location.hash)
    return <Navigate to={`/login?redirect=${redirectParam}`} replace />
  }

  if (supabasePlane) {
    if (!membershipLoaded || authGate == null) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div>
        </div>
      )
    }
    if (
      selectIsBlockedMembershipGate(authGate)
      || !selectIsFamilyMember({ isSuperAdmin, membershipRole, membershipStatus })
    ) {
      return <Navigate to="/request-access" replace />
    }
    if ((authGate === 'mfa_enroll' || authGate === 'mfa_challenge') && location.pathname !== '/settings') {
      return <Navigate to="/settings?mfa=required" replace />
    }
  }

  if (
    appRequireMfa &&
    user &&
    !user.mfa_enabled &&
    location.pathname !== '/settings'
  ) {
    return <Navigate to="/settings?mfa=required" replace />
  }

  if (adminRequired) {
    const familyReviewer = canReviewFamilyAdmin({ isSuperAdmin, membershipRole })
    const nestAdmin = user?.role === 'admin'
    if (supabasePlane ? !familyReviewer : !nestAdmin) {
      return <Navigate to="/dashboard" replace />
    }
  }

  if (!supabasePlane && addonId && addonStore.loaded && !addonStore.isEnabled(addonId)) {
    return <Navigate to="/dashboard" replace />
  }

  if (supabasePlane && familyFeature && !featureHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div>
      </div>
    )
  }

  if (supabasePlane && familyFeature && !featureEnabled) {
    return <FamilyFeatureUnavailable />
  }

  return (
    <div className="flex flex-col h-dvh md:block md:h-auto">
      <div className="flex-1 overflow-y-auto md:overflow-visible">{children}</div>
      <BottomNav />
    </div>
  )
}

function RootRedirect() {
  const { isAuthenticated, isLoading, isSuperAdmin, membershipRole, membershipLoaded, membershipStatus, authGate } = useAuthStore()
  const supabasePlane = isSupabaseDataPlane()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (supabasePlane) {
    if (!membershipLoaded || authGate == null) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin"></div>
        </div>
      )
    }
    if (
      selectIsBlockedMembershipGate(authGate)
      || !selectIsFamilyMember({ isSuperAdmin, membershipRole, membershipStatus })
    ) {
      return <Navigate to="/request-access" replace />
    }
    if (authGate === 'mfa_enroll' || authGate === 'mfa_challenge') {
      return <Navigate to="/settings?mfa=required" replace />
    }
  }

  return <Navigate to="/dashboard" replace />
}

export default function App() {
  const {
    loadUser,
    isAuthenticated,
    setDemoMode,
    setDevMode,
    setIsPrerelease,
    setAppVersion,
    setHasMapsKey,
    setServerTimezone,
    setAppRequireMfa,
    setTripRemindersEnabled,
    setPlacesPhotosEnabled,
    setPlacesAutocompleteEnabled,
    setPlacesDetailsEnabled,
  } = useAuthStore()
  const { loadSettings, hydrateSupabasePlaneSettings, hydrateFamilyPreferences } = useSettingsStore()
  const hydrateFamilyFeatures = useFamilyFeatureStore(s => s.hydrate)
  const resetFamilyFeatures = useFamilyFeatureStore(s => s.reset)
  const { loadAddons } = useAddonStore()
  const { loadPlugins } = usePluginStore()
  const location = useLocation()
  const supabasePlane = isSupabaseDataPlane()

  useEffect(() => {
    const path = location.pathname
    const isPublicAuth =
      path.startsWith('/shared/') ||
      path.startsWith('/public/') ||
      path.startsWith('/login') ||
      path.startsWith('/request-access') ||
      path.startsWith('/forgot-password') ||
      path.startsWith('/reset-password')

    if (!isPublicAuth) {
      const alreadyAuthenticated = useAuthStore.getState().isAuthenticated
      if (alreadyAuthenticated) {
        useAuthStore.setState({ isLoading: false })
        loadUser({ silent: true })
      } else {
        loadUser()
      }
    } else if (path.startsWith('/login') || path.startsWith('/request-access')) {
      if (supabasePlane && useAuthStore.getState().isAuthenticated) {
        useAuthStore.setState({ isLoading: false })
        loadUser({ silent: true })
      } else if (!useAuthStore.getState().isAuthenticated) {
        useAuthStore.setState({ isLoading: false })
      }
    }

    if (supabasePlane) {
      setDemoMode(false)
      setDevMode(false)
      setIsPrerelease(false)
      setAppVersion('family-travel-web')
      setTripRemindersEnabled(false)
      setPlacesPhotosEnabled(true)
      setPlacesAutocompleteEnabled(true)
      setPlacesDetailsEnabled(true)
      return
    }

    authApi.getAppConfig().then(async (config: {
      demo_mode?: boolean
      dev_mode?: boolean
      is_prerelease?: boolean
      has_maps_key?: boolean
      version?: string
      timezone?: string
      require_mfa?: boolean
      trip_reminders_enabled?: boolean
      places_photos_enabled?: boolean
      places_autocomplete_enabled?: boolean
      places_details_enabled?: boolean
      permissions?: Record<string, PermissionLevel>
    }) => {
      setDemoMode(!!config?.demo_mode)
      if (config?.dev_mode) setDevMode(true)
      if (config?.is_prerelease !== undefined) setIsPrerelease(config.is_prerelease)
      if (config?.version) setAppVersion(config.version)
      if (config?.has_maps_key !== undefined) setHasMapsKey(config.has_maps_key)
      if (config?.timezone) setServerTimezone(config.timezone)
      if (config?.require_mfa !== undefined) setAppRequireMfa(!!config.require_mfa)
      if (config?.trip_reminders_enabled !== undefined) setTripRemindersEnabled(config.trip_reminders_enabled)
      if (config?.places_photos_enabled !== undefined) setPlacesPhotosEnabled(config.places_photos_enabled)
      if (config?.places_autocomplete_enabled !== undefined) setPlacesAutocompleteEnabled(config.places_autocomplete_enabled)
      if (config?.places_details_enabled !== undefined) setPlacesDetailsEnabled(config.places_details_enabled)
      if (config?.permissions) usePermissionsStore.getState().setPermissions(config.permissions)

      if (config?.version) {
        const storedVersion = localStorage.getItem('trek_app_version')
        if (storedVersion && storedVersion !== config.version) {
          try {
            if ('caches' in window) {
              const names = await caches.keys()
              await Promise.all(names.map(n => caches.delete(n)))
            }
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations()
              await Promise.all(regs.map(r => r.unregister()))
            }
          } catch { /* ignore */ }
          localStorage.setItem('trek_app_version', config.version)
          window.location.reload()
          return
        }
        localStorage.setItem('trek_app_version', config.version)
      }
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount bootstrap
  }, [])

  useEffect(() => {
    if (!supabasePlane) return
    const { data: { subscription } } = onSupabaseAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'SIGNED_OUT') {
        void loadUser({ silent: true })
      }
    })
    return () => subscription.unsubscribe()
  }, [supabasePlane, loadUser])

  const { settings } = useSettingsStore()
  const familyId = useAuthStore(s => s.familyId)
  const authGate = useAuthStore(s => s.authGate)
  const mayHydratePrivateFamily = selectMayHydratePrivateFamily(authGate, supabasePlane)

  useInAppNotificationListener()
  useFamilyInboxRefresh()

  useEffect(() => {
    if (isAuthenticated) {
      if (supabasePlane) {
        hydrateSupabasePlaneSettings()
        return
      }
      loadSettings()
      loadAddons()
      loadPlugins()
    }
  }, [isAuthenticated, supabasePlane, loadSettings, hydrateSupabasePlaneSettings, loadAddons, loadPlugins])

  useEffect(() => {
    if (!supabasePlane || !isAuthenticated || !familyId || !mayHydratePrivateFamily) return
    void hydrateFamilyPreferences(familyId)
  }, [supabasePlane, isAuthenticated, familyId, mayHydratePrivateFamily, hydrateFamilyPreferences])

  useEffect(() => {
    if (!supabasePlane || !isAuthenticated || !familyId || !mayHydratePrivateFamily) {
      if (!isAuthenticated) resetFamilyFeatures()
      return
    }
    void hydrateFamilyFeatures(familyId)
  }, [supabasePlane, isAuthenticated, familyId, mayHydratePrivateFamily, hydrateFamilyFeatures, resetFamilyFeatures])

  useEffect(() => {
    if (supabasePlane) return
    registerSyncTriggers()
    return () => unregisterSyncTriggers()
  }, [supabasePlane])

  const isSharedPage = location.pathname.startsWith('/shared/')

  useEffect(() => {
    const run = () =>
      applyAppearance({
        darkMode: settings.dark_mode,
        appearance: settings.appearance,
        isSharedPage,
      })
    run()
    if (!isSharedPage && settings.dark_mode === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => run()
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [settings.dark_mode, settings.appearance, isSharedPage])

  const isAuthPage = location.pathname.startsWith('/login')
    || location.pathname.startsWith('/register')
    || location.pathname.startsWith('/forgot-password')
    || location.pathname.startsWith('/reset-password')
    || location.pathname.startsWith('/request-access')

  return (
    <TranslationProvider>
      {!isAuthPage && <SystemNoticeHost />}
      <ToastContainer />
      {!isAuthPage && !supabasePlane && <BackgroundTasksWidget />}
      {!isAuthPage && <SaveToCollectionModal />}
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/request-access" element={<RequestAccessPage />} />
        <Route path="/shared/:token" element={<SharedTripPage />} />
        <Route path="/public/journey/:token" element={<JourneyPublicPage />} />
        <Route path="/register" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/oauth/consent" element={<OAuthAuthorizePage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/join/:token"
          element={
            <ProtectedRoute>
              <JoinTripPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/help"
          element={
            <ProtectedRoute>
              <HelpPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/help/:slug"
          element={
            <ProtectedRoute>
              <HelpPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trips/:id"
          element={
            <ProtectedRoute>
              <TripPlannerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trips/:id/files"
          element={
            <ProtectedRoute>
              <FilesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminRequired>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/plugins/:pluginId"
          element={
            <ProtectedRoute>
              <PluginPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vacay"
          element={
            <ProtectedRoute familyFeature="vacay">
              <VacayPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/atlas"
          element={
            <ProtectedRoute>
              <AtlasPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/journey"
          element={
            <ProtectedRoute addonId="journey">
              <JourneyPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/journey/:id"
          element={
            <ProtectedRoute addonId="journey">
              <JourneyDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/collections"
          element={
            <ProtectedRoute addonId="collections" familyFeature="collections">
              <CollectionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/collections/:id"
          element={
            <ProtectedRoute addonId="collections" familyFeature="collections">
              <CollectionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <InAppNotificationsPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TranslationProvider>
  )
}
