/**
 * Family permission matrix + product audit (Phase 1B).
 * Postgres is SoR. Do not call Nest adminApi / permissionsStore.
 */

import { getSupabaseBrowserClient } from './client'

export const FAMILY_CAPABILITY_KEYS = [
  'family.members.manage',
  'family.permissions.manage',
  'family.templates.manage',
  'family.place_categories.manage',
  'family.defaults.manage',
  'family.notifications.manage',
  'family.identity.manage',
  'family.features.manage',
  'family.export.manage',
  'family.maps.manage',
  'trip.propose',
  'trip.decide',
  'trip.metadata.edit',
  'trip.archive',
  'trip.cover.manage',
  'trip.travelers.manage',
  'trip.places.manage',
  'trip.schedule.manage',
  'trip.reservations.manage',
  'trip.costs.manage',
  'trip.costs.settle',
  'trip.packing.manage',
  'trip.todos.manage',
  'trip.files.upload',
  'trip.files.metadata',
  'trip.files.trash',
  'trip.collaboration.manage',
  'trip.share.manage',
] as const

export type FamilyCapabilityKey = (typeof FAMILY_CAPABILITY_KEYS)[number]

export const PHASE1A_CAPABILITY_KEYS = [
  'trip.places.manage',
  'trip.schedule.manage',
  'trip.reservations.manage',
  'trip.costs.manage',
] as const

export type Phase1ACapabilityKey = (typeof PHASE1A_CAPABILITY_KEYS)[number]

export type FamilyPermissionOutcome = 'direct' | 'propose' | 'deny'
export type FamilyPermissionActorScope =
  | 'patriarch'
  | 'reviewers'
  | 'trip_travelers'
  | 'non_guest_members'
  | 'active_members'

export type FamilyCapabilityPolicy = {
  key: FamilyCapabilityKey
  group: string
  context: 'family' | 'trip'
  displayOrder: number
  configurable: boolean
  defaultDirectScope: FamilyPermissionActorScope | null
  defaultProposeScope: FamilyPermissionActorScope | null
  effectiveDirectScope: FamilyPermissionActorScope | null
  effectiveProposeScope: FamilyPermissionActorScope | null
  allowedDirectScopes: FamilyPermissionActorScope[]
  allowedProposeScopes: FamilyPermissionActorScope[]
  isCustom: boolean
}

export type FamilyPermissionPolicyList = {
  familyId: string
  canManage: boolean
  policies: FamilyCapabilityPolicy[]
}

export type FamilyAuditEvent = {
  id: string
  familyId: string
  tripId: string | null
  actorPersonId: string | null
  actorDisplayName: string | null
  capabilityKey: string | null
  outcome: FamilyPermissionOutcome | null
  resourceType: string
  resourceId: string | null
  operation: string
  context: Record<string, unknown>
  createdAt: string
}

export type FamilyAuditPage = {
  events: FamilyAuditEvent[]
  nextCursor: { createdAt: string; id: string } | null
}

export type TripActionOutcomes = {
  tripId: string
  familyId: string
  outcomes: Record<string, FamilyPermissionOutcome>
}

type CatalogRow = {
  key: string
  group: string
  context: string
  display_order: number
  configurable: boolean
  default_direct_scope: string | null
  default_propose_scope: string | null
  effective_direct_scope: string | null
  effective_propose_scope: string | null
  allowed_direct_scopes: string[]
  allowed_propose_scopes: string[]
  is_custom: boolean
}

function asOutcome(value: unknown): FamilyPermissionOutcome {
  return value === 'direct' || value === 'propose' || value === 'deny' ? value : 'deny'
}

function asScope(value: unknown): FamilyPermissionActorScope | null {
  if (
    value === 'patriarch'
    || value === 'reviewers'
    || value === 'trip_travelers'
    || value === 'non_guest_members'
    || value === 'active_members'
  ) {
    return value
  }
  return null
}

function asKey(value: string): FamilyCapabilityKey {
  return (FAMILY_CAPABILITY_KEYS as readonly string[]).includes(value)
    ? (value as FamilyCapabilityKey)
    : 'trip.share.manage'
}

function mapPolicy(row: CatalogRow): FamilyCapabilityPolicy {
  return {
    key: asKey(row.key),
    group: row.group,
    context: row.context === 'family' ? 'family' : 'trip',
    displayOrder: row.display_order,
    configurable: !!row.configurable,
    defaultDirectScope: asScope(row.default_direct_scope),
    defaultProposeScope: asScope(row.default_propose_scope),
    effectiveDirectScope: asScope(row.effective_direct_scope),
    effectiveProposeScope: asScope(row.effective_propose_scope),
    allowedDirectScopes: (row.allowed_direct_scopes ?? []).map(asScope).filter((s): s is FamilyPermissionActorScope => Boolean(s)),
    allowedProposeScopes: (row.allowed_propose_scopes ?? []).map(asScope).filter((s): s is FamilyPermissionActorScope => Boolean(s)),
    isCustom: !!row.is_custom,
  }
}

