import React, { useEffect, ReactNode, Suspense } from 'react'
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
import FilesPage from './pages/FilesPage'
import HelpPage from './pages/HelpPage'
import JourneyPublicPage from './pages/JourneyPublicPage'
import SharedTripPage from './pages/SharedTripPage'
import JoinTripPage from './pages/JoinTripPage'
import InAppNotificationsPage from './pages/InAppNotificationsPage.tsx'
import OAuthAuthorizePage from './pages/OAuthAuthorizePage'
import { PageLoadingSurface } from './components/shared/PageLoadingSurface'
import { PageLoadFailed } from './components/shared/PageLoadFailed'
import RouteErrorBoundary from './components/Layout/RouteErrorBoundary'
import { lazyWithRetry } from './utils/lazyWithRetry'
import { ToastContainer } from './components/shared/Toast'
import SaveToCollectionModal from './components/Collections/SaveToCollectionModal'
import BackgroundTasksWidget from './components/BackgroundTasks/BackgroundTasksWidget'
import BottomNav from './components/Layout/BottomNav'
import { TranslationProvider, useTranslation } from './i18n'
import { useInAppNotificationListener } from './hooks/useInAppNotificationListener.ts'
import { useFamilyFeatureStore } from './store/familyFeatureStore'
import { useFamilyMapStore } from './store/familyMapStore'
import type { FamilyFeatureKey } from './data/supabase/familyFeatures'
import FamilyFeatureUnavailable from './components/Layout/FamilyFeatureUnavailable'
import { useFamilyInboxRefresh } from './hooks/useFamilyInboxRefresh.ts'
import { registerSyncTriggers, unregisterSyncTriggers } from './sync/syncTriggers'
import OfflineBanner from './components/Layout/OfflineBanner'
import { SystemNoticeHost } from './components/SystemNotices/SystemNoticeHost.js'
import { isSupabaseDataPlane, onSupabaseAuthStateChange } from './data/supabase/auth'
import { canReviewFamilyAdmin } from './data/supabase/capabilities'
import { isPublicMapIsolatedPath } from './utils/publicMapRoutes'
import { useAppStartup } from './startup/useAppStartup'
import { retryStartupAt } from './startup/coordinator'
import { selectStartupGate } from './startup/selectStartupGate'
import PwaLifecycle from './startup/PwaLifecycle'
// Notice action registrations (side-effect imports):
import './pages/Trips/noticeActions.js'

const TripPlannerPage = lazyWithRetry(() => import('./pages/TripPlannerPage'))
const AdminPage = lazyWithRetry(() => import('./pages/AdminPage'))
const SettingsPage = lazyWithRetry(() => import('./pages/SettingsPage'))
const VacayPage = lazyWithRetry(() => import('./pages/VacayPage'))
const AtlasPage = lazyWithRetry(() => import('./pages/AtlasPage'))
const JourneyPage = lazyWithRetry(() => import('./pages/JourneyPage'))
const JourneyDetailPage = lazyWithRetry(() => import('./pages/JourneyDetailPage'))
const CollectionsPage = lazyWithRetry(() => import('./pages/CollectionsPage'))

interface ProtectedRouteProps {
  children: ReactNode
  adminRequired?: boolean
  addonId?: string
  familyFeature?: FamilyFeatureKey
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoadingSurface />}>{children}</Suspense>
}

function StartupRecovery({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  return (
    <PageLoadFailed
      title={offline ? t('common.startupOfflineTitle') : t('common.startupFailedTitle')}
      body={offline ? t('common.startupOfflineBody') : t('common.startupFailedBody')}
      onRetry={onRetry}
    />
  )
}

function ProtectedRoute({ children, adminRequired = false, addonId, familyFeature }: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)
  const authCheckFailed = useAuthStore((s) => s.authCheckFailed)
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
  const startupGate = selectStartupGate(
    { isLoading, isAuthenticated, authCheckFailed, membershipLoaded, authGate },
    supabasePlane,
  )

  if (startupGate === 'recovery') {
    return <StartupRecovery onRetry={() => retryStartupAt(location.pathname)} />
  }

  if (startupGate === 'loading') {
    return <PageLoadingSurface label={t('common.loading')} />
  }

  if (!isAuthenticated) {
    const redirectParam = encodeURIComponent(location.pathname + location.search + location.hash)
    return <Navigate to={`/login?redirect=${redirectParam}`} replace />
  }

  if (supabasePlane) {
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
    return <PageLoadingSurface />
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
  const { isAuthenticated, isLoading, isSuperAdmin, membershipRole, membershipLoaded, membershipStatus, authGate, authCheckFailed } = useAuthStore()
  const supabasePlane = isSupabaseDataPlane()
  const location = useLocation()
  const startupGate = selectStartupGate(
    { isLoading, isAuthenticated, authCheckFailed, membershipLoaded, authGate },
    supabasePlane,
  )

  if (startupGate === 'recovery') {
    return <StartupRecovery onRetry={() => retryStartupAt(location.pathname)} />
  }

  if (startupGate === 'loading') {
    return <PageLoadingSurface />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (supabasePlane) {
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
  const { loadUser, isAuthenticated } = useAuthStore()
  const { loadSettings, hydrateSupabasePlaneSettings, hydrateFamilyPreferences } = useSettingsStore()
  const hydrateFamilyFeatures = useFamilyFeatureStore(s => s.hydrate)
  const resetFamilyFeatures = useFamilyFeatureStore(s => s.reset)
  const hydrateFamilyMaps = useFamilyMapStore(s => s.hydrate)
  const resetFamilyMaps = useFamilyMapStore(s => s.reset)
  const { loadAddons } = useAddonStore()
  const { loadPlugins } = usePluginStore()
  const location = useLocation()
  const isolatePublicMaps = isPublicMapIsolatedPath(location.pathname)
  const supabasePlane = isSupabaseDataPlane()
  useAppStartup()

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
    if (isolatePublicMaps) return
    if (!supabasePlane || !isAuthenticated || !familyId || !mayHydratePrivateFamily) {
      if (!isAuthenticated) resetFamilyMaps()
      return
    }
    void hydrateFamilyMaps(familyId)
  }, [
    isolatePublicMaps,
    supabasePlane,
    isAuthenticated,
    familyId,
    mayHydratePrivateFamily,
    hydrateFamilyMaps,
    resetFamilyMaps,
  ])

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
      <PwaLifecycle />
      <RouteErrorBoundary>
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
              <LazyRoute>
                <TripPlannerPage />
              </LazyRoute>
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
              <LazyRoute>
                <AdminPage />
              </LazyRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <LazyRoute>
                <SettingsPage />
              </LazyRoute>
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
              <LazyRoute>
                <VacayPage />
              </LazyRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/atlas"
          element={
            <ProtectedRoute>
              <LazyRoute>
                <AtlasPage />
              </LazyRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/journey"
          element={
            <ProtectedRoute addonId="journey" familyFeature="journey">
              <LazyRoute>
                <JourneyPage />
              </LazyRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/journey/:id"
          element={
            <ProtectedRoute addonId="journey" familyFeature="journey">
              <LazyRoute>
                <JourneyDetailPage />
              </LazyRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/collections"
          element={
            <ProtectedRoute addonId="collections" familyFeature="collections">
              <LazyRoute>
                <CollectionsPage />
              </LazyRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/collections/:id"
          element={
            <ProtectedRoute addonId="collections" familyFeature="collections">
              <LazyRoute>
                <CollectionsPage />
              </LazyRoute>
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
      </RouteErrorBoundary>
    </TranslationProvider>
  )
}
