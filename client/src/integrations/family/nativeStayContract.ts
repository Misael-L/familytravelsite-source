import { z } from 'zod';
import { FamilyApiError } from './errors';
import { stayBundleCommand } from './stayBundleContract';
import { stayDate, stayEnvelope, stayId, stayJson, stayScope } from './stayContract';
const revision = z.number().int().positive().safe();
const stamp = z.string().datetime({ offset: true });
const dayVisit = z
  .object({
    id: stayId,
    revision,
    order: z.number().int().safe(),
    location_id: stayId.nullable(),
    timing_kind: z.enum(['timed', 'untimed']),
    starts_at: z.string().nullable(),
    time_zone: z.string().nullable(),
    owning_stay_id: stayId.nullable(),
  })
  .strict();
// Complete raw schedule row: retain all observed server facts, including future columns.
const ownedVisit = z
  .object({
    id: stayId,
    trip_id: stayId,
    plan_location_id: stayId,
    trip_day_id: stayId,
    timing_kind: z.literal('untimed'),
    starts_at: z.null(),
    ends_at: z.null(),
    time_zone: z.null(),
    owning_stay_id: stayId,
    deleted_at: stamp.nullable(),
  })
  .passthrough();
export const nativeStayInner = z.union([stayBundleCommand, stayEnvelope.shape.command]);
const nativeStayCommandShape = z
  .object({
    format: z.literal('family.native-stay.v1'),
    operation_id: stayId,
    scope: stayScope,
    stay_id: stayId,
    inner: nativeStayInner,
    arrival_visit_id: stayId,
    keep_stop: z.boolean(),
    observation: z
      .object({
        trip_revision: revision,
        day_id: stayId,
        location_id: stayId,
        owned_visit: ownedVisit.nullable(),
        day_visits: z.array(dayVisit).max(10000),
      })
      .strict(),
  })
  .strict();
function validNativeSelection(c: z.infer<typeof nativeStayCommandShape>) {
  const i = c.inner,
    o = c.observation;
  if ('format' in i)
    return (
      !c.keep_stop &&
      c.arrival_visit_id !== i.reservation_id &&
      o.owned_visit === null &&
      o.location_id === i.stay.location_id &&
      o.day_id === i.observation.arrival_day.id
    );
  return (
    i.action !== 'link' &&
    !!i.observation.stay &&
    i.observation.candidate_booking === null &&
    i.reservation_id === null &&
    (i.action === 'trash' || !c.keep_stop) &&
    o.location_id === (i.changes.location_id ?? i.observation.stay.stay.location_id)
  );
}
export const nativeStayCommand = nativeStayCommandShape.superRefine((c, ctx) => {
  const i = c.inner,
    o = c.observation;
  const invalid = () =>
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Exact original native stay identities and observations required.',
    });
  if (
    c.operation_id !== i.operation_id ||
    c.stay_id !== i.stay_id ||
    stayJson(c.scope) !== stayJson(i.scope) ||
    o.trip_revision !== i.observation.trip_revision ||
    new Set([c.operation_id, c.stay_id, c.arrival_visit_id]).size !== 3
  )
    invalid();
  if (new Set(o.day_visits.map((v) => v.id)).size !== o.day_visits.length) invalid();
  if (!validNativeSelection(c)) invalid();
  if (o.owned_visit && (o.owned_visit.trip_id !== c.scope.trip_id || o.owned_visit.owning_stay_id !== c.stay_id))
    invalid();
});
export const nativeStayEnvelope = z
  .object({
    version: z.literal(1),
    source_url: z
      .string()
      .url()
      .max(2048)
      .refine((v) => ['http:', 'https:'].includes(new URL(v).protocol)),
    command: nativeStayCommand,
  })
  .strict();
export const nativeStayContext = z
  .object({
    format: z.literal('family.native-stay-context.v1'),
    command: nativeStayCommand,
    native_controls: z.literal(false),
  })
  .strict();
export const nativeStayAck = z
  .object({
    format: z.literal('family.native-stay-ack.v1'),
    acknowledgement: z.literal(true),
    read_current_required: z.literal(true),
    trip_id: stayId,
    stay_id: stayId,
    operation_id: stayId,
    trip_revision_after: revision,
    arrival_visit_id: stayId.nullable(),
    action: z.enum(['create', 'save', 'trash', 'restore']),
  })
  .strict();
export const nativeStayOutcome = z
  .object({
    format: z.literal('family.native-stay-outcome.v1'),
    trip_id: stayId,
    stay_id: stayId,
    operation_id: stayId,
    current_scope: stayScope,
    original_session_id: stayId,
    status: z.enum(['unknown', 'committed', 'cancelled']),
    acknowledgement: nativeStayAck.nullable(),
    cancelled_at: stamp.nullable(),
  })
  .strict()
  .refine(
    (r) =>
      (r.status === 'committed') === (r.acknowledgement !== null) &&
      (r.status === 'cancelled') === (r.cancelled_at !== null)
  );
export const stayTrashCursor = z.object({ deleted_at: stamp, id: stayId }).strict();
export const nativeStayTrash = z
  .object({
    format: z.literal('family.stay-trash.v1'),
    trip_id: stayId,
    items: z
      .array(
        z
          .object({
            id: stayId,
            revision,
            arrival_date: stayDate,
            departure_date: stayDate,
            deleted_at: stamp,
            name: z.string(),
            restore_available: z.boolean(),
          })
          .strict()
      )
      .max(50),
    has_more: z.boolean(),
    next_cursor: stayTrashCursor.nullable(),
  })
  .strict();
export type NativeStayEnvelope = z.infer<typeof nativeStayEnvelope>;
export type NativeStayAck = z.infer<typeof nativeStayAck>;
export function strictStayJsonBytes(raw: unknown): number {
  const json = JSON.stringify(raw, (_k, value: unknown) => {
    if (
      value === undefined ||
      typeof value === 'function' ||
      typeof value === 'symbol' ||
      typeof value === 'bigint' ||
      (typeof value === 'number' && !Number.isFinite(value))
    )
      throw new Error('Complete JSON facts required');
    return value;
  });
  if (typeof json !== 'string') throw new Error('Complete JSON facts required');
  return new TextEncoder().encode(json).length;
}
export function originalNativeStayIntent(raw: unknown): NativeStayEnvelope {
  try {
    if (strictStayJsonBytes(raw) > 2101248) throw new Error('Native envelope exceeds bound');
    const p = nativeStayEnvelope.parse(raw);
    if (
      stayJson(raw) !== stayJson(p) ||
      strictStayJsonBytes(p.command) > 2097152 ||
      strictStayJsonBytes(p.command.inner) > 1048576
    )
      throw new Error('Bounded lossless original required');
    // Reuse all existing inner relationship checks without allocating or changing any observed fact.
    if (!('format' in p.command.inner))
      stayEnvelope.parse({ version: 1, source_url: p.source_url, command: p.command.inner });
    return structuredClone(p);
  } catch {
    throw new FamilyApiError(
      400,
      'native_stay_request',
      'A complete bounded original native stay command is required.'
    );
  }
}
