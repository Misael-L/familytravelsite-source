import { currentPlannerReadPort, guardPlannerReadOnly } from './plannerReadPort'
import { refreshCanonical } from '../sync/canonicalCache'
import { captureWriteSession } from '../sync/writeSession'
import { sessionRead } from './sessionRead'
import { todoApi } from '../api/client'
import { replaceTripRows } from '../db/offlineDb'
import { mutationQueue, generateUUID, nextTempId } from '../sync/mutationQueue'
import { isEffectivelyOffline } from '../sync/networkMode'
import type { TodoItem } from '../types'
import type { TodoCreateItemRequest, TodoUpdateItemRequest } from '@trek/shared'

/**
 * The task an offline create leaves on screen until the queue replays it. The
 * defaults are the ones the server fills in, and it goes to the end of the list
 * as a new task does there.
 */
async function localItem(tempId: number, tripId: number, data: TodoCreateItemRequest): Promise<TodoItem> {
    const session = captureWriteSession(), db = session.db
  const rows = await db.todoItems.where('trip_id').equals(tripId).toArray()
  const last = rows.reduce((max, row) => Math.max(max, row.sort_order ?? -1), -1)
  return {
    id: tempId,
    trip_id: tripId,
    name: data.name,
    category: data.category || null,
    checked: 0,
    sort_order: last + 1,
    due_date: data.due_date || null,
    description: data.description || null,
    assigned_user_id: data.assigned_user_id || null,
    priority: data.priority || 0,
  }
}

/** The fields of an edit as the row keeps them: the tick as 0/1, a null priority as none. */
function editedFields(data: TodoUpdateItemRequest): Partial<TodoItem> {
  const { checked, priority, ...rest } = data
  return {
    ...rest,
    ...(checked === undefined ? {} : { checked: checked ? 1 : 0 }),
    ...(priority === undefined ? {} : { priority: priority ?? 0 }),
  } as Partial<TodoItem>
}

/** Queue a write to one task, held behind any older write to it. */
async function enqueueItemWrite(tripId: number | string, id: number, method: 'PUT' | 'DELETE', body: unknown): Promise<void> {
    const session = captureWriteSession()
  await session.perform(() => mutationQueue.enqueue({
    id: generateUUID(),
    tripId: Number(tripId),
    method,
    url: `/trips/${tripId}/todo/${id < 0 ? '{id}' : id}`,
    body,
    resource: 'todoItems',
    entityId: id,
    ...(id < 0 ? { tempEntityId: id } : {}),
  }))
  mutationQueue.sendSoon()
}

/**
 * Tasks through the offline core. Reads fall back to the Dexie copy; a write
 * made offline lands there and in the mutation queue and replays once the
 * connection is back. Task writes carry no version token, so an online write to
 * a task that still has an older one queued joins the queue behind it
 * (mustQueue).
 */
export const todoRepo = {
  async list(tripId: number | string): Promise<{ items: TodoItem[] }> {
    const planner = currentPlannerReadPort();
    if (planner) {
      if (!planner.todos) throw new Error('Canonical task reads are not connected to this planner.');
      return planner.todos(tripId);
    }
    return sessionRead(
      async session => (await refreshCanonical(session, Number(tripId), {
        tables: ['todoItems'],
        fetch: () => todoApi.list(tripId),
        cache: result => replaceTripRows('todoItems', Number(tripId), result.items, session.db),
        cached: async () => ({
            items: await session.db.todoItems
              .where('trip_id').equals(Number(tripId)).toArray(),
          }),
      })).value,
      async (session) => ({
        items: await session.db.todoItems
          .where('trip_id').equals(Number(tripId)).toArray(),
      }),
    )
  },

  async create(tripId: number | string, data: TodoCreateItemRequest): Promise<{ item: TodoItem }> {
    guardPlannerReadOnly()
    const session = captureWriteSession(), db = session.db
    if (!isEffectivelyOffline()) {
      const result: { item: TodoItem } = await session.perform(() => todoApi.create(tripId, data))
      await db.todoItems.put(result.item)
      return result
    }
    const tid = Number(tripId)
    const tempId = nextTempId()
    const item = await session.perform(() => localItem(tempId, tid, data))
    await db.transaction('rw', db.todoItems, db.mutationQueue, async () => {
      await db.todoItems.put(item)
      await session.perform(() => mutationQueue.enqueue({
        id: generateUUID(),
        tripId: tid,
        method: 'POST',
        url: `/trips/${tripId}/todo`,
        body: data,
        resource: 'todoItems',
        tempId,
      }))
    })
    return { item }
  },

  async update(tripId: number | string, id: number, data: TodoUpdateItemRequest): Promise<{ item: TodoItem }> {
    guardPlannerReadOnly()
    const session = captureWriteSession(), db = session.db
    if (!(await session.perform(() => mutationQueue.mustQueue('todoItems', id)))) {
      const result: { item: TodoItem } = await session.perform(() => todoApi.update(tripId, id, data))
      await db.todoItems.put(result.item)
      return result
    }
    const before = await db.todoItems.get(id)
    const item = { ...(before ?? {}), ...editedFields(data), id, trip_id: Number(tripId) } as TodoItem
    await db.todoItems.put(item)
    await session.perform(() => enqueueItemWrite(tripId, id, 'PUT', data))
    return { item }
  },

  async delete(tripId: number | string, id: number): Promise<void> {
    guardPlannerReadOnly()
    const session = captureWriteSession(), db = session.db
    if (!(await session.perform(() => mutationQueue.mustQueue('todoItems', id)))) {
      await session.perform(() => todoApi.delete(tripId, id))
      await db.todoItems.delete(id)
      return
    }
    await db.todoItems.delete(id)
    await session.perform(() => enqueueItemWrite(tripId, id, 'DELETE', undefined))
  },

  /**
   * The new order of the tasks. Offline it waits in the queue; a task created
   * offline has no server id to name yet, so it keeps the place the server
   * gives a new one, at the end.
   */
  async reorder(tripId: number | string, orderedIds: number[]): Promise<void> {
    guardPlannerReadOnly()
    const session = captureWriteSession(), db = session.db
    if (!isEffectivelyOffline()) {
      await session.perform(() => todoApi.reorder(tripId, orderedIds))
      return
    }
    await db.transaction('rw', db.todoItems, db.mutationQueue, async () => {
      for (const [index, id] of orderedIds.entries()) {
        await db.todoItems.update(id, { sort_order: index })
      }
      await session.perform(() => mutationQueue.enqueue({
        id: generateUUID(),
        tripId: Number(tripId),
        method: 'PUT',
        url: `/trips/${tripId}/todo/reorder`,
        body: { orderedIds: orderedIds.filter(id => id > 0) },
      }))
    })
  },
}
