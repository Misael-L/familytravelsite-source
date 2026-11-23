import { useBookingImportReview } from './useBookingImportReview'
import { useStayActionScope, type StayActionScope } from '../../components/Planner/stayActionScope'
import { assertRawBookingSaveAllowed, currentPlannerBookingPort } from '../../repo/plannerBookingPort';
import { useRef, type Dispatch, type SetStateAction } from 'react'
import { retriedSave, type BookingSaveSteps } from '../../components/Planner/bookingFormModel'
import { accommodationRepo } from '../../repo/accommodationRepo'
import { findOnMap, stayQueries } from '../../repo/mapMatchRepo'
import type { TripStoreState } from '../../store/tripStore'
import { isEffectivelyOffline } from '../../sync/networkMode'
import type { Accommodation, Place, Reservation } from '../../types'
import type { Can, PlannerBase } from './plannerTypes'
import type { PlannerDialogs } from './usePlannerDialogs'

export interface BookingEditsOptions
  extends Pick<PlannerBase, 'tripId' | 'trip' | 'tripActions' | 'toast' | 't'>,
  Pick<PlannerDialogs, 'editingReservation' | 'setEditingReservation' | 'setShowReservationModal'>,
  Pick<PlannerDialogs, 'editingTransport' | 'setEditingTransport' | 'setShowTransportModal' | 'setTransportModalDayId'> {
  /** The places the planner lists, which an imported venue is matched against by name. */
  places: Place[]
  selectedDayId: TripStoreState['selectedDayId']
  /** Whether a scanned receipt's photo may go up with the expense it fills in. */
  canUploadFiles: ReturnType<Can>
  setTripAccommodations: Dispatch<SetStateAction<Accommodation[]>>
}

// Match an existing trip place by name, else create one at the spot the review
// found, or the first spot the map search knows for its name and address.
// Returns the place and whether it has a spot on the map (null if even creation
// failed).
const resolveImportedPlace = async (
  venue: { name?: string; address?: string | null; lat?: number; lng?: number },
  action: StayActionScope,
  { tripId, places, tripActions }: Pick<BookingEditsOptions, 'tripId' | 'places' | 'tripActions'>,
): Promise<{ id: number; placed: boolean } | null> => {
  const name = (venue.name || '').trim()
  const n = name.toLowerCase()
  if (n) {
    const existing = places.find(p => p.name?.trim().toLowerCase() === n)
      ?? places.find(p => p.name && (p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase())))
    // A negative id is a place created offline (mutationQueue.nextTempId). Offline
    // the booking waits in the queue behind that place and is sent with its real
    // id. Online the booking goes out at once, and day_accommodations.place_id
    // carries a foreign key, so a temp id there is a 500 instead of a saved booking.
    if (existing && (existing.id > 0 || isEffectivelyOffline())) return { id: existing.id, placed: existing.lat != null && existing.lng != null }
  }
  let lat: number | null = venue.lat ?? null
  let lng: number | null = venue.lng ?? null
  let address: string | null = venue.address ?? null
  if (lat == null || lng == null) {
    try {
      // Name and address, then each alone: a booking site's romanized address
      // often matches nothing and sinks the hotel's name with it. Offline
      // findOnMap answers null and the place is created without coords.
      const hit = await action.perform(() => findOnMap(stayQueries(name, venue.address), undefined, action.assertCurrent))
      if (hit) {
        lat = hit.lat; lng = hit.lng
        if (!address && hit.address) address = hit.address
      }
    } catch { action.assertCurrent(); /* An ordinary geocode failure remains non-fatal. */ }
  }
  try {
    // Through the store, not placesApi directly: the API answers { place },
    // and reading .id off that wrapper linked nothing. Every save of the
    // hotel then minted another orphan place, because the store never
    // learned about the previous one and the name match above could not
    // find it. addPlace unwraps the response and puts the place into
    // `places`, so the next save reuses it.
    const place = await action.perform(() => tripActions.addPlace(tripId, { name: name || address || 'Accommodation', lat, lng, address }))
    return place && (place.id > 0 || isEffectivelyOffline()) ? { id: place.id, placed: lat != null && lng != null } : null
  } catch { action.assertCurrent(); return null }
}


/**
 * Writes to the trip's bookings and the review that comes before an import is saved:
 * saving a reservation or a transport, deleting a booking, finding or creating the place
 * an imported stay belongs to, the queue that walks the imported items through their
 * editors one at a time, and the bridge that picks up an import or a scanned receipt
 * the background tasks send here for review.
 *
 * The bridge is an effect, so useTripPlanner calls this hook where that effect always
 * ran: after the day wiring and before the splash.
 */
