import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../../tests/helpers/render'
import { resetAllStores, seedStore } from '../../../tests/helpers/store'
import { useAuthStore } from '../../store/authStore'
import { buildUser } from '../../../tests/helpers/factories'
import { ToastContainer } from '../../components/shared/Toast'
import { notificationsApi } from '../../api/client'
import FamilyNotificationDefaultsManager from './FamilyNotificationDefaultsManager'

const { getDefaults, updateDefaults } = vi.hoisted(() => ({
  getDefaults: vi.fn(),
  updateDefaults: vi.fn(),
}))

vi.mock('../../data/supabase/familyNotifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/familyNotifications')>()
  return {
    ...actual,
    getFamilyNotificationDefaults: getDefaults,
    updateFamilyNotificationDefaults: updateDefaults,
  }
})

const snapshot = {
  familyId: 'fam-1',
  canManage: true,
  inAppMandatory: true as const,
  defaults: [{
    eventKey: 'proposal.created' as const,
    destinationKind: 'proposal' as const,
    displayOrder: 20,
    pushEnabled: true,
    source: 'catalog' as const,
  }],
  health: { activeIosDevices: 1 },
}

beforeEach(() => {
  resetAllStores()
  getDefaults.mockReset()
  updateDefaults.mockReset()
  getDefaults.mockResolvedValue(snapshot)
  updateDefaults.mockResolvedValue({ ...snapshot, defaults: [{ ...snapshot.defaults[0], pushEnabled: false, source: 'family' }] })
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

describe('FamilyNotificationDefaultsManager', () => {
  it('saves a push default without Nest calls', async () => {
    const nest = vi.spyOn(notificationsApi, 'getPreferences')
    render(<><ToastContainer /><FamilyNotificationDefaultsManager /></>)
    await screen.findByText('Family notifications')
    fireEvent.click(screen.getByRole('button', { pressed: true }))
    await waitFor(() => {
      expect(updateDefaults).toHaveBeenCalledWith('fam-1', { 'proposal.created': false })
    })
    expect(nest).not.toHaveBeenCalled()
    nest.mockRestore()
  })

  it('shows read-only copy for parents and does not write', async () => {
    getDefaults.mockResolvedValue({ ...snapshot, canManage: false })
    render(<FamilyNotificationDefaultsManager />)
    await screen.findByText(/view only/i)
    fireEvent.click(screen.getByRole('button', { pressed: true }))
    expect(updateDefaults).not.toHaveBeenCalled()
  })
})
