import type { ExploreCatalogKind } from './catalogExploreLists'
import { isCatalogInPurview } from './explorePurview'
import {
  civilDayToUtcMidnightIso,
  insertScheduleItem,
  tripContainsCatalogPlanItem,
  utcCivilDay,
  type FamilyScheduleItem,
} from './scheduleItems'
import type { FamilyTripDay } from './tripDays'
import { insertHotelStay } from './tripReservations'
import { upsertTripPlace } from './tripPlaces'
import {
  payloadPlanItem,
  payloadReservationUpsert,
  payloadTripPlaceAdd,
  type TripChangeOpPayload,
} from './tripChangeRequests'

export type ExploreWriteMode = 'direct' | 'draft' | 'nudge' | 'deny'

export type StageExploreOp = (input: {
  module: 'trip_place' | 'plan_item' | 'reservation'
  op: 'add'
  payload: TripChangeOpPayload
  tripDayId?: string | null
  civilDate?: string | null
  targetTable?: string | null
  sortOrder?: number
}) => Promise<boolean>

export type AddToTripOk = { ok: true; outcome: 'added' | 'already' | 'drafted' }
export type AddToTripFail = {
  ok: false
  reason: 'hofOnly' | 'needsConfirm' | 'noDays' | 'invalidDates' | 'switchToDraft' | 'error'
  message?: string
}
export type AddToTripResult = AddToTripOk | AddToTripFail

type WriteOpts = {
  writeMode?: ExploreWriteMode
  stageOp?: StageExploreOp
  nextSortOrder?: number
}

const CIVIL = /^\d{4}-\d{2}-\d{2}$/

export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  return (err as { code?: string }).code === '23505'
}

export function nextSortOrderForCivilDay(
  items: FamilyScheduleItem[],
  civilDay: string,
): number {
  let max = -1
  for (const item of items) {
    if (utcCivilDay(item.startsAt) === civilDay && item.sortOrder > max) {
      max = item.sortOrder
    }
  }
  return max + 1
}

export function hotelStayDayIds(
  checkIn: string,
  checkOut: string,
  days: FamilyTripDay[],
): { startTripDayId: string | null; endTripDayId: string | null } {
  const start = days.find(d => d.civilDay === checkIn)
  const end = days.find(d => d.civilDay === checkOut)
  return {
    startTripDayId: start?.id ?? null,
    endTripDayId: end?.id ?? null,
  }
}

export function isValidHotelStayRange(checkIn: string, checkOut: string): boolean {
  return CIVIL.test(checkIn) && CIVIL.test(checkOut) && checkOut > checkIn
}

function fail(reason: AddToTripFail['reason'], message?: string): AddToTripFail {
  return { ok: false, reason, message }
}

function resolveMode(canMutate: boolean, writeMode?: ExploreWriteMode): ExploreWriteMode {
  if (writeMode) return writeMode
  return canMutate ? 'direct' : 'deny'
}

function denyMode(mode: ExploreWriteMode): AddToTripFail | null {
  if (mode === 'direct' || mode === 'draft') return null
  if (mode === 'nudge') return fail('switchToDraft')
  return fail('hofOnly')
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.'
}

/**
 * Parent place on the trip without a success toast.
 * Only expands destinations when HOF confirmed out-of-purview.
 */
export async function ensureCatalogPlaceOnTrip(opts: {
  tripId: string
  placeId: string
  tripPlaceIds: ReadonlySet<string>
  canMutate: boolean
  allowOutOfPurviewExpansion: boolean
  writeMode?: ExploreWriteMode
  stageOp?: StageExploreOp
  nextSortOrder?: number
}): Promise<boolean> {
  if (opts.tripPlaceIds.has(opts.placeId)) return true
  if (!opts.allowOutOfPurviewExpansion) return false
  const mode = resolveMode(opts.canMutate, opts.writeMode)
  if (mode === 'draft') {
    if (!opts.stageOp) return false
    return opts.stageOp({
      module: 'trip_place',
      op: 'add',
      payload: payloadTripPlaceAdd(opts.placeId),
      targetTable: 'trip_places',
      sortOrder: opts.nextSortOrder ?? 0,
    })
  }
  if (mode !== 'direct') return false
  try {
    await upsertTripPlace(opts.tripId, opts.placeId, false)
    return true
  } catch {
    return false
  }
}