export function useBookingEdits(options: BookingEditsOptions) {
  const {
    tripId, tripActions, toast, t, places, selectedDayId, setTripAccommodations,
    editingReservation, setEditingReservation, setShowReservationModal,
    editingTransport, setEditingTransport, setShowTransportModal, setTransportModalDayId,
  } = options
  const capture = useStayActionScope(tripId)
  const refreshStays = (action: StayActionScope) => {
    void action.perform(() => accommodationRepo.list(tripId)).then(
      d => action.effect(() => setTripAccommodations(d.accommodations || [])),
      () => { /* A failed or obsolete refresh keeps the current view unchanged. */ },
    )
  }
  const review = useBookingImportReview({ ...options, onFinished: () => {
    const action = capture()
    if (!action.current()) return
    refreshStays(action)
    void action.perform(() => tripActions.loadBudgetItems?.(tripId)).catch(() => { return undefined /* Optional refresh cannot replay a save. */ })
  } })

  const guardedBookingWrites = useRef(currentPlannerBookingPort() !== null)
  if (currentPlannerBookingPort()) guardedBookingWrites.current = true
  // A save is done once the editor's own part (travellers, files) is done too:
  // only then does it say so and close. Until then the editor stays open, so a
  // failed upload leaves the files to try again instead of a closed dialog and a
  // booking that silently lacks them (#2883). Undefined means not done.
  const handleSaveReservation = async (
    data: Record<string, string | number | null> & { title: string },
    { saved: earlier, afterSave }: BookingSaveSteps = {},
  ): Promise<Reservation | undefined> => {
    const action = capture()
    try {
      action.assertCurrent()
      assertRawBookingSaveAllowed(guardedBookingWrites.current);
      // Imported hotel with a reviewed address but no existing place picked: match
      // an existing place by name, else geocode the address and create one, then link it.
      const acc = (data as Record<string, any>).create_accommodation
      if (data.type === 'hotel' && acc && acc.venue && !acc.place_id) {
        const resolved = await action.perform(() => resolveImportedPlace(acc.venue, action, { tripId, places, tripActions }))
        acc.place_id = resolved?.id ?? undefined
        // Saved, but nowhere on the map: say so rather than leave the pin to go missing.
        if (resolved && !resolved.placed) action.effect(() => toast.warning(t('reservations.import.savedWithoutPin')))
        delete acc.venue
      }
      // A hotel's address lives on the linked place. Write an edited address
      // through to it, otherwise the typed value was silently dropped and the
      // old one reappeared on the next open (#1496).
      if (data.type === 'hotel' && acc && typeof acc.address === 'string') {
        const address = acc.address.trim()
        const linkedPlace = acc.place_id ? places.find(p => p.id === Number(acc.place_id)) : undefined
        if (address && linkedPlace && (linkedPlace.address || '') !== address) {
          try { await action.perform(() => tripActions.updatePlace(tripId, linkedPlace.id, { address })) }
          catch { action.assertCurrent(); /* An ordinary address failure remains non-fatal. */ }
        }
        delete acc.address
      }
      let r: Reservation
      if (editingReservation) {
        // Don't force a day here. The old code pinned it to the (often empty)
        // selected day, which dropped the booking out of the Plan; preserving the
        // old day_id instead left it stale when the date changed. Omitting it lets
        // the server derive the day from the booking's date, or keep the current
        // one when there is no date.
        r = await action.perform(() => tripActions.updateReservation(tripId, editingReservation.id, data))
      } else if (earlier) {
        r = await action.perform(() => tripActions.updateReservation(tripId, earlier.id, retriedSave(data, earlier)))
      } else {
        r = await action.perform(() => tripActions.addReservation(tripId, { ...data, day_id: selectedDayId || null }))
        // An imported booking auto-creates a linked cost server-side; the saving client gets
        // no budget:created echo, so refresh the budget items here to surface it without a reload.
        if ((data as Record<string, unknown>).create_budget_entry) await action.perform(() => tripActions.loadBudgetItems?.(tripId))
      }
      if (data.type === 'hotel') refreshStays(action)
      await action.perform(async () => afterSave?.(r))
      action.effect(() => toast.success(t(editingReservation ? 'trip.toast.reservationUpdated' : 'trip.toast.reservationAdded')))
      action.effect(() => setShowReservationModal(false))
      if (editingReservation) action.effect(() => setEditingReservation(null))
      return r
    } catch (err: unknown) { action.effect(() => toast.error(err instanceof Error ? err.message : t('common.unknownError'))) }
  }

  const handleSaveTransport = async (
    data: Record<string, any> & { title: string },
    { saved: earlier, afterSave }: BookingSaveSteps = {},
  ): Promise<Reservation | undefined> => {
    const action = capture()
    try {
      action.assertCurrent()
      let r: Reservation
      if (editingTransport) {
        r = await action.perform(() => tripActions.updateReservation(tripId, editingTransport.id, data))
      } else if (earlier) {
        r = await action.perform(() => tripActions.updateReservation(tripId, earlier.id, retriedSave(data, earlier)))
      } else {
        r = await action.perform(() => tripActions.addReservation(tripId, data))
        // Surface the auto-created linked cost without a reload (no budget:created echo to us).
        if (data.create_budget_entry) await action.perform(() => tripActions.loadBudgetItems?.(tripId))
      }
      await action.perform(async () => afterSave?.(r))
      action.effect(() => toast.success(t(editingTransport ? 'trip.toast.reservationUpdated' : 'trip.toast.reservationAdded')))
      action.effect(() => setShowTransportModal(false))
      action.effect(() => setEditingTransport(null))
      action.effect(() => setTransportModalDayId(null))
      return r
    } catch (err: unknown) { action.effect(() => toast.error(err instanceof Error ? err.message : t('common.unknownError'))) }
  }

  const handleDeleteReservation = async (id) => {
    const action = capture()
    try {
      action.assertCurrent()
      await action.perform(() => tripActions.deleteReservation(tripId, id))
      action.effect(() => toast.success(t('trip.toast.deleted')))
      // Refresh accommodations in case a hotel booking was deleted
      refreshStays(action)
    }
    catch (err: unknown) { action.effect(() => toast.error(err instanceof Error ? err.message : t('common.unknownError'))) }
  }

  return { handleSaveReservation, handleSaveTransport, handleDeleteReservation, ...review }
}

export type BookingEdits = ReturnType<typeof useBookingEdits>
