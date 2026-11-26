import { z } from 'zod';
import { completeTripCompanions, completeTripHeader } from './completeTripCompanions';
import { checkCompleteTripDates } from './completeTripDates';
import { checkCompleteTripRelations, completeTripBindings } from './completeTripRelations';
import { packingCategoryPacket } from './packingCategoryContract';
import { checkPackingCategoryPacket } from './packingCategoryTransport';
import { packingCategorySnapshotV2, type PackingCategorySnapshotV2 } from './packingCategoryV2Contract';
import { checkPackingCategorySnapshotV2 } from './packingCategoryV2Transport';
import { packingJson } from './packingCommandContract';
import { packingList } from './packingContract';
import { createPackingTransport } from './packingTransport';
import { plannerBookingView } from './plannerBookingContract';
import { assertBookingCalendar, validatePlannerBookingRows } from './plannerBookings';
import { checkedCachedPlanner } from './plannerCache';
import { plannerScope, type PlannerScope } from './plannerViewContract';
import { taskList } from './taskContract';
import { createTaskTransport } from './taskTransport';

export const COMPLETE_TRIP_LIMIT = 16777216;
const id = z.string().uuid(),
  counter = z.number().int().nonnegative().safe();
const ownership = z.object({ key: z.string(), ownerKey: z.string(), ownerGeneration: id, tripGeneration: id }).strict();
const dataSchema = z
  .object({
    header: completeTripHeader,
    planner: z.unknown(),
    tasks: taskList,
    packing: packingList,
    packing_categories: packingCategoryPacket.optional(),
    booking: plannerBookingView,
    companions: completeTripCompanions,
  })
  .strict();
export const completeTripDataV3Schema = dataSchema
  .omit({ packing_categories: true })
  .extend({ packing_categories_v2: packingCategorySnapshotV2 })
  .strict();
