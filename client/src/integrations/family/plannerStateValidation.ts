import type { PlanLocation } from './planLocationContract';
import type { PlannerState } from './plannerStateContract';
import { FamilyApiError } from './repository';
type Visit = PlannerState['visits'][number];
type Day = PlannerState['days'][number];
function invalid(): never {
  throw new FamilyApiError(502, 'invalid_planner_relationship', 'The planner service returned inconsistent records.');
}
function unique(rows: { id: string }[]): void {
  if (new Set(rows.map((r) => r.id)).size !== rows.length) invalid();
}
function validateClock(v: Visit, day: Day | undefined): void {
  if (v.timing_kind === 'untimed') {
    if ([v.starts_at, v.ends_at, v.time_zone, v.start_local, v.end_local].some((value) => value != null)) invalid();
  }
  if (v.timing_kind === 'timed') {
    if (
      (!v.starts_at && !v.ends_at) ||
      !v.time_zone ||
      Boolean(v.starts_at) !== Boolean(v.start_local) ||
      Boolean(v.ends_at) !== Boolean(v.end_local)
    )
      invalid();
    for (const local of [v.start_local, v.end_local])
      if (local && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(local)) invalid();
    if (day && (v.start_local ?? v.end_local)?.slice(0, 10) !== day.civil_day) invalid();
  }
}
function validateVisit(v: Visit, pool: Map<string, PlanLocation>, days: Map<string, Day>): void {
  const location = v.plan_location_id ? pool.get(v.plan_location_id) : null;
  if (
    v.deleted_at !== null ||
    v.plan_location_id !== (v.location?.id ?? null) ||
    (v.plan_location_id && (!location || JSON.stringify(location) !== JSON.stringify(v.location))) ||
    (v.trip_day_id && !days.has(v.trip_day_id))
  )
    invalid();
  const day = v.trip_day_id ? days.get(v.trip_day_id) : undefined;
  if ((v.planning_day ?? null) !== (day?.civil_day ?? null)) invalid();
  validateClock(v, day);
}
export function validatePlannerState(state: PlannerState): void {
  const { locations, visits, days, notes, destinations } = state;
  for (const rows of [locations, visits, days, notes]) {
    unique(rows);
    if (rows.some((r) => r.trip_id !== state.trip_id)) invalid();
  }
  if (locations.length + visits.length + days.length + notes.length + destinations.length > 10000) invalid();
  if (
    new Set(days.flatMap((d) => d.civil_day === null ? [] : [d.civil_day])).size !== days.filter((d) => d.civil_day !== null).length ||
    new Set(days.map((d) => d.day_index)).size !== days.length ||
    new Set(destinations.map((d) => d.source_place_id)).size !== destinations.length
  )
    invalid();
  const pool = new Map(locations.map((l) => [l.id, l]));
  if (locations.some((l) => l.deleted_at !== null || (l.source.kind === 'manual') !== (l.source.id === null)))
    invalid();
  const byDay = new Map(days.map((d) => [d.id, d]));
  if (days.some((d) => d.civil_day === null) && days.some((d) => d.civil_day !== null)) invalid();
  for (const note of notes) {
    if (note.trip_day_id && (!byDay.has(note.trip_day_id) || byDay.get(note.trip_day_id)?.civil_day !== note.civil_day)) invalid();
  }
  for (const v of visits) validateVisit(v, pool, byDay);
  for (const d of destinations) {
    if (d.location_id) {
      const l = pool.get(d.location_id);
      if (!l || l.source.kind !== 'place' || l.source.id !== d.source_place_id) invalid();
    }
  }
}
