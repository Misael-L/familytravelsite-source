import {
  deleteTodoItem,
  listTodoItems,
  patchTodoItem,
  reorderTodoItems,
  upsertTodoItem,
  type FamilyTodoItem,
} from '../../data/supabase/todos'
import type { TodoItem } from '../../types'
import type { TodoEntityId, TodoItemWrite, TodoListMember, TodoListOps } from './todoListOps'

export function toTodoListItem(item: FamilyTodoItem): TodoItem {
  return {
    id: item.id,
    trip_id: item.tripId,
    name: item.name,
    category: item.category || null,
    checked: item.checked ? 1 : 0,
    sort_order: item.sortOrder,
    due_date: item.dueDate,
    description: item.description,
    assigned_user_id: item.assignedPersonId,
    priority: item.priority,
  }
}

export function toTodoListMembers(names: Map<string, string>): TodoListMember[] {
  return [...names.entries()].map(([id, username]) => ({ id, username, avatar: null }))
}

function asId(id: TodoEntityId): string {
  return String(id)
}

export function createFamilyTodoOps(ctx: {
  tripId: string
  mePersonId: string | null
  getNames: () => Map<string, string>
  reload: () => Promise<void>
}): TodoListOps {
  return {
    loadMembers: async () => ({
      members: toTodoListMembers(ctx.getNames()),
      currentUserId: ctx.mePersonId,
    }),
    addItem: async (_tripId, data) => {
      const id = await upsertTodoItem(ctx.tripId, {
        name: data.name,
        category: data.category ?? '',
        checked: data.checked,
        dueDate: data.due_date,
        description: data.description,
        assignedPersonId: data.assigned_user_id != null ? asId(data.assigned_user_id) : null,
        priority: data.priority,
      })
      await ctx.reload()
      const items = await listTodoItems(ctx.tripId)
      const created = items.find(i => i.id === id)
      if (!created) throw new Error('todo not found')
      return toTodoListItem(created)
    },
    updateItem: async (_tripId, id, data: TodoItemWrite) => {
      await patchTodoItem(asId(id), {
        name: data.name,
        checked: data.checked,
        category: data.category ?? undefined,
        dueDate: data.due_date,
        description: data.description,
        assignedPersonId: data.assigned_user_id === undefined
          ? undefined
          : data.assigned_user_id == null ? null : asId(data.assigned_user_id),
        priority: data.priority,
      })
      await ctx.reload()
    },
    deleteItem: async (_tripId, id) => {
      await deleteTodoItem(asId(id))
      await ctx.reload()
    },
    toggleItem: async (_tripId, id, checked) => {
      await patchTodoItem(asId(id), { checked })
      await ctx.reload()
    },
    reorderItems: async (_tripId, orderedIds) => {
      await reorderTodoItems(orderedIds.map(asId))
      await ctx.reload()
    },
  }
}
