import { z } from 'zod';
import { NOT_HANDLED } from './listHandler';
import { locationId } from './planLocationContract';
import { locationRpc, savedLocationResponse } from './planLocations';
import { readPlannerState } from './plannerState';
import { FamilyApiError, type FamilyFrontendRepository, type FamilySession } from './repository';
import type { FamilyRequest } from './transport';
import { visitCommandBody, visitCommandFailure } from './visitCommands';

const uuid = locationId.transform((id) => id.toLowerCase());
const positive = z.number().int().positive().safe();
const observation = z.object({ place_id: uuid, expected_category_id: uuid.nullable() }).strict();
const requestSchema = z
  .object({
    scope: z.object({ user_id: uuid, family_id: uuid, person_id: uuid }).strict(),
    operation_id: locationId,
    expected_revision: positive,
    destinations: z
      .array(observation)
      .min(1)
      .max(100)
      .refine((rows) => new Set(rows.map((r) => r.place_id)).size === rows.length, 'Duplicate destinations'),
  })
  .strict();
const scopeSchema = z.object({ version: z.literal(1), trip_id: locationId, family_id: locationId });
const receiptSchema = z.object({
  version: z.literal(1),
  trip_id: locationId,
  trip_revision: positive,
  created_count: z.number().int().min(0).max(100),
  remaining_unmaterialized_count: z.number().int().nonnegative().safe(),
  mappings: z
    .array(
      z.object({
        source_place_id: locationId,
        location_id: locationId,
        location_revision: positive,
        created: z.boolean(),
        category_disposition: z.enum(['existing_preserved', 'destination_copied']),
      })
    )
    .min(1)
    .max(100),
});
function sameScope(a: FamilySession, b: FamilySession) {
  return a.userId === b.userId && a.familyId === b.familyId && a.personId === b.personId;
}
function validateReceipt(
  receipt: z.infer<typeof receiptSchema>,
  trip: string,
  destinations: z.infer<typeof observation>[]
) {
  const sources = new Set(destinations.map((r) => r.place_id));
  if (
    receipt.trip_id !== trip ||
    receipt.mappings.length !== sources.size ||
    new Set(receipt.mappings.map((r) => r.source_place_id)).size !== sources.size ||
    new Set(receipt.mappings.map((r) => r.location_id)).size !== sources.size ||
    receipt.mappings.some(
      (r) =>
        !sources.has(r.source_place_id) ||
        r.category_disposition !== (r.created ? 'destination_copied' : 'existing_preserved')
    ) ||
    receipt.created_count !== receipt.mappings.filter((r) => r.created).length
  )
    throw new FamilyApiError(
      502,
      'invalid_destination_bridge_result',
      'The destination command returned inconsistent identities.'
    );
}

/** Explicit command only: a planner read never creates saved destination rows. */
export async function handleFamilyDestinationBridge(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const match = request.pathname.match(/^\/trips\/([^/]+)\/family\/destinations\/bridge$/);
  if (!match) return NOT_HANDLED;
  if (request.method !== 'POST')
    throw new FamilyApiError(405, 'destination_bridge_method', 'Use POST for the explicit destination bridge.');
  try {
    const session = await repo.session(),
      trip = await repo.tripUuid(match[1]),
      ids = (await repo.views()).ids;
    const body = requestSchema.parse(visitCommandBody(request));
    if (
      body.scope.user_id !== session.userId ||
      body.scope.family_id !== session.familyId ||
      body.scope.person_id !== session.personId
    )
      throw new FamilyApiError(
        409,
        'destination_bridge_origin_scope',
        'The queued operation belongs to another Family session.'
      );
    const fence = async () => {
      if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!sameScope(session, await repo.session()) || (await repo.views()).ids !== ids)
        throw new FamilyApiError(
          409,
          'stale_destination_bridge_session',
          'The Family session changed. Reload the Trip.'
        );
    };
    const observedScope = savedLocationResponse(
      scopeSchema,
      await locationRpc('get_family_trip_planner_state_v1', { p_trip_id: trip })
    );
    if (observedScope.trip_id !== trip || observedScope.family_id !== session.familyId)
      throw new FamilyApiError(403, 'destination_bridge_family_mismatch', 'This Trip is outside the selected Family.');
    await fence();
    const operation = savedLocationResponse(
      receiptSchema,
      await locationRpc('bridge_family_trip_destinations_v1', {
        p_trip_id: trip,
        p_operation_id: body.operation_id,
        p_expected_revision: body.expected_revision,
        p_destinations: body.destinations,
      })
    );
    validateReceipt(operation, trip, body.destinations);
    await fence();
    repo.invalidate(trip);
    const state = await readPlannerState(repo, trip, request.signal);
    await fence();
    // A replay returns its immutable original receipt plus current state. A later
    // Trash/removal is valid; a different active identity for the same source is not.
    for (const mapping of operation.mappings) {
      const current = state.destinations.find((r) => r.source_place_id === mapping.source_place_id);
      if (current?.location_id && current.location_id !== mapping.location_id)
        throw new FamilyApiError(
          502,
          'invalid_destination_bridge_readback',
          'The planner returned another active saved identity.'
        );
    }
    return { version: 1, operation, state };
  } catch (error) {
    return visitCommandFailure(error);
  }
}
