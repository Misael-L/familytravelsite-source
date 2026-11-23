import { captureWriteSession } from '../../sync/writeSession';
import { assertArrangementAvailable } from './arrangementIntentQueue';
import { checkArrangementAcknowledgement } from './arrangementReceiptTransport';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import { NOT_HANDLED } from './listHandler';
import { locationRpc } from './planLocations';
import { arrangementPacket } from './plannerArrangementContract';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';
import { visitCommandBody, visitCommandFailure } from './visitCommands';
export async function handleFamilyPlannerArrangement(repo: FamilyFrontendRepository, r: FamilyRequest) {
  const m = r.pathname.match(/^\/trips\/([^/]+)\/family\/planner-arrange-command$/);
  if (!m) return NOT_HANDLED;
  if (r.method !== 'POST' || r.query.size)
    throw new FamilyApiError(405, 'arrangement_method', 'Use a complete arrangement POST.');
  try {
    const p = arrangementPacket.parse(visitCommandBody(r)),
      trip = await repo.tripUuid(m[1]),
      ids = (await repo.views()).ids,
      owner = captureWriteSession();
    if (new TextEncoder().encode(JSON.stringify(p)).length > 180000)
      throw new FamilyApiError(400, 'arrangement_bound', 'Arrangement exceeds its bound.');
    const fence = async () => {
      owner.assertCurrent();
      const s = await repo.session();
      if (r.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (
        p.source_url.replace(/\/$/, '') !== getSupabaseUrl().replace(/\/$/, '') ||
        p.scope.trip_id !== trip ||
        p.scope.layer !== repo.getLayer(trip) ||
        p.scope.user_id !== s.userId ||
        p.scope.family_id !== s.familyId ||
        p.scope.person_id !== s.personId ||
        (await repo.views()).ids !== ids
      )
        throw new FamilyApiError(409, 'arrangement_origin', 'Original arrangement source or Family session changed.');
    };
    await fence();
    await assertArrangementAvailable(owner, p, ids.register('trip', trip));
    owner.assertCurrent();
    const raw = await locationRpc('arrange_family_native_visits_v1', {
      p_trip_id: trip,
      p_operation_id: p.operation_id,
      p_scope: p.scope,
      p_plan: p.plan,
    });
    await fence();
    const result = checkArrangementAcknowledgement(raw, p);
    repo.invalidate(trip);
    return result;
  } catch (error) {
    return visitCommandFailure(error);
  }
}
