import {
  applyPackingTemplate,
  deletePackingBag,
  deletePackingItem,
  listPackingBags,
  listPackingCategoryAssignees,
  listPackingItems,
  listPackingTemplates,
  patchPackingItem,
  renamePackingCategory,
  reorderPackingItems,
  savePackingTemplateFromTrip,
  setPackingBagMembers,
  setPackingCategoryAssignees,
  setPackingItemContributor,
  setPackingItemSharing,
  upsertPackingBag,
  upsertPackingItem,
  type FamilyPackingBag,
  type FamilyPackingItem,
} from '../../data/supabase/packing'
import { BAG_COLORS } from './packingListPanel.constants'
import type { ParsedImportItem } from './packingListPanel.helpers'
import type {
  PackingEntityId,
  PackingItemWrite,
  PackingListAssignee,
  PackingListBag,
  PackingListItem,
  PackingListMember,
  PackingListOps,
} from './packingListOps'

export function toPackingListItem(
  item: FamilyPackingItem,
  names: Map<string, string>,
): PackingListItem {
  return {
    id: item.id,
    trip_id: item.tripId,
    name: item.name,
    checked: item.checked ? 1 : 0,
    category: item.category,
    sort_order: item.sortOrder,
    quantity: item.quantity,
    weight_grams: item.weightGrams,
    bag_id: item.bagId,
    is_private: item.isPrivate ? 1 : 0,
    owner_id: item.ownerPersonId,
    owner_username: item.ownerPersonId ? names.get(item.ownerPersonId) ?? null : null,
    recipients: item.recipientPersonIds.map(id => ({
      user_id: id,
      username: names.get(id) ?? '',
    })),
    contributors: item.contributorPersonIds.map(id => ({
      user_id: id,
      username: names.get(id) ?? '',
    })),
  }
}

export function toPackingListBag(
  bag: FamilyPackingBag,
  names: Map<string, string>,
): PackingListBag {
  return {
    id: bag.id,
    trip_id: bag.tripId,
    name: bag.name,
    color: bag.color || '#94a3b8',
    weight_limit_grams: bag.weightLimitGrams,
    sort_order: bag.sortOrder,
    members: bag.memberPersonIds.map(id => ({
      user_id: id,
      username: names.get(id) ?? '',
    })),
  }
}

export function toPackingListMembers(names: Map<string, string>): PackingListMember[] {
  return [...names.entries()].map(([id, username]) => ({ id, username }))
}

function asId(id: PackingEntityId): string {
  return String(id)
}

function personIds(ids: PackingEntityId[]): string[] {
  return ids.map(asId)
}

function visibilityPrivate(data: PackingItemWrite): boolean {
  if (data.visibility != null) return data.visibility !== 'common'
  if (data.is_private != null) return data.is_private
  return false
}

