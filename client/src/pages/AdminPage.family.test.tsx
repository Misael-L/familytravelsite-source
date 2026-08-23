const { isSupabaseMock, listMembers, listRequests, loadStats, listPolicies, listAudit, listTemplates, listCategories, getDefaults, getNotificationDefaults, getIdentity, getFilePolicy, listFeatureControls, listExportJobs } = vi.hoisted(() => ({
  isSupabaseMock: vi.fn(() => true),
  listMembers: vi.fn(),
  listRequests: vi.fn(),
  loadStats: vi.fn(),
  listPolicies: vi.fn(),
  listAudit: vi.fn(),
  listTemplates: vi.fn(),
  listCategories: vi.fn(),
  getDefaults: vi.fn(),
  getNotificationDefaults: vi.fn(),
  getIdentity: vi.fn(),
  getFilePolicy: vi.fn(),
  listFeatureControls: vi.fn(),
  listExportJobs: vi.fn(),
}))

vi.mock('../data/supabase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/auth')>()
  return { ...actual, isSupabaseDataPlane: isSupabaseMock }
})

vi.mock('../data/supabase/familyAdmin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/familyAdmin')>()
  return {
    ...actual,
    listFamilyAdminMembers: listMembers,
    listPendingAccessRequests: listRequests,
    loadFamilyAdminStats: loadStats,
  }
})

vi.mock('../components/Admin/CategoryManager', () => ({
  default: () => <div data-testid="category-manager" />,
}))

vi.mock('../components/Admin/PackingTemplateManager', () => ({
  default: () => <div data-testid="packing-template-manager" />,
}))

vi.mock('../data/supabase/familyPackingTemplates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/familyPackingTemplates')>()
  return {
    ...actual,
    listFamilyPackingTemplates: listTemplates,
  }
})

vi.mock('../data/supabase/familyPlaceCategories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/familyPlaceCategories')>()
  return {
    ...actual,
    listFamilyPlaceCategories: listCategories,
  }
})

vi.mock('../data/supabase/familyPreferences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/familyPreferences')>()
  return {
    ...actual,
    getFamilyPreferenceDefaults: getDefaults,
  }
})

vi.mock('../data/supabase/familyNotifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/familyNotifications')>()
  return {
    ...actual,
    getFamilyNotificationDefaults: getNotificationDefaults,
  }
})

vi.mock('../data/supabase/familyIdentity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/familyIdentity')>()
  return {
    ...actual,
    getFamilyIdentityAssurance: getIdentity,
    getFamilyFilePolicy: getFilePolicy,
  }
})

vi.mock('../data/supabase/familyPermissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/familyPermissions')>()
  return {
    ...actual,
    listFamilyPermissionPolicies: listPolicies,
    listFamilyAuditEvents: listAudit,
  }
})

vi.mock('../data/supabase/familyFeatures', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/familyFeatures')>()
  return {
    ...actual,
    listFamilyFeatureControls: listFeatureControls,
  }
})

vi.mock('../data/supabase/familyExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/familyExport')>()
  return {
    ...actual,
    listFamilyExportJobs: listExportJobs,
  }
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi, backupApi, categoriesApi } from '../api/client'
import { fireEvent, render, screen, waitFor } from '../../tests/helpers/render'
import { resetAllStores, seedStore } from '../../tests/helpers/store'
import { useAuthStore } from '../store/authStore'
import { buildUser } from '../../tests/helpers/factories'
import AdminPage from './AdminPage'

beforeEach(() => {
  resetAllStores()
  isSupabaseMock.mockReturnValue(true)
  listMembers.mockReset()
  listRequests.mockReset()
  loadStats.mockReset()
  listMembers.mockResolvedValue([
    {
      id: 'mem-1',
      userId: 'auth-1',
      personId: 'p-1',
      familyId: 'fam-1',
      displayName: 'Mom Lopez',
      email: 'mom@example.com',
      role: 'parent',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      avatarUrl: null,
    },
  ])
  listRequests.mockResolvedValue([])
  loadStats.mockResolvedValue({ totalUsers: 1, totalTrips: 2, totalPlaces: 3, totalFiles: 0 })
  listPolicies.mockResolvedValue({ familyId: 'fam-1', canManage: false, policies: [] })
  listAudit.mockResolvedValue({ events: [], nextCursor: null })
  listTemplates.mockReset()
  listTemplates.mockResolvedValue({ familyId: 'fam-1', canManage: true, templates: [] })
  listCategories.mockReset()
  listCategories.mockResolvedValue({ familyId: 'fam-1', canManage: true, categories: [] })
  getDefaults.mockReset()
  getDefaults.mockResolvedValue({
    familyId: 'fam-1',
    canManage: false,
    defaults: {
      temperatureUnit: null,
      distanceUnit: null,
      timeFormat: null,
      displayCurrency: null,
    },
  })
  getNotificationDefaults.mockReset()
  getNotificationDefaults.mockResolvedValue({
    familyId: 'fam-1',
    canManage: false,
    inAppMandatory: true,
    defaults: [],
    health: { activeIosDevices: 0 },
  })
  getIdentity.mockReset()
  getIdentity.mockResolvedValue({
    familyId: 'fam-1',
    canManage: false,
    members: [{
      memberId: 'mem-1',
      userId: 'auth-1',
      personId: 'p-1',
      role: 'parent',
      status: 'active',
      emailConfirmed: true,
      personLinked: true,
      hasVerifiedTotp: false,
      reviewerMfaRequired: true,
      lastSignInAt: null,
      providers: ['email'],
    }],
    unlinkedPeople: [],
    pendingRequests: [],
  })
  getFilePolicy.mockReset()
  getFilePolicy.mockResolvedValue({
    familyId: 'fam-1',
    canManage: false,
    trashCount: 0,
    pendingCleanup: 0,
    deadLetters: 0,
    retentionDays: 30,
    tripFileMaxBytes: 50 * 1024 * 1024,
    avatarMaxBytes: 8 * 1024 * 1024,
    tripFileMime: ['application/pdf'],
    imageMime: ['image/jpeg'],
  })
  listFeatureControls.mockReset()
  listFeatureControls.mockResolvedValue({
    familyId: 'fam-1',
    canManage: false,
    isSuperAdmin: false,
    controls: [],
  })
  listExportJobs.mockReset()
  listExportJobs.mockResolvedValue({
    familyId: 'fam-1',
    canManage: false,
    jobs: [],
  })
  seedStore(useAuthStore, {
    isAuthenticated: true,
    user: buildUser({ username: 'mom', role: 'user' }),
    familyId: 'fam-1',
    authUserId: 'auth-1',
    membershipRole: 'parent',
    isSuperAdmin: false,
    membershipLoaded: true,
  })
})

