import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import {
  enrollTotpFactor,
  getMyAuthBootstrap,
  requestPasswordRecovery,
  signOutOtherSessions,
} from './auth'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

describe('Family auth assurance adapters', () => {
  const rpc = vi.fn()
  const enroll = vi.fn()
  const signOut = vi.fn()
  const resetPasswordForEmail = vi.fn()

  beforeEach(() => {
    rpc.mockReset()
    enroll.mockReset()
    signOut.mockReset()
    resetPasswordForEmail.mockReset()
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc,
      auth: {
        mfa: { enroll },
        signOut,
        resetPasswordForEmail,
      },
    } as never)
  })

  it('maps bootstrap gates without auto-link fields', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        user_id: 'u1',
        gate: 'mfa_enroll',
        reviewer_mfa_required: true,
        membership_status: 'active',
        membership_role: 'parent',
        family_id: 'fam-1',
        person_id: 'p1',
        person_linked: true,
      },
      error: null,
    })
    const boot = await getMyAuthBootstrap()
    expect(rpc).toHaveBeenCalledWith('get_my_auth_bootstrap')
    expect(boot.gate).toBe('mfa_enroll')
    expect(boot.reviewerMfaRequired).toBe(true)
  })

  it('throws when bootstrap RPC errors', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc-fail' } })
    await expect(getMyAuthBootstrap()).rejects.toMatchObject({ message: 'rpc-fail' })
  })

  it('enrolls TOTP through Auth MFA, not Nest', async () => {
    enroll.mockResolvedValueOnce({
      data: { id: 'fac-1', totp: { qr_code: '<svg />', secret: 'ABC' } },
      error: null,
    })
    const result = await enrollTotpFactor()
    expect(result).toEqual({ factorId: 'fac-1', qrCode: '<svg />', secret: 'ABC' })
  })

  it('requests recovery against /reset-password', async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ error: null })
    await requestPasswordRecovery('a@b.c')
    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      'a@b.c',
      expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') }),
    )
  })

  it('signs out other sessions', async () => {
    signOut.mockResolvedValueOnce({ error: null })
    await signOutOtherSessions()
    expect(signOut).toHaveBeenCalledWith({ scope: 'others' })
  })
})
