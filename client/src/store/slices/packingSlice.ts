import { assertRealPackingValue } from '../../repo/packingCategoryPresentation'
import { packingSliceOrigin, packingSlicePort, guardPackingGroupAction, type PackingEditOrigin } from '../../repo/plannerPackingPort'
import { captureTripMutation } from '../tripActionScope'
import { packingRepo } from '../../repo/packingRepo'
import { packingApi } from '../../api/client'
import type { StoreApi } from 'zustand'
import type { TripStoreState } from '../tripStore'
import type { PackingItem } from '../../types'
import { getApiErrorMessage } from '../../types'
import { notify } from '../notify'
import { resolvePackedState } from '@trek/shared'

type SetState = StoreApi<TripStoreState>['setState']
type GetState = StoreApi<TripStoreState>['getState']

export interface PackingSlice {
  addPackingItem: (tripId: number | string, data: Partial<PackingItem> & { name: string }, origin?: PackingEditOrigin) => Promise<PackingItem>
  updatePackingItem: (tripId: number | string, id: number, data: Partial<PackingItem>, origin?: PackingEditOrigin) => Promise<PackingItem>
  deletePackingItem: (tripId: number | string, id: number, origin?: PackingEditOrigin) => Promise<void>
  togglePackingItem: (tripId: number | string, id: number, checked: boolean, observed?: PackingItem) => Promise<void>
  /** Count how many pieces of a multi-piece item are packed (#2296). */
  setPackedCount: (tripId: number | string, id: number, count: number, observed?: PackingItem) => Promise<void>
  reorderPackingItems: (tripId: number | string, orderedIds: number[], observed?: PackingItem[]) => Promise<void>
  // Three-tier sharing (#858)
  setPackingItemSharing: (tripId: number | string, id: number, visibility: 'common' | 'personal' | 'shared', recipientIds: number[]) => Promise<void>
  clonePackingItem: (tripId: number | string, id: number) => Promise<void>
  addPackingContributor: (tripId: number | string, id: number) => Promise<void>
  removePackingContributor: (tripId: number | string, id: number, userId: number) => Promise<void>
}

export const createPackingSlice = (set: SetState, get: GetState): PackingSlice => ({
  addPackingItem: async (tripId, data, origin) => {
    const action = captureTripMutation(set, get)
    assertRealPackingValue(data)
    const bound = packingSliceOrigin(tripId, null, origin, get().packingItems)
    if (bound) return bound.save(data)
    try {
      const result = await action.perform(() => packingRepo.create(tripId, data as Record<string, unknown> & { name: string }))
      action.set(state => ({ packingItems: [...state.packingItems, result.item] }))
      return result.item
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error adding item'))
    }
  },

  updatePackingItem: async (tripId, id, data, origin) => {
    const action = captureTripMutation(set, get)
    assertRealPackingValue(id); assertRealPackingValue(data);
    const bound = packingSliceOrigin(tripId, id, origin, get().packingItems)
    if (bound) return bound.save(data)
    try {
      const result = await action.perform(() => packingRepo.update(tripId, id, data as Record<string, unknown>))
      action.set(state => ({
        packingItems: state.packingItems.map(item => item.id === id ? result.item : item)
      }))
      return result.item
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error updating item'))
    }
  },

  deletePackingItem: async (tripId, id, origin) => {
    const action = captureTripMutation(set, get)
    const bound = packingSliceOrigin(tripId, id, origin, get().packingItems)
    if (bound) return bound.trash()
    const prev = action.get().packingItems
    action.set(state => ({ packingItems: state.packingItems.filter(item => item.id !== id) }))
    try {
      await action.perform(() => packingRepo.delete(tripId, id))
    } catch (err: unknown) {
      action.set({ packingItems: prev })
      throw new Error(getApiErrorMessage(err, 'Error deleting item'))
    }
  },

  togglePackingItem: async (tripId, id, checked, observed) => {
    const action = captureTripMutation(set, get)
    const port = packingSlicePort(observed, id, get().packingItems)
    if (port) { if (!observed) throw new Error('The original packing observation is required.'); await action.perform(() => port.packed(tripId, observed, {checked})); return }
    const prev = action.get().packingItems.find(item => item.id === id)
    // Ticking decides for the whole item, so a partial count goes with it (#2296).
    action.set(state => ({
      packingItems: state.packingItems.map(item =>
        item.id === id ? { ...item, checked: checked ? 1 : 0, packed_quantity: null } : item
      )
    }))
    try {
      await action.perform(() => packingRepo.update(tripId, id, { checked }))
    } catch (err: unknown) {
      // The caller fires this optimistically and doesn't await, so rolling back
      // silently would just flip the checkbox with no explanation. Surface it.
      action.set(state => ({
        packingItems: state.packingItems.map(item =>
          item.id === id ? { ...item, checked: checked ? 0 : 1, packed_quantity: prev?.packed_quantity ?? null } : item
        )
      }))
      action.effect(() => notify(getApiErrorMessage(err, 'Error updating item'), 'error'))
    }
  },

  setPackedCount: async (tripId, id, count, observed) => {
    const action = captureTripMutation(set, get)
    const port = packingSlicePort(observed, id, get().packingItems)
    if (port) { if (!observed) throw new Error('The original packing observation is required.'); await action.perform(() => port.packed(tripId, observed, {packed_quantity: count})); return }
    const prev = action.get().packingItems.find(item => item.id === id)
    if (!prev) return
    // The server's own rule, run ahead of it so the counter answers at once.
    const next = resolvePackedState(
      { checked: prev.checked ? 1 : 0, packed_quantity: prev.packed_quantity ?? null },
      { bodyKeys: ['packed_quantity'], packed_quantity: count, quantity: prev.quantity || 1 },
    )
    action.set(state => ({ packingItems: state.packingItems.map(item => item.id === id ? { ...item, ...next } : item) }))
    try {
      await action.perform(() => packingRepo.update(tripId, id, { packed_quantity: count }))
    } catch (err: unknown) {
      action.set(state => ({ packingItems: state.packingItems.map(item => item.id === id ? prev : item) }))
      action.effect(() => notify(getApiErrorMessage(err, 'Error updating item'), 'error'))
    }
  },

  reorderPackingItems: async (tripId, orderedIds, observed) => {
    const action = captureTripMutation(set, get)
    orderedIds.forEach(assertRealPackingValue)
    const port = packingSlicePort(observed, null, get().packingItems)
    if (port) { if (!observed) throw new Error('The original packing observation is required.'); await action.perform(() => port.reorder(tripId, observed, orderedIds)); return }
    const prev = action.get().packingItems
    // Optimistic reorder: rebuild the array in the requested order, reindexing
    // sort_order; any items not in orderedIds keep their place at the end.
    // Unknown ids are dropped first so a stale id can't leave a gap in the
    // local sort_order sequence.
    action.set(state => {
      const byId = new Map(state.packingItems.map(i => [i.id, i]))
      const reordered = orderedIds
        .map(id => byId.get(id))
        .filter((i): i is PackingItem => i !== undefined)
        .map((item, idx): PackingItem => ({ ...item, sort_order: idx }))
      const remaining = state.packingItems.filter(i => !orderedIds.includes(i.id))
      return { packingItems: [...reordered, ...remaining] }
    })
    try {
      await action.perform(() => packingApi.reorder(tripId, orderedIds))
    } catch (err: unknown) {
      action.set({ packingItems: prev })
      action.effect(() => notify(getApiErrorMessage(err, 'Error reordering items'), 'error'))
    }
  },

  // ── Three-tier sharing (#858) ──────────────────────────────────────────────
  ...createPackingSharingActions(set, get),
})

