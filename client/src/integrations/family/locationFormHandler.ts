import { z } from 'zod';
import type { FamilyIdentityRegistry } from './identity';
import { NOT_HANDLED } from './listHandler';
import {
  formContextSchema,
  formLayerSchema,
  formReceiptSchema,
  formSaveSchema,
  type FormContext,
  type FormObservation,
} from './locationFormContract';
import { locationId } from './planLocationContract';
import { locationRpc, projectPlanLocations, savedLocationResponse } from './planLocations';
import { FamilyApiError, type FamilyFrontendRepository, type FamilySession } from './repository';
import type { FamilyRequest } from './transport';
import { createFormSessionCheck, visitCommandBody, visitCommandFailure } from './visitCommands';

function checkScope(observation: FormObservation, session: FamilySession, trip: string, id: string) {
  if (
    observation.user_id !== session.userId ||
    observation.family_id !== session.familyId ||
    observation.person_id !== session.personId ||
    observation.trip_id !== trip ||
    observation.location_id !== id
  )
    throw new FamilyApiError(
      409,
      'location_form_origin_scope',
      'The form belongs to another original Family session or location.'
    );
}
function validateContext(context: FormContext, trip: string, id: string, layer: string) {
  if (
    context.layer !== layer ||
    context.observation.layer !== layer ||
    context.location.id !== id ||
    context.published_location.id !== id ||
    context.location.trip_id !== trip ||
    context.published_location.trip_id !== trip ||
    context.location.deleted_at !== null ||
    context.published_location.deleted_at !== null ||
    context.observation.revision !== context.published_location.revision ||
    context.location.revision !== context.observation.revision
  )
    throw new FamilyApiError(502, 'invalid_location_form_context', 'The form service returned inconsistent records.');
}
export async function handleFamilyLocationForm(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const match = request.pathname.match(/^\/trips\/([^/]+)\/family\/plan-locations\/([^/]+)\/form$/);
  if (!match) return NOT_HANDLED;
  if (!['GET', 'POST'].includes(request.method))
    throw new FamilyApiError(405, 'location_form_method', 'Use GET or POST for observed location forms.');
  try {
    const session = await repo.session(),
      trip = await repo.tripUuid(match[1]),
      id = locationId.parse(match[2]),
      ids = (await repo.views()).ids;
    const fence = createFormSessionCheck(repo, session, ids, request.signal, 'stale_location_form_session');
    if (request.method === 'GET') {
      const query = z
        .object({ layer: formLayerSchema.default('published') })
        .strict()
        .parse(Object.fromEntries(request.query));
      return await readContext(trip, id, query.layer, { session, ids, fence });
    }
    const body = formSaveSchema.parse(visitCommandBody(request));
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 1048576)
      throw new FamilyApiError(400, 'location_form_too_large', 'The original form exceeds its bounded command size.');
    checkScope(body.observation, session, trip, id);
    await fence();
    const operation = savedLocationResponse(
      formReceiptSchema,
      await locationRpc('save_family_trip_location_form_v1', {
        p_trip_id: trip,
        p_location_id: id,
        p_operation_id: body.operation_id,
        p_observation: body.observation,
        p_form: body.form,
      })
    );
    if (
      operation.location_id !== id ||
      operation.state !== (body.observation.layer === 'published' ? 'published' : 'draft')
    )
      throw new FamilyApiError(
        502,
        'invalid_location_form_receipt',
        'The form command returned another target or publication state.'
      );
    await fence();
    if (operation.state === 'published' && operation.changed) repo.invalidate(trip);
    const context = await readContext(trip, id, body.observation.layer, { session, ids, fence });
    return { version: 1, operation, editor: context };
  } catch (error) {
    return visitCommandFailure(error);
  }
}
async function readContext(
  trip: string,
  id: string,
  layer: 'published' | 'myDraft',
  scope: { session: FamilySession; ids: FamilyIdentityRegistry; fence: () => Promise<void> }
) {
  const { session, ids, fence } = scope;
  const context = savedLocationResponse(
    formContextSchema,
    await locationRpc('get_family_trip_location_form_v1', {
      p_trip_id: trip,
      p_location_id: id,
      p_layer: layer,
    })
  );
  checkScope(context.observation, session, trip, id);
  validateContext(context, trip, id, layer);
  await fence();
  const [location] = await projectPlanLocations([context.location], ids, fence);
  await fence();
  return { ...context, native_place: location.native_place };
}
