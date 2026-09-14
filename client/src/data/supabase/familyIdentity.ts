/**
 * §35A identity bootstrap, Admin health, and HOF person-link repair.
 * Postgres RPCs are SoR. Do not call Nest authApi / adminApi.
 */

import { getSupabaseBrowserClient } from './client'

export type IdentityMemberRow = {
  memberId: string
  userId: string
  personId: string | null
  role: string
  status: string
  emailConfirmed: boolean
  personLinked: boolean
  hasVerifiedTotp: boolean
  reviewerMfaRequired: boolean
  lastSignInAt: string | null
  providers: string[]
}

export type UnlinkedPersonRow = {
  personId: string
  displayName: string
  hasRosterEmail: boolean
}

export type PendingRequestRow = {
  requestId: string
  status: string
  requestedRole: string
  createdAt: string
}

export type FamilyIdentityAssurance = {
  familyId: string
  canManage: boolean
  members: IdentityMemberRow[]
  unlinkedPeople: UnlinkedPersonRow[]
  pendingRequests: PendingRequestRow[]
}

export type FamilyFilePolicy = {
  familyId: string
  canManage: boolean
  trashCount: number
  pendingCleanup: number
  deadLetters: number
  retentionDays: number
  tripFileMaxBytes: number
  avatarMaxBytes: number
  tripFileMime: string[]
  imageMime: string[]
}

function strArr(value: unknown): string[] {
  return Array.isArray(value) ? value.map(v => String(v)) : []
}

export async function getFamilyIdentityAssurance(familyId: string): Promise<FamilyIdentityAssurance> {
  const { data, error } = await getSupabaseBrowserClient().rpc('get_family_identity_assurance', {
    p_family_id: familyId,
  })
  if (error) throw error
  const row = (data ?? {}) as Record<string, unknown>
  const members = Array.isArray(row.members) ? row.members : []
  const unlinked = Array.isArray(row.unlinked_people) ? row.unlinked_people : []
  const pending = Array.isArray(row.pending_requests) ? row.pending_requests : []
  return {
    familyId: String(row.family_id ?? familyId),
    canManage: !!row.can_manage,
    members: members.map((m: Record<string, unknown>) => ({
      memberId: String(m.member_id ?? ''),
      userId: String(m.user_id ?? ''),
      personId: m.person_id ? String(m.person_id) : null,
      role: String(m.role ?? ''),
      status: String(m.status ?? ''),
      emailConfirmed: !!m.email_confirmed,
      personLinked: !!m.person_linked,
      hasVerifiedTotp: !!m.has_verified_totp,
      reviewerMfaRequired: !!m.reviewer_mfa_required,
      lastSignInAt: m.last_sign_in_at ? String(m.last_sign_in_at) : null,
      providers: strArr(m.providers),
    })),
    unlinkedPeople: unlinked.map((p: Record<string, unknown>) => ({
      personId: String(p.person_id ?? ''),
      displayName: String(p.display_name ?? ''),
      hasRosterEmail: !!p.has_roster_email,
    })),
    pendingRequests: pending.map((r: Record<string, unknown>) => ({
      requestId: String(r.request_id ?? ''),
      status: String(r.status ?? ''),
      requestedRole: String(r.requested_role ?? ''),
      createdAt: String(r.created_at ?? ''),
    })),
  }
}

export async function getFamilyFilePolicy(familyId: string): Promise<FamilyFilePolicy> {
  const { data, error } = await getSupabaseBrowserClient().rpc('get_family_file_policy', {
    p_family_id: familyId,
  })
  if (error) throw error
  const row = (data ?? {}) as Record<string, unknown>
  return {
    familyId: String(row.family_id ?? familyId),
    canManage: !!row.can_manage,
    trashCount: Number(row.trash_count ?? 0),
    pendingCleanup: Number(row.pending_cleanup ?? 0),
    deadLetters: Number(row.dead_letters ?? 0),
    retentionDays: Number(row.retention_days ?? 30),
    tripFileMaxBytes: Number(row.trip_file_max_bytes ?? 0),
    avatarMaxBytes: Number(row.avatar_max_bytes ?? 0),
    tripFileMime: strArr(row.trip_file_mime),
    imageMime: strArr(row.image_mime),
  }
}

export async function linkFamilyMemberPerson(opts: {
  familyId: string
  personId: string
  userId: string
}): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('link_family_member_person', {
    p_family_id: opts.familyId,
    p_person_id: opts.personId,
    p_user_id: opts.userId,
  })
  if (error) throw error
}
