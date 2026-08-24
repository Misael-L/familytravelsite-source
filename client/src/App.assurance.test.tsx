import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './store/authStore'
import { useSettingsStore } from './store/settingsStore'
import { useInAppNotificationStore } from './store/inAppNotificationStore'
import { resetAllStores } from '../tests/helpers/store'
import { buildUser, buildSettings } from '../tests/helpers/factories'

const { isSupabaseMock, getMyEffectiveFeatures } = vi.hoisted(() => ({
  isSupabaseMock: vi.fn(() => true),
  getMyEffectiveFeatures: vi.fn(),
}))

vi.mock('./data/supabase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/supabase/auth')>()
  return { ...actual, isSupabaseDataPlane: isSupabaseMock }
})

vi.mock('./data/supabase/familyFeatures', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/supabase/familyFeatures')>()
  return { ...actual, getMyEffectiveFeatures }
})

vi.mock('./pages/LoginPage', () => ({ default: () => <div>Login</div> }))
vi.mock('./pages/DashboardPage', () => ({ default: () => <div>Dashboard</div> }))
vi.mock('./pages/SettingsPage', () => ({ default: () => <div>Settings</div> }))
vi.mock('./pages/RequestAccessPage', () => ({ default: () => <div>RequestAccess</div> }))
vi.mock('./pages/AdminPage', () => ({ default: () => <div>Admin</div> }))
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
})
