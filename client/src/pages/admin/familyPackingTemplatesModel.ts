import type {
  FamilyPackingTemplateDocument,
  FamilyPackingTemplateItem,
  FamilyPackingTemplateItemInput,
} from '../../data/supabase/familyPackingTemplates'

export type TemplateDraftItem = {
  clientKey: string
  id: string | null
  name: string
  quantity: number
  weightGrams: number | null
}

export type TemplateDraftGroup = {
  clientKey: string
  name: string
  items: TemplateDraftItem[]
}

export type TemplateDraft = {
  id: string
  name: string
  groups: TemplateDraftGroup[]
}

export function groupItems(items: FamilyPackingTemplateItem[]): TemplateDraftGroup[] {
  const order: string[] = []
  const map = new Map<string, FamilyPackingTemplateItem[]>()
  for (const item of items) {
    const category = item.category ?? ''
    if (!map.has(category)) {
      order.push(category)
      map.set(category, [])
    }
    map.get(category)!.push(item)
  }
  return order.map(name => ({
    clientKey: `cat:${name}`,
    name,
    items: (map.get(name) ?? []).map(item => ({
      clientKey: item.id,
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      weightGrams: item.weightGrams,
    })),
  }))
}

export function documentToDraft(doc: FamilyPackingTemplateDocument): TemplateDraft {
  return {
    id: doc.id,
    name: doc.name,
    groups: groupItems(doc.items),
  }
}

export function flattenDraft(draft: TemplateDraft): FamilyPackingTemplateItemInput[] {
  const items: FamilyPackingTemplateItemInput[] = []
  for (const group of draft.groups) {
    const category = group.name.trim()
    for (const item of group.items) {
      const name = item.name.trim()
      if (!name) continue
      items.push({
        name,
        category,
        quantity: Math.max(1, Math.min(99, Math.round(item.quantity) || 1)),
        weightGrams: item.weightGrams == null || Number.isNaN(item.weightGrams)
          ? null
          : Math.max(0, Math.min(100000, Math.round(item.weightGrams))),
      })
    }
  }
  return items
}

export function serializeDraft(draft: TemplateDraft): string {
  return JSON.stringify({
    name: draft.name.trim(),
    items: flattenDraft(draft),
  })
}

export function isDraftDirty(draft: TemplateDraft, saved: FamilyPackingTemplateDocument | undefined): boolean {
  if (!saved) return true
  return serializeDraft(draft) !== serializeDraft(documentToDraft(saved))
}

export function categoryCount(draft: TemplateDraft): number {
  return draft.groups.filter(group => flattenDraft({ ...draft, groups: [group] }).length > 0).length
}

export function itemCount(draft: TemplateDraft): number {
  return flattenDraft(draft).length
}

export function newClientKey(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}:${crypto.randomUUID()}`
  }
  return `${prefix}:${Date.now()}-${Math.random().toString(16).slice(2)}`
}
