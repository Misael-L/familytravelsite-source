import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import {
  approveAccessRequest,
  APPROVE_ACCESS_FN,
  inviteFamilyMember,
  listFamilyAdminMembers,
  listPendingAccessRequests,
  loadFamilyAdminStats,
  mapFamilyAdminMember,
  suspendFamilyMembership,
  updateFamilyMemberRole,
} from './familyAdmin'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

vi.mock('./personAvatars', () => ({
  listPeopleAvatarRefs: vi.fn().mockResolvedValue([]),
  signAvatarUrls: vi.fn().mockResolvedValue({}),
}))

function thenable(result: { data: unknown; error: unknown; count?: number | null }) {
  const t: Record<string, unknown> = {}
  const self = () => t
  for (const m of ['select', 'eq', 'in', 'is', 'not', 'neq', 'order', 'update', 'insert', 'maybeSingle', 'single', 'limit']) {
    t[m] = vi.fn(self)
  }
  t.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return t
}

describe('mapFamilyAdminMember', () => {
  it('uses people display_name and UUID ids', () => {
    const mapped = mapFamilyAdminMember(
      {
        id: 'mem-1',
        family_id: 'fam-1',
        user_id: 'user-1',
        role: 'parent',
        status: 'active',
        created_at: '2026-01-01',
      },
      { id: 'p-1', user_id: 'user-1', display_name: '  Mom  ', email: 'mom@example.com' },
      { id: 'user-1', display_name: 'Profile' },
      'https://signed/avatar',
    )
    expect(mapped.id).toBe('mem-1')
    expect(mapped.personId).toBe('p-1')
    expect(mapped.displayName).toBe('Mom')
    expect(mapped.email).toBe('mom@example.com')
    expect(mapped.role).toBe('parent')
    expect(mapped.avatarUrl).toBe('https://signed/avatar')
    expect(typeof mapped.id).toBe('string')
  })
})

describe('familyAdmin adapter', () => {
  const from = vi.fn()
  const rpc = vi.fn()
  const invoke = vi.fn()

  beforeEach(() => {
    from.mockReset()
    rpc.mockReset()
    invoke.mockReset()
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      from,
      rpc,
      functions: { invoke },
    } as never)
  })

  it('lists members for a family and does not hash ids', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'family_members') {
        return thenable({
          data: [{
            id: 'mem-1',
            family_id: 'fam-1',
            user_id: 'user-1',
            role: 'patriarch',
            status: 'active',
            created_at: '2026-01-01',
          }],
          error: null,
        })
      }
      if (table === 'people') {
        return thenable({
          data: [{ id: 'p-1', user_id: 'user-1', display_name: 'Dad', email: 'dad@example.com' }],
          error: null,
        })
      }
      if (table === 'profiles') {
        return thenable({ data: [{ id: 'user-1', display_name: 'Dad' }], error: null })
      }
      return thenable({ data: [], error: null })
    })
    const members = await listFamilyAdminMembers({ familyId: 'fam-1', isSuperAdmin: false })
    expect(members).toHaveLength(1)
    expect(members[0].id).toBe('mem-1')
    expect(members[0].displayName).toBe('Dad')
    expect(typeof members[0].id).toBe('string')
  })

  it('returns no members for a non-super-admin without familyId', async () => {
    const members = await listFamilyAdminMembers({ familyId: null, isSuperAdmin: false })
    expect(members).toEqual([])
    expect(from).not.toHaveBeenCalled()
  })

  it('lists pending access requests', async () => {
    from.mockReturnValue(thenable({
      data: [{
        id: 'req-1',
        email: 'new@example.com',
        display_name: 'New',
        family_id: 'fam-1',
        relation_note: null,
        created_at: '2026-01-02',
      }],
      error: null,
    }))
    const rows = await listPendingAccessRequests('fam-1')
    expect(rows[0].id).toBe('req-1')
    expect(rows[0].email).toBe('new@example.com')
  })

  it('invites via submit_access_request then approve-access-request', async () => {
    rpc.mockResolvedValueOnce({ data: 'req-new', error: null })
    invoke.mockResolvedValueOnce({ data: { ok: true }, error: null })
    await inviteFamilyMember({
      familyId: 'fam-1',
      email: 'kid@example.com',
      displayName: 'Kid',
      role: 'child',
    })
    expect(rpc).toHaveBeenCalledWith('submit_access_request', expect.objectContaining({
      p_email: 'kid@example.com',
      p_display_name: 'Kid',
      p_family_id: 'fam-1',
    }))
    expect(invoke).toHaveBeenCalledWith(APPROVE_ACCESS_FN, {
      body: { request_id: 'req-new', role: 'child' },
    })
  })

  it('approves and suspends without calling Nest', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true }, error: null })
    await approveAccessRequest('req-1', 'parent')
    expect(invoke).toHaveBeenCalledWith(APPROVE_ACCESS_FN, {
      body: { request_id: 'req-1', role: 'parent' },
    })

    rpc.mockResolvedValue({ data: { ok: true }, error: null })
    await suspendFamilyMembership('mem-1')
    expect(rpc).toHaveBeenCalledWith('update_family_membership', {
      p_member_id: 'mem-1',
      p_role: null,
      p_status: 'suspended',
    })
    await updateFamilyMemberRole('mem-1', 'parent')
    expect(rpc).toHaveBeenCalledWith('update_family_membership', {
      p_member_id: 'mem-1',
      p_role: 'parent',
      p_status: null,
    })
  })

  it('throws on roster query error', async () => {
    from.mockReturnValue(thenable({ data: null, error: { message: 'boom' } }))
    await expect(listFamilyAdminMembers({ familyId: 'fam-1', isSuperAdmin: false }))
      .rejects.toMatchObject({ message: 'boom' })
  })

  it('counts trip_places by place_id (composite PK has no id)', async () => {
    const tripPlaces = thenable({ data: null, error: null, count: 4 })
    from.mockImplementation((table: string) => {
      if (table === 'trips') {
        return thenable({
          data: [{ id: 't-1' }],
          error: null,
          count: 1,
        })
      }
      if (table === 'trip_places') return tripPlaces
      return thenable({ data: [], error: null })
    })
    const scoped = await loadFamilyAdminStats({ familyId: 'fam-1', isSuperAdmin: false, memberCount: 3 })
    expect(scoped.totalUsers).toBe(3)
    expect(scoped.totalPlaces).toBe(4)
    expect(tripPlaces.select).toHaveBeenCalledWith('place_id', { count: 'exact', head: true })
    expect(tripPlaces.select).not.toHaveBeenCalledWith('id', expect.anything())

    from.mockImplementation((table: string) => {
      if (table === 'trips') return thenable({ data: [], error: null, count: 2 })
      if (table === 'trip_places') return tripPlaces
      return thenable({ data: [], error: null })
    })
    await loadFamilyAdminStats({ familyId: null, isSuperAdmin: true, memberCount: 3 })
    expect(tripPlaces.select).toHaveBeenCalledWith('place_id', { count: 'exact', head: true })
  })
})
