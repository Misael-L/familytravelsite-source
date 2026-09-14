import type {
  FamilyCapabilityPolicy,
  FamilyPermissionActorScope,
} from '../../data/supabase/familyPermissions'

export const POLICY_GROUP_ORDER = [
  'family',
  'lifecycle',
  'content',
  'money',
  'lists',
  'files',
  'collab',
] as const

export type PolicyGroupId = (typeof POLICY_GROUP_ORDER)[number]

export function groupPolicies(policies: FamilyCapabilityPolicy[]): Array<{
  group: string
  policies: FamilyCapabilityPolicy[]
}> {
  const map = new Map<string, FamilyCapabilityPolicy[]>()
  for (const policy of policies) {
    const list = map.get(policy.group) ?? []
    list.push(policy)
    map.set(policy.group, list)
  }
  const known = POLICY_GROUP_ORDER.filter(group => map.has(group)).map(group => ({
    group,
    policies: map.get(group) ?? [],
  }))
  const extras = [...map.keys()]
    .filter(group => !(POLICY_GROUP_ORDER as readonly string[]).includes(group))
    .sort()
    .map(group => ({ group, policies: map.get(group) ?? [] }))
  return [...known, ...extras]
}

export function scopeSelectValue(scope: FamilyPermissionActorScope | null): string {
  return scope ?? ''
}

export function parseScopeSelect(value: string | number): FamilyPermissionActorScope | null {
  if (value === '' || value === 'none') return null
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

export function summarizeAuditContext(context: Record<string, unknown>): string {
  const fields = context.fields
  if (Array.isArray(fields) && fields.length > 0) {
    return fields.filter(f => typeof f === 'string').join(', ')
  }
  const keys = Object.keys(context).slice(0, 4)
  if (keys.length === 0) return ''
  return keys.map(key => `${key}=${String(context[key])}`).join(' · ')
}
