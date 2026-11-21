import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDataPlane } from './env'

describe('getDataPlane', () => {
  afterEach(() => {
    vi.stubEnv('VITE_DATA_PLANE', 'nest')
  })

  it('defaults to supabase when unset or blank', () => {
    vi.stubEnv('VITE_DATA_PLANE', '')
    expect(getDataPlane()).toBe('supabase')
  })

  it('uses nest only when explicitly nest', () => {
    vi.stubEnv('VITE_DATA_PLANE', 'nest')
    expect(getDataPlane()).toBe('nest')
  })

  it('treats supabase as supabase (case-insensitive)', () => {
    vi.stubEnv('VITE_DATA_PLANE', 'Supabase')
    expect(getDataPlane()).toBe('supabase')
  })
})
