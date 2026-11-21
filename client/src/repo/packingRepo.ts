import { assertRealPackingValue } from './packingCategoryPresentation'
import { currentPlannerReadPort, guardPlannerReadOnly } from './plannerReadPort'
import { captureReadSession, optionalReadCache, ReadSessionChanged } from '../sync/readSession'
import { refreshCanonical } from '../sync/canonicalCache'
import { captureWriteSession } from '../sync/writeSession'
import { sessionRead } from './sessionRead'
import { packingApi } from '../api/client'
import { replaceTripRows } from '../db/offlineDb'
import { mutationQueue, generateUUID, nextTempId } from '../sync/mutationQueue'
import { isEffectivelyOffline } from '../sync/networkMode'
import type { PackingItem } from '../types'

export const packingRepo = {
  async list(tripId: number | string): Promise<{ items: PackingItem[] }> {
    const planner = currentPlannerReadPort()
    if (planner) {
      if (!planner.packing) throw new Error('Canonical packing reads are not connected.')
      const owner = captureReadSession()
      const check = () => { owner.assertCurrent(); if (currentPlannerReadPort() !== planner) throw new ReadSessionChanged() }
      try { const result = await planner.packing(tripId); check(); return result }
      catch (error) { check(); throw error }
    }
    return sessionRead(
      async session => (await refreshCanonical(session, Number(tripId), {
        tables: ['packingItems'],
        fetch: () => packingApi.list(tripId),
        cache: result => replaceTripRows('packingItems', Number(tripId), result.items, session.db),
        cached: async () => ({
            items: await session.db.packingItems
              .where('trip_id').equals(Number(tripId)).toArray(),
          }),
      })).value,
      async (session) => ({
        items: await session.db.packingItems
          .where('trip_id').equals(Number(tripId)).toArray(),
      }),
    )
  },

  async create(tripId: number | string, data: Record<string, unknown> & { name: string }): Promise<{ item: PackingItem }> {
    assertRealPackingValue(data);
    guardPlannerReadOnly()
    const session = captureWriteSession(), db = session.db
    if (isEffectivelyOffline()) {
      const tempId = nextTempId()
      const tempItem: PackingItem = {
        ...(data as Partial<PackingItem>),
        id: tempId,
        trip_id: Number(tripId),
        name: (data.name as string) ?? 'New item',
        checked: 0,
      } as PackingItem
      await db.packingItems.put(tempItem)
      const id = generateUUID()
      await session.perform(() => mutationQueue.enqueue({
        id,
        tripId: Number(tripId),
        method: 'POST',
        url: `/trips/${tripId}/packing`,
        body: data,
        resource: 'packingItems',
        tempId,
      }))
      return { item: tempItem }
    }
    const result = await session.perform(() => packingApi.create(tripId, data))
    await optionalReadCache(db.packingItems.put(result.item), session)
    return result
  },

  async update(tripId: number | string, id: number, data: Record<string, unknown>): Promise<{ item: PackingItem }> {
    assertRealPackingValue(id); assertRealPackingValue(data);
    guardPlannerReadOnly()
    const session = captureWriteSession(), db = session.db
    if (isEffectivelyOffline()) {
      const existing = await db.packingItems.get(id)
      const optimistic: PackingItem = { ...(existing ?? {} as PackingItem), ...(data as Partial<PackingItem>), id }
      await db.packingItems.put(optimistic)
      const mutId = generateUUID()
      const isTemp = id < 0
      await session.perform(() => mutationQueue.enqueue({
        id: mutId,
        tripId: Number(tripId),
        method: 'PUT',
        url: isTemp ? `/trips/${tripId}/packing/{id}` : `/trips/${tripId}/packing/${id}`,
        body: data,
        resource: 'packingItems',
        entityId: id,
        baseUpdatedAt: existing?.updated_at ?? null,
        ...(isTemp ? { tempEntityId: id } : {}),
      }))
      return { item: optimistic }
    }
    const result = await session.perform(() => packingApi.update(tripId, id, data))
    await optionalReadCache(db.packingItems.put(result.item), session)
    return result
  },

  async delete(tripId: number | string, id: number): Promise<unknown> {
    assertRealPackingValue(id);
    guardPlannerReadOnly()
    const session = captureWriteSession(), db = session.db
    if (isEffectivelyOffline()) {
      await db.packingItems.delete(id)
      const mutId = generateUUID()
      const isTemp = id < 0
      await session.perform(() => mutationQueue.enqueue({
        id: mutId,
        tripId: Number(tripId),
        method: 'DELETE',
        url: isTemp ? `/trips/${tripId}/packing/{id}` : `/trips/${tripId}/packing/${id}`,
        body: undefined,
        resource: 'packingItems',
        entityId: id,
        ...(isTemp ? { tempEntityId: id } : {}),
      }))
      return { success: true }
    }
    const result = await session.perform(() => packingApi.delete(tripId, id))
    await optionalReadCache(db.packingItems.delete(id), session)
    return result
  },
}
