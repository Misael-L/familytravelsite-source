import { z, ZodError } from 'zod';
import type { FamilyIdentityRegistry } from './identity';
import { NOT_HANDLED } from './listHandler';
import { locationId } from './planLocationContract';
import { locationRpc, projectPlanLocations, savedLocationResponse } from './planLocations';
import { visitSchema } from './planVisits';
import { FamilyApiError, type FamilyFrontendRepository, type FamilySession } from './repository';
import type { FamilyRequest } from './transport';

const fields = {
  location_id: locationId.nullable().optional(),
  day_id: locationId.nullable().optional(),
  activity: z.string().max(500).nullable().optional(),
  notes: z.string().max(20000).nullable().optional(),
  duration_minutes: z.number().int().min(0).max(10080).nullable().optional(),
};
const createRequest = z.object({ operation_id: locationId, ...fields }).strict();
const updateRequest = createRequest.extend({ expected_revision: z.number().int().positive().safe() });
const lifecycleRequest = z
  .object({ operation_id: locationId, expected_revision: z.number().int().positive().safe() })
  .strict();
const observedTiming = z
  .object({
    starts_at: z.string().datetime({ offset: true }).nullable(),
    ends_at: z.string().datetime({ offset: true }).nullable(),
    time_zone: z.string().max(200).nullable(),
  })
  .strict();
const classificationRequest = lifecycleRequest.extend({
  day_id: locationId.nullable(),
  duration_minutes: fields.duration_minutes,
  observed_timing: observedTiming,
});
const classificationSchema = z.object({
  version: z.literal(1),
  visit_id: locationId,
  classification: z
    .object({
      original_revision: z.number().int().positive().safe(),
      classified_at: z.string(),
      original_timing: observedTiming,
    })
    .nullable(),
});
const detailSchema = z.object({
  version: z.literal(1),
  visit: visitSchema.extend({
    timing_kind: z.enum(['legacy', 'untimed', 'timed']),
    trip_day_id: locationId.nullable(),
    planning_day: z.string().nullable(),
    revision: z.number().int().positive().safe(),
    duration_minutes: z.number().min(0).max(10080).nullable(),
    deleted_at: z.string().nullable(),
  }),
});
const receiptSchema = z.object({
  id: locationId,
  revision: z.number().int().positive().safe(),
  deleted_at: z.string().nullable(),
});
const detailQuery = z.object({ include_trash: z.enum(['true', 'false']).default('false') }).strict();

async function scope(repo: FamilyFrontendRepository, ids: import('./identity').FamilyIdentityRegistry) {
  if ((await repo.views()).ids !== ids)
    throw new FamilyApiError(409, 'stale_visit_session', 'The Family session changed. Reload visits.');
}
async function detail(
  trip: string,
  identity: string,
  includeTrash: boolean,
  ids: import('./identity').FamilyIdentityRegistry
) {
  const result = savedLocationResponse(
    detailSchema,
    await locationRpc('get_family_trip_visit_v1', {
      p_trip_id: trip,
      p_visit_id: identity,
      p_include_trash: includeTrash,
    })
  );
  const visit = result.visit;
  if (
    visit.id !== identity ||
    visit.trip_id !== trip ||
    visit.plan_location_id !== (visit.location?.id ?? null) ||
    (visit.location && (visit.location.trip_id !== trip || visit.location.deleted_at !== null))
  )
    throw new FamilyApiError(502, 'invalid_visit_relationship', 'The visit service returned an invalid relationship.');
  const locations = await projectPlanLocations(visit.location ? [visit.location] : [], ids);
  return { ...result, visit: { ...visit, location: locations[0] ?? null } };
}

