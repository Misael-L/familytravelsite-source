/**
 * Web capabilities from Family Travel membership (not TREK addons).
 *
 * Hub helper `canMutateTrips` — patriarch / parent / super-admin. Used for hub
 * archive / delete. Duplicate is any active member (§21 RPC). Do NOT use this
 * for Workspace published writes.
 *
 * Workspace published writes (Places add/remove, later Plan) use RPC
 * `canMutateTrip(tripId)` → Postgres `can_mutate_trip` (HOF / is_family_head only).
 * Narrowing this hub helper to HOF-only would break hub chrome.
 */

import { getSupabaseBrowserClient } from './client'

export type MembershipCapabilityInput = {
  isSuperAdmin: boolean
  membershipRole: string | null
}

export function canMutateTrips(input: MembershipCapabilityInput): boolean {
  if (input.isSuperAdmin) return true
  const role = input.membershipRole
  return role === 'patriarch' || role === 'parent'
}

/**
 * Open TREK `/admin` — same predicate as Postgres `can_review_access`
 * (super-admin or active patriarch/parent). Do not use TREK `user.role`.
 * Spouse household admin is `family_members.role = parent`, not a new helper.
 */
export function canReviewFamilyAdmin(input: MembershipCapabilityInput): boolean {
  return canMutateTrips(input)
}

/** Workspace HOF gate — RPC `can_mutate_trip`. Throws on RPC error (do not treat as non-HOF). */
export async function canMutateTrip(tripId: string): Promise<boolean> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('can_mutate_trip', { p_trip_id: tripId })
  if (error) throw error
  return Boolean(data)
}

/** Personal My Draft eligibility — RPC `can_draft_trip_changes`. Throws on RPC error. */
export async function canDraftTripChanges(tripId: string): Promise<boolean> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('can_draft_trip_changes', { p_trip_id: tripId })
  if (error) throw error
  return Boolean(data)
}
