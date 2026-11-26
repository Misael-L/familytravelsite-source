import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import { getMyProfileDisplayPreferences, updateMyProfileDisplayPreferences } from './profileDisplayPreferences'

vi.mock('./client', () => ({ getSupabaseBrowserClient: vi.fn() }))

describe('profile display preference adapter', () => {
  const rpc = vi.fn()

  beforeEach(() => {
    rpc.mockReset()
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
  })

  it('loads the authenticated account without sending a user or Family ID', async () => {
    const saved = { date_format: 'DD.MM.YYYY', week_start: 'sunday' }
    rpc.mockResolvedValue({ data: saved, error: null })
    await expect(getMyProfileDisplayPreferences()).resolves.toEqual(saved)
    expect(rpc).toHaveBeenCalledWith('get_my_profile_display_preferences')
  })

  it('preserves reads on the old database and reports unavailable writes', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
    await expect(getMyProfileDisplayPreferences()).resolves.toBeUndefined()
    await expect(updateMyProfileDisplayPreferences({ week_start: 'sunday' })).rejects.toThrow('unavailable')
  })

  it('propagates read authorization errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } })
    await expect(getMyProfileDisplayPreferences()).rejects.toMatchObject({ code: '42501' })
  })

  it('sends only changed account fields with the existing Family patch format', async () => {
    const display = { date_format: 'auto', week_start: 'sunday' }
    rpc.mockResolvedValue({ data: { display, family: { effective: { distance_unit: 'imperial' } } }, error: null })
    await expect(
      updateMyProfileDisplayPreferences({ week_start: 'sunday' }, { id: 'family-id', patch: { distanceUnit: 'imperial' } }),
    ).resolves.toMatchObject({ display, family: { familyId: 'family-id', effective: { distanceUnit: 'imperial' } } })
    expect(rpc).toHaveBeenCalledWith('update_my_profile_display_preferences', {
      p_patch: { week_start: 'sunday' },
      p_family_id: 'family-id',
      p_family_patch: { distance_unit: 'imperial' },
    })
  })
})
