import { getSupabaseBrowserClient } from './client'

export type FamilyPackingItem = {
  id: string
  tripId: string
  name: string
  checked: boolean
  category: string
  sortOrder: number
  quantity: number
  weightGrams: number | null
  bagId: string | null
  isPrivate: boolean
  ownerPersonId: string | null
  recipientPersonIds: string[]
  contributorPersonIds: string[]
}

export type FamilyPackingBag = {
  id: string
  tripId: string
  name: string
  color: string | null
  weightLimitGrams: number | null
  sortOrder: number
  memberPersonIds: string[]
}

export type FamilyPackingTemplate = {
  id: string
  familyId: string
  name: string
  itemCount: number
}

export type PackingShareVisibility = 'common' | 'personal' | 'shared'

type ItemRow = {
  id: string
  trip_id: string
  name: string
  checked: boolean
  category: string
  sort_order: number
  quantity: number
  weight_grams: number | null
  bag_id: string | null
  is_private: boolean
  owner_person_id: string | null
}

type BagRow = {
  id: string
  trip_id: string
  name: string
  color: string | null
  weight_limit_grams: number | null
  sort_order: number
}

function mapItem(
  row: ItemRow,
  recipients: Map<string, string[]>,
  contributors: Map<string, string[]>,
): FamilyPackingItem {
  return {
    id: row.id,
    tripId: row.trip_id,
    name: row.name,
    checked: row.checked,
    category: row.category ?? '',
    sortOrder: row.sort_order ?? 0,
    quantity: row.quantity ?? 1,
    weightGrams: row.weight_grams,
    bagId: row.bag_id,
    isPrivate: !!row.is_private,
    ownerPersonId: row.owner_person_id,
    recipientPersonIds: recipients.get(row.id) ?? [],
    contributorPersonIds: contributors.get(row.id) ?? [],
  }
}

export async function listPackingItems(tripId: string): Promise<FamilyPackingItem[]> {
  const sb = getSupabaseBrowserClient()
  const [itemsRes, recRes, contribRes] = await Promise.all([
    sb.from('packing_items').select(
      'id,trip_id,name,checked,category,sort_order,quantity,weight_grams,bag_id,is_private,owner_person_id',
    ).eq('trip_id', tripId).order('sort_order', { ascending: true }),
    sb.from('packing_item_recipients').select('item_id,person_id').eq('trip_id', tripId),
    sb.from('packing_item_contributors').select('item_id,person_id').eq('trip_id', tripId),
  ])
  if (itemsRes.error) throw itemsRes.error
  if (recRes.error) throw recRes.error
  if (contribRes.error) throw contribRes.error

  const recipients = new Map<string, string[]>()
  for (const r of recRes.data ?? []) {
    const list = recipients.get(r.item_id) ?? []
    list.push(r.person_id)
    recipients.set(r.item_id, list)
  }
  const contributors = new Map<string, string[]>()
  for (const r of contribRes.data ?? []) {
    const list = contributors.get(r.item_id) ?? []
    list.push(r.person_id)
    contributors.set(r.item_id, list)
  }
  return ((itemsRes.data ?? []) as ItemRow[]).map(row => mapItem(row, recipients, contributors))
}

export async function listPackingBags(tripId: string): Promise<FamilyPackingBag[]> {
  const sb = getSupabaseBrowserClient()
  const [bagsRes, memRes] = await Promise.all([
    sb.from('packing_bags').select('id,trip_id,name,color,weight_limit_grams,sort_order')
      .eq('trip_id', tripId).order('sort_order', { ascending: true }),
    sb.from('packing_bag_members').select('bag_id,person_id').eq('trip_id', tripId),
  ])
  if (bagsRes.error) throw bagsRes.error
  if (memRes.error) throw memRes.error
  const members = new Map<string, string[]>()
  for (const r of memRes.data ?? []) {
    const list = members.get(r.bag_id) ?? []
    list.push(r.person_id)
    members.set(r.bag_id, list)
  }
  return ((bagsRes.data ?? []) as BagRow[]).map(row => ({
    id: row.id,
    tripId: row.trip_id,
    name: row.name,
    color: row.color,
    weightLimitGrams: row.weight_limit_grams,
    sortOrder: row.sort_order ?? 0,
    memberPersonIds: members.get(row.id) ?? [],
  }))
}

export async function listPackingCategoryAssignees(
  tripId: string,
): Promise<Record<string, string[]>> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('packing_category_assignees')
    .select('category_name,person_id')
    .eq('trip_id', tripId)
  if (error) throw error
  const out: Record<string, string[]> = {}
  for (const row of data ?? []) {
    const list = out[row.category_name] ?? []
    list.push(row.person_id)
    out[row.category_name] = list
  }
  return out
}

