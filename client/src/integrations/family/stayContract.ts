import { z } from 'zod';
import { bookingDateState } from './bookingCalendarContract';
import { locationSchema } from './planLocationContract';
import { plannerBookingRecord } from './plannerBookingContract';
export const stayId = z.string().uuid();
const revision = z.number().int().positive().safe();
export const stayDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      v >= '0001-01-01' &&
      v <= '9999-12-31' &&
      Number.isFinite(Date.parse(v + 'T00:00:00Z')) &&
      new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v
  );
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const notes = z
  .string()
  .refine((v) => new TextEncoder().encode(v).length <= 20000)
  .nullable();
const timestamp = z.string().datetime({ offset: true });
const fields = {
  location_id: stayId,
  arrival_date: stayDate,
  departure_date: stayDate,
  check_in_time: clock.nullable(),
  check_in_window_end: clock.nullable(),
  check_out_time: clock.nullable(),
  check_in_window_end_day_offset: z.union([z.literal(0), z.literal(1)]),
  time_zone: z.string().min(1).max(255).nullable(),
  notes,
};
export const stayPatch = z.object(fields).partial().strict();
export const stayRow = z
  .object({
    id: stayId,
    trip_id: stayId,
    family_id: stayId,
    ...fields,
    created_by_person_id: stayId,
    created_at: timestamp,
    updated_at: timestamp,
    revision,
    deleted_at: timestamp.nullable(),
    deleted_by_person_id: stayId.nullable(),
  })
  .strict()
  .refine((r) => r.departure_date >= r.arrival_date && (r.deleted_at === null) === (r.deleted_by_person_id === null));
// Observation hashes cover the complete server JSON, including unknown nested location facts. Never strip them.
export const stayLocation = locationSchema
  .extend({
    source: locationSchema.shape.source.passthrough(),
    overrides: locationSchema.shape.overrides.passthrough(),
    category: locationSchema.shape.category.unwrap().passthrough().nullable(),
  })
  .passthrough();
const booking = z.object({ record: plannerBookingRecord, dates: bookingDateState }).strict();
export const stayProjection = z
  .object({
    stay: stayRow,
    location: stayLocation,
    arrival_day_id: stayId.nullable(),
    departure_day_id: stayId.nullable(),
    link: z.object({ reservation_id: stayId, stay_id: stayId, trip_id: stayId }).strict().nullable(),
    booking: booking.nullable(),
  })
  .strict()
  .refine(
    (p) =>
      p.location.id === p.stay.location_id &&
      p.location.trip_id === p.stay.trip_id &&
      (p.link === null) === (p.booking === null) &&
      (!p.link ||
        (p.link.stay_id === p.stay.id &&
          p.link.trip_id === p.stay.trip_id &&
          p.booking?.record.id === p.link.reservation_id &&
          p.booking.record.trip_id === p.stay.trip_id &&
          p.booking.dates.reservation_id === p.link.reservation_id &&
          p.booking.dates.trip_id === p.stay.trip_id &&
          p.booking.record.start_trip_day_id === p.booking.dates.start_day_id &&
          p.booking.record.end_trip_day_id === p.booking.dates.end_day_id))
  );
export const stayIdentity = z.object({ trip_id: stayId, family_id: stayId, user_id: stayId, person_id: stayId });
export const stayScope = stayIdentity
  .extend({ version: z.literal(1), layer: z.literal('published'), session_id: stayId })
  .strict();
export const stayObservation = z
  .object({
    trip_revision: revision,
    stay: stayProjection.nullable(),
    candidate_location: stayLocation.nullable(),
    candidate_booking: booking.nullable(),
  })
  .strict();
const capabilities = z.object({ read: z.literal(true), commands: z.literal(false) }).strict();
export const staySnapshot = stayIdentity
  .extend({
    version: z.literal(1),
    trip_revision: revision,
    completeness: z.literal('complete'),
    stays: z.array(stayProjection).max(2000),
    capabilities,
  })
  .strict();
export const stayEditor = stayIdentity
  .extend({
    version: z.literal(1),
    trip_revision: revision,
    state: z.enum(['active', 'trash']),
    observation: stayProjection,
    capabilities,
  })
  .strict();
