import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import {
  familyInboxNavigateTarget,
  getFamilyNotificationDefaults,
  getMyNotificationPreferences,
  listMyNotifications,
  markNotificationsRead,
} from './familyNotifications'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

describe('familyNotifications adapters', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseBrowserClient).mockReset()
  })

  it('throws when get_family_notification_defaults errors', async () => {
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    } as never)
    await expect(getFamilyNotificationDefaults('fam-1')).rejects.toMatchObject({ message: 'boom' })
  })

  it('maps Admin defaults, can_manage, and device count without tokens', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        family_id: 'fam-1',
        can_manage: true,
        in_app_mandatory: true,
        defaults: [{
          event_key: 'proposal.created',
          destination_kind: 'proposal',
          display_order: 20,
          push_enabled: false,
          source: 'family',
        }],
        health: { active_ios_devices: 2 },
      },
      error: null,
    })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
    const result = await getFamilyNotificationDefaults('fam-1')
    expect(result.canManage).toBe(true)
    expect(result.health.activeIosDevices).toBe(2)
    expect(result.defaults[0]).toMatchObject({ eventKey: 'proposal.created', pushEnabled: false, source: 'family' })
  })

  it('maps member effective push source metadata', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        family_id: 'fam-1',
        person_id: 'p-1',
        events: [{
          event_key: 'proposal.created',
          destination_kind: 'proposal',
          display_order: 20,
          push_enabled: true,
          source: 'member',
          family_push_enabled: false,
          catalog_push_enabled: true,
        }],
      },
      error: null,
    })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
    const result = await getMyNotificationPreferences('fam-1')
    expect(result.events[0].source).toBe('member')
    expect(result.events[0].familyPushEnabled).toBe(false)
  })

  it('lists inbox rows and throws on error', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        items: [{
          id: 'n-1',
          family_id: 'fam-1',
          event_key: 'proposal.created',
          destination_kind: 'proposal',
          source_id: 'prop-1',
          trip_id: 'trip-1',
          label: 'Italy',
          read_at: null,
          created_at: '2026-08-21T00:00:00.000Z',
        }],
        next_cursor: null,
      },
      error: null,
    })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
    const page = await listMyNotifications('fam-1')
    expect(page.items[0].id).toBe('n-1')
    expect(familyInboxNavigateTarget(page.items[0])).toBe('/')
  })

  it('mark read sends UUID array', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { updated: 1 }, error: null })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
    await markNotificationsRead(['n-1'])
    expect(rpc).toHaveBeenCalledWith('mark_notifications_read', { p_ids: ['n-1'] })
  })
})
