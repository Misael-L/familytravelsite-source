import type { Session, User as SbUser } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from './client'
import { getDataPlane } from './env'

export type FamilyAuthGate =
  | 'ok'
  | 'mfa_enroll'
  | 'mfa_challenge'
  | 'suspended'
  | 'unlinked'
  | 'no_membership'
  | 'pending_invite'

export type AuthBootstrap = {
  userId: string
  emailConfirmed: boolean
  aal: string
  hasVerifiedTotp: boolean
  assuranceOk: boolean
  reviewerMfaRequired: boolean
  membershipStatus: 'active' | 'suspended' | 'none' | string
  membershipRole: string | null
  familyId: string | null
  personId: string | null
  personLinked: boolean
  isSuperAdmin: boolean
  pendingAccessRequest: boolean
  gate: FamilyAuthGate
}

function asGate(value: unknown): FamilyAuthGate {
  const allowed: FamilyAuthGate[] = [
    'ok', 'mfa_enroll', 'mfa_challenge', 'suspended', 'unlinked', 'no_membership', 'pending_invite',
  ]
  return allowed.includes(value as FamilyAuthGate) ? (value as FamilyAuthGate) : 'no_membership'
}

export async function getMyAuthBootstrap(): Promise<AuthBootstrap> {
  const { data, error } = await getSupabaseBrowserClient().rpc('get_my_auth_bootstrap')
  if (error) throw error
  const row = (data ?? {}) as Record<string, unknown>
  return {
    userId: String(row.user_id ?? ''),
    emailConfirmed: !!row.email_confirmed,
    aal: String(row.aal ?? 'aal1'),
    hasVerifiedTotp: !!row.has_verified_totp,
    assuranceOk: !!row.assurance_ok,
    reviewerMfaRequired: !!row.reviewer_mfa_required,
    membershipStatus: String(row.membership_status ?? 'none'),
    membershipRole: row.membership_role ? String(row.membership_role) : null,
    familyId: row.family_id ? String(row.family_id) : null,
    personId: row.person_id ? String(row.person_id) : null,
    personLinked: !!row.person_linked,
    isSuperAdmin: !!row.is_super_admin,
    pendingAccessRequest: !!row.pending_access_request,
    gate: asGate(row.gate),
  }
}

export async function listTotpFactors(): Promise<Array<{ id: string; status: string; friendlyName: string | null }>> {
  const { data, error } = await getSupabaseBrowserClient().auth.mfa.listFactors()
  if (error) throw error
  return (data.totp ?? []).map(f => ({
    id: f.id,
    status: f.status,
    friendlyName: f.friendly_name ?? null,
  }))
}

export async function enrollTotpFactor(): Promise<{ factorId: string; qrCode: string; secret: string }> {
  const { data, error } = await getSupabaseBrowserClient().auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Family Travel',
  })
  if (error) throw error
  const totp = data.totp
  if (!totp?.qr_code || !totp.secret) throw new Error('TOTP enrollment missing secret')
  return { factorId: data.id, qrCode: totp.qr_code, secret: totp.secret }
}

export async function verifyTotpFactor(factorId: string, code: string): Promise<void> {
  const sb = getSupabaseBrowserClient()
  const challenge = await sb.auth.mfa.challenge({ factorId })
  if (challenge.error) throw challenge.error
  const { error } = await sb.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code: code.replace(/\s/g, ''),
  })
  if (error) throw error
}

export async function unenrollTotpFactor(factorId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().auth.mfa.unenroll({ factorId })
  if (error) throw error
}

export async function reauthenticateWithPassword(password: string): Promise<void> {
  const { data: userData, error: userError } = await getSupabaseBrowserClient().auth.getUser()
  if (userError) throw userError
  const email = userData.user?.email
  if (!email) throw new PasswordChangeError('no_email')
  try {
    await signInWithPassword(email, password)
  } catch (err) {
    if (isInvalidCredentials(err)) throw new PasswordChangeError('current_incorrect')
    throw err
  }
}