const createPackingSharingActions = (set: SetState, get: GetState): Pick<PackingSlice, 'setPackingItemSharing' | 'clonePackingItem' | 'addPackingContributor' | 'removePackingContributor'> => ({
  setPackingItemSharing: async (tripId, id, visibility, recipientIds) => {
    assertRealPackingValue(id)
    guardPackingGroupAction(get().packingItems)
    const action = captureTripMutation(set, get)
    try {
      const result = await action.perform(() => packingApi.setSharing(tripId, id, { visibility, recipient_ids: recipientIds }))
      action.set(state => ({ packingItems: state.packingItems.map(i => i.id === id ? result.item : i) }))
    } catch (err: unknown) {
      action.effect(() => notify(getApiErrorMessage(err, 'Error updating sharing'), 'error'))
      throw err
    }
  },

  clonePackingItem: async (tripId, id) => {
    assertRealPackingValue(id)
    guardPackingGroupAction(get().packingItems)
    const action = captureTripMutation(set, get)
    try {
      const result = await action.perform(() => packingApi.clone(tripId, id))
      action.set(state => (state.packingItems.some(i => i.id === result.item.id) ? {} : { packingItems: [...state.packingItems, result.item] }))
    } catch (err: unknown) {
      action.effect(() => notify(getApiErrorMessage(err, 'Error copying item'), 'error'))
    }
  },

  addPackingContributor: async (tripId, id) => {
    assertRealPackingValue(id)
    guardPackingGroupAction(get().packingItems)
    const action = captureTripMutation(set, get)
    try {
      const result = await action.perform(() => packingApi.addContributor(tripId, id))
      action.set(state => ({ packingItems: state.packingItems.map(i => i.id === id ? result.item : i) }))
    } catch (err: unknown) {
      action.effect(() => notify(getApiErrorMessage(err, 'Error joining item'), 'error'))
    }
  },

  removePackingContributor: async (tripId, id, userId) => {
    assertRealPackingValue(id)
    guardPackingGroupAction(get().packingItems)
    const action = captureTripMutation(set, get)
    try {
      const result = await action.perform(() => packingApi.removeContributor(tripId, id, userId))
      action.set(state => ({ packingItems: state.packingItems.map(i => i.id === id ? result.item : i) }))
    } catch (err: unknown) {
      action.effect(() => notify(getApiErrorMessage(err, 'Error leaving item'), 'error'))
    }
  },
})