export type PackingItemDraft = {
  id?: string | null
  name: string
  category?: string
  checked?: boolean
  quantity?: number
  weightGrams?: number | null
  bagId?: string | null
  isPrivate?: boolean
  ownerPersonId?: string | null
  sortOrder?: number
}

export async function upsertPackingItem(tripId: string, draft: PackingItemDraft): Promise<string> {
  const payload = {
    trip_id: tripId,
    name: draft.name.trim(),
    category: draft.category ?? '',
    checked: draft.checked ?? false,
    quantity: Math.max(1, draft.quantity ?? 1),
    weight_grams: draft.weightGrams ?? null,
    bag_id: draft.bagId ?? null,
    is_private: draft.isPrivate ?? false,
    owner_person_id: draft.ownerPersonId ?? null,
    sort_order: draft.sortOrder ?? 0,
  }
  if (draft.id) {
    const { error } = await getSupabaseBrowserClient()
      .from('packing_items')
      .update(payload)
      .eq('id', draft.id)
    if (error) throw error
    return draft.id
  }
  const { data, error } = await getSupabaseBrowserClient()
    .from('packing_items')
    .insert(payload)
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function patchPackingItem(
  itemId: string,
  patch: Partial<{
    name: string
    checked: boolean
    category: string
    quantity: number
    weightGrams: number | null
    bagId: string | null
    sortOrder: number
    isPrivate: boolean
    ownerPersonId: string | null
  }>,
): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.name != null) row.name = patch.name
  if (patch.checked != null) row.checked = patch.checked
  if (patch.category != null) row.category = patch.category
  if (patch.quantity != null) row.quantity = patch.quantity
  if (patch.weightGrams !== undefined) row.weight_grams = patch.weightGrams
  if (patch.bagId !== undefined) row.bag_id = patch.bagId
  if (patch.sortOrder != null) row.sort_order = patch.sortOrder
  if (patch.isPrivate != null) row.is_private = patch.isPrivate
  if (patch.ownerPersonId !== undefined) row.owner_person_id = patch.ownerPersonId
  const { error } = await getSupabaseBrowserClient()
    .from('packing_items')
    .update(row)
    .eq('id', itemId)
  if (error) throw error
}

export async function deletePackingItem(itemId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().from('packing_items').delete().eq('id', itemId)
  if (error) throw error
}

export async function reorderPackingItems(orderedIds: string[]): Promise<void> {
  const sb = getSupabaseBrowserClient()
  const results = await Promise.all(
    orderedIds.map((id, sortOrder) =>
      sb.from('packing_items').update({ sort_order: sortOrder }).eq('id', id),
    ),
  )
  const failed = results.find(r => r.error)
  if (failed?.error) throw failed.error
}

export async function renamePackingCategory(
  tripId: string,
  oldName: string,
  newName: string,
): Promise<void> {
  const next = newName.trim()
  if (!next || next === oldName) return
  const sb = getSupabaseBrowserClient()
  const { error: itemsErr } = await sb.from('packing_items')
    .update({ category: next })
    .eq('trip_id', tripId)
    .eq('category', oldName)
  if (itemsErr) throw itemsErr
  const { data: assignees, error: listErr } = await sb.from('packing_category_assignees')
    .select('person_id')
    .eq('trip_id', tripId)
    .eq('category_name', oldName)
  if (listErr) throw listErr
  const { error: delErr } = await sb.from('packing_category_assignees')
    .delete()
    .eq('trip_id', tripId)
    .eq('category_name', oldName)
  if (delErr) throw delErr
  if ((assignees ?? []).length > 0) {
    const { error: insErr } = await sb.from('packing_category_assignees').insert(
      (assignees ?? []).map(a => ({
        trip_id: tripId,
        category_name: next,
        person_id: a.person_id,
      })),
    )
    if (insErr) throw insErr
  }
}

export async function setPackingCategoryAssignees(
  tripId: string,
  categoryName: string,
  personIds: string[],
): Promise<void> {
  const sb = getSupabaseBrowserClient()
  const { error: delErr } = await sb.from('packing_category_assignees')
    .delete()
    .eq('trip_id', tripId)
    .eq('category_name', categoryName)
  if (delErr) throw delErr
  if (personIds.length === 0) return
  const { error } = await sb.from('packing_category_assignees').insert(
    personIds.map(person_id => ({ trip_id: tripId, category_name: categoryName, person_id })),
  )
  if (error) throw error
}

