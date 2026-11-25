import { z } from 'zod';
import { creationJson } from './creationIntentQueue';
import { FamilyApiError } from './errors';
import { formReceiptSchema } from './locationFormContract';
import { locationId } from './planLocationContract';
import { locationRpc } from './planLocations';
import { editorScope, type EditorPacket } from './plannerEditorContract';
import { visitFormReceiptSchema } from './visitFormContract';
const outcome = z
  .object({
    version: z.literal(1),
    kind: z.enum(['location', 'visit']),
    trip_id: locationId,
    target_id: locationId,
    operation_id: locationId,
    observation: z.unknown(),
    form: z.unknown(),
    request_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(['unknown', 'committed']),
    result: z.unknown(),
  })
  .strict();
function invalid(): never {
  throw new FamilyApiError(
    502,
    'editor_receipt_invalid',
    'The edit service did not confirm this exact original. It remains retained.'
  );
}
export function checkEditorAcknowledgement(raw: unknown, p: EditorPacket) {
  const result = (p.kind === 'location' ? formReceiptSchema.strict() : visitFormReceiptSchema.strict()).safeParse(raw);
  if (!result.success) invalid();
  const r = result.data,
    o = editorScope(p);
  if (r.location_id !== o.location_id || r.state !== (o.layer === 'published' ? 'published' : 'draft')) invalid();
  if (p.kind === 'location') {
    if (!('revision' in r) || r.revision < p.request.observation.revision) invalid();
  } else if (
    !('visit_id' in r) ||
    r.visit_id !== p.target_id ||
    r.visit_revision < p.request.observation.visit_revision ||
    r.location_revision < o.revision
  )
    invalid();
  return r;
}
function receiptFailure(error: unknown) {
  if (error instanceof FamilyApiError) return error;
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  return new FamilyApiError(
    code === '42501'
      ? 403
      : ['PT409', '40001'].includes(code)
        ? 409
        : ['PGRST301', 'PGRST302', 'PGRST303'].includes(code)
          ? 401
          : 503,
    'editor_receipt_unavailable',
    'Could not check the original edit. It remains retained.'
  );
}
export async function readEditorReceipt(p: EditorPacket, rpc = locationRpc) {
  const s = editorScope(p);
  let raw: unknown;
  try {
    raw = await rpc(`get_family_trip_${p.kind}_form_receipt_v1`, {
      p_trip_id: s.trip_id,
      [p.kind === 'location' ? 'p_location_id' : 'p_visit_id']: p.target_id,
      p_operation_id: p.operation_id,
      p_observation: p.request.observation,
      p_form: p.request.form,
    });
  } catch (error) {
    throw receiptFailure(error);
  }
  if (new TextEncoder().encode(JSON.stringify(raw)).length > 2097152) invalid();
  const parsed = outcome.safeParse(raw);
  if (!parsed.success) invalid();
  const r = parsed.data;
  if (
    r.kind !== p.kind ||
    r.trip_id !== s.trip_id ||
    r.target_id !== p.target_id ||
    r.operation_id !== p.operation_id ||
    creationJson(r.observation) !== creationJson(p.request.observation) ||
    creationJson(r.form) !== creationJson(p.request.form)
  )
    invalid();
  if (r.status === 'unknown') {
    if (r.result !== null) invalid();
    return { status: 'unknown' as const, result: null, request_sha256: r.request_sha256 };
  }
  return {
    status: 'committed' as const,
    result: checkEditorAcknowledgement(r.result, p),
    request_sha256: r.request_sha256,
  };
}
