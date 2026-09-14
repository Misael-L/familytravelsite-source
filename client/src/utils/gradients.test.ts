import { describe, expect, it } from 'vitest'
import { GRADIENTS, entityGradient } from './gradients'

describe('entityGradient', () => {
  it('keeps the historic modulo for numeric ids', () => {
    expect(entityGradient(0)).toBe(GRADIENTS[0])
    expect(entityGradient(8)).toBe(GRADIENTS[0])
    expect(entityGradient(-1)).toBe(GRADIENTS[7])
  })

  it('returns a palette stop for UUID ids instead of undefined', () => {
    const g = entityGradient('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    expect(GRADIENTS).toContain(g)
  })
})
