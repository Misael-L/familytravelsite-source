import { describe, expect, it } from 'vitest'
import {
  FAMILY_MAP_OPTIONS,
  getFamilyMapOption,
  isFamilyMapOptionId,
  legacyProviderToOptionId,
  optionIsUsable,
  templatesContainQueryKey,
} from './mapRegistry'

describe('family map registry', () => {
  it('covers the SQL allowlist and never bakes ?key= into templates', () => {
    expect(FAMILY_MAP_OPTIONS.map(option => option.id)).toEqual([
      'osm',
      'osm-de',
      'carto-light',
      'carto-dark',
      'mapbox-standard',
      'mapbox-standard-satellite',
      'mapbox-streets',
      'mapbox-outdoors',
      'mapbox-light',
      'mapbox-dark',
      'mapbox-satellite',
      'mapbox-satellite-streets',
      'mapbox-navigation-day',
      'mapbox-navigation-night',
      'openfreemap-liberty',
      'openfreemap-bright',
      'openfreemap-positron',
    ])
    expect(FAMILY_MAP_OPTIONS.some(option => option.id.includes('stadia'))).toBe(false)
    expect(FAMILY_MAP_OPTIONS.some(templatesContainQueryKey)).toBe(false)
    expect(isFamilyMapOptionId('stadia-smooth')).toBe(false)
  })

  it('requires family credentials only for CARTO and Mapbox options', () => {
    expect(optionIsUsable('osm', { mapbox: null, carto: null })).toBe(true)
    expect(optionIsUsable('carto-light', { mapbox: null, carto: null })).toBe(false)
    expect(optionIsUsable('carto-light', { mapbox: null, carto: 'phase47fixturecartokey' })).toBe(true)
    expect(optionIsUsable('mapbox-standard', { mapbox: null, carto: 'phase47fixturecartokey' })).toBe(false)
    expect(getFamilyMapOption('carto-light')?.atlasTileTemplate).toContain('light_nolabels')
  })

  it('maps a legacy local provider to a named option without reading a token', () => {
    expect(legacyProviderToOptionId('leaflet')).toBe('osm')
    expect(legacyProviderToOptionId('mapbox-gl')).toBe('mapbox-standard')
    expect(legacyProviderToOptionId('maplibre-gl')).toBe('openfreemap-liberty')
    expect(legacyProviderToOptionId('stadia')).toBeNull()
  })
})
