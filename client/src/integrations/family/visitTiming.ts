import { z } from 'zod';
import { NOT_HANDLED } from './listHandler';
import { locationId } from './planLocationContract';
import { locationRpc, savedLocationResponse } from './planLocations';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';
import {
  fenceVisitScope,
  observedVisitTimingSchema,
  readVisitDetail,
  visitCommandBody,
  visitCommandFailure,
  visitReceiptSchema,
} from './visitCommands';

const revision = z.number().int().positive().safe();
const instant = z
  .string()
  .datetime({ offset: true })
  .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/);
const duration = z.number().int().min(0).max(10080).nullable();
const timed = z
  .object({
    kind: z.literal('timed'),
    basis: z.enum(['local', 'instant']),
    starts_at: instant.nullable(),
    ends_at: instant.nullable(),
    time_zone: z.string().min(1).max(200),
  })
  .strict();
const base = z.object({ operation_id: locationId, expected_revision: revision });
const timingFields = {
  day_id: locationId.nullable(),
  timing: z.discriminatedUnion('kind', [z.object({ kind: z.literal('untimed') }).strict(), timed]),
  duration_minutes: duration.optional(),
  observed_legacy_timing: observedVisitTimingSchema.optional(),
};
const timingPayload = z.object(timingFields).strict();
function validTimingPayload(value: z.infer<typeof timingPayload>) {
  const time = value.timing;
  return (
    time.kind === 'untimed' ||
    ((time.starts_at !== null || time.ends_at !== null) &&
      !(time.starts_at !== null && time.ends_at !== null && value.duration_minutes != null))
  );
}
const setRequest = base
  .extend(timingFields)
  .strict()
  .refine(validTimingPayload, 'Timed input needs an endpoint; a complete interval owns duration.');
const requestSchema = z.union([setRequest, base.extend({ restore_revision: revision }).strict()]);
export const visitTimingPayloadSchema = z.union([
  timingPayload.refine(validTimingPayload, 'Timed input needs an endpoint; a complete interval owns duration.'),
  z.object({ restore_revision: revision }).strict(),
]);
const receipt = visitReceiptSchema.extend({ timing_revision: revision.nullable() });
const timingState = z.object({
  timing_kind: z.enum(['legacy', 'untimed', 'timed']),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  time_zone: z.string().nullable(),
  trip_day_id: locationId.nullable(),
  planned_duration_minutes: duration,
});
const historySchema = z.object({
  version: z.literal(1),
  visit_id: locationId,
  revision_before: revision,
  before_timing: timingState,
  after_timing: timingState,
  input_basis: z.enum(['local', 'instant', 'untimed', 'restore']),
  recorded_at: z.string(),
});
const historyQuery = z.object({ include_trash: z.enum(['true', 'false']).default('false') }).strict();

async function saveTiming(
  repo: FamilyFrontendRepository,
  request: FamilyRequest,
  context: { trip: string; identity: string; ids: import('./identity').FamilyIdentityRegistry }
) {
  const { trip, identity, ids } = context;
  if (request.method !== 'PUT')
    throw new FamilyApiError(405, 'timing_method_unavailable', 'Use PUT for complete visit timing.');
  const { operation_id, expected_revision, ...payload } = requestSchema.parse(visitCommandBody(request));
  await fenceVisitScope(repo, ids);
  const operation = savedLocationResponse(
    receipt,
    await locationRpc('set_family_trip_visit_timing_v1', {
      p_trip_id: trip,
      p_operation_id: operation_id,
      p_visit_id: identity,
      p_expected_revision: expected_revision,
      p_payload: payload,
    })
  );
  await fenceVisitScope(repo, ids);
  if (operation.id !== identity)
    throw new FamilyApiError(502, 'invalid_timing_operation', 'Timing returned another occurrence.');
  repo.invalidate(trip);
  const current = await readVisitDetail(trip, identity, true, ids);
  await fenceVisitScope(repo, ids);
  return { ...current, operation };
}

/** Complete timing seam; no reinterpretation of the native clock-only assignment route. */
export async function handleFamilyVisitTiming(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const match = request.pathname.match(/^\/trips\/([^/]+)\/family\/visits\/([^/]+)\/(timing|timing-history\/([^/]+))$/);
  if (!match) return NOT_HANDLED;
  try {
    await repo.session();
    const trip = await repo.tripUuid(match[1]),
      ids = (await repo.views()).ids,
      identity = locationId.parse(match[2]);
    if (match[3] === 'timing') return await saveTiming(repo, request, { trip, identity, ids });
    if (request.method !== 'GET')
      throw new FamilyApiError(405, 'timing_history_method_unavailable', 'Timing history is read-only.');
    const sourceRevision = z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform((value) => Number(value))
      .pipe(revision)
      .parse(match[4]);
    const query = historyQuery.parse(Object.fromEntries(request.query));
    const result = savedLocationResponse(
      historySchema,
      await locationRpc('get_family_trip_visit_timing_revision_v1', {
        p_trip_id: trip,
        p_visit_id: identity,
        p_revision: sourceRevision,
        p_include_trash: query.include_trash === 'true',
      })
    );
    if (result.visit_id !== identity || result.revision_before !== sourceRevision)
      throw new FamilyApiError(
        502,
        'invalid_timing_history',
        'Timing history returned another occurrence or revision.'
      );
    await fenceVisitScope(repo, ids);
    return result;
  } catch (error) {
    return visitCommandFailure(error);
  }
}
