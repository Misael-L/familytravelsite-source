import { packingApi, tripsApi } from '../../api/client'
import { useTripStore } from '../../store/tripStore'
import type { PackingItem } from '../../types'
import type { ParsedImportItem } from './packingListPanel.helpers'

/** Nest numeric ids or Family UUIDs. Never hash one into the other. */
export type PackingEntityId = string | number

export type PackingListMember = {
  id: PackingEntityId
  username: string
  avatar?: string | null
  avatar_url?: string | null
  is_guest?: boolean
}

export type PackingListAssignee = {
  user_id: PackingEntityId
  username: string
  avatar?: string | null
  is_guest?: boolean
}

export type PackingListItem = {
  id: PackingEntityId
  trip_id: PackingEntityId
  name: string
  checked: number | boolean
  category?: string | null
  sort_order: number
  weight_grams?: number | null
  bag_id?: PackingEntityId | null
  quantity?: number
  is_private?: number | boolean
  owner_id?: PackingEntityId | null
  owner_username?: string | null
  recipients?: { user_id: PackingEntityId; username: string }[]
  contributors?: { user_id: PackingEntityId; username: string; status?: string }[]
  created_at?: string
  updated_at?: string | null
}

export type PackingListBag = {
  id: PackingEntityId
  trip_id: PackingEntityId
  name: string
  color: string
  weight_limit_grams?: number | null
  sort_order: number
  user_id?: PackingEntityId | null
  assigned_username?: string | null
  members?: { user_id: PackingEntityId; username: string; avatar?: string | null }[]
}

export type PackingListTemplate = {
  id: PackingEntityId
  name: string
  item_count: number
}

export type PackingItemWrite = {
  name?: string
  checked?: boolean
  category?: string
  weight_grams?: number | null
  bag_id?: PackingEntityId | null
  quantity?: number
  is_private?: boolean
  visibility?: 'common' | 'personal' | 'shared'
  recipient_ids?: PackingEntityId[]
}

/**
 * Persistence port for PackingListPanel. Nest default = tripStore + packingApi.
 * Family injects packing.ts. Pixels stay in PackingListPanel.
 */
export type PackingListOps = {
  loadMembers: (tripId: PackingEntityId) => Promise<PackingListMember[]>
  loadCategoryAssignees: (tripId: PackingEntityId) => Promise<Record<string, PackingListAssignee[]>>
  setCategoryAssignees: (
    tripId: PackingEntityId,
    category: string,
    userIds: PackingEntityId[],
  ) => Promise<PackingListAssignee[]>
  addItem: (tripId: PackingEntityId, data: PackingItemWrite & { name: string }) => Promise<PackingListItem>
  updateItem: (tripId: PackingEntityId, id: PackingEntityId, data: PackingItemWrite) => Promise<void>
  deleteItem: (tripId: PackingEntityId, id: PackingEntityId) => Promise<void>
  toggleItem: (tripId: PackingEntityId, id: PackingEntityId, checked: boolean) => Promise<void>
  reorderItems: (tripId: PackingEntityId, orderedIds: PackingEntityId[]) => Promise<void>
  renameCategory: (tripId: PackingEntityId, oldName: string, newName: string, itemIds: PackingEntityId[]) => Promise<void>
  setSharing: (
    tripId: PackingEntityId,
    id: PackingEntityId,
    visibility: 'common' | 'personal' | 'shared',
    recipientIds: PackingEntityId[],
  ) => Promise<void>
  cloneItem: (tripId: PackingEntityId, id: PackingEntityId) => Promise<void>
  addContributor: (tripId: PackingEntityId, id: PackingEntityId) => Promise<void>
  removeContributor: (tripId: PackingEntityId, id: PackingEntityId, userId: PackingEntityId) => Promise<void>
  listBags: (tripId: PackingEntityId) => Promise<PackingListBag[]>
  createBag: (tripId: PackingEntityId, data: { name: string; color?: string }) => Promise<PackingListBag>
  deleteBag: (tripId: PackingEntityId, bagId: PackingEntityId) => Promise<void>
  updateBag: (tripId: PackingEntityId, bagId: PackingEntityId, data: Record<string, unknown>) => Promise<PackingListBag>
  setBagMembers: (tripId: PackingEntityId, bagId: PackingEntityId, userIds: PackingEntityId[]) => Promise<PackingListBag['members']>
  listTemplates: (tripId: PackingEntityId) => Promise<PackingListTemplate[]>
  applyTemplate: (
    tripId: PackingEntityId,
    templateId: PackingEntityId,
    visibility: 'common' | 'personal',
  ) => Promise<{ count: number; items: PackingListItem[] }>
  saveAsTemplate: (tripId: PackingEntityId, name: string) => Promise<void>
  bulkImport: (tripId: PackingEntityId, parsed: ParsedImportItem[]) => Promise<{ count: number; items: PackingListItem[] }>
}

