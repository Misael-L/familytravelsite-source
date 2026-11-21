import { captureReadSession, ReadSessionChanged } from '../sync/readSession'
import { currentPlannerReadPort, guardPlannerReadOnly } from './plannerReadPort'
import { refreshCanonical } from '../sync/canonicalCache'
import { captureWriteSession } from '../sync/writeSession'
import { sessionRead } from './sessionRead'
import type { ReservationCreateRequest, ReservationTraveler, ReservationUpdateRequest } from '@trek/shared'
import { reservationsApi } from '../api/client'
import { replaceTripRows } from '../db/offlineDb'
import { mutationQueue, generateUUID, nextTempId } from '../sync/mutationQueue'
import { isEffectivelyOffline } from '../sync/networkMode'
import { withTransportPositions } from '../utils/mergedOrder'
import type { Reservation } from '../types'

type ReservationBody = ReservationCreateRequest | ReservationUpdateRequest

export interface ReservationPosition {
  id: number
  day_plan_position: number
}

// Fields a booking write may carry that are instructions to the server, not
// columns of the row: the stay and the cost it creates alongside, and the legs
// it stores as endpoints.
const REQUEST_ONLY_FIELDS = ['create_accommodation', 'create_budget_entry', 'endpoints'] as const

/**
 * The booking an offline write leaves on screen until the queue replays it and
 * the server's own row replaces it. Metadata is kept as the JSON text the server
 * answers with, and the joined day and place names come from the cached rows.
 */
async function localReservation(id: number, tripId: number, body: ReservationBody, before: Reservation | undefined): Promise<Reservation> {
    const session = captureWriteSession(), db = session.db
  const fields: Record<string, unknown> = { ...body }
  for (const key of REQUEST_ONLY_FIELDS) delete fields[key]
  if (fields.metadata !== undefined && fields.metadata !== null && typeof fields.metadata !== 'string') {
    fields.metadata = JSON.stringify(fields.metadata)
  }
  const row = {
    ...(before ?? { status: 'pending', type: 'other', travelers: [], endpoints: [] }),
    ...fields,
    id,
    trip_id: tripId,
  } as Reservation
  if (row.day_id) row.day_number = (await db.days.get(Number(row.day_id)))?.day_number ?? row.day_number ?? null
  if (row.place_id && row.place_id !== before?.place_id) row.place_name = (await db.places.get(Number(row.place_id)))?.name ?? null
  return row
}

/** Queue a write to one booking, held behind any older write to it. */
async function enqueueReservationWrite(tripId: number | string, id: number, method: 'PUT' | 'DELETE', suffix: string, body: unknown): Promise<void> {
    const session = captureWriteSession()
  await session.perform(() => mutationQueue.enqueue({
    id: generateUUID(),
    tripId: Number(tripId),
    method,
    url: `/trips/${tripId}/reservations/${id < 0 ? '{id}' : id}${suffix}`,
    body,
    resource: 'reservations',
    entityId: id,
    ...(id < 0 ? { tempEntityId: id } : {}),
  }))
  mutationQueue.sendSoon()
}

/**
 * Bookings and transports through the offline core. Reads fall back to the
 * Dexie copy; a write made offline lands there and in the mutation queue and
 * replays once the connection is back. Booking writes carry no version token,
 * so an online write to a booking that still has an older one queued joins the
 * queue behind it (mustQueue).
 *
 * What the server does alongside a booking (the stay of a hotel, the linked
 * cost) happens when the queue sends it, and shows with the next read.
 */
