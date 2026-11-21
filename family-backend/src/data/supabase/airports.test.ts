import { describe, expect, it } from 'vitest'
import { airportSearchPattern, normalizeIataCode } from './airports'

describe('airportSearchPattern', () => {
  it('requires at least two characters', () => {
    expect(airportSearchPattern('')).toBeNull()
    expect(airportSearchPattern(' ')).toBeNull()
    expect(airportSearchPattern('J')).toBeNull()
    expect(airportSearchPattern('JF')).toBe('%JF%')
    expect(airportSearchPattern('  FCO ')).toBe('%FCO%')
  })
})

describe('normalizeIataCode', () => {
  it('accepts exactly three letters', () => {
    expect(normalizeIataCode('jfk')).toBe('JFK')
    expect(normalizeIataCode(' FCO ')).toBe('FCO')
    expect(normalizeIataCode('12')).toBeNull()
    expect(normalizeIataCode('JFKK')).toBeNull()
    expect(normalizeIataCode('')).toBeNull()
  })
})
