import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import {
  getFamilyPreferenceDefaults,
  getMyEffectivePreferences,
  preferencePatchToRpc,
  updateFamilyPreferenceDefaults,
  updateMyFamilyPreferences,
} from './familyPreferences'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

describe('familyPreferences adapters', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseBrowserClient).mockReset()
  })

  it('throws when get_family_preference_defaults errors', async () => {
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    } as never)
    await expect(getFamilyPreferenceDefaults('fam-1')).rejects.toMatchObject({ message: 'boom' })
  })

  it('maps Admin defaults and can_manage', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        family_id: 'fam-1',
        can_manage: true,
        defaults: {
          temperature_unit: 'fahrenheit',
          distance_unit: null,
          time_format: '12h',
          display_currency: 'USD',
        },
      },
      error: null,
    })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
    const result = await getFamilyPreferenceDefaults('fam-1')
    expect(result.canManage).toBe(true)
    expect(result.defaults).toMatchObject({
      temperatureUnit: 'fahrenheit',
      distanceUnit: null,
      timeFormat: '12h',
      displayCurrency: 'USD',
    })
    expect(rpc).toHaveBeenCalledWith('get_family_preference_defaults', { p_family_id: 'fam-1' })
  })

  it('sends snake_case patch on family update and throws on member error', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: {
          family_id: 'fam-1',
          can_manage: true,
          defaults: { temperature_unit: 'celsius', distance_unit: null, time_format: null, display_currency: null },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: 'denied' } })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
    await updateFamilyPreferenceDefaults('fam-1', { temperatureUnit: 'celsius' })
    expect(rpc).toHaveBeenCalledWith('update_family_preference_defaults', {
      p_family_id: 'fam-1',
      p_patch: { temperature_unit: 'celsius' },
    })
    await expect(updateMyFamilyPreferences('fam-1', { displayCurrency: 'trip' })).rejects.toMatchObject({
      message: 'denied',
    })
  })

  it('maps effective preferences and sources', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        family_id: 'fam-1',
        person_id: 'p-1',
        family: { temperature_unit: 'fahrenheit', distance_unit: null, time_format: '12h', display_currency: 'EUR' },
        overrides: { temperature_unit: null, distance_unit: 'imperial', time_format: null, display_currency: 'trip' },
        effective: { temperature_unit: 'fahrenheit', distance_unit: 'imperial', time_format: '12h', display_currency: null },
        sources: {
          temperature_unit: 'family',
          distance_unit: 'member',
          time_format: 'family',
          display_currency: 'member',
        },
      },
      error: null,
    })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
    const result = await getMyEffectivePreferences('fam-1')
    expect(result.effective.displayCurrency).toBeNull()
    expect(result.sources.distanceUnit).toBe('member')
    expect(result.overrides.displayCurrency).toBe('trip')
    expect(preferencePatchToRpc({ displayCurrency: null })).toEqual({ display_currency: null })
  })
})
