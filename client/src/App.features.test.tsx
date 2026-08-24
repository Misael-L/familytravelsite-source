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
vi.mock('./pages/VacayPage', () => ({ default: () => <div>VacayPage</div> }))
vi.mock('./pages/CollectionsPage', () => ({ default: () => <div>CollectionsPage</div> }))
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

function seedMember() {
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
  })
}

describe('ProtectedRoute — family feature gates', () => {
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
  })

  it('shows a localized unavailable state for a disabled Vacay deep link', async () => {
    getMyEffectiveFeatures.mockResolvedValue({
      vacay: false,
      collections: true,
      'workspace.place_categories': true,
    })
    seedMember()
    renderApp('/vacay')
    expect(await screen.findByText(/isn’t available for your family/i)).toBeInTheDocument()
    expect(screen.queryByText('VacayPage')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to my trips/i })).toHaveAttribute('href', '/dashboard')
  })

  it('shows a localized unavailable state for a disabled Collections deep link', async () => {
    getMyEffectiveFeatures.mockResolvedValue({
      vacay: true,
      collections: false,
      'workspace.place_categories': true,
    })
    seedMember()
    renderApp('/collections')
    expect(await screen.findByText(/isn’t available for your family/i)).toBeInTheDocument()
    expect(screen.queryByText('CollectionsPage')).not.toBeInTheDocument()
  })

  it('keeps Vacay mounted when the feature stays default-on', async () => {
    getMyEffectiveFeatures.mockResolvedValue({
      vacay: true,
      collections: true,
      'workspace.place_categories': true,
    })
    seedMember()
    renderApp('/vacay')
    await waitFor(() => expect(screen.getByText('VacayPage')).toBeInTheDocument())
  })
})