export async function upsertPackingBag(
  tripId: string,
  draft: { id?: string | null; name: string; color?: string | null; weightLimitGrams?: number | null; sortOrder?: number },
): Promise<string> {
  const payload = {
    trip_id: tripId,
    name: draft.name.trim(),
    color: draft.color ?? null,
    weight_limit_grams: draft.weightLimitGrams ?? null,
    sort_order: draft.sortOrder ?? 0,
  }
  if (draft.id) {
    const { error } = await getSupabaseBrowserClient().from('packing_bags').update(payload).eq('id', draft.id)
    if (error) throw error
    return draft.id
  }
  const { data, error } = await getSupabaseBrowserClient()
    .from('packing_bags')
    .insert(payload)
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function deletePackingBag(bagId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().from('packing_bags').delete().eq('id', bagId)
  if (error) throw error
}

export async function setPackingBagMembers(bagId: string, personIds: string[]): Promise<void> {
  const sb = getSupabaseBrowserClient()
  const { error: delErr } = await sb.from('packing_bag_members').delete().eq('bag_id', bagId)
  if (delErr) throw delErr
  if (personIds.length === 0) return
  const { error } = await sb.from('packing_bag_members').insert(
    personIds.map(person_id => ({ bag_id: bagId, person_id })),
  )
  if (error) throw error
}

export async function setPackingItemSharing(
  itemId: string,
  visibility: PackingShareVisibility,
  ownerPersonId: string,
  recipientPersonIds: string[] = [],
): Promise<void> {
  const isPrivate = visibility !== 'common'
  const recipients = visibility === 'shared' ? recipientPersonIds : []
  const { error } = await getSupabaseBrowserClient()
    .from('packing_items')
    .update({
      is_private: isPrivate,
      owner_person_id: isPrivate ? ownerPersonId : null,
    })
    .eq('id', itemId)
  if (error) throw error
  const sb = getSupabaseBrowserClient()
  const { error: delErr } = await sb.from('packing_item_recipients').delete().eq('item_id', itemId)
  if (delErr) throw delErr
  if (recipients.length > 0) {
    const { error: insErr } = await sb.from('packing_item_recipients').insert(
      recipients.map(person_id => ({ item_id: itemId, person_id })),
    )
    if (insErr) throw insErr
  }
}

export async function setPackingItemContributor(
  itemId: string,
  personId: string,
  joined: boolean,
): Promise<void> {
  const sb = getSupabaseBrowserClient()
  if (joined) {
    const { error } = await sb.from('packing_item_contributors').insert({ item_id: itemId, person_id: personId })
    if (error) throw error
    return
  }
  const { error } = await sb.from('packing_item_contributors')
    .delete()
    .eq('item_id', itemId)
    .eq('person_id', personId)
  if (error) throw error
}

export async function ensurePackingDefaults(tripId: string): Promise<number> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('ensure_packing_defaults', { p_trip_id: tripId })
  if (error) throw error
  return Number(data ?? 0)
}

export async function listPackingTemplates(familyId: string): Promise<FamilyPackingTemplate[]> {
  const sb = getSupabaseBrowserClient()
  const { data, error } = await sb
    .from('packing_templates')
    .select('id,family_id,name,packing_template_items(id)')
    .eq('family_id', familyId)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(row => {
    const items = row.packing_template_items
    const count = Array.isArray(items) ? items.length : 0
    return {
      id: row.id as string,
      familyId: row.family_id as string,
      name: row.name as string,
      itemCount: count,
    }
  })
}

export async function applyPackingTemplate(tripId: string, templateId: string): Promise<number> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('apply_packing_template', { p_trip_id: tripId, p_template_id: templateId })
  if (error) throw error
  return Number(data ?? 0)
}

export async function savePackingTemplateFromTrip(tripId: string, name: string): Promise<string> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('save_packing_template_from_trip', { p_trip_id: tripId, p_name: name })
  if (error) throw error
  return String(data)
}

export async function deletePackingTemplate(templateId: string): Promise<void> {
  const sb = getSupabaseBrowserClient()
  const { data, error } = await sb
    .from('packing_templates')
    .select('family_id')
    .eq('id', templateId)
    .maybeSingle()
  if (error) throw error
  if (!data?.family_id) throw new Error('template not found')
  const { error: rpcError } = await sb.rpc('delete_family_packing_template', {
    p_family_id: data.family_id,
    p_template_id: templateId,
  })
  if (rpcError) throw rpcError
}

export function packingItemWeight(item: Pick<FamilyPackingItem, 'weightGrams' | 'quantity'>): number {
  return (item.weightGrams || 0) * (item.quantity || 1)
}
