import { currentPlannerDayNotePort } from '../../repo/plannerDayNotePort';
import { captureTripMutation } from '../tripActionScope'
import { currentPlannerCalendarPort } from '../../repo/plannerCalendarPort'
import { dayRepo } from '../../repo/dayRepo'
import { guardPlannerReadOnly } from '../../repo/plannerReadPort'
import { dayNoteRepo } from '../../repo/dayNoteRepo'
import type { StoreApi } from 'zustand'
import type { TripStoreState } from '../tripStore'
import type { DayNote } from '../../types'
import { getApiErrorMessage } from '../../types'
import { nextTempId } from '../../sync/mutationQueue'

type SetState = StoreApi<TripStoreState>['setState']
type GetState = StoreApi<TripStoreState>['getState']

export interface DayNotesSlice {
  updateDayNotes: (tripId: number | string, dayId: number | string, notes: string) => Promise<void>
  updateDayTitle: (tripId: number | string, dayId: number | string, title: string) => Promise<void>
  addDayNote: (tripId: number | string, dayId: number | string, data: Partial<DayNote> & { text: string }) => Promise<DayNote>
  updateDayNote: (tripId: number | string, dayId: number | string, id: number, data: Partial<DayNote>) => Promise<DayNote>
  deleteDayNote: (tripId: number | string, dayId: number | string, id: number) => Promise<void>
  moveDayNote: (tripId: number | string, fromDayId: number | string, toDayId: number | string, noteId: number, sort_order?: number) => Promise<void>
}

export const createDayNotesSlice = (set: SetState, get: GetState): DayNotesSlice => ({
  updateDayNotes: async (tripId, dayId, notes) => {
    const action = captureTripMutation(set, get)
    try {
      await action.perform(() => dayRepo.update(tripId, Number(dayId), { notes }))
      action.set(state => ({
        days: state.days.map(d => d.id === Number.parseInt(String(dayId)) ? { ...d, notes } : d)
      }))
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error updating notes'))
    }
  },

  updateDayTitle: async (tripId, dayId, title) => {
    const action = captureTripMutation(set, get)
    const calendar = currentPlannerCalendarPort()
    if (calendar) return calendar.rename(tripId, Number(dayId), title)
    try {
      await action.perform(() => dayRepo.update(tripId, Number(dayId), { title }))
      action.set(state => ({
        days: state.days.map(d => d.id === Number.parseInt(String(dayId)) ? { ...d, title } : d)
      }))
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error updating day name'))
    }
  },

  addDayNote: async (tripId, dayId, data) => {
    const port = currentPlannerDayNotePort();
    if (port) return (await port.create(tripId, Number(dayId), data)).note;
    const action = captureTripMutation(set, get)
    const tempId = nextTempId()
    const tempNote: DayNote = { id: tempId, day_id: dayId as number, ...data, created_at: new Date().toISOString() } as DayNote
    action.set(state => ({
      dayNotes: {
        ...state.dayNotes,
        [String(dayId)]: [...(state.dayNotes[String(dayId)] || []), tempNote],
      }
    }))
    try {
      const result = await action.perform(() => dayNoteRepo.create(tripId, Number(dayId), data))
      action.set(state => ({
        dayNotes: {
          ...state.dayNotes,
          [String(dayId)]: (state.dayNotes[String(dayId)] || []).map(n => n.id === tempId ? result.note : n),
        }
      }))
      return result.note
    } catch (err: unknown) {
      action.set(state => ({
        dayNotes: {
          ...state.dayNotes,
          [String(dayId)]: (state.dayNotes[String(dayId)] || []).filter(n => n.id !== tempId),
        }
      }))
      throw new Error(getApiErrorMessage(err, 'Error adding note'))
    }
  },

  updateDayNote: async (tripId, dayId, id, data) => {
    const action = captureTripMutation(set, get)
    try {
      const before = (action.get().dayNotes[String(dayId)] || []).find(n => n.id === id) ?? ({ id, day_id: Number(dayId), text: '' } as DayNote)
      const result = await action.perform(() => dayNoteRepo.update(tripId, Number(dayId), before, data))
      action.set(state => ({
        dayNotes: {
          ...state.dayNotes,
          [String(dayId)]: (state.dayNotes[String(dayId)] || []).map(n => n.id === id ? result.note : n),
        }
      }))
      return result.note
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error updating note'))
    }
  },

  deleteDayNote: async (tripId, dayId, id) => {
    const port = currentPlannerDayNotePort();
    if (port) return port.delete(tripId, Number(dayId), id);
    const action = captureTripMutation(set, get)
    const prev = action.get().dayNotes
    action.set(state => ({
      dayNotes: {
        ...state.dayNotes,
        [String(dayId)]: (state.dayNotes[String(dayId)] || []).filter(n => n.id !== id),
      }
    }))
    try {
      await action.perform(() => dayNoteRepo.delete(tripId, Number(dayId), id))
    } catch (err: unknown) {
      action.set({ dayNotes: prev })
      throw new Error(getApiErrorMessage(err, 'Error deleting note'))
    }
  },

  ...createDayNoteMoveActions(set, get),
})

const createDayNoteMoveActions = (set: SetState, get: GetState): Pick<DayNotesSlice, 'moveDayNote'> => ({
  moveDayNote: async (tripId, fromDayId, toDayId, noteId, sort_order = 9999) => {
    const action = captureTripMutation(set, get)
    const state = action.get()
    const note = (state.dayNotes[String(fromDayId)] || []).find(n => n.id === noteId)
    if (!note) return
    const port = currentPlannerDayNotePort();
    if (port) { await port.move(tripId, Number(toDayId), note, sort_order); return; }
    guardPlannerReadOnly()

    action.set(s => ({
      dayNotes: {
        ...s.dayNotes,
        [String(fromDayId)]: (s.dayNotes[String(fromDayId)] || []).filter(n => n.id !== noteId),
      }
    }))

    try {
      // There is no atomic move on the server, so the destructive half goes last:
      // if the create were second and failed, the note would already be gone for
      // good and the rollback below would only fake it back into the store.
      // Every field the note carries, not just the ones it had when this was
      // written: a move is a delete plus a create, so anything omitted here is
      // silently dropped — which is how a coloured note lost its colour on the
      // way to another day (#1629).
      // Offline both halves wait in the queue in this order, so the replay keeps it.
      const result = await action.perform(() => dayNoteRepo.create(tripId, Number(toDayId), {
        text: note.text, time: note.time, icon: note.icon, color: note.color ?? null, sort_order,
      }))
      // The copy is confirmed. A source-delete error can follow a committed delete,
      // so retain the copy and its cache instead of risking removal of the last note.
      action.set(s => ({
        dayNotes: {
          ...s.dayNotes,
          [String(toDayId)]: [...(s.dayNotes[String(toDayId)] || []), result.note],
        }
      }))
      await action.perform(() => dayNoteRepo.delete(tripId, Number(fromDayId), noteId))
    } catch (err: unknown) {
      action.set(s => ({
        dayNotes: {
          ...s.dayNotes,
          [String(fromDayId)]: [...(s.dayNotes[String(fromDayId)] || []), note],
        }
      }))
      throw new Error(getApiErrorMessage(err, 'Error moving note'))
    }
  },
})
