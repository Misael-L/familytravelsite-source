/**
 * Family packing-template Admin CRUD (Phase 1C).
 * Postgres RPCs are SoR. Do not call Nest adminApi.
 * Workspace list/apply/save-from-trip stays in packing.ts.
 */

import { getSupabaseBrowserClient } from './client'

export type FamilyPackingTemplateItem = {
  id: string
  name: string
  category: string
  quantity: number
  weightGrams: number | null
  sortOrder: number
}

export type FamilyPackingTemplateDocument = {
  id: string
  familyId: string
  name: string
  items: FamilyPackingTemplateItem[]
}

export type FamilyPackingTemplateList = {
  familyId: string
  canManage: boolean
  templates: FamilyPackingTemplateDocument[]
}

export type FamilyPackingTemplateItemInput = {
  name: string
  category: string
  quantity: number
  weightGrams: number | null
}

type ItemRow = {
  id?: string
  name?: string
  category?: string
  quantity?: number
  weight_grams?: number | null
  sort_order?: number
}

type TemplateRow = {
  id?: string
  family_id?: string
  name?: string
  items?: ItemRow[] | null
}

function mapItem(row: ItemRow, index: number): FamilyPackingTemplateItem {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    category: String(row.category ?? ''),
    quantity: Number(row.quantity ?? 1),
    weightGrams: row.weight_grams == null ? null : Number(row.weight_grams),
    sortOrder: Number(row.sort_order ?? index),
  }
}

function mapTemplate(row: TemplateRow, familyId: string): FamilyPackingTemplateDocument {
  const items = Array.isArray(row.items) ? row.items : []
  return {
    id: String(row.id ?? ''),
    familyId: String(row.family_id ?? familyId),
    name: String(row.name ?? ''),
    items: items.map(mapItem),
  }
}

export async function listFamilyPackingTemplates(familyId: string): Promise<FamilyPackingTemplateList> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('list_family_packing_templates', { p_family_id: familyId })
  if (error) throw error
  const row = data as {
    family_id?: string
    can_manage?: boolean
    templates?: TemplateRow[]
  } | null
  if (!row) throw new Error('packing templates missing')
  const resolvedFamilyId = row.family_id ?? familyId
  return {
    familyId: resolvedFamilyId,
    canManage: !!row.can_manage,
    templates: (row.templates ?? []).map(tmpl => mapTemplate(tmpl, resolvedFamilyId)),
  }
}

export async function upsertFamilyPackingTemplate(
  familyId: string,
  templateId: string | null,
  name: string,
  items: FamilyPackingTemplateItemInput[],
): Promise<FamilyPackingTemplateDocument> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('upsert_family_packing_template', {
      p_family_id: familyId,
      p_template_id: templateId,
      p_name: name,
      p_items: items.map(item => ({
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        weight_grams: item.weightGrams,
      })),
    })
  if (error) throw error
  const row = data as { template?: TemplateRow } | null
  if (!row?.template) throw new Error('packing template save failed')
  return mapTemplate(row.template, familyId)
}

export async function deleteFamilyPackingTemplate(familyId: string, templateId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient()
    .rpc('delete_family_packing_template', {
      p_family_id: familyId,
      p_template_id: templateId,
    })
  if (error) throw error
}
