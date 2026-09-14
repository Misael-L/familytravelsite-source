import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './store/authStore'
import { useSettingsStore } from './store/settingsStore'
import { useInAppNotificationStore } from './store/inAppNotificationStore'
import { resetAllStores } from '../tests/helpers/store'
import { buildUser, buildSettings } from '../tests/helpers/factories'

const { isSupabaseMock, getMyEffectiveFeatures, getMyEffectiveMapSettings } = vi.hoisted(() => ({
  isSupabaseMock: vi.fn(() => true),
  getMyEffectiveFeatures: vi.fn(),
  getMyEffectiveMapSettings: vi.fn(),
}))

vi.mock('./data/supabase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/supabase/auth')>()
  return { ...actual, isSupabaseDataPlane: isSupabaseMock }
})

vi.mock('./data/supabase/familyFeatures', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/supabase/familyFeatures')>()
  return { ...actual, getMyEffectiveFeatures }
})

vi.mock('./data/supabase/familyMaps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/supabase/familyMaps')>()
  return { ...actual, getMyEffectiveMapSettings }
})

vi.mock('./pages/LoginPage', () => ({ default: () => <div>Login</div> }))
vi.mock('./pages/DashboardPage', async () => {
  const { Link } = await import('react-router-dom')
  return {
    default: function DashboardPage() {
      return (
        <div>
          Dashboard
          <Link to="/shared/tok-1">open-shared</Link>
          <Link to="/public/journey/tok-2">open-journey</Link>
          <Link to="/dashboard">open-dashboard</Link>
        </div>
      )
    },
  }
})
vi.mock('./pages/SettingsPage', () => ({ default: () => <div>Settings</div> }))
vi.mock('./pages/RequestAccessPage', () => ({ default: () => <div>RequestAccess</div> }))
vi.mock('./pages/AdminPage', () => ({ default: () => <div>Admin</div> }))
vi.mock('./pages/SharedTripPage', async () => {
  const { Link } = await import('react-router-dom')
  return {
    default: function SharedTripPage() {
      return (
        <div>
          SharedTrip
          <Link to="/dashboard">back-dashboard</Link>
        </div>
      )
    },
  }
})
vi.mock('./pages/JourneyPublicPage', async () => {
  const { Link } = await import('react-router-dom')
  return {
    default: function JourneyPublicPage() {
      return (
        <div>
          PublicJourney
          <Link to="/dashboard">back-dashboard</Link>
        </div>
      )
    },
  }
})
vi.mock('./hooks/useInAppNotificationListener.ts', () => ({
  useInAppNotificationListener: vi.fn(),
}))

import App from './App'

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  )
}

function seedMember(overrides: Record<string, unknown> = {}) {
  useAuthStore.setState({
    isLoading: false,
    isAuthenticated: true,
    user: buildUser(),
    loadUser: vi.fn().mockResolvedValue(undefined),
    membershipLoaded: true,
    membershipRole: 'patriarch',
    membershipStatus: 'active',
    familyId: 'fam-1',
    personId: 'p-1',
    isSuperAdmin: false,
    authGate: 'ok',
    ...overrides,
  })
}

