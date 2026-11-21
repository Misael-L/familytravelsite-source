import { captureWriteSession } from '../../sync/writeSession';
import { assertEditorAvailable } from './editorIntentQueue';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import { NOT_HANDLED } from './listHandler';
import { handleFamilyLocationForm } from './locationFormHandler';
import { editorPacket, editorScope } from './plannerEditorContract';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';
import { handleFamilyVisitForm } from './visitFormHandler';
/** Replays the original observed request against its original configured API. No packet chooses a network target. */
export async function handleFamilyPlannerEditorCommand(repo: FamilyFrontendRepository, r: FamilyRequest) {
  const m = r.pathname.match(/^\/trips\/([^/]+)\/family\/planner-editor-command$/);
  if (!m) return NOT_HANDLED;
  if (r.method !== 'POST' || r.query.size)
    throw new FamilyApiError(405, 'planner_command_method', 'Use a complete POST editor command.');
  const p = editorPacket.safeParse(r.body);
  if (!p.success) throw new FamilyApiError(400, 'planner_command_contract', 'Invalid original editor command.');
  const body = p.data;
  if (body.source_url.replace(/\/$/, '') !== getSupabaseUrl().replace(/\/$/, ''))
    throw new FamilyApiError(
      409,
      'planner_command_source',
      'This editor command belongs to another API source. It remains parked.'
    );
  if (body.operation_id !== body.request.operation_id)
    throw new FamilyApiError(409, 'planner_command_operation', 'The original operation identity changed.');
  const scope = editorScope(body),
    trip = await repo.tripUuid(m[1]);
  if (scope.trip_id !== trip || scope.layer !== repo.getLayer(trip))
    throw new FamilyApiError(409, 'planner_command_scope', 'Original edit Trip or layer changed. It remains retained.');
  const owner = captureWriteSession(),
    native = (await repo.views()).ids.register('trip', trip);
  await assertEditorAvailable(owner, body, native);
  owner.assertCurrent();
  const path =
    body.kind === 'visit'
      ? `/trips/${m[1]}/family/visits/${body.target_id}/form`
      : `/trips/${m[1]}/family/plan-locations/${body.target_id}/form`;
  const request = { ...r, pathname: path, body: body.request };
  return body.kind === 'visit' ? handleFamilyVisitForm(repo, request) : handleFamilyLocationForm(repo, request);
}
