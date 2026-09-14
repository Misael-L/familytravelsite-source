import { describe, expect, it } from 'vitest'
import { isCatalogInPurview, purviewPlaceIdFor } from './explorePurview'

const ON_TRIP = new Set(['place-a'])

describe('isCatalogInPurview', () => {
  it('treats a null parent as in-purview enrichment', () => {
    expect(isCatalogInPurview(null, ON_TRIP)).toBe(true)
    expect(isCatalogInPurview(undefined, new Set())).toBe(true)
  })

  it('is in purview only when the place is already a trip destination', () => {
    expect(isCatalogInPurview('place-a', ON_TRIP)).toBe(true)
    expect(isCatalogInPurview('place-b', ON_TRIP)).toBe(false)
  })
})

describe('purviewPlaceIdFor', () => {
  it('uses the entity id for places and the parent for other kinds', () => {
    expect(purviewPlaceIdFor('place', 'p1', 'ignored')).toBe('p1')
    expect(purviewPlaceIdFor('experience', 'e1', 'p1')).toBe('p1')
    expect(purviewPlaceIdFor('food', 'f1', null)).toBe(null)
    expect(purviewPlaceIdFor('hotel', 'h1', 'p2')).toBe('p2')
  })
})
