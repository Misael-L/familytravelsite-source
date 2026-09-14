import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './store/authStore'
import { useAddonStore } from './store/addonStore'
import { useSettingsStore } from './store/settingsStore'
import { resetAllStores } from '../tests/helpers/store'
import { buildUser, buildSettings } from '../tests/helpers/factories'

const { isSupabaseMock } = vi.hoisted(() => ({
  isSupabaseMock: vi.fn(() => true),
}))

vi.mock('./data/supabase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/supabase/auth')>()
  return { ...actual, isSupabaseDataPlane: isSupabaseMock }
})

vi.mock('./pages/LoginPage', () => ({ default: () => <div>Login</div> }))
vi.mock('./pages/DashboardPage', () => ({ default: () => <div>Dashboard</div> }))
vi.mock('./pages/CollectionsPage', () => ({ default: () => <div>CollectionsPage</div> }))
vi.mock('./pages/SettingsPage', () => ({ default: () => <div>Settings</div> }))
vi.mock('./pages/VacayPage', () => ({ default: () => <div>Vacay</div> }))
vi.mock('./pages/RequestAccessPage', () => ({ default: () => <div>RequestAccess</div> }))
vi.mock('./components/Collections/SaveToCollectionModal', () => ({
  default: () => <div data-testid="save-to-collection-modal" />,
}))
vi.mock('./hooks/useInAppNotificationListener.ts', () => ({
  useInAppNotificationListener: vi.fn(),
}))
vi.mock('./api/websocket', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/websocket')>()
  return {
    ...actual,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    setPreReconnectHook: vi.fn(),
    setRefetchCallback: vi.fn(),
    getSocketId: vi.fn(() => null),
  }
})

import App from './App'

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  )
}

describe('ProtectedRoute — collections addon gate', () => {
  beforeEach(() => {
    resetAllStores()
    vi.clearAllMocks()
    useAuthStore.setState({
      isLoading: false,
      isAuthenticated: true,
      user: buildUser(),
      loadUser: vi.fn().mockResolvedValue(undefined),
      membershipLoaded: true,
      membershipRole: 'parent',
      membershipStatus: 'active',
      authGate: 'ok',
      familyId: 'fam-1',
      personId: 'p1',
      isSuperAdmin: false,
    })
    useSettingsStore.setState({ settings: buildSettings(), loadSettings: vi.fn().mockResolvedValue(undefined) })
    useAddonStore.setState({ loaded: true, addons: [], bagTracking: false })
  })

  it('does not bounce /collections on the Family plane when Nest addons never loaded', async () => {
    isSupabaseMock.mockReturnValue(true)
    renderApp('/collections')
    await waitFor(() => expect(screen.getByText('CollectionsPage')).toBeInTheDocument())
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('mounts the list picker on the Family plane', async () => {
    isSupabaseMock.mockReturnValue(true)
    renderApp('/collections')
    await waitFor(() => expect(screen.getByTestId('save-to-collection-modal')).toBeInTheDocument())
  })

  it('bounces /collections to the dashboard on Nest when the collections addon is off', async () => {
    isSupabaseMock.mockReturnValue(false)
    renderApp('/collections')
    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument())
    expect(screen.queryByText('CollectionsPage')).not.toBeInTheDocument()
  })
})
