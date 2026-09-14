import React from 'react'
import { useTranslation } from '../../i18n'

interface PageLoadFailedProps {
  title: string
  body: string
  onRetry?: () => void
  retryLabel?: string
}

/** Distinguishable failed-read surface — never a spinner, never an empty list. */
export function PageLoadFailed({
  title,
  body,
  onRetry,
  retryLabel,
}: PageLoadFailedProps): React.ReactElement {
  const { t } = useTranslation()
  return (
    <div
      role="alert"
      className="min-h-screen flex items-center justify-center px-6 bg-surface"
    >
      <div className="max-w-md w-full rounded-2xl border border-edge bg-surface-card p-6 text-center shadow-card">
        <h1 className="text-subtitle font-semibold text-content">{title}</h1>
        <p className="mt-2 text-body text-content-secondary">{body}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 inline-flex items-center justify-center rounded-xl px-4 py-2 text-caption font-medium bg-accent text-accent-text"
          >
            {retryLabel ?? t('common.errorRetry')}
          </button>
        )}
      </div>
    </div>
  )
}