export function createFamilyPackingOps(ctx: {
  tripId: string
  familyId: string
  mePersonId: string | null
  getNames: () => Map<string, string>
  reload: () => Promise<void>
}): PackingListOps {
  const names = () => ctx.getNames()

  const mapAssignees = async (tripId: string): Promise<Record<string, PackingListAssignee[]>> => {
    const raw = await listPackingCategoryAssignees(tripId)
    const lookup = names()
    const out: Record<string, PackingListAssignee[]> = {}
    for (const [cat, ids] of Object.entries(raw)) {
      out[cat] = ids.map(id => ({ user_id: id, username: lookup.get(id) ?? '' }))
    }
    return out
  }

  const requireItem = async (itemId: PackingEntityId): Promise<FamilyPackingItem> => {
    const items = await listPackingItems(ctx.tripId)
    const hit = items.find(i => i.id === asId(itemId))
    if (!hit) throw new Error('packing item not found')
    return hit
  }

  return {
    loadMembers: async () => toPackingListMembers(names()),
    loadCategoryAssignees: () => mapAssignees(ctx.tripId),
    setCategoryAssignees: async (_tripId, category, userIds) => {
      await setPackingCategoryAssignees(ctx.tripId, category, personIds(userIds))
      await ctx.reload()
      const next = await mapAssignees(ctx.tripId)
      return next[category] || []
    },
    addItem: async (_tripId, data) => {
      const isPrivate = visibilityPrivate(data)
      const id = await upsertPackingItem(ctx.tripId, {
        name: data.name,
        category: data.category ?? '',
        checked: data.checked,
        quantity: data.quantity,
        weightGrams: data.weight_grams,
        bagId: data.bag_id != null ? asId(data.bag_id) : null,
        isPrivate,
        ownerPersonId: isPrivate ? ctx.mePersonId : null,
      })
      if (data.visibility === 'shared' && ctx.mePersonId) {
        await setPackingItemSharing(id, 'shared', ctx.mePersonId, personIds(data.recipient_ids || []))
      }
      await ctx.reload()
      const items = await listPackingItems(ctx.tripId)
      const created = items.find(i => i.id === id)
      if (!created) throw new Error('packing item not found')
      return toPackingListItem(created, names())
    },
    updateItem: async (_tripId, id, data) => {
      await patchPackingItem(asId(id), {
        name: data.name,
        checked: data.checked,
        category: data.category,
        quantity: data.quantity,
        weightGrams: data.weight_grams,
        bagId: data.bag_id === undefined ? undefined : data.bag_id == null ? null : asId(data.bag_id),
        isPrivate: data.is_private,
      })
      await ctx.reload()
    },
    deleteItem: async (_tripId, id) => {
      await deletePackingItem(asId(id))
      await ctx.reload()
    },
    toggleItem: async (_tripId, id, checked) => {
      await patchPackingItem(asId(id), { checked })
      await ctx.reload()
    },
    reorderItems: async (_tripId, orderedIds) => {
      await reorderPackingItems(orderedIds.map(asId))
      await ctx.reload()
    },
    renameCategory: async (_tripId, oldName, newName) => {
      await renamePackingCategory(ctx.tripId, oldName, newName)
      await ctx.reload()
    },
    setSharing: async (_tripId, id, visibility, recipientIds) => {
      if (!ctx.mePersonId) throw new Error('missing person')
      await setPackingItemSharing(asId(id), visibility, ctx.mePersonId, personIds(recipientIds))
      await ctx.reload()
    },
    cloneItem: async (_tripId, id) => {
      const src = await requireItem(id)
      await upsertPackingItem(ctx.tripId, {
        name: src.name,
        category: src.category,
        quantity: src.quantity,
        weightGrams: src.weightGrams,
        isPrivate: true,
        ownerPersonId: ctx.mePersonId,
        sortOrder: src.sortOrder + 1,
      })
      await ctx.reload()
    },
    addContributor: async (_tripId, id) => {
      if (!ctx.mePersonId) throw new Error('missing person')
      await setPackingItemContributor(asId(id), ctx.mePersonId, true)
      await ctx.reload()
    },
    removeContributor: async (_tripId, id, userId) => {
      await setPackingItemContributor(asId(id), asId(userId), false)
      await ctx.reload()
    },
    listBags: async () => {
      const bags = await listPackingBags(ctx.tripId)
      return bags.map(b => toPackingListBag(b, names()))
    },
    createBag: async (_tripId, data) => {
      const bags = await listPackingBags(ctx.tripId)
      const id = await upsertPackingBag(ctx.tripId, {
        name: data.name,
        color: data.color || BAG_COLORS[bags.length % BAG_COLORS.length],
        sortOrder: bags.length,
      })
      await ctx.reload()
      const next = (await listPackingBags(ctx.tripId)).find(b => b.id === id)
      if (!next) throw new Error('bag not found')
      return toPackingListBag(next, names())
    },
    deleteBag: async (_tripId, bagId) => {
      await deletePackingBag(asId(bagId))
      await ctx.reload()
    },
    updateBag: async (_tripId, bagId, data) => {
      const bags = await listPackingBags(ctx.tripId)
      const existing = bags.find(b => b.id === asId(bagId))
      if (!existing) throw new Error('bag not found')
      await upsertPackingBag(ctx.tripId, {
        id: existing.id,
        name: typeof data.name === 'string' ? data.name : existing.name,
        color: typeof data.color === 'string' ? data.color : existing.color,
        weightLimitGrams: data.weight_limit_grams === undefined
          ? existing.weightLimitGrams
          : data.weight_limit_grams == null ? null : Number(data.weight_limit_grams),
        sortOrder: existing.sortOrder,
      })
      await ctx.reload()
      const next = (await listPackingBags(ctx.tripId)).find(b => b.id === asId(bagId))
      if (!next) throw new Error('bag not found')
      return toPackingListBag(next, names())
    },
    setBagMembers: async (_tripId, bagId, userIds) => {
      await setPackingBagMembers(asId(bagId), personIds(userIds))
      await ctx.reload()
      const next = (await listPackingBags(ctx.tripId)).find(b => b.id === asId(bagId))
      return toPackingListBag(next || {
        id: asId(bagId),
        tripId: ctx.tripId,
        name: '',
        color: null,
        weightLimitGrams: null,
        sortOrder: 0,
        memberPersonIds: personIds(userIds),
      }, names()).members
    },
    listTemplates: async () => {
      const templates = await listPackingTemplates(ctx.familyId)
      return templates.map(t => ({ id: t.id, name: t.name, item_count: t.itemCount }))
    },
    applyTemplate: async (_tripId, templateId) => {
      const count = await applyPackingTemplate(ctx.tripId, asId(templateId))
      await ctx.reload()
      return { count, items: [] }
    },
    saveAsTemplate: async (_tripId, name) => {
      await savePackingTemplateFromTrip(ctx.tripId, name)
    },
    bulkImport: async (_tripId, parsed: ParsedImportItem[]) => {
      const bags = await listPackingBags(ctx.tripId)
      const byName = new Map(bags.map(b => [b.name.toLowerCase(), b.id]))
      const existing = await listPackingItems(ctx.tripId)
      let sort = existing.length
      for (const row of parsed) {
        let bagId: string | null = null
        if (row.bag) {
          const key = row.bag.toLowerCase()
          const hit = byName.get(key)
          if (hit) bagId = hit
          else {
            bagId = await upsertPackingBag(ctx.tripId, { name: row.bag, sortOrder: bags.length + byName.size })
            byName.set(key, bagId)
          }
        }
        await upsertPackingItem(ctx.tripId, {
          name: row.name,
          category: row.category || '',
          weightGrams: row.weight_grams ? Number(row.weight_grams) : null,
          bagId,
          checked: row.checked,
          sortOrder: sort++,
        })
      }
      await ctx.reload()
      return { count: parsed.length, items: [] }
    },
  }
}
