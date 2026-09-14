import { describe, expect, it } from 'vitest'
import {
  normalizeTileUrl,
  resolveTileUrl,
  stripTileApiKey,
  withTileApiKey,
} from './tileUrl'
import { OSM_TILE_TEMPLATE } from '../components/Map/mapRegistry'

describe('tileUrl helpers', () => {
  it('normalizes OSM shard templates to the apex host', () => {
    expect(normalizeTileUrl('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'))
      .toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
    expect(normalizeTileUrl('https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'))
      .toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png')
  })

  it('injects a CARTO key only at resolve time and can strip it again', () => {
    const template = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    const resolved = withTileApiKey(template, 'phase47fixturecartokey')
    expect(resolved).toContain('?key=phase47fixturecartokey')
    expect(stripTileApiKey(resolved)).toBe(template)
    expect(withTileApiKey(OSM_TILE_TEMPLATE, 'phase47fixturecartokey')).toBe(OSM_TILE_TEMPLATE)
  })

  it('falls back to OSM when CARTO has no key', () => {
    expect(resolveTileUrl(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      OSM_TILE_TEMPLATE,
      null,
    )).toBe(OSM_TILE_TEMPLATE)
    expect(resolveTileUrl(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      OSM_TILE_TEMPLATE,
      'phase47fixturecartokey',
    )).toContain('key=phase47fixturecartokey')
  })
})
