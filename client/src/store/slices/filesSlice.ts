import { currentPlannerReadPort } from '../../repo/plannerReadPort'
import { captureTripAction, captureTripMutation } from '../tripActionScope'
import { captureTripRead } from '../tripReadScope'
import { fileRepo } from '../../repo/fileRepo'
import { isEffectivelyOffline } from '../../sync/networkMode'
import type { StoreApi } from 'zustand'
import type { TripStoreState } from '../tripStore'
import type { TripFile } from '../../types'
import type { FileLinkRequest } from '@trek/shared'
import { getApiErrorMessage } from '../../types'

type SetState = StoreApi<TripStoreState>['setState']
type GetState = StoreApi<TripStoreState>['getState']

export interface FilesSlice {
  loadFiles: (tripId: number | string) => Promise<void>
  addFile: (tripId: number | string, formData: FormData) => Promise<TripFile>
  deleteFile: (tripId: number | string, id: number) => Promise<void>
  /** Links a file the trip already has to a booking, place or expense, then reloads the files. */
  linkFile: (tripId: number | string, id: number, link: FileLinkRequest) => Promise<void>
  /** Takes a file off a booking, whichever way it was attached, and keeps the file. */
  unlinkFileFromReservation: (tripId: number | string, file: TripFile, reservationId: number) => Promise<void>
}

export const createFilesSlice = (set: SetState, get: GetState): FilesSlice => ({
  loadFiles: async (tripId) => {
    const planner = currentPlannerReadPort()
    if (planner) {
      if (!planner.reloadFiles) throw new Error('Coherent file refresh is not connected.')
      // Native tab/event callers do not await this loader. The cohort owns
      // failure/Retry and preserves the complete original observation.
      try {
        await planner.reloadFiles(tripId)
      } catch {
        // Never fall back to the independent legacy cache writer.
        return
      }
      return
    }
    const action = captureTripAction(set, get)
    const current = captureTripRead(tripId, action.get)
    const before = action.get().files
    try {
      const data = await action.perform(() => fileRepo.list(tripId))
      if (current() && action.get().files === before) action.set({ files: data.files })
    } catch (err: unknown) {
      console.error('Failed to load files:', err)
    }
  },

  addFile: async (tripId, formData) => {
    const action = captureTripMutation(set, get)
    try {
      const data = await action.perform(() => fileRepo.upload(tripId, formData))
      action.set(state => ({ files: [data.file, ...state.files] }))
      return data.file
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error uploading file'))
    }
  },

  deleteFile: async (tripId, id) => {
    const action = captureTripMutation(set, get)
    try {
      await action.perform(() => fileRepo.delete(tripId, id))
      action.set(state => ({ files: state.files.filter(f => f.id !== id) }))
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error deleting file'))
    }
  },

  linkFile: async (tripId, id, link) => {
    const action = captureTripMutation(set, get)
    try {
      await action.perform(() => fileRepo.addLink(tripId, id, link))
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error linking file'))
    }
    await action.get().loadFiles(tripId)
  },

  unlinkFileFromReservation: async (tripId, file, reservationId) => {
    const action = captureTripMutation(set, get)
    try {
      // Uploaded on the booking, the file points at it itself; linked later, a link row does.
      if (file.reservation_id === reservationId) await action.perform(() => fileRepo.update(tripId, file.id, { reservation_id: null }))
      // A link row is named by its own id, which only the server can look up. Offline
      // that is needed only when the list says the file has one for this booking.
      if ((file.linked_reservation_ids || []).includes(reservationId) || !isEffectivelyOffline()) {
        await action.perform(() => fileRepo.removeLinkTo(tripId, file.id, l => l.reservation_id === reservationId))
      }
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error unlinking file'))
    } finally {
      await action.get().loadFiles(tripId)
    }
  },
})
