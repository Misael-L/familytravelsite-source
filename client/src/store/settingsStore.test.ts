import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DEFAULT_SETTINGS, useSettingsStore } from './settingsStore'
import { useAuthStore } from './authStore'
import { resetAllStores, seedStore } from '../../tests/helpers/store'
import { buildUser } from '../../tests/helpers/factories'

const { getEffective, updateMine } = vi.hoisted(() => ({
  getEffective: vi.fn(),
  updateMine: vi.fn(),
}))

vi.mock('../data/supabase/familyPreferences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/familyPreferences')>()
  return {
    ...actual,
    getMyEffectivePreferences: getEffective,
    updateMyFamilyPreferences: updateMine,
  }
})

beforeEach(() => {
  resetAllStores()
  getEffective.mockReset()
  updateMine.mockReset()
})

describe('settings defaults', () => {
  it('SETTINGS-DEFAULTS-001: the shipped unit defaults belong to one consistent system', () => {
    expect(DEFAULT_SETTINGS.temperature_unit).toBe('celsius')
    expect(DEFAULT_SETTINGS.distance_unit).toBe('metric')
    expect(DEFAULT_SETTINGS.time_format).toBe('24h')
  })

  it('SETTINGS-DEFAULTS-002: the store initialises from DEFAULT_SETTINGS, the same constant DisplaySettingsTab falls back to, so the two cannot drift apart', () => {
    const settings = useSettingsStore.getState().settings
    expect(settings.temperature_unit).toBe(DEFAULT_SETTINGS.temperature_unit)
    expect(settings.distance_unit).toBe(DEFAULT_SETTINGS.distance_unit)
    expect(settings.time_format).toBe(DEFAULT_SETTINGS.time_format)
  })
})

describe('family preference inheritance', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DATA_PLANE', 'supabase')
    seedStore(useAuthStore, {
      familyId: 'fam-1',
      isAuthenticated: true,
      user: buildUser(),
    })
  })

  afterEach(() => {
    vi.stubEnv('VITE_DATA_PLANE', 'nest')
  })

  it('hydrates effective values and sources', async () => {
    getEffective.mockResolvedValue({
      familyId: 'fam-1',
      personId: 'p-1',
      family: { temperatureUnit: 'fahrenheit', distanceUnit: null, timeFormat: null, displayCurrency: 'EUR' },
      overrides: { temperatureUnit: null, distanceUnit: 'imperial', timeFormat: null, displayCurrency: null },
      effective: { temperatureUnit: 'fahrenheit', distanceUnit: 'imperial', timeFormat: '24h', displayCurrency: 'EUR' },
      sources: {
        temperatureUnit: 'family',
        distanceUnit: 'member',
        timeFormat: 'builtin',
        displayCurrency: 'family',
      },
    })
    await useSettingsStore.getState().hydrateFamilyPreferences('fam-1')
    const state = useSettingsStore.getState()
    expect(state.settings.temperature_unit).toBe('fahrenheit')
    expect(state.settings.distance_unit).toBe('imperial')
    expect(state.settings.default_currency).toBe('EUR')
    expect(state.preferenceSources.temperature_unit).toBe('family')
  })

  it('rolls back a portable override when the member RPC fails', async () => {
    useSettingsStore.setState({
      settings: { ...useSettingsStore.getState().settings, temperature_unit: 'celsius' },
    })
    updateMine.mockRejectedValue(new Error('denied'))
    await expect(
      useSettingsStore.getState().updateSetting('temperature_unit', 'fahrenheit'),
    ).rejects.toThrow()
    expect(useSettingsStore.getState().settings.temperature_unit).toBe('celsius')
  })

  it('persists an override then applies the RPC effective payload', async () => {
    updateMine.mockResolvedValue({
      familyId: 'fam-1',
      personId: 'p-1',
      family: { temperatureUnit: 'celsius', distanceUnit: null, timeFormat: null, displayCurrency: null },
      overrides: { temperatureUnit: 'fahrenheit', distanceUnit: null, timeFormat: null, displayCurrency: null },
      effective: { temperatureUnit: 'fahrenheit', distanceUnit: 'metric', timeFormat: '24h', displayCurrency: null },
      sources: {
        temperatureUnit: 'member',
        distanceUnit: 'builtin',
        timeFormat: 'builtin',
        displayCurrency: 'builtin',
      },
    })
    await useSettingsStore.getState().updateSetting('temperature_unit', 'fahrenheit')
    expect(updateMine).toHaveBeenCalledWith('fam-1', { temperatureUnit: 'fahrenheit' })
    expect(useSettingsStore.getState().preferenceSources.temperature_unit).toBe('member')
    expect(useSettingsStore.getState().settings.default_currency).toBe('')
  })

  it('ignores a late preference hydrate from a previous family', async () => {
    let finishFirst: ((value: unknown) => void) | undefined
    const fam2 = {
      familyId: 'fam-2',
      personId: 'p-2',
      family: { temperatureUnit: 'celsius', distanceUnit: null, timeFormat: null, displayCurrency: null },
      overrides: { temperatureUnit: null, distanceUnit: null, timeFormat: null, displayCurrency: null },
      effective: { temperatureUnit: 'celsius', distanceUnit: 'metric', timeFormat: '24h', displayCurrency: null },
      sources: {
        temperatureUnit: 'builtin',
        distanceUnit: 'builtin',
        timeFormat: 'builtin',
        displayCurrency: 'builtin',
      },
    }
    getEffective
      .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }))
      .mockResolvedValueOnce(fam2)
    const first = useSettingsStore.getState().hydrateFamilyPreferences('fam-1')
    useAuthStore.setState({ familyId: 'fam-2' })
    const second = useSettingsStore.getState().hydrateFamilyPreferences('fam-2')
    finishFirst?.({
      ...fam2,
      familyId: 'fam-1',
      effective: { temperatureUnit: 'fahrenheit', distanceUnit: 'imperial', timeFormat: '12h', displayCurrency: 'USD' },
    })
    await Promise.all([first, second])
    expect(useSettingsStore.getState().settings.temperature_unit).toBe('celsius')
    expect(useSettingsStore.getState().settings.distance_unit).toBe('metric')
  })
})
