import { z } from 'zod';
import { bookingStayView, checkedBookingStayView, checkedNativeStayCore } from './bookingStayContract';
import { completeTripBindings } from './completeTripRelations';
import {
  canonicalTripJson,
  checkedCompleteTripData,
  COMPLETE_TRIP_LIMIT,
  completeTripDataV3Schema,
  completeTripEnvelopeBase,
  completeTripManifests,
  completeTripMediaManifest,
  completeTripRevisionVector,
  hashCompleteTrip,
  type CompleteTripData,
  type CompleteTripEnvelope,
  type CompleteTripOwnership,
} from './completeTripSnapshot';
import { FamilyIdentityRegistry } from './identity';
import { checkedCachedPlanner } from './plannerCache';
import type { PlannerScope } from './plannerViewContract';

const variants = z
  .array(
    z
      .object({
        mediaAssetId: z.string().uuid(),
        canonicalUrl: z.string().nullable(),
        thumbUrl: z.string().nullable(),
        heroUrl: z.string().nullable(),
        recipeVersion: z.string().nullable(),
      })
      .strict()
  )
  .max(10000);
const dataSchema = completeTripDataV3Schema
  .omit({ planner: true, booking: true })
  .extend({
    core: bookingStayView,
    native_stay_format: z.literal('family.native-stay-view.v1').optional(),
    variants,
  })
  .strict();
const schema = completeTripEnvelopeBase
  .extend({
    format: z.literal('family.offline-trip.v4'),
    producer: z.literal('family-web/complete-trip-v4'),
    data: dataSchema,
    capabilities: completeTripEnvelopeBase.shape.capabilities.extend({
      coldRead: z.literal(true),
      coherentStays: z.literal(true),
      nativeStays: z.literal(false),
    }),
    access: z
      .object({ policy: z.literal('recent-read-only-v1'), checkedAt: z.number().int().nonnegative().safe() })
      .strict(),
  })
  .strict();
export type CompleteTripV4Data = z.infer<typeof dataSchema>;
export type CompleteTripV4 = z.infer<typeof schema>;
export type StoredCompleteTrip = CompleteTripEnvelope | CompleteTripV4;
export type CompleteTripV4Expected = {
  source: string;
  scope: PlannerScope;
  ownership: CompleteTripOwnership;
  now: number;
};
export type CompleteTripV4Capture = Omit<CompleteTripV4Expected, 'now'> & {
  capturedAt: number;
  verifiedAt: number;
  data: unknown;
};

