/**
 * Family place-category adapters (Phase 1D authoring + §36 Workspace read).
 * Admin CRUD goes through RPCs. Workspace members read via table RLS —
 * do not call reviewer-gated list_family_place_categories from Workspace.
 * Do not call Nest categoriesApi / adminApi.
 */

import { getSupabaseBrowserClient } from './client'

export type FamilyPlaceCategory = {
  id: string
  familyId: string
  name: string
  colorHex: string
  iconKey: string
  sortOrder: number
}

export type FamilyPlaceCategoryList = {
  familyId: string
  canManage: boolean
  categories: FamilyPlaceCategory[]
}

type CategoryRow = {
  id?: string
  family_id?: string
  name?: string
  color_hex?: string
  icon_key?: string
  sort_order?: number
}

function mapCategory(row: CategoryRow, familyId: string): FamilyPlaceCategory {
  return {
    id: String(row.id ?? ''),
    familyId: String(row.family_id ?? familyId),
    name: String(row.name ?? ''),
    colorHex: String(row.color_hex ?? ''),
    iconKey: String(row.icon_key ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
  }
}

/** Active-member palette for Workspace. Table RLS, not the Admin list RPC. */
export async function listMemberFamilyPlaceCategories(familyId: string): Promise<FamilyPlaceCategory[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('family_place_categories')
    .select('id,family_id,name,color_hex,icon_key,sort_order')
    .eq('family_id', familyId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return ((data ?? []) as CategoryRow[]).map(row => mapCategory(row, familyId))
}

export async function listFamilyPlaceCategories(familyId: string): Promise<FamilyPlaceCategoryList> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('list_family_place_categories', { p_family_id: familyId })
  if (error) throw error
  const row = data as {
    family_id?: string
    can_manage?: boolean
    categories?: CategoryRow[]
  } | null
  if (!row) throw new Error('place categories missing')
  const resolvedFamilyId = row.family_id ?? familyId
  return {
    familyId: resolvedFamilyId,
    canManage: !!row.can_manage,
    categories: (row.categories ?? []).map(cat => mapCategory(cat, resolvedFamilyId)),
  }
}

export async function upsertFamilyPlaceCategory(
  familyId: string,
  categoryId: string | null,
  input: { name: string; colorHex: string; iconKey: string; sortOrder?: number | null },
): Promise<FamilyPlaceCategory> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('upsert_family_place_category', {
      p_family_id: familyId,
      p_category_id: categoryId,
      p_name: input.name,
      p_color_hex: input.colorHex,
      p_icon_key: input.iconKey,
      p_sort_order: input.sortOrder ?? null,
    })
  if (error) throw error
  const row = data as { category?: CategoryRow } | null
  if (!row?.category) throw new Error('place category save failed')
  return mapCategory(row.category, familyId)
}

export async function deleteFamilyPlaceCategory(familyId: string, categoryId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .rpc('delete_family_place_category', {
      p_family_id: familyId,
      p_category_id: categoryId,
    })
  if (error) throw error
}
