import { currentPlannerStayWritePort } from './plannerStayPort'
import { refreshCanonical } from '../sync/canonicalCache'
import type { AccommodationCreateRequest, AccommodationUpdateRequest } from '@trek/shared'
import { accommodationsApi } from '../api/client'
import { replaceTripRows } from '../db/offlineDb'
import { mutationQueue, generateUUID, nextTempId } from '../sync/mutationQueue'
import { isEffectivelyOffline } from '../sync/networkMode'
import { captureWriteSession } from '../sync/writeSession'
import { optionalReadCache } from '../sync/readSession'
import { sessionRead } from './sessionRead'
import { currentPlannerReadPort } from './plannerReadPort'
import { isFamilyFrontendActive } from '../integrations/family/runtime'
import type { Accommodation, Assignment } from '../types'

/** The day-plan half of what an accommodation write answers with. */
export interface StayStopsResult {
  assignment?: Assignment | null
  /** The booking's own stop, carried to the day the booking now covers. */
  movedAssignment?: { assignment: Assignment; oldDayId: number } | null
  /** Stops the booking let go of but left standing (a night dropped, the place kept). */
  updatedAssignments?: Assignment[]
  removedAssignments?: { id: number; dayId: number }[]
}

export type StayWriteResult = StayStopsResult & { accommodation: Accommodation }
type StaySession = ReturnType<typeof captureWriteSession>

/** Empty placeholder replies are not a Family stay persistence contract. */
export class FamilyAccommodationUnavailable extends Error {
  constructor() { super('Family stay data and edits are not connected yet.'); this.name = 'FamilyAccommodationUnavailable' }
}
function assertStayBackendAvailable(): void {
  if (isFamilyFrontendActive() || currentPlannerReadPort()) throw new FamilyAccommodationUnavailable()
}

const STAY_FIELDS = ['place_id', 'start_day_id', 'end_day_id', 'check_in', 'check_in_end', 'check_out', 'confirmation', 'notes'] as const

/** Keep the original cached-place lookup through an offline stay edit. */
async function localStay(session: StaySession, id: number, tripId: number, body: AccommodationUpdateRequest, before: Accommodation | undefined): Promise<Accommodation> {
  const row: Record<string, unknown> = { ...(before ?? {}), id, trip_id: tripId }
  for (const field of STAY_FIELDS) {
    if (body[field] === undefined) continue
    const value = body[field]
    row[field] = field.endsWith('_id') && value != null ? Number(value) : value
  }
  if (row.place_id != null && row.place_id !== before?.place_id) {
    const place = await session.perform(() => session.db.places.get(Number(row.place_id)))
    Object.assign(row, {
      place_name: place?.name ?? null,
      place_address: place?.address ?? null,
      place_image: place?.image_url ?? null,
      place_lat: place?.lat ?? null,
      place_lng: place?.lng ?? null,
    })
  }
  return row as Accommodation
}

/** Queue identity and payload remain exactly those of the native stay routes. */
async function enqueueStayWrite(session: StaySession, tripId: number | string, id: number, write: { method: 'PUT' | 'DELETE'; url: string; body: unknown }): Promise<void> {
  await session.perform(() => mutationQueue.enqueue({
    id: generateUUID(), tripId: Number(tripId), ...write, resource: 'accommodations', entityId: id,
    ...(id < 0 ? { tempEntityId: id } : {}),
  }))
}
function stayUrl(tripId: number | string, id: number): string {
  return `/trips/${tripId}/accommodations/${id < 0 ? '{id}' : id}`
}

