import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '../../../tests/helpers/render'
import { act } from '@testing-library/react'
import { resetAllStores, seedStore } from '../../../tests/helpers/store'
import { useFamilyMapStore } from '../../store/familyMapStore'
import { getFamilyMapOption } from './mapRegistry'
import { renderFromOption } from './resolveMapRender'
import AtlasMapGL from './AtlasMapGL'
import type { AtlasData, BucketItem } from '../../pages/atlas/atlasModel'
import type { PluginAtlasLayer } from '../../api/client'

type FakeMap = {
  addSource: ReturnType<typeof vi.fn>
  getSource: ReturnType<typeof vi.fn>
  addLayer: ReturnType<typeof vi.fn>
  getLayer: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  isStyleLoaded: ReturnType<typeof vi.fn>
  addControl: ReturnType<typeof vi.fn>
  queryRenderedFeatures: ReturnType<typeof vi.fn>
  getLayoutProperty: ReturnType<typeof vi.fn>
  setLayoutProperty: ReturnType<typeof vi.fn>
  getZoom: ReturnType<typeof vi.fn>
  getBounds: ReturnType<typeof vi.fn>
}

const maps = vi.hoisted(() => ({ instances: [] as FakeMap[] }))

function createFakeMap(): FakeMap {
  return {
    addSource: vi.fn(),
    getSource: vi.fn().mockReturnValue(null),
    addLayer: vi.fn(),
    getLayer: vi.fn().mockReturnValue(null),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    remove: vi.fn(),
    isStyleLoaded: vi.fn().mockReturnValue(true),
    addControl: vi.fn(),
    queryRenderedFeatures: vi.fn().mockReturnValue([]),
    getLayoutProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    getZoom: vi.fn().mockReturnValue(2),
    getBounds: vi.fn().mockReturnValue({
      getWest: () => -10,
      getSouth: () => -10,
      getEast: () => 10,
      getNorth: () => 10,
    }),
  }
}

vi.mock('mapbox-gl', () => ({
  default: {
    accessToken: '',
    Map: vi.fn(function () {
      const map = createFakeMap()
      maps.instances.push(map)
      return map
    }),
    NavigationControl: vi.fn(),
  },
}))
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))

vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn(function () {
      const map = createFakeMap()
      maps.instances.push(map)
      return map
    }),
    NavigationControl: vi.fn(),
  },
}))
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}))

vi.mock('../../api/client', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { type: 'FeatureCollection', features: [] } }) },
}))

const geoData = {
  type: 'FeatureCollection' as const,
  features: [{
    type: 'Feature' as const,
    id: 'FRA',
    properties: { ADM0_A3: 'FRA', ISO_A2: 'FR', ISO_A3: 'FRA' },
    geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
  }],
}

const data: AtlasData = {
  countries: [{ code: 'FR', tripCount: 0, placeCount: 0 }],
  stats: { totalTrips: 0, totalPlaces: 0, totalCountries: 1, totalDays: 0 },
}

const pluginLayers: PluginAtlasLayer[] = [{
  pluginId: 'p1',
  id: 'layer-1',
  name: 'tone',
  countries: [{ code: 'FR', tone: 'success' }],
}]

const bucketList: BucketItem[] = [{
  id: 1,
  name: 'Paris',
  lat: 48.85,
  lng: 2.35,
  country_code: 'FR',
  notes: null,
  target_date: null,
}]

const overlay = {
  dark: false,
  loading: false,
  geoData,
  data,
  pluginLayers,
  visitedRegions: {},
  bucketList,
  t: (k: string) => k,
  resolveName: (c: string) => c,
  setConfirmAction: vi.fn(),
  onUnmarkCountry: vi.fn(),
  regionTooltipRef: { current: null },
}

function mapboxRender(revision = 1) {
  return renderFromOption(
    getFamilyMapOption('mapbox-standard')!,
    { mapbox: 'pk.phase47rfixturemapboxxxxxxxxx', carto: null },
    'family',
    revision,
  )
}

function libreRender() {
  return renderFromOption(
    getFamilyMapOption('openfreemap-liberty')!,
    { mapbox: null, carto: null },
    'family',
    1,
  )
}

function eventNames(map: FakeMap): string[] {
  return map.on.mock.calls.map((call) => String(call[0]))
}

describe('AtlasMapGL lifecycle', () => {
  beforeEach(() => {
    maps.instances = []
    resetAllStores()
    seedStore(useFamilyMapStore, { familyId: 'fam-a', hydrated: true })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('reattaches overlays and handlers on the new map after engine change', async () => {
    const first = mapboxRender(1)
    const view = render(<AtlasMapGL render={first} {...overlay} />)
    await act(async () => {})

    expect(maps.instances).toHaveLength(1)
    const map1 = maps.instances[0]
    expect(map1.addSource).toHaveBeenCalled()
    expect(map1.addLayer).toHaveBeenCalled()
    expect(eventNames(map1)).toEqual(expect.arrayContaining(['click', 'moveend', 'zoomend']))
    const sourcesOnFirst = map1.addSource.mock.calls.map((c) => c[0])
    expect(sourcesOnFirst).toEqual(expect.arrayContaining(['atlas-countries', 'atlas-plugins', 'atlas-buckets']))

    view.rerender(<AtlasMapGL render={libreRender()} {...overlay} />)
    await act(async () => {})

    expect(map1.remove).toHaveBeenCalled()
    expect(maps.instances).toHaveLength(2)
    const map2 = maps.instances[1]
    expect(map2.addSource).toHaveBeenCalled()
    expect(map2.addLayer).toHaveBeenCalled()
    expect(eventNames(map2)).toEqual(expect.arrayContaining(['click', 'moveend', 'zoomend']))
    const sourcesOnSecond = map2.addSource.mock.calls.map((c) => c[0])
    expect(sourcesOnSecond).toEqual(expect.arrayContaining(['atlas-countries', 'atlas-plugins', 'atlas-buckets']))
  })

  it('revision-only bump recreates the map and rebinds viewport handlers', async () => {
    const view = render(<AtlasMapGL render={mapboxRender(1)} {...overlay} />)
    await act(async () => {})
    expect(maps.instances).toHaveLength(1)
    const map1 = maps.instances[0]
    expect(eventNames(map1)).toEqual(expect.arrayContaining(['moveend', 'zoomend']))

    view.rerender(<AtlasMapGL render={mapboxRender(2)} {...overlay} />)
    await act(async () => {})

    expect(map1.remove).toHaveBeenCalled()
    expect(maps.instances).toHaveLength(2)
    const map2 = maps.instances[1]
    expect(map2.addSource).toHaveBeenCalled()
    expect(map2.addLayer).toHaveBeenCalled()
    expect(eventNames(map2)).toEqual(expect.arrayContaining(['click', 'moveend', 'zoomend']))
    const sources = map2.addSource.mock.calls.map((c) => c[0])
    expect(sources).toEqual(expect.arrayContaining(['atlas-countries', 'atlas-plugins', 'atlas-buckets']))
    expect(map2.on).toHaveBeenCalledWith('moveend', expect.any(Function))
    expect(map2.on).toHaveBeenCalledWith('zoomend', expect.any(Function))
  })
})
