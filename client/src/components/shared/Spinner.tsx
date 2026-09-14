import React from 'react'

interface SpinnerProps {
  /**
   * Tailwind classes controlling size + colours of the ring. Callers keep full
   * control so adopting the component never changes a spinner's appearance.
   * Defaults to a tokenized page-loader ring.
   */
  className?: string
}

/** The bare spinning ring used throughout the app (`rounded-full animate-spin`). */
export function Spinner({ className = 'w-6 h-6 border-2 border-edge border-t-content' }: SpinnerProps): React.ReactElement {
  return <div className={`${className} rounded-full animate-spin`} />
}

interface PageSpinnerProps extends SpinnerProps {
  /** Wrapper classes for the centring container. */
  wrapperClassName?: string
  wrapperStyle?: React.CSSProperties
}

/**
 * A full-area centred loading spinner — the repeated "flex items-center
 * justify-center" loader that page loading-guards render while data resolves.
 */
export function PageSpinner({ className, wrapperClassName = 'flex items-center justify-center', wrapperStyle }: PageSpinnerProps): React.ReactElement {
  return (
    <div className={wrapperClassName} style={wrapperStyle} role="status">
      <Spinner className={className} />
    </div>
  )
}
