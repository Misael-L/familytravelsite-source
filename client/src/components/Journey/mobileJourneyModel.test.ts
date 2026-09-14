import { describe, expect, it } from 'vitest'
import { hasJourneyCoordinates } from './mobileJourneyModel'

describe('hasJourneyCoordinates', () => {
  it('treats Null Island (0, 0) as a real location', () => {
    expect(hasJourneyCoordinates(0, 0)).toBe(true)
  })

  it('rejects missing or non-finite coordinates', () => {
    expect(hasJourneyCoordinates(null, 13)).toBe(false)
    expect(hasJourneyCoordinates(48, undefined)).toBe(false)
    expect(hasJourneyCoordinates(Number.NaN, 0)).toBe(false)
    expect(hasJourneyCoordinates(48.8, 2.3)).toBe(true)
  })
})
