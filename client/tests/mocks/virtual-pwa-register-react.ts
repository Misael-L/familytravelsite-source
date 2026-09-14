import { vi } from 'vitest'

export const updateServiceWorker = vi.fn()
export const setNeedRefresh = vi.fn()
export const setOfflineReady = vi.fn()

export const useRegisterSW = vi.fn(() => ({
  needRefresh: [false, setNeedRefresh] as [boolean, (v: boolean) => void],
  offlineReady: [false, setOfflineReady] as [boolean, (v: boolean) => void],
  updateServiceWorker,
}))
