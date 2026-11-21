import { captureTripMutation } from '../tripActionScope'
import type { StoreApi } from 'zustand'
import type { TripStoreState } from '../tripStore'
import type { Assignment, AssignmentsMap } from '../../types'
import { getApiErrorMessage } from '../../types'
import { assignmentRepo, type AssignmentTimes } from '../../repo/assignmentRepo'
import { mergeAssignmentPlace } from './placesSlice'
import { nextTempId } from '../../sync/mutationQueue'
import { currentPlannerAssignmentPort } from '../../repo/plannerAssignmentPort'
import { currentPlannerCreationPort } from '../../repo/plannerCreationPort'
import { isFamilyFrontendActive } from '../../integrations/family/runtime'

type SetState = StoreApi<TripStoreState>['setState']
type GetState = StoreApi<TripStoreState>['getState']

export interface AssignmentsSlice {
  setAssignmentEndDay: (tripId: number | string, dayId: number, assignmentId: number, endDay: boolean) => Promise<void>
  setAssignmentRouteExcluded: (tripId: number | string, dayId: number, assignmentId: number, excluded: boolean) => Promise<void>
  setAssignmentTimes: (tripId: number | string, dayId: number, assignmentId: number, times: AssignmentTimes) => Promise<void>
  setAssignmentNotes: (tripId: number | string, dayId: number, assignmentId: number, notes: string | null) => Promise<void>
  setAssignmentParticipants: (tripId: number | string, dayId: number, assignmentId: number, userIds: number[]) => Promise<void>
  setAssignmentLegMode: (tripId: number | string, dayId: number, assignmentId: number, mode: string | null, direction?: 'outgoing' | 'incoming') => Promise<void>
  /** `tourStageKey` puts one stage of a multi-day tour on the day instead of the whole tour (MDT-02). */
  assignPlaceToDay: (tripId: number | string, dayId: number | string, placeId: number | string, position?: number | null, tourStageKey?: string) => Promise<Assignment | undefined>
  removeAssignment: (tripId: number | string, dayId: number | string, assignmentId: number) => Promise<void>
  clearDayAssignments: (tripId: number | string, dayId: number) => Promise<void>
  reorderAssignments: (tripId: number | string, dayId: number | string, orderedIds: number[]) => Promise<void>
  moveAssignment: (tripId: number | string, assignmentId: number, fromDayId: number | string, toDayId: number | string, toOrderIndex?: number | null) => Promise<void>
  setAssignments: (assignments: AssignmentsMap) => void
}