export type CompleteTripData = Omit<z.infer<typeof dataSchema>, 'planner'> & {
  planner: ReturnType<typeof checkedCachedPlanner>;
  packing_categories_v2?: PackingCategorySnapshotV2;
};
export const completeTripEnvelopeBase = z
  .object({
    format: z.literal('family.offline-trip.v1'),
    producer: z.literal('family-web/complete-trip-v1'),
    generation: id,
    source: z.string().url(),
    scope: plannerScope,
    ownership,
    capturedAt: counter,
    verifiedAt: counter,
    expiresAt: counter,
    capabilities: z
      .object({
        coldRead: z.literal(false),
        writes: z.literal(false),
        tags: z.literal(false),
        mediaBytes: z.literal(false),
      })
      .strict(),
    data: dataSchema,
    bindings: z
      .array(z.object({ kind: z.string(), uuid: id, key: z.number().int().positive().safe() }).strict())
      .max(100000),
    revisions: z.unknown(),
    manifests: z.record(z.string(), z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: counter }).strict()),
    media: z
      .array(
        z
          .object({ kind: z.enum(['variant', 'file']), id, reference: z.string(), bytesAvailable: z.literal(false) })
          .strict()
      )
      .max(30000),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const envelopeSchema = z.discriminatedUnion('format', [
  completeTripEnvelopeBase,
  completeTripEnvelopeBase.extend({
    format: z.literal('family.offline-trip.v2'),
    producer: z.literal('family-web/complete-trip-v2'),
    capabilities: completeTripEnvelopeBase.shape.capabilities.extend({ coldRead: z.literal(true) }),
    access: z.object({ policy: z.literal('recent-read-only-v1'), checkedAt: counter }).strict(),
  }),
  completeTripEnvelopeBase.extend({
    format: z.literal('family.offline-trip.v3'),
    producer: z.literal('family-web/complete-trip-v3'),
    data: completeTripDataV3Schema,
    capabilities: completeTripEnvelopeBase.shape.capabilities.extend({ coldRead: z.literal(true) }),
    access: z.object({ policy: z.literal('recent-read-only-v1'), checkedAt: counter }).strict(),
  }),
]);
type CheckedEnvelope<T> = T extends { data: unknown } ? Omit<T, 'data'> & { data: CompleteTripData } : never;
export type CompleteTripEnvelope = CheckedEnvelope<z.infer<typeof envelopeSchema>>;
export type CompleteTripOwnership = z.infer<typeof ownership>;
export type CompleteTripCapture = {
  source: string;
  scope: PlannerScope;
  ownership: CompleteTripOwnership;
  capturedAt: number;
  verifiedAt?: number;
  admitReadOnly?: boolean;
  /** Explicit opt-in to the coupled category-identity saved format; requires admitReadOnly === true. */
  packingFormat?: 'category-identity-v2';
  data: unknown;
};
/** Reject non-JSON and unsafe numeric values rather than silently changing saved canonical facts. */
export function canonicalTripJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalTripJson).join(',') + ']';
  if (typeof value !== 'object' || !value || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new Error('Trip snapshot is not JSON');
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonicalTripJson((value as Record<string, unknown>)[key]))
      .join(',') +
    '}'
  );
}
export async function hashCompleteTrip(value: unknown) {
  const bytes = new TextEncoder().encode(canonicalTripJson(value));
  return {
    bytes: bytes.byteLength,
    sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join(''),
  };
}
export async function checkedCompleteTripData(
  raw: unknown,
  scope: PlannerScope,
  format: CompleteTripEnvelope['format']
): Promise<CompleteTripData> {
  const parsed = format === 'family.offline-trip.v3' ? completeTripDataV3Schema.parse(raw) : dataSchema.parse(raw);
  const planner = checkedCachedPlanner(parsed.planner, scope);
  const tasks = await createTaskTransport(async () => parsed.tasks).list(scope);
  const packing = await createPackingTransport(async () => parsed.packing).list(scope);
  if ('packing_categories_v2' in parsed) {
    const categories = checkPackingCategorySnapshotV2(parsed.packing_categories_v2, scope);
    if (packingJson(categories.packing) !== packingJson(packing))
      throw new Error('Mixed packing/category v2 generation');
  } else if (parsed.packing_categories) {
    checkPackingCategoryPacket(parsed.packing_categories, scope);
    if (packingJson(parsed.packing_categories.packing) !== packingJson(packing))
      throw new Error('Mixed packing/category generation');
  }
  const booking = parsed.booking;
  if (
    scope.layer !== 'published' ||
    parsed.header.id !== scope.trip_id ||
    parsed.header.family_id !== scope.family_id ||
    tasks.scope.trip_lifecycle_revision !== packing.scope.trip_lifecycle_revision ||
    ['trip_id', 'family_id', 'user_id', 'person_id'].some((k) => booking[k as 'trip_id'] !== scope[k as 'trip_id'])
  )
    throw new Error('Complete Trip scope or lifecycle mismatch');
  validatePlannerBookingRows(booking);
  assertBookingCalendar(booking, planner.view.state);
  const data = { ...parsed, planner, tasks, packing };
  checkCompleteTripRelations(data);
  checkCompleteTripDates(data);
  return data;
}
function safeReference(value: string, variant = false) {
  const url = new URL(value);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.includes('/render/image/') ||
    url.pathname.includes('/object/sign/') ||
    (variant && !url.pathname.includes('/object/public/catalog/variants/v1/'))
  )
    throw new Error('Unsafe Trip media reference');
}
export function completeTripMediaManifest(data: CompleteTripData) {
  const result: CompleteTripEnvelope['media'] = [];
  if (data.header.cover_image) safeReference(data.header.cover_image);
  for (const row of data.planner.variants) {
    if (row.canonicalUrl) safeReference(row.canonicalUrl);
    for (const reference of [row.thumbUrl, row.heroUrl])
      if (reference) {
        safeReference(reference, true);
        if (row.recipeVersion !== 'v1') throw new Error('Unsupported variant recipe');
        result.push({ kind: 'variant', id: row.mediaAssetId, reference, bytesAvailable: false });
      }
  }
  for (const row of data.companions.files) {
    if (/^(?:\w+:|\/)|(?:^|\/)\.\.(?:\/|$)|[?#\\]/.test(row.storage_path)) throw new Error('Unsafe file storage path');
    result.push({ kind: 'file', id: row.id, reference: row.storage_path, bytesAvailable: false });
  }
  return result;
}
export function completeTripRevisionVector(data: CompleteTripData, format: CompleteTripEnvelope['format']) {
  const legacy = {
    consistency: 'independent-validated-reads',
    planner: data.planner.view.state.trip_revision,
    tasks: {
      lifecycle: data.tasks.scope.trip_lifecycle_revision,
      collection: data.tasks.collection_revision,
      rows: data.tasks.tasks.map((r) => [r.id, r.revision]),
    },
    packing: {
      lifecycle: data.packing.scope.trip_lifecycle_revision,
      collection: data.packing.collection_revision,
      rows: data.packing.items.map((r) => [r.id, r.revision]),
    },
    ...(data.packing_categories
      ? {
          packingCategories: {
            collection: data.packing_categories.collection_revision,
            categories: data.packing_categories.categories.map((c) => [c.id, c.revision]),
            itemCategories: data.packing_categories.item_categories,
          },
        }
      : {}),
    bookings: data.booking.trip_revision,
    unversioned: {
      header: { evidence: 'single-authorized-row', count: 1 },
      companions: {
        evidence: 'stable-exact-count-ranges',
        counts: Object.fromEntries(Object.entries(data.companions).map(([name, rows]) => [name, rows.length])),
      },
      tags: { evidence: 'disabled-handler-contract', count: 0 },
      packingBags: { evidence: 'bounded-canonical-rpc', count: data.packing.bags.length },
    },
  };
  if (format !== 'family.offline-trip.v3') return legacy;
  const categories = data.packing_categories_v2;
  if (!categories) throw new Error('Missing coupled category v2 snapshot');
  return {
    ...legacy,
    version: 3,
    packingCategoriesV2: {
      collection: categories.collection_revision,
      categories: categories.categories.map((c) => [c.id, c.revision]),
      itemCategories: categories.item_categories,
    },
  };
}
export async function completeTripManifests(data: Record<string, unknown>) {
  return Object.fromEntries(
    await Promise.all(Object.entries(data).map(async ([key, value]) => [key, await hashCompleteTrip(value)]))
  );
}
export async function serializeCompleteTrip(capture: CompleteTripCapture): Promise<CompleteTripEnvelope> {
  if (new TextEncoder().encode(canonicalTripJson(capture)).byteLength > COMPLETE_TRIP_LIMIT)
    throw new Error('Oversized complete Trip');
  if (capture.packingFormat !== undefined && capture.packingFormat !== 'category-identity-v2')
    throw new Error('Unsupported complete Trip packing format');
  if (capture.packingFormat === 'category-identity-v2' && capture.admitReadOnly !== true)
    throw new Error('Category identity saved Trips require explicit read-only admission');
  const format =
    capture.packingFormat === 'category-identity-v2'
      ? 'family.offline-trip.v3'
      : capture.admitReadOnly
        ? 'family.offline-trip.v2'
        : 'family.offline-trip.v1';
  const data = await checkedCompleteTripData(capture.data, capture.scope, format);
  const base = {
    format: 'family.offline-trip.v1' as const,
    producer: 'family-web/complete-trip-v1' as const,
    generation: crypto.randomUUID(),
    source: capture.source,
    scope: capture.scope,
    ownership: capture.ownership,
    capturedAt: capture.capturedAt,
    verifiedAt: capture.verifiedAt ?? capture.capturedAt,
    expiresAt: capture.capturedAt + 900000,
    capabilities: {
      coldRead: false as const,
      writes: false as const,
      tags: false as const,
      mediaBytes: false as const,
    },
    data,
    bindings: completeTripBindings(data, format),
    revisions: completeTripRevisionVector(data, format),
    manifests: await completeTripManifests(data),
    media: completeTripMediaManifest(data),
  };
  const versioned =
    format === 'family.offline-trip.v3'
      ? {
          ...base,
          format: 'family.offline-trip.v3' as const,
          producer: 'family-web/complete-trip-v3' as const,
          capabilities: { ...base.capabilities, coldRead: true as const },
          access: { policy: 'recent-read-only-v1' as const, checkedAt: base.verifiedAt },
        }
      : format === 'family.offline-trip.v2'
        ? {
            ...base,
            format: 'family.offline-trip.v2' as const,
            producer: 'family-web/complete-trip-v2' as const,
            capabilities: { ...base.capabilities, coldRead: true as const },
            access: { policy: 'recent-read-only-v1' as const, checkedAt: base.verifiedAt },
          }
        : base;
  const envelope = { ...versioned, digest: (await hashCompleteTrip(versioned)).sha256 };
  return parseCompleteTrip(envelope, {
    source: capture.source,
    scope: capture.scope,
    ownership: capture.ownership,
    now: capture.verifiedAt ?? capture.capturedAt,
  });
}
export async function parseCompleteTrip(
  raw: unknown,
  expected: { source: string; scope: PlannerScope; ownership: CompleteTripOwnership; now: number }
): Promise<CompleteTripEnvelope> {
  const json = typeof raw === 'string' ? raw : canonicalTripJson(raw);
  if (new TextEncoder().encode(json).byteLength > COMPLETE_TRIP_LIMIT) throw new Error('Oversized complete Trip');
  const envelope = envelopeSchema.parse(JSON.parse(json));
  const { digest, ...base } = envelope;
  const s = expected.scope;
  if (
    !Number.isFinite(expected.now) ||
    envelope.ownership.key !==
      JSON.stringify([1, expected.source, s.user_id, s.family_id, s.person_id, s.trip_id, s.layer]) ||
    envelope.ownership.ownerKey !== JSON.stringify([1, expected.source, s.user_id, s.family_id, s.person_id])
  )
    throw new Error('Invalid complete Trip ownership');
  if (
    envelope.source !== expected.source ||
    canonicalTripJson(envelope.scope) !== canonicalTripJson(expected.scope) ||
    canonicalTripJson(envelope.ownership) !== canonicalTripJson(expected.ownership) ||
    envelope.capturedAt > expected.now ||
    envelope.verifiedAt < envelope.capturedAt ||
    envelope.verifiedAt > expected.now ||
    envelope.expiresAt !== envelope.capturedAt + 900000 ||
    expected.now > envelope.expiresAt ||
    digest !== (await hashCompleteTrip(base)).sha256
  )
    throw new Error('Stale or inconsistent complete Trip envelope');
  checkRecentReadObservation(envelope);
  const data = await checkedCompleteTripData(envelope.data, expected.scope, envelope.format);
  if (
    canonicalTripJson(envelope.bindings) !== canonicalTripJson(completeTripBindings(data, envelope.format)) ||
    canonicalTripJson(envelope.revisions) !== canonicalTripJson(completeTripRevisionVector(data, envelope.format)) ||
    canonicalTripJson(envelope.manifests) !== canonicalTripJson(await completeTripManifests(data)) ||
    canonicalTripJson(envelope.media) !== canonicalTripJson(completeTripMediaManifest(data))
  )
    throw new Error('Invalid complete Trip manifest');
  return { ...envelope, data };
}

function checkRecentReadObservation(envelope: z.infer<typeof envelopeSchema>) {
  if (
    (envelope.format === 'family.offline-trip.v2' || envelope.format === 'family.offline-trip.v3') &&
    envelope.access.checkedAt !== envelope.verifiedAt
  )
    throw new Error('Invalid recent online read observation');
}
