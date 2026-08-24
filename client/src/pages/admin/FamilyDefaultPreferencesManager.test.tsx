import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../../tests/helpers/render'
import { resetAllStores, seedStore } from '../../../tests/helpers/store'
import { useAuthStore } from '../../store/authStore'
import { buildUser } from '../../../tests/helpers/factories'
import { ToastContainer } from '../../components/shared/Toast'
import FamilyDefaultPreferencesManager from './FamilyDefaultPreferencesManager'

const { getDefaults, updateDefaults } = vi.hoisted(() => ({
  getDefaults: vi.fn(),
  updateDefaults: vi.fn(),
}))

vi.mock('../../data/supabase/familyPreferences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/familyPreferences')>()
  return {
    ...actual,
    getFamilyPreferenceDefaults: getDefaults,
    updateFamilyPreferenceDefaults: updateDefaults,
  }
})

beforeEach(() => {
  resetAllStores()
  getDefaults.mockReset()
  updateDefaults.mockReset()
  getDefaults.mockResolvedValue({
    familyId: 'fam-1',
    canManage: true,
    defaults: {
      temperatureUnit: null,
      distanceUnit: null,
      timeFormat: null,
      displayCurrency: null,
    },
  })
  updateDefaults.mockResolvedValue({
    familyId: 'fam-1',
    canManage: true,
    defaults: {
      temperatureUnit: 'fahrenheit',
      distanceUnit: null,
      timeFormat: null,
      displayCurrency: null,
    },
  })
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

describe('FamilyDefaultPreferencesManager', () => {
  it('saves a portable default without Nest calls', async () => {
    render(<><ToastContainer /><FamilyDefaultPreferencesManager /></>)
    await screen.findByText('Family defaults')
    fireEvent.click(screen.getByRole('button', { name: /fahrenheit/i }))
    await waitFor(() => {
      expect(updateDefaults).toHaveBeenCalledWith('fam-1', { temperatureUnit: 'fahrenheit' })
    })
    await screen.findByText('Family default saved')
  })

  it('shows read-only copy for parents and does not write', async () => {
    getDefaults.mockResolvedValue({
      familyId: 'fam-1',
      canManage: false,
      defaults: {
        temperatureUnit: 'celsius',
        distanceUnit: 'metric',
        timeFormat: '24h',
        displayCurrency: null,
      },
    })
    render(<FamilyDefaultPreferencesManager />)
    await screen.findByText(/view only/i)
    fireEvent.click(screen.getByRole('button', { name: /fahrenheit/i }))
    expect(updateDefaults).not.toHaveBeenCalled()
  })
})
