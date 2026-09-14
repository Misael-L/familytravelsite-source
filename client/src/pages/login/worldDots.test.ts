import { describe, expect, it } from 'vitest'
import { worldDots } from './worldDots'

describe('worldDots', () => {
  it('decodes a deterministic baked coastline grid', () => {
    const a = worldDots()
    const b = worldDots()
    expect(a.length).toBeGreaterThan(500)
    expect(a).toEqual(b)
    expect(a[0]).toEqual({ x: expect.any(Number), y: expect.any(Number) })
  })
})
