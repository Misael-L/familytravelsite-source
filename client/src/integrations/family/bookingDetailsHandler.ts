import {
  bookingDetailContext,
  bookingDetailPacket,
  bookingDetailReceipt,
  type BookingDetailPacket,
} from './bookingDetailsContract';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import { NOT_HANDLED } from './listHandler';
import { locationRpc, savedLocationResponse } from './planLocations';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';
import { visitCommandBody, visitCommandFailure } from './visitCommands';
export async function handleFamilyBookingDetails(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const m = request.pathname.match(/^\/trips\/([^/]+)\/family\/booking-details\/([^/]+)$/);
  if (!m) return NOT_HANDLED;
  if (!['GET', 'POST'].includes(request.method) || request.query.size)
    throw new FamilyApiError(405, 'booking_detail_method', 'Use a complete observed booking GET or POST.');
  try {
    const session = await repo.session(),
      trip = await repo.tripUuid(m[1]),
      ids = (await repo.views()).ids,
      booking = ids.uuid('reservation', m[2]),
      layer = repo.getLayer(trip),
      source = getSupabaseUrl();
    const fence = async () => {
      const current = await repo.session();
      if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (
        source !== getSupabaseUrl() ||
        repo.getLayer(trip) !== layer ||
        (await repo.views()).ids !== ids ||
        current.userId !== session.userId ||
        current.familyId !== session.familyId ||
        current.personId !== session.personId
      )
        throw new FamilyApiError(409, 'booking_detail_session', 'The original booking edit session changed.');
    };
    await fence();
    if (layer !== 'published')
      throw new FamilyApiError(409, 'booking_detail_private', 'Private booking forms are not connected.');
    if (request.method === 'GET') {
      const raw = await locationRpc('get_family_booking_details_v1', { p_trip_id: trip, p_reservation_id: booking });
      await fence();
      bounded(raw);
      const c = savedLocationResponse(bookingDetailContext, raw);
      if (
        c.trip_id !== trip ||
        c.family_id !== session.familyId ||
        c.user_id !== session.userId ||
        c.person_id !== session.personId
      )
        throw new FamilyApiError(502, 'booking_detail_scope', 'Booking form returned another scope.');
      validateObservation(c.observation, trip, booking);
      return c;
    }
    const raw = visitCommandBody(request);
    bounded(raw);
    const p = bookingDetailPacket.parse(raw);
    if (
      p.source_url.replace(/\/$/, '') !== source.replace(/\/$/, '') ||
      p.scope.trip_id !== trip ||
      p.scope.family_id !== session.familyId ||
      p.scope.user_id !== session.userId ||
      p.scope.person_id !== session.personId ||
      p.scope.layer !== 'published'
    )
      throw new FamilyApiError(
        409,
        'booking_detail_origin',
        'Original booking source/scope changed. Work remains parked.'
      );
    validateObservation(p.observation, trip, booking);
    await fence();
    const result = savedLocationResponse(
      bookingDetailReceipt,
      await locationRpc('save_family_booking_details_v1', {
        p_trip_id: trip,
        p_reservation_id: booking,
        p_operation_id: p.operation_id,
        p_scope: p.scope,
        p_observation: p.observation,
        p_changes: p.changes,
      })
    );
    await fence();
    validateReceipt(p, result, trip, booking);
    repo.invalidate(trip); // Historical acknowledgement; never replace a live native row from it.
    return result;
  } catch (error) {
    return visitCommandFailure(error);
  }
}
function bounded(value: unknown) {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 262144)
    throw new FamilyApiError(400, 'booking_detail_bound', 'Observed booking edit exceeds its bound.');
}
function validateObservation(o: BookingDetailPacket['observation'], trip: string, booking: string) {
  if (
    o.record.id !== booking ||
    o.record.trip_id !== trip ||
    o.dates.reservation_id !== booking ||
    o.dates.trip_id !== trip ||
    o.dates.start_day_id !== o.record.start_trip_day_id ||
    o.dates.end_day_id !== o.record.end_trip_day_id
  )
    throw new FamilyApiError(502, 'booking_detail_identity', 'Booking observation has inconsistent identities.');
}

function validateReceipt(
  p: BookingDetailPacket,
  result: ReturnType<typeof bookingDetailReceipt.parse>,
  trip: string,
  booking: string
) {
  if (
    result.operation_id !== p.operation_id ||
    result.trip_id !== trip ||
    result.reservation_id !== booking ||
    result.dates.reservation_id !== booking ||
    result.dates.trip_id !== trip ||
    (p.changes.dates &&
      (result.dates.start_date !== p.changes.dates.start_date || result.dates.end_date !== p.changes.dates.end_date)) ||
    (!p.changes.dates && JSON.stringify(result.dates) !== JSON.stringify(p.observation.dates))
  )
    throw new FamilyApiError(502, 'booking_detail_result', 'Inconsistent booking edit receipt.');
}
