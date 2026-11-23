import { reservationSchema } from '@trek/shared';
import { isEffectivelyOffline } from '../../sync/networkMode';
import { civilDate } from './bookingCalendarContract';
import {
  asReservationMetadata,
  isBookingType,
  isTransportType,
  type FamilyTransportReservation,
  type FamilyTripReservation,
} from './legacy/data/supabase/tripReservations';
import { NOT_HANDLED } from './listHandler';
import { locationRpc, savedLocationResponse } from './planLocations';
import { plannerBookingView, type PlannerBookingRow, type PlannerBookingView } from './plannerBookingContract';
import { reconcilePlannerResources } from './plannerCohortRelations';
import type { ProjectedPlannerState } from './plannerProjection';
import type { createPlannerViewReader } from './plannerView';
import { FamilyApiError, type FamilyFrontendRepository } from './repository';
import type { FamilyRequest } from './transport';
import type { FamilyViews } from './views';

/** One scoped SQL snapshot: no cached header/endpoints mixed with a newer calendar. */
export function createPlannerBookingReader(
  repo: FamilyFrontendRepository,
  disposed: () => boolean,
  source: () => string
) {
  const read = async (value: number | string, signal?: AbortSignal) => {
    if (isEffectivelyOffline())
      throw new FamilyApiError(503, 'booking_view_offline', 'A coherent booking read needs a connection.');
    const session = await repo.session(),
      trip = await repo.tripUuid(value),
      views = await repo.views(),
      ids = views.ids,
      origin = source(),
      layer = repo.getLayer(trip);
    const fence = async () => {
      const current = await repo.session();
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (
        disposed() ||
        source() !== origin ||
        ids !== (await repo.views()).ids ||
        repo.getLayer(trip) !== layer ||
        current.userId !== session.userId ||
        current.familyId !== session.familyId ||
        current.personId !== session.personId
      )
        throw new FamilyApiError(409, 'booking_view_changed', 'Original booking session changed. Reload.');
    };
    await fence();
    const raw = await locationRpc('get_family_trip_booking_view_v1', { p_trip_id: trip });
    await fence();
    if (new TextEncoder().encode(JSON.stringify(raw)).byteLength > 8388608)
      throw new FamilyApiError(502, 'booking_view_bound', 'Booking snapshot exceeds its bound.');
    const packet = savedLocationResponse(plannerBookingView, raw);
    if (
      packet.trip_id !== trip ||
      packet.family_id !== session.familyId ||
      packet.user_id !== session.userId ||
      packet.person_id !== session.personId
    )
      throw new FamilyApiError(502, 'booking_view_scope', 'Booking view returned another scope.');
    validatePlannerBookingRows(packet);
    const reservations = packet.bookings.map((row) => projectBooking(row, packet, views));
    await fence();
    return { packet, reservations, fence };
  };
  return { read };
}
function invalid(): never {
  throw new FamilyApiError(502, 'booking_view_identity', 'Booking snapshot has inconsistent identities or dates.');
}
export function validatePlannerBookingRows(packet: PlannerBookingView) {
  if (
    new Set(packet.days.map((d) => d.id)).size !== packet.days.length ||
    new Set(packet.bookings.map((r) => r.record.id)).size !== packet.bookings.length
  )
    invalid();
  for (const { record: r, dates, endpoints, legs, visit_state } of packet.bookings) {
    if (
      r.trip_id !== packet.trip_id ||
      dates.trip_id !== packet.trip_id ||
      dates.reservation_id !== r.id ||
      dates.start_day_id !== r.start_trip_day_id ||
      dates.end_day_id !== r.end_trip_day_id ||
      (r.schedule_item_id === null) !== (visit_state === 'none')
    )
      invalid();
    for (const [day, date] of [
      [dates.start_day_id, dates.start_date],
      [dates.end_day_id, dates.end_date],
    ])
      if (day && !packet.days.some((d) => d.id === day && d.civil_day === date)) invalid();
    const identities = new Set(endpoints.map((e) => e.id));
    if (
      identities.size !== endpoints.length ||
      new Set(legs.map((l) => l.id)).size !== legs.length ||
      endpoints.some((e) => e.reservation_id !== r.id) ||
      legs.some(
        (l) =>
          l.reservation_id !== r.id ||
          (l.from_endpoint_id !== null && !identities.has(l.from_endpoint_id)) ||
          (l.to_endpoint_id !== null && !identities.has(l.to_endpoint_id))
      )
    )
      invalid();
  }
}
function canonical(row: PlannerBookingRow): FamilyTripReservation | FamilyTransportReservation {
  const r = row.record;
  const common = {
    id: r.id,
    tripId: r.trip_id,
    status: r.status,
    title: r.title.trim() || 'Untitled',
    startTripDayId: r.start_trip_day_id,
    endTripDayId: r.end_trip_day_id,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    confirmationCode: r.confirmation_code,
    notes: r.notes,
    url: r.url,
    metadata: asReservationMetadata(r.metadata),
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  };
  if (isBookingType(r.type))
    return { ...common, type: r.type, placeId: r.place_id, hotelId: r.hotel_id, scheduleItemId: r.schedule_item_id };
  if (!isTransportType(r.type)) return invalid();
  return {
    ...common,
    type: r.type,
    endpoints: row.endpoints.map((e) => ({
      id: e.id,
      role: e.role,
      sequence: e.sequence,
      name: e.name?.trim() || e.code || 'Stop',
      code: e.code,
      airportId: e.airport_id,
      placeId: e.place_id,
      latitude: e.latitude,
      longitude: e.longitude,
      timeZone: e.time_zone,
      localDate: e.local_date,
      localTime: e.local_time?.slice(0, 5) ?? null,
    })),
    legs: row.legs.map((l) => ({
      id: l.id,
      sequence: l.sequence,
      fromEndpointId: l.from_endpoint_id,
      toEndpointId: l.to_endpoint_id,
      carrierName: l.carrier_name,
      serviceNumber: l.service_number,
      platform: l.platform,
      seat: l.seat,
    })),
  };
}
function departureSortDate(row: PlannerBookingRow): string | undefined {
  if (!isTransportType(row.record.type) || row.record.starts_at || row.dates.start_date || row.dates.start_day_id)
    return undefined;
  const departure = row.endpoints.find((endpoint) => endpoint.role === 'from');
  const parsed = civilDate.safeParse(departure?.local_date);
  return parsed.success ? parsed.data : undefined;
}

