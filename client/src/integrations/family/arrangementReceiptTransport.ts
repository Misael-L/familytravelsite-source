import { z } from 'zod';
import { creationJson } from './creationIntentQueue';
import { FamilyApiError } from './errors';
import { locationId } from './planLocationContract';
import { locationRpc } from './planLocations';
import { arrangementReceipt, observedOccurrence, type ArrangementPacket } from './plannerArrangementContract';

const acknowledgement = arrangementReceipt.strict().extend({
  operation: arrangementReceipt.shape.operation.unwrap().strict().nullable(),
  result: arrangementReceipt.shape.result
    .unwrap()
    .strict()
    .extend({
      rows: z.array(observedOccurrence.strict()).max(2001),
      removed: z.array(observedOccurrence.extend({ day_id: locationId }).strict()).max(2000),
    })
    .nullable(),
});
const outcome = z
  .object({
    version: z.literal(1),
    trip_id: locationId,
    operation_id: locationId,
    scope: z.unknown(),
    plan: z.unknown(),
    request_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(['unknown', 'committed']),
    result: z.unknown(),
  })
  .strict();
function invalid(): never {
  throw new FamilyApiError(
    502,
    'arrangement_receipt_invalid',
    'The service did not confirm this exact original arrangement. It remains retained.'
  );
}
export function checkArrangementAcknowledgement(raw: unknown, p: ArrangementPacket) {
  const parsed = acknowledgement.safeParse(raw);
  if (!parsed.success) invalid();
  const r = parsed.data;
  if (p.scope.layer === 'myDraft') {
    if (r.state === 'published' || r.result !== null || r.changed !== (r.operation !== null)) invalid();
    return r;
  }
  if (r.state !== 'published' || r.operation !== null || !r.result || r.changed !== r.result.changed) invalid();
  checkAffected(r.result, p);
  checkRemoved(r.result, p);
  return r;
}
type SavedArrangement = NonNullable<z.infer<typeof acknowledgement>['result']>;
function checkAffected(result: SavedArrangement, p: ArrangementPacket) {
  const rows = result.rows,
    originals = new Map(p.plan.days.flatMap((d) => d.observed.map((v) => [v.id, v.revision] as const)));
  if (p.plan.visit) originals.set(p.plan.visit.id, p.plan.visit.revision);
  if (
    rows.length !== originals.size ||
    new Set(rows.map((v) => v.id)).size !== rows.length ||
    rows.some((v) => !originals.has(v.id) || v.revision < (originals.get(v.id) ?? Infinity))
  )
    invalid();
  const anchor = p.plan.visit?.id ?? p.plan.days[0].observed[0]?.id ?? null;
  if (result.id !== anchor || result.revision !== (rows.find((v) => v.id === anchor)?.revision ?? null)) invalid();
}
function checkRemoved(result: SavedArrangement, p: ArrangementPacket) {
  const rows = result.rows;
  const removed = result.removed,
    expectedRemoved =
      p.plan.action === 'trash'
        ? [p.plan.visit?.id]
        : p.plan.action === 'clear'
          ? p.plan.days[0].observed.map((v) => v.id)
          : [];
  if (
    removed.length !== expectedRemoved.length ||
    new Set(removed.map((v) => v.id)).size !== removed.length ||
    removed.some(
      (v) =>
        !expectedRemoved.includes(v.id) ||
        rows.find((row) => row.id === v.id)?.revision !== v.revision ||
        !p.plan.days.some((d) => d.id === v.day_id && d.observed.some((row) => row.id === v.id))
    )
  )
    invalid();
}
function unavailable(error: unknown) {
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
    'arrangement_receipt_unavailable',
    'Could not check the original arrangement. It remains retained.'
  );
}
export async function readArrangementReceipt(p: ArrangementPacket, rpc = locationRpc) {
  let raw: unknown;
  try {
    raw = await rpc('get_family_native_arrangement_receipt_v1', {
      p_trip_id: p.scope.trip_id,
      p_operation_id: p.operation_id,
      p_scope: p.scope,
      p_plan: p.plan,
    });
  } catch (error) {
    throw unavailable(error);
  }
  if (new TextEncoder().encode(JSON.stringify(raw)).length > 2097152) invalid();
  const parsed = outcome.safeParse(raw);
  if (!parsed.success) invalid();
  const r = parsed.data;
  if (
    r.trip_id !== p.scope.trip_id ||
    r.operation_id !== p.operation_id ||
    creationJson(r.scope) !== creationJson(p.scope) ||
    creationJson(r.plan) !== creationJson(p.plan)
  )
    invalid();
  if (r.status === 'unknown') {
    if (r.result !== null) invalid();
    return { status: 'unknown' as const, result: null, request_sha256: r.request_sha256 };
  }
  return {
    status: 'committed' as const,
    result: checkArrangementAcknowledgement(r.result, p),
    request_sha256: r.request_sha256,
  };
}
