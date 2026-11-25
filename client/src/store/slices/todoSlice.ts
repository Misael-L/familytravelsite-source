import { currentPlannerTaskPort, type TaskEditOrigin } from '../../repo/plannerTaskPort'
import { captureTripMutation } from '../tripActionScope'
import { todoRepo } from '../../repo/todoRepo'
import type { StoreApi } from 'zustand'
import type { TripStoreState } from '../tripStore'
import type { TodoItem } from '../../types'
import type { TodoCreateItemRequest, TodoUpdateItemRequest } from '@trek/shared'
import { getApiErrorMessage } from '../../types'
import { notify } from '../notify'

type SetState = StoreApi<TripStoreState>['setState']
type GetState = StoreApi<TripStoreState>['getState']

export interface TodoSlice {
  addTodoItem: (tripId: number | string, data: TodoCreateItemRequest, origin?: TaskEditOrigin) => Promise<TodoItem>
  updateTodoItem: (tripId: number | string, id: number, data: TodoUpdateItemRequest, origin?: TaskEditOrigin) => Promise<TodoItem>
  deleteTodoItem: (tripId: number | string, id: number, origin?: TaskEditOrigin) => Promise<void>
  toggleTodoItem: (tripId: number | string, id: number, checked: boolean, observed?: TodoItem) => Promise<void>
  reorderTodoItems: (tripId: number | string, orderedIds: number[], observed?: TodoItem[]) => Promise<void>
}

function taskPort(state: TripStoreState) {
  const port = currentPlannerTaskPort()
  if (!port && state.todoItems.some(row => 'family_task' in row)) throw new Error('The original task cohort ended. Reopen the Trip before editing.')
  return port
}

export const createTodoSlice = (set: SetState, get: GetState): TodoSlice => ({
  addTodoItem: async (tripId, data, origin) => {
    const port = taskPort(get())
    if (origin) return origin.save(data)
    if (port) return port.bind(null, tripId).save(data)
    const action = captureTripMutation(set, get)
    try {
      const result = await action.perform(() => todoRepo.create(tripId, data))
      action.set(state => ({ todoItems: [...state.todoItems, result.item] }))
      return result.item
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error adding todo'))
    }
  },

  updateTodoItem: async (tripId, id, data, origin) => {
    const port = taskPort(get())
    if (origin) return origin.save(data)
    if (port) { const item = get().todoItems.find(row => row.id === id); if (!item) throw new Error('The observed task is unavailable.'); return port.bind(item, tripId).save(data) }
    const action = captureTripMutation(set, get)
    try {
      const result = await action.perform(() => todoRepo.update(tripId, id, data))
      action.set(state => ({
        todoItems: state.todoItems.map(item => item.id === id ? result.item : item)
      }))
      return result.item
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error updating todo'))
    }
  },

  deleteTodoItem: async (tripId, id, origin) => {
    const port = taskPort(get())
    if (origin) return origin.trash()
    if (port) { const item = get().todoItems.find(row => row.id === id); if (!item) throw new Error('The observed task is unavailable.'); return port.bind(item, tripId).trash() }
    const action = captureTripMutation(set, get)
    const prev = action.get().todoItems
    action.set(state => ({ todoItems: state.todoItems.filter(item => item.id !== id) }))
    try {
      await action.perform(() => todoRepo.delete(tripId, id))
    } catch (err: unknown) {
      action.set({ todoItems: prev })
      throw new Error(getApiErrorMessage(err, 'Error deleting todo'))
    }
  },

  toggleTodoItem: async (tripId, id, checked, observed) => {
    const port = taskPort(get())
    if (port) {
      const owner = captureTripMutation(set, get)
      const item = observed ?? get().todoItems.find(row => row.id === id)
      if (!item) throw new Error('The observed task is unavailable.')
      try { await port.completion(tripId, item, checked) } catch (error) { owner.effect(() => notify(getApiErrorMessage(error, 'Task save is retained; reconnect or resolve it before editing.'), 'error')) }
      return
    }
    const action = captureTripMutation(set, get)
    action.set(state => ({
      todoItems: state.todoItems.map(item =>
        item.id === id ? { ...item, checked: checked ? 1 : 0 } : item
      )
    }))
    try {
      await action.perform(() => todoRepo.update(tripId, id, { checked }))
    } catch (err: unknown) {
      // The caller fires this optimistically and doesn't await, so rolling back
      // silently would just flip the checkbox with no explanation. Surface it.
      action.set(state => ({
        todoItems: state.todoItems.map(item =>
          item.id === id ? { ...item, checked: checked ? 0 : 1 } : item
        )
      }))
      action.effect(() => notify(getApiErrorMessage(err, 'Error updating todo'), 'error'))
    }
  },

  reorderTodoItems: async (tripId, orderedIds, observed) => {
    const port = taskPort(get())
    if (port) {
      const owner = captureTripMutation(set, get)
      try { await port.reorder(tripId, observed ?? get().todoItems, orderedIds) } catch (error) { owner.effect(() => notify(getApiErrorMessage(error, 'Task order could not be confirmed.'), 'error')) }
      return
    }
    const action = captureTripMutation(set, get)
    const prev = action.get().todoItems
    // Unknown ids are dropped before reindexing so a stale id can't leave a gap
    // in the local sort_order sequence.
    action.set(state => {
      const byId = new Map(state.todoItems.map(i => [i.id, i]))
      const reordered = orderedIds
        .map(id => byId.get(id))
        .filter((i): i is TodoItem => i !== undefined)
        .map((item, idx): TodoItem => ({ ...item, sort_order: idx }))
      const remaining = state.todoItems.filter(i => !orderedIds.includes(i.id))
      return { todoItems: [...reordered, ...remaining] }
    })
    try {
      await action.perform(() => todoRepo.reorder(tripId, orderedIds))
    } catch (err: unknown) {
      action.set({ todoItems: prev })
      action.effect(() => notify(getApiErrorMessage(err, 'Error reordering todos'), 'error'))
    }
  },
})