export const createAssignmentsSlice = (set: SetState, get: GetState): AssignmentsSlice => ({
  setAssignmentEndDay: async (tripId, dayId, assignmentId, endDay) => {
    const action = captureTripMutation(set, get)
    const assignment = action.get().assignments[String(dayId)]?.find(a => a.id === assignmentId)
    if (!assignment || assignmentId < 0) return
    const apply = (value: boolean) => action.set(state => ({
      assignments: Object.fromEntries(Object.entries(state.assignments).map(([key, items]) => [
        key, items.map(a => a.id === assignmentId ? { ...a, end_day: value } : a),
      ])),
    }))
    apply(endDay)
    try {
      const saved = await action.perform(() => assignmentRepo.setEndDay(tripId, assignment, endDay))
      apply(saved.end_day === true)
    } catch (err: unknown) {
      apply(assignment.end_day === true)
      throw err
    }
  },
  setAssignmentRouteExcluded: async (tripId, dayId, assignmentId, excluded) => {
    const action = captureTripMutation(set, get)
    const assignment = action.get().assignments[String(dayId)]?.find(a => a.id === assignmentId)
    if (!assignment || assignmentId < 0) return
    const apply = (value: boolean) => action.set(state => ({
      assignments: { ...state.assignments, [String(dayId)]: (state.assignments[String(dayId)] || []).map(a => a.id === assignmentId ? { ...a, route_excluded: value } : a) },
    }))
    apply(excluded)
    try {
      const saved = await action.perform(() => assignmentRepo.setRouteExcluded(tripId, assignment, excluded))
      apply(saved.route_excluded === true)
    } catch (err: unknown) {
      apply(assignment.route_excluded === true)
      throw err
    }
  },
  setAssignmentTimes: async (tripId, dayId, assignmentId, times) => {
    const action = captureTripMutation(set, get)
    const assignment = action.get().assignments[String(dayId)]?.find(a => a.id === assignmentId)
    if (!assignment || assignmentId < 0) return
    const replace = (next: Assignment) => action.set(state => ({
      assignments: Object.fromEntries(Object.entries(state.assignments).map(([key, items]) => [
        key, items.map(a => a.id === assignmentId ? next : a),
      ])),
    }))
    // The embedded place carries the times the visit shows, its own or else the place's,
    // so it is merged again from the pool rather than patched field by field. The merged
    // row is also what an offline save caches, or the old end time would come back from
    // the cache on the next read.
    const pool = action.get().places.find(p => p.id === assignment.place_id)
    const merge = (next: Assignment) => (pool ? mergeAssignmentPlace(next, pool) : next)
    const draft = merge({ ...assignment, assignment_time: times.place_time, assignment_end_time: times.end_time })
    replace(draft)
    try {
      replace(merge({ ...draft, ...await action.perform(() => assignmentRepo.setTimes(tripId, draft, times)) }))
    } catch (err: unknown) {
      replace(assignment)
      throw err
    }
  },
  setAssignmentNotes: async (tripId, dayId, assignmentId, notes) => {
    const action = captureTripMutation(set, get)
    const assignment = action.get().assignments[String(dayId)]?.find(a => a.id === assignmentId)
    if (!assignment || assignmentId < 0) return
    // Only the note is patched: the saved row carries the place as the server has it,
    // and the visit's times may still wait in the queue ahead of this write.
    const apply = (value: string | null) => action.set(state => ({
      assignments: Object.fromEntries(Object.entries(state.assignments).map(([key, items]) => [
        key, items.map(a => a.id === assignmentId ? { ...a, notes: value } : a),
      ])),
    }))
    apply(notes)
    try {
      const saved = await action.perform(() => assignmentRepo.setNotes(tripId, assignment, notes))
      apply(saved.notes ?? null)
    } catch (err: unknown) {
      apply(assignment.notes ?? null)
      throw err
    }
  },
  // Who joins the visit and how its legs are travelled; offline both wait in the
  // queue. The participants the repo answers with are written into the day.
  setAssignmentParticipants: async (tripId, dayId, assignmentId, userIds) => {
    const action = captureTripMutation(set, get)
    const participants = await action.perform(() => assignmentRepo.setParticipants(tripId, assignmentId, userIds))
    action.set(state => ({
      assignments: { ...state.assignments, [String(dayId)]: (state.assignments[String(dayId)] || []).map(a => a.id === assignmentId ? { ...a, participants } : a) },
    }))
  },
  setAssignmentLegMode: async (tripId, dayId, assignmentId, mode, direction = 'outgoing') => {
    const action = captureTripMutation(set, get)
    await action.perform(() => assignmentRepo.setLegMode(tripId, assignmentId, mode, direction))
    const field = direction === 'incoming' ? 'incoming_leg_transport_mode' : 'leg_transport_mode'
    action.set(state => ({
      assignments: { ...state.assignments, [String(dayId)]: (state.assignments[String(dayId)] || []).map(a => a.id === assignmentId ? { ...a, [field]: mode } : a) },
    }))
  },
  assignPlaceToDay: async (tripId, dayId, placeId, position, tourStageKey) => {
    const action = captureTripMutation(set, get)
    const creator = currentPlannerCreationPort()
    if (creator) return creator.assign(tripId, dayId, placeId, position, tourStageKey)
    const state = action.get()
    const place = state.places.find(p => p.id === Number.parseInt(String(placeId)))
    if (!place) return
    if (isFamilyFrontendActive()) {
      const current = state.assignments[String(dayId)] ?? []
      if (position != null && position !== current.length) throw new Error('Add the visit at the end of the day, then use an available move control.')
      const created = await action.perform(() => assignmentRepo.create(tripId, Number(dayId), place, tourStageKey))
      action.set(state => ({ assignments: { ...state.assignments, [String(dayId)]: [...(state.assignments[String(dayId)] ?? []), created] } }))
      return created
    }

    const tempId = nextTempId()
    // Sorted first, as moveAssignment does: the position is an index in the day as
    // it is shown, and that day is sorted by order_index. The stored list is not
    // always, a stop that arrived over the socket is appended wherever its
    // order_index says it belongs, so a splice into the raw list landed the new
    // row behind the wrong neighbour and the reorder that follows wrote that order.
    const current = (state.assignments[String(dayId)] || []).slice().sort((a, b) => a.order_index - b.order_index)
    const insertIdx = position != null ? position : current.length
    const tempAssignment: Assignment = {
      id: tempId,
      day_id: Number.parseInt(String(dayId)),
      place_id: place.id,
      order_index: insertIdx,
      notes: null,
      tour_stage_key: tourStageKey ?? null,
      place,
    }

    current.splice(insertIdx, 0, tempAssignment)
    action.set(state => ({
      assignments: {
        ...state.assignments,
        [String(dayId)]: current,
      }
    }))

    try {
      const created = await action.perform(() => assignmentRepo.create(tripId, Number(dayId), place, tourStageKey))
      const newAssignment: Assignment = {
        ...created,
        place: created.place || place,
        order_index: position != null ? insertIdx : created.order_index,
      }
      action.set(state => ({
        assignments: {
          ...state.assignments,
          [String(dayId)]: state.assignments[String(dayId)].map(
            a => a.id === tempId ? newAssignment : a
          ),
        }
      }))
      if (position != null) {
        const updated = action.get().assignments[String(dayId)] || []
        const orderedIds = updated.map(a => a.id)
        if (orderedIds.length > 0) {
          try {
            await action.perform(() => assignmentRepo.reorder(tripId, Number(dayId), orderedIds))
            action.set(state => {
              const items = state.assignments[String(dayId)] || []
              const reordered = orderedIds.map((id, idx) => {
                const item = items.find(a => a.id === id)
                return item ? { ...item, order_index: idx } : null
              }).filter((item): item is Assignment => item !== null)
              return {
                assignments: {
                  ...state.assignments,
                  [String(dayId)]: reordered,
                }
              }
            })
          } catch {}
        }
      }
      return created
    } catch (err: unknown) {
      action.set(state => ({
        assignments: {
          ...state.assignments,
          [String(dayId)]: state.assignments[String(dayId)].filter(a => a.id !== tempId),
        }
      }))
      throw new Error(getApiErrorMessage(err, 'Error assigning place'))
    }
  },

  removeAssignment: async (tripId, dayId, assignmentId) => {
    const action = captureTripMutation(set, get)
    const planner=currentPlannerAssignmentPort()
    if(planner){await planner.execute({action:'remove',trip:tripId,day:Number(dayId),visit:assignmentId});return}
    const prevAssignments = action.get().assignments

    action.set(state => ({
      assignments: {
        ...state.assignments,
        [String(dayId)]: state.assignments[String(dayId)].filter(a => a.id !== assignmentId),
      }
    }))

    try {
      await action.perform(() => assignmentRepo.remove(tripId, Number(dayId), assignmentId))
    } catch (err: unknown) {
      action.set({ assignments: prevAssignments })
      throw new Error(getApiErrorMessage(err, 'Error removing assignment'))
    }
  },

  clearDayAssignments: async (tripId, dayId) => {
    const action = captureTripMutation(set, get)
    const planner=currentPlannerAssignmentPort()
    if(planner){await planner.execute({action:'clear',trip:tripId,day:dayId});return}
    const prevAssignments = action.get().assignments
    action.set(state => ({ assignments: { ...state.assignments, [String(dayId)]: [] } }))
    try {
      await action.perform(() => assignmentRepo.clearDay(tripId, dayId))
    } catch (err: unknown) {
      action.set({ assignments: prevAssignments })
      throw new Error(getApiErrorMessage(err, 'Error removing assignment'))
    }
  },

  reorderAssignments: async (tripId, dayId, orderedIds) => {
    const action = captureTripMutation(set, get)
    const planner=currentPlannerAssignmentPort()
    if(planner){await planner.execute({action:'reorder',trip:tripId,day:Number(dayId),order:orderedIds});return}
    const prevAssignments = action.get().assignments
    const dayItems = action.get().assignments[String(dayId)] || []
    const reordered = orderedIds.map((id, idx) => {
      const item = dayItems.find(a => a.id === id)
      return item ? { ...item, order_index: idx } : null
    }).filter((item): item is Assignment => item !== null)

    action.set(state => ({
      assignments: {
        ...state.assignments,
        [String(dayId)]: reordered,
      }
    }))

    try {
      await action.perform(() => assignmentRepo.reorder(tripId, Number(dayId), orderedIds))
    } catch (err: unknown) {
      action.set({ assignments: prevAssignments })
      throw new Error(getApiErrorMessage(err, 'Error reordering'))
    }
  },

  moveAssignment: async (tripId, assignmentId, fromDayId, toDayId, toOrderIndex = null) => {
    const action = captureTripMutation(set, get)
    const planner=currentPlannerAssignmentPort()
    if(planner){await planner.execute({action:'move',trip:tripId,visit:assignmentId,from:Number(fromDayId),to:Number(toDayId),position:toOrderIndex});return}
    const state = action.get()
    const prevAssignments = state.assignments
    const assignment = (state.assignments[String(fromDayId)] || []).find(a => a.id === assignmentId)
    if (!assignment) return

    const toItems = (state.assignments[String(toDayId)] || []).slice().sort((a, b) => a.order_index - b.order_index)
    const insertAt = toOrderIndex !== null ? toOrderIndex : toItems.length

    const withMoved = [...toItems]
    withMoved.splice(insertAt, 0, { ...assignment, day_id: Number.parseInt(String(toDayId)) })
    // Renumber into copies. Assigning `order_index` in place would mutate the very objects
    // still held in `prevAssignments`, so the rollback below would restore a list whose
    // indices had already been overwritten — a failed move left the order wrong instead of
    // putting it back.
    const newToItems = withMoved.map((a, i) => ({ ...a, order_index: i }))

    action.set(s => ({
      assignments: {
        ...s.assignments,
        [String(fromDayId)]: s.assignments[String(fromDayId)].filter(a => a.id !== assignmentId),
        [String(toDayId)]: newToItems,
      }
    }))

    try {
      await action.perform(() => assignmentRepo.move(tripId, assignment, Number(toDayId), insertAt, newToItems.map(a => a.id)))
    } catch (err: unknown) {
      action.set({ assignments: prevAssignments })
      throw new Error(getApiErrorMessage(err, 'Error moving assignment'))
    }
  },

  setAssignments: (assignments) => {
    set({ assignments })
  },
})
