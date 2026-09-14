import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../../tests/helpers/render'
import { resetAllStores } from '../../../tests/helpers/store'
import { useAuthStore } from '../../store/authStore'
import { buildUser } from '../../../tests/helpers/factories'
import { ToastContainer } from '../../components/shared/Toast'
import FamilyFeatureControlsManager from './FamilyFeatureControlsManager'
import type { FamilyFeatureControls } from '../../data/supabase/familyFeatures'

const { listControls, updateOverrides, updateRollout, listEvents } = vi.hoisted(() => ({
  listControls: vi.fn(),
  updateOverrides: vi.fn(),
  updateRollout: vi.fn(),
  listEvents: vi.fn(),
}))

vi.mock('../../data/supabase/familyFeatures', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/familyFeatures')>()
  return {
    ...actual,
    listFamilyFeatureControls: listControls,
    updateFamilyFeatureOverrides: updateOverrides,
    updateFeatureRollout: updateRollout,
    listFeatureRolloutEvents: listEvents,
  }
})

const hofSnapshot: FamilyFeatureControls = {
  familyId: 'fam-1',
  canManage: true,
  isSuperAdmin: false,
  controls: [{
    key: 'vacay',
    group: 'product',
    displayOrder: 10,
    familyConfigurable: true,
    catalogDefault: true,
    platforms: ['web', 'ios'],
    rolloutState: 'enabled',
    familyOverride: null,
    familyMode: 'inherit',
    effectiveEnabled: true,
  }],
}

const parentSnapshot: FamilyFeatureControls = { ...hofSnapshot, canManage: false }

beforeEach(() => {
  resetAllStores()
  listControls.mockReset()
  updateOverrides.mockReset()
  updateRollout.mockReset()
  listEvents.mockReset()
  useAuthStore.setState({
    user: buildUser({ role: 'admin' }),
    isAuthenticated: true,
    familyId: 'fam-1',
    isSuperAdmin: false,
  })
})

describe('FamilyFeatureControlsManager', () => {
  it('lets HOF change family mode and does not show global rollout', async () => {
    listControls.mockResolvedValue(hofSnapshot)
    updateOverrides.mockResolvedValue({
      ...hofSnapshot,
      controls: [{ ...hofSnapshot.controls[0], familyMode: 'disabled', familyOverride: false, effectiveEnabled: false }],
    })
    render(
      <>
        <FamilyFeatureControlsManager />
        <ToastContainer />
      </>,
    )
    expect(await screen.findByText('Family features')).toBeInTheDocument()
    expect(screen.queryByText('Product rollout')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'disabled' } })
    await waitFor(() => {
      expect(updateOverrides).toHaveBeenCalledWith('fam-1', { vacay: false })
    })
  })

  it('keeps parents read-only', async () => {
    listControls.mockResolvedValue(parentSnapshot)
    render(<FamilyFeatureControlsManager />)
    expect(await screen.findByText(/view only/i)).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})
