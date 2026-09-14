import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAllStores, seedStore } from '../../tests/helpers/store'
import { useAuthStore } from '../store/authStore'

const startSession = vi.hoisted(() => vi.fn())
const stopSession = vi.hoisted(() => vi.fn())
const stopAll = vi.hoisted(() => vi.fn())
const bindItinerary = vi.hoisted(() => vi.fn())
const isSupabaseMock = vi.hoisted(() => vi.fn(() => false))

vi.mock('../data/supabase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/auth')>()
  return { ...actual, isSupabaseDataPlane: isSupabaseMock }
})

vi.mock('../data/supabase/familyNotifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/familyNotifications')>()
  return {
    ...actual,
    countMyUnreadNotifications: vi.fn().mockResolvedValue(0),
    listMyNotifications: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  }
})

vi.mock('../data/supabase/familyRealtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/familyRealtime')>()
  return {
    ...actual,
    familyRealtime: {
      startSession,
      stopSession,
      stopAll,
      bindItinerary,
      getStatus: () => 'idle',
      getActiveKey: () => null,
    },
  }
})

import { useFamilyInboxRefresh } from './useFamilyInboxRefresh'

const FAMILY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const PERSON_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'

describe('useFamilyInboxRefresh', () => {
  beforeEach(() => {
    resetAllStores()
    startSession.mockReset()
    stopSession.mockReset()
    stopAll.mockReset()
    bindItinerary.mockReset()
    isSupabaseMock.mockReturnValue(false)
  })

  it('does not start Realtime on the Nest plane', () => {
    isSupabaseMock.mockReturnValue(false)
    seedStore(useAuthStore, {
      isAuthenticated: true,
      familyId: FAMILY_ID,
      personId: PERSON_ID,
      authGate: 'ok',
    })
    const { unmount } = renderHook(() => useFamilyInboxRefresh())
    expect(startSession).not.toHaveBeenCalled()
    unmount()
  })

  it('does not start Realtime on public/unlinked/pre-AAL gates', () => {
    isSupabaseMock.mockReturnValue(true)
    seedStore(useAuthStore, {
      isAuthenticated: true,
      familyId: FAMILY_ID,
      personId: PERSON_ID,
      authGate: 'mfa_challenge',
    })
    renderHook(() => useFamilyInboxRefresh())
    expect(startSession).not.toHaveBeenCalled()
    expect(stopAll).toHaveBeenCalled()

    resetAllStores()
    seedStore(useAuthStore, {
      isAuthenticated: true,
      familyId: FAMILY_ID,
      personId: null,
      authGate: 'unlinked',
    })
    renderHook(() => useFamilyInboxRefresh())
    expect(startSession).not.toHaveBeenCalled()

    resetAllStores()
    seedStore(useAuthStore, { isAuthenticated: false, familyId: null, personId: null, authGate: null })
    renderHook(() => useFamilyInboxRefresh())
    expect(startSession).not.toHaveBeenCalled()
  })

  it('starts the Family channel when authenticated, linked, and authGate is ok', () => {
    isSupabaseMock.mockReturnValue(true)
    seedStore(useAuthStore, {
      isAuthenticated: true,
      familyId: FAMILY_ID,
      personId: PERSON_ID,
      authGate: 'ok',
    })
    const { unmount } = renderHook(() => useFamilyInboxRefresh())
    expect(startSession).toHaveBeenCalledTimes(1)
    expect(startSession.mock.calls[0][0]).toMatchObject({ familyId: FAMILY_ID, personId: PERSON_ID })
    unmount()
    expect(stopSession).toHaveBeenCalled()
  })
})
