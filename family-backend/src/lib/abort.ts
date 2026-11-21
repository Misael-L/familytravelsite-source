/** User-cancelled fetch (superseded generation) — not a failure. */
export function abortError(message = 'Aborted'): Error {
  const err = new Error(message)
  err.name = 'AbortError'
  return err
}

export function timeoutError(message: string): Error {
  const err = new Error(message)
  err.name = 'TimeoutError'
  return err
}

export function isAbortError(err: unknown): boolean {
  const e = err as { name?: string; code?: string } | null
  return e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED'
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError()
}

/**
 * Child signal that aborts when `parent` aborts or `timeoutMs` elapses.
 * Dispose to drop the timer / listener; does not abort the parent.
 */
export function timeoutAbort(parent: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal
  dispose: () => void
} {
  const ctrl = new AbortController()
  const onParent = () => ctrl.abort()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  if (parent?.aborted) {
    clearTimeout(timer)
    ctrl.abort()
  } else {
    parent?.addEventListener('abort', onParent, { once: true })
  }
  return {
    signal: ctrl.signal,
    dispose: () => {
      clearTimeout(timer)
      parent?.removeEventListener('abort', onParent)
    },
  }
}

/**
 * Settle even if the underlying promise ignores AbortSignal (hung fetch).
 * User abort → AbortError; elapsed timeout → TimeoutError.
 */
export function raceTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(() => reject(timeoutError('Request timed out')), timeoutMs)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    promise.then(
      value => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        resolve(value)
      },
      err => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        reject(err)
      },
    )
  })
}
