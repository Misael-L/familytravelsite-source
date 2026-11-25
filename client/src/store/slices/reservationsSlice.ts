import { currentPlannerReadPort } from '../../repo/plannerReadPort'
import { captureTripAction, captureTripMutation } from '../tripActionScope'
import { captureTripRead } from '../tripReadScope'
import { reservationRepo, type ReservationPosition } from '../../repo/reservationRepo'
import type { StoreApi } from 'zustand'
import type { TripStoreState } from '../tripStore'
import type { Reservation } from '../../types'
import { getApiErrorMessage } from '../../types'
import { keepDayPositions } from '../../utils/mergedOrder'

type SetState = StoreApi<TripStoreState>['setState']
type GetState = StoreApi<TripStoreState>['getState']

export interface ReservationsSlice {
  loadReservations: (tripId: number | string) => Promise<void>
  addReservation: (tripId: number | string, data: Partial<Reservation> & { title: string }) => Promise<Reservation>
  updateReservation: (tripId: number | string, id: number, data: Partial<Reservation>) => Promise<Reservation>
  toggleReservationStatus: (tripId: number | string, id: number) => Promise<void>
  deleteReservation: (tripId: number | string, id: number) => Promise<void>
  setReservationTravelers: (tripId: number | string, id: number, userIds: number[]) => Promise<void>
  updateReservationPositions: (tripId: number | string, positions: ReservationPosition[], dayId?: number) => Promise<void>
}

export const createReservationsSlice = (set: SetState, get: GetState): ReservationsSlice => ({
  loadReservations: async (tripId) => {
    const planner = currentPlannerReadPort()
    if (planner) {
      if (!planner.reloadReservations) throw new Error('Coherent reservation refresh is not connected.')
      // Native event callers do not await this loader. The cohort owns visible
      // read failure/Retry; never synthesize or publish an empty reservation list.
      try {
        await planner.reloadReservations(tripId)
      } catch {
        // The cohort has already published its owned visible failure and Retry.
        // Keep the native fire-and-forget loader settled without a second UI error.
        return
      }
      return
    }
    const action = captureTripAction(set, get)
    const current = captureTripRead(tripId, action.get)
    const before = action.get().reservations
    try {
      const data = await action.perform(() => reservationRepo.list(tripId))
      if (current() && action.get().reservations === before) action.set({ reservations: data.reservations })
    } catch (err: unknown) {
      console.error('Failed to load reservations:', err)
    }
  },

  addReservation: async (tripId, data) => {
    const action = captureTripMutation(set, get)
    try {
      const result = await action.perform(() => reservationRepo.create(tripId, data))
      action.set(state => ({ reservations: [result.reservation, ...state.reservations] }))
      return result.reservation
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error creating reservation'))
    }
  },

  updateReservation: async (tripId, id, data) => {
    const action = captureTripMutation(set, get)
    try {
      const result = await action.perform(() => reservationRepo.update(tripId, id, data))
      action.set(state => ({
        reservations: state.reservations.map(r => r.id === id ? keepDayPositions(result.reservation, r) : r)
      }))
      return result.reservation
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error updating reservation'))
    }
  },

  toggleReservationStatus: async (tripId, id) => {
    const action = captureTripMutation(set, get)
    const prev = action.get().reservations
    const current = prev.find(r => r.id === id)
    if (!current) return
    const newStatus: 'pending' | 'confirmed' = current.status === 'confirmed' ? 'pending' : 'confirmed'
    action.set(state => ({
      reservations: state.reservations.map(r => r.id === id ? { ...r, status: newStatus } : r)
    }))
    try {
      await action.perform(() => reservationRepo.update(tripId, id, { status: newStatus }))
    } catch (err: unknown) {
      // Roll back the optimistic toggle and surface the failure so the caller's
      // catch can notify the user — without it the status silently snaps back.
      action.set({ reservations: prev })
      throw new Error(getApiErrorMessage(err, 'Error updating reservation'))
    }
  },

  deleteReservation: async (tripId, id) => {
    const action = captureTripMutation(set, get)
    try {
      await action.perform(() => reservationRepo.delete(tripId, id))
      action.set(state => ({
        reservations: state.reservations.filter(r => r.id !== id),
        budgetItems: state.budgetItems.filter(i => i.reservation_id !== id),
      }))
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error deleting reservation'))
    }
  },

  setReservationTravelers: async (tripId, id, userIds) => {
    const action = captureTripMutation(set, get)
    try {
      const result = await action.perform(() => reservationRepo.setTravelers(tripId, id, userIds))
      action.set(state => ({
        reservations: state.reservations.map(r => r.id === id ? { ...r, travelers: result.travelers } : r),
      }))
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error updating travelers'))
    }
  },

  // The caller has already moved the transports in the store; this only stores it.
  updateReservationPositions: async (tripId, positions, dayId) => {
    const action = captureTripMutation(set, get)
    await action.perform(() => reservationRepo.updatePositions(tripId, positions, dayId))
  },
})
