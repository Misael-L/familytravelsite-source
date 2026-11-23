import {
  bookingCalendarContext,
  bookingCalendarPacket,
  bookingCalendarReceipt,
  type BookingCalendarPacket,
  type BookingCalendarReceipt,
} from './bookingCalendarContract';
import { getSupabaseUrl } from './legacy/data/supabase/env';
import { NOT_HANDLED } from './listHandler';
import { locationRpc, savedLocationResponse } from './planLocations';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';
import { visitCommandBody, visitCommandFailure } from './visitCommands';
/** Explicit date seam only: native booking writers and rendering remain gated until coordinated cutover. */
export async function handleFamilyBookingCalendar(repo: FamilyFrontendRepository, request: FamilyRequest) {
  const match = request.pathname.match(/^\/trips\/([^/]+)\/reservations\/([^/]+)\/family\/calendar$/);
  if (!match) return NOT_HANDLED;
  if (!['GET', 'POST'].includes(request.method) || request.query.size)
    throw new FamilyApiError(405, 'booking_calendar_method', 'Use a complete booking calendar GET or POST.');
  try {
    const session = await repo.session(),
      trip = await repo.tripUuid(match[1]),
      ids = (await repo.views()).ids,
      booking = ids.uuid('reservation', match[2]),
      source = getSupabaseUrl(),
      layer = repo.getLayer(trip);
    const fence = async () => {
      const current = await repo.session();
      if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (
        getSupabaseUrl() !== source ||
        repo.getLayer(trip) !== layer ||
        current.userId !== session.userId ||
        current.familyId !== session.familyId ||
        current.personId !== session.personId ||
        (await repo.views()).ids !== ids
      )
        throw new FamilyApiError(409, 'booking_calendar_session', 'The original Family session changed.');
    };
    await fence();
    if (layer !== 'published')
      throw new FamilyApiError(409, 'booking_calendar_private', 'Private booking date changes are not connected.');
    if (request.method === 'GET') {
      const context = savedLocationResponse(
        bookingCalendarContext,
        await locationRpc('get_family_booking_calendar_v1', { p_trip_id: trip, p_reservation_id: booking })
      );
      await fence();
      if (
        context.trip_id !== trip ||
        context.family_id !== session.familyId ||
        context.user_id !== session.userId ||
        context.person_id !== session.personId ||
        context.dates.trip_id !== trip ||
        context.dates.reservation_id !== booking
      )
        throw new FamilyApiError(502, 'booking_calendar_scope', 'Invalid booking calendar context.');
      return context;
    }
    const packet = bookingCalendarPacket.parse(visitCommandBody(request));
    if (new TextEncoder().encode(JSON.stringify(packet)).length > 8192)
      throw new FamilyApiError(400, 'booking_calendar_bound', 'Booking date command exceeds its bound.');
    validateOriginal(packet, trip, booking, session);
    await fence();
    const receipt = savedLocationResponse(
      bookingCalendarReceipt,
      await locationRpc('set_family_booking_calendar_v1', {
        p_trip_id: trip,
        p_reservation_id: booking,
        p_operation_id: packet.operation_id,
        p_scope: packet.scope,
        p_observation: packet.observation,
        p_dates: packet.dates,
      })
    );
    await fence();
    validateReceipt(packet, receipt, trip, booking);
    // A retry receipt is historical. Invalidate reads; never hydrate native state from this receipt.
    repo.invalidate(trip);
    return receipt;
  } catch (error) {
    return visitCommandFailure(error);
  }
}

function validateOriginal(
  packet: BookingCalendarPacket,
  trip: string,
  booking: string,
  session: Awaited<ReturnType<FamilyFrontendRepository['session']>>
) {
  if (
    packet.source_url.replace(/\/$/, '') !== getSupabaseUrl().replace(/\/$/, '') ||
    packet.scope.trip_id !== trip ||
    packet.scope.family_id !== session.familyId ||
    packet.scope.user_id !== session.userId ||
    packet.scope.person_id !== session.personId ||
    packet.observation.trip_id !== trip ||
    packet.observation.reservation_id !== booking
  )
    throw new FamilyApiError(409, 'booking_calendar_origin', 'The original booking source or scope changed.');
  if (packet.scope.layer !== 'published')
    throw new FamilyApiError(409, 'booking_calendar_private', 'Private booking date changes are not connected.');
}

function validateReceipt(
  packet: BookingCalendarPacket,
  receipt: BookingCalendarReceipt,
  trip: string,
  booking: string
) {
  if (
    receipt.operation_id !== packet.operation_id ||
    receipt.dates.trip_id !== trip ||
    receipt.dates.reservation_id !== booking ||
    receipt.dates.start_date !== packet.dates.start_date ||
    receipt.dates.end_date !== packet.dates.end_date ||
    receipt.dates.revision !==
      packet.observation.revision +
        Number(
          packet.dates.start_date !== packet.observation.start_date ||
            packet.dates.end_date !== packet.observation.end_date
        )
  )
    throw new FamilyApiError(502, 'booking_calendar_result', 'Inconsistent booking date receipt.');
}
