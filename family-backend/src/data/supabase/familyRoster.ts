import { getSupabaseBrowserClient } from './client'

export type FamilyPerson = {
  personId: string
  displayName: string
  color: string | null
}

export type TravelerPreset = {
  id: string
  name: string
  kind: string
  sortOrder: number
  personIds: string[]
}

type PeopleRow = {
  id: string
  display_name: string | null
  color: string | null
}

type BranchRow = {
  id: string
  name: string | null
  kind: string | null
  sort_order: number | null
}

type BranchMemberRow = {
  branch_id: string | null
  person_id: string | null
}

function mapPeopleRows(rows: PeopleRow[]): FamilyPerson[] {
  return rows
    .filter(r => r.id)
    .map(r => ({
      personId: r.id,
      displayName: r.display_name?.trim() || 'Traveler',
      color: r.color ?? null,
    }))
}

export async function listFamilyPeople(familyId: string): Promise<FamilyPerson[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('people')
    .select('id,display_name,color')
    .eq('family_id', familyId)
    .is('archived_at', null)
    .order('display_name')

  if (error) throw error
  return mapPeopleRows((data ?? []) as PeopleRow[])
}

export async function listFamilyPeopleByIds(familyId: string, personIds: string[]): Promise<FamilyPerson[]> {
  const ids = [...new Set(personIds.filter(Boolean))]
  if (ids.length === 0) return []
  const { data, error } = await getSupabaseBrowserClient()
    .from('people')
    .select('id,display_name,color')
    .eq('family_id', familyId)
    .in('id', ids)
    .is('archived_at', null)
    .order('display_name')
  if (error) throw error
  return mapPeopleRows((data ?? []) as PeopleRow[])
}

async function loadTravelerPresetBranches(familyId: string): Promise<TravelerPreset[]> {
  const sb = getSupabaseBrowserClient()
  const { data: branches, error: branchErr } = await sb
    .from('family_branches')
    .select('id,name,kind,sort_order')
    .eq('family_id', familyId)
    .eq('is_traveler_preset', true)
    .is('archived_at', null)
    .order('sort_order')

  if (branchErr) throw branchErr
  const branchRows = (branches ?? []) as BranchRow[]
  if (branchRows.length === 0) return []

  const { data: members, error: memberErr } = await sb
    .from('branch_people')
    .select('branch_id,person_id')
    .in('branch_id', branchRows.map(b => b.id))
    .eq('status', 'active')

  if (memberErr) throw memberErr

  const idsByBranch = new Map<string, string[]>()
  for (const row of (members ?? []) as BranchMemberRow[]) {
    if (!row.branch_id || !row.person_id) continue
    const list = idsByBranch.get(row.branch_id) ?? []
    list.push(row.person_id)
    idsByBranch.set(row.branch_id, list)
  }

  return branchRows.map(branch => ({
    id: branch.id,
    name: branch.name?.trim() || 'Preset',
    kind: branch.kind?.trim() || 'household',
    sortOrder: branch.sort_order ?? 0,
    personIds: idsByBranch.get(branch.id) ?? [],
  }))
}

/** Every active traveler-preset branch (Household / Family / future), not membership-filtered. */
export async function listTravelerPresetBranches(familyId: string): Promise<TravelerPreset[]> {
  return loadTravelerPresetBranches(familyId)
}

/** iOS `fetchTravelerPresets` — Household / Family chips the proposer belongs to. */
export async function listTravelerPresets(familyId: string, personId: string): Promise<TravelerPreset[]> {
  const all = await loadTravelerPresetBranches(familyId)
  return all.filter(preset => preset.personIds.includes(personId))
}

export type FamilyBranch = {
  id: string
  name: string
  kind: string | null
  sortOrder: number
}

/** iOS `fetchFamilyBranches`: all active household branches (escalate candidates). */
export async function listFamilyBranches(familyId: string): Promise<FamilyBranch[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('family_branches')
    .select('id,name,kind,sort_order')
    .eq('family_id', familyId)
    .is('archived_at', null)
    .order('sort_order')
  if (error) throw error
  return ((data ?? []) as BranchRow[])
    .filter(r => r.id)
    .map(r => ({
      id: r.id,
      name: r.name?.trim() || 'Household',
      kind: r.kind,
      sortOrder: r.sort_order ?? 0,
    }))
}
