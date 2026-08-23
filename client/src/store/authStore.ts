import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User as SbUser } from '@supabase/supabase-js'
import { authApi } from '../api/client'
import { connect, disconnect } from '../api/websocket'
import type { User } from '../types'
import { getApiErrorMessage } from '../types'
import { tripSyncManager } from '../sync/tripSyncManager'
import { reopenForUser, deleteCurrentUserDb } from '../db/offlineDb'
import { setAuthed } from '../sync/authGate'
import { unregisterSyncTriggers } from '../sync/syncTriggers'
import { useSystemNoticeStore } from './systemNoticeStore.js'
import { clearAppearanceSnapshot } from '../theme/applyAppearance'
import {
  getSupabaseSession,
  isSupabaseDataPlane,
  signInWithPassword,
  signOutSupabase,
  type FamilyAuthGate,
} from '../data/supabase/auth'
import {
  isFamilyMember,
  loadMembershipSnapshot,
  type MembershipSnapshot,
} from '../data/supabase/membership'

interface AuthResponse {
  user: User
  token: string
}

export type LoginResult = AuthResponse | { mfa_required: true; mfa_token: string }

interface AvatarResponse {
  avatar_url: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  authCheckFailed: boolean
  error: string | null
  demoMode: boolean
  devMode: boolean
  isPrerelease: boolean
  appVersion: string
  hasMapsKey: boolean
  serverTimezone: string
  appRequireMfa: boolean
  tripRemindersEnabled: boolean
  placesPhotosEnabled: boolean
  placesAutocompleteEnabled: boolean
  placesDetailsEnabled: boolean

  /** Family Travel Supabase session (W1+). Null on Nest plane. */
  authUserId: string | null
  personId: string | null
  familyId: string | null
  membershipRole: string | null
  isSuperAdmin: boolean
  membershipLoaded: boolean
  membershipStatus: string | null
  authGate: FamilyAuthGate | null

  login: (email: string, password: string, rememberMe?: boolean) => Promise<LoginResult>
  completeMfaLogin: (mfaToken: string, code: string, rememberMe?: boolean) => Promise<AuthResponse>
  register: (username: string, email: string, password: string, invite_token?: string) => Promise<AuthResponse>
  logout: () => Promise<void>
  loadUser: (opts?: { silent?: boolean }) => Promise<void>
  updateMapsKey: (key: string | null) => Promise<void>
  updateApiKeys: (keys: Record<string, string | null>) => Promise<void>
  updateProfile: (profileData: Partial<User>) => Promise<void>
  uploadAvatar: (file: File) => Promise<AvatarResponse>
  deleteAvatar: () => Promise<void>
  setDemoMode: (val: boolean) => void
  setDevMode: (val: boolean) => void
  setIsPrerelease: (val: boolean) => void
  setAppVersion: (val: string) => void
  setHasMapsKey: (val: boolean) => void
  setServerTimezone: (tz: string) => void
  setAppRequireMfa: (val: boolean) => void
  setTripRemindersEnabled: (val: boolean) => void
  setPlacesPhotosEnabled: (val: boolean) => void
  setPlacesAutocompleteEnabled: (val: boolean) => void
  setPlacesDetailsEnabled: (val: boolean) => void
  demoLogin: () => Promise<AuthResponse>
}

let authSequence = 0

async function onAuthSuccess(userId: number): Promise<void> {
  setAuthed(true)
  try {
    await reopenForUser(userId)
  } catch (err) {
    console.error('[auth] failed to open user-scoped offline DB', err)
  }
}

function clearMembershipFields() {
  return {
    authUserId: null as string | null,
    personId: null as string | null,
    familyId: null as string | null,
    membershipRole: null as string | null,
    isSuperAdmin: false,
    membershipLoaded: false,
    membershipStatus: null as string | null,
    authGate: null as FamilyAuthGate | null,
  }
}

function supabaseUserToTrekUser(sbUser: SbUser): User {
  const email = sbUser.email ?? ''
  const username =
    (typeof sbUser.user_metadata?.username === 'string' && sbUser.user_metadata.username) ||
    (typeof sbUser.user_metadata?.full_name === 'string' && sbUser.user_metadata.full_name) ||
    email.split('@')[0] ||
    'member'
  return {
    // Sentinel — Nest APIs must not use this on the supabase plane.
    id: 0,
    username,
    email,
    role: 'user',
    avatar_url: null,
    maps_api_key: null,
    created_at: sbUser.created_at,
    mfa_enabled: false,
    must_change_password: false,
  }
}