export const reservationRepo = {
  async list(tripId: number | string): Promise<{ reservations: Reservation[] }> {
    const planner = currentPlannerReadPort()
    if (planner) {
      if (!planner.reservations) throw new Error('Canonical reservation reads are not connected.')
      const owner = captureReadSession()
      const check = () => { owner.assertCurrent(); if (currentPlannerReadPort() !== planner) throw new ReadSessionChanged() }
      try { const result = await planner.reservations(tripId); check(); return result }
      catch (error) { check(); throw error }
    }
    return sessionRead(
      async session => (await refreshCanonical(session, Number(tripId), {
        tables: ['reservations'],
        fetch: () => reservationsApi.list(tripId),
        cache: result => replaceTripRows('reservations', Number(tripId), result.reservations, session.db),
        cached: async () => ({
            reservations: await session.db.reservations
              .where('trip_id').equals(Number(tripId)).toArray(),
          }),
      })).value,
      async (session) => ({
        reservations: await session.db.reservations
          .where('trip_id').equals(Number(tripId)).toArray(),
      }),
    )
  },

  async create(tripId: number | string, data: ReservationCreateRequest): Promise<{ reservation: Reservation }> {
    guardPlannerReadOnly()
    const session = captureWriteSession(), db = session.db
    if (!isEffectivelyOffline()) {
      const result: { reservation: Reservation } = await session.perform(() => reservationsApi.create(tripId, data))
      if (result?.reservation) await db.reservations.put(result.reservation)
      return result
    }
    const tid = Number(tripId)
    const tempId = nextTempId()
    const reservation = await session.perform(() => localReservation(tempId, tid, data, undefined))
    await db.transaction('rw', db.reservations, db.mutationQueue, async () => {
      await db.reservations.put(reservation)
      await session.perform(() => mutationQueue.enqueue({
        id: generateUUID(),
        tripId: tid,
        method: 'POST',
        url: `/trips/${tripId}/reservations`,
        body: data,
        resource: 'reservations',
        tempId,
      }))
    })
    return { reservation }
  },

  async update(tripId: number | string, id: number, data: ReservationUpdateRequest): Promise<{ reservation: Reservation }> {
    guardPlannerReadOnly()
    const session = captureWriteSession(), db = session.db
    if (!(await session.perform(() => mutationQueue.mustQueue('reservations', id)))) {
      const result: { reservation: Reservation } = await session.perform(() => reservationsApi.update(tripId, id, data))
      if (result?.reservation) await db.reservations.put(result.reservation)
      return result
    }
    const reservation = await session.perform(async () => { const values = [id, Number(tripId), data, await db.reservations.get(id)] as const; session.assertCurrent(); return localReservation(...values) })
    await db.reservations.put(reservation)
    await session.perform(() => enqueueReservationWrite(tripId, id, 'PUT', '', data))
    return { reservation }
  },

  /** Deleting a booking takes its linked costs with it, here as on the server. */
  async delete(tripId: number | string, id: number): Promise<void> {
    guardPlannerReadOnly()
    const session = captureWriteSession(), db = session.db
    if (!(await session.perform(() => mutationQueue.mustQueue('reservations', id)))) {
      await session.perform(() => reservationsApi.delete(tripId, id))
    } else {
      await session.perform(() => enqueueReservationWrite(tripId, id, 'DELETE', '', undefined))
    }
    await db.reservations.delete(id)
    await db.budgetItems.where('trip_id').equals(Number(tripId)).filter(i => i.reservation_id === id).delete()
  },

  async setTravelers(tripId: number | string, id: number, userIds: number[]): Promise<{ travelers: ReservationTraveler[] }> {
    guardPlannerReadOnly()
    const session = captureWriteSession(), db = session.db
    if (!(await session.perform(() => mutationQueue.mustQueue('reservations', id)))) {
      const result: { travelers: ReservationTraveler[] } = await session.perform(() => reservationsApi.setTravelers(tripId, id, userIds))
      await db.reservations.where('id').equals(id).modify(r => { r.travelers = result.travelers })
      return result
    }
    const members = await db.tripMembers.where('tripId').equals(Number(tripId)).toArray()
    const travelers: ReservationTraveler[] = userIds.map(user_id => {
      const m = members.find(x => x.id === user_id)
      return { user_id, username: m?.username ?? '', avatar_url: m?.avatar_url ?? null }
    })
    await db.reservations.where('id').equals(id).modify(r => { r.travelers = travelers })
    await session.perform(() => enqueueReservationWrite(tripId, id, 'PUT', '/travelers', { user_ids: userIds }))
    return { travelers }
  },

  /**
   * Where the transports sit in a day's plan. Offline the order waits in the
   * queue; a booking created offline has no server id to name yet, so it keeps
   * the place the server gives it.
   */
  async updatePositions(tripId: number | string, positions: ReservationPosition[], dayId?: number): Promise<void> {
    guardPlannerReadOnly()
    const session = captureWriteSession(), db = session.db
    const synced = positions.filter(p => p.id > 0)
    if (!isEffectivelyOffline()) {
      if (synced.length) await session.perform(() => reservationsApi.updatePositions(tripId, synced, dayId))
      return
    }
    await db.transaction('rw', db.reservations, db.mutationQueue, async () => {
      const rows = await db.reservations.bulkGet(positions.map(p => p.id))
      const present = rows.filter((r): r is Reservation => r !== undefined)
      const moved = dayId === undefined
        ? present.map(r => ({ ...r, day_plan_position: positions.find(p => p.id === r.id)?.day_plan_position ?? r.day_plan_position }))
        : withTransportPositions(present, positions, dayId)
      await db.reservations.bulkPut(moved)
      await session.perform(() => mutationQueue.enqueue({
        id: generateUUID(),
        tripId: Number(tripId),
        method: 'PUT',
        url: `/trips/${tripId}/reservations/positions`,
        body: { positions: synced, day_id: dayId },
      }))
    })
  },
}
