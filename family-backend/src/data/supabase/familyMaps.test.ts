import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import {
  classifyFamilyMapError,
  familyMapPatchToRpc,
  getMyEffectiveMapSettings,
  isMissingMapCredentialError,
  isMissingMapRpc,
  mapEffectiveMapSettings,
  mapFamilyMapSettings,
  resolveClientEffectiveOption,
} from './familyMaps'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

describe('familyMaps adapters', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseBrowserClient).mockReset()
  })

  it('classifies missing-function errors without treating them as success', () => {
    expect(isMissingMapRpc({ code: 'PGRST202', message: 'Could not find the function' })).toBe(true)
    expect(isMissingMapRpc({ code: '42883', message: 'schema cache' })).toBe(true)
    expect(isMissingMapRpc({ message: 'not authorized' })).toBe(false)
    expect(classifyFamilyMapError({ code: 'PGRST202', message: 'Could not find the function' })).toBe('missing_rpc')
    expect(classifyFamilyMapError({ code: '42501', message: 'not authorized' })).toBe('permission')
    expect(classifyFamilyMapError({ name: 'TypeError', message: 'Failed to fetch' })).toBe('network')
    expect(classifyFamilyMapError({ message: 'something else' })).toBe('load')
    expect(isMissingMapCredentialError(new Error('Mapbox Standard is missing its credential'))).toBe(true)
  })

  it('throws when the maps RPC is not in the schema cache', async () => {
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.get_my_effective_map_settings' },
      }),
    } as never)
    await expect(getMyEffectiveMapSettings('fam-1')).rejects.toMatchObject({ code: 'PGRST202' })
  })

  it('throws a real RPC error instead of swallowing it as OSM', async () => {
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'not authorized' } }),
    } as never)
    await expect(getMyEffectiveMapSettings('fam-1')).rejects.toMatchObject({ message: 'not authorized' })
  })

  it('maps Admin settings and strips secret-looking tokens', () => {
    const mapped = mapFamilyMapSettings({
      family_id: 'fam-1',
      can_manage: true,
      mapbox_public_token: 'sk.secret-looking-value',
      carto_api_key: 'phase47fixturecartokey',
      mapbox_configured: true,
      carto_configured: true,
      enabled_option_ids: ['osm', 'carto-light', 'not-a-real-option'],
      default_option_id: 'carto-light',
      credential_revision: 3,
      updated_at: '2026-09-05T00:00:00.000Z',
    }, 'fam-1')
    expect(mapped.mapboxPublicToken).toBeNull()
    expect(mapped.cartoApiKey).toBe('phase47fixturecartokey')
    expect(mapped.enabledOptionIds).toEqual(['osm', 'carto-light'])
    expect(mapped.defaultOptionId).toBe('carto-light')
    expect(familyMapPatchToRpc({ mapboxPublicToken: null, defaultOptionId: 'osm' })).toEqual({
      mapbox_public_token: null,
      default_option_id: 'osm',
    })
  })

  it('falls back to OSM when a malformed RPC payload names unknown options', () => {
    const mapped = mapEffectiveMapSettings({
      family_id: 'fam-1',
      person_id: 'p-1',
      enabled_option_ids: ['stadia-smooth', 'mystery'],
      default_option_id: 'stadia-smooth',
      selected_option_id: 'mystery',
      effective_option_id: 'stadia-smooth',
      source: 'member',
    }, 'fam-1')
    expect(mapped.effectiveOptionId).toBe('osm')
    expect(mapped.source).toBe('family')
    expect(mapped.enabledOptionIds).toEqual(['osm'])
  })

  it('prefers a usable member pick, then family default, then OSM', () => {
    expect(resolveClientEffectiveOption({
      enabledOptionIds: ['osm', 'carto-light'],
      defaultOptionId: 'osm',
      selectedOptionId: 'carto-light',
      mapbox: null,
      carto: 'phase47fixturecartokey',
    })).toEqual({ optionId: 'carto-light', source: 'member' })
    expect(resolveClientEffectiveOption({
      enabledOptionIds: ['osm', 'carto-light'],
      defaultOptionId: 'osm',
      selectedOptionId: 'carto-light',
      mapbox: null,
      carto: null,
    })).toEqual({ optionId: 'osm', source: 'family' })
    expect(resolveClientEffectiveOption({
      enabledOptionIds: ['carto-light'],
      defaultOptionId: 'carto-light',
      selectedOptionId: null,
      mapbox: null,
      carto: null,
    })).toEqual({ optionId: 'osm', source: 'builtin' })
  })
})
