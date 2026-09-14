/**
 * The zoom ceiling a Leaflet map needs before a marker cluster will attach.
 *
 * Ported from TREK v4.1.1 as a Family-safe regression check. Does not adopt
 * OpenFreeMap or CARTO defaults.
 */
import { describe, it, expect, afterEach } from 'vitest'
import L from 'leaflet'
import 'leaflet.markercluster'
import { MAP_MAX_ZOOM } from '../../constants/mapDefaults'

const GlCanvasLayer = L.Layer.extend({ onAdd: () => undefined, onRemove: () => undefined })
function glCanvasLayer(): L.Layer {
  return new GlCanvasLayer() as L.Layer
}

const markerClusterGroup = (L as unknown as { markerClusterGroup: () => L.Layer }).markerClusterGroup

const containers: HTMLElement[] = []

function mapOn(options: L.MapOptions): L.Map {
  const el = document.createElement('div')
  Object.defineProperty(el, 'clientWidth', { value: 800 })
  Object.defineProperty(el, 'clientHeight', { value: 600 })
  document.body.appendChild(el)
  containers.push(el)
  return L.map(el, { center: [48.85, 2.35], zoom: 12, ...options })
}

afterEach(() => {
  for (const el of containers.splice(0)) el.remove()
})

describe('the zoom ceiling of a Leaflet map', () => {
  it('MAPZOOM-001: a vector basemap contributes none, so the map has none', () => {
    const map = mapOn({})
    glCanvasLayer().addTo(map)
    expect(map.getMaxZoom()).toBe(Infinity)
  })

  it('MAPZOOM-003: a cluster refuses to attach to a map with no ceiling', () => {
    const map = mapOn({})
    glCanvasLayer().addTo(map)
    expect(() => markerClusterGroup().addTo(map)).toThrow(/maxZoom/)
  })

  it('MAPZOOM-004: the ceiling on the map itself carries every basemap kind', () => {
    const map = mapOn({ maxZoom: MAP_MAX_ZOOM })
    glCanvasLayer().addTo(map)
    expect(map.getMaxZoom()).toBe(MAP_MAX_ZOOM)
    expect(() => markerClusterGroup().addTo(map)).not.toThrow()
  })

  it('MAPZOOM-005: it does not lower the raster layer already at 19', () => {
    const map = mapOn({ maxZoom: MAP_MAX_ZOOM })
    L.tileLayer('https://example.test/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    expect(map.getMaxZoom()).toBe(19)
  })
})
