import { z } from 'zod';
import { creationJson } from './creationIntentQueue';
import { FamilyApiError } from './errors';
import { locationId } from './planLocationContract';
import { locationRpc } from './planLocations';
import { creationReceipt, creationScope, type CreationPacket } from './plannerCreationContract';
const fields = { version: z.literal(1), trip_id: locationId, operation_id: locationId, scope: creationScope };
const outcome = z.discriminatedUnion('status', [
  z.object({ ...fields, status: z.literal('unknown'), result: z.null() }).strict(),
  z.object({ ...fields, status: z.literal('committed'), result: creationReceipt }).strict(),
]);
function invalid(): never {
  throw new FamilyApiError(
    502,
    'creation_receipt_invalid',
    'The place service did not confirm this original save. It remains retained.'
  );
}
export function checkCreationAcknowledgement(raw: unknown, p: CreationPacket) {
  if (new TextEncoder().encode(JSON.stringify(raw)).length > 1048576) invalid();
  const parsed = creationReceipt.safeParse(raw);
  if (!parsed.success) invalid();
  const r = parsed.data;
  if (p.scope.layer === 'published') {
    if (r.state !== 'published' || !r.location_id || !!p.form.day !== !!r.visit_id) invalid();
    if (r.operation.id !== (r.visit_id ?? r.location_id)) invalid();
    if ('id' in p.form.location && r.location_id !== p.form.location.id) invalid();
  } else if (r.state === 'published' || r.location_id !== null || r.visit_id !== null || !r.operation.op_id) invalid();
  return r;
}
export async function readCreationReceipt(p: CreationPacket, rpc = locationRpc) {
  let raw: unknown;
  try {
    raw = await rpc('get_family_native_plan_receipt_v1', {
      p_trip_id: p.scope.trip_id,
      p_operation_id: p.operation_id,
      p_scope: p.scope,
      p_form: p.form,
    });
  } catch (error) {
    if (error instanceof FamilyApiError) throw error;
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code === '42501')
      throw new FamilyApiError(
        403,
        'creation_recovery_denied',
        'Place recovery is not authorized. The original remains retained.'
      );
    if (['PT409', '40001'].includes(code))
      throw new FamilyApiError(
        409,
        'creation_recovery_conflict',
        'The original save conflicts with the current record. It remains retained.'
      );
    if (['PGRST301', 'PGRST302', 'PGRST303'].includes(code))
      throw new FamilyApiError(401, 'creation_recovery_login', 'Sign in again to check the original place save.');
    throw new FamilyApiError(
      503,
      'creation_recovery_unavailable',
      'Could not check this place save. The original remains retained.'
    );
  }
  if (new TextEncoder().encode(JSON.stringify(raw)).length > 1048576) invalid();
  const parsed = outcome.safeParse(raw);
  if (!parsed.success) invalid();
  const r = parsed.data;
  if (
    r.trip_id !== p.scope.trip_id ||
    r.operation_id !== p.operation_id ||
    creationJson(r.scope) !== creationJson(p.scope)
  )
    invalid();
  if (r.status === 'committed') checkCreationAcknowledgement(r.result, p);
  return r;
}