/** Derived compatibility views are temporary validation/projection inputs, never saved alongside the canonical core. */
export function deriveCompleteTripV4(data: CompleteTripV4Data): CompleteTripData {
  const { core, variants: media, native_stay_format: _native, ...ancillary } = data;
  const { version: _v, completeness: _c, planner: _p, stays: _s, capabilities: _a, ...booking } = core;
  return {
    ...ancillary,
    planner: checkedCachedPlanner({ view: core.planner, variants: media }, core.planner.scope),
    booking: {
      ...booking,
      version: 1,
      bookings: core.bookings.map(({ stay_link: _l, timing_state: _t, ...row }) => row),
    },
  };
}
async function checkedData(raw: unknown, scope: PlannerScope) {
  const data = dataSchema.parse(raw);
  if (canonicalTripJson(data) !== canonicalTripJson(raw)) throw new Error('Lossy complete Trip v4 data');
  if (data.native_stay_format) checkedNativeStayCore(data.core, scope);
  else checkedBookingStayView(data.core, scope);
  const derived = deriveCompleteTripV4(data);
  const validated = await checkedCompleteTripData(derived, scope, 'family.offline-trip.v3');
  if (canonicalTripJson(validated) !== canonicalTripJson(derived)) throw new Error('Lossy complete Trip v4 projection');
  return { data, derived: validated };
}
function bindings(data: CompleteTripV4Data, derived: CompleteTripData) {
  const ids = new FamilyIdentityRegistry(data.core.user_id);
  for (const b of completeTripBindings(derived, 'family.offline-trip.v3')) ids.register(b.kind, b.uuid);
  for (const s of data.core.stays) ids.register('stay', s.stay.id);
  for (const b of data.core.bookings) if (b.stay_link) ids.register('stay', b.stay_link.id);
  return ids.bindings();
}
function revisions(data: CompleteTripV4Data, derived: CompleteTripData) {
  const old = completeTripRevisionVector(derived, 'family.offline-trip.v3');
  return {
    version: 4,
    consistency: { core: 'single-MVCC-published-planner-booking-stay', ancillary: 'independent-validated-reads' },
    core: {
      trip: data.core.trip_revision,
      stays: data.core.stays.map((s) => [s.stay.id, s.stay.revision]),
      links: data.core.bookings.map((b) => [b.record.id, b.stay_link]),
      ...(data.native_stay_format
        ? {
            arrivals: data.core.planner.state.visits
              .filter((v) => v.owning_stay_id)
              .map((v) => [v.id, v.revision, v.owning_stay_id]),
          }
        : {}),
    },
    ancillary: {
      tasks: old.tasks,
      packing: old.packing,
      unversioned: old.unversioned,
      packingCategoriesV2: 'packingCategoriesV2' in old ? old.packingCategoriesV2 : null,
    },
  };
}
function bound(raw: unknown) {
  const json = typeof raw === 'string' ? raw : canonicalTripJson(raw);
  if (new TextEncoder().encode(json).byteLength > COMPLETE_TRIP_LIMIT) throw new Error('Oversized complete Trip v4');
  return JSON.parse(json) as unknown;
}
function checkOwnership(e: CompleteTripV4, x: CompleteTripV4Expected) {
  const s = x.scope;
  if (
    !Number.isFinite(x.now) ||
    s.layer !== 'published' ||
    e.source !== x.source ||
    e.ownership.key !== JSON.stringify([1, x.source, s.user_id, s.family_id, s.person_id, s.trip_id, s.layer]) ||
    e.ownership.ownerKey !== JSON.stringify([1, x.source, s.user_id, s.family_id, s.person_id]) ||
    canonicalTripJson(e.scope) !== canonicalTripJson(s) ||
    canonicalTripJson(e.ownership) !== canonicalTripJson(x.ownership) ||
    e.capturedAt > x.now ||
    e.verifiedAt < e.capturedAt ||
    e.verifiedAt > x.now ||
    e.expiresAt !== e.capturedAt + 900000 ||
    x.now > e.expiresAt ||
    e.access.checkedAt !== e.verifiedAt
  )
    throw new Error('Stale or inconsistent complete Trip v4 ownership');
}
export async function serializeCompleteTripV4(c: CompleteTripV4Capture): Promise<CompleteTripV4> {
  bound(c);
  const { data, derived } = await checkedData(c.data, c.scope);
  const body = {
    format: 'family.offline-trip.v4' as const,
    producer: 'family-web/complete-trip-v4' as const,
    generation: crypto.randomUUID(),
    source: c.source,
    scope: c.scope,
    ownership: c.ownership,
    capturedAt: c.capturedAt,
    verifiedAt: c.verifiedAt,
    expiresAt: c.capturedAt + 900000,
    capabilities: {
      coldRead: true as const,
      writes: false as const,
      tags: false as const,
      mediaBytes: false as const,
      coherentStays: true as const,
      nativeStays: false as const,
    },
    access: { policy: 'recent-read-only-v1' as const, checkedAt: c.verifiedAt },
    data,
    bindings: bindings(data, derived),
    revisions: revisions(data, derived),
    manifests: await completeTripManifests(data),
    media: completeTripMediaManifest(derived),
  };
  return parseCompleteTripV4({ ...body, digest: (await hashCompleteTrip(body)).sha256 }, { ...c, now: c.verifiedAt });
}
export async function parseCompleteTripV4(raw: unknown, expected: CompleteTripV4Expected): Promise<CompleteTripV4> {
  const input = bound(raw),
    e = schema.parse(input);
  if (canonicalTripJson(e) !== canonicalTripJson(input)) throw new Error('Lossy complete Trip v4 envelope');
  checkOwnership(e, expected);
  const { digest, ...body } = e;
  if (digest !== (await hashCompleteTrip(body)).sha256) throw new Error('Invalid complete Trip v4 digest');
  const { data, derived } = await checkedData(e.data, expected.scope);
  for (const [actual, wanted] of [
    [e.bindings, bindings(data, derived)],
    [e.revisions, revisions(data, derived)],
    [e.manifests, await completeTripManifests(data)],
    [e.media, completeTripMediaManifest(derived)],
  ])
    if (canonicalTripJson(actual) !== canonicalTripJson(wanted)) throw new Error('Invalid complete Trip v4 manifest');
  return e;
}
