import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import {
  listFamilyPermissionPolicies,
  listTripActionOutcomes,
  resetFamilyPermissionPolicies,
  updateFamilyPermissionPolicies,
  canTripActionDirect,
} from './familyPermissions'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

describe('familyPermissions adapters', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseBrowserClient).mockReset()
  })

  it('throws when list_family_permission_policies errors', async () => {
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    } as never)
    await expect(listFamilyPermissionPolicies('fam-1')).rejects.toMatchObject({ message: 'boom' })
  })

  it('maps policy DTO fields', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        family_id: 'fam-1',
        can_manage: true,
        policies: [{
          key: 'trip.places.manage',
          group: 'content',
          context: 'trip',
          display_order: 200,
          configurable: true,
          default_direct_scope: 'patriarch',
          default_propose_scope: 'trip_travelers',
          effective_direct_scope: 'patriarch',
          effective_propose_scope: 'trip_travelers',
          allowed_direct_scopes: ['patriarch', 'reviewers', 'trip_travelers'],
          allowed_propose_scopes: ['trip_travelers'],
          is_custom: false,
        }],
      },
      error: null,
    })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
    const result = await listFamilyPermissionPolicies('fam-1')
    expect(result.canManage).toBe(true)
    expect(result.policies[0]).toMatchObject({
      key: 'trip.places.manage',
      effectiveProposeScope: 'trip_travelers',
      isCustom: false,
    })
  })

  it('sends snake_case scopes on update and reset', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { family_id: 'fam-1', can_manage: true, policies: [] },
      error: null,
    })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
    await updateFamilyPermissionPolicies('fam-1', [{
      key: 'trip.packing.manage',
      directScope: 'trip_travelers',
      proposeScope: null,
    }])
    expect(rpc).toHaveBeenCalledWith('update_family_permission_policies', {
      p_family_id: 'fam-1',
      p_policies: [{
        key: 'trip.packing.manage',
        direct_scope: 'trip_travelers',
        propose_scope: null,
      }],
    })
    await resetFamilyPermissionPolicies('fam-1')
    expect(rpc).toHaveBeenCalledWith('reset_family_permission_policies', { p_family_id: 'fam-1' })
  })

  it('includes family.place_categories.manage in the web capability catalog', async () => {
    const { FAMILY_CAPABILITY_KEYS } = await import('./familyPermissions')
    expect(FAMILY_CAPABILITY_KEYS).toContain('family.place_categories.manage')
    expect(FAMILY_CAPABILITY_KEYS).toContain('family.templates.manage')
    expect(FAMILY_CAPABILITY_KEYS).toContain('family.defaults.manage')
    expect(FAMILY_CAPABILITY_KEYS).toContain('family.notifications.manage')
    expect(FAMILY_CAPABILITY_KEYS).toContain('family.identity.manage')
    expect(FAMILY_CAPABILITY_KEYS).toContain('family.features.manage')
    expect(FAMILY_CAPABILITY_KEYS).toContain('family.export.manage')
    expect(FAMILY_CAPABILITY_KEYS).toContain('family.maps.manage')
  })

  it('throws when list_trip_action_outcomes errors', async () => {
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } }),
    } as never)
    await expect(listTripActionOutcomes('trip-1')).rejects.toMatchObject({ message: 'denied' })
  })

  it('throws when can_trip_action_direct errors', async () => {
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } }),
    } as never)
    await expect(canTripActionDirect('trip-1', 'trip.archive')).rejects.toMatchObject({ message: 'denied' })
  })
})
