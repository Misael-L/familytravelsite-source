import React from 'react'
import { useTranslation } from '../../i18n'
import { Spinner } from './Spinner'

interface PageLoadingSurfaceProps {
  /** Accessible status label. Defaults to `common.loading`. */
  label?: string
  /** When false, fills the parent instead of the viewport. */
  fullscreen?: boolean
}

/**
 * Tokenized full-area loading surface for auth gates, route chunks, and
 * page-level waits. Does not imply that private family hydration is complete.
 */
export function PageLoadingSurface({
  label,
  fullscreen = true,
}: PageLoadingSurfaceProps): React.ReactElement {
  const { t } = useTranslation()
  const status = label ?? t('common.loading')
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={status}
      className={
        fullscreen
          ? 'min-h-screen flex items-center justify-center bg-surface'
          : 'flex items-center justify-center w-full h-full bg-surface'
      }
    >
      <div className="flex flex-col items-center gap-3">
        <Spinner className="w-10 h-10 border-4 border-edge border-t-content" />
        <p className="text-caption text-content-muted">{status}</p>
      </div>
    </div>
  )
}
