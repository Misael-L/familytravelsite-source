import { refreshCanonical } from '../sync/canonicalCache'
import { captureWriteSession } from '../sync/writeSession'
import { sessionRead } from './sessionRead'
import { optionalReadCache } from '../sync/readSession'
import { currentPlannerReadPort, guardPlannerReadOnly } from './plannerReadPort'
import { placesApi } from '../api/client'
import { replaceTripRows, upsertPlaces } from '../db/offlineDb'
import { mutationQueue, generateUUID, nextTempId } from '../sync/mutationQueue'
import { isEffectivelyOffline } from '../sync/networkMode'
import type { Place } from '../types'

/**
 * What of a write the optimistic row keeps. `fieldOrigins` says which fields the
 * user typed; it travels in the queued body for the server's origin tracking and
 * is no column of the place.
 */
function placeRow(data: Record<string, unknown>): Record<string, unknown> {
  const { fieldOrigins: _origins, ...row } = data
  return row
}

export const placeRepo = {
  async list(tripId: number | string, params?: Record<string, unknown>): Promise<{ places: Place[] }> {
    const port = currentPlannerReadPort()
    if (port) return await port.places(tripId, params)
    return sessionRead(
      async session => (await refreshCanonical(session, Number(tripId), {
        tables: ['places'],
        fetch: () => placesApi.list(tripId, params),
        cache: result => params ? upsertPlaces(result.places, session.db) : replaceTripRows('places', Number(tripId), result.places, session.db),
        cached: async () => ({
            places: await session.db.places
              .where('trip_id').equals(Number(tripId)).toArray(),
          }),
      })).value,
      async (session) => ({
        places: await session.db.places
          .where('trip_id').equals(Number(tripId)).toArray(),
      }),
    )
  },

  async create(tripId: number | string, data: Record<string, unknown> & { name: string }): Promise<{ place: Place }> {
    const session = captureWriteSession(), db = session.db
    guardPlannerReadOnly()
    if (isEffectivelyOffline()) {
      const tempId = nextTempId()
      const tempPlace: Place = {
        ...(placeRow(data) as Partial<Place>),
        id: tempId,
        trip_id: Number(tripId),
        name: (data.name as string) ?? 'New place',
      } as Place
      await db.places.put(tempPlace)
      const id = generateUUID()
      await session.perform(() => mutationQueue.enqueue({
        id,
        tripId: Number(tripId),
        method: 'POST',
        url: `/trips/${tripId}/places`,
        body: data,
        resource: 'places',
        tempId,
      }))
      return { place: tempPlace }
    }
    const result = await session.perform(() => placesApi.create(tripId, data))
    await optionalReadCache(db.places.put(result.place), session)
    return result
  },

  async update(tripId: number | string, id: number | string, data: Record<string, unknown>): Promise<{ place: Place }> {
    const session = captureWriteSession(), db = session.db
    guardPlannerReadOnly()
    if (isEffectivelyOffline()) {
      const existing = await db.places.get(Number(id))
      // trip_id has to be there even when nothing was cached: every read goes
      // through places.where('trip_id'), and clearTripData() evicts by it too —
      // a row without it is invisible and never cleaned up.
      const optimistic: Place = {
        ...(existing ?? {} as Place),
        ...(placeRow(data) as Partial<Place>),
        id: Number(id),
        trip_id: Number(tripId),
      }
      await db.places.put(optimistic)
      const mutId = generateUUID()
      const isTemp = Number(id) < 0
      await session.perform(() => mutationQueue.enqueue({
        id: mutId,
        tripId: Number(tripId),
        method: 'PUT',
        url: isTemp ? `/trips/${tripId}/places/{id}` : `/trips/${tripId}/places/${id}`,
        body: data,
        resource: 'places',
        entityId: Number(id),
        baseUpdatedAt: existing?.updated_at ?? null,
        ...(isTemp ? { tempEntityId: Number(id) } : {}),
      }))
      return { place: optimistic }
    }
    const result = await session.perform(() => placesApi.update(tripId, id, data))
    await optionalReadCache(db.places.put(result.place), session)
    return result
  },

  async delete(tripId: number | string, id: number | string): Promise<{ success?: boolean; tourPlaceIds?: number[] }> {
    const session = captureWriteSession(), db = session.db
    guardPlannerReadOnly()
    if (isEffectivelyOffline()) {
      // A tour is a place plus its facet; the server's cascade drops both.
      await db.places.delete(Number(id))
      await db.tours.delete(Number(id))
      const mutId = generateUUID()
      const isTemp = Number(id) < 0
      await session.perform(() => mutationQueue.enqueue({
        id: mutId,
        tripId: Number(tripId),
        method: 'DELETE',
        url: isTemp ? `/trips/${tripId}/places/{id}` : `/trips/${tripId}/places/${id}`,
        body: undefined,
        resource: 'places',
        entityId: Number(id),
        ...(isTemp ? { tempEntityId: Number(id) } : {}),
      }))
      return { success: true }
    }
    const result = await session.perform(() => placesApi.delete(tripId, id))
    await optionalReadCache(db.places.delete(Number(id)), session)
    await optionalReadCache(db.tours.delete(Number(id)), session)
    return result
  },

  async deleteMany(tripId: number | string, ids: number[]): Promise<{ deleted?: number[]; count?: number; tourPlaceIds?: number[] }> {
    const session = captureWriteSession(), db = session.db
    guardPlannerReadOnly()
    if (isEffectivelyOffline()) {
      await db.places.bulkDelete(ids)
      await db.tours.bulkDelete(ids)
      for (const id of ids) {
        const mutId = generateUUID()
        const isTemp = id < 0
        await session.perform(() => mutationQueue.enqueue({
          id: mutId,
          tripId: Number(tripId),
          method: 'DELETE',
          url: isTemp ? `/trips/${tripId}/places/{id}` : `/trips/${tripId}/places/${id}`,
          body: undefined,
          resource: 'places',
          entityId: id,
          ...(isTemp ? { tempEntityId: id } : {}),
        }))
      }
      return { deleted: ids, count: ids.length }
    }
    const result = await session.perform(() => placesApi.bulkDelete(tripId, ids))
    await db.places.bulkDelete(ids)
    await db.tours.bulkDelete(ids)
    return result
  },

  async updateMany(tripId: number | string, ids: number[], data: Record<string, unknown>): Promise<{ updated: number[]; count: number }> {
    const session = captureWriteSession(), db = session.db
    guardPlannerReadOnly()
    if (isEffectivelyOffline()) {
      // Offline fans out one queued PUT per id (mirrors deleteMany's DELETE fan-out).
      for (const id of ids) {
        const existing = await db.places.get(id)
        if (existing) await db.places.put({ ...existing, ...(data as Partial<Place>) })
        const mutId = generateUUID()
        const isTemp = id < 0
        await session.perform(() => mutationQueue.enqueue({
          id: mutId,
          tripId: Number(tripId),
          method: 'PUT',
          url: isTemp ? `/trips/${tripId}/places/{id}` : `/trips/${tripId}/places/${id}`,
          body: data,
          resource: 'places',
          entityId: id,
          baseUpdatedAt: existing?.updated_at ?? null,
          ...(isTemp ? { tempEntityId: id } : {}),
        }))
      }
      return { updated: ids, count: ids.length }
    }
    const result = await session.perform(() => placesApi.bulkUpdate(tripId, ids, data as Parameters<typeof placesApi.bulkUpdate>[2]))
    const cached = await db.places.bulkGet(ids)
    await db.places.bulkPut(cached.filter(Boolean).map(p => ({ ...(p as Place), ...(data as Partial<Place>) })))
    return result
  },
}
