import { z, ZodError } from 'zod';
import { NOT_HANDLED } from './listHandler';
import { planEntryPayloadSchema } from './planEntryContract';
import { createLocationRequest, locationId, updateLocationRequest } from './planLocationContract';
import { locationRpc, savedLocationResponse } from './planLocations';
import { arrangementPlan } from './plannerArrangementContract';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';
import { createVisitRequest, updateVisitRequest } from './visitCommands';
import { visitTimingPayloadSchema } from './visitTiming';

const status = z.enum(['submitted', 'partially_applied', 'applied', 'rejected', 'withdrawn']);
const stageSchema = z.object({
  operation: z.object({ draft_id: locationId, op_id: locationId }),
  state: z.enum(['draft', 'submitted', 'removed']),
  request_id: locationId.nullable(),
  request_status: status.nullable(),
});
const submitSchema = z.object({
  operation: z.object({ request_id: locationId, op_count: z.number().int().positive(), trip_id: locationId }),
  request_status: status,
});
const reviewSchema = z.object({
  op_id: locationId,
  status: z.enum(['applied', 'rejected']),
  published_id: locationId.nullable().optional(),
  published_revision: z.number().int().positive().safe().nullable().optional(),
  error_code: z.string().optional(),
});
const stageRequest = z
  .object({
    operation_id: locationId,
    domain: z.enum(['location', 'visit']),
    action: z.enum(['create', 'update', 'trash', 'restore', 'timing', 'create_entry', 'arrange']),
    target_id: locationId.nullable().default(null),
    expected_revision: z.number().int().positive().safe().nullable().default(null),
    changes: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
function retryBody(request: FamilyRequest) {
  if (request.query.size)
    throw new FamilyApiError(400, 'invalid_plan_change_query', 'Plan change commands have no query parameters.');
  if (request.headers?.['x-base-updated-at'])
    throw new FamilyApiError(409, 'plan_change_revision_required', 'Use the observed target revision.');
  const body = z.record(z.string(), z.unknown()).parse(request.body),
    header = request.headers?.['x-idempotency-key'];
  if (header && body.operation_id !== undefined && header !== body.operation_id)
    throw new FamilyApiError(
      400,
      'plan_change_operation_mismatch',
      'The retry header and body identify different operations.'
    );
  return { ...body, operation_id: body.operation_id ?? header };
}
function typedStage(request: FamilyRequest) {
  const body = stageRequest.parse(retryBody(request));
  if (
    ['create', 'create_entry'].includes(body.action)
      ? body.target_id !== null || body.expected_revision !== null
      : body.target_id === null || body.expected_revision === null
  )
    throw new FamilyApiError(
      400,
      'invalid_plan_change_target',
      'Creates have no target; edits require the observed target and revision.'
    );
  if (body.action === 'create_entry') {
    if (body.domain !== 'visit')
      throw new FamilyApiError(400, 'invalid_entry_proposal_domain', 'Plan entries require the visit domain.');
    return { ...body, changes: planEntryPayloadSchema.parse(body.changes) };
  }
  if (body.action === 'arrange') {
    if (body.domain !== 'visit')
      throw new FamilyApiError(400, 'invalid_arrangement_domain', 'Arrangements require the visit domain.');
    return { ...body, changes: arrangementPlan.parse(body.changes) };
  }
  if (body.action === 'timing') {
    if (body.domain !== 'visit')
      throw new FamilyApiError(400, 'invalid_timing_proposal_domain', 'Timing proposals require an existing visit.');
    return { ...body, changes: visitTimingPayloadSchema.parse(body.changes) };
  }
  const create = body.action === 'create';
  const schema =
    body.domain === 'location'
      ? create
        ? createLocationRequest.omit({ operation_id: true })
        : updateLocationRequest.omit({ operation_id: true, expected_revision: true })
      : create
        ? createVisitRequest.omit({ operation_id: true })
        : updateVisitRequest.omit({ operation_id: true, expected_revision: true });
  const changes = ['trash', 'restore'].includes(body.action)
    ? z.object({}).strict().parse(body.changes)
    : schema.parse(body.changes);
  return { ...body, changes };
}
function failure(error: unknown): never {
  if (error instanceof FamilyApiError) throw error;
  if (error instanceof ZodError)
    throw new FamilyApiError(400, 'invalid_plan_change_contract', 'Invalid typed plan change.');
  const e = error as { code?: string; message?: string },
    code = e.code ?? '';
  let http: number | null = null;
  if (code === '42501') http = 403;
  else if (['40001', '40P01', '0A000'].includes(code)) http = 409;
  else if (['42883', 'PGRST202', '55000'].includes(code)) http = 503;
  else if (code.startsWith('23')) http = 422;
  else if (code.startsWith('22') || ['invalid_uuid', 'unknown_view_key'].includes(code)) http = 400;
  if (http) throw new FamilyApiError(http, 'plan_change_' + code, e.message ?? 'Plan change failed.');
  throw error;
}
async function dispatch(trip: string, suffix: string | undefined, request: FamilyRequest) {
  if (!suffix) {
    const body = typedStage(request);
    return savedLocationResponse(
      stageSchema,
      await locationRpc('stage_family_plan_change_v2', {
        p_trip_id: trip,
        p_operation_id: body.operation_id,
        p_domain: body.domain,
        p_action: body.action,
        p_target_id: body.target_id,
        p_expected_revision: body.expected_revision,
        p_changes: body.changes,
      })
    );
  }
  const submit = suffix.match(/^([^/]+)\/submit$/);
  if (submit) {
    const draft = locationId.parse(submit[1]);
    const body = z
      .object({ operation_id: locationId, summary: z.string().max(20000).nullable().optional() })
      .strict()
      .parse(retryBody(request));
    const result = savedLocationResponse(
      submitSchema,
      await locationRpc('submit_family_plan_change_draft_v2', {
        p_trip_id: trip,
        p_operation_id: body.operation_id,
        p_draft_id: draft,
        p_summary: body.summary ?? null,
      })
    );
    if (result.operation.trip_id !== trip)
      throw new FamilyApiError(502, 'invalid_plan_change_trip', 'Submission returned another Trip.');
    return result;
  }
  const review = suffix.match(/^operations\/([^/]+)\/review$/);
  if (!review) throw new FamilyApiError(405, 'plan_change_route_unavailable', 'Unsupported plan change command.');
  const identity = locationId.parse(review[1]);
  if (request.query.size) throw new FamilyApiError(400, 'invalid_plan_change_query', 'Review has no query parameters.');
  const body = z
    .object({ accept: z.boolean(), note: z.string().max(20000).nullable().optional() })
    .strict()
    .parse(request.body);
  const result = savedLocationResponse(
    reviewSchema,
    await locationRpc('review_family_plan_change_v2', {
      p_trip_id: trip,
      p_op_id: identity,
      p_accept: body.accept,
      p_note: body.note ?? null,
    })
  );
  if (result.op_id !== identity)
    throw new FamilyApiError(502, 'invalid_plan_change_operation', 'Review returned another operation.');
  return result;
}
/** Versioned proposal seam; staging never returns a published-row-shaped acknowledgement. */
export async function handleFamilyPlanChanges(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const match = request.pathname.match(/^\/trips\/([^/]+)\/family\/plan-changes(?:\/(.*))?$/);
  if (!match) return NOT_HANDLED;
  if (request.method !== 'POST')
    throw new FamilyApiError(405, 'plan_change_method_unavailable', 'Use POST for plan change commands.');
  try {
    await repo.session();
    const trip = await repo.tripUuid(match[1]),
      views = await repo.views();
    const result = await dispatch(trip, match[2], request);
    if ((await repo.views()).ids !== views.ids)
      throw new FamilyApiError(409, 'stale_plan_change_session', 'The Family session changed. Reload plan changes.');
    if (match[2]?.startsWith('operations/')) repo.invalidate(trip);
    return result;
  } catch (error) {
    return failure(error);
  }
}
