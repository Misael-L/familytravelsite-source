import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAllStores, seedStore } from '../../tests/helpers/store'
import { useAuthStore } from '../store/authStore'

const bindItinerary = vi.hoisted(() => vi.fn())
const isSupabaseMock = vi.hoisted(() => vi.fn(() => true))

vi.mock('../data/supabase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/auth')>()
  return { ...actual, isSupabaseDataPlane: isSupabaseMock }
})

vi.mock('../data/supabase/familyRealtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/familyRealtime')>()
  return {
    ...actual,
    familyRealtime: {
      startSession: vi.fn(),
      stopSession: vi.fn(),
      stopAll: vi.fn(),
      bindItinerary,
      getStatus: () => 'subscribed',
      getActiveKey: () => null,
    },
  }
})

import { useFamilyItineraryRealtime } from './useFamilyItineraryRealtime'

const FAMILY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const PERSON_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
const TRIP_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'

describe('useFamilyItineraryRealtime', () => {
  beforeEach(() => {
    resetAllStores()
    bindItinerary.mockReset()
    isSupabaseMock.mockReturnValue(true)
    seedStore(useAuthStore, {
      isAuthenticated: true,
      familyId: FAMILY_ID,
      personId: PERSON_ID,
      authGate: 'ok',
    })
  })

  it('binds a UUID trip and unbinds on unmount', () => {
    const reload = vi.fn()
    const { unmount } = renderHook(() => useFamilyItineraryRealtime(TRIP_ID, reload))
    expect(bindItinerary).toHaveBeenCalledWith(expect.objectContaining({ tripId: TRIP_ID }))
    unmount()
    expect(bindItinerary).toHaveBeenLastCalledWith(null)
  })

  it('does not bind a non-UUID trip or Nest plane', () => {
    const { unmount } = renderHook(() => useFamilyItineraryRealtime('12', vi.fn()))
    expect(bindItinerary).toHaveBeenCalledWith(null)
    unmount()

    bindItinerary.mockClear()
    isSupabaseMock.mockReturnValue(false)
    renderHook(() => useFamilyItineraryRealtime(TRIP_ID, vi.fn()))
    expect(bindItinerary).toHaveBeenCalledWith(null)
  })
})
