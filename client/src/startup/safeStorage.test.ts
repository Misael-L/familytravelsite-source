import { afterEach, describe, expect, it, vi } from 'vitest'
import { readLocal, removeLocal, writeLocal } from './safeStorage'

describe('safeStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when localStorage getItem throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    })
    expect(readLocal('app_language')).toBeNull()
    expect(() => writeLocal('app_language', 'es')).not.toThrow()
    expect(() => removeLocal('demo_mode')).not.toThrow()
  })
})
