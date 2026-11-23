import { offlineDb } from './offlineDb'
import type { Assignment } from '../types'

export async function cacheAssignment(assignment: Assignment, db = offlineDb): Promise<void> {
  await db.days.where('id').equals(assignment.day_id).modify(day => {
    day.assignments = (day.assignments ?? []).map(a => a.id === assignment.id ? { ...a, ...assignment } : a)
  })
}
