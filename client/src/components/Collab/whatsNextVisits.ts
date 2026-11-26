import type { PlannerState } from '../../integrations/family/plannerStateContract'
import type { Accommodation, Assignment, AssignmentsMap, Day } from '../../types'
import { parseTimeToMinutes, stayStartingOn } from '../../utils/dayMerge'
import { localMinutes } from '../../utils/localDate'
import { localToday } from '../Planner/today'

type VisitTiming = Pick<PlannerState['visits'][number], 'timing_kind' | 'starts_at' | 'ends_at'>
type ScheduledAssignment = Assignment & { family_visit?: VisitTiming }

export interface WhatsNextMember {
  id: number
  username: string
  avatar?: string | null
  avatar_url?: string | null
}

function visitFinish(assignment: ScheduledAssignment): number | null {
  const visit = assignment.family_visit
  if (visit?.timing_kind !== 'timed' || !visit.starts_at) return null
  const start = Date.parse(visit.starts_at)
  if (!Number.isFinite(start)) return null
  const end = visit.ends_at ? Date.parse(visit.ends_at) : start
  return Number.isFinite(end) ? Math.max(start, end) : start
}

export function upcomingStops({
  days, assignments, stays, members, now,
}: {
  days: Day[]
  assignments: AssignmentsMap
  stays: Accommodation[]
  members: WhatsNextMember[]
  now: Date
}) {
  const today = localToday(now)
  const minute = localMinutes(now)
  const fallback = members.map(member => ({ user_id: member.id, username: member.username, avatar: member.avatar }))

  const stops = days.flatMap(day => {
    const date = day.date?.slice(0, 10)
    if (!date) return []
    return (assignments[String(day.id)] ?? []).flatMap(assignment => {
      const place = assignment.place
      if (!place) return []
      const time = assignment.assignment_time ?? place.place_time ?? stayStartingOn(stays, place.id, day.id)?.check_in ?? null
      const endTime = assignment.assignment_end_time ?? place.end_time ?? null
      const clock = parseTimeToMinutes(time)
      const endClock = parseTimeToMinutes(endTime)
      const finish = visitFinish(assignment)
      const upcoming = finish === null
        ? date > today || (date === today && (clock === null || clock >= minute || (endClock !== null && endClock >= minute)))
        : finish >= now.getTime()
      if (!upcoming) return []
      return [{
        id: assignment.id, name: place.name, address: place.address,
        date, dayTitle: day.title, time, endTime, clock, order: assignment.order_index,
        participants: assignment.participants?.length ? assignment.participants : fallback,
      }]
    })
  })

  return stops.sort((a, b) => a.date.localeCompare(b.date)
    || (a.clock ?? Infinity) - (b.clock ?? Infinity) || a.order - b.order || a.id - b.id).slice(0, 8)
}
