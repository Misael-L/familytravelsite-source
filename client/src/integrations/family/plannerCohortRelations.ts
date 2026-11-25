import type { FamilyIdentityRegistry } from './identity';
import type { ProjectedPlannerState } from './plannerProjection';
import { FamilyApiError } from './repository';

/** Read-time compatibility only. Never persist the old catalog selector as a saved-location identity. */
export function reconcilePlannerResources<T extends Record<string, unknown[]>>(
  resources: T,
  state: ProjectedPlannerState,
  ids: FamilyIdentityRegistry
): T {
  const trip = ids.register('trip', state.trip_id),
    pool = new Set(state.locations.map((l) => ids.register('place', l.id))),
    visits = new Set(state.visits.map((v) => ids.register('assignment', v.id)));
  const aliases = new Map(
    state.locations.flatMap((l) =>
      l.source.kind === 'place' && l.source.id
        ? [[ids.register('place', l.source.id), ids.register('place', l.id)]]
        : []
    )
  );
  const invalid = () =>
    new FamilyApiError(
      409,
      'planner_resource_identity',
      'A retained attachment/booking/cost link needs an explicit identity bridge.'
    );
  const place = (value: unknown) => {
    if (value == null) return value;
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw invalid();
    if (pool.has(value)) return value;
    const saved = aliases.get(value);
    if (saved === undefined) throw invalid();
    return saved;
  };
  return Object.fromEntries(
    Object.entries(resources).map(([key, rows]) => [
      key,
      rows.map((raw) => {
        if (!raw || typeof raw !== 'object') throw invalid();
        const row = { ...raw } as Record<string, unknown>;
        if ('trip_id' in row && row.trip_id !== trip) throw invalid();
        for (const k of ['place_id', 'accommodation_place_id']) if (k in row) row[k] = place(row[k]);
        if (row.assignment_id != null && (typeof row.assignment_id !== 'number' || !visits.has(row.assignment_id)))
          throw invalid();
        if ('linked_place_ids' in row) {
          if (!Array.isArray(row.linked_place_ids)) throw invalid();
          row.linked_place_ids = row.linked_place_ids.map(place);
        }
        return row;
      }),
    ])
  ) as T;
}
