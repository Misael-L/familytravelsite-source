import { getSupabaseBrowserClient } from './client'
import { listPeopleAvatarRefs, signAvatarUrls } from './personAvatars'
import type { AdminStats } from '../../pages/admin/adminModel'

export const FAMILY_ROLES = ['patriarch', 'parent', 'child', 'guest'] as const
export type FamilyRole = (typeof FAMILY_ROLES)[number]

export const APPROVE_ACCESS_FN = 'approve-access-request'

export type FamilyAdminMember = {
  id: string
  userId: string
  personId: string | null
  familyId: string
  displayName: string
  email: string
  role: FamilyRole
  status: 'active' | 'suspended'
  createdAt: string
  avatarUrl: string | null
}

export type FamilyAccessRequest = {
  id: string
  email: string
  displayName: string
  familyId: string
  relationNote: string | null
  createdAt: string
}

type MemberRow = {
  id: string
  family_id: string
  user_id: string
  role: string
  status: string
  created_at: string
}

type PersonRow = {
  id: string
  user_id: string | null
  display_name: string | null
  email: string | null
}

type ProfileRow = {
  id: string
  display_name: string | null
}

type RequestRow = {
  id: string
  email: string
  display_name: string | null
  family_id: string
  relation_note: string | null
  created_at: string
}

function asFamilyRole(value: string): FamilyRole {
  return (FAMILY_ROLES as readonly string[]).includes(value) ? (value as FamilyRole) : 'guest'
}

export function mapFamilyAdminMember(
  row: MemberRow,
  person: PersonRow | undefined,
  profile: ProfileRow | undefined,
  avatarUrl: string | null,
): FamilyAdminMember {
  const displayName =
    person?.display_name?.trim() ||
    profile?.display_name?.trim() ||
    person?.email?.trim() ||
    'Member'
  return {
    id: row.id,
    userId: row.user_id,
    personId: person?.id ?? null,
    familyId: row.family_id,
    displayName,
    email: person?.email?.trim() || '',
    role: asFamilyRole(row.role),
    status: row.status === 'suspended' ? 'suspended' : 'active',
    createdAt: row.created_at,
    avatarUrl,
  }
}

export function mapFamilyAccessRequest(row: RequestRow): FamilyAccessRequest {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name?.trim() || row.email,
    familyId: row.family_id,
    relationNote: row.relation_note,
    createdAt: row.created_at,
  }
}

async function throwIfFunctionError(error: unknown, data: { error?: string } | null | undefined): Promise<never> {
  if (data?.error) throw new Error(data.error)
  const ctx = error && typeof error === 'object' && 'context' in error
    ? (error as { context: unknown }).context
    : null
  if (ctx && typeof ctx === 'object' && ctx !== null && 'json' in ctx && typeof (ctx as Response).json === 'function') {
    const body = await (ctx as Response).clone().json().catch(() => null) as { error?: string } | null
    if (body?.error) throw new Error(body.error)
  }
  if (error != null) throw error
  throw new Error('Access request failed')
}

export async function listFamilyAdminMembers(opts: {
  familyId: string | null
  isSuperAdmin: boolean
}): Promise<FamilyAdminMember[]> {
  const familyId = opts.familyId?.trim() || null
  if (!opts.isSuperAdmin && !familyId) return []
  const sb = getSupabaseBrowserClient()
  let query = sb
    .from('family_members')
    .select('id,family_id,user_id,role,status,created_at')
    .order('created_at')
  if (!opts.isSuperAdmin && familyId) {
    query = query.eq('family_id', familyId)
  }
  const { data, error } = await query
  if (error) throw error
  const rows = (data ?? []) as MemberRow[]
  if (rows.length === 0) return []

  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))]
  const familyIds = [...new Set(rows.map(r => r.family_id).filter(Boolean))]

  const { data: people, error: peopleErr } = await sb
    .from('people')
    .select('id,user_id,display_name,email')
    .in('user_id', userIds)
    .is('archived_at', null)
  if (peopleErr) throw peopleErr

  const { data: profiles, error: profileErr } = await sb
    .from('profiles')
    .select('id,display_name')
    .in('id', userIds)
  if (profileErr) throw profileErr

  const personByUser = new Map<string, PersonRow>()
  for (const p of (people ?? []) as PersonRow[]) {
    if (p.user_id && !personByUser.has(p.user_id)) personByUser.set(p.user_id, p)
  }
  const profileById = new Map(((profiles ?? []) as ProfileRow[]).map(p => [p.id, p]))

  const urlByPerson: Record<string, string> = {}
  for (const familyId of familyIds) {
    const personIds = [...personByUser.values()]
      .filter(p => rows.some(r => r.family_id === familyId && r.user_id === p.user_id))
      .map(p => p.id)
    if (personIds.length === 0) continue
    try {
      const refs = await listPeopleAvatarRefs(familyId)
      Object.assign(urlByPerson, await signAvatarUrls(refs, personIds))
    } catch {
      // Initials fallback — do not fail the roster.
    }
  }

  return rows.map(row => {
    const person = personByUser.get(row.user_id)
    return mapFamilyAdminMember(
      row,
      person,
      profileById.get(row.user_id),
      person ? urlByPerson[person.id] ?? null : null,
    )
  })
}

