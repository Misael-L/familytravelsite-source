import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildUser } from '../../tests/helpers/factories'
import type { MembershipSnapshot } from '../data/supabase/membership'

const {
  getSupabaseSessionMock,
  isSupabaseMock,
  loadMembershipMock,
  resolveAvatarMock,
} = vi.hoisted(() => ({
  getSupabaseSessionMock: vi.fn(),
  isSupabaseMock: vi.fn(() => false),
  loadMembershipMock: vi.fn(),
  resolveAvatarMock: vi.fn(),
}))

vi.mock('../data/supabase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/auth')>()
  return {
    ...actual,
    isSupabaseDataPlane: isSupabaseMock,
    getSupabaseSession: getSupabaseSessionMock,
    signOutSupabase: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('../data/supabase/membership', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/membership')>()
  return { ...actual, loadMembershipSnapshot: loadMembershipMock }
})

vi.mock('../data/supabase/personAvatars', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/supabase/personAvatars')>()
  return { ...actual, resolveCurrentPersonAvatarUrl: resolveAvatarMock }
})

import {
  AUTH_SNAPSHOT_VERSION,
  sanitizePersistedAuthSnapshot,
  selectIsBlockedMembershipGate,
  selectMayHydratePrivateFamily,
  useAuthStore,
} from './authStore'

const okSnapshot: MembershipSnapshot = {
  isSuperAdmin: false,
  role: 'patriarch',
  familyId: 'fam-1',
  personId: 'p-1',
  membershipStatus: 'active',
  personLinked: true,
  hasVerifiedTotp: true,
  reviewerMfaRequired: false,
  gate: 'ok',
  bootstrap: null,
}

function sessionUser() {
  return {
    user: {
      id: 'auth-1',
      email: 'pat@example.com',
      user_metadata: { full_name: 'Pat', username: 'Pat' },
      created_at: '2026-01-01T00:00:00.000Z',
    },
    access_token: 'tok',
  }
}

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

  it('does not persist membershipLoaded, authGate, or avatar_url', () => {
    useAuthStore.setState({
      user: buildUser({ avatar_url: 'https://storage.example/signed-do-not-persist' }),
      isAuthenticated: true,
    })
    const partial = useAuthStore.persist.getOptions().partialize?.(useAuthStore.getState()) as Record<string, unknown>
    expect(partial).not.toHaveProperty('membershipLoaded')
    expect(partial).not.toHaveProperty('authGate')
    expect(partial).not.toHaveProperty('membershipStatus')
    const user = partial.user as Record<string, unknown>
    expect(user).not.toHaveProperty('avatar_url')
    expect(JSON.stringify(partial)).not.toContain('storage.example')
  })

  it('sanitizes legacy snapshots that already stored a signed avatar URL', () => {
    const next = sanitizePersistedAuthSnapshot({
      isAuthenticated: true,
      user: {
        id: 1,
        username: 'Pat',
        email: 'pat@example.com',
        role: 'user',
        avatar_url: 'https://storage.example/expired-signed',
        mfa_enabled: true,
      },
    }) as { user: Record<string, unknown> }
    expect(next.user).not.toHaveProperty('avatar_url')
    expect(next.user.username).toBe('Pat')
    expect(useAuthStore.persist.getOptions().version).toBe(AUTH_SNAPSHOT_VERSION)
    const migrated = useAuthStore.persist.getOptions().migrate?.(
      {
        isAuthenticated: true,
        user: { id: 1, username: 'Pat', email: 'pat@example.com', role: 'user', avatar_url: 'https://signed' },
      },
      0,
    )
    expect(migrated).toMatchObject({ user: { username: 'Pat' } })
    expect(JSON.stringify(migrated)).not.toContain('avatar_url')
  })
})

describe('supabase avatar rehydration', () => {
  beforeEach(() => {
    isSupabaseMock.mockReturnValue(true)
    getSupabaseSessionMock.mockReset()
    loadMembershipMock.mockReset()
    resolveAvatarMock.mockReset()
    getSupabaseSessionMock.mockResolvedValue(sessionUser())
    loadMembershipMock.mockResolvedValue(okSnapshot)
    useAuthStore.setState({
      user: buildUser({ username: 'Pat', email: 'pat@example.com', avatar_url: 'https://storage.example/old' }),
      isAuthenticated: true,
      authUserId: 'auth-1',
      familyId: 'fam-1',
      personId: 'p-1',
      authGate: 'ok',
      isLoading: false,
    })
  })

  it('mints a fresh signed URL after USER_UPDATED / TOKEN_REFRESHED loadUser', async () => {
    resolveAvatarMock.mockResolvedValue('https://storage.example/fresh-1h')
    await useAuthStore.getState().loadUser({ silent: true })
    expect(resolveAvatarMock).toHaveBeenCalledWith({ familyId: 'fam-1', personId: 'p-1' })
    expect(useAuthStore.getState().user?.avatar_url).toBe('https://storage.example/fresh-1h')
    const partial = useAuthStore.persist.getOptions().partialize?.(useAuthStore.getState()) as Record<string, unknown>
    expect(JSON.stringify(partial)).not.toContain('fresh-1h')
  })

  it('keeps the runtime URL when signing fails', async () => {
    resolveAvatarMock.mockRejectedValue(new Error('network'))
    await useAuthStore.getState().loadUser({ silent: true })
    expect(useAuthStore.getState().user?.avatar_url).toBe('https://storage.example/old')
  })

  it('clears the runtime URL when the family pointer is gone', async () => {
    resolveAvatarMock.mockResolvedValue(null)
    await useAuthStore.getState().loadUser({ silent: true })
    expect(useAuthStore.getState().user?.avatar_url).toBeNull()
  })

  it('does not hydrate private avatars before authGate is ok', async () => {
    loadMembershipMock.mockResolvedValue({
      ...okSnapshot,
      gate: 'mfa_challenge',
    })
    await useAuthStore.getState().loadUser({ silent: true })
    expect(resolveAvatarMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState().user?.avatar_url).toBeNull()
    expect(useAuthStore.getState().authGate).toBe('mfa_challenge')
  })
})

describe('auth sequence races', () => {
  beforeEach(() => {
    isSupabaseMock.mockReturnValue(true)
    getSupabaseSessionMock.mockReset()
    loadMembershipMock.mockReset()
    resolveAvatarMock.mockReset()
    loadMembershipMock.mockResolvedValue(okSnapshot)
    resolveAvatarMock.mockResolvedValue(null)
    useAuthStore.setState({
      user: buildUser(),
      isAuthenticated: true,
      isLoading: false,
      authCheckFailed: false,
      authUserId: 'auth-1',
      familyId: 'fam-1',
      personId: 'p-1',
      authGate: 'ok',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not restore a session after logout wins the race', async () => {
    let finish: ((value: ReturnType<typeof sessionUser>) => void) | undefined
    getSupabaseSessionMock.mockImplementation(
      () => new Promise(resolve => { finish = resolve }),
    )
    const pending = useAuthStore.getState().loadUser({ silent: true })
    await useAuthStore.getState().logout()
    finish?.(sessionUser())
    await pending
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().familyId).toBeNull()
  })

  it('marks authCheckFailed when session restore times out', async () => {
    vi.useFakeTimers()
    getSupabaseSessionMock.mockImplementation(() => new Promise(() => {}))
    const pending = useAuthStore.getState().loadUser()
    await vi.advanceTimersByTimeAsync(15_001)
    await pending
    expect(useAuthStore.getState().authCheckFailed).toBe(true)
    expect(useAuthStore.getState().isLoading).toBe(false)
    vi.useRealTimers()
  })
})
