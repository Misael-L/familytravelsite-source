import { describe, expect, it } from 'vitest'
import { isPublicMapIsolatedPath } from './publicMapRoutes'

describe('isPublicMapIsolatedPath', () => {
  it('isolates share and public journey routes', () => {
    expect(isPublicMapIsolatedPath('/shared/tok-1')).toBe(true)
    expect(isPublicMapIsolatedPath('/shared/tok-1?x=1')).toBe(true)
    expect(isPublicMapIsolatedPath('/public/journey/tok-2')).toBe(true)
    expect(isPublicMapIsolatedPath('/public/journey/tok-2#map')).toBe(true)
    expect(isPublicMapIsolatedPath('/shared')).toBe(true)
    expect(isPublicMapIsolatedPath('/public/journey')).toBe(true)
  })

  it('does not isolate private family surfaces', () => {
    expect(isPublicMapIsolatedPath('/dashboard')).toBe(false)
    expect(isPublicMapIsolatedPath('/trips/abc')).toBe(false)
    expect(isPublicMapIsolatedPath('/settings')).toBe(false)
    expect(isPublicMapIsolatedPath('/login')).toBe(false)
    expect(isPublicMapIsolatedPath('/public/other')).toBe(false)
    expect(isPublicMapIsolatedPath('')).toBe(false)
    expect(isPublicMapIsolatedPath(null)).toBe(false)
  })
})