describe('ProtectedRoute — Family assurance gate', () => {
  beforeEach(() => {
    resetAllStores()
    vi.clearAllMocks()
    isSupabaseMock.mockReturnValue(true)
    useSettingsStore.setState({
      settings: buildSettings(),
      hydrateSupabasePlaneSettings: vi.fn(),
      hydrateFamilyPreferences: vi.fn().mockResolvedValue(undefined),
    })
    useInAppNotificationStore.setState({
      fetchUnreadCount: vi.fn().mockResolvedValue(undefined),
    })
    getMyEffectiveFeatures.mockResolvedValue({
      vacay: true,
      collections: true,
      'workspace.place_categories': true,
      journey: false,
    })
    getMyEffectiveMapSettings.mockResolvedValue({
      familyId: 'fam-1',
      personId: 'p-1',
      enabledOptionIds: ['osm'],
      defaultOptionId: 'osm',
      selectedOptionId: null,
      effectiveOptionId: 'osm',
      source: 'builtin',
      mapboxPublicToken: null,
      cartoApiKey: null,
      mapboxConfigured: false,
      cartoConfigured: false,
      credentialRevision: 0,
    })
  })

  it('keeps the MFA shell on /settings without private family hydration', async () => {
    const hydrateFamilyPreferences = vi.fn().mockResolvedValue(undefined)
    const fetchUnreadCount = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({ hydrateFamilyPreferences, hydrateSupabasePlaneSettings: vi.fn() })
    useInAppNotificationStore.setState({ fetchUnreadCount })
    seedMember({ authGate: 'mfa_enroll' })
    renderApp('/settings')
    await waitFor(() => expect(screen.getByText('Settings')).toBeInTheDocument())
    expect(hydrateFamilyPreferences).not.toHaveBeenCalled()
    expect(fetchUnreadCount).not.toHaveBeenCalled()
    expect(getMyEffectiveFeatures).not.toHaveBeenCalled()
    expect(getMyEffectiveMapSettings).not.toHaveBeenCalled()
  })

  it('hydrates private family data once bootstrap is ok', async () => {
    const hydrateFamilyPreferences = vi.fn().mockResolvedValue(undefined)
    const fetchUnreadCount = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({ hydrateFamilyPreferences, hydrateSupabasePlaneSettings: vi.fn() })
    useInAppNotificationStore.setState({ fetchUnreadCount })
    seedMember({ authGate: 'ok' })
    renderApp('/dashboard')
    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument())
    expect(hydrateFamilyPreferences).toHaveBeenCalledWith('fam-1')
    expect(fetchUnreadCount).toHaveBeenCalled()
    expect(getMyEffectiveFeatures).toHaveBeenCalledWith('fam-1')
    expect(getMyEffectiveMapSettings).toHaveBeenCalledWith('fam-1')
  })

  it('redirects unlinked members to request-access', async () => {
    seedMember({ authGate: 'unlinked' })
    renderApp('/dashboard')
    await waitFor(() => expect(screen.getByText('RequestAccess')).toBeInTheDocument())
  })

  it('waits for bootstrap when authGate is still null', () => {
    seedMember({ authGate: null, membershipLoaded: true })
    renderApp('/dashboard')
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('sends MFA sessions away from /admin onto the settings enroll path', async () => {
    seedMember({ authGate: 'mfa_challenge' })
    renderApp('/admin')
    await waitFor(() => expect(screen.getByText('Settings')).toBeInTheDocument())
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })

  it('shows a retry surface instead of a spinner when membership bootstrap fails', async () => {
    seedMember({
      authGate: null,
      membershipLoaded: false,
      authCheckFailed: true,
      isLoading: false,
    })
    renderApp('/dashboard')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    expect(screen.queryByText('Login')).not.toBeInTheDocument()
  })
})

describe('App — public map isolation', () => {
  beforeEach(() => {
    resetAllStores()
    vi.clearAllMocks()
    isSupabaseMock.mockReturnValue(true)
    useSettingsStore.setState({
      settings: buildSettings(),
      hydrateSupabasePlaneSettings: vi.fn(),
      hydrateFamilyPreferences: vi.fn().mockResolvedValue(undefined),
    })
    useInAppNotificationStore.setState({
      fetchUnreadCount: vi.fn().mockResolvedValue(undefined),
    })
    getMyEffectiveFeatures.mockResolvedValue({
      vacay: true,
      collections: true,
      'workspace.place_categories': true,
      journey: false,
    })
    getMyEffectiveMapSettings.mockResolvedValue({
      familyId: 'fam-1',
      personId: 'p-1',
      enabledOptionIds: ['osm'],
      defaultOptionId: 'osm',
      selectedOptionId: null,
      effectiveOptionId: 'osm',
      source: 'builtin',
      mapboxPublicToken: null,
      cartoApiKey: null,
      mapboxConfigured: false,
      cartoConfigured: false,
      credentialRevision: 0,
    })
    seedMember({ authGate: 'ok' })
  })

  it('does not call Family map RPCs on an authenticated shared trip', async () => {
    renderApp('/shared/tok-1')
    await waitFor(() => expect(screen.getByText('SharedTrip')).toBeInTheDocument())
    expect(getMyEffectiveMapSettings).not.toHaveBeenCalled()
  })

  it('does not call Family map RPCs on an authenticated public journey', async () => {
    renderApp('/public/journey/tok-2')
    await waitFor(() => expect(screen.getByText('PublicJourney')).toBeInTheDocument())
    expect(getMyEffectiveMapSettings).not.toHaveBeenCalled()
  })

  it('rehydrates Family maps after returning from a public share', async () => {
    const user = userEvent.setup()
    renderApp('/dashboard')
    await waitFor(() => expect(getMyEffectiveMapSettings).toHaveBeenCalledWith('fam-1'))
    getMyEffectiveMapSettings.mockClear()

    await user.click(screen.getByRole('link', { name: 'open-shared' }))
    await waitFor(() => expect(screen.getByText('SharedTrip')).toBeInTheDocument())
    expect(getMyEffectiveMapSettings).not.toHaveBeenCalled()

    await user.click(screen.getByRole('link', { name: 'back-dashboard' }))
    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument())
    await waitFor(() => expect(getMyEffectiveMapSettings).toHaveBeenCalledWith('fam-1'))
  })

  it('rehydrates Family maps after returning from a public journey', async () => {
    const user = userEvent.setup()
    renderApp('/dashboard')
    await waitFor(() => expect(getMyEffectiveMapSettings).toHaveBeenCalledWith('fam-1'))
    getMyEffectiveMapSettings.mockClear()

    await user.click(screen.getByRole('link', { name: 'open-journey' }))
    await waitFor(() => expect(screen.getByText('PublicJourney')).toBeInTheDocument())
    expect(getMyEffectiveMapSettings).not.toHaveBeenCalled()

    await user.click(screen.getByRole('link', { name: 'back-dashboard' }))
    await waitFor(() => expect(getMyEffectiveMapSettings).toHaveBeenCalledWith('fam-1'))
  })
})