function membershipToState(snapshot: MembershipSnapshot) {
  return {
    personId: snapshot.personId,
    familyId: snapshot.familyId,
    membershipRole: snapshot.role,
    isSuperAdmin: snapshot.isSuperAdmin,
    membershipLoaded: true,
    membershipStatus: snapshot.membershipStatus,
    authGate: snapshot.gate,
    appRequireMfa: snapshot.reviewerMfaRequired,
  }
}

async function applySupabaseSession(sbUser: SbUser): Promise<{ user: User; snapshot: MembershipSnapshot }> {
  const user = supabaseUserToTrekUser(sbUser)
  const snapshot = await loadMembershipSnapshot(sbUser.id)
  if (snapshot.isSuperAdmin) {
    user.role = 'admin'
  }
  user.mfa_enabled = snapshot.hasVerifiedTotp
  setAuthed(true)
  return { user, snapshot }
}

export function selectIsFamilyMember(state: Pick<AuthState, 'isSuperAdmin' | 'membershipRole' | 'membershipStatus'>): boolean {
  return isFamilyMember({
    isSuperAdmin: state.isSuperAdmin,
    role: state.membershipRole,
    membershipStatus: state.membershipStatus ?? (state.membershipRole ? 'active' : 'none'),
  })
}

const BLOCKED_MEMBERSHIP_GATES: FamilyAuthGate[] = [
  'unlinked',
  'pending_invite',
  'suspended',
  'no_membership',
]

/** True when bootstrap finished and the member must not enter the private shell. */
export function selectIsBlockedMembershipGate(authGate: FamilyAuthGate | null): boolean {
  return authGate != null && BLOCKED_MEMBERSHIP_GATES.includes(authGate)
}

/**
 * Private family reads (prefs, inbox, avatars, accent) wait for bootstrap `ok`.
 * Nest plane has no authGate — hydration stays on `isAuthenticated`.
 */
export function selectMayHydratePrivateFamily(
  authGate: FamilyAuthGate | null,
  supabasePlane = isSupabaseDataPlane(),
): boolean {
  if (!supabasePlane) return true
  return authGate === 'ok'
}

