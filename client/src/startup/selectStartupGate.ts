import type { FamilyAuthGate } from '../data/supabase/auth'

export type StartupGate = 'loading' | 'recovery' | 'proceed'

export function selectStartupGate(
  state: {
    isLoading: boolean
    isAuthenticated: boolean
    authCheckFailed: boolean
    membershipLoaded: boolean
    authGate: FamilyAuthGate | null
  },
  supabasePlane: boolean,
): StartupGate {
  const waitingMembership =
    supabasePlane
    && state.isAuthenticated
    && (!state.membershipLoaded || state.authGate == null)

  if (state.authCheckFailed && waitingMembership) return 'recovery'
  if (state.isLoading) return 'loading'
  if (waitingMembership) return 'loading'
  return 'proceed'
}
