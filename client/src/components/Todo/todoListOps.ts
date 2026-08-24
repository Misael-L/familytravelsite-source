import apiClient from '../../api/client'
import { useTripStore } from '../../store/tripStore'
import type { TodoItem } from '../../types'
import type { TodoCreateItemRequest, TodoUpdateItemRequest } from '@trek/shared'

/** Nest numeric ids or Family UUIDs. Never hash one into the other. */
export type TodoEntityId = string | number

export type TodoListMember = {
  id: TodoEntityId
  username: string
  avatar: string | null
  is_guest?: boolean
}

export type TodoItemWrite = {
  name?: string
  checked?: boolean
  category?: string | null
  due_date?: string | null
  description?: string | null
  assigned_user_id?: TodoEntityId | null
  priority?: number
}

/**
 * Persistence port for TodoListPanel. Nest default = tripStore + members API.
 * Family injects todos.ts. Pixels stay in TodoListPanel.
 */
export type TodoListOps = {
  loadMembers: (tripId: TodoEntityId) => Promise<{ members: TodoListMember[]; currentUserId: TodoEntityId | null }>
  addItem: (tripId: TodoEntityId, data: TodoItemWrite & { name: string }) => Promise<TodoItem>
  updateItem: (tripId: TodoEntityId, id: TodoEntityId, data: TodoItemWrite) => Promise<void>
  deleteItem: (tripId: TodoEntityId, id: TodoEntityId) => Promise<void>
  toggleItem: (tripId: TodoEntityId, id: TodoEntityId, checked: boolean) => Promise<void>
  reorderItems: (tripId: TodoEntityId, orderedIds: TodoEntityId[]) => Promise<void>
}

function nestId(id: TodoEntityId): number {
  return typeof id === 'number' ? id : Number(id)
}

export const nestTodoListOps: TodoListOps = {
  loadMembers: async (tripId) => {
    const r = await apiClient.get(`/trips/${tripId}/members`)
    const owner = r.data?.owner
    const mems = r.data?.members || []
    const all = owner ? [owner, ...mems] : mems
    return { members: all, currentUserId: r.data?.current_user_id ?? null }
  },
  addItem: (tripId, data) =>
    useTripStore.getState().addTodoItem(tripId, data as TodoCreateItemRequest),
  updateItem: async (tripId, id, data) => {
    await useTripStore.getState().updateTodoItem(tripId, nestId(id), data as TodoUpdateItemRequest)
  },
  deleteItem: (tripId, id) => useTripStore.getState().deleteTodoItem(tripId, nestId(id)),
  toggleItem: (tripId, id, checked) => useTripStore.getState().toggleTodoItem(tripId, nestId(id), checked),
  reorderItems: (tripId, orderedIds) =>
    useTripStore.getState().reorderTodoItems(tripId, orderedIds.map(nestId)),
}
