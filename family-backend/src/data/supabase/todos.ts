import { getSupabaseBrowserClient } from './client'

export type FamilyTodoItem = {
  id: string
  tripId: string
  name: string
  checked: boolean
  category: string
  sortOrder: number
  dueDate: string | null
  description: string | null
  assignedPersonId: string | null
  priority: number
}

type TodoRow = {
  id: string
  trip_id: string
  name: string
  checked: boolean
  category: string
  sort_order: number
  due_date: string | null
  description: string | null
  assigned_person_id: string | null
  priority: number
}

function mapTodo(row: TodoRow): FamilyTodoItem {
  return {
    id: row.id,
    tripId: row.trip_id,
    name: row.name,
    checked: row.checked,
    category: row.category ?? '',
    sortOrder: row.sort_order ?? 0,
    dueDate: row.due_date,
    description: row.description,
    assignedPersonId: row.assigned_person_id,
    priority: row.priority ?? 0,
  }
}

export async function listTodoItems(tripId: string): Promise<FamilyTodoItem[]> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('todo_items')
    .select('id,trip_id,name,checked,category,sort_order,due_date,description,assigned_person_id,priority')
    .eq('trip_id', tripId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return ((data ?? []) as TodoRow[]).map(mapTodo)
}

export async function listTodoCategoryAssignees(tripId: string): Promise<Record<string, string[]>> {
  const { data, error } = await getSupabaseBrowserClient()
    .from('todo_category_assignees')
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

export type TodoItemDraft = {
  id?: string | null
  name: string
  category?: string
  checked?: boolean
  dueDate?: string | null
  description?: string | null
  assignedPersonId?: string | null
  priority?: number
  sortOrder?: number
}

export async function upsertTodoItem(tripId: string, draft: TodoItemDraft): Promise<string> {
  const payload = {
    trip_id: tripId,
    name: draft.name.trim(),
    category: draft.category ?? '',
    checked: draft.checked ?? false,
    due_date: draft.dueDate || null,
    description: draft.description?.trim() || null,
    assigned_person_id: draft.assignedPersonId || null,
    priority: Math.min(3, Math.max(0, draft.priority ?? 0)),
    sort_order: draft.sortOrder ?? 0,
  }
  if (draft.id) {
    const { error } = await getSupabaseBrowserClient().from('todo_items').update(payload).eq('id', draft.id)
    if (error) throw error
    return draft.id
  }
  const { data, error } = await getSupabaseBrowserClient()
    .from('todo_items')
    .insert(payload)
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function patchTodoItem(
  itemId: string,
  patch: Partial<{
    name: string
    checked: boolean
    category: string
    dueDate: string | null
    description: string | null
    assignedPersonId: string | null
    priority: number
    sortOrder: number
  }>,
): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.name != null) row.name = patch.name
  if (patch.checked != null) row.checked = patch.checked
  if (patch.category != null) row.category = patch.category
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate
  if (patch.description !== undefined) row.description = patch.description
  if (patch.assignedPersonId !== undefined) row.assigned_person_id = patch.assignedPersonId
  if (patch.priority != null) row.priority = patch.priority
  if (patch.sortOrder != null) row.sort_order = patch.sortOrder
  const { error } = await getSupabaseBrowserClient().from('todo_items').update(row).eq('id', itemId)
  if (error) throw error
}

export async function deleteTodoItem(itemId: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().from('todo_items').delete().eq('id', itemId)
  if (error) throw error
}

export async function reorderTodoItems(orderedIds: string[]): Promise<void> {
  const sb = getSupabaseBrowserClient()
  const results = await Promise.all(
    orderedIds.map((id, sortOrder) =>
      sb.from('todo_items').update({ sort_order: sortOrder }).eq('id', id),
    ),
  )
  const failed = results.find(r => r.error)
  if (failed?.error) throw failed.error
}

export async function renameTodoCategory(tripId: string, oldName: string, newName: string): Promise<void> {
  const next = newName.trim()
  if (!next || next === oldName) return
  const { error } = await getSupabaseBrowserClient()
    .from('todo_items')
    .update({ category: next })
    .eq('trip_id', tripId)
    .eq('category', oldName)
  if (error) throw error
}

export async function setTodoCategoryAssignees(
  tripId: string,
  categoryName: string,
  personIds: string[],
): Promise<void> {
  const sb = getSupabaseBrowserClient()
  const { error: delErr } = await sb.from('todo_category_assignees')
    .delete()
    .eq('trip_id', tripId)
    .eq('category_name', categoryName)
  if (delErr) throw delErr
  if (personIds.length === 0) return
  const { error } = await sb.from('todo_category_assignees').insert(
    personIds.map(person_id => ({ trip_id: tripId, category_name: categoryName, person_id })),
  )
  if (error) throw error
}

export function todoIsOverdue(item: FamilyTodoItem, todayIso: string): boolean {
  return !!item.dueDate && !item.checked && item.dueDate < todayIso
}
