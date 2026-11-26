import { captureWriteSession } from '../sync/writeSession'
import { refreshCanonical } from '../sync/canonicalCache'
import { sessionRead } from './sessionRead'
import { optionalReadCache } from '../sync/readSession'
import { currentPlannerCalendarPort } from './plannerCalendarPort'
import { tripsApi } from '../api/client'
import { upsertTrip } from '../db/offlineDb'
import { generateUUID, mutationQueue } from '../sync/mutationQueue'
import { isEffectivelyOffline } from '../sync/networkMode'
import type { Trip } from '../types'
import type { ActiveTripResponse, TripUpdateRequest } from '@trek/shared'

/** A trip change refused offline because only the server can carry it out. */
export class TripNeedsConnectionError extends Error {
  constructor() {
    super('Changing the dates, the number of days, the currency or the cover needs a connection')
    this.name = 'TripNeedsConnectionError'
  }
}

/**
 * Does this change need the server? New dates or a day count rebuild the days,
 * another currency rebases the costs, a cover is stored there. A field sent
 * with the value the trip already has changes nothing, so the edit form, which
 * always sends every field, can still save a new name offline.
 */
export function tripChangeNeedsConnection(trip: Pick<Trip, 'start_date' | 'end_date' | 'currency'> | undefined, data: TripUpdateRequest): boolean {
  const differs = (key: 'start_date' | 'end_date' | 'currency') =>
    data[key] !== undefined && (!trip || (data[key] ?? null) !== (trip[key] ?? null))
  return differs('start_date') || differs('end_date') || differs('currency')
    || data.day_count !== undefined || data.cover_image !== undefined
}

/**
 * Offline stand-in for GET /trips/active. Mirrors the server's ranking
 * (trips.service.ts activeTrip): the trip running today, else the next one to
 * start, else the most recently started. Dates are plain local calendar dates.
 */
function pickActive(trips: Trip[]): Trip | null {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const relevance = (t: Trip): number => {
    if (t.start_date && t.end_date && t.start_date <= today && t.end_date >= today) return 0
    if (t.start_date && t.start_date >= today) return 1
    return 2
  }
  const ranked = [...trips].sort((a, b) => {
    const ra = relevance(a)
    const rb = relevance(b)
    if (ra !== rb) return ra - rb
    // Upcoming: soonest first. Everything else: most recently started first.
    return ra === 2
      ? (b.start_date ?? '').localeCompare(a.start_date ?? '')
      : (a.start_date ?? '').localeCompare(b.start_date ?? '')
  })
  return ranked[0] ?? null
}

export const tripRepo = {
  async list(): Promise<{ trips: Trip[]; archivedTrips: Trip[] }> {
    return sessionRead(
      async session => {
        const result = await refreshCanonical(session, null, {
          tables: ['trips'],
          fetch: async () => {
            const [active, archived] = await Promise.all([tripsApi.list(), tripsApi.list({ archived: 1 })])
            return { trips: active.trips, archivedTrips: archived.trips }
          },
          cache: result => Promise.all([...result.trips, ...result.archivedTrips].map(t => upsertTrip(t, session.db))),
          cached: async () => {
            const all = await session.db.trips.toArray()
            return { trips: all.filter(t => !t.is_archived), archivedTrips: all.filter(t => t.is_archived) }
          },
        })
        // Logout may clear read caches while keeping exact original commands.
        // A blocked observation with no cached trips is unavailable, not a verified empty account.
        if (result.disposition === 'retained' && !result.value.trips.length && !result.value.archivedTrips.length)
          throw new Error('Trip list refresh is held while original local work is retained. Open Offline settings to recover it.')
        return result.value
      },
      async (session) => {
        const all = await session.db.trips.toArray()
        return {
          trips: all.filter(t => !t.is_archived),
          archivedTrips: all.filter(t => t.is_archived),
        }
      },
    )
  },

  /**
   * The startup redirect asks for this on the very first paint, so it has to
   * answer offline too — otherwise "open my active trip on startup" drops the
   * user on the dashboard whenever the launch has no network.
   */
  async active(): Promise<ActiveTripResponse> {
    return sessionRead(
      () => tripsApi.active(),
      async (session) => {
        const all = await session.db.trips.toArray()
        const trip = pickActive(all.filter(t => !t.is_archived))
        return {
          trip: trip
            ? { id: trip.id, title: trip.title, start_date: trip.start_date, end_date: trip.end_date }
            : null,
        }
      },
    )
  },

  /**
   * A change to the trip itself. Its name, description, reminder and the archive
   * flag wait in the queue offline, and online too while an older write to the
   * trip still waits, since trip writes carry no version token. New dates, a new
   * day count, another currency or a cover need the server (it rebuilds the days,
   * rebases the costs or stores the image), so offline they are refused with
   * TripNeedsConnectionError and nothing is written.
   */
  async update(tripId: number | string, data: TripUpdateRequest): Promise<{ trip: Trip }> {
    const session = captureWriteSession(), db = session.db
    const calendar=currentPlannerCalendarPort()
    if(calendar)return {trip:await calendar.extendTrip(tripId,data)}
    const id = Number(tripId)
    if (!(await session.perform(() => mutationQueue.mustQueue('trips', id)))) {
      const result: { trip: Trip } = await session.perform(() => tripsApi.update(tripId, data))
      const cached = await db.trips.get(id)
      await optionalReadCache(session.perform(() => upsertTrip({ ...cached, ...result.trip }, db)), session)
      return result
    }
    const cached = await db.trips.get(id)
    if (isEffectivelyOffline() && tripChangeNeedsConnection(cached, data)) throw new TripNeedsConnectionError()
    const { date_shift_mode: _mode, ...fields } = data
    const trip = { ...(cached ?? { id }), ...fields } as Trip
    await db.transaction('rw', db.trips, db.mutationQueue, async () => {
      await db.trips.put(trip)
      await session.perform(() => mutationQueue.enqueue({
        id: generateUUID(), tripId: id, method: 'PUT', url: `/trips/${id}`,
        body: data, resource: 'trips', entityId: id,
      }))
    })
    mutationQueue.sendSoon()
    return { trip }
  },

  async get(tripId: number | string): Promise<{ trip: Trip }> {
    return sessionRead(
      async session => (await refreshCanonical(session, Number(tripId), {
        tables: ['trips'],
        fetch: () => tripsApi.get(tripId),
        cache: result => upsertTrip(result.trip, session.db),
        cached: async () => {
          const trip = await session.db.trips.get(Number(tripId))
          if (!trip) throw new Error('No cached trip data available offline')
          return { trip }
        },
      })).value,
      async (session) => {
        const cached = await session.db.trips.get(Number(tripId))
        if (cached) return { trip: cached }
        throw new Error('No cached trip data available offline')
      },
    )
  },
}
