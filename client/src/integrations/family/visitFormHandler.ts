import { z } from 'zod';
import type { Assignment } from '../../types';
import { NOT_HANDLED } from './listHandler';
import { locationId } from './planLocationContract';
import { locationRpc, projectPlanLocations, savedLocationResponse } from './planLocations';
import { FamilyApiError, type FamilyFrontendRepository, type FamilySession } from './repository';
import type { FamilyRequest } from './transport';
import { createFormSessionCheck, visitCommandBody, visitCommandFailure } from './visitCommands';
import {
  visitFormContextSchema,
  visitFormReceiptSchema,
  visitFormSaveSchema,
  type VisitFormContext,
  type VisitFormObservation,
} from './visitFormContract';

function checkScope(o: VisitFormObservation, session: FamilySession, trip: string, visit: string) {
  if (
    o.location.trip_id !== trip ||
    o.visit_id !== visit ||
    o.location.user_id !== session.userId ||
    o.location.family_id !== session.familyId ||
    o.location.person_id !== session.personId
  )
    throw new FamilyApiError(409, 'visit_form_origin_scope', 'Reload this form in its original Family session.');
}
function validateContext(c: VisitFormContext, trip: string, visit: string, layer: string) {
  const o = c.observation;
  if (
    c.layer !== layer ||
    o.layer !== layer ||
    o.location.layer !== 'published' ||
    c.location.id !== c.published_location.id ||
    c.location.id !== o.location.location_id ||
    c.location.trip_id !== trip ||
    c.published_location.trip_id !== trip ||
    c.location.deleted_at !== null ||
    c.published_location.deleted_at !== null ||
    c.location.revision !== o.location.revision ||
    c.published_location.revision !== o.location.revision ||
    [c.visit, c.published_visit, o.shown_visit, o.published_visit].some(
      (v) =>
        v.id !== visit ||
        v.trip_id !== trip ||
        v.plan_location_id !== c.location.id ||
        v.revision !== o.visit_revision ||
        v.trip_day_id !== c.visit.trip_day_id ||
        v.location?.id !== c.location.id ||
        v.location?.trip_id !== trip ||
        v.location?.deleted_at !== null
    )
  )
    throw new FamilyApiError(
      502,
      'invalid_visit_form_context',
      'The editor service returned inconsistent relationships.'
    );
}

/** Explicit opt-in form seam; normal native planner routes remain unchanged. */
export async function handleFamilyVisitForm(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const match = request.pathname.match(/^\/trips\/([^/]+)\/family\/visits\/([^/]+)\/form$/);
  if (!match) return NOT_HANDLED;
  try {
    if (!['GET', 'POST'].includes(request.method))
      throw new FamilyApiError(405, 'visit_form_method', 'Use GET or POST for selected-visit forms.');
    const session = await repo.session(),
      trip = await repo.tripUuid(match[1]),
      visit = locationId.parse(match[2]),
      ids = (await repo.views()).ids;
    const fence = createFormSessionCheck(repo, session, ids, request.signal, 'stale_visit_form_session');
    const read = async (layer: 'published' | 'myDraft') => {
      const c = savedLocationResponse(
        visitFormContextSchema,
        await locationRpc('get_family_trip_visit_form_v1', { p_trip_id: trip, p_visit_id: visit, p_layer: layer })
      );
      checkScope(c.observation, session, trip, visit);
      validateContext(c, trip, visit, layer);
      await fence();
      const [location] = await projectPlanLocations([c.location], ids, fence);
      await fence();
      const start = c.visit.timing_kind === 'timed' ? (c.visit.start_local?.slice(11, 16) ?? null) : null;
      const end = c.visit.timing_kind === 'timed' ? (c.visit.end_local?.slice(11, 16) ?? null) : null;
      const assignment: Assignment = {
        id: ids.register('assignment', visit),
        day_id: ids.register('day', c.visit.trip_day_id),
        place_id: location.native_place.id,
        order_index: c.visit.sort_order,
        notes: c.visit.explanations,
        assignment_time: start,
        assignment_end_time: end,
        place: { ...location.native_place, place_time: start, end_time: end },
      };
      return { ...c, native_place: location.native_place, native_assignment: assignment };
    };
    if (request.method === 'GET') {
      const query = z
        .object({ layer: z.enum(['published', 'myDraft']).default('published') })
        .strict()
        .parse(Object.fromEntries(request.query));
      return await read(query.layer);
    }
    const body = visitFormSaveSchema.parse(visitCommandBody(request));
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 1048576)
      throw new FamilyApiError(400, 'visit_form_too_large', 'This original form exceeds its bounded size.');
    checkScope(body.observation, session, trip, visit);
    await fence();
    const operation = savedLocationResponse(
      visitFormReceiptSchema,
      await locationRpc('save_family_trip_visit_form_v1', {
        p_trip_id: trip,
        p_visit_id: visit,
        p_operation_id: body.operation_id,
        p_observation: body.observation,
        p_form: body.form,
      })
    );
    if (
      operation.visit_id !== visit ||
      operation.location_id !== body.observation.location.location_id ||
      operation.state !== (body.observation.layer === 'published' ? 'published' : 'draft')
    )
      throw new FamilyApiError(
        502,
        'invalid_visit_form_receipt',
        'The operation returned a different target or publication state.'
      );
    await fence();
    if (operation.state === 'published' && operation.changed) repo.invalidate(trip);
    return { version: 1, operation, editor: await read(body.observation.layer) };
  } catch (error) {
    return visitCommandFailure(error);
  }
}
