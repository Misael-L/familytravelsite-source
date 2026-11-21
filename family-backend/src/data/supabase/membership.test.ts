import { describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import { loadMembershipSnapshot } from './membership'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

describe('loadMembershipSnapshot', () => {
  it('throws when get_my_auth_bootstrap errors', async () => {
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'rpc-fail' } }),
    } as never)
    await expect(loadMembershipSnapshot('user-1')).rejects.toMatchObject({ message: 'rpc-fail' })
  })

  it('maps bootstrap without auto-linking', async () => {
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: {
          user_id: 'user-1',
          email_confirmed: true,
          aal: 'aal2',
          has_verified_totp: true,
          assurance_ok: true,
          reviewer_mfa_required: true,
          membership_status: 'active',
          membership_role: 'parent',
          family_id: 'fam-1',
          person_id: 'p-1',
          person_linked: true,
          is_super_admin: false,
          pending_access_request: false,
          gate: 'ok',
        },
        error: null,
      }),
    } as never)
    const snap = await loadMembershipSnapshot('user-1')
    expect(snap).toMatchObject({
      familyId: 'fam-1',
      personId: 'p-1',
      role: 'parent',
      gate: 'ok',
      personLinked: true,
    })
  })
})