export async function listPendingAccessRequests(familyId: string | null): Promise<FamilyAccessRequest[]> {
  const sb = getSupabaseBrowserClient()
  let query = sb
    .from('access_requests')
    .select('id,email,display_name,family_id,relation_note,created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (familyId?.trim()) query = query.eq('family_id', familyId.trim())
  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as RequestRow[]).map(mapFamilyAccessRequest)
}

export async function loadFamilyAdminStats(opts: {
  familyId: string | null
  isSuperAdmin: boolean
  memberCount: number
}): Promise<AdminStats> {
  const sb = getSupabaseBrowserClient()
  const familyId = opts.familyId?.trim() || null
  const scopeFamily = !opts.isSuperAdmin

  let tripsQuery = sb.from('trips').select('id', { count: 'exact', head: true })
  if (scopeFamily) {
    if (!familyId) return { totalUsers: opts.memberCount, totalTrips: 0, totalPlaces: 0, totalFiles: 0 }
    tripsQuery = tripsQuery.eq('family_id', familyId)
  }
  const { count: tripCount, error: tripErr } = await tripsQuery
  if (tripErr) throw tripErr

  // Composite PK is (trip_id, place_id) — there is no trip_places.id (Postgres 42703).
  let placeCount = 0
  if (scopeFamily && familyId) {
    const { data: tripRows, error: tripListErr } = await sb.from('trips').select('id').eq('family_id', familyId)
    if (tripListErr) throw tripListErr
    const tripIds = ((tripRows ?? []) as { id: string }[]).map(t => t.id)
    if (tripIds.length > 0) {
      const { count, error } = await sb
        .from('trip_places')
        .select('place_id', { count: 'exact', head: true })
        .in('trip_id', tripIds)
      if (error) throw error
      placeCount = count ?? 0
    }
  } else if (opts.isSuperAdmin) {
    const { count, error } = await sb
      .from('trip_places')
      .select('place_id', { count: 'exact', head: true })
    if (error) throw error
    placeCount = count ?? 0
  }

  return {
    totalUsers: opts.memberCount,
    totalTrips: tripCount ?? 0,
    totalPlaces: placeCount,
    totalFiles: 0,
  }
}

export async function approveAccessRequest(requestId: string, role: FamilyRole): Promise<void> {
  const { data, error } = await getSupabaseBrowserClient().functions.invoke<{ ok?: boolean; error?: string }>(
    APPROVE_ACCESS_FN,
    { body: { request_id: requestId, role } },
  )
  if (error) await throwIfFunctionError(error, data)
  if (data?.error) throw new Error(data.error)
}

export async function denyAccessRequest(requestId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('deny_access_request', {
    p_request_id: requestId,
  })
  if (error) throw error
}

export async function inviteFamilyMember(opts: {
  familyId: string
  email: string
  displayName: string
  role: FamilyRole
}): Promise<void> {
  const familyId = opts.familyId.trim()
  const email = opts.email.trim().toLowerCase()
  const displayName = opts.displayName.trim()
  if (!familyId) throw new Error('family_id is required')
  if (!email) throw new Error('email is required')
  if (displayName.length < 2) throw new Error('display name is required')

  const sb = getSupabaseBrowserClient()
  const { data: requestId, error } = await sb.rpc('submit_access_request', {
    p_email: email,
    p_display_name: displayName,
    p_relation_note: null,
    p_family_id: familyId,
  })
  if (error) {
    const msg = (error.message || '').toLowerCase()
    if (msg.includes('already pending')) {
      const pending = await listPendingAccessRequests(familyId)
      const hit = pending.find(r => r.email.toLowerCase() === email)
      if (hit) {
        await approveAccessRequest(hit.id, opts.role)
        return
      }
    }
    throw error
  }
  const id = typeof requestId === 'string' ? requestId : null
  if (!id) throw new Error('submit_access_request returned no id')
  await approveAccessRequest(id, opts.role)
}

export async function updateFamilyMemberRole(memberId: string, role: FamilyRole): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('update_family_membership', {
    p_member_id: memberId,
    p_role: role,
    p_status: null,
  })
  if (error) throw error
}

export async function updateFamilyMemberDisplayName(opts: {
  personId: string | null
  userId: string
  displayName: string
}): Promise<void> {
  const name = opts.displayName.trim()
  if (name.length < 2) throw new Error('display name is required')
  const sb = getSupabaseBrowserClient()
  if (opts.personId) {
    const { error } = await sb.from('people').update({ display_name: name }).eq('id', opts.personId)
    if (error) throw error
  }
  const { error } = await sb.from('profiles').update({ display_name: name }).eq('id', opts.userId)
  if (error) throw error
}

export async function suspendFamilyMembership(memberId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().rpc('update_family_membership', {
    p_member_id: memberId,
    p_role: null,
    p_status: 'suspended',
  })
  if (error) throw error
}
