import { captureWriteSession } from '../../sync/writeSession';
import { assertCreationUnarmed } from './creationIntentQueue';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import { NOT_HANDLED } from './listHandler';
import { locationRpc, savedLocationResponse } from './planLocations';
import { creationPacket, creationReceipt } from './plannerCreationContract';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';
import { visitCommandFailure } from './visitCommands';
/** Source-bound original intent; neither a queue packet nor a caller chooses a network target. */
export async function handleFamilyPlannerCreation(repo: FamilyFrontendRepository, r: FamilyRequest) {
  const m = r.pathname.match(/^\/trips\/([^/]+)\/family\/planner-create-command$/);
  if (!m) return NOT_HANDLED;
  if (r.method !== 'POST' || r.query.size)
    throw new FamilyApiError(405, 'planner_creation_method', 'Use a complete creation POST.');
  try {
    const p = creationPacket.parse(r.body),
      trip = await repo.tripUuid(m[1]),
      ids = (await repo.views()).ids;
    if (new TextEncoder().encode(JSON.stringify(p)).length > 180000)
      throw new FamilyApiError(400, 'creation_bound', 'Creation intent too large.');
    const fence = async () => {
      const s = await repo.session();
      if (r.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (
        p.source_url.replace(/\/$/, '') !== getSupabaseUrl().replace(/\/$/, '') ||
        p.scope.trip_id !== trip ||
        s.userId !== p.scope.user_id ||
        s.familyId !== p.scope.family_id ||
        s.personId !== p.scope.person_id ||
        (await repo.views()).ids !== ids
      )
        throw new FamilyApiError(
          409,
          'planner_creation_scope',
          'The original creation source or Family session changed.'
        );
    };
    await fence();
    const owner = captureWriteSession();
    await assertCreationUnarmed(owner, p);
    owner.assertCurrent();
    const operation = savedLocationResponse(
      creationReceipt,
      await locationRpc('create_family_native_plan_v1', {
        p_trip_id: trip,
        p_operation_id: p.operation_id,
        p_scope: p.scope,
        p_form: p.form,
      })
    );
    owner.assertCurrent();
    await fence();
    if (
      operation.state === 'published'
        ? !operation.location_id || !!p.form.day !== !!operation.visit_id
        : operation.location_id !== null || operation.visit_id !== null || !operation.operation.op_id
    )
      throw new FamilyApiError(502, 'planner_creation_response', 'Inconsistent creation result.');
    if ('id' in p.form.location && operation.state === 'published' && operation.location_id !== p.form.location.id)
      throw new FamilyApiError(502, 'planner_creation_location', 'The created visit references another location.');
    repo.invalidate(trip);
    return operation;
  } catch (e) {
    return visitCommandFailure(e);
  }
}
