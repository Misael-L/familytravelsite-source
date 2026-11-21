import { refreshCanonical } from '../sync/canonicalCache'
import { captureWriteSession } from '../sync/writeSession'
import { sessionRead } from './sessionRead'
import { currentPlannerCalendarPort } from './plannerCalendarPort'
import { currentPlannerReadPort, guardPlannerReadOnly } from './plannerReadPort'
import { daysApi } from '../api/client'
import { replaceTripRows, upsertTrip } from '../db/offlineDb'
import { generateUUID, mutationQueue } from '../sync/mutationQueue'
import { isEffectivelyOffline } from '../sync/networkMode'
import type { Day, Trip } from '../types'
import type { DayUpdateRequest } from '@trek/shared'

/** A cache write after the server already answered: its failure is logged, not the caller's. */
export function cacheAfterWrite(write: Promise<unknown>, what: string): void {
  write.catch((err: unknown) => console.warn(`Offline cache not updated after ${what}:`, err))
}

/**
 * The cached day with the fields of a write laid over it. The day answers carry
 * no notes of the day, so the ones the cache holds stay.
 */
async function cacheDayFields(dayId: number, fields: Partial<Day>): Promise<void> {
    const session = captureWriteSession(), db = session.db
  await db.days.where('id').equals(dayId).modify(day => { Object.assign(day, fields) })
}

/** Queue a write to one day, held behind any older write to it. */
async function enqueueDayWrite(tripId: number | string, dayId: number, url: string, body: unknown, fields: Partial<Day>): Promise<void> {
    const session = captureWriteSession(), db = session.db
  await db.transaction('rw', db.days, db.mutationQueue, async () => {
    await session.perform(() => mutationQueue.enqueue({
      id: generateUUID(), tripId: Number(tripId), method: 'PUT', url, body, resource: 'days', entityId: dayId,
    }))
    await session.perform(() => cacheDayFields(dayId, fields))
  })
  mutationQueue.sendSoon()
}