type CommandScope = {
  trip: string;
  ids: import('./identity').FamilyIdentityRegistry;
  identity: string | null;
  action: string | undefined;
};
export function createFormSessionCheck(
  repo: FamilyFrontendRepository,
  session: FamilySession,
  ids: FamilyIdentityRegistry,
  signal: AbortSignal | undefined,
  staleCode: 'stale_location_form_session' | 'stale_visit_form_session'
) {
  return async () => {
    const current = await repo.session();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (
      current.userId !== session.userId ||
      current.familyId !== session.familyId ||
      current.personId !== session.personId ||
      (await repo.views()).ids !== ids
    )
      throw new FamilyApiError(409, staleCode, 'The Family session changed. Reload the form.');
    // The views lookup can await a session refresh.
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  };
}
export function visitCommandBody(request: FamilyRequest) {
  if (request.query.size)
    throw new FamilyApiError(400, 'invalid_visit_query', 'Visit commands have no query parameters.');
  if (request.headers?.['x-base-updated-at'])
    throw new FamilyApiError(
      409,
      'visit_revision_required',
      'Use the observed visit revision; native timestamp mapping is not connected yet.'
    );
  const raw = z.record(z.string(), z.unknown()).parse(request.body);
  const header = request.headers?.['x-idempotency-key'];
  if (header && raw.operation_id !== undefined && raw.operation_id !== header)
    throw new FamilyApiError(
      400,
      'visit_operation_mismatch',
      'The body and retry header identify different operations.'
    );
  return { ...raw, operation_id: raw.operation_id ?? header };
}
function commandInput(request: FamilyRequest, identity: string | null, action: string | undefined) {
  const allowed =
    request.method === 'POST'
      ? !identity || (Boolean(action) && action !== 'legacy-timing')
      : request.method === 'PUT' && Boolean(identity) && !action;
  if (!allowed) throw new FamilyApiError(405, 'visit_method_not_supported', 'Unsupported explicit visit command.');
  const body = visitCommandBody(request);
  return (
    action === 'classify-untimed'
      ? classificationRequest
      : action
        ? lifecycleRequest
        : identity
          ? updateRequest
          : createRequest
  ).parse(body);
}
async function writeVisit(repo: FamilyFrontendRepository, request: FamilyRequest, context: CommandScope) {
  const { trip, ids, identity, action } = context;
  const { operation_id, ...rest } = commandInput(request, identity, action);
  const expected = 'expected_revision' in rest ? rest.expected_revision : null;
  const payload = Object.fromEntries(Object.entries(rest).filter(([key]) => key !== 'expected_revision'));
  await scope(repo, ids);
  const operation = savedLocationResponse(
    receiptSchema,
    await locationRpc(
      action === 'classify-untimed' ? 'classify_family_trip_visit_untimed_v1' : 'mutate_family_trip_visit_v1',
      {
        p_trip_id: trip,
        p_operation_id: operation_id,
        ...(action === 'classify-untimed' ? {} : { p_action: action ?? (identity ? 'update' : 'create') }),
        p_visit_id: identity,
        p_expected_revision: expected,
        p_payload: payload,
      }
    )
  );
  await scope(repo, ids);
  if (identity && operation.id !== identity)
    throw new FamilyApiError(502, 'invalid_visit_operation', 'Visit command returned another occurrence.');
  repo.invalidate(trip);
  const current = await detail(trip, operation.id, true, ids);
  await scope(repo, ids);
  return { ...current, operation };
}
function commandFailure(error: unknown): never {
  if (error instanceof FamilyApiError) throw error;
  if (error instanceof ZodError)
    throw new FamilyApiError(400, 'invalid_visit_command', 'Invalid explicit visit command.');
  const e = error as { code?: string; message?: string },
    code = e.code ?? '';
  let status: number | null = null;
  if (code === '42501') status = 403;
  else if (['40001', '40P01', '0A000', 'PT409'].includes(code)) status = 409;
  else if (['PGRST202', '42883', '55000'].includes(code)) status = 503;
  else if (code.startsWith('23')) status = 422;
  else if (code.startsWith('22') || ['invalid_uuid', 'unknown_view_key'].includes(code)) status = 400;
  if (status) throw new FamilyApiError(status, 'visit_' + code, e.message ?? 'Visit command failed.');
  throw error;
}
/** Explicit command seam; existing native planner writes are not silently redirected. */
export async function handleFamilyVisitCommands(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const match = request.pathname.match(
    /^\/trips\/([^/]+)\/family\/visits(?:\/([^/]+)(?:\/(trash|restore|classify-untimed|legacy-timing))?)?$/
  );
  if (!match || (request.method === 'GET' && !match[2])) return NOT_HANDLED;
  try {
    await repo.session();
    const trip = await repo.tripUuid(match[1]),
      views = await repo.views();
    const identity = match[2] ? locationId.parse(match[2]) : null,
      action = match[3];
    if (request.method === 'GET' && identity && (!action || action === 'legacy-timing')) {
      const query = detailQuery.parse(Object.fromEntries(request.query));
      const result =
        action === 'legacy-timing'
          ? savedLocationResponse(
              classificationSchema,
              await locationRpc('get_family_trip_visit_classification_v1', {
                p_trip_id: trip,
                p_visit_id: identity,
                p_include_trash: query.include_trash === 'true',
              })
            )
          : await detail(trip, identity, query.include_trash === 'true', views.ids);
      if ('visit_id' in result && result.visit_id !== identity)
        throw new FamilyApiError(502, 'invalid_visit_history', 'Timing history returned another occurrence.');
      await scope(repo, views.ids);
      return result;
    }
    return await writeVisit(repo, request, { trip, ids: views.ids, identity, action });
  } catch (error) {
    return commandFailure(error);
  }
}

export { createRequest as createVisitRequest, updateRequest as updateVisitRequest };

export {
  scope as fenceVisitScope,
  observedTiming as observedVisitTimingSchema,
  detail as readVisitDetail,
  commandFailure as visitCommandFailure,
  receiptSchema as visitReceiptSchema,
};
