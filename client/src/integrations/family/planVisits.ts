import { z, ZodError } from 'zod';
import { NOT_HANDLED } from './listHandler';
import { locationId, locationSchema } from './planLocationContract';
import { locationRpc, projectPlanLocations, savedLocationResponse } from './planLocations';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';

const querySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(100),
    after_id: locationId.optional(),
  })
  .strict();
export const visitSchema = z.object({
  id: locationId,
  trip_id: locationId,
  activity: z.string(),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  time_zone: z.string().nullable(),
  sort_order: z.number().int(),
  explanations: z.string().nullable(),
  updated_at: z.string(),
  plan_location_id: locationId.nullable(),
  location: locationSchema.nullable(),
  owning_stay_id: locationId.optional(),
  timing_kind: z.enum(['legacy', 'untimed', 'timed']).optional(),
  trip_day_id: locationId.nullable().optional(),
  planning_day: z.string().nullable().optional(),
  revision: z.number().int().positive().safe().optional(),
  duration_minutes: z.number().min(0).max(10080).nullable().optional(),
  planned_duration_minutes: z.number().int().min(0).max(10080).nullable().optional(),
  start_local: z.string().nullable().optional(),
  end_local: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional(),
});
const pageSchema = z.object({
  version: z.literal(1),
  visits: z.array(visitSchema),
  has_more: z.boolean(),
  next_cursor: locationId.nullable(),
});

/** Read seam for the upcoming joint planner cutover. No legacy native route changes. */
export async function handleFamilyPlanVisits(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const match = request.pathname.match(/^\/trips\/([^/]+)\/family\/visits$/);
  if (!match) return NOT_HANDLED;
  if (request.method !== 'GET')
    throw new FamilyApiError(
      405,
      'visit_write_not_connected',
      'Use the existing visit commands until the planner cutover.'
    );
  try {
    await repo.session();
    const trip = await repo.tripUuid(match[1]),
      views = await repo.views();
    const query = querySchema.parse(Object.fromEntries(request.query));
    const page = savedLocationResponse(
      pageSchema,
      await locationRpc('list_family_trip_visits_v1', {
        p_trip_id: trip,
        p_limit: query.limit,
        p_after_id: query.after_id ?? null,
      })
    );
    if (
      page.visits.some(
        (visit) =>
          visit.trip_id !== trip ||
          visit.plan_location_id !== (visit.location?.id ?? null) ||
          (visit.location && (visit.location.trip_id !== trip || visit.location.deleted_at !== null))
      )
    )
      throw new FamilyApiError(
        502,
        'invalid_visit_relationship',
        'The visit service returned an invalid relationship.'
      );
    const locations = await projectPlanLocations(
      page.visits.flatMap((v) => (v.location ? [v.location] : [])),
      views.ids
    );
    if ((await repo.views()).ids !== views.ids)
      throw new FamilyApiError(409, 'stale_visit_session', 'The Family session changed. Reload visits.');
    const byId = new Map(locations.map((l) => [l.id, l]));
    return {
      ...page,
      visits: page.visits.map((v) => ({ ...v, location: v.plan_location_id ? byId.get(v.plan_location_id) : null })),
    };
  } catch (error) {
    if (error instanceof FamilyApiError) throw error;
    if (error instanceof ZodError)
      throw new FamilyApiError(400, 'invalid_visit_request', 'Invalid visit page request.');
    const e = error as { code?: string; message?: string };
    const status =
      e.code === '42501'
        ? 403
        : e.code === 'PGRST202' || e.code === '42883'
          ? 503
          : e.code === '23514'
            ? 409
            : ['22023', '22P02', 'invalid_uuid', 'unknown_view_key'].includes(e.code ?? '')
              ? 400
              : null;
    if (status) throw new FamilyApiError(status, 'visit_' + e.code, e.message ?? 'Visit read failed.');
    throw error;
  }
}
