import {
  prepareStayBundleIntent,
  stayBundleContext,
  type StayBundleAck,
} from '../../src/integrations/family/stayBundleContract';
import { bookingStayFixture } from './familyBookingStays';

export function stayBundleFixture() {
  const core = bookingStayFixture(),
    row = core.stays[0],
    link = row.link;
  if (!link) throw new Error('Missing synthetic stay/booking link');
  const booking = core.bookings[0];
  booking.record.title = 'Original lodging title';
  booking.record.start_trip_day_id = core.days[0].id;
  booking.record.end_trip_day_id = core.days[core.days.length - 1].id;
  Object.assign(booking.dates, {
    start_date: row.stay.arrival_date,
    end_date: row.stay.departure_date,
    start_day_id: booking.record.start_trip_day_id,
    end_day_id: booking.record.end_trip_day_id,
  });
  row.booking = { record: structuredClone(booking.record), dates: structuredClone(booking.dates) };
  const context = stayBundleContext.parse({
    format: 'family.stay-bundle-context.v1',
    scope: { ...core.planner.scope, version: 1, session_id: '37b67e4d-ddb5-4a41-b1b9-58402e4c541e' },
    observation: {
      trip_revision: core.trip_revision - 2,
      candidate_location: row.location,
      arrival_day: core.days[0],
      departure_day: core.days[core.days.length - 1],
      stay_absent: true,
      reservation_absent: true,
    },
    admission: { create: true },
    native_controls: false,
  });
  const packet = prepareStayBundleIntent({
    source_url: 'http://127.0.0.1:56971',
    context,
    stay_id: row.stay.id,
    reservation_id: link.reservation_id,
    operation_id: 'c825b463-8237-42e0-9733-de3c4814e993',
    stay: {
      location_id: row.location.id,
      arrival_date: row.stay.arrival_date,
      departure_date: row.stay.departure_date,
    },
    reservation: { title: 'Original lodging title', status: 'pending' },
  });
  const ack: StayBundleAck = {
    format: 'family.stay-bundle-ack.v1',
    state: 'published',
    acknowledgement: true,
    read_current_required: true,
    changed: true,
    trip_id: core.trip_id,
    stay_id: row.stay.id,
    reservation_id: link.reservation_id,
    operation_id: packet.command.operation_id,
    stay_revision_after: row.stay.revision,
    trip_revision_after: core.trip_revision,
    event_sequence: 42,
    recorded_at: '2026-11-14T12:00:00Z',
  };
  return structuredClone({ context, packet, ack, core });
}