export const dayRepo = {
  async list(tripId: number | string): Promise<{ days: Day[] }> {
    const port = currentPlannerReadPort()
    if (port) return await port.days(tripId)
    return sessionRead(
      async session => (await refreshCanonical(session, Number(tripId), {
        tables: ['days'],
        fetch: () => daysApi.list(tripId),
        cache: result => replaceTripRows('days', Number(tripId), result.days, session.db),
        cached: async () => ({
            days: (await session.db.days
              .where('trip_id')
              .equals(Number(tripId))
              .sortBy('day_number' as keyof Day)) as Day[],
          }),
      })).value,
      async (session) => ({
        days: (await session.db.days
          .where('trip_id')
          .equals(Number(tripId))
          .sortBy('day_number' as keyof Day)) as Day[],
      }),
    )
  },

  /**
   * A day's title or its notes text. The server keeps the field a write leaves
   * out, so each goes on its own. Day writes carry no version token, so offline,
   * and online while an older write to the day still waits, it joins the queue.
   */
  async update(tripId: number | string, dayId: number, data: DayUpdateRequest): Promise<void> {
    const session = captureWriteSession()
    const calendar=currentPlannerCalendarPort()
    if(calendar){
      if(!('title' in data)||Object.keys(data).some(k=>k!=='title'))throw new Error('This day-note writer is not connected to the calendar cohort.')
      await calendar.rename(tripId,dayId,data.title??null);return
    }
    guardPlannerReadOnly()
    const fields: Partial<Day> = {
      ...('title' in data ? { title: data.title ?? null } : {}),
      ...('notes' in data ? { notes: data.notes || null } : {}),
    }
    if (!(await session.perform(() => mutationQueue.mustQueue('days', dayId)))) {
      await session.perform(() => daysApi.update(tripId, dayId, data))
      cacheAfterWrite(session.perform(() => cacheDayFields(dayId, fields)), 'renaming a day')
      return
    }
    await session.perform(() => enqueueDayWrite(tripId, dayId, `/trips/${tripId}/days/${dayId}`, data, fields))
  },

  /** The whole-day default route mode, queued the same way as update. */
  async setTransport(tripId: number | string, dayId: number, mode: string | null): Promise<void> {
    const session = captureWriteSession()
    guardPlannerReadOnly()
    const fields: Partial<Day> = { default_transport_mode: mode }
    if (!(await session.perform(() => mutationQueue.mustQueue('days', dayId)))) {
      await session.perform(() => daysApi.updateTransport(tripId, dayId, mode))
      cacheAfterWrite(session.perform(() => cacheDayFields(dayId, fields)), 'changing the travel mode of a day')
      return
    }
    await session.perform(() => enqueueDayWrite(tripId, dayId, `/trips/${tripId}/days/${dayId}/transport`, { transport_mode: mode }, fields))
  },

  /**
   * Delete a day. Online only, deliberately: the server cancels the stays on the
   * day, lets go of its bookings and moves the dates of the days after it, and a
   * queued offline write could not replay that faithfully. The cached row goes
   * right away, since this tab never hears its own day:deleted, and the trip the
   * server answers with (new day count, maybe a new end date) replaces the cached one.
   *
   * The cache is written without waiting, the way the other repos write after an
   * online call: once the server has deleted the day, a failing IndexedDB (full,
   * closed, blocked) must not report the delete as failed.
   */
  async remove(tripId: number | string, dayId: number): Promise<{ trip?: Trip }> {
    const session = captureWriteSession(), db = session.db
    guardPlannerReadOnly()
    if (isEffectivelyOffline()) throw new Error('Deleting a day needs a connection')
    const { trip } = await session.perform(() => daysApi.delete(tripId, dayId))
    cacheAfterWrite(db.days.delete(dayId), 'deleting a day')
    if (trip) cacheAfterWrite(session.perform(() => upsertTrip(trip, db)), 'deleting a day')
    return { trip }
  },

  /**
   * Put the days in a new order. Online only, like remove: on a trip with dates
   * the server moves the dates of the bookings along with their days, which the
   * cache cannot follow.
   */
  async reorder(tripId: number | string, orderedIds: number[]): Promise<void> {
    const session = captureWriteSession()
    guardPlannerReadOnly()
    if (isEffectivelyOffline()) throw new Error('Reordering days needs a connection')
    await session.perform(() => daysApi.reorder(tripId, orderedIds))
  },

  /** An empty day at a 1-based position, or at the end. Online only, like appendDated. */
  async insert(tripId: number | string, position?: number): Promise<{ day: Day; trip?: Trip }> {
    const session = captureWriteSession(), db = session.db
    guardPlannerReadOnly()
    if (isEffectivelyOffline()) throw new Error('Adding a day needs a connection')
    const result = await session.perform(() => daysApi.create(tripId, { position }))
    const { trip } = result
    if (trip) cacheAfterWrite(session.perform(() => upsertTrip(trip, db)), 'adding a day')
    return result
  },

  /**
   * Add the calendar day after the trip's last date, which extends the trip by
   * one day. Online only, like remove: the server picks the date and moves the
   * days without one back, and a queued offline write replayed later could land
   * on a date the trip has grown past by then. The trip the server answers with
   * (new end date, new day count) replaces the cached one, without waiting, as
   * in remove; the days are the caller's to refresh, since the ones behind the
   * new day moved.
   */
  async appendDated(tripId: number | string): Promise<{ day: Day; trip?: Trip }> {
    const session = captureWriteSession(), db = session.db
    guardPlannerReadOnly()
    if (isEffectivelyOffline()) throw new Error('Adding a day needs a connection')
    const { day, trip } = await session.perform(() => daysApi.create(tripId, { dated: true }))
    if (trip) cacheAfterWrite(session.perform(() => upsertTrip(trip, db)), 'adding a day')
    return { day, trip }
  },
}
