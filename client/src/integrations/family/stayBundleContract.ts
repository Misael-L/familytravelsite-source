import { z } from 'zod';
import { FamilyApiError } from './errors';
import { stayDate, stayId, stayLocation, stayPatch, stayScope } from './stayContract';

const revision = z.number().int().positive().safe();
const text = (bytes: number, min = 0) =>
  z
    .string()
    .min(min)
    .refine((v) => new TextEncoder().encode(v).length <= bytes);
const day = z
  .object({
    id: stayId,
    revision,
    civil_day: stayDate,
    day_index: z.number().int().nonnegative().safe(),
    title: z.string().nullable(),
  })
  .strict();
export const stayBundleObservation = z
  .object({
    trip_revision: revision,
    candidate_location: stayLocation,
    arrival_day: day,
    departure_day: day,
    stay_absent: z.literal(true),
    reservation_absent: z.literal(true),
  })
  .strict();
export const stayBundleContext = z
  .object({
    format: z.literal('family.stay-bundle-context.v1'),
    scope: stayScope,
    observation: stayBundleObservation,
    admission: z.object({ create: z.boolean() }).strict(),
    native_controls: z.literal(false),
  })
  .strict();
const stay = stayPatch.extend({
  location_id: stayId,
  arrival_date: stayDate,
  departure_date: stayDate,
  // The server's named-zone catalog is authoritative; never invent a browser/server zone.
  time_zone: text(128, 1).nullable().optional(),
});
const reservation = z
  .object({
    title: text(1000).refine((v) => v.trim().length > 0),
    status: z.enum(['pending', 'confirmed']),
    confirmation_code: text(1024, 1).nullable().optional(),
    notes: text(20000).nullable().optional(),
    url: text(2048)
      .refine((v) => /^https?:\/\/[^\s/?#@]+(:[0-9]+)?([/?#][^\s]*)?$/i.test(v))
      .nullable()
      .optional(),
  })
  .strict();
export const stayBundleCommand = z
  .object({
    format: z.literal('family.stay-bundle.v1'),
    operation_id: stayId,
    scope: stayScope,
    stay_id: stayId,
    reservation_id: stayId,
    observation: stayBundleObservation,
    stay,
    reservation,
  })
  .strict()
  .superRefine((c, ctx) => {
    const o = c.observation,
      s = c.stay,
      location = o.candidate_location;
    const clock = (v: string) => (v.length === 5 ? v + ':00' : v);
    const offset = s.check_in_window_end_day_offset ?? 0;
    const validWindow =
      s.check_in_window_end == null
        ? offset === 0
        : s.check_in_time != null &&
          (offset === 0
            ? clock(s.check_in_window_end) >= clock(s.check_in_time)
            : clock(s.check_in_window_end) < clock(s.check_in_time));
    if (
      new Set([c.operation_id, c.stay_id, c.reservation_id]).size !== 3 ||
      location.trip_id !== c.scope.trip_id ||
      location.id !== s.location_id ||
      location.deleted_at !== null ||
      location.source_archived ||
      !['hotel', 'manual'].includes(location.source.kind) ||
      (location.source.kind === 'manual' && (location.source.id !== null || !location.name.trim())) ||
      (location.source.kind === 'hotel' && location.source.id === null) ||
      s.arrival_date !== o.arrival_day.civil_day ||
      s.departure_date !== o.departure_day.civil_day ||
      s.departure_date < s.arrival_date ||
      !validWindow
    )
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Exact original lodging, days and window required.' });
  });
export const stayBundleEnvelope = z
  .object({
    version: z.literal(1),
    source_url: z
      .string()
      .url()
      .max(2048)
      .refine((v) => ['http:', 'https:'].includes(new URL(v).protocol)),
    command: stayBundleCommand,
  })
  .strict();
export const stayBundleAck = z
  .object({
    format: z.literal('family.stay-bundle-ack.v1'),
    state: z.literal('published'),
    acknowledgement: z.literal(true),
    read_current_required: z.literal(true),
    changed: z.literal(true),
    trip_id: stayId,
    stay_id: stayId,
    reservation_id: stayId,
    operation_id: stayId,
    stay_revision_after: revision,
    trip_revision_after: revision,
    event_sequence: revision,
    recorded_at: z.string().datetime({ offset: true }),
  })
  .strict();
export const stayBundleOutcome = z
  .object({
    format: z.literal('family.stay-bundle-outcome.v1'),
    trip_id: stayId,
    stay_id: stayId,
    reservation_id: stayId,
    operation_id: stayId,
    current_scope: stayScope,
    original_session_id: stayId,
    status: z.enum(['unknown', 'committed', 'cancelled']),
    acknowledgement: stayBundleAck.nullable(),
    cancelled_at: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .refine(
    (r) =>
      (r.status === 'committed') === (r.acknowledgement !== null) &&
      (r.status === 'cancelled') === (r.cancelled_at !== null)
  );
export type StayBundleEnvelope = z.infer<typeof stayBundleEnvelope>;
export type StayBundleContext = z.infer<typeof stayBundleContext>;
export type StayBundleAck = z.infer<typeof stayBundleAck>;
export type StayBundleOutcome = z.infer<typeof stayBundleOutcome>;

function jsonBytes(raw: unknown) {
  const json = JSON.stringify(raw, (_key, value: unknown) => {
    if (
      value === undefined ||
      typeof value === 'function' ||
      typeof value === 'symbol' ||
      typeof value === 'bigint' ||
      (typeof value === 'number' && !Number.isFinite(value))
    )
      throw new Error('JSON facts required');
    return value;
  });
  if (typeof json !== 'string') throw new Error('JSON facts required');
  return new TextEncoder().encode(json).length;
}
export function originalStayBundle(raw: unknown): StayBundleEnvelope {
  try {
    if (jsonBytes(raw) > 1052672) throw new Error('Envelope exceeds bound');
    const p = stayBundleEnvelope.parse(raw);
    if (jsonBytes(p.command) > 1048576) throw new Error('Command exceeds1MiB');
    return structuredClone(p);
  } catch {
    throw new FamilyApiError(400, 'stay_bundle_request', 'A complete bounded original stay bundle is required.');
  }
}
/** Build once before retention. Recovery never normalizes or reallocates an original intent. */
export function prepareStayBundleIntent(input: {
  source_url: string;
  context: StayBundleContext;
  operation_id: string;
  stay_id: string;
  reservation_id: string;
  stay: z.input<typeof stay>;
  reservation: z.input<typeof reservation>;
}): StayBundleEnvelope {
  const c = stayBundleContext.parse(input.context);
  if (!c.admission.create)
    throw new FamilyApiError(403, 'stay_bundle_denied', 'Direct stay and booking authority is required.');
  const omitUndefined = (value: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
  const booking = omitUndefined(input.reservation);
  if (booking.confirmation_code === '') booking.confirmation_code = null;
  return originalStayBundle({
    version: 1,
    source_url: input.source_url,
    command: {
      format: 'family.stay-bundle.v1',
      operation_id: input.operation_id,
      scope: c.scope,
      stay_id: input.stay_id,
      reservation_id: input.reservation_id,
      observation: c.observation,
      stay: omitUndefined(input.stay),
      reservation: booking,
    },
  });
}
