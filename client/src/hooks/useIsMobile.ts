import { useState, useEffect } from 'react'

/** Tailwind `md` — Navbar vs BottomNav, Journey compact layout. */
export const JOURNEY_COMPACT_MAX_PX = 767

/**
 * Returns true when the viewport is at or below `maxWidthPx`.
 * Default stays below the lg breakpoint (1024px) for Costs and other
 * non-Journey callers. Journey compact chrome uses `useJourneyCompactLayout`.
 */
export function useIsMobile(maxWidthPx = 1023): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= maxWidthPx,
  )

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    setIsMobile(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [maxWidthPx])

  return isMobile
}

/** Compact Journey layout aligned to `--nav-h` / `--bottom-nav-h` at 767px. */
export function useJourneyCompactLayout(): boolean {
  return useIsMobile(JOURNEY_COMPACT_MAX_PX)
}