function nestId(id: PackingEntityId): number {
  return typeof id === 'number' ? id : Number(id)
}

export const nestPackingListOps: PackingListOps = {
  loadMembers: async (tripId) => {
    const data = await tripsApi.getMembers(tripId)
    const all: PackingListMember[] = []
    if (data.owner) {
      all.push({
        id: data.owner.id,
        username: data.owner.username,
        avatar: data.owner.avatar_url,
        is_guest: false,
      })
    }
    if (data.members) {
      for (const m of data.members as Array<{ id: number; username: string; avatar_url?: string | null; is_guest?: boolean }>) {
        all.push({ id: m.id, username: m.username, avatar: m.avatar_url, is_guest: !!m.is_guest })
      }
    }
    return all
  },
  loadCategoryAssignees: async (tripId) => {
    const data = await packingApi.getCategoryAssignees(tripId)
    return data.assignees || {}
  },
  setCategoryAssignees: async (tripId, category, userIds) => {
    const data = await packingApi.setCategoryAssignees(tripId, category, userIds.map(nestId))
    return data.assignees || []
  },
  addItem: async (tripId, data) => {
    const item = await useTripStore.getState().addPackingItem(tripId, data as never)
    return item as PackingListItem
  },
  updateItem: async (tripId, id, data) => {
    await useTripStore.getState().updatePackingItem(tripId, nestId(id), data as unknown as Partial<PackingItem>)
  },
  deleteItem: (tripId, id) => useTripStore.getState().deletePackingItem(tripId, nestId(id)),
  toggleItem: (tripId, id, checked) => useTripStore.getState().togglePackingItem(tripId, nestId(id), checked),
  reorderItems: (tripId, orderedIds) =>
    useTripStore.getState().reorderPackingItems(tripId, orderedIds.map(nestId)),
  renameCategory: async (tripId, oldName, newName, itemIds) => {
    const fallback = useTripStore.getState().packingItems.filter(i => (i.category || '') === oldName)
    const ids = itemIds.length > 0 ? itemIds : fallback.map(i => i.id)
    for (const id of ids) {
      await useTripStore.getState().updatePackingItem(tripId, nestId(id), { category: newName })
    }
  },
  setSharing: (tripId, id, visibility, recipientIds) =>
    useTripStore.getState().setPackingItemSharing(tripId, nestId(id), visibility, recipientIds.map(nestId)),
  cloneItem: (tripId, id) => useTripStore.getState().clonePackingItem(tripId, nestId(id)),
  addContributor: (tripId, id) => useTripStore.getState().addPackingContributor(tripId, nestId(id)),
  removeContributor: (tripId, id, userId) =>
    useTripStore.getState().removePackingContributor(tripId, nestId(id), nestId(userId)),
  listBags: async (tripId) => {
    const r = await packingApi.listBags(tripId)
    return (r.bags || []) as PackingListBag[]
  },
  createBag: async (tripId, data) => {
    const result = await packingApi.createBag(tripId, data)
    return result.bag as PackingListBag
  },
  deleteBag: (tripId, bagId) => packingApi.deleteBag(tripId, nestId(bagId)).then(() => undefined),
  updateBag: async (tripId, bagId, data) => {
    const result = await packingApi.updateBag(tripId, nestId(bagId), data)
    return result.bag as PackingListBag
  },
  setBagMembers: async (tripId, bagId, userIds) => {
    const result = await packingApi.setBagMembers(tripId, nestId(bagId), userIds.map(nestId))
    return result.members
  },
  listTemplates: async (tripId) => {
    const d = await packingApi.listTemplates(tripId)
    return (d.templates || []) as PackingListTemplate[]
  },
  applyTemplate: async (tripId, templateId, visibility) => {
    const data = await packingApi.applyTemplate(tripId, nestId(templateId), visibility)
    const items = (data.items || []) as PackingListItem[]
    useTripStore.setState(s => ({ packingItems: [...s.packingItems, ...(data.items || [])] }))
    return { count: data.count, items }
  },
  saveAsTemplate: (tripId, name) => packingApi.saveAsTemplate(tripId, name).then(() => undefined),
  bulkImport: async (tripId, parsed) => {
    const result = await packingApi.bulkImport(tripId, parsed)
    useTripStore.setState(s => ({ packingItems: [...s.packingItems, ...(result.items || [])] }))
    return { count: result.count, items: (result.items || []) as PackingListItem[] }
  },
}
