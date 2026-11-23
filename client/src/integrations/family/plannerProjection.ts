import type { Assignment, Day } from '../../types';
import type { FamilyIdentityRegistry } from './identity';
import type { CatalogVariantDescriptor } from './legacy/data/supabase/catalogExploreMedia';
import { projectPlanLocations } from './planLocations';
import type { PlannerState } from './plannerStateContract';
import { validatePlannerState } from './plannerStateValidation';
import type { PublicVariantResolver } from './publicVariantImages';
import { FamilyApiError } from './repository';

export async function projectPlannerState(
  state: PlannerState,
  ids: FamilyIdentityRegistry,
  beforeRegister?: () => Promise<void>,
  variants?: Map<string, CatalogVariantDescriptor>,
  display?: PublicVariantResolver
) {
  validatePlannerState(state);
  const { locations, visits, days, notes, destinations } = state;
  const blockers: { kind: string; id: string }[] = [];
  for (const d of destinations)
    if (!d.location_id) blockers.push({ kind: 'unmaterialized_destination', id: d.source_place_id });
  for (const v of visits) {
    if (v.timing_kind === 'legacy') blockers.push({ kind: 'legacy_timing', id: v.id });
    if (!v.trip_day_id) blockers.push({ kind: 'unassigned_visit', id: v.id });
  }
  for (const n of notes)
    if (!days.some((d) => d.civil_day === n.civil_day)) blockers.push({ kind: 'unassigned_note', id: n.id });
  const projected = await projectPlanLocations(locations, ids, beforeRegister, variants, display),
    byId = new Map(projected.map((l) => [l.id, l]));
  const nativeDays: Day[] = [...days]
    .sort((a, b) => a.day_index - b.day_index)
    .map((d) => {
      const dayId = ids.register('day', d.id);
      const assignments: Assignment[] = visits
        .filter((v) => v.trip_day_id === d.id)
        .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
        .map((v) => {
          const place = v.plan_location_id ? byId.get(v.plan_location_id)?.native_place : null;
          return {
            id: ids.register('assignment', v.id),
            day_id: dayId,
            place_id: place?.id ?? 0,
            order_index: v.sort_order,
            assignment_time: v.timing_kind === 'timed' ? (v.start_local?.slice(11, 16) ?? null) : null,
            assignment_end_time: v.timing_kind === 'timed' ? (v.end_local?.slice(11, 16) ?? null) : null,
            notes: v.explanations,
            duration_minutes: v.duration_minutes ?? null,
            place: {
              ...(place ?? { id: 0, name: v.activity, lat: null, lng: null }),
              // Native day cards consume clocks on this occurrence's embedded place.
              // Never put a visit clock on the shared pool location.
              place_time: v.timing_kind === 'timed' ? (v.start_local?.slice(11, 16) ?? null) : null,
              end_time: v.timing_kind === 'timed' ? (v.end_local?.slice(11, 16) ?? null) : null,
            },
            family_visit: v,
          };
        });
      return {
        id: dayId,
        trip_id: ids.register('trip', state.trip_id),
        date: d.civil_day,
        family_day: d,
        day_number: d.day_index,
        title: d.title,
        assignments,
        notes_items: notes
          .filter((n) => n.civil_day === d.civil_day)
          .map((n) => ({
            id: ids.register('note', n.id),
            day_id: dayId,
            trip_id: ids.register('trip', state.trip_id),
            text: n.body,
            icon: n.icon,
            sort_order: n.sort_order,
          })),
      };
    });
  return {
    ...state,
    locations: projected,
    native: {
      places: projected.map((l) => ({
        ...l.native_place,
        updated_at: l.updated_at,
        family_location_id: l.id,
        family_identity: { trip_id: state.trip_id, location_id: l.id },
        family_revision: l.revision,
      })),
      days: nativeDays,
    },
    readiness: { ready: blockers.length === 0, blockers },
  };
}
export type ProjectedPlannerState = Awaited<ReturnType<typeof projectPlannerState>>;

/** Legacy aliases are explicitly Trip-scoped; never persist them as global place aliases. */
export function resolvePlannerLocation(
  state: ProjectedPlannerState,
  ids: FamilyIdentityRegistry,
  value: string | number,
  kind: 'saved' | 'legacy-destination'
): string {
  const id = ids.uuid('place', value);
  const resolved =
    kind === 'saved'
      ? state.locations.find((l) => l.id === id)?.id
      : state.destinations.find((d) => d.source_place_id === id)?.location_id;
  if (!resolved)
    throw new FamilyApiError(409, 'unresolved_planner_identity', 'Reload the Trip before resolving this location.');
  return resolved;
}
