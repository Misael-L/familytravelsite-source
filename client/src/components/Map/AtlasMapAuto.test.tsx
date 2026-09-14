import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AtlasMapAuto from './AtlasMapAuto'

const { useConfig, tileLayer } = vi.hoisted(() => ({
  useConfig: vi.fn(),
  tileLayer: vi.fn(),
}))

vi.mock('./useEffectiveMapConfig', () => ({
  useEffectiveMapConfig: (...args: unknown[]) => useConfig(...args),
}))

vi.mock('./AtlasMapGL', () => ({
  default: () => <div data-testid="atlas-gl" data-atlas-engine="mapbox-gl" />,
}))

vi.mock('leaflet', () => ({
  default: { tileLayer },
  tileLayer,
}))

const overlay = {
  geoData: null,
  data: null,
  pluginLayers: [],
  visitedRegions: {},
  bucketList: [],
  t: (k: string) => k,
  resolveName: (c: string) => c,
  setConfirmAction: vi.fn(),
  onUnmarkCountry: vi.fn(),
  regionTooltipRef: { current: null },
}

describe('AtlasMapAuto', () => {
  it('keeps the Leaflet container for raster engines', () => {
    useConfig.mockReturnValue({
      engine: 'leaflet',
      rasterUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      optionId: 'osm',
      source: 'builtin',
    })
    const mapRef = { current: null }
    render(<AtlasMapAuto mapRef={mapRef} dark={false} loading={false} {...overlay} />)
    expect(document.querySelector('[data-atlas-engine="leaflet"]')).toBeTruthy()
    expect(screen.queryByTestId('atlas-gl')).not.toBeInTheDocument()
    expect(tileLayer).not.toHaveBeenCalled()
  })

  it('does not mount Leaflet tiles for Mapbox Atlas', () => {
    useConfig.mockReturnValue({
      engine: 'mapbox-gl',
      rasterUrl: '',
      optionId: 'mapbox-standard',
      source: 'family',
      mapboxToken: 'pk.phase47fixturemapbox',
      styleUrl: 'mapbox://styles/mapbox/standard',
    })
    const mapRef = { current: null }
    render(<AtlasMapAuto mapRef={mapRef} dark={false} loading={false} {...overlay} />)
    expect(screen.getByTestId('atlas-gl')).toBeInTheDocument()
    expect(document.querySelector('[data-atlas-engine="leaflet"]')).toBeNull()
    expect(tileLayer).not.toHaveBeenCalled()
  })
})