describe('AdminPage Family plane', () => {
  it('loads Family data without calling Nest Admin endpoints', async () => {
    const nestSpies = [
      vi.spyOn(adminApi, 'users'),
      vi.spyOn(adminApi, 'getBagTracking'),
      vi.spyOn(adminApi, 'getPlacesPhotos'),
      vi.spyOn(adminApi, 'getPlacesAutocomplete'),
      vi.spyOn(adminApi, 'getPlacesDetails'),
      vi.spyOn(adminApi, 'getCollabFeatures'),
      vi.spyOn(adminApi, 'getPermissions'),
      vi.spyOn(adminApi, 'getDefaultUserSettings'),
      vi.spyOn(categoriesApi, 'list'),
    ]
    render(<AdminPage />)
    await waitFor(() => {
      expect(screen.getByText('Mom Lopez')).toBeInTheDocument()
    })
    expect(listMembers).toHaveBeenCalled()
    for (const spy of nestSpies) expect(spy).not.toHaveBeenCalled()
    expect(screen.getByText('Family permissions')).toBeInTheDocument()
    expect(listPolicies).toHaveBeenCalledWith('fam-1')
    for (const spy of nestSpies) spy.mockRestore()
  })

  it('hides instance tabs (Addons, Backup, GitHub)', async () => {
    render(<AdminPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^users$/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /^addons$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^backup$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^export$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^audit$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^features$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^github$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /personalization/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /user defaults/i })).toBeInTheDocument()
  })

  it('opens Family export without Nest backup calls', async () => {
    const backupList = vi.spyOn(backupApi, 'list')
    render(<AdminPage />)
    await screen.findByText('Mom Lopez')
    fireEvent.click(screen.getByRole('button', { name: /^export$/i }))
    expect(await screen.findByText('Family data export')).toBeInTheDocument()
    expect(listExportJobs).toHaveBeenCalledWith('fam-1')
    expect(backupList).not.toHaveBeenCalled()
    backupList.mockRestore()
  })

  it('shows explicit deferred copy without mounting Nest managers', async () => {
    const nestCategories = vi.spyOn(categoriesApi, 'list')
    render(<AdminPage />)
    await screen.findByText('Mom Lopez')

    fireEvent.click(screen.getByRole('button', { name: /personalization/i }))
    expect(await screen.findByText('Packing Templates')).toBeInTheDocument()
    expect(await screen.findByText('Categories')).toBeInTheDocument()
    expect(screen.queryByTestId('packing-template-manager')).not.toBeInTheDocument()
    expect(screen.queryByTestId('category-manager')).not.toBeInTheDocument()
    expect(listTemplates).toHaveBeenCalledWith('fam-1')
    expect(listCategories).toHaveBeenCalledWith('fam-1')
    expect(nestCategories).not.toHaveBeenCalled()
    nestCategories.mockRestore()
    expect(screen.queryByText(/Family surface is planned/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /user defaults/i }))
    expect(await screen.findByText('Family defaults')).toBeInTheDocument()
    expect(getDefaults).toHaveBeenCalledWith('fam-1')
    expect(screen.queryByText(/Family surface is planned/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^settings$/i }))
    expect(await screen.findByText('Identity and file policy')).toBeInTheDocument()
    expect(getIdentity).toHaveBeenCalledWith('fam-1')
    expect(getFilePolicy).toHaveBeenCalledWith('fam-1')
    expect(screen.getByText(/View only/i)).toBeInTheDocument()
    expect(screen.queryByText(/Family surface is planned/i)).not.toBeInTheDocument()

    const notificationButtons = screen.getAllByRole('button', { name: /^notifications$/i })
    fireEvent.click(notificationButtons[notificationButtons.length - 1])
    expect(await screen.findByText('Family notifications')).toBeInTheDocument()
    expect(getNotificationDefaults).toHaveBeenCalledWith('fam-1')
    expect(screen.queryByText(/Family surface is planned/i)).not.toBeInTheDocument()
  })

  it('opens Family product audit without Nest audit', async () => {
    const nestAudit = vi.spyOn(adminApi, 'auditLog')
    render(<AdminPage />)
    await screen.findByText('Mom Lopez')
    fireEvent.click(screen.getByRole('button', { name: /^audit$/i }))
    expect(await screen.findByText('Family product audit')).toBeInTheDocument()
    expect(listAudit).toHaveBeenCalled()
    expect(nestAudit).not.toHaveBeenCalled()
    nestAudit.mockRestore()
  })
})