export const useAuthStore = create<AuthState>()(
  persist(
  (set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  authCheckFailed: false,
  error: null,
  demoMode: localStorage.getItem('demo_mode') === 'true',
  devMode: false,
  isPrerelease: false,
  appVersion: '',
  hasMapsKey: false,
  serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  appRequireMfa: false,
  tripRemindersEnabled: false,
  placesPhotosEnabled: true,
  placesAutocompleteEnabled: true,
  placesDetailsEnabled: true,
  ...clearMembershipFields(),

  login: async (email: string, password: string, rememberMe?: boolean) => {
    authSequence++
    set({ isLoading: true, error: null })
    try {
      if (isSupabaseDataPlane()) {
        const session = await signInWithPassword(email, password)
        const { user, snapshot } = await applySupabaseSession(session.user)
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
          authUserId: session.user.id,
          authCheckFailed: false,
          ...membershipToState(snapshot),
        })
        if (snapshot.gate === 'mfa_challenge') {
          return { mfa_required: true as const, mfa_token: 'supabase-totp' }
        }
        return { user, token: session.access_token }
      }

      const data = await authApi.login({ email, password, remember_me: rememberMe }) as AuthResponse & { mfa_required?: boolean; mfa_token?: string }
      if (data.mfa_required && data.mfa_token) {
        set({ isLoading: false, error: null })
        return { mfa_required: true as const, mfa_token: data.mfa_token }
      }
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        ...clearMembershipFields(),
      })
      await onAuthSuccess(data.user.id)
      connect()
      tripSyncManager.syncAll().catch(console.error)
      if (!data.user?.must_change_password) {
        useSystemNoticeStore.getState().fetch()
      }
      return data as AuthResponse
    } catch (err: unknown) {
      const error = isSupabaseDataPlane()
        ? (err instanceof Error ? err.message : 'Login failed')
        : getApiErrorMessage(err, 'Login failed')
      set({ isLoading: false, error })
      throw new Error(error)
    }
  },

  completeMfaLogin: async (mfaToken: string, code: string, rememberMe?: boolean) => {
    if (isSupabaseDataPlane()) {
      authSequence++
      set({ isLoading: true, error: null })
      try {
        const { listTotpFactors, verifyTotpFactor } = await import('../data/supabase/auth')
        const factors = await listTotpFactors()
        const factor = factors.find(f => f.status === 'verified') ?? factors[0]
        if (!factor) throw new Error('No authenticator enrolled')
        await verifyTotpFactor(factor.id, code)
        const session = await getSupabaseSession()
        if (!session?.user) throw new Error('No session after MFA')
        const { user, snapshot } = await applySupabaseSession(session.user)
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
          authUserId: session.user.id,
          authCheckFailed: false,
          ...membershipToState(snapshot),
        })
        return { user, token: session.access_token }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : 'Verification failed'
        set({ isLoading: false, error })
        throw new Error(error)
      }
    }
    authSequence++
    set({ isLoading: true, error: null })
    try {
      const data = await authApi.verifyMfaLogin({ mfa_token: mfaToken, code: code.replace(/\s/g, ''), remember_me: rememberMe })
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        ...clearMembershipFields(),
      })
      await onAuthSuccess(data.user.id)
      connect()
      tripSyncManager.syncAll().catch(console.error)
      if (!data.user?.must_change_password) {
        useSystemNoticeStore.getState().fetch()
      }
      return data as AuthResponse
    } catch (err: unknown) {
      const error = getApiErrorMessage(err, 'Verification failed')
      set({ isLoading: false, error })
      throw new Error(error)
    }
  },

  register: async (username: string, email: string, password: string, invite_token?: string) => {
    if (isSupabaseDataPlane()) {
      throw new Error('Registration is managed in the Family Travel iOS app / Supabase Auth — not via this form')
    }
    authSequence++
    set({ isLoading: true, error: null })
    try {
      const data = await authApi.register({ username, email, password, invite_token })
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        ...clearMembershipFields(),
      })
      await onAuthSuccess(data.user.id)
      connect()
      tripSyncManager.syncAll().catch(console.error)
      useSystemNoticeStore.getState().fetch()
      return data
    } catch (err: unknown) {
      const error = getApiErrorMessage(err, 'Registration failed')
      set({ isLoading: false, error })
      throw new Error(error)
    }
  },

  logout: async () => {
    setAuthed(false)
    set({ isAuthenticated: false })
    unregisterSyncTriggers()
    disconnect()
    useSystemNoticeStore.getState().reset()
    clearAppearanceSnapshot()

    if (isSupabaseDataPlane()) {
      await signOutSupabase().catch(() => {})
    } else {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
      if ('caches' in window) {
        await Promise.all([
          caches.delete('api-data').catch(() => {}),
          caches.delete('user-uploads').catch(() => {}),
        ])
      }
      await deleteCurrentUserDb().catch(console.error)
    }

    set({
      user: null,
      isAuthenticated: false,
      authCheckFailed: false,
      error: null,
      ...clearMembershipFields(),
    })
  },

  loadUser: async (opts?: { silent?: boolean }) => {
    const seq = authSequence
    const silent = !!opts?.silent
    if (!silent) set({ isLoading: true })

    if (isSupabaseDataPlane()) {
      try {
        const session = await getSupabaseSession()
        if (seq !== authSequence) return
        if (!session?.user) {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            authCheckFailed: false,
            ...clearMembershipFields(),
          })
          return
        }
        const { user, snapshot } = await applySupabaseSession(session.user)
        if (seq !== authSequence) return
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          authCheckFailed: false,
          authUserId: session.user.id,
          ...membershipToState(snapshot),
        })
      } catch (err: unknown) {
        if (seq !== authSequence) return
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          set({ isLoading: false })
          return
        }
        console.error('[auth] supabase loadUser failed', err)
        set({ isLoading: false, authCheckFailed: true })
      }
      return
    }

    try {
      const data = await authApi.me()
      if (seq !== authSequence) return
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
        authCheckFailed: false,
        ...clearMembershipFields(),
      })
      await onAuthSuccess(data.user.id)
      connect()
    } catch (err: unknown) {
      if (seq !== authSequence) return
      const status = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { status?: number } }).response?.status
        : undefined
      if (status === 401) {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          authCheckFailed: false,
          ...clearMembershipFields(),
        })
      } else if (status === undefined && typeof navigator !== 'undefined' && !navigator.onLine) {
        set({ isLoading: false })
      } else {
        set({ isLoading: false, authCheckFailed: true })
      }
    }
  },

  updateMapsKey: async (key: string | null) => {
    if (isSupabaseDataPlane()) {
      throw new Error('Maps API key settings are not available on the Supabase plane yet')
    }
    try {
      await authApi.updateMapsKey(key)
      set((state) => ({
        user: state.user ? { ...state.user, maps_api_key: key || null } : null,
        hasMapsKey: !!key,
      }))
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error saving API key'))
    }
  },

  updateApiKeys: async (keys: Record<string, string | null>) => {
    if (isSupabaseDataPlane()) {
      throw new Error('API key settings are not available on the Supabase plane yet')
    }
    try {
      const data = await authApi.updateApiKeys(keys)
      set({ user: data.user })
      if ('maps_api_key' in keys) {
        set({ hasMapsKey: !!keys.maps_api_key })
      }
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error saving API keys'))
    }
  },

  updateProfile: async (profileData: Partial<User>) => {
    if (isSupabaseDataPlane()) {
      throw new Error('Profile settings are not available on the Supabase plane yet')
    }
    try {
      const data = await authApi.updateSettings(profileData)
      set({ user: data.user })
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error updating profile'))
    }
  },

  uploadAvatar: async (file: File) => {
    if (isSupabaseDataPlane()) {
      throw new Error('Avatar upload is not available on the Supabase plane yet')
    }
    const formData = new FormData()
    formData.append('avatar', file)
    const data = await authApi.uploadAvatar(formData)
    set((state) => ({ user: state.user ? { ...state.user, avatar_url: data.avatar_url } : null }))
    return data
  },

  deleteAvatar: async () => {
    if (isSupabaseDataPlane()) {
      throw new Error('Avatar delete is not available on the Supabase plane yet')
    }
    await authApi.deleteAvatar()
    set((state) => ({ user: state.user ? { ...state.user, avatar_url: null } : null }))
  },

  setDemoMode: (val: boolean) => {
    if (val) localStorage.setItem('demo_mode', 'true')
    else localStorage.removeItem('demo_mode')
    set({ demoMode: val })
  },

  setDevMode: (val: boolean) => set({ devMode: val }),
  setIsPrerelease: (val: boolean) => set({ isPrerelease: val }),
  setAppVersion: (val: string) => set({ appVersion: val }),
  setHasMapsKey: (val: boolean) => set({ hasMapsKey: val }),
  setServerTimezone: (tz: string) => set({ serverTimezone: tz }),
  setAppRequireMfa: (val: boolean) => set({ appRequireMfa: val }),
  setTripRemindersEnabled: (val: boolean) => set({ tripRemindersEnabled: val }),
  setPlacesPhotosEnabled: (val: boolean) => set({ placesPhotosEnabled: val }),
  setPlacesAutocompleteEnabled: (val: boolean) => set({ placesAutocompleteEnabled: val }),
  setPlacesDetailsEnabled: (val: boolean) => set({ placesDetailsEnabled: val }),

  demoLogin: async () => {
    if (isSupabaseDataPlane()) {
      throw new Error('Demo login is not available on the Supabase data plane')
    }
    authSequence++
    set({ isLoading: true, error: null })
    try {
      const data = await authApi.demoLogin()
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
        demoMode: true,
        error: null,
        ...clearMembershipFields(),
      })
      await onAuthSuccess(data.user.id)
      connect()
      return data
    } catch (err: unknown) {
      const error = getApiErrorMessage(err, 'Demo login failed')
      set({ isLoading: false, error })
      throw new Error(error)
    }
  },
  }),
  {
    name: 'trek_auth_snapshot',
    partialize: (state) => ({
      isAuthenticated: state.isAuthenticated,
      user: state.user ? {
        id: state.user.id,
        username: state.user.username,
        email: state.user.email,
        role: state.user.role,
        avatar_url: state.user.avatar_url,
        mfa_enabled: state.user.mfa_enabled,
        must_change_password: state.user.must_change_password,
      } : null,
      authUserId: state.authUserId,
      personId: state.personId,
      familyId: state.familyId,
      membershipRole: state.membershipRole,
      isSuperAdmin: state.isSuperAdmin,
    }),
  }
))
