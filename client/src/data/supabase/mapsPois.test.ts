import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import { listOsmPoisInBbox, OSM_TILE_TIMEOUT_MS } from './mapsPois'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

const BBOX = { south: 40.40, west: -3.75, north: 40.50, east: -3.65 }

describe('listOsmPoisInBbox timeout', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      functions: {
        invoke: vi.fn(() => new Promise(() => {})),
      },
    } as never)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('FE-DATA-MAPSPOIS-001: hung maps-pois invoke rejects TimeoutError', async () => {
    vi.useFakeTimers()
    const pending = listOsmPoisInBbox({ category: 'restaurant', bbox: BBOX })
    const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(OSM_TILE_TIMEOUT_MS)
    await assertion
  })

  it('FE-DATA-MAPSPOIS-002: user abort rejects AbortError, not TimeoutError', async () => {
    const ctrl = new AbortController()
    const pending = listOsmPoisInBbox({
      category: 'restaurant',
      bbox: BBOX,
      signal: ctrl.signal,
    })
    ctrl.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
