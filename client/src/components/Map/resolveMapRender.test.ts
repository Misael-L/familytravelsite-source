import { describe, expect, it } from 'vitest'
import { builtinEffectiveMapSettings } from '../../data/supabase/familyMaps'
import {
  prefetchTemplateFor,
  publicMapRender,
  renderFromEffective,
  renderFromNestSettings,
} from './resolveMapRender'
import { OSM_TILE_TEMPLATE, type FamilyMapOptionId } from './mapRegistry'

describe('map render resolver', () => {
  it('keeps public share maps on tokenless OSM', () => {
    const render = publicMapRender()
    expect(render.optionId).toBe('osm')
    expect(render.engine).toBe('leaflet')
    expect(render.rasterUrl).toBe(OSM_TILE_TEMPLATE)
    expect(render.mapboxToken).toBeNull()
    expect(render.rasterUrl).not.toContain('key=')
  })

  it('injects a CARTO key into raster URLs and uses unlabeled Atlas tiles', () => {
    const settings = {
      ...builtinEffectiveMapSettings('fam-1', 'p-1'),
      enabledOptionIds: ['osm', 'carto-dark'] as FamilyMapOptionId[],
      defaultOptionId: 'carto-dark' as const,
      effectiveOptionId: 'carto-dark' as const,
      source: 'family' as const,
      cartoApiKey: 'phase47fixturecartokey',
      cartoConfigured: true,
    }
    const planner = renderFromEffective(settings)
    expect(planner.rasterUrl).toContain('dark_all')
    expect(planner.rasterUrl).toContain('key=phase47fixturecartokey')
    const atlas = renderFromEffective(settings, 'atlas')
    expect(atlas.rasterUrl).toContain('dark_nolabels')
    expect(atlas.rasterUrl).toContain('key=phase47fixturecartokey')
    expect(prefetchTemplateFor(planner)).toBe(planner.rasterUrl)
  })

  it('falls back to OSM when a Mapbox option has no family token', () => {
    const render = renderFromEffective({
      ...builtinEffectiveMapSettings('fam-1', 'p-1'),
      effectiveOptionId: 'mapbox-standard',
      source: 'family',
      mapboxPublicToken: null,
    })
    expect(render.optionId).toBe('osm')
    expect(render.source).toBe('builtin')
    expect(render.rasterUrl).toBe(OSM_TILE_TEMPLATE)
  })

  it('keeps Mapbox/OpenFreeMap on their GL engines instead of OSM raster', () => {
    const mapbox = renderFromEffective({
      ...builtinEffectiveMapSettings('fam-1', 'p-1'),
      enabledOptionIds: ['osm', 'mapbox-standard'],
      defaultOptionId: 'mapbox-standard',
      effectiveOptionId: 'mapbox-standard',
      source: 'family',
      mapboxPublicToken: 'pk.phase47fixturemapbox',
      mapboxConfigured: true,
    })
    expect(mapbox.engine).toBe('mapbox-gl')
    expect(mapbox.rasterUrl).not.toBe(OSM_TILE_TEMPLATE)
    expect(mapbox.source).toBe('family')

    const liberty = renderFromEffective({
      ...builtinEffectiveMapSettings('fam-1', 'p-1'),
      enabledOptionIds: ['osm', 'openfreemap-liberty'],
      defaultOptionId: 'openfreemap-liberty',
      effectiveOptionId: 'openfreemap-liberty',
      source: 'member',
    })
    expect(liberty.engine).toBe('maplibre-gl')
    expect(liberty.rasterUrl).not.toBe(OSM_TILE_TEMPLATE)
  })

  it('still honors Nest tile URLs on the Nest plane', () => {
    const render = renderFromNestSettings({
      map_provider: 'leaflet',
      map_tile_url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
      mapbox_access_token: '',
      mapbox_style: '',
      maplibre_style: '',
    })
    expect(render.rasterUrl).toBe('https://tile.openstreetmap.de/{z}/{x}/{y}.png')
  })
})
