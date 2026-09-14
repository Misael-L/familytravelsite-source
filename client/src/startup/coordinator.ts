import { useAuthStore } from '../store/authStore'
import { applySupabaseAppFlags, isFamilyDataPlane, loadNestAppConfig } from './loadAppConfig'
import { isLoginOrRequestAccessPath, isPublicAuthPath } from './publicPath'

export type StartupStatus = 'idle' | 'running' | 'ready' | 'failed'

let generation = 0
let inFlight: Promise<void> | null = null
let status: StartupStatus = 'idle'

export function getStartupGeneration(): number {
  return generation
}

export function getStartupStatus(): StartupStatus {
  return status
}

export function isStartupInFlight(): boolean {
  return inFlight != null
}

/** Test-only: drop in-flight work and restore idle so specs do not leak across files. */
export function resetStartupCoordinatorForTests(): void {
  generation += 1
  inFlight = null
  status = 'idle'
}

export function retryStartupAt(path: string): void {
  useAuthStore.setState({ authCheckFailed: false, isLoading: true })
  void runCriticalStartup({ path, force: true })
}

export async function runCriticalStartup(opts: {
  path: string
  force?: boolean
} ): Promise<void> {
  if (inFlight && !opts.force) return inFlight
  const gen = ++generation
  const work = execute(gen, opts.path)
  inFlight = work
  void work.finally(() => {
    if (inFlight === work) inFlight = null
  })
  return work
}

async function execute(gen: number, path: string): Promise<void> {
  status = 'running'
  try {
    const publicAuth = isPublicAuthPath(path)
    const auth = useAuthStore.getState()
    const alreadyAuthenticated = auth.isAuthenticated

    if (!publicAuth) {
      if (alreadyAuthenticated) {
        useAuthStore.setState({ isLoading: false })
        await useAuthStore.getState().loadUser({ silent: true })
      } else {
        await useAuthStore.getState().loadUser()
      }
    } else if (isLoginOrRequestAccessPath(path)) {
      if (isFamilyDataPlane() && useAuthStore.getState().isAuthenticated) {
        useAuthStore.setState({ isLoading: false })
        await useAuthStore.getState().loadUser({ silent: true })
      } else if (!useAuthStore.getState().isAuthenticated) {
        useAuthStore.setState({ isLoading: false })
      }
    }

    if (gen !== generation) return

    if (isFamilyDataPlane()) {
      applySupabaseAppFlags()
    } else {
      const reloading = await loadNestAppConfig()
      if (reloading) return
    }

    if (gen !== generation) return
    status = 'ready'
  } catch {
    if (gen !== generation) return
    status = 'failed'
    const current = useAuthStore.getState()
    if (current.isLoading) {
      useAuthStore.setState({ isLoading: false, authCheckFailed: true })
    }
  }
}
