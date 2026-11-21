import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import {
  getFamilyFilePolicy,
  getFamilyIdentityAssurance,
  linkFamilyMemberPerson,
} from './familyIdentity'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

describe('familyIdentity adapter', () => {
  const rpc = vi.fn()

  beforeEach(() => {
    rpc.mockReset()
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ rpc } as never)
  })

  it('maps assurance health without tokens or secrets', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        family_id: 'fam-1',
        can_manage: true,
        members: [{
          member_id: 'm1',
          user_id: 'u1',
          person_id: 'p1',
          role: 'patriarch',
          status: 'active',
          email_confirmed: true,
          person_linked: true,
          has_verified_totp: true,
          reviewer_mfa_required: true,
          last_sign_in_at: '2026-08-01T00:00:00Z',
          providers: ['email'],
        }],
        unlinked_people: [{ person_id: 'p2', display_name: 'Kid', has_roster_email: true }],
        pending_requests: [{ request_id: 'r1', status: 'pending', requested_role: 'guest', created_at: '2026-08-01' }],
      },
      error: null,
    })
    const snap = await getFamilyIdentityAssurance('fam-1')
    expect(rpc).toHaveBeenCalledWith('get_family_identity_assurance', { p_family_id: 'fam-1' })
    expect(snap.canManage).toBe(true)
    expect(snap.members[0]).toMatchObject({ memberId: 'm1', hasVerifiedTotp: true })
    expect(JSON.stringify(snap)).not.toMatch(/token|secret|ip_address/i)
  })

  it('throws when identity RPC errors', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'denied' } })
    await expect(getFamilyIdentityAssurance('fam-1')).rejects.toMatchObject({ message: 'denied' })
  })

  it('maps file policy counts', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        family_id: 'fam-1',
        can_manage: false,
        trash_count: 2,
        pending_cleanup: 1,
        dead_letters: 0,
        retention_days: 30,
        trip_file_max_bytes: 50,
        avatar_max_bytes: 8,
        trip_file_mime: ['application/pdf'],
        image_mime: ['image/jpeg'],
      },
      error: null,
    })
    const policy = await getFamilyFilePolicy('fam-1')
    expect(policy.trashCount).toBe(2)
    expect(policy.canManage).toBe(false)
  })

  it('links via HOF RPC and throws on error', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null })
    await linkFamilyMemberPerson({ familyId: 'fam-1', personId: 'p1', userId: 'u1' })
    expect(rpc).toHaveBeenCalledWith('link_family_member_person', {
      p_family_id: 'fam-1',
      p_person_id: 'p1',
      p_user_id: 'u1',
    })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'cross-family' } })
    await expect(linkFamilyMemberPerson({ familyId: 'fam-1', personId: 'p1', userId: 'u2' }))
      .rejects.toMatchObject({ message: 'cross-family' })
  })
})
