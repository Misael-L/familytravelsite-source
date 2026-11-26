import api from '../../api/client';
import { offlineDb } from '../../db/offlineDb';
import { generateUUID } from '../../sync/mutationQueue';
import { isEffectivelyOffline } from '../../sync/networkMode';
import type { Reservation } from '../../types';
import {
  bookingDetailContext,
  bookingDetailPacket,
  bookingDetailReceipt,
  type BookingDetailPacket,
} from './bookingDetailsContract';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import {
  bookingJson,
  nativeBookingBaseline,
  nativeBookingChanges,
  type BookingFormOptions,
} from './nativeBookingDetails';
import { savedLocationResponse } from './planLocations';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
type BookingSession = Awaited<ReturnType<FamilyFrontendRepository['session']>>;
function assertNoPendingBooking(queued: readonly { url: string }[], keys: readonly string[]) {
  if (
    queued.some((row) =>
      keys.some(
        (key) =>
          row.url.startsWith(`/trips/${key}/reservations`) ||
          row.url.startsWith(`/trips/${key}/family/booking-details/`)
      )
    )
  )
    throw new FamilyApiError(
      409,
      'booking_form_pending',
      'Older booking work remains parked. Resolve it before opening another edit.'
    );
}
function assertBookingObservation(
  original: Reservation,
  context: ReturnType<typeof bookingDetailContext.parse>,
  expected: { trip: string; booking: string; session: BookingSession }
) {
  const { trip, booking, session } = expected;
  const native = original as Reservation & { family_booking_snapshot?: unknown };
  const snapshot = native.family_booking_snapshot as { record?: unknown; dates?: unknown } | undefined;
  if (
    !snapshot ||
    bookingJson({ record: snapshot.record, dates: snapshot.dates }) !== bookingJson(context.observation) ||
    context.trip_id !== trip ||
    context.observation.record.id !== booking ||
    context.family_id !== session.familyId ||
    context.user_id !== session.userId ||
    context.person_id !== session.personId
  )
    throw new FamilyApiError(
      409,
      'booking_form_observation',
      'Displayed booking is stale or has no observed source. Reload before editing.'
    );
}
/** Explicit prerequisite coordinator. Native default/cohort form callbacks are not installed here. */
export async function openObservedBookingEditor(
  repo: FamilyFrontendRepository,
  tripId: number | string,
  original: Reservation,
  options: BookingFormOptions
) {
  if (isEffectivelyOffline())
    throw new FamilyApiError(503, 'booking_form_offline', 'Open the observed booking form online.');
  const session = await repo.session(),
    trip = await repo.tripUuid(tripId),
    ids = (await repo.views()).ids,
    booking = ids.uuid('reservation', original.id),
    source = getSupabaseUrl(),
    layer = repo.getLayer(trip),
    url = `/trips/${trip}/family/booking-details/${booking}`;
  let closed = false;
  const fence = async () => {
    const now = await repo.session();
    if (
      closed ||
      source !== getSupabaseUrl() ||
      layer !== 'published' ||
      repo.getLayer(trip) !== layer ||
      ids !== (await repo.views()).ids ||
      now.userId !== session.userId ||
      now.familyId !== session.familyId ||
      now.personId !== session.personId
    )
      throw new FamilyApiError(409, 'booking_form_session', 'Original booking form changed. Reopen it.');
  };
  await fence();
  const queued = await offlineDb.mutationQueue.toArray();
  assertNoPendingBooking(queued, [String(tripId), String(ids.register('trip', trip)), trip]);
  const context = savedLocationResponse(bookingDetailContext, (await api.get(url)).data);
  await fence();
  assertBookingObservation(original, context, { trip, booking, session });
  const before = structuredClone(nativeBookingBaseline(original, options));
  let intent: { hash: string; packet: BookingDetailPacket } | null = null;
  let inFlight: Promise<ReturnType<typeof bookingDetailReceipt.parse>> | null = null;
  const prepare = async (data: Record<string, unknown>, effects: readonly string[]) => {
    await fence();
    const changes = nativeBookingChanges(context, before, data, effects),
      hash = bookingJson(changes);
    if (intent && intent.hash !== hash)
      throw new FamilyApiError(
        409,
        'booking_form_uncertain',
        'Resolve the original booking save before changing its intent.'
      );
    intent ??= {
      hash,
      packet: bookingDetailPacket.parse({
        version: 1,
        source_url: source,
        operation_id: generateUUID(),
        scope: {
          version: 1,
          trip_id: trip,
          family_id: session.familyId,
          user_id: session.userId,
          person_id: session.personId,
          layer,
        },
        observation: context.observation,
        changes,
      }),
    };
    return { url, packet: structuredClone(intent.packet) };
  };
  return {
    baseline: structuredClone(before),
    prepare,
    close: () => {
      closed = true;
    },
    save: async (data: Record<string, unknown>, effects: readonly string[]) => {
      const command = await prepare(data, effects);
      if (inFlight !== null) return inFlight;
      const execute = async () => {
        await fence();
        const result = savedLocationResponse(
          bookingDetailReceipt,
          (
            await api.post(command.url, command.packet, {
              headers: { 'X-Idempotency-Key': command.packet.operation_id },
            })
          ).data
        );
        await fence();
        return result; // Historical acknowledgement, never a replacement native booking.
      };
      inFlight = execute();
      try {
        return await inFlight;
      } finally {
        inFlight = null;
      }
    },
  };
}
