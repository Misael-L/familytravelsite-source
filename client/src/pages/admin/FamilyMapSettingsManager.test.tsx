import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../../tests/helpers/render'
import { resetAllStores, seedStore } from '../../../tests/helpers/store'
import { useAuthStore } from '../../store/authStore'
import { buildUser } from '../../../tests/helpers/factories'
import { ToastContainer } from '../../components/shared/Toast'
import FamilyMapSettingsManager from './FamilyMapSettingsManager'

const { getSettings, updateSettings } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}))

vi.mock('../../data/supabase/familyMaps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/familyMaps')>()
  return {
    ...actual,
    getFamilyMapSettings: getSettings,
    updateFamilyMapSettings: updateSettings,
    getMyEffectiveMapSettings: vi.fn().mockResolvedValue({
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
    }),
  }
})

vi.mock('../../components/Map/MapView', () => ({
  MapView: () => <div data-testid="map-view" />,
}))

vi.mock('../../components/Settings/MapboxPreview', () => ({
  default: () => <div data-testid="gl-preview" />,
}))

const snapshot = {
  familyId: 'fam-1',
  canManage: true,
  mapboxPublicToken: null,
  cartoApiKey: null,
  mapboxConfigured: false,
  cartoConfigured: false,
  enabledOptionIds: ['osm'],
  defaultOptionId: 'osm',
  credentialRevision: 0,
  updatedAt: null,
}

beforeEach(() => {
  resetAllStores()
  getSettings.mockReset()
  updateSettings.mockReset()
  getSettings.mockResolvedValue(snapshot)
  updateSettings.mockResolvedValue({
    ...snapshot,
    enabledOptionIds: ['osm', 'osm-de'],
    defaultOptionId: 'osm',
  })
  seedStore(useAuthStore, {
    isAuthenticated: true,
    user: buildUser({ username: 'pat', role: 'user' }),
    familyId: 'fam-1',
    personId: 'p-1',
    authUserId: 'auth-1',
    membershipRole: 'patriarch',
    isSuperAdmin: false,
    membershipLoaded: true,
  })
})

describe('FamilyMapSettingsManager', () => {
  it('enables a named option without Nest calls or raw key fields on load', async () => {
    render(<><ToastContainer /><FamilyMapSettingsManager /></>)
    await screen.findByRole('heading', { name: 'Family maps' })
    expect(screen.queryByPlaceholderText(/openstreetmap/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'OpenStreetMap DE' }))
    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith('fam-1', {
        enabledOptionIds: ['osm', 'osm-de'],
        defaultOptionId: 'osm',
      })
    })
    await screen.findByText('Family maps saved')
  })

  it('clears a Mapbox key together with dependent enabled options', async () => {
    getSettings.mockResolvedValue({
      ...snapshot,
      mapboxConfigured: true,
      mapboxPublicToken: 'pk.phase47fixturemapbox',
      enabledOptionIds: ['osm', 'mapbox-standard'],
      defaultOptionId: 'mapbox-standard',
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<><ToastContainer /><FamilyMapSettingsManager /></>)
    await screen.findByRole('heading', { name: 'Family maps' })
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith('fam-1', {
        mapboxPublicToken: null,
        enabledOptionIds: ['osm'],
        defaultOptionId: 'osm',
      })
    })
  })

  it('shows read-only copy for parents and does not write', async () => {
    getSettings.mockResolvedValue({ ...snapshot, canManage: false })
    render(<FamilyMapSettingsManager />)
    await screen.findByText(/view only/i)
    expect(screen.getByRole('checkbox', { name: 'OpenStreetMap' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'OpenStreetMap DE' }))
    expect(updateSettings).not.toHaveBeenCalled()
  })
})
