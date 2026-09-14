import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { JOURNEY_COMPACT_MAX_PX, useIsMobile, useJourneyCompactLayout } from './useIsMobile'

function stubMatchMedia(matchesFor: (query: string) => boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matchesFor(query),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('useIsMobile', () => {
  it('keeps the default Costs breakpoint at 1023px', async () => {
    stubMatchMedia(query => query.includes('1023'))
    const { result } = renderHook(() => useIsMobile())
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('aligns Journey compact layout to Tailwind md (767px)', async () => {
    stubMatchMedia(query => query.includes(String(JOURNEY_COMPACT_MAX_PX)))
    const { result } = renderHook(() => useJourneyCompactLayout())
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('does not treat tablet 768–1023 as Journey compact', async () => {
    stubMatchMedia(query => query.includes('1023'))
    const compact = renderHook(() => useJourneyCompactLayout())
    const costs = renderHook(() => useIsMobile())
    await waitFor(() => expect(costs.result.current).toBe(true))
    expect(compact.result.current).toBe(false)
  })
})