export async function requestPasswordRecovery(email: string): Promise<void> {
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost'
  const redirectTo = `${origin}/reset-password`
  const { error } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim(), { redirectTo })
  if (error) throw error
}

export async function updateRecoveredPassword(newPassword: string): Promise<void> {
  if (newPassword.length < 8) throw new PasswordChangeError('too_short')
  const { error } = await getSupabaseBrowserClient().auth.updateUser({ password: newPassword })
  if (error) throw new PasswordChangeError('update_failed', error.message)
}

export async function signOutOtherSessions(): Promise<void> {
  const { error } = await getSupabaseBrowserClient().auth.signOut({ scope: 'others' })
  if (error) throw error
}

export async function syncLinkedPersonEmail(): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('sync_my_linked_person_email')
  if (error) throw error
}

export function isRecoverySession(): boolean {
  const hash = window.location.hash || ''
  const search = window.location.search || ''
  return hash.includes('type=recovery') || search.includes('type=recovery')
}

export function isSupabaseDataPlane(): boolean {
  return getDataPlane() === 'supabase'
}

export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const { data, error } = await getSupabaseBrowserClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) throw error
  if (!data.session) throw new Error('No session returned from Supabase Auth')
  return data.session
}

export async function signOutSupabase(): Promise<void> {
  const { error } = await getSupabaseBrowserClient().auth.signOut()
  if (error) throw error
}

export async function getSupabaseSession(): Promise<Session | null> {
  const { data, error } = await getSupabaseBrowserClient().auth.getSession()
  if (error) throw error
  return data.session
}

export async function getSupabaseUser(): Promise<SbUser | null> {
  const session = await getSupabaseSession()
  return session?.user ?? null
}

export function onSupabaseAuthStateChange(
  callback: (event: string, session: Session | null) => void,
): { data: { subscription: { unsubscribe: () => void } } } {
  return getSupabaseBrowserClient().auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })
}

export type PasswordChangeErrorCode =
  | 'no_email'
  | 'current_required'
  | 'too_short'
  | 'mismatch'
  | 'current_incorrect'
  | 'update_failed'

export class PasswordChangeError extends Error {
  readonly code: PasswordChangeErrorCode
  constructor(code: PasswordChangeErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'PasswordChangeError'
    this.code = code
  }
}

export function isInvalidCredentials(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { message?: string; code?: string; status?: number }
  const msg = (e.message ?? '').toLowerCase()
  if (e.code === 'invalid_credentials') return true
  if (e.status === 400 && msg.includes('invalid')) return true
  return msg.includes('invalid login credentials') || msg.includes('invalid_credentials')
}

/** Re-auth with the current password, then set the new one. Throws on Auth `{ error }`. */
export async function changePassword(opts: {
  email: string | null | undefined
  currentPassword: string
  newPassword: string
  confirmPassword: string
}): Promise<void> {
  if (!opts.currentPassword) throw new PasswordChangeError('current_required')
  if (!opts.newPassword) throw new PasswordChangeError('too_short')
  if (opts.newPassword.length < 8) throw new PasswordChangeError('too_short')
  if (opts.newPassword !== opts.confirmPassword) throw new PasswordChangeError('mismatch')

  const sb = getSupabaseBrowserClient()
  const { data: userData, error: userError } = await sb.auth.getUser()
  if (userError) throw userError
  const email = userData.user?.email?.trim() || opts.email?.trim() || ''
  if (!email) throw new PasswordChangeError('no_email')

  try {
    await signInWithPassword(email, opts.currentPassword)
  } catch (err) {
    if (isInvalidCredentials(err)) throw new PasswordChangeError('current_incorrect')
    throw err
  }

  const { error } = await sb.auth.updateUser({
    password: opts.newPassword,
  })
  if (error) {
    if (isInvalidCredentials(error)) throw new PasswordChangeError('current_incorrect')
    throw new PasswordChangeError('update_failed', error.message)
  }
}
