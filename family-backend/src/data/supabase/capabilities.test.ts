import { describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import { canDraftTripChanges, canMutateTrip, canReviewFamilyAdmin } from './capabilities'

describe('canReviewFamilyAdmin', () => {
  it('matches can_review_access: super-admin, patriarch, parent', () => {
    expect(canReviewFamilyAdmin({ isSuperAdmin: true, membershipRole: 'guest' })).toBe(true)
    expect(canReviewFamilyAdmin({ isSuperAdmin: false, membershipRole: 'patriarch' })).toBe(true)
    expect(canReviewFamilyAdmin({ isSuperAdmin: false, membershipRole: 'parent' })).toBe(true)
  })

  it('denies child and guest', () => {
    expect(canReviewFamilyAdmin({ isSuperAdmin: false, membershipRole: 'child' })).toBe(false)
    expect(canReviewFamilyAdmin({ isSuperAdmin: false, membershipRole: 'guest' })).toBe(false)
    expect(canReviewFamilyAdmin({ isSuperAdmin: false, membershipRole: null })).toBe(false)
  })
})

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

describe('canMutateTrip', () => {
  it('throws on RPC error instead of returning false', async () => {
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    } as never)
    await expect(canMutateTrip('trip-1')).rejects.toMatchObject({ message: 'boom' })
  })

  it('returns the RPC boolean on success', async () => {
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    } as never)
    await expect(canMutateTrip('trip-1')).resolves.toBe(true)
  })
})

describe('canDraftTripChanges', () => {
  it('throws on RPC error instead of returning false', async () => {
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    } as never)
    await expect(canDraftTripChanges('trip-1')).rejects.toMatchObject({ message: 'boom' })
  })

  it('calls can_draft_trip_changes with p_trip_id', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
    await expect(canDraftTripChanges('trip-2')).resolves.toBe(true)
    expect(rpc).toHaveBeenCalledWith('can_draft_trip_changes', { p_trip_id: 'trip-2' })
  })
})
