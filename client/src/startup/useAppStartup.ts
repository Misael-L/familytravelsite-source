import { useCallback, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { retryStartupAt, runCriticalStartup } from './coordinator'

/**
 * Mount-only critical bootstrap. Joins an in-flight run under StrictMode.
 * Retry re-runs with a new generation so a hung attempt cannot apply later.
 */
export function useAppStartup(): { retryStartup: () => void } {
  const location = useLocation()

  useEffect(() => {
    void runCriticalStartup({ path: location.pathname })
    // Match prior App mount-only bootstrap: first-render path, not every route change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const retryStartup = useCallback(() => {
    retryStartupAt(location.pathname)
  }, [location.pathname])

  return { retryStartup }
}
