export const AUTH_BOOTSTRAP_TIMEOUT_MS = 15_000
export const FEATURE_HYDRATE_TIMEOUT_MS = 10_000

export class StartupTimeoutError extends Error {
  constructor(message = 'Startup timed out') {
    super(message)
    this.name = 'StartupTimeoutError'
  }
}

export function isStartupTimeoutError(err: unknown): boolean {
  return err instanceof StartupTimeoutError || (err instanceof Error && err.name === 'StartupTimeoutError')
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StartupTimeoutError(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}
