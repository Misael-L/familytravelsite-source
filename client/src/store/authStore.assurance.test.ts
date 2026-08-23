import { describe, expect, it } from 'vitest'
import {
  selectIsBlockedMembershipGate,
  selectMayHydratePrivateFamily,
  useAuthStore,
} from './authStore'

describe('pre-AAL hydration helpers', () => {
  it('blocks private hydration until bootstrap gate is ok on supabase', () => {
    expect(selectMayHydratePrivateFamily(null, true)).toBe(false)
    expect(selectMayHydratePrivateFamily('mfa_enroll', true)).toBe(false)
    expect(selectMayHydratePrivateFamily('mfa_challenge', true)).toBe(false)
    expect(selectMayHydratePrivateFamily('unlinked', true)).toBe(false)
    expect(selectMayHydratePrivateFamily('ok', true)).toBe(true)
  })

  it('keeps Nest hydration on isAuthenticated (no authGate)', () => {
    expect(selectMayHydratePrivateFamily(null, false)).toBe(true)
  })

  it('treats unlinked as a blocked membership gate', () => {
    expect(selectIsBlockedMembershipGate('unlinked')).toBe(true)
    expect(selectIsBlockedMembershipGate('pending_invite')).toBe(true)
    expect(selectIsBlockedMembershipGate('ok')).toBe(false)
    expect(selectIsBlockedMembershipGate(null)).toBe(false)
  })

  it('does not persist membershipLoaded or authGate', () => {
    const partial = useAuthStore.persist.getOptions().partialize?.(useAuthStore.getState()) as Record<string, unknown>
    expect(partial).not.toHaveProperty('membershipLoaded')
    expect(partial).not.toHaveProperty('authGate')
    expect(partial).not.toHaveProperty('membershipStatus')
  })
})
