import { getMyAuthBootstrap, type AuthBootstrap, type FamilyAuthGate } from './auth'

export type MembershipSnapshot = {
  isSuperAdmin: boolean
  role: string | null
  familyId: string | null
  personId: string | null
  membershipStatus: string
  personLinked: boolean
  hasVerifiedTotp: boolean
  reviewerMfaRequired: boolean
  gate: FamilyAuthGate
  bootstrap: AuthBootstrap | null
}

export function isFamilyMember(snapshot: Pick<MembershipSnapshot, 'isSuperAdmin' | 'role' | 'membershipStatus'>): boolean {
  if (snapshot.isSuperAdmin) return true
  if (!snapshot.role) return false
  return snapshot.membershipStatus !== 'suspended' && snapshot.membershipStatus !== 'none'
}

/**
 * Membership + assurance from get_my_auth_bootstrap. Does not auto-link people.user_id.
 */
export async function loadMembershipSnapshot(_authUserId: string): Promise<MembershipSnapshot> {
  const bootstrap = await getMyAuthBootstrap()
  return {
    isSuperAdmin: bootstrap.isSuperAdmin,
    role: bootstrap.membershipRole,
    familyId: bootstrap.familyId,
    personId: bootstrap.personId,
    membershipStatus: bootstrap.membershipStatus,
    personLinked: bootstrap.personLinked,
    hasVerifiedTotp: bootstrap.hasVerifiedTotp,
    reviewerMfaRequired: bootstrap.reviewerMfaRequired,
    gate: bootstrap.gate,
    bootstrap,
  }
}
