import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from '../../i18n'
import { isChunkLoadError, reloadOnceForChunk } from '../../utils/chunkReload'

type Props = {
  children: ReactNode
  resetKeys?: readonly unknown[]
}

type State = { error: Error | null }

function keysChanged(a: readonly unknown[] = [], b: readonly unknown[] = []): boolean {
  return a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))
}

/**
 * Route-scoped recovery. Resets when `resetKeys` change (pathname from the
 * wrapper). Chunk 404s reload once per session; after that the fallback stays.
 * Root crashes still belong to `AppErrorBoundary` in `main.tsx`.
 */
class RouteErrorBoundaryInner extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[route] render crashed', error, info.componentStack)
    if (isChunkLoadError(error)) reloadOnceForChunk()
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && keysChanged(prev.resetKeys, this.props.resetKeys)) {
      this.setState({ error: null })
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <RouteErrorFallback
        error={this.state.error}
        isChunkError={isChunkLoadError(this.state.error)}
        onRetry={() => this.setState({ error: null })}
      />
    )
  }
}

function RouteErrorFallback({
  error,
  isChunkError,
  onRetry,
}: {
  error: Error
  isChunkError: boolean
  onRetry: () => void
}): React.ReactElement {
  const { t } = useTranslation()
  const title = isChunkError ? t('common.errorUpdateTitle') : t('common.errorTitle')
  const body = isChunkError ? t('common.errorUpdateBody') : t('common.errorBody')

  return (
    <div
      role="alert"
      className="min-h-dvh flex items-center justify-center px-6 bg-surface"
    >
      <div className="max-w-md w-full rounded-2xl border border-edge bg-surface-card p-6 shadow-card text-center">
        <h1 className="text-subtitle font-semibold text-content">{title}</h1>
        <p className="mt-2 text-body text-content-secondary">{body}</p>
        {error.message && (
          <code className="mt-3 block max-w-full truncate text-caption text-content-faint">
            {error.message}
          </code>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {!isChunkError && (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-caption font-medium bg-accent text-accent-text"
              onClick={onRetry}
            >
              {t('common.errorRetry')}
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-caption font-medium border border-edge text-content"
            onClick={() => window.location.reload()}
          >
            {t('common.errorReload')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Pathname-keyed wrapper so a crashed route does not follow the user. */
export default function RouteErrorBoundary({ children }: { children: ReactNode }): React.ReactElement {
  const location = useLocation()
  return (
    <RouteErrorBoundaryInner resetKeys={[location.pathname]}>
      {children}
    </RouteErrorBoundaryInner>
  )
}

export { RouteErrorBoundaryInner }