export async function listFamilyPermissionPolicies(familyId: string): Promise<FamilyPermissionPolicyList> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('list_family_permission_policies', { p_family_id: familyId })
  if (error) throw error
  const row = data as {
    family_id?: string
    can_manage?: boolean
    policies?: CatalogRow[]
  } | null
  if (!row) throw new Error('permission policies missing')
  return {
    familyId: row.family_id ?? familyId,
    canManage: !!row.can_manage,
    policies: (row.policies ?? []).map(mapPolicy),
  }
}

export async function updateFamilyPermissionPolicies(
  familyId: string,
  policies: Array<{
    key: FamilyCapabilityKey
    directScope: FamilyPermissionActorScope | null
    proposeScope: FamilyPermissionActorScope | null
  }>,
): Promise<FamilyPermissionPolicyList> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('update_family_permission_policies', {
      p_family_id: familyId,
      p_policies: policies.map(p => ({
        key: p.key,
        direct_scope: p.directScope,
        propose_scope: p.proposeScope,
      })),
    })
  if (error) throw error
  const row = data as {
    family_id?: string
    can_manage?: boolean
    policies?: CatalogRow[]
  } | null
  if (!row) throw new Error('permission update failed')
  return {
    familyId: row.family_id ?? familyId,
    canManage: !!row.can_manage,
    policies: (row.policies ?? []).map(mapPolicy),
  }
}

export async function resetFamilyPermissionPolicies(familyId: string): Promise<FamilyPermissionPolicyList> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('reset_family_permission_policies', { p_family_id: familyId })
  if (error) throw error
  const row = data as {
    family_id?: string
    can_manage?: boolean
    policies?: CatalogRow[]
  } | null
  if (!row) throw new Error('permission reset failed')
  return {
    familyId: row.family_id ?? familyId,
    canManage: !!row.can_manage,
    policies: (row.policies ?? []).map(mapPolicy),
  }
}

export async function listTripActionOutcomes(tripId: string): Promise<TripActionOutcomes> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('list_trip_action_outcomes', { p_trip_id: tripId })
  if (error) throw error
  const row = data as { trip_id?: string; family_id?: string; outcomes?: Record<string, string> } | null
  if (!row) throw new Error('trip action outcomes missing')
  const outcomes: Record<string, FamilyPermissionOutcome> = {}
  for (const [key, value] of Object.entries(row.outcomes ?? {})) {
    outcomes[key] = asOutcome(value)
  }
  return {
    tripId: row.trip_id ?? tripId,
    familyId: row.family_id ?? '',
    outcomes,
  }
}

export async function listFamilyAuditEvents(opts: {
  familyId: string
  limit?: number
  beforeCreatedAt?: string | null
  beforeId?: string | null
  actorPersonId?: string | null
  capabilityKey?: string | null
  outcome?: FamilyPermissionOutcome | null
}): Promise<FamilyAuditPage> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('list_family_audit_events', {
      p_family_id: opts.familyId,
      p_limit: opts.limit ?? 50,
      p_before_created_at: opts.beforeCreatedAt ?? null,
      p_before_id: opts.beforeId ?? null,
      p_actor_person_id: opts.actorPersonId ?? null,
      p_capability_key: opts.capabilityKey ?? null,
      p_outcome: opts.outcome ?? null,
    })
  if (error) throw error
  const row = data as {
    events?: Array<{
      id: string
      family_id: string
      trip_id: string | null
      actor_person_id: string | null
      actor_display_name: string | null
      capability_key: string | null
      outcome: string | null
      resource_type: string
      resource_id: string | null
      operation: string
      context: Record<string, unknown> | null
      created_at: string
    }>
    next_cursor?: { created_at: string; id: string } | null
  } | null
  return {
    events: (row?.events ?? []).map(e => ({
      id: e.id,
      familyId: e.family_id,
      tripId: e.trip_id,
      actorPersonId: e.actor_person_id,
      actorDisplayName: e.actor_display_name,
      capabilityKey: e.capability_key,
      outcome: e.outcome ? asOutcome(e.outcome) : null,
      resourceType: e.resource_type,
      resourceId: e.resource_id,
      operation: e.operation,
      context: e.context ?? {},
      createdAt: e.created_at,
    })),
    nextCursor: row?.next_cursor
      ? { createdAt: row.next_cursor.created_at, id: row.next_cursor.id }
      : null,
  }
}

export function outcomeFor(
  outcomes: Record<string, FamilyPermissionOutcome> | null | undefined,
  key: FamilyCapabilityKey,
): FamilyPermissionOutcome {
  return asOutcome(outcomes?.[key])
}

export async function canTripActionDirect(tripId: string, key: FamilyCapabilityKey): Promise<boolean> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('can_trip_action_direct', { p_trip_id: tripId, p_capability_key: key })
  if (error) throw error
  return Boolean(data)
}
