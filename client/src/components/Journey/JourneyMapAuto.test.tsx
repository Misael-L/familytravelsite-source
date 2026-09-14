import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '../../../tests/helpers/render'
import { resetAllStores, seedStore } from '../../../tests/helpers/store'
import { builtinEffectiveMapSettings } from '../../data/supabase/familyMaps'
import { OSM_TILE_TEMPLATE, type FamilyMapOptionId } from '../Map/mapRegistry'
import { useFamilyMapStore } from '../../store/familyMapStore'
import JourneyMapAuto from './JourneyMapAuto'

vi.mock('./JourneyMap', () => ({
  default: React.forwardRef((props: { tileUrl?: string }, _ref: React.Ref<unknown>) => (
    <div data-testid="journey-leaflet" data-tile={props.tileUrl} />
  )),
}))

vi.mock('./JourneyMapGL', () => ({
  default: React.forwardRef(() => <div data-testid="journey-gl" />),
}))

describe('JourneyMapAuto', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DATA_PLANE', 'supabase')
    resetAllStores()
    seedStore(useFamilyMapStore, {
      settings: {
        ...builtinEffectiveMapSettings('fam-1', 'p-1'),
        enabledOptionIds: ['osm', 'carto-dark'] as FamilyMapOptionId[],
        defaultOptionId: 'carto-dark',
        effectiveOptionId: 'carto-dark',
        source: 'family',
        cartoApiKey: 'phase47fixturecartokey',
        cartoConfigured: true,
      },
    })
  })

  afterEach(() => {
    vi.stubEnv('VITE_DATA_PLANE', 'nest')
  })

  it('uses the Family raster URL when authenticated', () => {
    render(<JourneyMapAuto checkins={[]} entries={[]} />)
    expect(screen.getByTestId('journey-leaflet').getAttribute('data-tile')).toContain('phase47fixturecartokey')
    expect(screen.queryByTestId('journey-gl')).not.toBeInTheDocument()
  })

  it('forces tokenless OSM in public mode even when Family CARTO is hydrated', () => {
    render(<JourneyMapAuto checkins={[]} entries={[]} publicMap />)
    expect(screen.getByTestId('journey-leaflet').getAttribute('data-tile')).toBe(OSM_TILE_TEMPLATE)
    expect(screen.getByTestId('journey-leaflet').getAttribute('data-tile')).not.toContain('key=')
    expect(screen.queryByTestId('journey-gl')).not.toBeInTheDocument()
  })
})
