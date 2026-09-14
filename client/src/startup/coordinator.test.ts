import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../store/authStore'
import {
  getStartupStatus,
  isStartupInFlight,
  resetStartupCoordinatorForTests,
  runCriticalStartup,
} from './coordinator'

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      getAppConfig: vi.fn().mockResolvedValue({ version: 'test' }),
    },
  }
})

describe('startup coordinator', () => {
  beforeEach(() => {
    resetStartupCoordinatorForTests()
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: true,
      authCheckFailed: false,
      loadUser: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('joins overlapping runs (StrictMode double-invoke)', async () => {
    let release: (() => void) | undefined
    const loadUser = vi.fn().mockImplementation(
      () => new Promise<void>(resolve => { release = resolve }),
    )
    useAuthStore.setState({ loadUser, isAuthenticated: false })

    const first = runCriticalStartup({ path: '/dashboard' })
    const second = runCriticalStartup({ path: '/dashboard' })
    expect(isStartupInFlight()).toBe(true)
    expect(loadUser).toHaveBeenCalledTimes(1)

    release?.()
    await Promise.all([first, second])
    expect(getStartupStatus()).toBe('ready')
    expect(isStartupInFlight()).toBe(false)
    expect(loadUser).toHaveBeenCalledTimes(1)
  })

  it('skips blocking loadUser on public auth routes when signed out', async () => {
    const loadUser = vi.fn().mockResolvedValue(undefined)
    useAuthStore.setState({ loadUser, isAuthenticated: false, isLoading: true })
    await runCriticalStartup({ path: '/login' })
    expect(loadUser).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  it('force retry starts a new generation and does not apply a late first result', async () => {
    let releaseFirst: (() => void) | undefined
    const loadUser = vi.fn()
      .mockImplementationOnce(() => new Promise<void>(resolve => { releaseFirst = resolve }))
      .mockResolvedValueOnce(undefined)
    useAuthStore.setState({ loadUser, isAuthenticated: false })

    const first = runCriticalStartup({ path: '/dashboard' })
    const second = runCriticalStartup({ path: '/dashboard', force: true })
    expect(loadUser).toHaveBeenCalledTimes(2)
    releaseFirst?.()
    await Promise.all([first, second])
    expect(getStartupStatus()).toBe('ready')
  })
})