export const stayContext = z
  .object({
    version: z.literal(1),
    scope: stayScope,
    state: z.enum(['absent', 'active', 'trash']),
    observation: stayObservation,
    admission: z.object({ save: z.boolean(), link: z.boolean(), trash: z.boolean(), restore: z.boolean() }).strict(),
    native_controls: z.literal(false),
  })
  .strict();
export const stayEnvelope = z
  .object({
    version: z.literal(1),
    source_url: z.string().url().max(2048),
    command: z
      .object({
        action: z.enum(['save', 'link', 'trash', 'restore']),
        stay_id: stayId,
        operation_id: stayId,
        scope: stayScope,
        observation: stayObservation,
        changes: stayPatch,
        reservation_id: stayId.nullable(),
      })
      .strict(),
  })
  .strict()
  .refine((p) => {
    const c = p.command,
      o = c.observation,
      t = c.scope.trip_id;
    return (
      (!o.stay ||
        (o.stay.stay.id === c.stay_id && o.stay.stay.trip_id === t && o.stay.stay.family_id === c.scope.family_id)) &&
      (!o.candidate_location || o.candidate_location.trip_id === t)
    );
  }, 'Stay/location identities must match the original scope.')
  .refine((p) => {
    const b = p.command.observation.candidate_booking,
      t = p.command.scope.trip_id;
    return !b || (b.record.trip_id === t && b.dates.trip_id === t && b.record.id === b.dates.reservation_id);
  }, 'Candidate booking identities must match.')
  .refine((p) => {
    const c = p.command;
    return (
      (c.action === 'save' || Object.keys(c.changes).length === 0) && (c.action === 'link' || c.reservation_id === null)
    );
  }, 'Unexpected action fields.')
  .refine((p) => {
    const c = p.command,
      o = c.observation;
    if (c.action === 'save')
      return (
        o.candidate_location?.id === (c.changes.location_id ?? o.stay?.stay.location_id) &&
        (!!o.stay || !!(c.changes.arrival_date && c.changes.departure_date))
      );
    return c.action !== 'link' || (o.candidate_booking?.record.id ?? null) === c.reservation_id;
  }, 'Exact observed lodging/booking selection required.');

export const stayAck = z
  .object({
    version: z.literal(1),
    state: z.literal('published'),
    acknowledgement: z.literal(true),
    read_current_required: z.literal(true),
    trip_id: stayId,
    stay_id: stayId,
    operation_id: stayId,
    action: z.enum(['create', 'edit', 'link', 'trash', 'restore']),
    changed: z.boolean(),
    stay_revision_after: revision,
    trip_revision_after: revision,
    event_sequence: revision,
    recorded_at: timestamp,
  })
  .strict();
export const stayOutcome = z
  .object({
    version: z.literal(1),
    trip_id: stayId,
    stay_id: stayId,
    operation_id: stayId,
    current_scope: stayScope,
    original_session_id: stayId,
    status: z.enum(['committed', 'cancelled', 'unknown']),
    acknowledgement: stayAck.nullable(),
    cancelled_at: timestamp.nullable(),
  })
  .strict()
  .refine(
    (p) =>
      (p.status === 'committed') === (p.acknowledgement !== null) &&
      (p.status === 'cancelled') === (p.cancelled_at !== null)
  );
export const stayHistory = z
  .object({
    version: z.literal(1),
    trip_id: stayId,
    stay_id: stayId,
    events: z
      .array(
        z
          .object({
            sequence: revision,
            operation_id: stayId,
            action: z.enum(['create', 'edit', 'link', 'trash', 'restore']),
            actor_person_id: stayId,
            recorded_at: timestamp,
            changed: z.boolean(),
            before: stayProjection.nullable(),
            after: stayProjection,
          })
          .strict()
      )
      .max(100),
    has_more: z.boolean(),
    next_before_sequence: revision.nullable(),
  })
  .strict();
export type StayEnvelope = z.infer<typeof stayEnvelope>;
export type StayIdentity = z.infer<typeof stayIdentity>;
export type StayAck = z.infer<typeof stayAck>;
export type StayOutcome = z.infer<typeof stayOutcome>;
export function stayJson(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}