export async function addCatalogPlaceToTrip(opts: {
  tripId: string
  placeId: string
  tripPlaceIds: ReadonlySet<string>
  canMutate: boolean
  confirmedOutOfPurview: boolean
} & WriteOpts): Promise<AddToTripResult> {
  if (opts.tripPlaceIds.has(opts.placeId)) return { ok: true, outcome: 'already' }
  const mode = resolveMode(opts.canMutate, opts.writeMode)
  const denied = denyMode(mode)
  if (denied) return denied
  if (!opts.confirmedOutOfPurview) return fail('needsConfirm')
  if (mode === 'draft') {
    if (!opts.stageOp) return fail('error')
    const ok = await opts.stageOp({
      module: 'trip_place',
      op: 'add',
      payload: payloadTripPlaceAdd(opts.placeId),
      targetTable: 'trip_places',
      sortOrder: opts.nextSortOrder ?? 0,
    })
    return ok ? { ok: true, outcome: 'drafted' } : fail('error')
  }
  try {
    const inserted = await upsertTripPlace(opts.tripId, opts.placeId, false)
    return { ok: true, outcome: inserted ? 'added' : 'already' }
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: true, outcome: 'already' }
    return fail('error', errorMessage(err))
  }
}

export async function addCatalogPlanItemToTrip(opts: {
  tripId: string
  kind: Extract<ExploreCatalogKind, 'experience' | 'food'>
  entityId: string
  name: string
  placeId: string | null
  address: string | null
  linkUrl: string | null
  day: FamilyTripDay
  scheduleItems: FamilyScheduleItem[]
  tripPlaceIds: ReadonlySet<string>
  canMutate: boolean
  confirmedOutOfPurview: boolean
} & WriteOpts): Promise<AddToTripResult> {
  const mode = resolveMode(opts.canMutate, opts.writeMode)
  const denied = denyMode(mode)
  if (denied) return denied
  if (!opts.day.civilDay) return fail('noDays')

  const inPurview = isCatalogInPurview(opts.placeId, opts.tripPlaceIds)
  if (!inPurview && !opts.confirmedOutOfPurview) return fail('needsConfirm')

  try {
    const already = await tripContainsCatalogPlanItem({
      tripId: opts.tripId,
      experienceId: opts.kind === 'experience' ? opts.entityId : null,
      foodId: opts.kind === 'food' ? opts.entityId : null,
    })
    if (already) return { ok: true, outcome: 'already' }
  } catch (err) {
    return fail('error', errorMessage(err))
  }

  const destSort = opts.nextSortOrder ?? 0
  if (opts.placeId && !opts.tripPlaceIds.has(opts.placeId)) {
    const ok = await ensureCatalogPlaceOnTrip({
      tripId: opts.tripId,
      placeId: opts.placeId,
      tripPlaceIds: opts.tripPlaceIds,
      canMutate: opts.canMutate,
      allowOutOfPurviewExpansion: opts.confirmedOutOfPurview,
      writeMode: mode,
      stageOp: opts.stageOp,
      nextSortOrder: destSort,
    })
    if (!ok) return fail('error', 'Could not add the destination to this trip')
  }

  if (mode === 'draft') {
    if (!opts.stageOp) return fail('error')
    const ok = await opts.stageOp({
      module: 'plan_item',
      op: 'add',
      payload: payloadPlanItem({
        activity: opts.name,
        placeId: opts.placeId,
        experienceId: opts.kind === 'experience' ? opts.entityId : null,
        foodId: opts.kind === 'food' ? opts.entityId : null,
        startsAt: civilDayToUtcMidnightIso(opts.day.civilDay),
        sortOrder: nextSortOrderForCivilDay(opts.scheduleItems, opts.day.civilDay),
      }),
      tripDayId: opts.day.id,
      civilDate: opts.day.civilDay,
      targetTable: 'schedule_items',
      sortOrder: destSort + (opts.placeId && !opts.tripPlaceIds.has(opts.placeId) ? 1 : 0),
    })
    return ok ? { ok: true, outcome: 'drafted' } : fail('error')
  }

  try {
    await insertScheduleItem({
      tripId: opts.tripId,
      activity: opts.name,
      placeId: opts.placeId,
      address: opts.address,
      startsAt: civilDayToUtcMidnightIso(opts.day.civilDay),
      sortOrder: nextSortOrderForCivilDay(opts.scheduleItems, opts.day.civilDay),
      experienceId: opts.kind === 'experience' ? opts.entityId : null,
      foodId: opts.kind === 'food' ? opts.entityId : null,
      linkUrl: opts.linkUrl,
    })
    return { ok: true, outcome: 'added' }
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: true, outcome: 'already' }
    return fail('error', errorMessage(err))
  }
}

