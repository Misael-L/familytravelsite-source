import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAllStores, seedStore } from '../../tests/helpers/store'
import { useAuthStore } from './authStore'

const isSupabaseMock = vi.hoisted(() => vi.fn(() => true))
const countUnread = vi.hoisted(() => vi.fn())
const listInbox = vi.hoisted(() => vi.fn())

vi.mock('../data/supabase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/auth')>()
  return { ...actual, isSupabaseDataPlane: isSupabaseMock }
})

vi.mock('../data/supabase/familyNotifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/familyNotifications')>()
  return {
    ...actual,
    countMyUnreadNotifications: countUnread,
    listMyNotifications: listInbox,
  }
})

import { useInAppNotificationStore } from './inAppNotificationStore'

const FAMILY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const PERSON_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
const OTHER_FAMILY = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5'

describe('inAppNotificationStore Family invalidation', () => {
  beforeEach(() => {
    resetAllStores()
    isSupabaseMock.mockReturnValue(true)
    countUnread.mockReset()
    listInbox.mockReset()
    countUnread.mockResolvedValue(3)
    listInbox.mockResolvedValue({ items: [], nextCursor: null })
    seedStore(useAuthStore, {
      isAuthenticated: true,
      familyId: FAMILY_ID,
      personId: PERSON_ID,
      authGate: 'ok',
    })
    useInAppNotificationStore.getState().beginFamilyInboxSession(FAMILY_ID, PERSON_ID)
  })

  it('refreshes unread via RPC and does not ingest a Realtime row DTO', async () => {
    useInAppNotificationStore.setState({ unreadCount: 0 })
    useInAppNotificationStore.getState().invalidateFamilyInbox()
    await vi.waitFor(() => {
      expect(countUnread).toHaveBeenCalledWith(FAMILY_ID)
    })
    expect(useInAppNotificationStore.getState().unreadCount).toBe(3)
    expect(useInAppNotificationStore.getState().inboxStale).toBe(true)
    expect(listInbox).not.toHaveBeenCalled()
    expect(useInAppNotificationStore.getState().notifications).toEqual([])
  })

  it('refetches the list through listMyNotifications when the inbox page is active', async () => {
    listInbox.mockResolvedValue({
      items: [{
        id: 'n-1',
        familyId: FAMILY_ID,
        eventKey: 'proposal.created',
        destinationKind: 'proposal',
        sourceId: 'p-1',
        tripId: null,
        label: 'Italy',
        resolvedStatus: null,
        readAt: null,
        dismissedAt: null,
        createdAt: '2026-08-29T00:00:00.000Z',
      }],
      nextCursor: null,
    })
    useInAppNotificationStore.getState().setInboxPageActive(true)
    useInAppNotificationStore.getState().invalidateFamilyInbox()
    await vi.waitFor(() => {
      expect(useInAppNotificationStore.getState().notifications[0]?.id).toBe('n-1')
    })
    expect(listInbox).toHaveBeenCalled()
    expect(useInAppNotificationStore.getState().inboxStale).toBe(false)
  })

  it('ignores a late unread refresh from a previous family', async () => {
    let finishFirst: ((count: number) => void) | undefined
    countUnread.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }))
    const first = useInAppNotificationStore.getState().fetchUnreadCount()
    seedStore(useAuthStore, { familyId: OTHER_FAMILY, personId: PERSON_ID })
    useInAppNotificationStore.getState().beginFamilyInboxSession(OTHER_FAMILY, PERSON_ID)
    countUnread.mockResolvedValueOnce(9)
    await useInAppNotificationStore.getState().fetchUnreadCount()
    finishFirst?.(4)
    await first
    expect(useInAppNotificationStore.getState().unreadCount).toBe(9)
  })

  it('keeps the current unread count when a refresh fails', async () => {
    useInAppNotificationStore.setState({ unreadCount: 7 })
    countUnread.mockRejectedValueOnce(new Error('network'))
    await useInAppNotificationStore.getState().fetchUnreadCount()
    expect(useInAppNotificationStore.getState().unreadCount).toBe(7)
  })
})