export function projectBooking(row: PlannerBookingRow, packet: PlannerBookingView, views: FamilyViews) {
  const days = packet.days.map((d) => ({
      id: d.id,
      tripId: packet.trip_id,
      civilDay: d.civil_day,
      dayIndex: d.day_index,
      title: d.title,
    })),
    projected = views.reservation(canonical(row), days);
  projected.reservation_time ??= row.dates.start_date;
  projected.reservation_end_time ??= row.dates.end_date;
  if (row.visit_state === 'retained') projected.assignment_id = null;
  // Upstream cannot represent unknown geometry. Keep canonical rows and leg text;
  // never invent coordinates or borrow another endpoint/day as its geometry.
  projected.endpoints = projected.endpoints?.filter(
    (e) =>
      Number.isFinite(e.lat) && Number.isFinite(e.lng) && e.lat >= -90 && e.lat <= 90 && e.lng >= -180 && e.lng <= 180
  );
  const orderedLegs = [...row.legs].sort((a, b) => a.sequence - b.sequence);
  const meta = JSON.parse(projected.metadata || '{}') as Record<string, unknown>;
  if (Array.isArray(meta.legs))
    meta.legs = meta.legs.map((raw, i) => {
      const item = raw as Record<string, unknown>,
        leg = orderedLegs[i],
        from = row.endpoints.find((e) => e.id === leg?.from_endpoint_id),
        to = row.endpoints.find((e) => e.id === leg?.to_endpoint_id);
      return {
        ...item,
        ...(from?.local_date && !packet.days.some((d) => d.civil_day === from.local_date) ? { dep_day_id: null } : {}),
        ...(to?.local_date && !packet.days.some((d) => d.civil_day === to.local_date) ? { arr_day_id: null } : {}),
      };
    });
  projected.metadata = JSON.stringify(meta);
  const departureDate = departureSortDate(row);
  return {
    ...savedLocationResponse(reservationSchema, projected),
    family_record: projected.family_record,
    family_booking_calendar: row.dates,
    family_booking_snapshot: row,
    ...(departureDate ? { family_departure_sort_date: departureDate } : {}),
  };
}
export function assertBookingCalendar(
  packet: PlannerBookingView,
  state: Pick<ProjectedPlannerState, 'trip_id' | 'trip_revision' | 'days'>
) {
  if (
    packet.trip_id !== state.trip_id ||
    packet.trip_revision !== state.trip_revision ||
    packet.days.length !== state.days.length ||
    packet.days.some(
      (d) =>
        !state.days.some(
          (s) => s.id === d.id && s.civil_day === d.civil_day && s.day_index === d.day_index && s.title === d.title
        )
    )
  )
    throw new FamilyApiError(409, 'booking_calendar_changed', 'Booking and planner snapshots disagree. Reload both.');
}
export function createPlannerBookingHandler(
  repo: FamilyFrontendRepository,
  reader: ReturnType<typeof createPlannerViewReader>,
  bookings: ReturnType<typeof createPlannerBookingReader>
) {
  return async (request: FamilyRequest) => {
    const match = request.pathname.match(/^\/trips\/([^/]+)\/reservations$/);
    if (!match || request.method !== 'GET') return NOT_HANDLED;
    if (request.query.size) throw new FamilyApiError(400, 'booking_query', 'Use a complete booking read.');
    const trip = await repo.tripUuid(match[1]),
      layer = repo.getLayer(trip);
    let invalidated = false;
    const unsubscribe = repo.subscribe((changed) => {
      if (changed === null || changed === trip) invalidated = true;
    });
    try {
      const [snapshot, view] = await Promise.all([
          bookings.read(trip, request.signal),
          reader.read(trip, layer, request.signal),
        ]),
        ids = (await repo.views()).ids;
      await snapshot.fence();
      if (invalidated || repo.getLayer(trip) !== layer)
        throw new FamilyApiError(409, 'booking_view_changed', 'The Trip changed before its bookings finished loading.');
      assertBookingCalendar(snapshot.packet, view.state);
      return reconcilePlannerResources({ reservations: snapshot.reservations }, view.state, ids);
    } finally {
      unsubscribe();
    }
  };
}