export async function addCatalogHotelStayToTrip(opts: {
  tripId: string
  hotelId: string
  name: string
  placeId: string | null
  linkUrl: string | null
  checkIn: string
  checkOut: string
  days: FamilyTripDay[]
  tripPlaceIds: ReadonlySet<string>
  canMutate: boolean
  confirmedOutOfPurview: boolean
} & WriteOpts): Promise<AddToTripResult> {
  const mode = resolveMode(opts.canMutate, opts.writeMode)
  const denied = denyMode(mode)
  if (denied) return denied
  if (!isValidHotelStayRange(opts.checkIn, opts.checkOut)) return fail('invalidDates')

  const inPurview = isCatalogInPurview(opts.placeId, opts.tripPlaceIds)
  if (!inPurview && !opts.confirmedOutOfPurview) return fail('needsConfirm')

  const destSort = opts.nextSortOrder ?? 0
  if (opts.placeId && !opts.tripPlaceIds.has(opts.placeId)) {
    const ok = await ensureCatalogPlaceOnTrip({
      tripId: opts.tripId,
      placeId: opts.placeId,
      tripPlaceIds: opts.tripPlaceIds,
      canMutate: opts.canMutate,
      allowOutOfPurviewExpansion: opts.confirmedOutOfPurview,
      writeMode: mode,
      stageOp: opts.stageOp,
      nextSortOrder: destSort,
    })
    if (!ok) return fail('error', 'Could not add the destination to this trip')
  }

  const { startTripDayId, endTripDayId } = hotelStayDayIds(
    opts.checkIn,
    opts.checkOut,
    opts.days,
  )

  if (mode === 'draft') {
    if (!opts.stageOp) return fail('error')
    const ok = await opts.stageOp({
      module: 'reservation',
      op: 'add',
      payload: payloadReservationUpsert({
        title: opts.name,
        type: 'hotel',
        status: 'pending',
        hotelId: opts.hotelId,
        placeId: opts.placeId,
        startTripDayId,
        endTripDayId,
        url: opts.linkUrl,
      }),
      tripDayId: startTripDayId,
      civilDate: opts.checkIn,
      targetTable: 'trip_reservations',
      sortOrder: destSort + (opts.placeId && !opts.tripPlaceIds.has(opts.placeId) ? 1 : 0),
    })
    return ok ? { ok: true, outcome: 'drafted' } : fail('error')
  }

  try {
    await insertHotelStay({
      tripId: opts.tripId,
      title: opts.name,
      hotelId: opts.hotelId,
      placeId: opts.placeId,
      checkInCivil: opts.checkIn,
      checkOutCivil: opts.checkOut,
      startTripDayId,
      endTripDayId,
      url: opts.linkUrl,
    })
    return { ok: true, outcome: 'added' }
  } catch (err) {
    return fail('error', errorMessage(err))
  }
}
