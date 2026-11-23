import { z } from 'zod';
import { NOT_HANDLED } from './listHandler';
import { createPlanEntryRequest } from './planEntryContract';
import { locationId } from './planLocationContract';
import { locationRpc, savedLocationResponse } from './planLocations';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';
import {
  fenceVisitScope,
  readVisitDetail,
  visitCommandBody,
  visitCommandFailure,
  visitReceiptSchema,
} from './visitCommands';

const receipt = visitReceiptSchema.extend({
  location_id: locationId.nullable(),
  timing_revision: z.number().int().positive().safe().nullable(),
});

/** A single checked create; no fallback to separate location/visit/time requests. */
export async function handleFamilyPlanEntries(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const match = request.pathname.match(/^\/trips\/([^/]+)\/family\/plan-entries$/);
  if (!match) return NOT_HANDLED;
  if (request.method !== 'POST')
    throw new FamilyApiError(405, 'plan_entry_method_unavailable', 'Use POST to create a plan entry.');
  try {
    await repo.session();
    const trip = await repo.tripUuid(match[1]),
      ids = (await repo.views()).ids;
    const { operation_id, ...payload } = createPlanEntryRequest.parse(visitCommandBody(request));
    await fenceVisitScope(repo, ids);
    const operation = savedLocationResponse(
      receipt,
      await locationRpc('create_family_trip_plan_entry_v1', {
        p_trip_id: trip,
        p_operation_id: operation_id,
        p_payload: payload,
      })
    );
    if (
      payload.location === null
        ? operation.location_id !== null
        : 'id' in payload.location
          ? operation.location_id !== payload.location.id
          : operation.location_id === null
    )
      throw new FamilyApiError(502, 'invalid_plan_entry_location', 'The entry command returned another location.');
    await fenceVisitScope(repo, ids);
    repo.invalidate(trip);
    const current = await readVisitDetail(trip, operation.id, true, ids);
    await fenceVisitScope(repo, ids);
    return { ...current, operation };
  } catch (error) {
    return visitCommandFailure(error);
  }
}
