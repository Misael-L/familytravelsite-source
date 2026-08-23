import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../../tests/helpers/render'
import { resetAllStores, seedStore } from '../../../tests/helpers/store'
import { useAuthStore } from '../../store/authStore'
import { buildUser } from '../../../tests/helpers/factories'
import { ToastContainer } from '../../components/shared/Toast'
import { adminApi } from '../../api/client'
import FamilyIdentitySettingsManager from './FamilyIdentitySettingsManager'

const { getIdentity, getFilePolicy, linkPerson } = vi.hoisted(() => ({
  getIdentity: vi.fn(),
  getFilePolicy: vi.fn(),
  linkPerson: vi.fn(),
}))

vi.mock('../../data/supabase/familyIdentity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/familyIdentity')>()
  return {
    ...actual,
    getFamilyIdentityAssurance: getIdentity,
    getFamilyFilePolicy: getFilePolicy,
    linkFamilyMemberPerson: linkPerson,
  }
})

const identity = {
  familyId: 'fam-1',
  canManage: true,
  members: [{
    memberId: 'm1',
    userId: 'u-unlinked',
    personId: null,
    role: 'parent',
    status: 'active',
    emailConfirmed: true,
    personLinked: false,
    hasVerifiedTotp: false,
    reviewerMfaRequired: true,
    lastSignInAt: null,
    providers: ['email'],
  }],
  unlinkedPeople: [{ personId: 'p-2', displayName: 'Kid Lopez', hasRosterEmail: true }],
  pendingRequests: [],
}

const files = {
  familyId: 'fam-1',
  canManage: true,
  trashCount: 1,
  pendingCleanup: 0,
  deadLetters: 0,
  retentionDays: 30,
  tripFileMaxBytes: 50 * 1024 * 1024,
  avatarMaxBytes: 8 * 1024 * 1024,
  tripFileMime: ['application/pdf'],
  imageMime: ['image/jpeg'],
}

beforeEach(() => {
  resetAllStores()
  getIdentity.mockReset()
  getFilePolicy.mockReset()
  linkPerson.mockReset()
  getIdentity.mockResolvedValue(identity)
  getFilePolicy.mockResolvedValue(files)
  linkPerson.mockResolvedValue(undefined)
  seedStore(useAuthStore, {
    isAuthenticated: true,
    user: buildUser({ username: 'pat', role: 'user' }),
    familyId: 'fam-1',
    authUserId: 'auth-1',
    membershipRole: 'patriarch',
    isSuperAdmin: false,
    membershipLoaded: true,
  })
})

describe('FamilyIdentitySettingsManager', () => {
  it('links a roster person without Nest calls', async () => {
    const nest = vi.spyOn(adminApi, 'getPermissions')
    render(<><ToastContainer /><FamilyIdentitySettingsManager /></>)
    await screen.findByText('Identity and file policy')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p-2' } })
    fireEvent.click(screen.getByRole('button', { name: /link account/i }))
    await waitFor(() => {
      expect(linkPerson).toHaveBeenCalledWith({
        familyId: 'fam-1',
        personId: 'p-2',
        userId: 'u-unlinked',
      })
    })
    expect(nest).not.toHaveBeenCalled()
    nest.mockRestore()
  })

  it('shows read-only copy for parents and does not write', async () => {
    getIdentity.mockResolvedValue({ ...identity, canManage: false })
    render(<FamilyIdentitySettingsManager />)
    await screen.findByText(/view only/i)
    expect(screen.queryByRole('button', { name: /link account/i })).not.toBeInTheDocument()
    expect(linkPerson).not.toHaveBeenCalled()
  })
})
