import { beforeEach, describe, expect, it, vi } from 'vitest'
import { builtinEffectiveMapSettings } from '../data/supabase/familyMaps'
import { resetAllStores, seedStore } from '../../tests/helpers/store'
import { useAuthStore } from './authStore'
import { useFamilyMapStore } from './familyMapStore'

const { getEffective, updateMine, clearTiles } = vi.hoisted(() => ({
  getEffective: vi.fn(),
  updateMine: vi.fn(),
  clearTiles: vi.fn(),
}))

vi.mock('../data/supabase/familyMaps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/familyMaps')>()
  return {
    ...actual,
    getMyEffectiveMapSettings: getEffective,
    updateMyMapPreference: updateMine,
  }
})

vi.mock('../sync/tilePrefetcher', () => ({
  clearTileCache: (...args: unknown[]) => clearTiles(...args),
}))

function osmSettings(familyId = 'fam-1') {
  return builtinEffectiveMapSettings(familyId, 'p-1')
}

describe('familyMapStore', () => {
  beforeEach(() => {
    resetAllStores()
    localStorage.clear()
    getEffective.mockReset()
    updateMine.mockReset()
    clearTiles.mockReset()
    seedStore(useAuthStore, { familyId: 'fam-1', personId: 'p-1', isAuthenticated: true })
  })

  it('hydrates the effective Family map config', async () => {
    getEffective.mockResolvedValue({
      ...osmSettings(),
      effectiveOptionId: 'osm-de',
      source: 'family',
      enabledOptionIds: ['osm', 'osm-de'],
      defaultOptionId: 'osm-de',
    })
    await useFamilyMapStore.getState().hydrate('fam-1')
    expect(useFamilyMapStore.getState().settings?.effectiveOptionId).toBe('osm-de')
    expect(useFamilyMapStore.getState().hydrated).toBe(true)
  })

  it('ignores a late hydrate from a previous family', async () => {
    let finishFirst: ((value: unknown) => void) | undefined
    getEffective
      .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }))
      .mockResolvedValueOnce({
        ...osmSettings('fam-2'),
        familyId: 'fam-2',
        effectiveOptionId: 'osm-de',
        source: 'family',
      })
    const first = useFamilyMapStore.getState().hydrate('fam-1')
    useAuthStore.setState({ familyId: 'fam-2', personId: 'p-1' })
    const second = useFamilyMapStore.getState().hydrate('fam-2')
    finishFirst?.({
      ...osmSettings('fam-1'),
      effectiveOptionId: 'carto-light',
      source: 'member',
    })
    await Promise.all([first, second])
    expect(useFamilyMapStore.getState().familyId).toBe('fam-2')
    expect(useFamilyMapStore.getState().settings?.effectiveOptionId).toBe('osm-de')
  })

  it('migrates a known local provider after RPC success and never uploads the local token', async () => {
    localStorage.setItem('fta_map_provider', 'mapbox-gl')
    localStorage.setItem('fta_mapbox_access_token', 'pk.should-never-upload')
    getEffective.mockResolvedValue({
      ...osmSettings(),
      enabledOptionIds: ['osm', 'mapbox-standard'],
      mapboxPublicToken: 'pk.family-public-fixture',
      mapboxConfigured: true,
    })
    updateMine.mockResolvedValue({
      ...osmSettings(),
      selectedOptionId: 'mapbox-standard',
      effectiveOptionId: 'mapbox-standard',
      source: 'member',
      enabledOptionIds: ['osm', 'mapbox-standard'],
      mapboxPublicToken: 'pk.family-public-fixture',
      mapboxConfigured: true,
    })
    await useFamilyMapStore.getState().hydrate('fam-1')
    expect(updateMine).toHaveBeenCalledWith('fam-1', 'mapbox-standard')
    expect(updateMine.mock.calls[0][1]).toBe('mapbox-standard')
    expect(JSON.stringify(updateMine.mock.calls)).not.toContain('pk.should-never-upload')
    expect(localStorage.getItem('fta_mapbox_access_token')).toBeNull()
    expect(localStorage.getItem('fta_map_provider')).toBeNull()
    expect(useFamilyMapStore.getState().settings?.effectiveOptionId).toBe('mapbox-standard')
  })

  it('keeps the local provider when the one-time migration RPC fails', async () => {
    localStorage.setItem('fta_map_provider', 'mapbox-gl')
    localStorage.setItem('fta_mapbox_access_token', 'pk.should-never-upload')
    getEffective.mockResolvedValue({
      ...osmSettings(),
      enabledOptionIds: ['osm', 'mapbox-standard'],
      mapboxPublicToken: 'pk.family-public-fixture',
      mapboxConfigured: true,
    })
    updateMine.mockRejectedValue(new Error('denied'))
    await useFamilyMapStore.getState().hydrate('fam-1')
    expect(localStorage.getItem('fta_map_provider')).toBe('mapbox-gl')
    expect(useFamilyMapStore.getState().settings?.effectiveOptionId).toBe('osm')
  })

  it('clears cached tiles when credential_revision increases', async () => {
    localStorage.setItem('fta_map_cred_rev:fam-1', '1')
    getEffective.mockResolvedValue({
      ...osmSettings(),
      credentialRevision: 2,
    })
    await useFamilyMapStore.getState().hydrate('fam-1')
    expect(clearTiles).toHaveBeenCalled()
  })

  it('does not call Family map RPCs when the window path is a public share', async () => {
    window.history.pushState({}, '', '/shared/tok-1')
    await useFamilyMapStore.getState().hydrate('fam-1')
    expect(getEffective).not.toHaveBeenCalled()
    window.history.pushState({}, '', '/')
  })

  it('falls back to OSM and records missing_rpc when the maps RPC is absent', async () => {
    getEffective.mockRejectedValue({ code: 'PGRST202', message: 'Could not find the function' })
    await useFamilyMapStore.getState().hydrate('fam-1')
    expect(useFamilyMapStore.getState().settings?.effectiveOptionId).toBe('osm')
    expect(useFamilyMapStore.getState().errorKind).toBe('missing_rpc')
    expect(useFamilyMapStore.getState().hydrated).toBe(true)
  })

  it('rolls back a member pick when the RPC fails', async () => {
    useFamilyMapStore.setState({
      familyId: 'fam-1',
      personId: 'p-1',
      settings: osmSettings(),
      hydrated: true,
    })
    updateMine.mockRejectedValue(new Error('denied'))
    await expect(useFamilyMapStore.getState().selectOption('osm-de')).rejects.toThrow('denied')
    expect(useFamilyMapStore.getState().settings?.effectiveOptionId).toBe('osm')
    expect(useFamilyMapStore.getState().saving).toBe(false)
  })
})