/** Native stays retain their existing API, FIFO and temporary-ID contracts. */
export const accommodationRepo = {
  async list(tripId: number | string): Promise<{ accommodations: Accommodation[] }> {
    const port=currentPlannerReadPort()
    if(port?.stays)return {accommodations:(await port.stays(tripId)).accommodations}
    assertStayBackendAvailable()
    return sessionRead(
      async session => (await refreshCanonical(session, Number(tripId), {
        tables: ['accommodations'],
        fetch: () => accommodationsApi.list(tripId),
        cache: result => Array.isArray(result.accommodations) ? replaceTripRows('accommodations', Number(tripId), result.accommodations, session.db) : Promise.resolve(),
        cached: async () => ({ accommodations: await session.db.accommodations.where('trip_id').equals(Number(tripId)).toArray() }),
      })).value,
      async session => ({ accommodations: await session.db.accommodations.where('trip_id').equals(Number(tripId)).toArray() }),
    )
  },

  async create(tripId: number | string, data: AccommodationCreateRequest, observed?: Accommodation[]): Promise<StayWriteResult> {
    const writer = currentPlannerStayWritePort()
    if (writer?.create) return writer.create(tripId, data, observed)
    assertStayBackendAvailable()
    const session = captureWriteSession(), db = session.db
    if (!isEffectivelyOffline()) {
      const result: StayWriteResult = await session.perform(() => accommodationsApi.create(tripId, data))
      if (result?.accommodation) await optionalReadCache(db.accommodations.put(result.accommodation), session)
      return result
    }
    const tid = Number(tripId), tempId = nextTempId()
    const accommodation = await session.perform(() => localStay(session, tempId, tid, data, undefined))
    await session.perform(() => db.transaction('rw', db.accommodations, db.mutationQueue, async () => {
      await session.perform(() => db.accommodations.put(accommodation))
      await session.perform(() => mutationQueue.enqueue({
        id: generateUUID(), tripId: tid, method: 'POST', url: `/trips/${tripId}/accommodations`,
        body: data, resource: 'accommodations', tempId,
      }))
    }))
    return { accommodation }
  },

  async update(tripId: number | string, id: number, data: AccommodationUpdateRequest, observed?: Accommodation): Promise<StayWriteResult> {
    const writer = currentPlannerStayWritePort()
    if (writer) return writer.update(tripId,id,data,observed)
    assertStayBackendAvailable()
    const session = captureWriteSession(), db = session.db
    if (!(await session.perform(() => mutationQueue.mustQueue('accommodations', id)))) {
      const result: StayWriteResult = await session.perform(() => accommodationsApi.update(tripId, id, data))
      if (result?.accommodation) await optionalReadCache(db.accommodations.put(result.accommodation), session)
      return result
    }
    const before = await session.perform(() => db.accommodations.get(id))
    const accommodation = await session.perform(() => localStay(session, id, Number(tripId), data, before))
    await session.perform(() => db.transaction('rw', db.accommodations, db.mutationQueue, async () => {
      await session.perform(() => db.accommodations.put(accommodation))
      await enqueueStayWrite(session, tripId, id, { method: 'PUT', url: stayUrl(tripId, id), body: data })
    }))
    session.assertCurrent()
    mutationQueue.sendSoon()
    return { accommodation }
  },

  /** `keepStop` leaves the night's stop on its day as an ordinary pause. */
  async delete(tripId: number | string, id: number, opts?: { keepStop?: boolean }, observed?: Accommodation): Promise<StayStopsResult> {
    const writer = currentPlannerStayWritePort()
    if (writer?.trash) return writer.trash(tripId, id, opts?.keepStop ?? false, observed)
    assertStayBackendAvailable()
    const session = captureWriteSession(), db = session.db
    if (!(await session.perform(() => mutationQueue.mustQueue('accommodations', id)))) {
      const result: StayStopsResult = await session.perform(() => accommodationsApi.delete(tripId, id, opts))
      await optionalReadCache(db.accommodations.delete(id), session)
      return result
    }
    await session.perform(() => db.transaction('rw', db.accommodations, db.mutationQueue, async () => {
      await enqueueStayWrite(session, tripId, id, { method: 'DELETE', url: `${stayUrl(tripId, id)}${opts?.keepStop ? '?keepStop=true' : ''}`, body: undefined })
      await session.perform(() => db.accommodations.delete(id))
    }))
    session.assertCurrent()
    mutationQueue.sendSoon()
    return {}
  },
}
